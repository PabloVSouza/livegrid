'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { URLInput } from './URLInput'
import { LivestreamGrid } from './LivestreamGrid'
import type { Livestream, LivestreamSource, StreamPlatform } from './types'
import { I18nProvider, localeLabels, useI18n } from './i18n'
import { AboutModal } from './AboutModal'
import { WelcomeScreen } from './WelcomeScreen'
import { LIVEGRID_PRESETS, type PresetDefinition } from '@/data/presets'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CirclePlus, House, Info, Languages } from 'lucide-react'

const STORAGE_KEY = 'livegrid_projects_v1'
const ACTIVE_PROJECT_STORAGE_KEY = 'livegrid_active_project_v1'
const LEGACY_STREAMS_KEY = 'youtube_livestreams'
const REFRESH_INTERVAL_MS = 60_000

type StoredLivestream = Omit<Livestream, 'videoId'>
type AddChannelRequest = { title: string; sources: string[] }

interface LiveGridProject {
  id: string
  name: string
  livestreams: Livestream[]
  createdAt: string
}

interface StoredProject {
  id: string
  name: string
  livestreams: StoredLivestream[]
  createdAt: string
}

const createId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

interface ParsedStreamInput {
  platform: StreamPlatform
  channelRef: string
  normalizedUrl: string
}

interface LiveCheckResult {
  videoId?: string | undefined | null
  consentRequired?: boolean
  isLive: boolean
}

