export const QUALITY_LEVELS = {
  good: {
    label: '优秀',
    color: 'green',
    bgClass: 'bg-green-100',
    textClass: 'text-green-800',
    borderClass: 'border-green-500',
    ringClass: 'ring-green-200'
  },
  fair: {
    label: '良好',
    color: 'blue',
    bgClass: 'bg-blue-100',
    textClass: 'text-blue-800',
    borderClass: 'border-blue-500',
    ringClass: 'ring-blue-200'
  },
  poor: {
    label: '较差',
    color: 'orange',
    bgClass: 'bg-orange-100',
    textClass: 'text-orange-800',
    borderClass: 'border-orange-500',
    ringClass: 'ring-orange-200'
  },
  bad: {
    label: '异常',
    color: 'red',
    bgClass: 'bg-red-100',
    textClass: 'text-red-800',
    borderClass: 'border-red-500',
    ringClass: 'ring-red-200'
  }
}

export const QUALITY_FLAG_LABELS = {
  file_size: '文件过小',
  dimensions: '尺寸异常',
  blank_page: '空白页面',
  error_keywords: '错误关键词',
  load_completeness: '加载不完整'
}

export const SENSITIVITY_LABELS = {
  strict: '严格',
  normal: '标准',
  relaxed: '宽松'
}

export const SEVERITY_LABELS = {
  warning: { label: '警告', class: 'bg-yellow-100 text-yellow-800' },
  critical: { label: '严重', class: 'bg-red-100 text-red-800' }
}

export const ALERT_TYPE_LABELS = {
  consecutive_low_quality: '连续低质量',
  single_bad_quality: '单次极差质量',
  blank_page: '空白页面',
  error_page: '错误页面'
}

export function getQualityLevelInfo(level) {
  return QUALITY_LEVELS[level] || QUALITY_LEVELS.good
}

export function getQualityFlagLabels(flagsStr) {
  if (!flagsStr) return []
  return flagsStr.split(',').filter(Boolean).map(f => QUALITY_FLAG_LABELS[f] || f)
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}
