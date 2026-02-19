'use client'

import type { FC } from 'react'
import Image from 'next/image'
import { useI18n } from '@components/i18n'

interface AboutModalProps {
  isOpen: boolean
  onClose: () => void
}

const WEBSITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://livegrid.pablosouza.dev'
const REPOSITORY_URL =
  process.env.NEXT_PUBLIC_REPOSITORY_URL?.trim() || 'https://github.com/PabloVSouza/live-grid'

export const AboutModal: FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const { t } = useI18n()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <div className="bg-gray-950/80 border-b border-gray-800 px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Image
              src="/livegrid-logo.svg"
              alt="LiveGrid logo"
              width={220}
              height={48}
              className="h-10 w-auto"
            />
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
            aria-label={t('about.close')}
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm text-gray-300">
          <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-4">
            <p>{t('about.description')}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-3">
              <p className="text-gray-400 mb-1">{t('about.developer')}</p>
              <p className="text-white font-medium">Pablo Souza</p>
            </div>
            <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-3">
              <p className="text-gray-400 mb-1">{t('about.stack')}</p>
              <p className="text-white">Next.js, React, TypeScript, react-grid-layout</p>
            </div>
          </div>

          <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-3">
            <p className="text-gray-400 mb-1">{t('about.repository')}</p>
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:text-blue-300 underline break-all"
            >
              {REPOSITORY_URL}
            </a>
          </div>


          <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-3">
            <p className="text-gray-400 mb-1">{t('about.website')}</p>
            <a
              href={WEBSITE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:text-blue-300 underline break-all"
            >
              {WEBSITE_URL}
            </a>
          </div>
        </div>

        <div className="px-5 pb-5 pt-1 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded transition"
          >
            {t('about.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
