import type { Livestream, LivestreamSource, StreamPlatform } from '@components/types'

export const STORAGE_KEY = 'livegrid_projects_v1'
export const ACTIVE_PROJECT_STORAGE_KEY = 'livegrid_active_project_v1'
export const LEGACY_STREAMS_KEY = 'youtube_livestreams'
export const REFRESH_INTERVAL_MS = 60_000

export type StoredLivestream = Omit<Livestream, 'videoId'>
export type AddChannelRequest = { title: string; sources: string[] }

export interface LiveGridProject {
  id: string
  name: string
  livestreams: Livestream[]
  createdAt: string
}

export interface StoredProject {
  id: string
  name: string
  livestreams: StoredLivestream[]
  createdAt: string
}

export interface ParsedStreamInput {
  platform: StreamPlatform
  channelRef: string
  normalizedUrl: string
}

export interface LiveCheckResult {
  videoId?: string | undefined | null
  consentRequired?: boolean
  isLive: boolean
  uncertain?: boolean
}

export interface ParsedSourceRef {
  entryIndex: number
  rawRef: string
  platform: StreamPlatform
  normalizedUrl: string
  channelRef: string
}

export interface SharedPresetPayload {
  name?: string
  channels?: string[]
  entries?: Array<{ title?: string; sources: string[] }>
}

export interface SharedPreviewProject {
  name: string
  livestreams: Livestream[]
}

export const createId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const toBase64UrlUtf8 = (value: string): string => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export const fromBase64UrlUtf8 = (value: string): string => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const normalized = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export const parseSharedPresetParam = (raw: string): SharedPresetPayload | null => {
  const tryParseJson = (value: string): SharedPresetPayload | null => {
    try {
      const parsed = JSON.parse(value) as SharedPresetPayload
      if (!parsed || typeof parsed !== 'object') return null
      return parsed
    } catch {
      return null
    }
  }

  const direct = tryParseJson(raw)
  if (direct) return direct

  try {
    const decoded = fromBase64UrlUtf8(raw)
    return tryParseJson(decoded)
  } catch {
    return null
  }
}

export const payloadToEntries = (payload: SharedPresetPayload): AddChannelRequest[] => {
  if (Array.isArray(payload.entries)) {
    return payload.entries
      .filter((entry) => Array.isArray(entry.sources) && entry.sources.length > 0)
      .map((entry) => ({ title: entry.title?.trim() || '', sources: entry.sources }))
  }

  if (Array.isArray(payload.channels)) {
    return payload.channels.map((channel) => ({ title: '', sources: [channel] }))
  }

  return []
}

