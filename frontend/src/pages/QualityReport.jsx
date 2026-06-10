import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getUrl, getQualityReport, triggerScreenshot } from '../api.js'
import {
  getQualityLevelInfo, getQualityFlagLabels, formatFileSize,
  QUALITY_LEVELS, QUALITY_FLAG_LABELS
} from '../utils/quality.js'

export default function QualityReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [urlInfo, setUrlInfo] = useState(null)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [screenshotting, setScreenshotting] = useState(false)

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [urlRes, repRes] = await Promise.all([
        getUrl(id), getQualityReport(id, 100)
      ])
      setUrlInfo(urlRes.data)
      setReport(repRes.data)
    } catch (err) {
      alert('加载失败: ' + err.message)
    } finally {
      setLoading(false)
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
        加载中...
      </div>
    )
  }

  const dist = report?.distribution || { good: 0, fair: 0, poor: 0, bad: 0 }
  const total = report?.total || 0

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
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-800">质量趋势报告</h2>
          <p className="text-sm text-gray-500 mt-0.5">{urlInfo?.name} - {urlInfo?.url}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/url/${id}/config`)}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
          >
            质量配置
          </button>
          <button
            onClick={() => navigate(`/url/${id}`)}
            className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm hover:bg-blue-100"
          >
            查看截图
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-sm text-gray-500">平均分</div>
          <div className={`text-3xl font-bold mt-1 ${
            report?.avgScore >= 90 ? 'text-green-600'
              : report?.avgScore >= 70 ? 'text-blue-600'
              : report?.avgScore >= 40 ? 'text-orange-600' : 'text-red-600'
          }`}>
            {report?.avgScore ?? '-'}
          </div>
          <div className="text-xs text-gray-400 mt-1">基于最近 {total} 张截图</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-sm text-gray-500">截图总数</div>
          <div className="text-3xl font-bold mt-1 text-gray-800">{total}</div>
          <div className="text-xs text-gray-400 mt-1">历史累计</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-sm text-gray-500">连续异常</div>
          <div className={`text-3xl font-bold mt-1 ${
            (report?.consecutiveBad || 0) > 0 ? 'text-red-600' : 'text-green-600'
          }`}>
            {report?.consecutiveBad || 0}
          </div>
          <div className="text-xs text-gray-400 mt-1">张低质量截图</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-sm text-gray-500">优质率</div>
          <div className="text-3xl font-bold mt-1 text-green-600">
            {total > 0 ? Math.round((dist.good + dist.fair) / total * 100) : 0}%
          </div>
          <div className="text-xs text-gray-400 mt-1">优秀 + 良好</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-md font-semibold text-gray-800 mb-4">质量分布</h3>
          <div className="space-y-3">
            {Object.entries(QUALITY_LEVELS).map(([level, info]) => {
              const count = dist[level] || 0
              const percent = total > 0 ? Math.round(count / total * 100) : 0
              return (
                <div key={level}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className={`font-medium ${info.textClass}`}>{info.label}</span>
                    <span className="text-gray-600">{count} 张 ({percent}%)</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${info.bgClass.replace('100', '500')}`}
                      style={{ width: `${percent}%` }}
                    ></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-md font-semibold text-gray-800 mb-4">问题类型统计</h3>
          {report?.flagStats && Object.keys(report.flagStats).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(report.flagStats)
                .sort((a, b) => b[1] - a[1])
                .map(([flag, count]) => {
                  const percent = total > 0 ? Math.round(count / total * 100) : 0
                  return (
                    <div key={flag}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-red-700">
                          {QUALITY_FLAG_LABELS[flag] || flag}
                        </span>
                        <span className="text-gray-600">{count} 次 ({percent}%)</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-400"
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              暂无质量问题记录
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-md font-semibold text-gray-800 mb-4">质量趋势 (最近截图)</h3>
        {report?.screenshots?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">时间</th>
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">分数</th>
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">等级</th>
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">大小</th>
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">问题</th>
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {report.screenshots.map((shot) => {
                  const qInfo = getQualityLevelInfo(shot.quality_level)
                  const flagLabels = getQualityFlagLabels(shot.quality_flags)
                  return (
                    <tr key={shot.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-700">
                        {dayjs(shot.created_at).format('YYYY-MM-DD HH:mm')}
                      </td>
                      <td className={`py-2 px-3 font-medium ${qInfo.textClass}`}>
                        {shot.quality_score ?? '-'}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${qInfo.bgClass} ${qInfo.textClass}`}>
                          {qInfo.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-600">
                        {formatFileSize(shot.file_size)}
                      </td>
                      <td className="py-2 px-3">
                        {flagLabels.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {flagLabels.map((l, i) => (
                              <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                                {l}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <button
                          onClick={() => navigate(`/url/${id}`)}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                        >
                          查看
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            暂无截图数据
          </div>
        )}
      </div>
    </div>
  )
}
