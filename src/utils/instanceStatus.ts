import type { BackendInstance } from './tauri'

export function instanceStatus(instance: BackendInstance) {
  const state = instance.install_state?.trim().toLowerCase() ?? ''
  if (state === 'installed' || state === 'ready') return 'Ready'
  if (state.includes('download')) return 'Downloading'
  if (state.includes('install')) return 'Installing'
  if (state.includes('validat')) return 'Validating'
  if (state.includes('fail') || state.includes('error')) return 'Failed'
  return 'Not installed'
}

export function statusClass(status: string) {
  if (status === 'Ready') return 'chip-success'
  if (status === 'Failed') return 'chip-danger'
  if (status === 'Not installed') return 'chip-muted'
  return 'chip-accent'
}