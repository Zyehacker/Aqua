import { type ReactNode } from 'react'
import { AnimatedGroup } from '../motion-primitives/animated-group'

export default function AnimatedList({ children, className }: { children: ReactNode; className?: string }) {
  return <AnimatedGroup className={className}>{children}</AnimatedGroup>
}
