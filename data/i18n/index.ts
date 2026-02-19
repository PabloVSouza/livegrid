import { LOCALE_STORAGE_KEY, localeLabels, supportedLocales } from './config'
import { arMessages } from './locales/ar'
import { bnMessages } from './locales/bn'
import { enMessages } from './locales/en'
import { esMessages } from './locales/es'
import { frMessages } from './locales/fr'
import { hiMessages } from './locales/hi'
import { ptBrMessages } from './locales/ptBr'
import { ruMessages } from './locales/ru'
import { urMessages } from './locales/ur'
import { zhCnMessages } from './locales/zhCn'
import type { Locale, LocaleMessages, TranslationKey } from './types'

export const messages: Record<Locale, LocaleMessages> = {
  en: enMessages,
  'pt-BR': ptBrMessages,
  'zh-CN': zhCnMessages,
  hi: hiMessages,
  es: esMessages,
  fr: frMessages,
  ar: arMessages,
  bn: bnMessages,
  ru: ruMessages,
  ur: urMessages
}

export { LOCALE_STORAGE_KEY, localeLabels, supportedLocales }
export type { Locale, LocaleMessages, TranslationKey }
