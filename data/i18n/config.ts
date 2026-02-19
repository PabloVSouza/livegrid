import type { Locale } from './types'

export const LOCALE_STORAGE_KEY = 'youtube_app_locale_v1'
export const supportedLocales: Locale[] = [
  'en',
  'zh-CN',
  'hi',
  'es',
  'fr',
  'ar',
  'bn',
  'pt-BR',
  'ru',
  'ur'
]

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  hi: 'हिन्दी',
  es: 'Español',
  fr: 'Français',
  ar: 'العربية',
  bn: 'বাংলা',
  'pt-BR': 'Português (Brasil)',
  ru: 'Русский',
  ur: 'اردو'
}
