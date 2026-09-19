import { useContext } from 'react'
import { AquaAuthContext } from './aquaAuthContext'

export function useAquaAuth() {
  const context = useContext(AquaAuthContext)
  if (!context) throw new Error('useAquaAuth must be used inside AquaAuthProvider')
  return context
}