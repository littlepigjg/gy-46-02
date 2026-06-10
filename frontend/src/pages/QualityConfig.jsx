import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getUrl, getQualityConfig, updateQualityConfig, getQualityDefaults } from '../api.js'
import { SENSITIVITY_LABELS } from '../utils/quality.js'

export default function QualityConfig() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [urlInfo, setUrlInfo] = useState(null)
  const [config, setConfig] = useState(null)
  const [defaults, setDefaults] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [urlRes, cfgRes, defRes] = await Promise.all([
        getUrl(id), getQualityConfig(id), getQualityDefaults()
      ])
      setUrlInfo(urlRes.data)
      setConfig(cfgRes.data)
      setDefaults(defRes.data)
    } catch (err) {
      alert('加载失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateQualityConfig(id, {
        sensitivity: config.sensitivity,
        min_file_size_kb: Number(config.min_file_size_kb),
        min_width: Number(config.min_width),
        min_height: Number(config.min_height),
        blank_page_threshold: Number(config.blank_page_threshold),
        error_keywords: config.error_keywords,
        consecutive_failures: Number(config.consecutive_failures),
        enable_alert: config.enable_alert ? 1 : 0
      })
      alert('保存成功')
      loadData()
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.error || err.message))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('确定恢复默认配置？')) return
    if (!defaults) return
    try {
      await updateQualityConfig(id, {
        sensitivity: defaults.sensitivity,
        min_file_size_kb: defaults.min_file_size_kb,
        min_width: defaults.min_width,
        min_height: defaults.min_height,
        blank_page_threshold: defaults.blank_page_threshold,
        error_keywords: defaults.error_keywords,
        consecutive_failures: defaults.consecutive_failures,
        enable_alert: defaults.enable_alert
      })
      alert('已恢复默认')
      loadData()
    } catch (err) {
      alert('重置失败: ' + err.message)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
        加载中...
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
        >
          ← 返回
        </button>
        <div className="h-6 w-px bg-gray-300"></div>
        <div>
          <h2 className="text-xl font-semibold text-gray-800">质量检测配置</h2>
          <p className="text-sm text-gray-500 mt-0.5">{urlInfo?.name} - {urlInfo?.url}</p>
        </div>
      </div>

      {config && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">检测敏感度</label>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(SENSITIVITY_LABELS).map(([val, label]) => (
                <label
                  key={val}
                  className={`flex items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    config.sensitivity === val
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="sensitivity"
                    value={val}
                    checked={config.sensitivity === val}
                    onChange={(e) => handleChange('sensitivity', e.target.value)}
                    className="mr-2"
                  />
                  <span className="font-medium">{label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              严格模式会提高检测标准，更容易判定为低质量；宽松模式则相反。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">最小文件大小 (KB)</label>
              <input
                type="number"
                min="1"
                value={config.min_file_size_kb ?? ''}
                onChange={(e) => handleChange('min_file_size_kb', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">低于此大小的截图会被标记为文件过小</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">连续异常告警阈值</label>
              <input
                type="number"
                min="1"
                max="20"
                value={config.consecutive_failures ?? ''}
                onChange={(e) => handleChange('consecutive_failures', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">连续多少次低质量后触发告警</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">最小宽度 (px)</label>
              <input
                type="number"
                min="100"
                value={config.min_width ?? ''}
                onChange={(e) => handleChange('min_width', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">最小高度 (px)</label>
              <input
                type="number"
                min="100"
                value={config.min_height ?? ''}
                onChange={(e) => handleChange('min_height', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">空白页检测阈值</label>
            <input
              type="range"
              min="0.5"
              max="0.99"
              step="0.01"
              value={config.blank_page_threshold ?? 0.95}
              onChange={(e) => handleChange('blank_page_threshold', e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>更宽松 (0.5)</span>
              <span className="font-medium text-gray-700">
                当前: {Number(config.blank_page_threshold).toFixed(2)}
              </span>
              <span>更严格 (0.99)</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              页面空白比例超过此阈值会被判定为空白页
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">错误关键词</label>
            <textarea
              value={config.error_keywords ?? ''}
              onChange={(e) => handleChange('error_keywords', e.target.value)}
              rows="3"
              placeholder="用逗号分隔，例如: 404,500,error,错误"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              页面文本包含任意关键词即判定为错误页面
            </p>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="enableAlert"
              checked={!!config.enable_alert}
              onChange={(e) => handleChange('enable_alert', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <label htmlFor="enableAlert" className="ml-2 text-sm font-medium text-gray-700">
              启用告警通知
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存配置'}
            </button>
            <button
              onClick={handleReset}
              className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200"
            >
              恢复默认
            </button>
            <button
              onClick={() => navigate(`/url/${id}`)}
              className="ml-auto bg-gray-50 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-100"
            >
              查看截图
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
