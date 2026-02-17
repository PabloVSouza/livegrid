"use client"

import { useState } from "react"
import type { FC } from "react"
import { Button } from "@/components/ui/button"
import type { PresetDefinition } from "@/data/presets"
import { Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ProjectPreview {
  id: string
  name: string
  channelsCount: number
}

interface WelcomeScreenProps {
  title: string
  subtitle: string
  createLabel: string
  projectsTitle: string
  openProjectLabel: string
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
  onDeleteProject: (projectId: string) => void
  onImportPreset: (preset: PresetDefinition) => void
}

export const WelcomeScreen: FC<WelcomeScreenProps> = ({
  title,
  subtitle,
  createLabel,
  projectsTitle,
  openProjectLabel,
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
  onDeleteProject,
  onImportPreset
}) => {
  const [pendingDeleteProject, setPendingDeleteProject] = useState<ProjectPreview | null>(null)

  return (
    <div className="w-full h-full overflow-auto bg-black">
      <div className="max-w-6xl mx-auto px-6 py-10">
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
                    <h4 className="text-white font-semibold truncate">{project.name}</h4>
                    <button
                      type="button"
                      title={deleteProjectLabel}
                      aria-label={deleteProjectLabel}
                      onClick={() => setPendingDeleteProject(project)}
                      className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-red-400 transition"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <p className="text-gray-400 text-sm mt-1 mb-3">
                    {project.channelsCount} {channelsLabel}
                  </p>
                  <Button onClick={() => onOpenProject(project.id)} className="w-full bg-gray-800 hover:bg-gray-700 text-white">
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
                className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col"
              >
                <img src={preset.image} alt={preset.name} className="w-full h-40 object-cover" />
                <div className="p-4 flex-1 flex flex-col">
                  <h4 className="text-white font-semibold mb-1">{preset.name}</h4>
                  <p className="text-gray-400 text-sm mb-3 flex-1">{preset.description}</p>
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
                <span className="block mt-2 text-white font-medium">{pendingDeleteProject.name}</span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-gray-800 border-gray-700 text-gray-100 hover:bg-gray-700 hover:text-gray-100"
            >
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
    </div>
  )
}
