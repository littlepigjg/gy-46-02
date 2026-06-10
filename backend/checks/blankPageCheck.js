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
        avg_brightness: blankInfo.avgBrightness,
        near_white_ratio: blankInfo.nearWhiteRatio,
        pure_white_ratio: blankInfo.whiteRatio,
        near_black_ratio: blankInfo.nearBlackRatio,
        dominant_color: blankInfo.dominantColor,
        dominant_coverage: blankInfo.dominantCoverage,
        content_ratio: blankInfo.contentRatio,
        edge_density: blankInfo.edgeDensity,
        is_dominant_light: blankInfo.isDominantLight,
        file_size_bytes: fileSize
      };

      if (!passed) {
        const reasons = [];
        if (blankInfo.dominantCoverage >= 0.90) {
          reasons.push(`主色覆盖率极高 (${(blankInfo.dominantCoverage * 100).toFixed(1)}%)`);
        }
        if (blankInfo.contentRatio < 0.03) {
          reasons.push(`有效内容像素极少 (${(blankInfo.contentRatio * 100).toFixed(2)}%)`);
        }
        if (blankInfo.edgeDensity < 0.02) {
          reasons.push(`边缘密度极低 (${(blankInfo.edgeDensity * 100).toFixed(2)}%)，缺乏文字/图形边界`);
        }
        if (blankInfo.isDominantLight && blankInfo.nearWhiteRatio > 0.85) {
          reasons.push(`近白像素比例过高 (${(blankInfo.nearWhiteRatio * 100).toFixed(1)}%)`);
        }
        if (blankInfo.nearBlackRatio > 0.90) {
          reasons.push('几乎全黑，疑似加载失败空白页');
        }
        if (blankInfo.dominantColor) {
          const dc = blankInfo.dominantColor;
          reasons.push(`主色为 RGB(${dc.r}, ${dc.g}, ${dc.b})`);
        }
        if (reasons.length === 0) {
          reasons.push('综合空白比例超过阈值');
        }
        details.reasons = reasons;
      } else {
        const passReasons = [];
        if (blankInfo.contentRatio >= 0.05) {
          passReasons.push(`检测到足够内容像素 (${(blankInfo.contentRatio * 100).toFixed(1)}%)`);
        }
        if (blankInfo.edgeDensity >= 0.03) {
          passReasons.push(`存在文字/图形边界 (${(blankInfo.edgeDensity * 100).toFixed(1)}%)`);
        }
        if (blankInfo.dominantCoverage < 0.85) {
          passReasons.push('主色覆盖率在正常范围');
        }
        if (blankInfo.isDominantLight && blankInfo.nearWhiteRatio < 0.80) {
          passReasons.push('近白像素比例在正常范围');
        }
        if (passReasons.length > 0) {
          details.pass_reasons = passReasons;
        }
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
