import type { ReactNode } from 'react'
import { Logo } from './Brand'

export function EmptyState({ title, body, action, compact = false }: { title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`empty ${compact ? 'compact' : ''}`}>
      <div className="empty-ring"><Logo size={compact ? 34 : 56} /></div>
      <div className="empty-title">{title}</div>
      {body && <div className="empty-body">{body}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}