const parseStreamInput = (input: string): ParsedStreamInput | null => {
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

  const twitchUrl = raw.match(/^https?:\/\/(?:www\.)?twitch\.tv\/([a-zA-Z0-9_]{3,30})(?:[/?#].*)?$/i)
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

const fallbackTitleFromUrl = (url: string): string => {
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

const sourceLabel = (source: Pick<LivestreamSource, 'platform' | 'channelId' | 'channelUrl'>): string => {
  const platform = source.platform
  const channel = source.channelId || fallbackTitleFromUrl(source.channelUrl)
  return `${platform}:${channel.toLowerCase()}`
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

const mergeLivestreamList = (streams: Livestream[]): Livestream[] => {
  const merged: Livestream[] = []

  for (const stream of streams) {
    const normalized = normalizeLivestream(stream)
    const existingIndex = merged.findIndex((candidate) => hasStreamIdentityOverlap(candidate, normalized))
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

const normalizeLivestream = (stream: Livestream): Livestream => {
  const legacySource = toSource(stream)
  const byLabel = new Map<string, LivestreamSource>()

  const allSources = [legacySource, ...(stream.sources ?? [])]
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
    sources.find((source) => source.sourceId === stream.activeSourceId) || sources[0] || legacySource

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

const rebuildLivestreamWithSources = (
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

const deserializeProjects = (raw: string | null): LiveGridProject[] => {
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

const serializeProjects = (projects: LiveGridProject[]): StoredProject[] =>
  projects.map((project) => ({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    livestreams: project.livestreams.map(({ videoId: _videoId, sources, ...stored }) => ({
      ...stored,
      sources: sources?.map(({ videoId: _sourceVideoId, ...sourceStored }) => sourceStored)
    }))
  }))

function AppClientContent() {
  const { t, locale, setLocale, locales } = useI18n()
  const [projects, setProjects] = useState<LiveGridProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isImportingPresetId, setIsImportingPresetId] = useState<string | null>(null)
  const projectsRef = useRef<LiveGridProject[]>(projects)

  useEffect(() => {
    projectsRef.current = projects
  }, [projects])

  useEffect(() => {
    const loadedProjects = deserializeProjects(
      typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    )
    const storedActiveProjectId =
      typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY) : null

    if (loadedProjects.length > 0) {
      setProjects(loadedProjects)
      const activeExists = storedActiveProjectId
        ? loadedProjects.some((project) => project.id === storedActiveProjectId)
        : false
      if (activeExists && storedActiveProjectId) {
        setActiveProjectId(storedActiveProjectId)
      }
      setIsHydrated(true)
      return
    }

    if (typeof window !== 'undefined') {
      const legacyRaw = localStorage.getItem(LEGACY_STREAMS_KEY)
      if (legacyRaw) {
        try {
          const legacy = JSON.parse(legacyRaw) as StoredLivestream[]
          if (Array.isArray(legacy) && legacy.length > 0) {
            const migratedProject: LiveGridProject = {
              id: createId(),
              name: 'Migrated Project',
              createdAt: new Date().toISOString(),
              livestreams: legacy.map((stream) =>
                normalizeLivestream({ ...stream, videoId: undefined })
              )
            }
            setProjects([migratedProject])
            setActiveProjectId(migratedProject.id)
          }
        } catch {
          // ignore legacy migration issues
        }
      }
    }

    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProjects(projects)))
  }, [projects, isHydrated])

  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') return
    if (activeProjectId) {
      localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, activeProjectId)
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY)
    }
  }, [activeProjectId, isHydrated])

  useEffect(() => {
    if (!activeProjectId) return
    const exists = projects.some((project) => project.id === activeProjectId)
    if (!exists) {
      setActiveProjectId(null)
    }
  }, [projects, activeProjectId])

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  )
  const projectPreviews = useMemo(
    () =>
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        channelsCount: project.livestreams.length
      })),
    [projects]
  )

  const activeLivestreams = activeProject?.livestreams ?? []

  const resolveChannel = async (
    channelUrl: string
  ): Promise<{ channelId: string; title?: string }> => {
    const response = await fetch(`/api/resolve-channel?url=${encodeURIComponent(channelUrl)}`)
    const data = (await response.json()) as { channelId?: string; title?: string; error?: string }

    if (!response.ok || !data.channelId) {
      throw new Error(data.error || 'Could not resolve channel')
    }

    return { channelId: data.channelId, title: data.title }
  }

  const fetchCurrentLiveVideoId = async (channelId: string): Promise<LiveCheckResult> => {
    try {
      const response = await fetch(`/api/channel-live?channelId=${encodeURIComponent(channelId)}`)
      const data = (await response.json()) as {
        live?: boolean
        uncertain?: boolean
        videoId?: string
        consentRequired?: boolean
        error?: string
      }
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check channel live status')
      }
      if (data.consentRequired) {
        return { videoId: undefined, consentRequired: true, isLive: false }
      }
      if (data.uncertain) {
        return { videoId: null, isLive: false }
      }
      return { videoId: data.live ? data.videoId : undefined, isLive: Boolean(data.live && data.videoId) }
    } catch (error) {
      console.warn('Live status check inconclusive:', channelId, error)
      return { videoId: null, isLive: false }
    }
  }

  const fetchPlatformLiveStatus = async (
    platform: Exclude<StreamPlatform, 'youtube'>,
    channelRef: string
  ): Promise<LiveCheckResult> => {
    try {
      const response = await fetch(
        `/api/platform-live?platform=${encodeURIComponent(platform)}&channel=${encodeURIComponent(channelRef)}`
      )
      const data = (await response.json()) as {
        live?: boolean
        uncertain?: boolean
        error?: string
      }
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check channel live status')
      }
      if (data.uncertain) {
        return { videoId: null, isLive: false }
      }
      return { isLive: Boolean(data.live) }
    } catch (error) {
      console.warn('Live status check inconclusive:', platform, channelRef, error)
      return { videoId: null, isLive: false }
    }
  }

  const checkSourceLive = async (source: LivestreamSource): Promise<LivestreamSource> => {
    if (source.platform === 'youtube') {
      if (!source.channelId) return { ...source, isLive: false, videoId: undefined }
      const liveResult = await fetchCurrentLiveVideoId(source.channelId)
      if (liveResult.videoId === null) {
        return source
      }
      return {
        ...source,
        videoId: liveResult.videoId,
        consentRequired: liveResult.consentRequired,
        isLive: liveResult.isLive
      }
    }

    const channelRef = source.channelId || fallbackTitleFromUrl(source.channelUrl)
    const result = await fetchPlatformLiveStatus(source.platform, channelRef)
    if (result.videoId === null) return source
    return {
      ...source,
      videoId: undefined,
      consentRequired: false,
      isLive: result.isLive
    }
  }

  const createSource = async (
    channelUrl: string
  ): Promise<{ source: LivestreamSource; resolvedTitle?: string }> => {
    const parsed = parseStreamInput(channelUrl)
    if (!parsed) {
      throw new Error('Invalid channel input')
    }

    if (parsed.platform === 'youtube') {
      const resolved = await resolveChannel(parsed.normalizedUrl)
      const liveResult = await fetchCurrentLiveVideoId(resolved.channelId)

      return {
        resolvedTitle: resolved.title,
        source: {
          sourceId: createId(),
          platform: 'youtube',
          channelUrl: parsed.normalizedUrl,
          channelId: resolved.channelId,
          videoId: liveResult.videoId ?? undefined,
          consentRequired: liveResult.consentRequired,
          isLive: liveResult.isLive
        }
      }
    }

    const liveResult = await fetchPlatformLiveStatus(parsed.platform, parsed.channelRef)

    return {
      source: {
        sourceId: createId(),
        platform: parsed.platform,
        channelUrl: parsed.normalizedUrl,
        channelId: parsed.channelRef,
        isLive: liveResult.isLive
      }
    }
  }

  const createLivestream = async (entry: AddChannelRequest): Promise<Livestream> => {
    const refs = entry.sources.map((value) => value.trim()).filter(Boolean)
    if (refs.length === 0) {
      throw new Error('No channel source provided')
    }

    const builtSources: LivestreamSource[] = []
    let resolvedTitle = entry.title.trim()

    for (const ref of refs) {
      const built = await createSource(ref)
      if (!resolvedTitle && built.resolvedTitle) {
        resolvedTitle = built.resolvedTitle
      }
      builtSources.push(built.source)
    }

    const firstSource = builtSources[0]
    const initialTitle = resolvedTitle || fallbackTitleFromUrl(firstSource.channelUrl)
    const liveFirst = builtSources.find((source) => source.isLive) || firstSource

    return normalizeLivestream({
      id: createId(),
      title: initialTitle,
      platform: liveFirst.platform,
      channelUrl: liveFirst.channelUrl,
      channelId: liveFirst.channelId,
      videoId: liveFirst.videoId,
      consentRequired: liveFirst.consentRequired,
      isLive: liveFirst.isLive,
      activeSourceId: liveFirst.sourceId,
      sources: builtSources
    })
  }

  const updateActiveProjectLivestreams = (updater: (current: Livestream[]) => Livestream[]) => {
    if (!activeProjectId) return

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== activeProjectId) return project
        return { ...project, livestreams: updater(project.livestreams) }
      })
    )
  }

  const addLivestreams = async (entries: AddChannelRequest[]) => {
    if (!activeProjectId) return

    const created: Livestream[] = []

    for (const entry of entries) {
      try {
        const stream = await createLivestream(entry)
        created.push(stream)
      } catch (error) {
        console.error('Failed to add channel group:', entry, error)
      }
    }

    if (created.length === 0) return

    updateActiveProjectLivestreams((current) => {
      return mergeLivestreamList([...current, ...created])
    })
  }

  const selectLivestreamSource = (livestreamId: string, sourceId: string) => {
    updateActiveProjectLivestreams((current) =>
      current.map((stream) => {
        if (stream.id !== livestreamId) return stream
        const normalized = normalizeLivestream(stream)
        const selected = normalized.sources?.find((source) => source.sourceId === sourceId)
        if (!selected) return stream
        return rebuildLivestreamWithSources(normalized, normalized.sources ?? [], selected.sourceId)
      })
    )
  }

  const removeLivestream = (id: string) => {
    updateActiveProjectLivestreams((current) => current.filter((stream) => stream.id !== id))
  }

  const deleteProject = (projectId: string) => {
    setProjects((prev) => prev.filter((project) => project.id !== projectId))
    setActiveProjectId((prev) => (prev === projectId ? null : prev))
  }

  useEffect(() => {
    if (!isHydrated || !activeProjectId || activeLivestreams.length === 0) {
      return
    }

    let cancelled = false

    const refreshLiveStatuses = async () => {
      const snapshot =
        projectsRef.current.find((project) => project.id === activeProjectId)?.livestreams ?? []

      const refreshed = await Promise.all(
        snapshot.map(async (stream) => {
          const normalized = normalizeLivestream(stream)
          const currentSources = normalized.sources ?? []
          const refreshedSources = await Promise.all(currentSources.map((source) => checkSourceLive(source)))
          const previousActive = refreshedSources.find(
            (source) => source.sourceId === normalized.activeSourceId
          )
          const activeId = previousActive?.isLive
            ? previousActive.sourceId
            : refreshedSources.find((source) => source.isLive)?.sourceId || normalized.activeSourceId

          return rebuildLivestreamWithSources(normalized, refreshedSources, activeId)
        })
      )

      if (cancelled) return

      const refreshedById = new Map(refreshed.map((stream) => [stream.id, stream]))
      setProjects((prev) =>
        prev.map((project) => {
          if (project.id !== activeProjectId) return project
          return {
            ...project,
            livestreams: project.livestreams.map((stream) => refreshedById.get(stream.id) ?? stream)
          }
        })
      )
    }

    void refreshLiveStatuses()
    const intervalId = window.setInterval(() => {
      void refreshLiveStatuses()
    }, REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [activeProjectId, activeLivestreams.length, isHydrated])

  const createBlankProject = () => {
    const project: LiveGridProject = {
      id: createId(),
      name: `${t('app.newProject')} ${projects.length + 1}`,
      createdAt: new Date().toISOString(),
      livestreams: []
    }

    setProjects((prev) => [project, ...prev])
    setActiveProjectId(project.id)
  }

  const importPresetProject = async (preset: PresetDefinition) => {
    setIsImportingPresetId(preset.id)

    try {
      const streams: Livestream[] = []
      for (const channel of preset.channels) {
        try {
          const stream = await createLivestream({ title: '', sources: [channel] })
          streams.push(stream)
        } catch (error) {
          console.error('Failed to import preset channel:', channel, error)
        }
      }

      const project: LiveGridProject = {
        id: createId(),
        name: preset.name,
        createdAt: new Date().toISOString(),
        livestreams: mergeLivestreamList(streams)
      }

      setProjects((prev) => [project, ...prev])
      setActiveProjectId(project.id)
    } finally {
      setIsImportingPresetId(null)
    }
  }

  const localeShort = locale === 'pt-BR' ? 'PT' : locale.split('-')[0].toUpperCase()

  const isWelcomeMode = !activeProject

  return (
    <div className="w-screen h-screen bg-black text-white flex flex-col">
      <header className="bg-black border-b border-gray-800 px-3 py-2 flex items-center justify-between min-h-16 gap-2 overflow-hidden">
        <div className="min-w-0 flex-1">
          <img
            src="/livegrid-logo.svg"
            alt={t('app.title')}
            className="block h-6 sm:h-7 md:h-12 w-auto max-w-full object-contain bg-transparent border-0 shadow-none"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isWelcomeMode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setActiveProjectId(null)}
                  aria-label={t('app.projects')}
                  title={t('app.projects')}
                  className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
                >
                  <House className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('app.projects')}</TooltipContent>
            </Tooltip>
          )}

          {!isWelcomeMode && (
            <URLInput
              onAddMany={addLivestreams}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('input.addChannel')}
                  title={t('input.addChannel')}
                  className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
                >
                  <CirclePlus className="size-4" />
                </Button>
              }
            />
          )}

          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('app.language')}
                    className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
                  >
                    <span className="text-xs font-semibold">{localeShort}</span>
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{t('app.language')}</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-56 bg-gray-900 border-gray-700 p-1">
              <div className="max-h-72 overflow-auto">
                {locales.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setLocale(option)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition flex items-center justify-between ${
                      option === locale
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-300 hover:bg-gray-800/60'
                    }`}
                  >
                    <span>{localeLabels[option]}</span>
                    {option === locale ? <Languages className="size-4 text-blue-400" /> : null}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsAboutOpen(true)}
                aria-label={t('app.about')}
                className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
              >
                <Info className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('app.about')}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {isWelcomeMode ? (
          <WelcomeScreen
            title={t('welcome.title')}
            subtitle={t('welcome.subtitle')}
            createLabel={t('welcome.create')}
            projectsTitle={t('welcome.projects')}
            openProjectLabel={t('welcome.openProject')}
            deleteProjectLabel={t('welcome.deleteProject')}
            deleteProjectConfirm={t('welcome.deleteProjectConfirm')}
            cancelLabel={t('input.cancel')}
            noProjectsLabel={t('welcome.noProjects')}
            channelsLabel={t('welcome.channels')}
            presetsTitle={t('welcome.presets')}
            importLabel={t('welcome.importPreset')}
            importingLabel={t('welcome.importing')}
            presets={LIVEGRID_PRESETS}
            projects={projectPreviews}
            loadingPresetId={isImportingPresetId}
            onCreateBlank={createBlankProject}
            onOpenProject={setActiveProjectId}
            onDeleteProject={deleteProject}
            onImportPreset={importPresetProject}
          />
        ) : (
          <LivestreamGrid
            livestreams={activeLivestreams}
            onRemove={removeLivestream}
            onSelectSource={selectLivestreamSource}
            layoutStorageKey={`livegrid_layout_${activeProject.id}`}
          />
        )}

        {!isWelcomeMode && (!isHydrated || activeLivestreams.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-gray-500 text-lg">
                {isHydrated ? t('app.empty') : t('app.loading')}
              </p>
            </div>
          </div>
        )}
      </main>

      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </div>
  )
}

export function AppClient() {
  return (
    <I18nProvider>
      <AppClientContent />
    </I18nProvider>
  )
}
