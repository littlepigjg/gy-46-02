import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export const getUrls = () => api.get('/urls')
export const addUrl = (data) => api.post('/urls', data)
export const deleteUrl = (id) => api.delete(`/urls/${id}`)
export const updateUrl = (id, data) => api.put(`/urls/${id}`, data)
export const getUrl = (id) => api.get(`/urls/${id}`)
export const getScreenshots = (urlId) => api.get(`/urls/${urlId}/screenshots`)
export const deleteScreenshot = (id) => api.delete(`/screenshots/${id}`)
export const triggerScreenshot = (urlId) => api.post(`/urls/${urlId}/screenshot`)

export const getQualityConfig = (urlId) => api.get(`/urls/${urlId}/quality-config`)
export const updateQualityConfig = (urlId, data) => api.put(`/urls/${urlId}/quality-config`, data)
export const getQualityReport = (urlId, limit = 50) => api.get(`/urls/${urlId}/quality-report`, { params: { limit } })
export const getQualityChecks = (screenshotId) => api.get(`/screenshots/${screenshotId}/quality-checks`)
export const retakeScreenshot = (screenshotId) => api.post(`/screenshots/${screenshotId}/retake`)

export const getAlerts = (params = {}) => api.get('/alerts', { params })
export const resolveAlert = (alertId) => api.put(`/alerts/${alertId}/resolve`)
export const getQualityDefaults = () => api.get('/quality-defaults')

export default api
