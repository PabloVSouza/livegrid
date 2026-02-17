"use client"

import type { FC } from "react"
import type { Livestream } from "./types"
import { useI18n } from "./i18n"

interface LivestreamPlayerProps {
  stream: Livestream
  onRemove: () => void
}

export const LivestreamPlayer: FC<LivestreamPlayerProps> = ({ stream, onRemove }) => {
  const { t } = useI18n()
  const embedUrl = stream.videoId
    ? `https://www.youtube.com/embed/${stream.videoId}?autoplay=1&controls=1&mute=1`
    : null

  return (
    <div className="flex flex-col h-full bg-black overflow-hidden border-r border-b border-gray-800">
      <div
        className="drag-handle flex items-center justify-between bg-gray-900 px-2 py-1 border-b border-gray-800 cursor-move select-none"
        style={{ touchAction: "none" }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate text-gray-100 inline-block max-w-full">{stream.title}</h3>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="ml-1 p-1 hover:bg-gray-700 transition text-gray-400 hover:text-red-400 flex-shrink-0"
          title={t("player.remove")}
          aria-label={t("player.remove")}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 bg-black relative">
        <div className="player-live-content w-full h-full">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={stream.title}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
              <p className="text-sm font-medium">{t("player.notStreaming")}</p>
              <p className="text-xs text-gray-600 mt-1">{t("player.waiting")}</p>
            </div>
          )}
        </div>
        <div className="player-dummy-content absolute inset-0 hidden items-center justify-center bg-gray-950 text-gray-400 text-xs font-medium tracking-wide">
          {t("player.adjusting")}
        </div>
      </div>
    </div>
  )
}
