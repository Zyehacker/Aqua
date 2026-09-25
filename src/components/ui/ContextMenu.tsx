import { useEffect, useRef, useState } from 'react'
import { Bug, Clipboard, Copy, RotateCw } from 'lucide-react'

type MenuState = { x: number; y: number; target: HTMLElement; canCopy: boolean; canPaste: boolean }

export default function ContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (!target) return
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      const canCopy = Boolean(window.getSelection()?.toString().trim())
      setMenu({ x: event.clientX, y: event.clientY, target, canCopy, canPaste: Boolean(navigator.clipboard?.readText) })
    }
    const close = (event: PointerEvent) => { if (event.target instanceof Node && rootRef.current?.contains(event.target)) return; setMenu(null) }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null) }
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  if (!menu) return null
  const width = 188
  const canInspect = import.meta.env.DEV
  const height = (menu.canCopy ? 31 : 0) + (menu.canPaste ? 31 : 0) + (canInspect ? 31 : 0) + 26
  const x = Math.max(8, Math.min(menu.x, window.innerWidth - width - 8))
  const y = Math.max(8, Math.min(menu.y, window.innerHeight - height - 8))
  const refresh = () => { setMenu(null); window.location.reload() }
  const copy = async () => {
    const selected = window.getSelection()?.toString()
    if (selected) await navigator.clipboard.writeText(selected).catch(() => undefined)
    setMenu(null)
  }
  const paste = async () => {
    const text = await navigator.clipboard.readText().catch(() => '')
    const target = menu.target
    if (text && target.isContentEditable) {
      target.focus()
      document.execCommand('insertText', false, text)
    }
    setMenu(null)
  }
  const inspect = () => { console.info('[Aqua dev inspect]', menu.target); setMenu(null) }

  return <div ref={rootRef} className="aqua-context-menu" role="menu" style={{ left: x, top: y }} onContextMenu={(event) => event.preventDefault()}>
    {menu.canCopy ? <button type="button" role="menuitem" onClick={() => void copy()}><Copy size={14} />Copy selection</button> : null}
    {menu.canPaste ? <button type="button" role="menuitem" onClick={() => void paste()}><Clipboard size={14} />Paste to focused field</button> : null}
    <button type="button" role="menuitem" onClick={refresh}><RotateCw size={14} />Refresh Aqua</button>
    {canInspect ? <button type="button" role="menuitem" onClick={inspect}><Bug size={14} />Inspect element</button> : null}
  </div>
}
