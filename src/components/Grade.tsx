import type { Grade } from '../lib/launchpad/report'
import { ProtectedBadge } from './Brand'

export function GradePill({ grade }: { grade?: Grade }) {
  if (!grade || grade === 'PROTECTED') return <ProtectedBadge size="sm" />
  return <span className={`grade-pill ${grade.toLowerCase()}`}>{grade === 'CAUTION' ? 'Caution' : 'Unprotected'}</span>
}
