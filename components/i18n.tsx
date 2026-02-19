'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import {
  LOCALE_STORAGE_KEY,
  localeLabels,
  messages,
  supportedLocales,
  type Locale,
  type TranslationKey
} from '@data/i18n'

const detectLocale = (): Locale => {
  if (typeof navigator === 'undefined') return 'en'
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase()
    if (lower === 'pt-br' || lower.startsWith('pt-')) return 'pt-BR'
    if (lower === 'zh-cn' || lower === 'zh-hans' || lower.startsWith('zh-')) return 'zh-CN'
    if (lower === 'hi' || lower.startsWith('hi-')) return 'hi'
    if (lower === 'es' || lower.startsWith('es-')) return 'es'
    if (lower === 'fr' || lower.startsWith('fr-')) return 'fr'
    if (lower === 'ar' || lower.startsWith('ar-')) return 'ar'
    if (lower === 'bn' || lower.startsWith('bn-')) return 'bn'
    if (lower === 'ru' || lower.startsWith('ru-')) return 'ru'
    if (lower === 'ur' || lower.startsWith('ur-')) return 'ur'
    if (lower === 'en' || lower.startsWith('en-')) return 'en'
  }
  return 'en'
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  locales: Locale[]
  t: (key: TranslationKey, vars?: Record<string, string>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export const I18nProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState<Locale>('en')

  useEffect(() => {
    const stored =
      typeof window !== 'undefined' ? window.localStorage.getItem(LOCALE_STORAGE_KEY) : null
    if (stored && supportedLocales.includes(stored as Locale)) {
      setLocale(stored as Locale)
      return
    }
    setLocale(detectLocale())
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)

    const htmlLang = locale === 'pt-BR' ? 'pt-BR' : locale
    document.documentElement.lang = htmlLang
  }, [locale])

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      locales: supportedLocales,
      t: (key, vars) => {
        let text = messages[locale][key] ?? messages.en[key] ?? key
        if (vars) {
          for (const [name, value] of Object.entries(vars)) {
            text = text.replace(new RegExp(`\{${name}\}`, 'g'), value)
          }
        }
        return text
      }
    }),
    [locale]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}

export { localeLabels }
export type { Locale, TranslationKey }
