import AnimatedToggle from '../motion/AnimatedToggle'

type ToggleProps = {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}

export default function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return <AnimatedToggle checked={checked} onChange={onChange} label={label} disabled={disabled} />
}
