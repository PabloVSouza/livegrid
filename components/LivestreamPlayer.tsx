'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import type { FC } from 'react'
import { useI18n } from '@components/i18n'
import type { Livestream, LivestreamSource } from '@components/types'
import { Expand, RotateCw, Volume2, VolumeX } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@ui/alert-dialog'

type TwitchPlayerApi = {
  setMuted: (value: boolean) => void
  play: () => void
  destroy: () => void
}

type TwitchPlayerCtor = new (
  element: string | HTMLElement,
  options: {
    channel?: string
    parent: string[]
    width: string
    height: string
    autoplay?: boolean
    muted?: boolean
  }
) => TwitchPlayerApi

type TwitchGlobal = {
  Player: TwitchPlayerCtor
}

declare global {
  interface Window {
    Twitch?: TwitchGlobal
  }
}

let twitchSdkPromise: Promise<void> | null = null

const loadTwitchSdk = (): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.Twitch?.Player) return Promise.resolve()
  if (twitchSdkPromise) return twitchSdkPromise

  twitchSdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('twitch-embed-sdk')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Twitch SDK')), {
        once: true
      })
      return
    }

    const script = document.createElement('script')
    script.id = 'twitch-embed-sdk'
    script.src = 'https://player.twitch.tv/js/embed/v1.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Twitch SDK'))
    document.head.appendChild(script)
  })

  return twitchSdkPromise
}

interface LivestreamPlayerProps {
  stream: Livestream
  onRemove: () => void
  onSelectSource: (sourceId: string) => void
}


const getPlatformIconSrc = (platform: LivestreamSource['platform']): string => {
  if (platform === 'youtube') return '/platforms/youtube.svg'
  if (platform === 'twitch') return '/platforms/twitch.svg'
  return '/platforms/kick.svg'
}

