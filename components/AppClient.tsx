'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { AboutModal } from '@components/AboutModal'
import { I18nProvider, localeLabels, useI18n } from '@components/i18n'
import { LivestreamGrid } from '@components/LivestreamGrid'
import type { Livestream, LivestreamSource } from '@components/types'
import { URLInput } from '@components/URLInput'
import { WelcomeScreen } from '@components/WelcomeScreen'
import { LIVEGRID_PRESETS, type PresetDefinition } from '@data/presets'
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  LEGACY_STREAMS_KEY,
  REFRESH_INTERVAL_MS,
  STORAGE_KEY,
  createId,
  deserializeProjects,
  fallbackTitleFromUrl,
  mergeLivestreamList,
  normalizeLivestream,
  parseSharedPresetParam,
  parseStreamInput,
  payloadToEntries,
  rebuildLivestreamWithSources,
  serializeProjects,
  sourceBatchKey,
  toBase64UrlUtf8,
  type AddChannelRequest,
  type LiveCheckResult,
  type LiveGridProject,
  type ParsedSourceRef,
  type SharedPresetPayload,
  type SharedPreviewProject,
  type StoredLivestream
} from '@lib/livegrid/domain'
import {
  fetchLiveStatusesBatchRequest,
  resolveChannelsBatchRequest
} from '@lib/livegrid/network'
import { Button } from '@ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@ui/sheet'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@ui/drawer'
import { CirclePlus, Copy, Download, House, Info, Languages, MessageSquareText, Pencil, Share2, X } from 'lucide-react'


const getPlatformIconSrc = (platform: LivestreamSource['platform'] | undefined): string => {
  if (platform === 'twitch') return '/platforms/twitch.svg'
  if (platform === 'kick') return '/platforms/kick.svg'
  return '/platforms/youtube.svg'
}

