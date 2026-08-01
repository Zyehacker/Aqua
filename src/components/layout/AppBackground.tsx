import { useEffect, useState } from 'react'

const GIF = '/backgrounds/bg.gif'
const PNG = '/backgrounds/main.png'

export default function AppBackground() {
  const [src, setSrc] = useState(GIF)

  useEffect(() => {
    let active = true
    const image = new Image()
    image.onload = () => {
      if (active) setSrc(GIF)
    }
    image.onerror = () => {
      if (active) setSrc(PNG)
    }
    image.src = GIF
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="app-background" aria-hidden="true">
      <img className="app-background__media" src={src} alt="" />
      <div className="app-background__overlay" />
    </div>
  )
}