export const parseStreamInput = (input: string): ParsedStreamInput | null => {
  const raw = input.trim()
  if (!raw) return null

  const twitchPrefixed = raw.match(/^twitch:([a-zA-Z0-9_]{3,30})$/i)
  if (twitchPrefixed?.[1]) {
    const channel = twitchPrefixed[1].toLowerCase()
    return {
      platform: 'twitch',
      channelRef: channel,
      normalizedUrl: `https://www.twitch.tv/${channel}`
    }
  }

  const kickPrefixed = raw.match(/^kick:([a-zA-Z0-9_-]{3,40})$/i)
  if (kickPrefixed?.[1]) {
    const channel = kickPrefixed[1].toLowerCase()
    return {
      platform: 'kick',
      channelRef: channel,
      normalizedUrl: `https://kick.com/${channel}`
    }
  }

  const twitchUrl = raw.match(
    /^https?:\/\/(?:www\.)?twitch\.tv\/([a-zA-Z0-9_]{3,30})(?:[/?#].*)?$/i
  )
  if (twitchUrl?.[1]) {
    const channel = twitchUrl[1].toLowerCase()
    return {
      platform: 'twitch',
      channelRef: channel,
      normalizedUrl: `https://www.twitch.tv/${channel}`
    }
  }

  const kickUrl = raw.match(/^https?:\/\/(?:www\.)?kick\.com\/([a-zA-Z0-9_-]{3,40})(?:[/?#].*)?$/i)
  if (kickUrl?.[1]) {
    const channel = kickUrl[1].toLowerCase()
    return {
      platform: 'kick',
      channelRef: channel,
      normalizedUrl: `https://kick.com/${channel}`
    }
  }

  return {
    platform: 'youtube',
    channelRef: raw,
    normalizedUrl: raw
  }
}

export const fallbackTitleFromUrl = (url: string): string => {
  const atMatch = url.match(/@([a-zA-Z0-9_-]+)/)
  if (atMatch?.[1]) return atMatch[1]

  const twitchMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/i)
  if (twitchMatch?.[1]) return twitchMatch[1]

  const kickMatch = url.match(/kick\.com\/([a-zA-Z0-9_-]+)/i)
  if (kickMatch?.[1]) return kickMatch[1]

  const channelMatch = url.match(/\/(channel|c)\/([a-zA-Z0-9_-]+)/)
  if (channelMatch?.[2]) return channelMatch[2]

  return 'Channel'
}

export const sourceLabel = (
  source: Pick<LivestreamSource, 'platform' | 'channelId' | 'channelUrl'>
): string => {
  const platform = source.platform
  const channel = source.channelId || fallbackTitleFromUrl(source.channelUrl)
  return `${platform}:${channel.toLowerCase()}`
}

export const sourceBatchKey = (
  source: Pick<LivestreamSource, 'platform' | 'channelId' | 'channelUrl'>
): string => {
  const channel = source.channelId || fallbackTitleFromUrl(source.channelUrl)
  return `${source.platform}:${channel.toLowerCase()}`
}

const normalizeIdentity = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const stripCommonSuffixes = (value: string): string[] => {
  const variants = new Set<string>([value])
  const suffixes = ['kick', 'twitch', 'youtube', 'yt', 'live', 'oficial', 'official']

  for (const suffix of suffixes) {
    if (value.endsWith(suffix) && value.length > suffix.length + 2) {
      variants.add(value.slice(0, -suffix.length))
    }
  }

  return Array.from(variants).filter(Boolean)
}

const streamIdentityKeys = (stream: Livestream): Set<string> => {
  const normalized = normalizeLivestream(stream)
  const keys = new Set<string>()

  const candidates = new Set<string>([normalized.title])
  for (const source of normalized.sources ?? []) {
    if (source.channelId) candidates.add(source.channelId)
    candidates.add(fallbackTitleFromUrl(source.channelUrl))
    candidates.add(source.channelUrl)
  }

  for (const candidate of candidates) {
    const base = normalizeIdentity(candidate)
    if (!base) continue
    for (const variant of stripCommonSuffixes(base)) {
      keys.add(variant)
    }
  }

  return keys
}

const hasStreamIdentityOverlap = (a: Livestream, b: Livestream): boolean => {
  const aKeys = streamIdentityKeys(a)
  const bKeys = streamIdentityKeys(b)
  for (const key of aKeys) {
    if (bKeys.has(key)) return true
  }
  return false
}

const mergeLivestreamPair = (existing: Livestream, incoming: Livestream): Livestream => {
  const existingSources = normalizeLivestream(existing).sources ?? []
  const incomingSources = normalizeLivestream(incoming).sources ?? []
  const mergedByLabel = new Map<string, LivestreamSource>()
  for (const source of [...existingSources, ...incomingSources]) {
    mergedByLabel.set(sourceLabel(source), source)
  }
  return rebuildLivestreamWithSources(
    existing,
    Array.from(mergedByLabel.values()),
    existing.activeSourceId
  )
}

export const mergeLivestreamList = (streams: Livestream[]): Livestream[] => {
  const merged: Livestream[] = []

  for (const stream of streams) {
    const normalized = normalizeLivestream(stream)
    const existingIndex = merged.findIndex((candidate) =>
      hasStreamIdentityOverlap(candidate, normalized)
    )
    if (existingIndex === -1) {
      merged.push(normalized)
      continue
    }
    merged[existingIndex] = mergeLivestreamPair(merged[existingIndex], normalized)
  }

  return merged
}

const toSource = (stream: Livestream): LivestreamSource => ({
  sourceId: stream.activeSourceId || createId(),
  platform: stream.platform ?? 'youtube',
  channelUrl: stream.channelUrl,
  channelId: stream.channelId,
  videoId: stream.videoId,
  consentRequired: stream.consentRequired,
  isLive: stream.isLive
})

export const normalizeLivestream = (stream: Livestream): Livestream => {
  const legacySource = toSource(stream)
  const byLabel = new Map<string, LivestreamSource>()

  const allSources = [...(stream.sources ?? []), legacySource]
  for (const source of allSources) {
    const normalized: LivestreamSource = {
      sourceId: source.sourceId || createId(),
      platform: source.platform,
      channelUrl: source.channelUrl,
      channelId: source.channelId,
      videoId: source.videoId,
      consentRequired: source.consentRequired,
      isLive: source.isLive
    }
    byLabel.set(sourceLabel(normalized), normalized)
  }

  const sources = Array.from(byLabel.values())
  const activeSource =
    sources.find((source) => source.sourceId === stream.activeSourceId) ||
    sources[0] ||
    legacySource

  return {
    ...stream,
    platform: activeSource.platform,
    channelUrl: activeSource.channelUrl,
    channelId: activeSource.channelId,
    videoId: activeSource.videoId,
    consentRequired: activeSource.consentRequired,
    isLive: activeSource.isLive,
    activeSourceId: activeSource.sourceId,
    sources
  }
}

export const rebuildLivestreamWithSources = (
  stream: Livestream,
  sources: LivestreamSource[],
  preferredSourceId?: string
): Livestream => {
  const normalizedSources = sources.map((source) => ({
    ...source,
    sourceId: source.sourceId || createId()
  }))
  const activeSource =
    normalizedSources.find((source) => source.sourceId === preferredSourceId) ||
    normalizedSources.find((source) => source.isLive) ||
    normalizedSources[0]

  if (!activeSource) return stream

  return normalizeLivestream({
    ...stream,
    activeSourceId: activeSource.sourceId,
    platform: activeSource.platform,
    channelUrl: activeSource.channelUrl,
    channelId: activeSource.channelId,
    videoId: activeSource.videoId,
    consentRequired: activeSource.consentRequired,
    isLive: activeSource.isLive,
    sources: normalizedSources
  })
}

export const deserializeProjects = (raw: string | null): LiveGridProject[] => {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as StoredProject[]
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((project) => project?.id && project?.name)
      .map((project) => ({
        id: project.id,
        name: project.name,
        createdAt: project.createdAt || new Date().toISOString(),
        livestreams: mergeLivestreamList(
          Array.isArray(project.livestreams)
            ? project.livestreams.map((stream) =>
                normalizeLivestream({
                  ...stream,
                  platform: stream.platform ?? 'youtube',
                  videoId: undefined,
                  sources: stream.sources?.map((source) => ({
                    ...source,
                    videoId: undefined
                  }))
                })
              )
            : []
        )
      }))
  } catch {
    return []
  }
}

export const serializeProjects = (projects: LiveGridProject[]): StoredProject[] =>
  projects.map((project) => ({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    livestreams: project.livestreams.map(({ videoId, sources, ...stored }) => {
      void videoId
      return {
        ...stored,
        sources: sources?.map(({ videoId: sourceVideoId, ...sourceStored }) => {
          void sourceVideoId
          return sourceStored
        })
      }
    })
  }))
