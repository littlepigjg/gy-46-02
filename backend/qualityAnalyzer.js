import fs from 'fs';
import path from 'path';

const SENSITIVITY_MULTIPLIERS = {
  strict: { size: 1.5, blank: 0.05, error: 0.8 },
  normal: { size: 1.0, blank: 0.0, error: 1.0 },
  relaxed: { size: 0.7, blank: -0.05, error: 1.3 }
};

const DEFAULT_CONFIG = {
  sensitivity: 'normal',
  min_file_size_kb: 50,
  min_width: 800,
  min_height: 600,
  blank_page_threshold: 0.95,
  error_keywords: '404,500,error,Error,错误,无法访问,页面不存在,加载失败',
  consecutive_failures: 3,
  enable_alert: 1
};

function applySensitivity(config) {
  const mult = SENSITIVITY_MULTIPLIERS[config.sensitivity] || SENSITIVITY_MULTIPLIERS.normal;
  return {
    ...config,
    min_file_size_kb: Math.max(10, Math.round(config.min_file_size_kb * mult.size)),
    blank_page_threshold: Math.max(0.7, Math.min(0.99, config.blank_page_threshold + mult.blank))
  };
}

export function getQualityConfig(rawConfig) {
  const merged = { ...DEFAULT_CONFIG, ...(rawConfig || {}) };
  return applySensitivity(merged);
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (e) {
    return 0;
  }
}

function readPngDimensions(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 24) return { width: 0, height: 0 };
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  } catch (e) {
    return { width: 0, height: 0 };
  }
}

export async function checkFileSize(filePath, config) {
  const fileSize = getFileSize(filePath);
  const minBytes = config.min_file_size_kb * 1024;
  const passed = fileSize >= minBytes;

  return {
    check_type: 'file_size',
    check_name: '文件大小检测',
    passed: passed ? 1 : 0,
    score_deduction: passed ? 0 : 20,
    details: JSON.stringify({
      actual_kb: Math.round(fileSize / 1024),
      min_kb: config.min_file_size_kb,
      file_size_bytes: fileSize
    })
  };
}

export async function checkDimensions(filePath, expectedWidth, expectedHeight, config) {
  const dims = readPngDimensions(filePath);
  const actualWidth = dims.width || expectedWidth || 0;
  const actualHeight = dims.height || expectedHeight || 0;

  const widthOk = actualWidth >= config.min_width;
  const heightOk = actualHeight >= config.min_height;
  const passed = widthOk && heightOk;

  let deduction = 0;
  if (!widthOk) deduction += 10;
  if (!heightOk) deduction += 10;

  return {
    check_type: 'dimensions',
    check_name: '图像尺寸检测',
    passed: passed ? 1 : 0,
    score_deduction: deduction,
    details: JSON.stringify({
      actual_width: actualWidth,
      actual_height: actualHeight,
      min_width: config.min_width,
      min_height: config.min_height,
      expected_width: expectedWidth,
      expected_height: expectedHeight
    })
  };
}

function samplePixelColors(buffer, width, height, sampleStep = 20) {
  const stats = {
    totalSamples: 0,
    rSum: 0, gSum: 0, bSum: 0,
    rSqSum: 0, gSqSum: 0, bSqSum: 0,
    whitePixels: 0,
    nearWhitePixels: 0,
    uniqueColors: new Set()
  };

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const offset = y * stride + x * bytesPerPixel;
      if (offset + 3 >= buffer.length) break;

      const r = buffer[offset];
      const g = buffer[offset + 1];
      const b = buffer[offset + 2];

      stats.totalSamples++;
      stats.rSum += r; stats.gSum += g; stats.bSum += b;
      stats.rSqSum += r * r; stats.gSqSum += g * g; stats.bSqSum += b * b;

      if (r >= 250 && g >= 250 && b >= 250) stats.whitePixels++;
      if (r >= 240 && g >= 240 && b >= 240) stats.nearWhitePixels++;

      const colorKey = `${Math.floor(r / 32)}_${Math.floor(g / 32)}_${Math.floor(b / 32)}`;
      stats.uniqueColors.add(colorKey);
    }
  }

  return stats;
}

