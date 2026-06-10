import { getFileSize, readPngDimensions } from './utils/pngUtils.js';
import {
  fileSizeCheck,
  dimensionsCheck,
  blankPageCheck,
  errorKeywordsCheck,
  loadCompletenessCheck
} from './checks/index.js';

const SENSITIVITY_MULTIPLIERS = {
  strict: { size: 1.5, blank: 0.05, error: 0.8 },
  normal: { size: 1.0, blank: 0.0, error: 1.0 },
  relaxed: { size: 0.7, blank: -0.05, error: 1.3 }
};

export const DEFAULT_CONFIG = {
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

export function calculateQualityLevel(score) {
  if (score >= 90) return 'good';
  if (score >= 70) return 'fair';
  if (score >= 40) return 'poor';
  return 'bad';
}

export async function runAllChecks({ filePath, expectedWidth, expectedHeight, pageText, pageMetrics, config }) {
  const results = [];

  results.push(await fileSizeCheck.run(filePath, config));
  results.push(await dimensionsCheck.run(filePath, expectedWidth, expectedHeight, config));
  results.push(await blankPageCheck.run(filePath, config));
  results.push(await errorKeywordsCheck.run(pageText, config));
  results.push(await loadCompletenessCheck.run(pageMetrics, config));

  return results;
}

export async function analyzeScreenshotQuality({ filePath, expectedWidth, expectedHeight, pageText, pageMetrics, rawConfig }) {
  const config = getQualityConfig(rawConfig);
  const checks = await runAllChecks({ filePath, expectedWidth, expectedHeight, pageText, pageMetrics, config });

  const totalDeduction = checks.reduce((sum, c) => sum + (c.score_deduction || 0), 0);
  const score = Math.max(0, 100 - totalDeduction);
  const level = calculateQualityLevel(score);

  const flags = checks.filter((c) => !c.passed).map((c) => c.check_type);
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

export {
  fileSizeCheck,
  dimensionsCheck,
  blankPageCheck,
  errorKeywordsCheck,
  loadCompletenessCheck
};

export default analyzeScreenshotQuality;
