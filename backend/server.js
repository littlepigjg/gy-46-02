import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import getDb from './db.js';
import { startScheduler, triggerScreenshotNow } from './scheduler.js';
import { getActiveAlerts, getAllAlerts, resolveAlert } from './alertManager.js';
import { DEFAULT_CONFIG } from './qualityAnalyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

app.get('/api/urls', async (req, res) => {
  const db = await getDb();
  const urls = db.prepare(`
    SELECT u.*,
      (SELECT COUNT(*) FROM screenshots s WHERE s.url_id = u.id) as screenshot_count,
      (SELECT COUNT(*) FROM alerts a WHERE a.url_id = u.id AND a.status = 'active') as active_alert_count,
      (SELECT s.quality_score FROM screenshots s WHERE s.url_id = u.id ORDER BY s.created_at DESC LIMIT 1) as last_quality_score,
      (SELECT s.quality_level FROM screenshots s WHERE s.url_id = u.id ORDER BY s.created_at DESC LIMIT 1) as last_quality_level
    FROM urls u
    ORDER BY u.created_at DESC
  `).all();
  res.json(urls);
});

app.post('/api/urls', async (req, res) => {
  const { url, name, frequency = 'daily' } = req.body;

  if (!url || !name) {
    return res.status(400).json({ error: 'URL和名称必填' });
  }

  const validFrequencies = ['hourly', 'daily', 'weekly', 'monthly'];
  if (!validFrequencies.includes(frequency)) {
    return res.status(400).json({ error: '无效的频率' });
  }

  try {
    const db = await getDb();
    const stmt = db.prepare('INSERT INTO urls (url, name, frequency) VALUES (?, ?, ?)');
    const result = stmt.run(url, name, frequency);

    const newUrl = db.prepare('SELECT * FROM urls WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newUrl);
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('unique')) {
      res.status(400).json({ error: '该URL已存在' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.delete('/api/urls/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  const screenshots = db.prepare('SELECT file_path FROM screenshots WHERE url_id = ?').all(id);
  screenshots.forEach(s => {
    if (fs.existsSync(s.file_path)) {
      fs.unlinkSync(s.file_path);
      const dir = path.dirname(s.file_path);
      try {
        if (fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
        }
      } catch (e) {}
    }
  });

  db.prepare('DELETE FROM screenshots WHERE url_id = ?').run(id);
  const stmt = db.prepare('DELETE FROM urls WHERE id = ?');
  stmt.run(id);
  res.json({ success: true });
});

app.put('/api/urls/:id', async (req, res) => {
  const { id } = req.params;
  const { name, frequency, status } = req.body;
  const db = await getDb();

  const existing = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'URL不存在' });
  }

  const finalName = name || existing.name;
  const finalFrequency = frequency || existing.frequency;
  const finalStatus = status || existing.status;

  const stmt = db.prepare('UPDATE urls SET name = ?, frequency = ?, status = ? WHERE id = ?');
  stmt.run(finalName, finalFrequency, finalStatus, id);

  const updated = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  res.json(updated);
});

app.get('/api/urls/:id/screenshots', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshots = db.prepare(`
    SELECT * FROM screenshots
    WHERE url_id = ?
    ORDER BY created_at DESC
  `).all(id);
  res.json(screenshots);
});

app.get('/api/screenshots/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }
  res.json(screenshot);
});

app.delete('/api/screenshots/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }

  if (fs.existsSync(screenshot.file_path)) {
    fs.unlinkSync(screenshot.file_path);
  }

  db.prepare('DELETE FROM screenshots WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/urls/:id/screenshot', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await triggerScreenshotNow(parseInt(id));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/urls/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const url = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  if (!url) {
    return res.status(404).json({ error: 'URL不存在' });
  }
  res.json(url);
});

