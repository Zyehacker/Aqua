import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLauncherData } from './hooks/useLauncherData'
import en from './locales/en.json'
import es from './locales/es.json'
import zhCN from './locales/zh-CN.json'
import ru from './locales/ru.json'
import hi from './locales/hi.json'
import ja from './locales/ja.json'
import no from './locales/no.json'
import de from './locales/de.json'
import nl from './locales/nl.json'
import sv from './locales/sv.json'

export const SUPPORTED_LOCALES = [
  { id: 'en', nativeName: 'English' },
  { id: 'es', nativeName: 'Español' },
  { id: 'zh-CN', nativeName: '简体中文' },
  { id: 'ru', nativeName: 'Русский' },
  { id: 'hi', nativeName: 'हिन्दी' },
  { id: 'ja', nativeName: '日本語' },
  { id: 'no', nativeName: 'Norsk' },
  { id: 'de', nativeName: 'Deutsch' },
  { id: 'nl', nativeName: 'Nederlands' },
  { id: 'sv', nativeName: 'Svenska' },
] as const

const dictionaries: Record<string, Record<string, string>> = { en, es, 'zh-CN': zhCN, ru, hi, ja, no, de, nl, sv }
type LocalizationContext = { language: string; setLanguage: (language: string) => Promise<void>; t: (key: string) => string }
const LocalizationContext = createContext<LocalizationContext | null>(null)

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useLauncherData()
  const language = SUPPORTED_LOCALES.some((locale) => locale.id === settings?.language) ? settings?.language ?? 'en' : 'en'
  const value = useMemo<LocalizationContext>(() => ({
    language,
    setLanguage: async (next) => {
      if (!SUPPORTED_LOCALES.some((locale) => locale.id === next)) return
      await updateSettings({ language: next })
    },
    t: (key) => {
      const value = dictionaries[language]?.[key] ?? dictionaries.en[key]
      if (value === undefined) {
        if (import.meta.env.DEV) console.warn(`[aqua] Missing translation: ${key}`)
        return key
      }
      return value
    },
  }), [language, updateSettings])
  document.documentElement.lang = language
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>
}

export function useTranslation() {
  const value = useContext(LocalizationContext)
  if (!value) throw new Error('useTranslation must be used inside LocalizationProvider')
  return value
}
