import { getFileSize } from '../utils/pngUtils.js';

export const CHECK_TYPE = 'file_size';
export const CHECK_NAME = '文件大小检测';
export const SCORE_DEDUCTION = 20;

export async function run(filePath, config) {
  const fileSize = getFileSize(filePath);
  const minBytes = config.min_file_size_kb * 1024;
  const passed = fileSize >= minBytes;

  return {
    check_type: CHECK_TYPE,
    check_name: CHECK_NAME,
    passed: passed ? 1 : 0,
    score_deduction: passed ? 0 : SCORE_DEDUCTION,
    details: JSON.stringify({
      actual_kb: Math.round(fileSize / 1024),
      min_kb: config.min_file_size_kb,
      file_size_bytes: fileSize
    })
  };
}

export default { CHECK_TYPE, CHECK_NAME, SCORE_DEDUCTION, run };
