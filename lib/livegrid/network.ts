import type { LivestreamSource } from '@components/types'
import { sourceBatchKey, type LiveCheckResult } from '@lib/livegrid/domain'

export const fetchLiveStatusesBatchRequest = async (
  sources: LivestreamSource[]
): Promise<Map<string, LiveCheckResult>> => {
  const uniqueByKey = new Map<string, LivestreamSource>()
  for (const source of sources) {
    uniqueByKey.set(sourceBatchKey(source), source)
  }
  if (uniqueByKey.size === 0) {
    return new Map()
  }

  const response = await fetch('/api/live-status-batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sources: Array.from(uniqueByKey.entries()).map(([key, source]) => ({
        key,
        platform: source.platform,
        channelId: source.channelId,
        channelUrl: source.channelUrl
      }))
    })
  })

  const data = (await response.json()) as {
    results?: Array<{
      key: string
      live?: boolean
      videoId?: string
      consentRequired?: boolean
      uncertain?: boolean
    }>
  }

  if (!response.ok || !Array.isArray(data.results)) {
    throw new Error('Failed to check live status batch')
  }

  const resultMap = new Map<string, LiveCheckResult>()
  for (const item of data.results) {
    resultMap.set(item.key, {
      isLive: Boolean(item.live),
      videoId: item.videoId,
      consentRequired: item.consentRequired,
      uncertain: item.uncertain
    })
  }
  return resultMap
}

export const resolveChannelsBatchRequest = async (
  urls: string[]
): Promise<Map<string, { channelId: string; title?: string; avatarUrl?: string }>> => {
  if (urls.length === 0) return new Map()

  const response = await fetch('/api/resolve-channel-batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ urls })
  })
  const data = (await response.json()) as {
    results?: Array<{
      url: string
      normalizedUrl?: string
      ok: boolean
      channelId?: string
      title?: string
      avatarUrl?: string
    }>
  }

  if (!response.ok || !Array.isArray(data.results)) {
    throw new Error('Failed to resolve channels batch')
  }

  const map = new Map<string, { channelId: string; title?: string; avatarUrl?: string }>()
  for (const item of data.results) {
    if (!item.ok || !item.channelId) continue
    map.set(item.url, { channelId: item.channelId, title: item.title, avatarUrl: item.avatarUrl })
    if (item.normalizedUrl) {
      map.set(item.normalizedUrl, { channelId: item.channelId, title: item.title, avatarUrl: item.avatarUrl })
    }
  }
  return map
}
