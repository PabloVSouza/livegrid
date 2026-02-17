'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { URLInput } from './URLInput'
import { LivestreamGrid } from './LivestreamGrid'
import type { Livestream } from './types'
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

const fallbackTitleFromUrl = (url: string): string => {
  const atMatch = url.match(/@([a-zA-Z0-9_-]+)/)
  if (atMatch?.[1]) return atMatch[1]

  const channelMatch = url.match(/\/(channel|c)\/([a-zA-Z0-9_-]+)/)
  if (channelMatch?.[2]) return channelMatch[2]

  return 'Channel'
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
        livestreams: Array.isArray(project.livestreams)
          ? project.livestreams.map((stream) => ({ ...stream, videoId: undefined }))
          : []
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
    livestreams: project.livestreams.map(({ videoId: _videoId, ...stored }) => stored)
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
              livestreams: legacy.map((stream) => ({ ...stream, videoId: undefined }))
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

  const fetchCurrentLiveVideoId = async (
    channelId: string
  ): Promise<{ videoId?: string | undefined | null; consentRequired?: boolean }> => {
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
        return { videoId: undefined, consentRequired: true }
      }
      if (data.uncertain) {
        return { videoId: null }
      }
      return { videoId: data.live ? data.videoId : undefined }
    } catch (error) {
      console.warn('Live status check inconclusive:', channelId, error)
      return { videoId: null }
    }
  }

  const createLivestream = async (channelUrl: string, title: string): Promise<Livestream> => {
    const resolved = await resolveChannel(channelUrl)
    const resolvedTitle = title.trim() || resolved.title || fallbackTitleFromUrl(channelUrl)
    const liveResult = await fetchCurrentLiveVideoId(resolved.channelId)

    return {
      id: createId(),
      channelUrl,
      channelId: resolved.channelId,
      title: resolvedTitle,
      videoId: liveResult.videoId ?? undefined,
      consentRequired: liveResult.consentRequired
    }
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

  const addLivestreams = async (entries: Array<{ channelUrl: string; title: string }>) => {
    if (!activeProjectId) return

    const created: Livestream[] = []

    for (const entry of entries) {
      try {
        const stream = await createLivestream(entry.channelUrl, entry.title)
        created.push(stream)
      } catch (error) {
        console.error('Failed to add channel:', entry.channelUrl, error)
      }
    }

    if (created.length === 0) return

    updateActiveProjectLivestreams((current) => {
      const existingIds = new Set(current.map((stream) => stream.channelId))
      const uniqueNew = created.filter(
        (stream) => !stream.channelId || !existingIds.has(stream.channelId)
      )
      return [...current, ...uniqueNew]
    })
  }

  const removeLivestream = (id: string) => {
    updateActiveProjectLivestreams((current) => current.filter((stream) => stream.id !== id))
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
          if (!stream.channelId) {
            return stream
          }

          const liveResult = await fetchCurrentLiveVideoId(stream.channelId)
          if (liveResult.videoId === null) {
            return stream
          }
          return {
            ...stream,
            videoId: liveResult.videoId,
            consentRequired: liveResult.consentRequired
          }
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
          const stream = await createLivestream(channel, '')
          streams.push(stream)
        } catch (error) {
          console.error('Failed to import preset channel:', channel, error)
        }
      }

      const project: LiveGridProject = {
        id: createId(),
        name: preset.name,
        createdAt: new Date().toISOString(),
        livestreams: streams
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
      <header className="bg-black border-b border-gray-800 px-3 py-2 flex items-center justify-between min-h-16">
        <img
          src="/livegrid-logo.svg"
          alt={t('app.title')}
          className="h-7 md:h-12 w-auto bg-transparent border-0 shadow-none"
        />
        <div className="flex items-center gap-2">
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
            onImportPreset={importPresetProject}
          />
        ) : (
          <LivestreamGrid
            livestreams={activeLivestreams}
            onRemove={removeLivestream}
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
