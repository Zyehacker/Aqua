import { useEffect, useState } from 'react'
import { useAppStore } from '../../stores/appStore'

const BACKGROUNDS = [1, 2, 3, 4, 5].map((number) => `/backgrounds/background${number}.png`)

export default function AppBackground() {
  const choice = useAppStore((state) => state.background)
  const [active, setActive] = useState(0)
  const [previous, setPrevious] = useState<number | null>(null)

  useEffect(() => {
    const next = choice === 'random' ? Math.floor(Math.random() * BACKGROUNDS.length) : Math.max(0, Number(choice.replace('background', '')) - 1)
    const image = new Image()
    image.onload = () => {
      setPrevious(active)
      setActive(next)
      window.setTimeout(() => setPrevious(null), 500)
    }
    image.src = BACKGROUNDS[next]
  }, [choice])

  return (
    <div className="app-background" aria-hidden="true">
      {previous !== null ? <img className="app-background__media app-background__media--previous" src={BACKGROUNDS[previous]} alt="" /> : null}
      <img className="app-background__media app-background__media--active" src={BACKGROUNDS[active]} alt="" />
      <div className="app-background__overlay" />
      <div className="app-background__vignette" />
    </div>
  )
}
