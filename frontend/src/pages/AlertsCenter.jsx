import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getAlerts, resolveAlert, triggerScreenshot } from '../api.js'
import { SEVERITY_LABELS, ALERT_TYPE_LABELS } from '../utils/quality.js'

export default function AlertsCenter() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('active')
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState(null)
  const [screenshottingId, setScreenshottingId] = useState(null)

  useEffect(() => {
    loadAlerts()
  }, [filter])

  const loadAlerts = async () => {
    setLoading(true)
    try {
      const params = filter === 'all' ? { limit: 200 } : { status: filter }
      const res = await getAlerts(params)
      setAlerts(res.data)
    } catch (err) {
      alert('加载告警失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async (alertId) => {
    setResolvingId(alertId)
    try {
      await resolveAlert(alertId)
      loadAlerts()
    } catch (err) {
      alert('处理失败: ' + err.message)
    } finally {
      setResolvingId(null)
    }
  }

  const handleResolveAll = async () => {
    if (!confirm(`确定标记所有告警为已处理？`)) return
    const actives = alerts.filter(a => a.status === 'active')
    for (const a of actives) {
      try {
        await resolveAlert(a.id)
      } catch (e) {
        console.error('处理告警失败:', e)
      }
    }
    loadAlerts()
  }

  const handleScreenshot = async (urlId) => {
    setScreenshottingId(urlId)
    try {
      await triggerScreenshot(urlId)
      alert('截图完成')
      loadAlerts()
    } catch (err) {
      alert('截图失败: ' + (err.response?.data?.error || err.message))
    } finally {
      setScreenshottingId(null)
    }
  }

  const activeCount = alerts.filter(a => a.status === 'active').length
  const criticalCount = alerts.filter(a => a.status === 'active' && a.severity === 'critical').length

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
        >
          ← 返回列表
        </button>
        <div className="h-6 w-px bg-gray-300"></div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-800">告警中心</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount > 0 ? (
              <span className="text-red-600">
                {activeCount} 个未处理告警
                {criticalCount > 0 && ` (含 ${criticalCount} 个严重)`}
              </span>
            ) : (
              <span className="text-green-600">暂无未处理告警</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {activeCount > 0 && (
            <button
              onClick={handleResolveAll}
              className="bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm hover:bg-green-100 border border-green-200"
            >
              全部标记已处理
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex gap-2">
          {[
            { key: 'active', label: '未处理' },
            { key: 'resolved', label: '已处理' },
            { key: 'all', label: '全部' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm ${
                filter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
              {tab.key === 'active' && activeCount > 0 && (
                <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {activeCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          加载中...
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          {filter === 'active' ? '暂无未处理告警，一切正常 ✓' : '暂无告警记录'}
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(a => (
            <div
              key={a.id}
              className={`bg-white rounded-xl shadow-sm border-2 p-5 ${
                a.status === 'active'
                  ? a.severity === 'critical'
                    ? 'border-red-400'
                    : 'border-yellow-300'
                  : 'border-gray-200 opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_LABELS[a.severity]?.class || 'bg-gray-100 text-gray-800'}`}>
                      {SEVERITY_LABELS[a.severity]?.label || a.severity}
                    </span>
                    <span className="text-sm font-medium text-gray-800">
                      {ALERT_TYPE_LABELS[a.alert_type] || a.alert_type}
                    </span>
                    <span className="text-xs text-gray-500">
                      {dayjs(a.created_at).format('YYYY-MM-DD HH:mm:ss')}
                    </span>
                    {a.status === 'resolved' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                        已处理
                      </span>
                    )}
                    {a.consecutive_count > 1 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                        连续 {a.consecutive_count} 次
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/url/${a.url_id}`)}
                      className="text-base font-medium text-blue-600 hover:text-blue-800 truncate"
                    >
                      {a.url_name}
                    </button>
                    <span className="text-xs text-gray-400 truncate">{a.url}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">{a.message}</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/url/${a.url_id}`)}
                    className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded hover:bg-blue-100"
                  >
                    查看截图
                  </button>
                  <button
                    onClick={() => navigate(`/url/${a.url_id}/quality`)}
                    className="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded hover:bg-purple-100"
                  >
                    质量报告
                  </button>
                  <button
                    onClick={() => handleScreenshot(a.url_id)}
                    disabled={screenshottingId === a.url_id}
                    className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded hover:bg-green-100 disabled:opacity-50"
                  >
                    {screenshottingId === a.url_id ? '截图中...' : '重新截图'}
                  </button>
                  {a.status === 'active' && (
                    <button
                      onClick={() => handleResolve(a.id)}
                      disabled={resolvingId === a.id}
                      className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200 disabled:opacity-50"
                    >
                      {resolvingId === a.id ? '处理中...' : '标记已处理'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
