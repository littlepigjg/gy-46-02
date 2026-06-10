import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import getDb from './db.js';
import { analyzeScreenshotQuality, getQualityConfig } from './qualityAnalyzer.js';
import { checkAndUpdateAlerts } from './alertManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
  }
  return browser;
}

function sanitizeFilename(str) {
  return str.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
}

export async function takeScreenshot(urlRecord) {
  const { id, url, name } = urlRecord;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');

  const urlDir = path.join(SCREENSHOTS_DIR, sanitizeFilename(name || url), dateStr);
  if (!fs.existsSync(urlDir)) {
    fs.mkdirSync(urlDir, { recursive: true });
  }

  const fileName = `${timeStr}.png`;
  const filePath = path.join(urlDir, fileName);

  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    let pageText = '';
    let statusCode = 0;
    let failedRequests = 0;
    let contentLength = 0;
    const loadStart = Date.now();

    page.on('response', (resp) => {
      if (resp.request().isNavigationRequest()) {
        statusCode = resp.status();
        const len = resp.headers()['content-length'];
        if (len) contentLength = parseInt(len, 10);
      }
      if (!resp.ok()) {
        failedRequests++;
      }
    });

    const expectedWidth = 1920;
    const expectedHeight = 1080;

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (navErr) {
      console.warn(`导航警告 [${url}]:`, navErr.message);
    }

    try {
      pageText = await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
    } catch (e) {
      pageText = '';
    }

    await page.screenshot({ path: filePath, fullPage: true });

    const loadTimeMs = Date.now() - loadStart;

    const db = await getDb();
    let qualityConfig = db.prepare('SELECT * FROM quality_configs WHERE url_id = ?').get(id);
    if (!qualityConfig) {
      db.prepare('INSERT INTO quality_configs (url_id) VALUES (?)').run(id);
      qualityConfig = db.prepare('SELECT * FROM quality_configs WHERE url_id = ?').get(id);
    }

    const pageMetrics = { statusCode, failedRequests, loadTimeMs, contentLength };
    const qualityResult = await analyzeScreenshotQuality({
      filePath,
      expectedWidth,
      expectedHeight,
      pageText,
      pageMetrics,
      rawConfig: qualityConfig
    });

    const insertStmt = db.prepare(`
      INSERT INTO screenshots (url_id, file_path, file_name, width, height, file_size, quality_score, quality_level, quality_flags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insertStmt.run(
      id, filePath, fileName,
      qualityResult.actual_width,
      qualityResult.actual_height,
      qualityResult.file_size,
      qualityResult.score,
      qualityResult.level,
      qualityResult.flags
    );
    const screenshotId = result.lastInsertRowid;

    for (const check of qualityResult.checks) {
      db.prepare(`
        INSERT INTO quality_checks (screenshot_id, url_id, check_type, check_name, passed, details, score_deduction)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(screenshotId, id, check.check_type, check.check_name, check.passed, check.details, check.score_deduction);
    }

    const updateStmt = db.prepare(`
      UPDATE urls SET last_screenshot_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    updateStmt.run(id);

    const alertResult = await checkAndUpdateAlerts(id, {
      level: qualityResult.level,
      score: qualityResult.score,
      flags: qualityResult.flags
    });

    return {
      id: screenshotId,
      file_path: filePath,
      file_name: fileName,
      created_at: now.toISOString(),
      quality_score: qualityResult.score,
      quality_level: qualityResult.level,
      quality_flags: qualityResult.flags,
      alerts: alertResult
    };
  } catch (error) {
    console.error(`截图失败 [${url}]:`, error.message);
    throw error;
  } finally {
    if (page) {
      await page.close().catch(console.error);
    }
  }
}

export { SCREENSHOTS_DIR };
