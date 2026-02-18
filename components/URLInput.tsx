"use client"

import type { FC, ReactNode } from "react"
import { useState } from "react"
import { useI18n } from "./i18n"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface URLInputProps {
  onAddMany: (entries: Array<{ title: string; sources: string[] }>) => Promise<void>
  trigger?: ReactNode
}

export const URLInput: FC<URLInputProps> = ({ onAddMany, trigger }) => {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [channelsInput, setChannelsInput] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const isValidChannelInput = (value: string): boolean => {
    const input = value.trim()
    if (!input) return false

    if (/^twitch:[a-zA-Z0-9_]{3,30}$/i.test(input)) return true
    if (/^kick:[a-zA-Z0-9_-]{3,40}$/i.test(input)) return true
    if (/^https?:\/\/(?:www\.)?twitch\.tv\/[a-zA-Z0-9_]{3,30}(?:[/?#].*)?$/i.test(input)) return true
    if (/^https?:\/\/(?:www\.)?kick\.com\/[a-zA-Z0-9_-]{3,40}(?:[/?#].*)?$/i.test(input)) return true

    if (/^@[^\s]+$/u.test(input)) return true
    if (/^UC[\w-]{22}$/.test(input)) return true
    if (/youtube\.com\/@[^\s/?#]+/u.test(input)) return true
    if (/youtube\.com\/c\/[^\s/?#]+/u.test(input)) return true
    if (/youtube\.com\/channel\/[a-zA-Z0-9_-]+/u.test(input)) return true

    return false
  }

  const parseLine = (line: string): { title: string; sources: string[] } => {
    const trimmed = line.trim()
    const pipeIndex = trimmed.indexOf("|")
    if (pipeIndex === -1) {
      return {
        title: "",
        sources: [trimmed]
      }
    }

    const title = trimmed.slice(0, pipeIndex).trim()
    const sourcesRaw = trimmed.slice(pipeIndex + 1)
    const sources = sourcesRaw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)

    return { title, sources }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const lines = channelsInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    if (lines.length === 0) {
      setError(t("input.enterAtLeastOne"))
      return
    }

    const parsedEntries = lines.map(parseLine)
    const invalidIndexes = parsedEntries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.sources.length === 0 || entry.sources.some((ref) => !isValidChannelInput(ref)))
      .map(({ index }) => index + 1)

    if (invalidIndexes.length > 0) {
      setError(t("input.invalidLines", { lines: invalidIndexes.join(", ") }))
      return
    }

    try {
      setIsLoading(true)
      await onAddMany(parsedEntries)
      setChannelsInput("")
      setIsOpen(false)
    } catch (err) {
      setError(t("input.failedToAdd"))
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) setError("")
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? <Button variant="default">{t("input.addChannel")}</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-md bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle>{t("input.modalTitle")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="url" className="block text-xs font-medium mb-1">
              {t("input.channelsPerLine")}
            </label>
            <textarea
              id="url"
              value={channelsInput}
              onChange={(e) => {
                setChannelsInput(e.target.value)
                setError("")
              }}
              placeholder={
                "@youtube_handle\nViagem | @acfperformance, twitch:acfperformance, kick:acfperformance\nhttps://www.twitch.tv/channel"
              }
              className="w-full px-2 py-1 bg-gray-800 border border-gray-700 text-sm rounded focus:outline-none focus:border-blue-500 transition min-h-32"
              disabled={isLoading}
            />
            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
            <p className="text-gray-500 text-xs mt-1">{t("input.supports")}</p>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
              className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
            >
              {t("input.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
            >
              {isLoading ? t("input.fetching") : t("input.addChannels")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
