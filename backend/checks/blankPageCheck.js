import { calculateBlankRatio, getFileSize } from '../utils/pngUtils.js';

export const CHECK_TYPE = 'blank_page';
export const CHECK_NAME = '空白页面检测';
export const SCORE_DEDUCTION = 40;

export async function run(filePath, config) {
  let passed = true;
  let details = {};

  try {
    const fileSize = getFileSize(filePath);

    const blankInfo = await calculateBlankRatio(filePath);

    if (blankInfo.error) {
      details = { error: blankInfo.error };
      passed = true;
    } else {
      const blankRatio = blankInfo.blankRatio;
      passed = blankRatio < config.blank_page_threshold;
      details = {
        blank_ratio: blankRatio,
        threshold: config.blank_page_threshold,
        width: blankInfo.width,
        height: blankInfo.height,
        total_samples: blankInfo.totalSamples,
        near_white_ratio: blankInfo.nearWhiteRatio,
        pure_white_ratio: blankInfo.whiteRatio,
        near_black_ratio: blankInfo.nearBlackRatio,
        unique_color_ratio: blankInfo.uniqueColorRatio,
        brightness_variance: blankInfo.brightnessVariance,
        avg_color_distance: blankInfo.avgColorDistance,
        file_size_bytes: fileSize
      };

      if (!passed) {
        const reasons = [];
        if (blankInfo.whiteRatio > 0.8) reasons.push('纯白像素比例过高');
        if (blankInfo.nearWhiteRatio > 0.85) reasons.push('近白像素比例过高');
        if (blankInfo.uniqueColorRatio < 0.05) reasons.push('颜色种类极少');
        if (blankInfo.avgColorDistance < 15) reasons.push('像素颜色差异极小');
        if (blankInfo.brightnessVariance < 8) reasons.push('亮度方差极低');
        if (reasons.length === 0) reasons.push('综合空白比例超过阈值');
        details.reasons = reasons;
      }
    }
  } catch (e) {
    passed = true;
    details = { error: e.message };
  }

  return {
    check_type: CHECK_TYPE,
    check_name: CHECK_NAME,
    passed: passed ? 1 : 0,
    score_deduction: passed ? 0 : SCORE_DEDUCTION,
    details: JSON.stringify(details)
  };
}

export default { CHECK_TYPE, CHECK_NAME, SCORE_DEDUCTION, run };
