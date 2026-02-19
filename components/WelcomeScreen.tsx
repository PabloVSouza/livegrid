'use client'

import { useEffect, useState } from 'react'
import type { FC } from 'react'
import Image from 'next/image'
import type { PresetDefinition } from '@data/presets'
import { Button } from '@ui/button'
import { Info, Pencil, Trash2 } from 'lucide-react'
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@ui/dialog'

interface ChannelPreview {
  title: string
  platforms: Array<'youtube' | 'twitch' | 'kick'>
}
interface ProjectPreview {
  id: string
  name: string
  channelsCount: number
  channels: ChannelPreview[]
}

interface WelcomeScreenProps {
  title: string
  subtitle: string
  createLabel: string
  projectsTitle: string
  openProjectLabel: string
  editProjectLabel: string
  deleteProjectLabel: string
  deleteProjectConfirm: string
  cancelLabel: string
  noProjectsLabel: string
  channelsLabel: string
  presetsTitle: string
  importLabel: string
  importingLabel: string
  presets: PresetDefinition[]
  projects: ProjectPreview[]
  loadingPresetId: string | null
  onCreateBlank: () => void
  onOpenProject: (projectId: string) => void
  onRenameProject: (projectId: string, name: string) => void
  onDeleteProject: (projectId: string) => void
  onImportPreset: (preset: PresetDefinition) => void
}

