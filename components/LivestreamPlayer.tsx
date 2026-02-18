'use client'

import { useEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import type { Livestream, LivestreamSource } from './types'
import { useI18n } from './i18n'
import { Volume2, VolumeX } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'

interface LivestreamPlayerProps {
  stream: Livestream
  onRemove: () => void
  onSelectSource: (sourceId: string) => void
}

const getSourceDisplayName = (source: LivestreamSource): string => {
  const platform = source.platform.toUpperCase()
  const channel = source.channelId || source.channelUrl
  return `${platform}: ${channel}`
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

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
  const canFallbackByUnknownStatus = activeSource.isLive !== false
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
  const embedUrl =
    platform === 'youtube'
      ? activeSource.videoId
        ? `https://www.youtube.com/embed/${activeSource.videoId}?${youtubeParams.toString()}`
        : canFallbackByUnknownStatus && activeSource.channelId
          ? `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(activeSource.channelId)}&${youtubeParams.toString()}`
        : null
      : platform === 'twitch'
        ? canFallbackByUnknownStatus && activeSource.channelId
          ? `https://player.twitch.tv/?channel=${encodeURIComponent(activeSource.channelId)}&parent=${encodeURIComponent(twitchParentHost)}&autoplay=true&muted=${isMuted ? 'true' : 'false'}`
          : null
        : canFallbackByUnknownStatus && activeSource.channelId
          ? `https://player.kick.com/${encodeURIComponent(activeSource.channelId)}?autoplay=true&muted=${isMuted ? 'true' : 'false'}`
          : null

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hostname) {
      setTwitchParentHost(window.location.hostname)
      setYoutubeOrigin(window.location.origin)
    }
  }, [])

  useEffect(() => {
    const iframeWindow = iframeRef.current?.contentWindow
    if (!iframeWindow || platform !== 'youtube' || !activeSource.videoId) return

    iframeWindow.postMessage(
      JSON.stringify({
        event: 'command',
        func: isMuted ? 'mute' : 'unMute',
        args: []
      }),
      '*'
    )
  }, [platform, activeSource.videoId, isMuted])

  const toggleMute = (): void => {
    if (!embedUrl) return
    setIsMuted((prev) => !prev)
  }

  return (
    <div className="flex flex-col h-full bg-black overflow-hidden border-r border-b border-gray-800">
      <div
        className="drag-handle h-6 flex items-center justify-between bg-gray-900 px-2 border-b border-gray-800 cursor-move select-none"
        style={{ touchAction: 'none' }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-semibold truncate text-gray-100 inline-block max-w-full leading-none">
              {stream.title}
            </h3>
          </div>
        </div>
        {sources.length > 1 && (
          <div className="no-drag ml-1 flex items-center gap-1">
            {sources.map((source) => {
              const isActive = source.sourceId === activeSource.sourceId
              return (
                <button
                  key={source.sourceId}
                  type="button"
                  onClick={() => onSelectSource(source.sourceId)}
                  title={`${t('player.source')}: ${getSourceDisplayName(source)}`}
                  className={`h-5 min-w-7 px-1 rounded border text-[10px] font-semibold transition cursor-pointer ${
                    isActive
                      ? 'bg-blue-700/80 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <span className={source.isLive ? 'text-red-400' : 'text-gray-500'}>●</span>
                  <img
                    src={getPlatformIconSrc(source.platform)}
                    alt={source.platform}
                    className="inline-block ml-1 h-3.5 w-3.5 align-middle"
                    draggable={false}
                  />
                </button>
              )
            })}
          </div>
        )}
        <button
          onClick={() => setIsConfirmOpen(true)}
          className="no-drag ml-1 h-7 w-7 md:h-6 md:w-6 flex items-center justify-center rounded hover:bg-gray-700 transition text-gray-300 hover:text-red-400 shrink-0 touch-manipulation"
          title={t('player.remove')}
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

      <div className="flex-1 bg-black relative">
        <div className="player-live-content w-full h-full">
          {embedUrl ? (
            <iframe
              key={`${platform}:${activeSource.sourceId}`}
              ref={iframeRef}
              src={embedUrl}
              className="w-full h-full pointer-events-none"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              title={stream.title}
              referrerPolicy="strict-origin-when-cross-origin"
              tabIndex={-1}
            />
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
        {embedUrl ? (
          <button
            type="button"
            onClick={toggleMute}
            className="absolute inset-0 z-10 cursor-pointer bg-transparent no-drag group"
            title={isMuted ? 'Unmute' : 'Mute'}
            aria-label={isMuted ? 'Unmute stream' : 'Mute stream'}
          >
            <span className="pointer-events-none absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 rounded-full border border-gray-600/80 bg-black/55 p-1.5 text-gray-100 backdrop-blur-sm transition-opacity duration-150">
              {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </span>
          </button>
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
}
