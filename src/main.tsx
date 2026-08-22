import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

document.documentElement.dataset.theme = window.localStorage.getItem('aqua.theme') ?? 'dark'
const initialDensity = window.localStorage.getItem('aqua.density')
document.documentElement.dataset.density = initialDensity ?? 'comfortable'
document.documentElement.style.setProperty('--space-unit', initialDensity === 'compact' ? '0.82' : '1')
if (window.localStorage.getItem('aqua.reduceMotion') === 'true') {
  document.documentElement.dataset.reduceMotion = 'true'
}
const accentValue = window.localStorage.getItem('aqua.accent') ?? 'aqua'
const accentMap = {
  aqua: '#58dfd1',
  cyan: '#7dd3fc',
  mint: '#81f7d3',
  lavender: '#b8a9ff',
  amber: '#f8c76a',
} as const
const accentColor = accentMap[accentValue as keyof typeof accentMap] ?? '#58dfd1'
document.documentElement.style.setProperty('--primary', accentColor)
document.documentElement.style.setProperty('--primary-dim', accentColor)
document.documentElement.style.setProperty('--border-focus', `${accentColor}88`)
document.addEventListener('contextmenu', (event) => {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, pre, code, [contenteditable="true"]')) return
  event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
