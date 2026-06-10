import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getUrls, addUrl, deleteUrl, triggerScreenshot, getAlerts } from '../api.js'
import { getQualityLevelInfo, getQualityFlagLabels } from '../utils/quality.js'

const FREQUENCY_LABELS = {
  hourly: '每小时',
  daily: '每天',
  weekly: '每周',
  monthly: '每月'
}

export default function UrlList() {
  const [urls, setUrls] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({ url: '', name: '', frequency: 'daily' })
  const [loading, setLoading] = useState(false)
  const [screenshottingId, setScreenshottingId] = useState(null)
  const [showAlertsPanel, setShowAlertsPanel] = useState(false)
  const [alerts, setAlerts] = useState([])
  const navigate = useNavigate()

  const loadUrls = async () => {
    try {
      const res = await getUrls()
      setUrls(res.data)
    } catch (err) {
      alert('加载失败: ' + err.message)
    }
  }

  const loadAlerts = async () => {
    try {
      const res = await getAlerts({ status: 'active' })
      setAlerts(res.data)
    } catch (err) {
      console.error('加载告警失败:', err)
    }
  }

  useEffect(() => {
    loadUrls()
    loadAlerts()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.url || !formData.name) {
      alert('请填写完整信息')
      return
    }
    setLoading(true)
    try {
      await addUrl(formData)
      setShowAddForm(false)
      setFormData({ url: '', name: '', frequency: 'daily' })
      loadUrls()
    } catch (err) {
      alert('添加失败: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`确定删除 "${name}" 及其所有截图吗？`)) return
    try {
      await deleteUrl(id)
      loadUrls()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  const handleScreenshot = async (id) => {
    setScreenshottingId(id)
    try {
      await triggerScreenshot(id)
      loadUrls()
      alert('截图完成')
    } catch (err) {
      alert('截图失败: ' + (err.response?.data?.error || err.message))
    } finally {
      setScreenshottingId(null)
    }
  }

  const totalActiveAlerts = alerts.length

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-gray-800">监控URL列表</h2>
          {totalActiveAlerts > 0 && (
            <button
              onClick={() => setShowAlertsPanel(true)}
              className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-sm hover:bg-red-100 border border-red-200"
            >
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              {totalActiveAlerts} 个告警
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/alerts')}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
          >
            告警中心
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 添加URL
          </button>
        </div>
      </div>

      {showAlertsPanel && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-5 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-800">当前告警</h3>
            <button onClick={() => setShowAlertsPanel(false)} className="text-gray-500 hover:text-gray-700">×</button>
          </div>
          {alerts.length === 0 ? (
            <div className="text-gray-500 py-4 text-center">暂无告警</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {alerts.map(a => (
                <div key={a.id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-100">
                  <div className="flex-1">
                    <div className="font-medium text-red-800">{a.url_name}</div>
                    <div className="text-sm text-red-600">{a.message}</div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${a.severity === 'critical' ? 'bg-red-200 text-red-900' : 'bg-yellow-100 text-yellow-800'}`}>
                      {a.severity === 'critical' ? '严重' : '警告'}
                    </span>
                    <button
                      onClick={() => navigate(`/url/${a.url_id}`)}
                      className="text-xs bg-white text-gray-700 px-2 py-1 rounded hover:bg-gray-50 border"
                    >
                      查看
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-800 mb-4">添加新URL</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如: 百度首页"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">截图频率</label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="hourly">每小时</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '添加中...' : '添加'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {urls.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
            暂无监控URL，点击右上角添加
          </div>
        ) : (
          urls.map((item) => {
            const qInfo = getQualityLevelInfo(item.last_quality_level)
            const hasAlert = (item.active_alert_count || 0) > 0
            return (
              <div
                key={item.id}
                className={`bg-white rounded-xl shadow-sm border-2 p-5 hover:shadow-md transition-all ${
                  hasAlert ? 'border-red-400' : qInfo.borderClass
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 cursor-pointer" onClick={() => navigate(`/url/${item.id}`)}>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-medium text-gray-900 hover:text-blue-600">
                        {item.name}
                      </h3>
                      {hasAlert && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {item.active_alert_count} 告警
                        </span>
                      )}
                      {item.last_quality_level && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${qInfo.bgClass} ${qInfo.textClass}`}>
                          {item.last_quality_score !== null && item.last_quality_score !== undefined
                            ? `${qInfo.label} ${item.last_quality_score}分`
                            : qInfo.label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1 truncate">{item.url}</p>
                    <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {FREQUENCY_LABELS[item.frequency]}
                      </span>
                      <span className="text-gray-500">
                        截图数: <span className="font-medium text-gray-700">{item.screenshot_count}</span>
                      </span>
                      {item.last_screenshot_at && (
                        <span className="text-gray-500">
                          上次截图: {dayjs(item.last_screenshot_at).format('YYYY-MM-DD HH:mm')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/url/${item.id}`)}
                        className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm hover:bg-blue-100"
                      >
                        查看截图
                      </button>
                      <button
                        onClick={() => handleScreenshot(item.id)}
                        disabled={screenshottingId === item.id}
                        className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm hover:bg-green-100 disabled:opacity-50"
                      >
                        {screenshottingId === item.id ? '截图中...' : '立即截图'}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/url/${item.id}/quality`) }}
                        className="flex-1 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg text-sm hover:bg-purple-100"
                      >
                        质量报告
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/url/${item.id}/config`) }}
                        className="flex-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200"
                      >
                        质量配置
                      </button>
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-sm hover:bg-red-100"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
