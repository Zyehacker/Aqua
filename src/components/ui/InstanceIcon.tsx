import type { BackendInstance } from '../../utils/tauri'

export default function InstanceIcon({ instance, size = 18 }: { instance?: Pick<BackendInstance, 'icon' | 'loader' | 'icon_data'> | null; size?: number }) {
  const icon = instance?.icon_data
  return <span className={`instance-icon instance-icon--${instance?.icon ?? 'default'}`} aria-hidden="true" style={{ width: size + 10, height: size + 10 }}>
    <img src={icon || '/favicon.png'} alt="" width={size} height={size} onError={(event) => { event.currentTarget.src = '/favicon.png' }} />
  </span>
}