export const LivestreamPlayer: FC<LivestreamPlayerProps> = ({ stream, onRemove, onSelectSource }) => {
  const { t } = useI18n()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [twitchParentHost, setTwitchParentHost] = useState('localhost')
  const [isMuted, setIsMuted] = useState(true)
  const [youtubeOrigin, setYoutubeOrigin] = useState('')
  const [reloadNonce, setReloadNonce] = useState(0)
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const twitchContainerRef = useRef<HTMLDivElement | null>(null)
  const twitchPlayerRef = useRef<TwitchPlayerApi | null>(null)
  const twitchHasStartedRef = useRef(false)
  const twitchPlayAttemptsRef = useRef(0)
  const lastYoutubeResumeAttemptRef = useRef(0)
  const twitchContainerId = useId().replace(/:/g, '_')

  const sources: LivestreamSource[] =
    stream.sources && stream.sources.length > 0
      ? stream.sources
      : [
          {
            sourceId: stream.activeSourceId || `${stream.platform ?? 'youtube'}:${stream.channelId ?? stream.channelUrl}`,
            platform: stream.platform ?? 'youtube',
            channelUrl: stream.channelUrl,
            channelId: stream.channelId,
            videoId: stream.videoId,
            consentRequired: stream.consentRequired,
            isLive: stream.isLive
          }
        ]
  const activeSource =
    sources.find((source) => source.sourceId === stream.activeSourceId) || sources[0]
  const platform = activeSource.platform
  const canFallbackByUnknownStatus =
    platform === 'youtube' ? !isIOS && activeSource.isLive !== false : true
  const useNativePlayerControls = false
  const youtubeParams = new URLSearchParams({
    autoplay: '1',
    controls: '0',
    mute: '1',
    rel: '0',
    fs: '0',
    disablekb: '1',
    iv_load_policy: '3',
    modestbranding: '1',
    playsinline: '1',
    enablejsapi: '1'
  })
  if (youtubeOrigin) {
    youtubeParams.set('origin', youtubeOrigin)
  }
  const youtubeEmbedHost = 'https://www.youtube.com'
  const embedUrl =
    platform === 'youtube'
      ? activeSource.videoId
        ? `${youtubeEmbedHost}/embed/${activeSource.videoId}?${youtubeParams.toString()}`
        : canFallbackByUnknownStatus && activeSource.channelId
          ? `${youtubeEmbedHost}/embed/live_stream?channel=${encodeURIComponent(activeSource.channelId)}&${youtubeParams.toString()}`
        : null
      : platform === 'twitch'
        ? canFallbackByUnknownStatus && activeSource.channelId
          ? `https://player.twitch.tv/?channel=${encodeURIComponent(activeSource.channelId)}&parent=${encodeURIComponent(twitchParentHost)}&autoplay=true&muted=true`
          : null
        : canFallbackByUnknownStatus && activeSource.channelId
          ? `https://player.kick.com/${encodeURIComponent(activeSource.channelId)}?autoplay=true&muted=${isMuted ? 'true' : 'false'}`
          : null

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setPortalReady(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hostname) {
      setTwitchParentHost(window.location.hostname)
      setYoutubeOrigin(window.location.origin)

      const ua = window.navigator.userAgent || ''
      const platform = window.navigator.platform || ''
      const isIOSDevice = /iPad|iPhone|iPod/.test(ua)
      const isIPadOS = platform === 'MacIntel' && (window.navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1
      setIsIOS(isIOSDevice || isIPadOS)
    }
  }, [])

  useEffect(() => {
    if (platform !== 'twitch' || !embedUrl || !activeSource.channelId || !twitchParentHost) {
      return
    }

    let cancelled = false

    const createPlayer = async () => {
      try {
        await loadTwitchSdk()
        if (cancelled || !window.Twitch?.Player) return

        twitchPlayerRef.current?.destroy()
        twitchPlayerRef.current = null

        const target = twitchContainerRef.current ?? twitchContainerId
        const player = new window.Twitch.Player(target, {
          channel: activeSource.channelId,
          parent: [twitchParentHost],
          width: '100%',
          height: '100%',
          autoplay: true,
          muted: true
        })
        twitchPlayerRef.current = player
        twitchHasStartedRef.current = false
        twitchPlayAttemptsRef.current = 0

        // Nudge playback after SDK setup; some browsers require explicit play call.
        window.setTimeout(() => {
          if (cancelled || twitchPlayerRef.current !== player) return
          try {
            player.play()
            player.setMuted(isMuted)
            twitchPlayAttemptsRef.current += 1
          } catch {
            // no-op
          }
        }, 250)

        // Track whether playback actually started at least once.
        try {
          ;(player as unknown as { addEventListener?: (event: string, cb: () => void) => void })
            .addEventListener?.('PLAY', () => {
              twitchHasStartedRef.current = true
              twitchPlayAttemptsRef.current = 0
            })
        } catch {
          // no-op
        }
      } catch {
        // fallback stays as iframe rendering path
      }
    }

    void createPlayer()

    return () => {
      cancelled = true
      twitchPlayerRef.current?.destroy()
      twitchPlayerRef.current = null
      twitchHasStartedRef.current = false
      twitchPlayAttemptsRef.current = 0
    }
  }, [platform, embedUrl, activeSource.channelId, twitchParentHost, twitchContainerId])

  const postYoutubeCommand = (func: string, args: unknown[] = []): void => {
    const iframeWindow = iframeRef.current?.contentWindow
    if (!iframeWindow || platform !== 'youtube' || !embedUrl) return
    iframeWindow.postMessage(
      JSON.stringify({
        event: 'command',
        func,
        args
      }),
      '*'
    )
  }

  const tryResumeYoutubePlayback = (): void => {
    if (isIOS) return
    const now = Date.now()
    if (now - lastYoutubeResumeAttemptRef.current < 4000) return
    lastYoutubeResumeAttemptRef.current = now
    postYoutubeCommand('playVideo')
  }

  useEffect(() => {
    if (platform !== 'youtube' || !embedUrl) return
    postYoutubeCommand(isMuted ? 'mute' : 'unMute')
  }, [platform, embedUrl, isMuted])

  useEffect(() => {
    if (platform !== 'twitch') return
    const player = twitchPlayerRef.current
    if (!player) return
    try {
      player.setMuted(isMuted)
    } catch {
      // no-op
    }
  }, [platform, isMuted])

  useEffect(() => {
    if (platform !== 'twitch' || !embedUrl) return

    const intervalId = window.setInterval(() => {
      const player = twitchPlayerRef.current
      if (!player || twitchHasStartedRef.current) return
      if (twitchPlayAttemptsRef.current >= 8) return
      try {
        player.setMuted(true)
        player.play()
        twitchPlayAttemptsRef.current += 1
      } catch {
        // no-op
      }
    }, 1500)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [platform, embedUrl])

  useEffect(() => {
    if (platform !== 'youtube' || !embedUrl || isIOS) return

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (typeof event.data !== 'string') return

      let payload: { event?: string; info?: number } | null = null
      try {
        payload = JSON.parse(event.data) as { event?: string; info?: number }
      } catch {
        return
      }

      if (!payload) return

      if (payload.event === 'onReady') {
        postYoutubeCommand(isMuted ? 'mute' : 'unMute')
        tryResumeYoutubePlayback()
      }

      if (payload.event === 'onStateChange' && payload.info === 2) {
        tryResumeYoutubePlayback()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [platform, embedUrl, isMuted, isIOS])

  useEffect(() => {
    if (platform !== 'youtube' || !embedUrl) return
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        tryResumeYoutubePlayback()
      }
    }, 20000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [platform, embedUrl, isIOS])

  const toggleMute = (): void => {
    if (!embedUrl) return
    if (platform === 'twitch') {
      const player = twitchPlayerRef.current
      if (!twitchHasStartedRef.current) {
        // Before first successful play, click acts as "recover/play" to avoid no-op mute toggles.
        setIsMuted(true)
        if (!player) {
          setReloadNonce((prev) => prev + 1)
          return
        }
        try {
          player.setMuted(true)
          player.play()
          twitchPlayAttemptsRef.current += 1
        } catch {
          // no-op
        }
        window.setTimeout(() => {
          try {
            player.play()
            twitchPlayAttemptsRef.current += 1
          } catch {
            // no-op
          }
        }, 300)
        return
      }

      const nextMuted = !isMuted
      setIsMuted(nextMuted)
      try {
        player?.setMuted(nextMuted)
        player?.play()
      } catch {
        // no-op
      }
      return
    }

    const nextMuted = !isMuted
    setIsMuted(nextMuted)
  }

  const recoverPlayback = (): void => {
    if (!embedUrl) return
    if (platform === 'youtube') {
      tryResumeYoutubePlayback()
      return
    }
    if (platform === 'twitch') {
      try {
        twitchPlayerRef.current?.play()
        twitchPlayerRef.current?.setMuted(isMuted)
        return
      } catch {
        // fallback to reload below
      }
    }
    setReloadNonce((prev) => prev + 1)
  }



  const toggleFullscreen = async (): Promise<void> => {
    if (isIOS) {
      setIsPseudoFullscreen((prev) => !prev)
      return
    }

    const element = rootRef.current
    if (!element || typeof document === 'undefined') return

    const fullscreenElement = document.fullscreenElement
    const isCurrent = fullscreenElement === element

    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false)
      return
    }

    try {
      if (isCurrent) {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
          return
        }
        const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void }
        await doc.webkitExitFullscreen?.()
        return
      }

      if (element.requestFullscreen) {
        await element.requestFullscreen()
        return
      }

      const el = element as HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }
      if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen()
        return
      }
    } catch {
      // ignore and fallback below
    }

    setIsPseudoFullscreen(true)
  }


  useEffect(() => {
    if (!isPseudoFullscreen || typeof document === 'undefined') return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isPseudoFullscreen])


  const playerContent = (
    <div
      ref={rootRef}
      className={`flex flex-col bg-black overflow-hidden border-r border-b border-gray-800 ${
        isPseudoFullscreen ? 'fixed inset-0 z-[9999] h-[100dvh] w-screen border-0' : 'h-full'
      }`}
    >
      <div
        className="drag-handle h-6 flex items-center justify-between bg-gray-900 px-2 border-b border-gray-800 cursor-move select-none"
        style={{ touchAction: 'none' }}
      >
        <div className="flex items-center min-w-0 flex-1 gap-2">
          <div className="no-drag flex items-center gap-1 shrink-0">
            {sources.map((source) => {
              const isActive = source.sourceId === activeSource.sourceId
              const isSingleSource = sources.length === 1
              return (
                <button
                  key={source.sourceId}
                  type="button"
                  onClick={() => onSelectSource(source.sourceId)}
                  disabled={isSingleSource}
                  className={`h-5 w-6 rounded border transition flex items-center justify-center ${
                    isActive
                      ? 'bg-blue-700/80 border-blue-500'
                      : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                  } ${isSingleSource ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <Image
                    src={getPlatformIconSrc(source.platform)}
                    alt={source.platform}
                    width={13}
                    height={13}
                    className="h-3.5 w-3.5"
                    draggable={false}
                  />
                </button>
              )
            })}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[11px] md:text-xs font-semibold truncate text-gray-100 leading-none">
              {stream.title}
            </h3>
          </div>
        </div>
        <div className="no-drag flex items-center shrink-0">
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="h-7 w-7 md:h-6 md:w-6 flex items-center justify-center rounded hover:bg-gray-700 transition text-gray-300 hover:text-gray-100 touch-manipulation"
            aria-label="Toggle fullscreen"
          >
            <Expand className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>
          <button
            onClick={() => setIsConfirmOpen(true)}
            className="h-7 w-7 md:h-6 md:w-6 flex items-center justify-center rounded hover:bg-gray-700 transition text-gray-300 hover:text-red-400 touch-manipulation"
            aria-label={t('player.remove')}
          >
            <svg className="w-4 h-4 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 bg-black relative">
        <div className="player-live-content w-full h-full">
          {embedUrl ? (
            platform === 'twitch' ? (
              <div
                key={`${platform}:${activeSource.sourceId}:${reloadNonce}`}
                id={twitchContainerId}
                ref={twitchContainerRef}
                className="w-full h-full"
              />
            ) : (
              <iframe
                key={`${platform}:${activeSource.sourceId}:${reloadNonce}`}
                ref={iframeRef}
                src={embedUrl}
                className={`w-full h-full ${useNativePlayerControls ? 'pointer-events-auto' : 'pointer-events-none'}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                title={stream.title}
                referrerPolicy="strict-origin-when-cross-origin"
                tabIndex={-1}
                onLoad={() => {
                  if (platform === 'youtube') {
                    if (!isIOS) {
                      postYoutubeCommand('addEventListener', ['onReady'])
                      postYoutubeCommand('addEventListener', ['onStateChange'])
                      tryResumeYoutubePlayback()
                    }
                    postYoutubeCommand(isMuted ? 'mute' : 'unMute')
                  }
                }}
              />
            )
          ) : platform === 'youtube' && activeSource.consentRequired ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-yellow-600 bg-gray-950">
              <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4v2m0 0a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"
                />
              </svg>
              <p className="text-sm font-semibold">{t('player.consentRequired')}</p>
              <p className="text-xs text-gray-500 mt-1">
                YouTube requires consent to check this channel
              </p>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
              <p className="text-sm font-medium">{t('player.notStreaming')}</p>
              <p className="text-xs text-gray-600 mt-1">
                {platform === 'youtube' ? t('player.waiting') : activeSource.channelUrl}
              </p>
            </div>
          )}
        </div>
        {embedUrl && !useNativePlayerControls ? (
          platform === 'twitch' ? (
            <div className="absolute inset-0 z-10 pointer-events-none group">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  toggleMute()
                }}
                className="no-drag pointer-events-auto absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 rounded-full border border-gray-600/80 bg-black/55 p-1.5 text-gray-100 backdrop-blur-sm transition-opacity duration-150"
                aria-label={isMuted ? 'Unmute stream' : 'Mute stream'}
              >
                {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  recoverPlayback()
                }}
                className="no-drag pointer-events-auto absolute top-2 left-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 rounded-full border border-gray-600/80 bg-black/55 p-1.5 text-gray-100 backdrop-blur-sm transition-opacity duration-150"
                aria-label="Recover playback"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={toggleMute}
              className="absolute inset-0 z-10 cursor-pointer bg-transparent no-drag group"
              aria-label={isMuted ? 'Unmute stream' : 'Mute stream'}
            >
              <span className="pointer-events-none absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 rounded-full border border-gray-600/80 bg-black/55 p-1.5 text-gray-100 backdrop-blur-sm transition-opacity duration-150">
                {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation()
                  recoverPlayback()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    recoverPlayback()
                  }
                }}
                className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 rounded-full border border-gray-600/80 bg-black/55 p-1.5 text-gray-100 backdrop-blur-sm transition-opacity duration-150"
                aria-label="Recover playback"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </span>
            </button>
          )
        ) : null}
        <div className="player-dummy-content absolute inset-0 hidden items-center justify-center bg-gray-950 text-gray-400 text-xs font-medium tracking-wide">
          {t('player.adjusting')}
        </div>
      </div>
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('player.remove')}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              {t('player.removeConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 border-gray-700 text-gray-100 hover:bg-gray-700 hover:text-gray-100">
              {t('input.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                onRemove()
                setIsConfirmOpen(false)
              }}
            >
              {t('player.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )

  if (isPseudoFullscreen && portalReady && typeof document !== 'undefined') {
    return createPortal(playerContent, document.body)
  }

  return playerContent
}
