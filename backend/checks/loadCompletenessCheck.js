export const CHECK_TYPE = 'load_completeness';
export const CHECK_NAME = '加载完整性检测';
export const HTTP_ERROR_DEDUCTION = 30;
export const MANY_FAILED_REQUESTS_DEDUCTION = 10;
export const SLOW_LOAD_DEDUCTION = 5;
export const SMALL_CONTENT_DEDUCTION = 20;

export async function run(pageMetrics, config) {
  const details = {};
  let passed = true;
  let deduction = 0;

  if (pageMetrics) {
    if (pageMetrics.statusCode && pageMetrics.statusCode >= 400) {
      details.http_status = pageMetrics.statusCode;
      passed = false;
      deduction += HTTP_ERROR_DEDUCTION;
    }

    if (pageMetrics.failedRequests && pageMetrics.failedRequests > 0) {
      details.failed_requests = pageMetrics.failedRequests;
      if (pageMetrics.failedRequests > 5) {
        deduction += MANY_FAILED_REQUESTS_DEDUCTION;
        passed = deduction > 0 ? false : passed;
      }
    }

    if (pageMetrics.loadTimeMs && pageMetrics.loadTimeMs > 30000) {
      details.slow_load_ms = pageMetrics.loadTimeMs;
      deduction += SLOW_LOAD_DEDUCTION;
    }

    if (pageMetrics.contentLength !== undefined) {
      details.content_length = pageMetrics.contentLength;
      if (pageMetrics.contentLength < 1000) {
        passed = false;
        deduction += SMALL_CONTENT_DEDUCTION;
      }
    }
  } else {
    details.note = '无页面指标数据';
  }

  return {
    check_type: CHECK_TYPE,
    check_name: CHECK_NAME,
    passed: passed ? 1 : 0,
    score_deduction: deduction,
    details: JSON.stringify(details)
  };
}

export default {
  CHECK_TYPE, CHECK_NAME,
  HTTP_ERROR_DEDUCTION, MANY_FAILED_REQUESTS_DEDUCTION,
  SLOW_LOAD_DEDUCTION, SMALL_CONTENT_DEDUCTION,
  run
};
