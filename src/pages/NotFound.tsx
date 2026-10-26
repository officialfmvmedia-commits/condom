import { Link } from 'react-router-dom'
import { EmptyState } from '../components/Empty'
export function NotFound() {
  return <section className="container section"><EmptyState title="Nothing here." body="That page doesn't exist." action={<Link className="btn btn-latex" to="/">Back to coins</Link>} /></section>
}
