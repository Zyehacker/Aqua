import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'

type AvatarProps = {
  src?: string | null
  label?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function Avatar({ src, label, size = 'md', className = '' }: AvatarProps) {
  const directSrc = src && /^https?:\/\//i.test(src) ? src : null
  const [resolved, setResolved] = useState<string | null>(directSrc)
  const fallback = (label?.trim().slice(0, 1) || '?').toUpperCase()

  useEffect(() => {
    let active = true
    if (!src || directSrc || !supabase) return () => { active = false }
    void supabase.storage.from('avatars').createSignedUrl(src, 3600).then(({ data }) => {
      if (active) setResolved(data?.signedUrl ?? null)
    }).catch(() => { if (active) setResolved(null) })
    return () => { active = false }
  }, [src, directSrc])

  const displaySrc = directSrc ?? (src ? resolved : null)
  return displaySrc
    ? <AvatarImage key={displaySrc} src={displaySrc} size={size} className={className} />
    : <span className={`avatar avatar--${size} ${className}`} aria-label={label || 'Avatar'}>{fallback}</span>
}

function AvatarImage({ src, size, className }: { src: string; size: NonNullable<AvatarProps['size']>; className: string }) {
  const [broken, setBroken] = useState(false)
  return broken
    ? <span className={`avatar avatar--${size} ${className}`} aria-label="Avatar">?</span>
    : <img className={`avatar avatar--${size} ${className}`} src={src} alt="" onError={() => setBroken(true)} />
}
