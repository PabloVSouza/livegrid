'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'

export type Locale = 'en' | 'zh-CN' | 'hi' | 'es' | 'fr' | 'ar' | 'bn' | 'pt-BR' | 'ru' | 'ur'
const LOCALE_STORAGE_KEY = 'youtube_app_locale_v1'
const supportedLocales: Locale[] = [
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

type TranslationKey =
  | 'app.title'
  | 'app.about'
  | 'app.language'
  | 'app.projects'
  | 'app.presets'
  | 'app.newProject'
  | 'app.deleteProject'
  | 'app.createFromPreset'
  | 'app.currentProject'
  | 'app.projectPrompt'
  | 'app.projectDeleteConfirm'
  | 'welcome.title'
  | 'welcome.subtitle'
  | 'welcome.create'
  | 'welcome.projects'
  | 'welcome.openProject'
  | 'welcome.deleteProject'
  | 'welcome.deleteProjectConfirm'
  | 'welcome.noProjects'
  | 'welcome.channels'
  | 'welcome.presets'
  | 'welcome.importPreset'
  | 'welcome.importing'
  | 'app.empty'
  | 'app.loading'
  | 'about.title'
  | 'about.description'
  | 'about.developer'
  | 'about.stack'
  | 'about.repository'
  | 'about.website'
  | 'about.close'
  | 'input.addChannel'
  | 'input.modalTitle'
  | 'input.channelsPerLine'
  | 'input.enterAtLeastOne'
  | 'input.invalidLines'
  | 'input.failedToAdd'
  | 'input.supports'
  | 'input.fetching'
  | 'input.addChannels'
  | 'input.cancel'
  | 'player.remove'
  | 'player.notStreaming'
  | 'player.consentRequired'
  | 'player.waiting'
  | 'player.adjusting'

const messages: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  en: {
    'app.title': 'LiveGrid',
    'app.about': 'About',
    'app.language': 'Language',
    'app.projects': 'Projects',
    'app.presets': 'Presets',
    'app.newProject': 'New Project',
    'app.deleteProject': 'Delete Project',
    'app.createFromPreset': 'Create from preset',
    'app.currentProject': 'Current project',
    'app.projectPrompt': 'Project name',
    'app.projectDeleteConfirm': 'Delete current project?',
    'welcome.title': 'Welcome to LiveGrid',
    'welcome.subtitle': 'Create a blank grid or start from a preset.',
    'welcome.create': 'Create Blank Grid',
    'welcome.projects': 'Your Projects',
    'welcome.openProject': 'Open Project',
    'welcome.deleteProject': 'Delete Project',
    'welcome.deleteProjectConfirm': 'Delete this project?',
    'welcome.noProjects': 'No projects yet. Create a blank grid or import a preset.',
    'welcome.channels': 'channels',
    'welcome.presets': 'Featured Projects',
    'welcome.importPreset': 'Import Preset',
    'welcome.importing': 'Importing...',
    'app.empty': 'Add your first livestream to get started',
    'app.loading': 'Loading channels...',
    'about.title': 'About LiveGrid',
    'about.description':
      'LiveGrid is a livestream monitor to watch multiple YouTube channels in a single dynamic grid.',
    'about.developer': 'Developer',
    'about.stack': 'Stack',
    'about.repository': 'Repository (Open Source)',
    'about.website': 'Official website',
    'about.close': 'Close',
    'input.addChannel': '+ Add Channel',
    'input.modalTitle': 'Add Channel',
    'input.channelsPerLine': 'Channels (one per line)',
    'input.enterAtLeastOne': 'Please enter at least one channel',
    'input.invalidLines': 'Invalid channel input on line(s): {lines}',
    'input.failedToAdd': 'Failed to add one or more channels. Check the URLs and try again.',
    'input.supports': 'Supports per line: @handle, UC..., or YouTube channel URL.',
    'input.fetching': 'Fetching...',
    'input.addChannels': 'Add Channels',
    'input.cancel': 'Cancel',
    'player.remove': 'Remove stream',
    'player.notStreaming': 'Channel not streaming right now',
    'player.consentRequired': 'Consent Required',
    'player.waiting': 'Waiting for this channel to go live',
    'player.adjusting': 'Adjusting layout...'
  },
  'pt-BR': {
    'app.title': 'LiveGrid',
    'app.about': 'Sobre',
    'app.language': 'Idioma',
    'app.projects': 'Projetos',
    'app.presets': 'Presets',
    'app.newProject': 'Novo Projeto',
    'app.deleteProject': 'Excluir Projeto',
    'app.createFromPreset': 'Criar do preset',
    'app.currentProject': 'Projeto atual',
    'app.projectPrompt': 'Nome do projeto',
    'app.projectDeleteConfirm': 'Excluir o projeto atual?',
    'welcome.title': 'Bem-vindo ao LiveGrid',
    'welcome.subtitle': 'Crie um grid vazio ou comece com um preset.',
    'welcome.create': 'Criar Grid Vazio',
    'welcome.projects': 'Seus Projetos',
    'welcome.openProject': 'Abrir Projeto',
    'welcome.deleteProject': 'Excluir Projeto',
    'welcome.deleteProjectConfirm': 'Excluir este projeto?',
    'welcome.noProjects': 'Nenhum projeto ainda. Crie um grid vazio ou importe um preset.',
    'welcome.channels': 'canais',
    'welcome.presets': 'Projetos em destaque',
    'welcome.importPreset': 'Importar Preset',
    'welcome.importing': 'Importando...',
    'app.empty': 'Adicione sua primeira live para começar',
    'app.loading': 'Carregando canais...',
    'about.title': 'Sobre o LiveGrid',
    'about.description':
      'LiveGrid é um monitor de lives para assistir múltiplos canais do YouTube em um único grid com layout dinâmico.',
    'about.developer': 'Desenvolvedor',
    'about.stack': 'Stack',
    'about.repository': 'Repositório (Open Source)',
    'about.website': 'Site oficial',
    'about.close': 'Fechar',
    'input.addChannel': '+ Adicionar Canal',
    'input.modalTitle': 'Adicionar Canal',
    'input.channelsPerLine': 'Canais (um por linha)',
    'input.enterAtLeastOne': 'Digite pelo menos um canal',
    'input.invalidLines': 'Entrada de canal inválida na(s) linha(s): {lines}',
    'input.failedToAdd':
      'Falha ao adicionar um ou mais canais. Verifique as URLs e tente novamente.',
    'input.supports': 'Suporta por linha: @handle, UC..., ou URL de canal do YouTube.',
    'input.fetching': 'Buscando...',
    'input.addChannels': 'Adicionar Canais',
    'input.cancel': 'Cancelar',
    'player.remove': 'Remover stream',
    'player.notStreaming': 'Canal não está transmitindo agora',
    'player.consentRequired': 'Consentimento Obrigatório',
    'player.waiting': 'Aguardando este canal entrar ao vivo',
    'player.adjusting': 'Ajustando layout...'
  },
  'zh-CN': {
    'app.title': 'LiveGrid',
    'app.language': '语言',
    'app.empty': '添加你的第一个直播开始使用',
    'app.loading': '正在加载频道...',
    'input.addChannel': '+ 添加频道',
    'input.modalTitle': '添加频道',
    'input.channelsPerLine': '频道（每行一个）',
    'input.enterAtLeastOne': '请至少输入一个频道',
    'input.invalidLines': '第 {lines} 行频道输入无效',
    'input.failedToAdd': '添加一个或多个频道失败。请检查 URL 后重试。',
    'input.supports': '每行支持：@handle、UC... 或 YouTube 频道 URL。',
    'input.fetching': '获取中...',
    'input.addChannels': '添加频道',
    'input.cancel': '取消',
    'player.remove': '移除直播',
    'player.notStreaming': '频道当前未在直播',
    'player.consentRequired': '需要同意',
    'player.waiting': '等待该频道开播',
    'player.adjusting': '正在调整布局...'
  },
  hi: {
    'app.title': 'LiveGrid',
    'app.language': 'भाषा',
    'app.empty': 'शुरू करने के लिए अपनी पहली लाइवस्ट्रीम जोड़ें',
    'app.loading': 'चैनल लोड हो रहे हैं...',
    'input.addChannel': '+ चैनल जोड़ें',
    'input.modalTitle': 'चैनल जोड़ें',
    'input.channelsPerLine': 'चैनल (प्रति पंक्ति एक)',
    'input.enterAtLeastOne': 'कृपया कम से कम एक चैनल दर्ज करें',
    'input.invalidLines': 'लाइन {lines} पर चैनल इनपुट अमान्य है',
    'input.failedToAdd': 'एक या अधिक चैनल जोड़ने में विफल। URL जाँचें और फिर प्रयास करें।',
    'input.supports': 'प्रति पंक्ति समर्थित: @handle, UC..., या YouTube चैनल URL।',
    'input.fetching': 'लोड हो रहा है...',
    'input.addChannels': 'चैनल जोड़ें',
    'input.cancel': 'रद्द करें',
    'player.remove': 'स्ट्रीम हटाएँ',
    'player.notStreaming': 'चैनल अभी स्ट्रीम नहीं कर रहा है',
    'player.consentRequired': 'सहमति आवश्यक है',
    'player.waiting': 'इस चैनल के लाइव होने का इंतज़ार है',
    'player.adjusting': 'लेआउट समायोजित हो रहा है...'
  },
  es: {
    'app.title': 'LiveGrid',
    'app.language': 'Idioma',
    'app.empty': 'Agrega tu primer directo para comenzar',
    'app.loading': 'Cargando canales...',
    'input.addChannel': '+ Agregar canal',
    'input.modalTitle': 'Agregar canal',
    'input.channelsPerLine': 'Canales (uno por línea)',
    'input.enterAtLeastOne': 'Ingresa al menos un canal',
    'input.invalidLines': 'Entrada de canal inválida en la(s) línea(s): {lines}',
    'input.failedToAdd':
      'No se pudo agregar uno o más canales. Revisa las URL e inténtalo de nuevo.',
    'input.supports': 'Compatible por línea: @handle, UC... o URL de canal de YouTube.',
    'input.fetching': 'Cargando...',
    'input.addChannels': 'Agregar canales',
    'input.cancel': 'Cancelar',
    'player.remove': 'Eliminar stream',
    'player.notStreaming': 'El canal no está transmitiendo ahora',
    'player.consentRequired': 'Se requiere consentimiento',
    'player.waiting': 'Esperando a que este canal entre en vivo',
    'player.adjusting': 'Ajustando diseño...'
  },
  fr: {
    'app.title': 'LiveGrid',
    'app.language': 'Langue',
    'app.empty': 'Ajoutez votre premier live pour commencer',
    'app.loading': 'Chargement des chaînes...',
    'input.addChannel': '+ Ajouter une chaîne',
    'input.modalTitle': 'Ajouter une chaîne',
    'input.channelsPerLine': 'Chaînes (une par ligne)',
    'input.enterAtLeastOne': 'Veuillez saisir au moins une chaîne',
    'input.invalidLines': 'Entrée de chaîne invalide à la/aux ligne(s) : {lines}',
    'input.failedToAdd':
      "Impossible d'ajouter une ou plusieurs chaînes. Vérifiez les URL puis réessayez.",
    'input.supports': 'Pris en charge par ligne : @handle, UC... ou URL de chaîne YouTube.',
    'input.fetching': 'Récupération...',
    'input.addChannels': 'Ajouter des chaînes',
    'input.cancel': 'Annuler',
    'player.remove': 'Supprimer le stream',
    'player.notStreaming': 'La chaîne ne diffuse pas en ce moment',
    'player.consentRequired': 'Consentement requis',
    'player.waiting': 'En attente du démarrage du live',
    'player.adjusting': 'Ajustement de la mise en page...'
  },
  ar: {
    'app.title': 'LiveGrid',
    'app.language': 'اللغة',
    'app.empty': 'أضف أول بث مباشر للبدء',
    'app.loading': 'جارٍ تحميل القنوات...',
    'input.addChannel': '+ إضافة قناة',
    'input.modalTitle': 'إضافة قناة',
    'input.channelsPerLine': 'القنوات (واحدة في كل سطر)',
    'input.enterAtLeastOne': 'الرجاء إدخال قناة واحدة على الأقل',
    'input.invalidLines': 'إدخال قناة غير صالح في السطر/الأسطر: {lines}',
    'input.failedToAdd': 'فشل في إضافة قناة واحدة أو أكثر. تحقق من الروابط ثم حاول مرة أخرى.',
    'input.supports': 'مدعوم لكل سطر: @handle أو UC... أو رابط قناة YouTube.',
    'input.fetching': 'جارٍ الجلب...',
    'input.addChannels': 'إضافة قنوات',
    'input.cancel': 'إلغاء',
    'player.remove': 'إزالة البث',
    'player.notStreaming': 'القناة لا تبث الآن',
    'player.consentRequired': 'موافقة مطلوبة',
    'player.waiting': 'بانتظار أن تبدأ هذه القناة البث',
    'player.adjusting': 'جارٍ ضبط التخطيط...'
  },
  bn: {
    'app.title': 'LiveGrid',
    'app.language': 'ভাষা',
    'app.empty': 'শুরু করতে আপনার প্রথম লাইভস্ট্রিম যোগ করুন',
    'app.loading': 'চ্যানেল লোড হচ্ছে...',
    'input.addChannel': '+ চ্যানেল যোগ করুন',
    'input.modalTitle': 'চ্যানেল যোগ করুন',
    'input.channelsPerLine': 'চ্যানেল (প্রতি লাইনে একটি)',
    'input.enterAtLeastOne': 'কমপক্ষে একটি চ্যানেল লিখুন',
    'input.invalidLines': 'লাইন {lines}-এ চ্যানেল ইনপুট অবৈধ',
    'input.failedToAdd': 'এক বা একাধিক চ্যানেল যোগ করা যায়নি। URL যাচাই করে আবার চেষ্টা করুন।',
    'input.supports': 'প্রতি লাইনে সমর্থিত: @handle, UC..., অথবা YouTube চ্যানেল URL।',
    'input.fetching': 'আনা হচ্ছে...',
    'input.addChannels': 'চ্যানেল যোগ করুন',
    'input.cancel': 'বাতিল',
    'player.remove': 'স্ট্রিম সরান',
    'player.notStreaming': 'চ্যানেলটি এখন স্ট্রিম করছে না',
    'player.consentRequired': 'সম্মতি প্রয়োজন',
    'player.waiting': 'এই চ্যানেল লাইভ হওয়ার অপেক্ষায়',
    'player.adjusting': 'লেআউট সমন্বয় করা হচ্ছে...'
  },
  ru: {
    'app.title': 'LiveGrid',
    'app.language': 'Язык',
    'app.empty': 'Добавьте первый стрим, чтобы начать',
    'app.loading': 'Загрузка каналов...',
    'input.addChannel': '+ Добавить канал',
    'input.modalTitle': 'Добавить канал',
    'input.channelsPerLine': 'Каналы (по одному в строке)',
    'input.enterAtLeastOne': 'Введите хотя бы один канал',
    'input.invalidLines': 'Некорректный ввод канала в строке(ах): {lines}',
    'input.failedToAdd':
      'Не удалось добавить один или несколько каналов. Проверьте URL и попробуйте снова.',
    'input.supports': 'Поддерживается в строке: @handle, UC... или URL канала YouTube.',
    'input.fetching': 'Загрузка...',
    'input.addChannels': 'Добавить каналы',
    'input.cancel': 'Отмена',
    'player.remove': 'Удалить стрим',
    'player.notStreaming': 'Канал сейчас не ведет трансляцию',
    'player.consentRequired': 'Требуется согласие',
    'player.waiting': 'Ожидание начала трансляции на этом канале',
    'player.adjusting': 'Настройка раскладки...'
  },
  ur: {
    'app.title': 'LiveGrid',
    'app.language': 'زبان',
    'app.empty': 'شروع کرنے کے لیے اپنی پہلی لائیو اسٹریم شامل کریں',
    'app.loading': 'چینلز لوڈ ہو رہے ہیں...',
    'input.addChannel': '+ چینل شامل کریں',
    'input.modalTitle': 'چینل شامل کریں',
    'input.channelsPerLine': 'چینلز (ہر لائن میں ایک)',
    'input.enterAtLeastOne': 'کم از کم ایک چینل درج کریں',
    'input.invalidLines': 'لائن(ز) {lines} میں چینل ان پٹ درست نہیں',
    'input.failedToAdd': 'ایک یا زیادہ چینلز شامل نہیں ہو سکے۔ URL چیک کریں اور دوبارہ کوشش کریں۔',
    'input.supports': 'ہر لائن میں سپورٹ: @handle، UC... یا YouTube چینل URL۔',
    'input.fetching': 'حاصل کیا جا رہا ہے...',
    'input.addChannels': 'چینلز شامل کریں',
    'input.cancel': 'منسوخ کریں',
    'player.remove': 'اسٹریم ہٹائیں',
    'player.notStreaming': 'چینل اس وقت اسٹریم نہیں کر رہا',
    'player.consentRequired': 'رضامندی درکار ہے',
    'player.waiting': 'اس چینل کے لائیو ہونے کا انتظار ہے',
    'player.adjusting': 'لے آؤٹ ایڈجسٹ ہو رہا ہے...'
  }
}

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
            text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), value)
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
