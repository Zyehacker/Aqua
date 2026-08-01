import { cn } from '../../utils/cn'

type ToggleProps = {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}

export default function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cn('toggle', checked && 'on')}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__knob" />
    </button>
  )
}
