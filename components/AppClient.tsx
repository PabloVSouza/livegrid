"use client"

import { useState, useEffect, useRef } from 'react'
import { URLInput } from './URLInput'
import { LivestreamGrid } from './LivestreamGrid'
import type { Livestream } from './types'
import { I18nProvider, localeLabels, useI18n } from './i18n'
import { AboutModal } from './AboutModal'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CirclePlus, Info, Languages } from 'lucide-react'

const STORAGE_KEY = 'youtube_livestreams'
const REFRESH_INTERVAL_MS = 60_000

type StoredLivestream = Omit<Livestream, 'videoId'>

function loadStoredLivestreams(): Livestream[] {
  if (typeof window === 'undefined') {
    return []
  }

  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as StoredLivestream[]
      return parsed.map((stream) => ({ ...stream, videoId: undefined }))
    } catch (error) {
      console.error('Failed to parse saved livestreams:', error)
    }
  }
  return []
}

const fallbackTitleFromUrl = (url: string): string => {
  const atMatch = url.match(/@([a-zA-Z0-9_-]+)/)
  if (atMatch?.[1]) {
    return atMatch[1]
  }

  const channelMatch = url.match(/\/channel\/(UC[\w-]{22})/)
  if (channelMatch?.[1]) {
    return channelMatch[1]
  }

  return 'Channel'
}

function AppClientContent() {
  const { t, locale, setLocale, locales } = useI18n()
  const [livestreams, setLivestreams] = useState<Livestream[]>([])
  const [isHydrated, setIsHydrated] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const livestreamsRef = useRef<Livestream[]>(livestreams)

  useEffect(() => {
    livestreamsRef.current = livestreams
  }, [livestreams])

  useEffect(() => {
    setLivestreams(loadStoredLivestreams())
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    const toStore: StoredLivestream[] = livestreams.map(({ videoId: _videoId, ...stored }) => stored)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
  }, [livestreams, isHydrated])

  const resolveChannel = async (channelUrl: string): Promise<{ channelId: string; title?: string }> => {
    const response = await fetch(`/api/resolve-channel?url=${encodeURIComponent(channelUrl)}`)
    const data = (await response.json()) as { channelId?: string; title?: string; error?: string }

    if (!response.ok || !data.channelId) {
      throw new Error(data.error || 'Could not resolve channel')
    }

    return { channelId: data.channelId, title: data.title }
  }

  const fetchCurrentLiveVideoId = async (channelId: string): Promise<string | undefined> => {
    try {
      const response = await fetch(`/api/channel-live?channelId=${encodeURIComponent(channelId)}`)
      const data = (await response.json()) as { live?: boolean; videoId?: string; error?: string }
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check channel live status')
      }
      return data.live ? data.videoId : undefined
    } catch (error) {
      console.error('Live status check failed:', channelId, error)
      return undefined
    }
  }

  const addLivestream = async (channelUrl: string, title: string) => {
    const resolved = await resolveChannel(channelUrl)
    const resolvedTitle = title.trim() || resolved.title || fallbackTitleFromUrl(channelUrl)
    const liveVideoId = await fetchCurrentLiveVideoId(resolved.channelId)

    return {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelUrl,
      channelId: resolved.channelId,
      title: resolvedTitle,
      videoId: liveVideoId
    } satisfies Livestream
  }

  useEffect(() => {
    if (!isHydrated || livestreams.length === 0) {
      return
    }

    let cancelled = false

    const refreshLiveStatuses = async () => {
      const snapshot = livestreamsRef.current
      const refreshed = await Promise.all(
        snapshot.map(async (stream) => {
          if (!stream.channelId) {
            return stream
          }

          const liveVideoId = await fetchCurrentLiveVideoId(stream.channelId)
          return { ...stream, videoId: liveVideoId }
        })
      )

      if (cancelled) return

      const byId = new Map(refreshed.map((stream) => [stream.id, stream]))
      setLivestreams((prev) => prev.map((stream) => byId.get(stream.id) ?? stream))
    }

    void refreshLiveStatuses()
    const intervalId = window.setInterval(() => {
      void refreshLiveStatuses()
    }, REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [livestreams.length, isHydrated])

  const addLivestreams = async (entries: Array<{ channelUrl: string; title: string }>) => {
    const created: Livestream[] = []

    for (const entry of entries) {
      try {
        const stream = await addLivestream(entry.channelUrl, entry.title)
        created.push(stream)
      } catch (error) {
        console.error('Failed to add channel:', entry.channelUrl, error)
      }
    }

    if (created.length > 0) {
      setLivestreams((prev) => {
        const existingIds = new Set(prev.map((stream) => stream.channelId))
        const uniqueNew = created.filter((stream) => !existingIds.has(stream.channelId))
        return [...prev, ...uniqueNew]
      })
    }
  }

  const removeLivestream = (id: string) => {
    setLivestreams((prev) => prev.filter((stream) => stream.id !== id))
  }

  const localeShort = locale === "pt-BR" ? "PT" : locale.split("-")[0].toUpperCase()

  return (
    <div className="w-screen h-screen bg-black text-white flex flex-col">
      <header className="relative bg-black border-b border-gray-800 px-3 py-2 flex items-center justify-end min-h-16">
        <img
          src="/livegrid-logo.svg"
          alt={t("app.title")}
          className="absolute left-1/2 -translate-x-1/2 h-12 w-auto bg-transparent border-0 shadow-none"
        />
        <div className="flex items-center gap-2">
          <URLInput
            onAddMany={addLivestreams}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("input.addChannel")}
                title={t("input.addChannel")}
                className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
              >
                <CirclePlus className="size-4" />
              </Button>
            }
          />

          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("app.language")}
                    className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
                  >
                    <span className="text-xs font-semibold">{localeShort}</span>
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("app.language")}</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-56 bg-gray-900 border-gray-700 p-1">
              <div className="max-h-72 overflow-auto">
                {locales.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setLocale(option)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition flex items-center justify-between ${
                      option === locale ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-800/60"
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
                aria-label={t("app.about")}
                className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
              >
                <Info className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("app.about")}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        <LivestreamGrid livestreams={livestreams} onRemove={removeLivestream} />
        {(!isHydrated || livestreams.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-gray-500 text-lg">
                {isHydrated ? t("app.empty") : t("app.loading")}
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