function readPngPixelData(filePath) {
  try {
    const png = fs.readFileSync(filePath);
    if (png.length < 8 || png.toString('ascii', 0, 8) !== '\x89PNG\r\n\x1a\n') {
      return null;
    }

    let pos = 8;
    let width = 0, height = 0, bitDepth = 0, colorType = 0;
    let idatChunks = [];

    while (pos < png.length - 12) {
      const length = png.readUInt32BE(pos);
      const type = png.toString('ascii', pos + 4, pos + 8);

      if (type === 'IHDR') {
        width = png.readUInt32BE(pos + 8);
        height = png.readUInt32BE(pos + 12);
        bitDepth = png[pos + 16];
        colorType = png[pos + 17];
      } else if (type === 'IDAT') {
        idatChunks.push(png.subarray(pos + 8, pos + 8 + length));
      } else if (type === 'IEND') {
        break;
      }

      pos += 12 + length;
    }

    if (width === 0 || height === 0 || idatChunks.length === 0) {
      return null;
    }

    return { width, height, bitDepth, colorType };
  } catch (e) {
    return null;
  }
}

export async function checkBlankPage(filePath, config) {
  let passed = true;
  let blankRatio = 0;
  let details = {};

  try {
    const pngInfo = readPngPixelData(filePath);
    if (!pngInfo) {
      passed = false;
      details = { error: '无法读取PNG文件信息' };
    } else {
      const fileSize = getFileSize(filePath);
      const bytesPerPixel = 4;
      const expectedMinSize = pngInfo.width * pngInfo.height * bytesPerPixel * 0.05;

      if (fileSize < expectedMinSize) {
        blankRatio = 0.98;
        passed = false;
        details = {
          reason: '文件过小疑似空白',
          actual_size: fileSize,
          expected_min_size: Math.round(expectedMinSize),
          blank_ratio: blankRatio
        };
      } else {
        const dims = readPngDimensions(filePath);
        if (dims.width && dims.height) {
          const sampleSize = Math.min(100, Math.floor((dims.width * dims.height) / 20000));
          blankRatio = estimateBlankRatioQuick(filePath, dims.width, dims.height, Math.max(10, sampleSize));
          passed = blankRatio < config.blank_page_threshold;
          details = {
            blank_ratio: blankRatio,
            threshold: config.blank_page_threshold,
            width: dims.width,
            height: dims.height
          };
        } else {
          details = { error: '无法读取尺寸信息' };
        }
      }
    }
  } catch (e) {
    passed = true;
    details = { error: e.message };
  }

  return {
    check_type: 'blank_page',
    check_name: '空白页面检测',
    passed: passed ? 1 : 0,
    score_deduction: passed ? 0 : 40,
    details: JSON.stringify(details)
  };
}

function estimateBlankRatioQuick(filePath, width, height, samplePoints) {
  try {
    const buffer = fs.readFileSync(filePath);
    const sig = buffer.toString('ascii', 0, 8);
    if (sig !== '\x89PNG\r\n\x1a\n') return 0.5;

    let pos = 8;
    let idatStart = -1, idatLength = 0;
    while (pos < buffer.length - 12) {
      const length = buffer.readUInt32BE(pos);
      const type = buffer.toString('ascii', pos + 4, pos + 8);
      if (type === 'IDAT') {
        idatStart = pos + 8;
        idatLength = length;
        break;
      }
      pos += 12 + length;
    }

    if (idatStart === -1 || idatLength < 100) return 0.5;

    const sampleSize = Math.min(idatLength, 50000);
    const sample = buffer.subarray(idatStart, idatStart + sampleSize);

    let zeroCount = 0;
    let nearWhiteCount = 0;
    for (let i = 0; i < sample.length; i += 3) {
      const v = sample[i];
      if (v === 0) zeroCount++;
      if (v >= 240) nearWhiteCount++;
    }

    const zeroRatio = zeroCount / sample.length;
    const nearWhiteRatio = nearWhiteCount / sample.length;
    return Math.max(zeroRatio, nearWhiteRatio);
  } catch (e) {
    return 0.5;
  }
}

