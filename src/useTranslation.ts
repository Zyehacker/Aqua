import { useContext } from 'react'
import { LocalizationContext } from './localizationContext'

export function useTranslation() {
  const value = useContext(LocalizationContext)
  if (!value) throw new Error('useTranslation must be used inside LocalizationProvider')
  return value
}
