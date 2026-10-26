import { useEffect, useState } from 'react'
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { Mark, Wordmark } from './Brand'
import { WalletButton } from '../wallet/WalletButton'
import { useBackend } from '../lib/useBackend'

export function Layout() {
  const { pathname } = useLocation()
  const backend = useBackend()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on(); window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <div className="app">
      <div className="bg" aria-hidden="true"><div className="bg-aura a1" /><div className="bg-aura a2" /><div className="bg-grid" /><div className="bg-grain" /></div>
      {import.meta.env.DEV && backend?.id === 'dev-mock' && <div className="dev-ribbon mono">DEV MOCK DATA · not real · never shipped</div>}
      <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-inner">
          <Link to="/" className="nav-brand" aria-label="CONDOM home">
            <span className="nav-mark"><Mark size={22} /></span>
            <Wordmark height={15} />
          </Link>
          <nav className="nav-links">
            <NavLink to="/" end>Coins</NavLink>
            <NavLink to="/rules">How it works</NavLink>
          </nav>
          <div className="nav-actions">
            <Link to="/launch" className="btn btn-latex btn-sm nav-launch">Launch</Link>
            <WalletButton />
          </div>
        </div>
      </header>
      <main key={pathname} className="page-enter"><Outlet /></main>
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand"><Mark size={18} /><span>Every token born from CONDOM is a better coin.</span></div>
          <div className="footer-links">
            <Link to="/rules">How it works</Link>
            <Link to="/launch">Launch</Link>
            <span className="dim">Coins launched here are pump.fun tokens. Nothing here is financial advice.</span>
          </div>
        </div>
      </footer>
      <nav className="tabbar glass">
        <NavLink to="/" end><span className="tb-ico">◎</span>Coins</NavLink>
        <NavLink to="/launch" className="tb-launch"><span className="tb-plus">+</span></NavLink>
        <NavLink to="/rules"><span className="tb-ico">§</span>Rules</NavLink>
      </nav>
    </div>
  )
}