app.get('/api/urls/:id/quality-config', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  let config = db.prepare('SELECT * FROM quality_configs WHERE url_id = ?').get(id);
  if (!config) {
    db.prepare('INSERT INTO quality_configs (url_id) VALUES (?)').run(id);
    config = db.prepare('SELECT * FROM quality_configs WHERE url_id = ?').get(id);
  }
  res.json(config);
});

app.put('/api/urls/:id/quality-config', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const existing = db.prepare('SELECT * FROM quality_configs WHERE url_id = ?').get(id);

  const fields = ['sensitivity', 'min_file_size_kb', 'min_width', 'min_height',
    'blank_page_threshold', 'error_keywords', 'consecutive_failures', 'enable_alert'];
  const values = [];
  const setClauses = [];

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      setClauses.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  }

  if (setClauses.length > 0) {
    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    if (existing) {
      db.prepare(`UPDATE quality_configs SET ${setClauses.join(', ')} WHERE url_id = ?`).run(...values);
    } else {
      db.prepare(`INSERT INTO quality_configs (url_id, ${fields.filter(f => req.body[f] !== undefined).join(', ')}) VALUES (?, ${values.slice(0, -1).map(() => '?').join(', ')})`).run(id, ...values.slice(0, -1));
    }
  }

  const config = db.prepare('SELECT * FROM quality_configs WHERE url_id = ?').get(id);
  res.json(config);
});

app.get('/api/urls/:id/quality-report', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const limit = parseInt(req.query.limit) || 50;

  const screenshots = db.prepare(`
    SELECT id, created_at, quality_score, quality_level, quality_flags, file_size, width, height
    FROM screenshots
    WHERE url_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(id, limit);

  const total = screenshots.length;
  const goodCount = screenshots.filter(s => s.quality_level === 'good').length;
  const fairCount = screenshots.filter(s => s.quality_level === 'fair').length;
  const poorCount = screenshots.filter(s => s.quality_level === 'poor').length;
  const badCount = screenshots.filter(s => s.quality_level === 'bad').length;
  const avgScore = total > 0
    ? Math.round(screenshots.reduce((sum, s) => sum + (s.quality_score || 0), 0) / total)
    : 0;

  const recent10 = screenshots.slice(0, 10);
  let consecutiveBad = 0;
  for (const s of recent10) {
    if (s.quality_level === 'poor' || s.quality_level === 'bad') {
      consecutiveBad++;
    } else {
      break;
    }
  }

  const flagStats = {};
  for (const s of screenshots) {
    if (s.quality_flags) {
      for (const flag of s.quality_flags.split(',')) {
        if (flag) flagStats[flag] = (flagStats[flag] || 0) + 1;
      }
    }
  }

  res.json({
    total,
    avgScore,
    distribution: { good: goodCount, fair: fairCount, poor: poorCount, bad: badCount },
    consecutiveBad,
    flagStats,
    screenshots
  });
});

app.get('/api/screenshots/:id/quality-checks', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const checks = db.prepare(`
    SELECT * FROM quality_checks WHERE screenshot_id = ? ORDER BY id
  `).all(id);
  const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
  res.json({ screenshot, checks });
});

app.post('/api/screenshots/:id/retake', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }
  try {
    const result = await triggerScreenshotNow(screenshot.url_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/alerts', async (req, res) => {
  const { status, url_id, limit } = req.query;
  try {
    if (status === 'active' || (!status && !url_id)) {
      if (url_id) {
        const alerts = await getActiveAlerts(parseInt(url_id));
        res.json(alerts);
      } else {
        const alerts = await getActiveAlerts();
        res.json(alerts);
      }
    } else {
      const alerts = await getAllAlerts(url_id ? parseInt(url_id) : null, parseInt(limit) || 100);
      res.json(alerts);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/alerts/:id/resolve', async (req, res) => {
  const { id } = req.params;
  try {
    await resolveAlert(parseInt(id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quality-defaults', (req, res) => {
  res.json(DEFAULT_CONFIG);
});

app.listen(PORT, async () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`);
  await getDb();
  startScheduler();
});
