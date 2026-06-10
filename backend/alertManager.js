import getDb from './db.js';
import { getQualityConfig } from './qualityAnalyzer.js';

async function getQualityConfigForUrl(urlId) {
  const db = await getDb();
  let config = db.prepare('SELECT * FROM quality_configs WHERE url_id = ?').get(urlId);
  if (!config) {
    const result = db.prepare(`
      INSERT INTO quality_configs (url_id) VALUES (?)
    `).run(urlId);
    config = db.prepare('SELECT * FROM quality_configs WHERE id = ?').get(result.lastInsertRowid);
  }
  return config;
}

async function getRecentScreenshots(urlId, limit) {
  const db = await getDb();
  return db.prepare(`
    SELECT * FROM screenshots
    WHERE url_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(urlId, limit);
}

async function resolveAlertsForUrl(urlId, alertType = null) {
  const db = await getDb();
  if (alertType) {
    db.prepare(`
      UPDATE alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP
      WHERE url_id = ? AND alert_type = ? AND status = 'active'
    `).run(urlId, alertType);
  } else {
    db.prepare(`
      UPDATE alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP
      WHERE url_id = ? AND status = 'active'
    `).run(urlId);
  }
}

async function createAlert(urlId, alertType, message, severity = 'warning', consecutiveCount = 0) {
  const db = await getDb();

  const existing = db.prepare(`
    SELECT * FROM alerts WHERE url_id = ? AND alert_type = ? AND status = 'active'
  `).get(urlId, alertType);

  if (existing) {
    db.prepare(`
      UPDATE alerts SET consecutive_count = ?, message = ?, severity = ?, created_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(consecutiveCount, message, severity, existing.id);
    return existing.id;
  } else {
    const result = db.prepare(`
      INSERT INTO alerts (url_id, alert_type, message, severity, consecutive_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(urlId, alertType, message, severity, consecutiveCount);
    return result.lastInsertRowid;
  }
}

export async function checkAndUpdateAlerts(urlId, newScreenshotQuality) {
  const config = await getQualityConfigForUrl(urlId);
  const effectiveConfig = getQualityConfig(config);
  const threshold = effectiveConfig.consecutive_failures || 3;

  if (!effectiveConfig.enable_alert) {
    return { alertsCreated: [], alertsResolved: [] };
  }

  const recent = await getRecentScreenshots(urlId, threshold + 5);
  const alertsCreated = [];
  const alertsResolved = [];

  const allRecent = [
    { quality_level: newScreenshotQuality.level, quality_score: newScreenshotQuality.score, quality_flags: newScreenshotQuality.flags },
    ...recent
  ];

  let consecutiveLowQuality = 0;
  for (const shot of allRecent) {
    if (shot.quality_level === 'poor' || shot.quality_level === 'bad') {
      consecutiveLowQuality++;
    } else {
      break;
    }
  }

  if (consecutiveLowQuality >= threshold) {
    const level = consecutiveLowQuality >= threshold + 2 ? 'critical' : 'warning';
    const message = `连续 ${consecutiveLowQuality} 次截图质量异常 (最近分数: ${newScreenshotQuality.score})`;
    const id = await createAlert(urlId, 'consecutive_low_quality', message, level, consecutiveLowQuality);
    alertsCreated.push({ id, type: 'consecutive_low_quality', severity: level });
  } else {
    await resolveAlertsForUrl(urlId, 'consecutive_low_quality');
    alertsResolved.push('consecutive_low_quality');
  }

  if (newScreenshotQuality.level === 'bad') {
    const message = `截图质量极差 (分数: ${newScreenshotQuality.score}, 问题: ${newScreenshotQuality.flags || '未知'})`;
    const id = await createAlert(urlId, 'single_bad_quality', message, 'critical', 1);
    alertsCreated.push({ id, type: 'single_bad_quality', severity: 'critical' });
  }

  if (newScreenshotQuality.flags && newScreenshotQuality.flags.includes('blank_page')) {
    const message = `检测到空白页面`;
    const id = await createAlert(urlId, 'blank_page', message, 'warning', 1);
    alertsCreated.push({ id, type: 'blank_page', severity: 'warning' });
  }

  if (newScreenshotQuality.flags && newScreenshotQuality.flags.includes('error_keywords')) {
    const message = `检测到错误关键词`;
    const id = await createAlert(urlId, 'error_page', message, 'warning', 1);
    alertsCreated.push({ id, type: 'error_page', severity: 'warning' });
  }

  return { alertsCreated, alertsResolved, consecutiveLowQuality };
}

export async function getActiveAlerts(urlId = null) {
  const db = await getDb();
  if (urlId) {
    return db.prepare(`
      SELECT a.*, u.name as url_name, u.url
      FROM alerts a JOIN urls u ON a.url_id = u.id
      WHERE a.url_id = ? AND a.status = 'active'
      ORDER BY a.created_at DESC
    `).all(urlId);
  }
  return db.prepare(`
    SELECT a.*, u.name as url_name, u.url
    FROM alerts a JOIN urls u ON a.url_id = u.id
    WHERE a.status = 'active'
    ORDER BY a.created_at DESC
  `).all();
}

export async function getAllAlerts(urlId = null, limit = 100) {
  const db = await getDb();
  if (urlId) {
    return db.prepare(`
      SELECT a.*, u.name as url_name, u.url
      FROM alerts a JOIN urls u ON a.url_id = u.id
      WHERE a.url_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(urlId, limit);
  }
  return db.prepare(`
    SELECT a.*, u.name as url_name, u.url
    FROM alerts a JOIN urls u ON a.url_id = u.id
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(limit);
}

export async function resolveAlert(alertId) {
  const db = await getDb();
  db.prepare(`
    UPDATE alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(alertId);
  return true;
}
