import { type ReactNode } from 'react'

export default function AnimatedTabs({ children, activeKey, className = '' }: { children: ReactNode; activeKey: string; className?: string }) {
  return <div className={`aqua-animated-tabs ${className}`} data-active-tab={activeKey}>{children}</div>
}