export const WelcomeScreen: FC<WelcomeScreenProps> = ({
  title,
  subtitle,
  createLabel,
  projectsTitle,
  openProjectLabel,
  editProjectLabel,
  deleteProjectLabel,
  deleteProjectConfirm,
  cancelLabel,
  noProjectsLabel,
  channelsLabel,
  presetsTitle,
  importLabel,
  importingLabel,
  presets,
  projects,
  loadingPresetId,
  onCreateBlank,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onImportPreset
}) => {
  const [pendingDeleteProject, setPendingDeleteProject] = useState<ProjectPreview | null>(null)
  const [openDetailsId, setOpenDetailsId] = useState<string | null>(null)
  const [pendingRenameProject, setPendingRenameProject] = useState<ProjectPreview | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest("[data-channel-details-root='true']")) return
      setOpenDetailsId(null)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [])

  const getPlatformId = (source: string): 'youtube' | 'twitch' | 'kick' => {
    const input = source.trim().toLowerCase()
    if (input.startsWith('twitch:') || input.includes('twitch.tv/')) return 'twitch'
    if (input.startsWith('kick:') || input.includes('kick.com/')) return 'kick'
    return 'youtube'
  }

  const getPlatformIconSrc = (platform: 'youtube' | 'twitch' | 'kick'): string => {
    if (platform === 'youtube') return '/platforms/youtube.svg'
    if (platform === 'twitch') return '/platforms/twitch.svg'
    return '/platforms/kick.svg'
  }

  const getPresetEntries = (preset: PresetDefinition): ChannelPreview[] => {
    const entries =
      preset.entries?.map((entry) => ({
        title: entry.title?.trim() || entry.sources[0] || 'Channel',
        sources: entry.sources
      })) ??
      (preset.channels ?? []).map((channel) => ({
        title: channel,
        sources: [channel]
      }))

    return entries.map((entry) => ({
      title: entry.title,
      platforms: Array.from(new Set(entry.sources.map(getPlatformId)))
    }))
  }

  const ChannelDetailsTrigger: FC<{
    detailsId: string
    channels: ChannelPreview[]
    className?: string
  }> = ({ detailsId, channels, className }) => (
    <div data-channel-details-root="true" className={`relative ${className ?? ''}`}>
      <button
        type="button"
        aria-label={channelsLabel}
        title={channelsLabel}
        onClick={() => {
          setOpenDetailsId((current) => (current === detailsId ? null : detailsId))
        }}
        className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-100 transition"
      >
        <Info className="size-4" />
      </button>
      {openDetailsId === detailsId && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded border border-gray-800 bg-gray-950 px-3 py-2 shadow-xl animate-details-pop origin-top-right">
          <div className="space-y-1.5 max-h-56 overflow-auto">
            {channels.map((channel, index) => (
              <div key={`${detailsId}-${index}`} className="text-xs text-gray-300">
                <p className="text-gray-100 font-medium truncate">{channel.title}</p>
                <div className="mt-1 flex items-center gap-1">
                  {channel.platforms.map((platform, platformIndex) => (
                    <Image
                      key={`${detailsId}-${index}-${platformIndex}`}
                      src={getPlatformIconSrc(platform)}
                      alt={platform}
                      width={14}
                      height={14}
                      className="h-3.5 w-3.5"
                      draggable={false}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div
      className="relative w-full h-full overflow-auto bg-black"
      style={{
        backgroundColor: '#030712',
        backgroundImage:
          'linear-gradient(to right, rgba(59,130,246,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(59,130,246,0.12) 1px, transparent 1px)',
        backgroundSize: '320px 180px',
        backgroundPosition: '0 0, 0 0'
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
        <Image
          src="/livegrid-logo.svg"
          alt=""
          aria-hidden="true"
          width={1400}
          height={320}
          className="w-[70vw] max-w-4xl min-w-64 h-auto opacity-[0.06] grayscale contrast-125 saturate-0 select-none"
          draggable={false}
          priority
        />
      </div>
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold text-white mb-2">{title}</h2>
          <p className="text-gray-400 text-lg">{subtitle}</p>
        </div>

        <div className="flex justify-center mb-10">
          <Button onClick={onCreateBlank} className="bg-blue-600 hover:bg-blue-700 text-white px-6">
            {createLabel}
          </Button>
        </div>

        <div className="mb-10">
          <h3 className="text-xl font-semibold text-white mb-4">{projectsTitle}</h3>
          {projects.length === 0 ? (
            <div className="rounded-lg border border-gray-800 bg-gray-950 px-4 py-6 text-center text-gray-400">
              {noProjectsLabel}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div key={project.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-1">
                      <h4
                        className="text-white font-semibold truncate"
                        style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}
                      >
                        {project.name}
                      </h4>
                      <button
                        type="button"
                        title={editProjectLabel}
                        aria-label={editProjectLabel}
                        onClick={() => {
                          setPendingRenameProject(project)
                          setRenameValue(project.name)
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-100 transition shrink-0"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title={deleteProjectLabel}
                        aria-label={deleteProjectLabel}
                        onClick={() => setPendingDeleteProject(project)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-red-400 transition"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-1 mb-3">
                    <p className="text-gray-400 text-sm">
                      {project.channelsCount} {channelsLabel}
                    </p>
                    <ChannelDetailsTrigger
                      detailsId={`project-${project.id}`}
                      channels={project.channels}
                    />
                  </div>
                  <Button
                    onClick={() => onOpenProject(project.id)}
                    className="w-full bg-gray-800 hover:bg-gray-700 text-white"
                  >
                    {openProjectLabel}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xl font-semibold text-white mb-4">{presetsTitle}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="bg-gray-900 border border-gray-800 rounded-lg overflow-visible flex flex-col"
              >
                <div className="relative w-full h-40">
                  <Image
                    src={preset.image}
                    alt={preset.name}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover rounded-t-lg"
                  />
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h4 className="text-white font-semibold mb-1">{preset.name}</h4>
                  <p className="text-gray-400 text-sm mb-3 flex-1">{preset.description}</p>
                  <div className="mb-2 flex items-center gap-1">
                    <p className="text-gray-400 text-xs">
                      {getPresetEntries(preset).length} {channelsLabel}
                    </p>
                    <ChannelDetailsTrigger
                      detailsId={`preset-${preset.id}`}
                      channels={getPresetEntries(preset)}
                    />
                  </div>
                  <Button
                    onClick={() => onImportPreset(preset)}
                    disabled={loadingPresetId === preset.id}
                    className="w-full bg-gray-800 hover:bg-gray-700 text-white"
                  >
                    {loadingPresetId === preset.id ? importingLabel : importLabel}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AlertDialog
        open={pendingDeleteProject !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteProject(null)
        }}
      >
        <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteProjectLabel}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              {deleteProjectConfirm}
              {pendingDeleteProject ? (
                <span className="block mt-2 text-white font-medium">
                  {pendingDeleteProject.name}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 border-gray-700 text-gray-100 hover:bg-gray-700 hover:text-gray-100">
              {cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (pendingDeleteProject) {
                  onDeleteProject(pendingDeleteProject.id)
                }
                setPendingDeleteProject(null)
              }}
            >
              {deleteProjectLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={pendingRenameProject !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRenameProject(null)
            setRenameValue('')
          }
        }}
      >
        <DialogContent className="max-w-md bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>{editProjectLabel}</DialogTitle>
          </DialogHeader>
          <input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            className="w-full px-2 py-1 bg-gray-800 border border-gray-700 text-sm rounded focus:outline-none focus:border-blue-500 transition"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && pendingRenameProject && renameValue.trim()) {
                event.preventDefault()
                onRenameProject(pendingRenameProject.id, renameValue.trim())
                setPendingRenameProject(null)
                setRenameValue('')
              }
            }}
          />
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPendingRenameProject(null)
                setRenameValue('')
              }}
              className="bg-gray-900 border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-gray-100"
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!pendingRenameProject || !renameValue.trim()) return
                onRenameProject(pendingRenameProject.id, renameValue.trim())
                setPendingRenameProject(null)
                setRenameValue('')
              }}
              className="bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
            >
              {editProjectLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <style>{`
        @keyframes details-pop {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-details-pop {
          animation: details-pop 180ms ease-out;
        }
      `}</style>
    </div>
  )
}