export async function checkErrorKeywords(pageText, config) {
  if (!pageText) {
    return {
      check_type: 'error_keywords',
      check_name: '错误关键词检测',
      passed: 1,
      score_deduction: 0,
      details: JSON.stringify({ note: '无页面文本数据' })
    };
  }

  const keywords = (config.error_keywords || '').split(',').map(k => k.trim()).filter(Boolean);
  const found = [];

  for (const kw of keywords) {
    if (kw && pageText.includes(kw)) {
      found.push(kw);
    }
  }

  const passed = found.length === 0;

  return {
    check_type: 'error_keywords',
    check_name: '错误关键词检测',
    passed: passed ? 1 : 0,
    score_deduction: passed ? 0 : 30,
    details: JSON.stringify({
      found_keywords: found,
      total_keywords: keywords.length,
      text_preview: pageText.substring(0, 200)
    })
  };
}

export async function checkLoadCompleteness(pageMetrics, config) {
  const details = {};
  let passed = true;
  let deduction = 0;

  if (pageMetrics) {
    if (pageMetrics.statusCode && pageMetrics.statusCode >= 400) {
      details.http_status = pageMetrics.statusCode;
      passed = false;
      deduction += 30;
    }

    if (pageMetrics.failedRequests && pageMetrics.failedRequests > 0) {
      details.failed_requests = pageMetrics.failedRequests;
      if (pageMetrics.failedRequests > 5) {
        deduction += 10;
        passed = deduction > 0 ? false : passed;
      }
    }

    if (pageMetrics.loadTimeMs && pageMetrics.loadTimeMs > 30000) {
      details.slow_load = pageMetrics.loadTimeMs;
      deduction += 5;
    }

    if (pageMetrics.contentLength !== undefined) {
      details.content_length = pageMetrics.contentLength;
      if (pageMetrics.contentLength < 1000) {
        passed = false;
        deduction += 20;
      }
    }
  }

  return {
    check_type: 'load_completeness',
    check_name: '加载完整性检测',
    passed: passed ? 1 : 0,
    score_deduction: deduction,
    details: JSON.stringify(details)
  };
}

export function calculateQualityLevel(score) {
  if (score >= 90) return 'good';
  if (score >= 70) return 'fair';
  if (score >= 40) return 'poor';
  return 'bad';
}

export async function analyzeScreenshotQuality({ filePath, expectedWidth, expectedHeight, pageText, pageMetrics, rawConfig }) {
  const config = getQualityConfig(rawConfig);
  const checks = [];

  checks.push(await checkFileSize(filePath, config));
  checks.push(await checkDimensions(filePath, expectedWidth, expectedHeight, config));
  checks.push(await checkBlankPage(filePath, config));
  checks.push(await checkErrorKeywords(pageText, config));
  checks.push(await checkLoadCompleteness(pageMetrics, config));

  const totalDeduction = checks.reduce((sum, c) => sum + (c.score_deduction || 0), 0);
  const score = Math.max(0, 100 - totalDeduction);
  const level = calculateQualityLevel(score);

  const flags = checks.filter(c => !c.passed).map(c => c.check_type);
  const fileSize = getFileSize(filePath);
  const dims = readPngDimensions(filePath);

  return {
    score,
    level,
    flags: flags.join(','),
    file_size: fileSize,
    actual_width: dims.width || expectedWidth,
    actual_height: dims.height || expectedHeight,
    checks
  };
}

export { DEFAULT_CONFIG };
