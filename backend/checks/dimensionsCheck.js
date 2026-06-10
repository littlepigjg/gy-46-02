import { readPngDimensions } from '../utils/pngUtils.js';

export const CHECK_TYPE = 'dimensions';
export const CHECK_NAME = '图像尺寸检测';
export const WIDTH_DEDUCTION = 10;
export const HEIGHT_DEDUCTION = 10;

export async function run(filePath, expectedWidth, expectedHeight, config) {
  const dims = readPngDimensions(filePath);
  const actualWidth = dims.width || expectedWidth || 0;
  const actualHeight = dims.height || expectedHeight || 0;

  const widthOk = actualWidth >= config.min_width;
  const heightOk = actualHeight >= config.min_height;
  const passed = widthOk && heightOk;

  let deduction = 0;
  if (!widthOk) deduction += WIDTH_DEDUCTION;
  if (!heightOk) deduction += HEIGHT_DEDUCTION;

  return {
    check_type: CHECK_TYPE,
    check_name: CHECK_NAME,
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

export default { CHECK_TYPE, CHECK_NAME, WIDTH_DEDUCTION, HEIGHT_DEDUCTION, run };