function AppClientContent() {
  const { t, locale, setLocale, locales } = useI18n()
  const [projects, setProjects] = useState<LiveGridProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [sharedPreview, setSharedPreview] = useState<SharedPreviewProject | null>(null)
  const [isLoadingSharedPreview, setIsLoadingSharedPreview] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isClientMounted, setIsClientMounted] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [selectedChatStreamId, setSelectedChatStreamId] = useState<string | null>(null)
  const [displayedChatUrl, setDisplayedChatUrl] = useState<string | null>(null)
  const [pendingChatUrl, setPendingChatUrl] = useState<string | null>(null)
  const [isChatSwitching, setIsChatSwitching] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [shareQrDataUrl, setShareQrDataUrl] = useState('')
  const [didCopyShare, setDidCopyShare] = useState(false)
  const [isImportingPresetId, setIsImportingPresetId] = useState<string | null>(null)
  const projectsRef = useRef<LiveGridProject[]>(projects)
  const resolvedYoutubeAvatarUrlsRef = useRef<Set<string>>(new Set())
  const sharedPreviewRef = useRef<SharedPreviewProject | null>(sharedPreview)

  useEffect(() => {
    projectsRef.current = projects
  }, [projects])

  useEffect(() => {
    sharedPreviewRef.current = sharedPreview
  }, [sharedPreview])

  useEffect(() => {
    setIsClientMounted(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const media = window.matchMedia('(min-width: 768px)')
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches)

    setIsDesktop(media.matches)
    media.addEventListener('change', onChange)

    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [])

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
        channelsCount: project.livestreams.length,
        channels: project.livestreams.map((stream) => {
          const normalized = normalizeLivestream(stream)
          const platforms = Array.from(
            new Set((normalized.sources ?? []).map((source) =>
              source.platform === 'youtube'
                ? 'youtube'
                : source.platform === 'twitch'
                  ? 'twitch'
                  : 'kick'
            ))
          )
          return {
            title: normalized.title,
            platforms
          }
        })
      })),
    [projects]
  )

  const isSharedPreviewMode = !activeProject && !!sharedPreview
  const currentProjectName = activeProject?.name ?? sharedPreview?.name ?? ''
  const activeLivestreams = useMemo(
    () => activeProject?.livestreams ?? sharedPreview?.livestreams ?? [],
    [activeProject, sharedPreview]
  )


  const resolveChannelsBatchMutation = useMutation({
    mutationFn: resolveChannelsBatchRequest
  })
  const fetchLiveStatusesBatchMutation = useMutation({
    mutationFn: fetchLiveStatusesBatchRequest
  })

  useEffect(() => {
    if (!isHydrated) return

    const pendingUrls = Array.from(
      new Set(
        activeLivestreams
          .flatMap((stream) => (normalizeLivestream(stream).sources ?? []))
          .filter((source) => source.platform === 'youtube' && !source.avatarUrl)
          .map((source) => source.channelUrl)
          .filter((url) => url && !resolvedYoutubeAvatarUrlsRef.current.has(url))
      )
    )

    if (pendingUrls.length === 0) return

    pendingUrls.forEach((url) => resolvedYoutubeAvatarUrlsRef.current.add(url))
    let cancelled = false

    const applyAvatarBackfill = async (): Promise<void> => {
      try {
        const resolved = await resolveChannelsBatchMutation.mutateAsync(pendingUrls)
        if (cancelled || resolved.size === 0) return

        const patchStreams = (streams: Livestream[]): Livestream[] =>
          streams.map((stream) => {
            const normalized = normalizeLivestream(stream)
            const currentSources = normalized.sources ?? []
            let hasChange = false
            const nextSources = currentSources.map((source) => {
              if (source.platform !== 'youtube' || source.avatarUrl) return source
              const match = resolved.get(source.channelUrl)
              if (!match?.avatarUrl) return source
              hasChange = true
              return { ...source, avatarUrl: match.avatarUrl }
            })

            if (!hasChange) return stream
            return rebuildLivestreamWithSources(normalized, nextSources, normalized.activeSourceId)
          })

        if (activeProjectId) {
          setProjects((prev) =>
            prev.map((project) =>
              project.id === activeProjectId
                ? {
                    ...project,
                    livestreams: patchStreams(project.livestreams)
                  }
                : project
            )
          )
          return
        }

        setSharedPreview((prev) =>
          prev
            ? {
                ...prev,
                livestreams: patchStreams(prev.livestreams)
              }
            : prev
        )
      } catch {
        // no-op: keep existing fallback avatar for this session
      }
    }

    void applyAvatarBackfill()

    return () => {
      cancelled = true
    }
  }, [activeLivestreams, activeProjectId, isHydrated, resolveChannelsBatchMutation])

  const liveStatusSourceEntries = useMemo(() => {
    const unique = new Map<string, LivestreamSource>()
    for (const stream of activeLivestreams) {
      const normalized = normalizeLivestream(stream)
      for (const source of normalized.sources ?? []) {
        unique.set(sourceBatchKey(source), source)
      }
    }

    return Array.from(unique.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, source]) => ({ key, source }))
  }, [activeLivestreams])



  const chatCandidates = useMemo(() => {
    return activeLivestreams.map((stream) => {
      const normalized = normalizeLivestream(stream)
      const activeSource =
        normalized.sources?.find((source) => source.sourceId === normalized.activeSourceId) ||
        normalized.sources?.[0]

      return {
        streamId: normalized.id,
        title: normalized.title,
        source: activeSource
      }
    })
  }, [activeLivestreams])

  useEffect(() => {
    if (chatCandidates.length === 0) {
      setSelectedChatStreamId(null)
      return
    }

    const exists = selectedChatStreamId
      ? chatCandidates.some((candidate) => candidate.streamId === selectedChatStreamId)
      : false

    if (!exists) {
      setSelectedChatStreamId(chatCandidates[0].streamId)
    }
  }, [chatCandidates, selectedChatStreamId])

  const selectedChatCandidate = useMemo(
    () => chatCandidates.find((candidate) => candidate.streamId === selectedChatStreamId) || null,
    [chatCandidates, selectedChatStreamId]
  )

  const selectedChatUrl = useMemo(() => {
    if (!selectedChatCandidate?.source || typeof window === 'undefined') return null

    const source = selectedChatCandidate.source
    const host = window.location.hostname || 'localhost'

  if (source.platform === 'youtube') {
      if (!source.videoId) return null
      return `https://www.youtube.com/live_chat?v=${encodeURIComponent(source.videoId)}&embed_domain=${encodeURIComponent(host)}`
    }

    if (source.platform === 'twitch') {
      if (!source.channelId) return null
      return `https://www.twitch.tv/popout/${encodeURIComponent(source.channelId)}/chat?popout=&parent=${encodeURIComponent(host)}`
    }

    if (source.platform === 'kick') {
      if (!source.channelId) return null
      return `https://kick.com/${encodeURIComponent(source.channelId)}/chatroom`
    }

    return null
  }, [selectedChatCandidate])

  useEffect(() => {
    if (!selectedChatUrl) {
      setDisplayedChatUrl(null)
      setPendingChatUrl(null)
      setIsChatSwitching(false)
      return
    }

    setDisplayedChatUrl((current) => {
      if (!current) {
        setPendingChatUrl(null)
        setIsChatSwitching(false)
        return selectedChatUrl
      }

      if (current === selectedChatUrl) {
        setPendingChatUrl(null)
        setIsChatSwitching(false)
        return current
      }

      setPendingChatUrl(selectedChatUrl)
      setIsChatSwitching(true)
      return current
    })
  }, [selectedChatUrl])


  const toggleChatPanel = (): void => {
    setIsChatOpen((prev) => {
      const next = !prev
      if (next) {
        const hasCurrent = selectedChatStreamId
          ? chatCandidates.some((candidate) => candidate.streamId === selectedChatStreamId)
          : false
        if (!hasCurrent) {
          setSelectedChatStreamId(chatCandidates[0]?.streamId ?? null)
        }
      }
      return next
    })
  }


  const parseEntriesToSources = (entries: AddChannelRequest[]): ParsedSourceRef[] => {
    const parsed: ParsedSourceRef[] = []
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const refs = entries[entryIndex].sources.map((value) => value.trim()).filter(Boolean)
      for (const rawRef of refs) {
        const item = parseStreamInput(rawRef)
        if (!item) continue
        parsed.push({
          entryIndex,
          rawRef,
          platform: item.platform,
          normalizedUrl: item.normalizedUrl,
          channelRef: item.channelRef
        })
      }
    }
    return parsed
  }

  const createLivestreamsBatch = async (entries: AddChannelRequest[]): Promise<Livestream[]> => {
    const parsedRefs = parseEntriesToSources(entries)
    if (parsedRefs.length === 0) return []

    const youtubeUrls = Array.from(
      new Set(
        parsedRefs.filter((item) => item.platform === 'youtube').map((item) => item.normalizedUrl)
      )
    )
    let resolvedYoutube = new Map<string, { channelId: string; title?: string; avatarUrl?: string }>()
    try {
      resolvedYoutube = await resolveChannelsBatchMutation.mutateAsync(youtubeUrls)
    } catch (error) {
      console.warn('Resolve channels batch failed:', error)
    }

    const sourceRefsByEntry = new Map<number, LivestreamSource[]>()
    const resolvedTitleByEntry = new Map<number, string>()

    for (const ref of parsedRefs) {
      if (ref.platform === 'youtube') {
        const resolved = resolvedYoutube.get(ref.normalizedUrl) || resolvedYoutube.get(ref.rawRef)
        if (!resolved?.channelId) continue
        const source: LivestreamSource = {
          sourceId: createId(),
          platform: 'youtube',
          channelUrl: ref.normalizedUrl,
          channelId: resolved.channelId,
          avatarUrl: resolved.avatarUrl
        }
        if (!resolvedTitleByEntry.has(ref.entryIndex) && resolved.title) {
          resolvedTitleByEntry.set(ref.entryIndex, resolved.title)
        }
        const list = sourceRefsByEntry.get(ref.entryIndex) ?? []
        list.push(source)
        sourceRefsByEntry.set(ref.entryIndex, list)
        continue
      }

      const source: LivestreamSource = {
        sourceId: createId(),
        platform: ref.platform,
        channelUrl: ref.normalizedUrl,
        channelId: ref.channelRef
      }
      const list = sourceRefsByEntry.get(ref.entryIndex) ?? []
      list.push(source)
      sourceRefsByEntry.set(ref.entryIndex, list)
    }

    const allSources = Array.from(sourceRefsByEntry.values()).flat()
    let liveByKey = new Map<string, LiveCheckResult>()
    try {
      liveByKey = await fetchLiveStatusesBatchMutation.mutateAsync(allSources)
    } catch (error) {
      console.warn('Live status batch check inconclusive:', error)
    }

    const created: Livestream[] = []
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const entrySources = sourceRefsByEntry.get(entryIndex) ?? []
      if (entrySources.length === 0) continue

      const enriched = entrySources.map((source) => {
        const result = liveByKey.get(sourceBatchKey(source))
        if (!result || result.uncertain) return source
        return {
          ...source,
          videoId: source.platform === 'youtube' ? (result.videoId ?? undefined) : undefined,
          consentRequired: source.platform === 'youtube' ? result.consentRequired : false,
          isLive: result.isLive
        }
      })

      const firstSource = enriched[0]
      const entry = entries[entryIndex]
      const explicitTitle = entry.title.trim()
      const resolvedTitle = resolvedTitleByEntry.get(entryIndex)
      const initialTitle =
        explicitTitle || resolvedTitle || fallbackTitleFromUrl(firstSource.channelUrl)
      const liveFirst = enriched.find((source) => source.isLive) || firstSource

      created.push(
        normalizeLivestream({
          id: createId(),
          title: initialTitle,
          platform: liveFirst.platform,
          channelUrl: liveFirst.channelUrl,
          channelId: liveFirst.channelId,
          videoId: liveFirst.videoId,
          consentRequired: liveFirst.consentRequired,
          isLive: liveFirst.isLive,
          activeSourceId: liveFirst.sourceId,
          sources: enriched
        })
      )
    }

    return created
  }

  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') return

    const raw = new URLSearchParams(window.location.search).get('preset')
    if (!raw) return

    const payload = parseSharedPresetParam(raw)
    if (!payload) return

    const entries = payloadToEntries(payload)
    if (entries.length === 0) return

    let cancelled = false
    setIsLoadingSharedPreview(true)

    void createLivestreamsBatch(entries)
      .then((streams) => {
        if (cancelled || streams.length === 0) return
        setActiveProjectId(null)
        setSharedPreview({
          name: payload.name?.trim() || t('app.sharedPresetDefaultName'),
          livestreams: mergeLivestreamList(streams)
        })
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSharedPreview(false)
      })

    return () => {
      cancelled = true
    }
  }, [isHydrated])

  const importSharedPreview = () => {
    if (!sharedPreview) return

    const project: LiveGridProject = {
      id: createId(),
      name: sharedPreview.name,
      createdAt: new Date().toISOString(),
      livestreams: sharedPreview.livestreams
    }

    setProjects((prev) => [project, ...prev])
    setSharedPreview(null)
    setActiveProjectId(project.id)
  }

  const updateCurrentLivestreams = (updater: (current: Livestream[]) => Livestream[]) => {
    if (activeProjectId) {
      setProjects((prev) =>
        prev.map((project) => {
          if (project.id !== activeProjectId) return project
          return { ...project, livestreams: updater(project.livestreams) }
        })
      )
      return
    }

    setSharedPreview((prev) =>
      prev
        ? {
            ...prev,
            livestreams: updater(prev.livestreams)
          }
        : prev
    )
  }

  const addLivestreams = async (entries: AddChannelRequest[]) => {
    const created = await createLivestreamsBatch(entries)

    if (created.length === 0) return

    updateCurrentLivestreams((current) => {
      return mergeLivestreamList([...current, ...created])
    })
  }

  const selectLivestreamSource = (livestreamId: string, sourceId: string) => {
    updateCurrentLivestreams((current) =>
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
    updateCurrentLivestreams((current) => current.filter((stream) => stream.id !== id))
  }

  const deleteProject = (projectId: string) => {
    setProjects((prev) => prev.filter((project) => project.id !== projectId))
    setActiveProjectId((prev) => (prev === projectId ? null : prev))
  }

  const renameProject = (projectId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? {
              ...project,
              name: trimmed
            }
          : project
      )
    )
  }

  const buildShareUrl = (): string => {
    if (typeof window === 'undefined') return ''

    const entries = activeLivestreams
      .map((stream) => {
        const normalized = normalizeLivestream(stream)
        return {
          title: normalized.title,
          sources: (normalized.sources ?? [])
            .map((source) => source.channelUrl)
            .filter((value) => value.trim().length > 0)
        }
      })
      .filter((entry) => entry.sources.length > 0)

    const payload: SharedPresetPayload = {
      name: currentProjectName || t('app.sharedPresetDefaultName'),
      entries
    }

    const json = JSON.stringify(payload)
    const base64 = toBase64UrlUtf8(json)

    const url = new URL(window.location.href)
    url.searchParams.set('preset', base64)
    return url.toString()
  }

  const openShareDialog = async () => {
    setDidCopyShare(false)
    const url = buildShareUrl()
    setShareUrl(url)
    setShareQrDataUrl('')
    try {
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 220,
        color: {
          dark: '#E2E8F0',
          light: '#020617'
        }
      })
      setShareQrDataUrl(qr)
    } catch {
      setShareQrDataUrl('')
    }
    setIsShareOpen(true)
  }

  const copyShareUrl = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setDidCopyShare(true)
    } catch {
      const input = document.createElement('textarea')
      input.value = shareUrl
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.focus()
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setDidCopyShare(true)
    }
    setIsShareOpen(false)
  }

  const renameActiveProject = () => {
    const trimmed = renameValue.trim()
    if (!trimmed) return
    if (activeProjectId) {
      setProjects((prev) =>
        prev.map((project) =>
          project.id === activeProjectId
            ? {
                ...project,
                name: trimmed
              }
            : project
        )
      )
    } else {
      setSharedPreview((prev) => (prev ? { ...prev, name: trimmed } : prev))
    }
    setIsRenameOpen(false)
  }

  const liveStatusesQuery = useQuery({
    queryKey: [
      'live-status-batch',
      activeProjectId ?? 'shared',
      liveStatusSourceEntries.map((entry) => entry.key)
    ],
    queryFn: async () => {
      const sources = liveStatusSourceEntries.map((entry) => entry.source)
      return fetchLiveStatusesBatchRequest(sources)
    },
    enabled: isHydrated && activeLivestreams.length > 0 && liveStatusSourceEntries.length > 0,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  })

  useEffect(() => {
    const liveByKey = liveStatusesQuery.data
    if (!liveByKey) return

    const snapshot = activeProjectId
      ? projectsRef.current.find((project) => project.id === activeProjectId)?.livestreams ?? []
      : sharedPreviewRef.current?.livestreams ?? []
    if (snapshot.length === 0) return

    const refreshed = snapshot.map((stream) => {
      const normalized = normalizeLivestream(stream)
      const currentSources = normalized.sources ?? []
      const refreshedSources = currentSources.map((source) => {
        const result = liveByKey.get(sourceBatchKey(source))
        if (!result || result.uncertain) {
          return source
        }
        if (source.platform === 'youtube') {
          return {
            ...source,
            videoId: result.videoId ?? undefined,
            consentRequired: result.consentRequired,
            isLive: result.isLive
          }
        }
        return {
          ...source,
          videoId: undefined,
          consentRequired: false,
          isLive: result.isLive
        }
      })
      const previousActive = refreshedSources.find((source) => source.sourceId === normalized.activeSourceId)
      const activeId =
        previousActive?.isLive
          ? previousActive.sourceId
          : refreshedSources.find((source) => source.isLive)?.sourceId || normalized.activeSourceId

      return rebuildLivestreamWithSources(normalized, refreshedSources, activeId)
    })

    const refreshedById = new Map(refreshed.map((stream) => [stream.id, stream]))
    if (activeProjectId) {
      setProjects((prev) =>
        prev.map((project) => {
          if (project.id !== activeProjectId) return project
          return {
            ...project,
            livestreams: project.livestreams.map((stream) => refreshedById.get(stream.id) ?? stream)
          }
        })
      )
    } else {
      setSharedPreview((prev) =>
        prev
          ? {
              ...prev,
              livestreams: prev.livestreams.map((stream) => refreshedById.get(stream.id) ?? stream)
            }
          : prev
      )
    }
  }, [activeProjectId, liveStatusesQuery.data])

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
      const presetEntries =
        preset.entries?.map((entry) => ({
          title: entry.title ?? '',
          sources: entry.sources
        })) ?? (preset.channels ?? []).map((channel) => ({ title: '', sources: [channel] }))

      const streams = await createLivestreamsBatch(presetEntries)

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
  const isWelcomeMode = !activeProject && !sharedPreview
  const loadingOverlayMessage = useMemo(() => {
    if (!isHydrated) return t('app.loadingStartup')
    if (isLoadingSharedPreview) return t('app.loadingSharedPreset')
    if (isImportingPresetId) return t('app.loadingImportPreset')
    return null
  }, [isHydrated, isLoadingSharedPreview, isImportingPresetId, t])


  return (
    <div className="w-screen h-[100dvh] bg-black text-white flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="bg-black border-b border-gray-800 px-3 py-2 min-h-16 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <Image
              src="/livegrid-logo.svg"
              alt={t('app.title')}
              width={320}
              height={96}
              priority
              className="block h-6 sm:h-7 md:h-12 w-auto max-w-full object-contain bg-transparent border-0 shadow-none"
            />
            {!isWelcomeMode && (
              <div className="min-w-0 hidden md:flex items-center gap-2 self-center">
                <p
                  className="text-sm font-semibold text-gray-100 truncate max-w-72"
                  style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}
                >
                  {currentProjectName}
                </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setRenameValue(currentProjectName)
                        setIsRenameOpen(true)
                      }}
                      aria-label={t('app.renameProject')}
                      title={t('app.renameProject')}
                      className="text-gray-100 hover:bg-gray-800 hover:text-gray-100"
                    >
                    <Pencil className="size-4" />
                  </Button>

              <URLInput
                onAddMany={addLivestreams}
                trigger={
                  <Button
                    variant="default"
                    size="sm"
                    aria-label={t('input.addChannel')}
                    title={t('input.addChannel')}
                    className="bg-gray-900 border border-blue-500/70 text-blue-100 hover:bg-blue-900/30 hover:text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
                  >
                    <CirclePlus className="size-4 mr-1" />
                    {t('input.addChannel')}
                  </Button>
                }
              />
              {!!activeProject && activeLivestreams.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={openShareDialog}
                      aria-label={t('app.share')}
                      title={t('app.share')}
                      className="text-gray-100 hover:bg-gray-800 hover:text-gray-100"
                    >
                      <Share2 className="size-4" />
                    </Button>

              )}
              {activeLivestreams.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleChatPanel}
                      aria-label={t('app.chat')}
                      title={t('app.chat')}
                      className="text-gray-100 hover:bg-gray-800 hover:text-gray-100"
                    >
                      <MessageSquareText className="size-4" />
                    </Button>

              )}
              {isSharedPreviewMode && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={importSharedPreview}
                      aria-label={t('app.importShared')}
                      title={t('app.importShared')}
                      className="text-gray-100 hover:bg-gray-800 hover:text-gray-100"
                    >
                      <Download className="size-4" />
                    </Button>

              )}
            </div>
          )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isWelcomeMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setActiveProjectId(null)
                    setSharedPreview(null)
                  }}
                  aria-label={t('app.projects')}
                  title={t('app.projects')}
                  className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
                  >
                    <House className="size-4" />
                  </Button>

            )}

            {isClientMounted ? (
              <Popover>
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
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('app.language')}
                className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
              >
                <span className="text-xs font-semibold">{localeShort}</span>
              </Button>
            )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsAboutOpen(true)}
                  aria-label={t('app.about')}
                  className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
                >
                  <Info className="size-4" />
                </Button>

          </div>
        </div>
        {!isWelcomeMode && (
          <div className="md:hidden mt-4 flex items-center justify-center gap-1 min-w-0">
            <p
              className="text-[11px] font-semibold text-gray-100 truncate max-w-[65vw]"
              style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}
            >
              {currentProjectName}
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setRenameValue(currentProjectName)
                setIsRenameOpen(true)
              }}
              aria-label={t('app.renameProject')}
              title={t('app.renameProject')}
              className="h-6 w-6 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
            >
              <Pencil className="size-3.5" />
            </Button>
            <URLInput
              onAddMany={addLivestreams}
              trigger={
                <Button
                  variant="default"
                  size="sm"
                  aria-label={t('input.addChannel')}
                  title={t('input.addChannel')}
                  className="h-6 px-2 bg-gray-900 border border-blue-500/70 text-blue-100 hover:bg-blue-900/30 hover:text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
                >
                  <CirclePlus className="size-3.5" />
                </Button>
              }
            />
            {!!activeProject && activeLivestreams.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={openShareDialog}
                aria-label={t('app.share')}
                title={t('app.share')}
                className="h-6 w-6 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
              >
                <Share2 className="size-3.5" />
              </Button>
            )}
            {activeLivestreams.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleChatPanel}
                aria-label={t('app.chat')}
                title={t('app.chat')}
                className="h-6 w-6 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
              >
                <MessageSquareText className="size-3.5" />
              </Button>
            )}
            {isSharedPreviewMode && (
              <Button
                variant="ghost"
                size="icon"
                onClick={importSharedPreview}
                aria-label={t('app.importShared')}
                title={t('app.importShared')}
                className="h-6 w-6 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
              >
                <Download className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 overflow-hidden relative">
        {isWelcomeMode ? (
          <WelcomeScreen
            title={t('welcome.title')}
            subtitle={t('welcome.subtitle')}
            createLabel={t('welcome.create')}
            projectsTitle={t('welcome.projects')}
            openProjectLabel={t('welcome.openProject')}
            editProjectLabel={t('welcome.editProject')}
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
            onRenameProject={renameProject}
            onDeleteProject={deleteProject}
            onImportPreset={importPresetProject}
          />
        ) : (
          <LivestreamGrid
            livestreams={activeLivestreams}
            onRemove={removeLivestream}
            onSelectSource={selectLivestreamSource}
            layoutStorageKey={
              activeProject ? `livegrid_layout_${activeProject.id}` : 'livegrid_layout_shared_preview'
            }
          />
        )}

        {!isWelcomeMode && !loadingOverlayMessage && activeLivestreams.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-gray-500 text-lg">
                {t('app.empty')}
              </p>
            </div>
          </div>
        )}
      </main>

      {!isWelcomeMode && isClientMounted && (
        isDesktop ? (
          <Sheet open={isChatOpen} onOpenChange={setIsChatOpen}>
            <SheetContent
              side="right"
              showCloseButton={false}
              overlayClassName="bg-transparent pointer-events-none"
              className="w-[360px] sm:max-w-[360px] border-l border-gray-800 bg-gray-950/95 backdrop-blur-sm p-0"
            >
              <SheetTitle className="sr-only">{t('app.chat')}</SheetTitle>
              <SheetDescription className="sr-only">{t('chat.selectChannel')}</SheetDescription>
              <div className="h-full min-h-0 flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-100">{t('app.chat')}</p>
                  <button
                    type="button"
                    onClick={() => setIsChatOpen(false)}
                    aria-label={t('input.cancel')}
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-300 hover:bg-gray-800 hover:text-white"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2 overflow-x-auto">
                  {chatCandidates.map((candidate) => {
                    const isActive = candidate.streamId === selectedChatStreamId
                    return (
                      <button
                        key={candidate.streamId}
                        type="button"
                        onClick={() => setSelectedChatStreamId(candidate.streamId)}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${
                          isActive
                            ? 'bg-blue-700/70 border-blue-500 text-white'
                            : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800'
                        }`}
                        title={candidate.title}
                        aria-label={candidate.title}
                      >
                        <Image
                          src={getPlatformIconSrc(candidate.source?.platform)}
                          alt={candidate.source?.platform ?? 'youtube'}
                          width={14}
                          height={14}
                          className="h-3.5 w-3.5 shrink-0"
                          draggable={false}
                        />
                        <span className="max-w-28 truncate">{candidate.title}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex-1 min-h-0 bg-black relative overflow-hidden">
                  {displayedChatUrl ? (
                    <>
                      <iframe
                        src={displayedChatUrl}
                        title="Live chat"
                        className="block w-full h-full"
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                      {pendingChatUrl ? (
                        <iframe
                          src={pendingChatUrl}
                          title="Live chat preloading"
                          className="absolute inset-0 block w-full h-full opacity-0 pointer-events-none"
                          referrerPolicy="strict-origin-when-cross-origin"
                          onLoad={() => {
                            setDisplayedChatUrl(pendingChatUrl)
                            setPendingChatUrl(null)
                            setIsChatSwitching(false)
                          }}
                        />
                      ) : null}
                      {isChatSwitching ? (
                        <div className="absolute inset-0 pointer-events-none bg-black/15" />
                      ) : null}
                    </>
                  ) : !selectedChatCandidate ? (
                    <div className="h-full w-full flex items-center justify-center text-center px-4">
                      <p className="text-xs text-gray-400">{t('chat.selectChannel')}</p>
                    </div>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-center px-4">
                      <p className="text-xs text-gray-400">{t('chat.unavailable')}</p>
                    </div>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <Drawer open={isChatOpen} onOpenChange={setIsChatOpen} shouldScaleBackground={false}>
            <DrawerContent
              overlayClassName="bg-transparent pointer-events-none"
              className="h-[75vh] max-h-[75vh] overflow-hidden border-t border-gray-800 bg-gray-950/95 p-0 pb-[env(safe-area-inset-bottom)]"
            >
              <DrawerTitle className="sr-only">{t('app.chat')}</DrawerTitle>
              <DrawerDescription className="sr-only">{t('chat.selectChannel')}</DrawerDescription>
              <div className="h-full min-h-0 flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-100">{t('app.chat')}</p>
                  <button
                    type="button"
                    onClick={() => setIsChatOpen(false)}
                    aria-label={t('input.cancel')}
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-300 hover:bg-gray-800 hover:text-white"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2 overflow-x-auto">
                  {chatCandidates.map((candidate) => {
                    const isActive = candidate.streamId === selectedChatStreamId
                    return (
                      <button
                        key={candidate.streamId}
                        type="button"
                        onClick={() => setSelectedChatStreamId(candidate.streamId)}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${
                          isActive
                            ? 'bg-blue-700/70 border-blue-500 text-white'
                            : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800'
                        }`}
                        title={candidate.title}
                        aria-label={candidate.title}
                      >
                        <Image
                          src={getPlatformIconSrc(candidate.source?.platform)}
                          alt={candidate.source?.platform ?? 'youtube'}
                          width={14}
                          height={14}
                          className="h-3.5 w-3.5 shrink-0"
                          draggable={false}
                        />
                        <span className="max-w-28 truncate">{candidate.title}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex-1 min-h-0 bg-black relative overflow-y-auto">
                  {displayedChatUrl ? (
                    <>
                      <iframe
                        src={displayedChatUrl}
                        title="Live chat"
                        className="block w-full h-full"
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                      {pendingChatUrl ? (
                        <iframe
                          src={pendingChatUrl}
                          title="Live chat preloading"
                          className="absolute inset-0 block w-full h-full opacity-0 pointer-events-none"
                          referrerPolicy="strict-origin-when-cross-origin"
                          onLoad={() => {
                            setDisplayedChatUrl(pendingChatUrl)
                            setPendingChatUrl(null)
                            setIsChatSwitching(false)
                          }}
                        />
                      ) : null}
                      {isChatSwitching ? (
                        <div className="absolute inset-0 pointer-events-none bg-black/15" />
                      ) : null}
                    </>
                  ) : !selectedChatCandidate ? (
                    <div className="h-full w-full flex items-center justify-center text-center px-4">
                      <p className="text-xs text-gray-400">{t('chat.selectChannel')}</p>
                    </div>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-center px-4">
                      <p className="text-xs text-gray-400">{t('chat.unavailable')}</p>
                    </div>
                  )}
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        )
      )}


      {!isWelcomeMode && isClientMounted && !isDesktop && !isChatOpen && (
        <button
          type="button"
          onClick={() => setIsChatOpen(true)}
          aria-label={t('app.chat')}
          className="fixed bottom-2 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 rounded-full border border-gray-700 bg-gray-900/95 px-3 py-1.5 text-xs text-gray-200 shadow-lg backdrop-blur-sm hover:bg-gray-800"
        >
          <span className="block h-1.5 w-10 rounded-full bg-gray-600" />
          <MessageSquareText className="size-3.5" />
          <span>{t('app.chat')}</span>
        </button>
      )}

      {loadingOverlayMessage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 px-6 py-5 rounded-xl border border-gray-700 bg-gray-950/95">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-2 border-blue-500/25" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 animate-spin" />
            </div>
            <p className="text-sm sm:text-base font-semibold text-gray-100 text-center">
              {loadingOverlayMessage}
            </p>
            <p className="text-xs text-gray-400 text-center">{t('app.loading')}</p>
          </div>
        </div>
      )}

      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent className="max-w-md bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>{t('app.renameProject')}</DialogTitle>
          </DialogHeader>
          <div>
            <label htmlFor="project-name" className="block text-xs font-medium mb-1">
              {t('app.projectPrompt')}
            </label>
            <input
              id="project-name"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              className="w-full px-2 py-1 bg-gray-800 border border-gray-700 text-sm rounded focus:outline-none focus:border-blue-500 transition"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  renameActiveProject()
                }
              }}
            />
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsRenameOpen(false)}
              className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
            >
              {t('input.cancel')}
            </Button>
            <Button
              type="button"
              onClick={renameActiveProject}
              className="bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
            >
              {t('app.renameProject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isShareOpen}
        onOpenChange={(open) => {
          setIsShareOpen(open)
          if (!open) {
            setDidCopyShare(false)
            setShareQrDataUrl('')
          }
        }}
      >
        <DialogContent className="max-w-lg bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>{t('app.share')}</DialogTitle>
          </DialogHeader>
          <div>
            <label htmlFor="share-url" className="block text-xs font-medium mb-1">
              {t('app.shareLink')}
            </label>
            <input
              id="share-url"
              value={shareUrl}
              readOnly
              className="w-full px-2 py-1 bg-gray-800 border border-gray-700 text-xs rounded focus:outline-none"
            />
          </div>
          {shareQrDataUrl ? (
            <div className="flex items-center justify-center">
              <Image
                src={shareQrDataUrl}
                alt="QR Code"
                width={160}
                height={160}
                unoptimized
                className="h-40 w-40 rounded border border-gray-700"
              />
            </div>
          ) : null}
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsShareOpen(false)}
              className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
            >
              {t('input.cancel')}
            </Button>
            <Button
              type="button"
              onClick={copyShareUrl}
              className="bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
            >
              <Copy className="size-4 mr-1" />
              {didCopyShare ? t('app.copied') : t('app.copy')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
