import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  getUrl, getScreenshots, deleteScreenshot, triggerScreenshot,
  retakeScreenshot, getQualityChecks, getAlerts, resolveAlert
} from '../api.js'
import ImageCompare from '../components/ImageCompare.jsx'
import {
  getQualityLevelInfo, getQualityFlagLabels, formatFileSize,
  QUALITY_FLAG_LABELS, SEVERITY_LABELS, ALERT_TYPE_LABELS
} from '../utils/quality.js'

function getScreenshotUrl(filePath) {
  const idx = filePath.indexOf('screenshots')
  if (idx === -1) return ''
  return '/' + filePath.slice(idx).replace(/\\/g, '/')
}

export default function ScreenshotTimeline() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [urlInfo, setUrlInfo] = useState(null)
  const [screenshots, setScreenshots] = useState([])
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState([])
  const [showCompare, setShowCompare] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const [qualityDetail, setQualityDetail] = useState(null)
  const [loadingQuality, setLoadingQuality] = useState(false)
  const [screenshotting, setScreenshotting] = useState(false)
  const [retakingId, setRetakingId] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [showAlerts, setShowAlerts] = useState(false)

  const firstCompareId = compareSelection[0] || null
  const secondCompareId = compareSelection[1] || null

  const loadData = async () => {
    try {
      const [urlRes, shotsRes, alertsRes] = await Promise.all([
        getUrl(id), getScreenshots(id), getAlerts({ url_id: id })
      ])
      setUrlInfo(urlRes.data)
      setScreenshots(shotsRes.data)
      setAlerts(alertsRes.data.filter(a => a.status === 'active'))
    } catch (err) {
      alert('加载失败: ' + err.message)
    }
  }

  useEffect(() => {
    setCompareSelection([])
    setShowCompare(false)
    setCompareMode(false)
    setPreviewImage(null)
    setQualityDetail(null)
    loadData()
  }, [id])

  const handleDelete = async (shot) => {
    if (!confirm(`确定删除此截图 (${dayjs(shot.created_at).format('YYYY-MM-DD HH:mm')})？`)) return
    try {
      await deleteScreenshot(shot.id)
      setCompareSelection(prev => prev.filter(id => id !== shot.id))
      loadData()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  const handleRetake = async (shot) => {
    if (!confirm(`确定重新截图？将立即执行新的截图。`)) return
    setRetakingId(shot.id)
    try {
      await retakeScreenshot(shot.id)
      loadData()
      alert('重新截图完成')
    } catch (err) {
      alert('重截图失败: ' + (err.response?.data?.error || err.message))
    } finally {
      setRetakingId(null)
    }
  }

  const handleTriggerScreenshot = async () => {
    setScreenshotting(true)
    try {
      await triggerScreenshot(id)
      loadData()
      alert('截图完成')
    } catch (err) {
      alert('截图失败: ' + (err.response?.data?.error || err.message))
    } finally {
      setScreenshotting(false)
    }
  }

  const handleShowQuality = async (shot) => {
    setLoadingQuality(true)
    setQualityDetail(null)
    try {
      const res = await getQualityChecks(shot.id)
      setQualityDetail(res.data)
    } catch (err) {
      alert('加载质量详情失败: ' + err.message)
    } finally {
      setLoadingQuality(false)
    }
  }

  const handleResolveAlert = async (alertId) => {
    try {
      await resolveAlert(alertId)
      loadData()
    } catch (err) {
      alert('处理告警失败: ' + err.message)
    }
  }

  const handleSelectCompare = (shotId) => {
    setCompareSelection(prev => {
      const idx = prev.indexOf(shotId)
      if (idx !== -1) {
        return prev.filter(id => id !== shotId)
      }
      if (prev.length === 0) {
        return [shotId]
      }
      if (prev.length === 1) {
        return [prev[0], shotId]
      }
      return [prev[1], shotId]
    })
  }

  const resetCompareSelection = () => {
    setCompareSelection([])
    setShowCompare(false)
    setCompareMode(false)
  }

  const startCompare = () => {
    if (compareSelection.length < 2) {
      alert('请选择两张截图进行对比')
      return
    }
    setShowCompare(true)
  }

  const groupedByDate = screenshots.reduce((acc, shot) => {
    const date = dayjs(shot.created_at).format('YYYY-MM-DD')
    if (!acc[date]) acc[date] = []
    acc[date].push(shot)
    return acc
  }, {})

  const firstShot = firstCompareId ? screenshots.find(s => s.id === firstCompareId) : null
  const secondShot = secondCompareId ? screenshots.find(s => s.id === secondCompareId) : null

  const orderedShots = firstShot && secondShot
    ? dayjs(firstShot.created_at).isBefore(secondShot.created_at)
      ? [firstShot, secondShot]
      : [secondShot, firstShot]
    : null

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
          <h2 className="text-xl font-semibold text-gray-800">
            {urlInfo?.name || '加载中...'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5 truncate">{urlInfo?.url}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAlerts(!showAlerts)}
            className={`px-4 py-2 rounded-lg text-sm ${
              alerts.length > 0 ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            告警 {alerts.length > 0 && `(${alerts.length})`}
          </button>
          <button
            onClick={() => navigate(`/url/${id}/quality`)}
            className="bg-purple-50 text-purple-700 px-4 py-2 rounded-lg text-sm hover:bg-purple-100"
          >
            质量报告
          </button>
          <button
            onClick={() => navigate(`/url/${id}/config`)}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
          >
            质量配置
          </button>
          <button
            onClick={handleTriggerScreenshot}
            disabled={screenshotting}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {screenshotting ? '截图中...' : '立即截图'}
          </button>
        </div>
      </div>

      {showAlerts && alerts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4 mb-6">
          <h3 className="text-md font-medium text-red-800 mb-3">当前告警</h3>
          <div className="space-y-2">
            {alerts.map(a => (
              <div key={a.id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_LABELS[a.severity]?.class || 'bg-gray-100 text-gray-800'}`}>
                      {SEVERITY_LABELS[a.severity]?.label || a.severity}
                    </span>
                    <span className="text-sm font-medium text-red-800">
                      {ALERT_TYPE_LABELS[a.alert_type] || a.alert_type}
                    </span>
                    <span className="text-xs text-gray-500">
                      {dayjs(a.created_at).format('YYYY-MM-DD HH:mm')}
                    </span>
                  </div>
                  <div className="text-sm text-red-600 mt-1">{a.message}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleTriggerScreenshot}
                    className="text-xs bg-white text-gray-700 px-3 py-1 rounded hover:bg-gray-50 border"
                  >
                    重新截图
                  </button>
                  <button
                    onClick={() => handleResolveAlert(a.id)}
                    className="text-xs bg-green-50 text-green-700 px-3 py-1 rounded hover:bg-green-100 border border-green-200"
                  >
                    标记已处理
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            共 <span className="font-medium text-gray-900">{screenshots.length}</span> 张截图
          </div>
          {compareMode ? (
            <div className="flex gap-2">
              <span className="text-sm text-gray-500 py-1.5">
                已选: {compareSelection.length} / 2
                {compareSelection.length === 2 && ' (再点将替换较早的那张)'}
              </span>
              <button
                onClick={startCompare}
                disabled={compareSelection.length < 2}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                开始对比
              </button>
              <button
                onClick={resetCompareSelection}
                className="bg-gray-100 text-gray-700 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-200"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (screenshots.length < 2) {
                  alert('至少需要两张截图才能对比')
                  return
                }
                setCompareSelection([])
                setShowCompare(false)
                setCompareMode(true)
              }}
              className="bg-blue-50 text-blue-700 px-4 py-1.5 rounded-lg text-sm hover:bg-blue-100"
            >
              对比模式
            </button>
          )}
        </div>
      </div>

      {screenshots.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          暂无截图，等待首次执行或点击右上角"立即截图"
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedByDate).map(([date, shots]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-4">
                <div className="text-lg font-semibold text-gray-800">{date}</div>
                <div className="flex-1 h-px bg-gray-200"></div>
                <div className="text-sm text-gray-500">{shots.length} 张</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {shots.map((shot) => {
                  const isFirst = firstCompareId === shot.id
                  const isSecond = secondCompareId === shot.id
                  const imgUrl = getScreenshotUrl(shot.file_path)
                  const qInfo = getQualityLevelInfo(shot.quality_level)
                  const flagLabels = getQualityFlagLabels(shot.quality_flags)

                  return (
                    <div
                      key={shot.id}
                      className={`bg-white rounded-xl shadow-sm border-2 overflow-hidden transition-all ${
                        isFirst || isSecond
                          ? 'border-blue-500 ring-2 ring-blue-200'
                          : `${qInfo.borderClass} hover:shadow-md`
                      } ${compareMode ? 'cursor-pointer' : ''}`}
                      onClick={() => compareMode && handleSelectCompare(shot.id)}
                    >
                      <div
                        className="relative bg-gray-100 overflow-hidden"
                        style={{ aspectRatio: '16/9' }}
                        onClick={(e) => {
                          if (!compareMode) {
                            e.stopPropagation()
                            setPreviewImage({ src: imgUrl, time: shot.created_at })
                          }
                        }}
                      >
                        <img
                          src={imgUrl}
                          alt={`screenshot-${shot.id}`}
                          className="w-full h-full object-cover object-top"
                          loading="lazy"
                        />
                        {(isFirst || isSecond) && (
                          <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-medium px-2 py-0.5 rounded">
                            {isFirst ? '已选 1' : '已选 2'}
                          </div>
                        )}
                        <div className={`absolute top-2 right-2 text-xs font-medium px-2 py-0.5 rounded ${qInfo.bgClass} ${qInfo.textClass}`}>
                          {shot.quality_score !== null && shot.quality_score !== undefined
                            ? `${shot.quality_score}分`
                            : qInfo.label}
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-gray-700 font-medium">
                            {dayjs(shot.created_at).format('HH:mm:ss')}
                          </div>
                          {shot.file_size && (
                            <div className="text-xs text-gray-500">
                              {formatFileSize(shot.file_size)}
                            </div>
                          )}
                        </div>
                        {flagLabels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {flagLabels.map((label, i) => (
                              <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100">
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                        {!compareMode && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setPreviewImage({ src: imgUrl, time: shot.created_at })
                              }}
                              className="flex-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200"
                            >
                              查看
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleShowQuality(shot)
                              }}
                              className="flex-1 text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded hover:bg-purple-100"
                            >
                              质量
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRetake(shot)
                              }}
                              disabled={retakingId === shot.id}
                              className="flex-1 text-xs bg-green-50 text-green-700 px-2 py-1 rounded hover:bg-green-100 disabled:opacity-50"
                            >
                              {retakingId === shot.id ? '重拍中...' : '重拍'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(shot)
                              }}
                              className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded hover:bg-red-100"
                            >
                              删除
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex flex-col"
          onClick={() => setPreviewImage(null)}
        >
          <div className="bg-gray-900 px-6 py-4 flex justify-between items-center">
            <h3 className="text-white">
              {dayjs(previewImage.time).format('YYYY-MM-DD HH:mm:ss')}
            </h3>
            <button className="text-white hover:text-gray-300 text-2xl leading-none">×</button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-6">
            <img
              src={previewImage.src}
              alt="preview"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {qualityDetail && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setQualityDetail(null)}
        >
          <div
            className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
              <h3 className="text-lg font-semibold text-gray-800">质量检测详情</h3>
              <button onClick={() => setQualityDetail(null)} className="text-gray-500 hover:text-gray-700 text-xl">×</button>
            </div>
            {loadingQuality ? (
              <div className="p-12 text-center text-gray-500">加载中...</div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className={`text-3xl font-bold ${getQualityLevelInfo(qualityDetail.screenshot?.quality_level).textClass}`}>
                    {qualityDetail.screenshot?.quality_score ?? '-'}
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">综合分数</div>
                    <div className={`text-sm font-medium ${getQualityLevelInfo(qualityDetail.screenshot?.quality_level).textClass}`}>
                      {getQualityLevelInfo(qualityDetail.screenshot?.quality_level).label}
                    </div>
                  </div>
                  {qualityDetail.screenshot?.file_size && (
                    <div className="ml-auto text-right">
                      <div className="text-sm text-gray-600">文件大小</div>
                      <div className="text-sm font-medium text-gray-900">
                        {formatFileSize(qualityDetail.screenshot.file_size)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {qualityDetail.checks?.map((check) => (
                    <div key={check.id} className={`p-3 rounded-lg border ${
                      check.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                            check.passed ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                          }`}>
                            {check.passed ? '✓' : '✗'}
                          </span>
                          <span className="font-medium text-gray-800">
                            {QUALITY_FLAG_LABELS[check.check_type] || check.check_name}
                          </span>
                        </div>
                        {check.score_deduction > 0 && (
                          <span className="text-sm font-medium text-red-700">-{check.score_deduction}分</span>
                        )}
                      </div>
                      {check.details && (
                        <div className="mt-2 text-xs text-gray-600 bg-white p-2 rounded border overflow-x-auto">
                          <pre className="whitespace-pre-wrap break-all">{check.details}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      setQualityDetail(null)
                      if (qualityDetail.screenshot) {
                        handleRetake(qualityDetail.screenshot)
                      }
                    }}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
                  >
                    一键重新截图
                  </button>
                  <button
                    onClick={() => setQualityDetail(null)}
                    className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200"
                  >
                    关闭
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showCompare && orderedShots && (
        <ImageCompare
          beforeImage={getScreenshotUrl(orderedShots[0].file_path)}
          afterImage={getScreenshotUrl(orderedShots[1].file_path)}
          beforeLabel={dayjs(orderedShots[0].created_at).format('YYYY-MM-DD HH:mm:ss')}
          afterLabel={dayjs(orderedShots[1].created_at).format('YYYY-MM-DD HH:mm:ss')}
          onClose={resetCompareSelection}
        />
      )}
    </div>
  )
}
