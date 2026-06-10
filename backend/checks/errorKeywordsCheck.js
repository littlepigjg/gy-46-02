export const CHECK_TYPE = 'error_keywords';
export const CHECK_NAME = '错误关键词检测';
export const SCORE_DEDUCTION = 30;

export async function run(pageText, config) {
  if (!pageText) {
    return {
      check_type: CHECK_TYPE,
      check_name: CHECK_NAME,
      passed: 1,
      score_deduction: 0,
      details: JSON.stringify({ note: '无页面文本数据' })
    };
  }

  const keywords = (config.error_keywords || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const found = [];

  for (const kw of keywords) {
    if (kw && pageText.includes(kw)) {
      found.push(kw);
    }
  }

  const passed = found.length === 0;

  return {
    check_type: CHECK_TYPE,
    check_name: CHECK_NAME,
    passed: passed ? 1 : 0,
    score_deduction: passed ? 0 : SCORE_DEDUCTION,
    details: JSON.stringify({
      found_keywords: found,
      total_keywords: keywords.length,
      text_preview: pageText.substring(0, 200)
    })
  };
}

export default { CHECK_TYPE, CHECK_NAME, SCORE_DEDUCTION, run };
