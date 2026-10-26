import { useEffect, useState } from 'react'
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { Logo, Wordmark } from './Brand'
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
      <div className="bg" aria-hidden="true" />
      {import.meta.env.DEV && backend?.id === 'dev-mock' && <div className="dev-ribbon mono">DEV MOCK DATA · not real · never shipped</div>}
      <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-inner">
          <Link to="/" className="nav-brand" aria-label="CONDOM home">
            <Logo size={40} />
            <Wordmark size={23} />
          </Link>
          <nav className="nav-links">
            <NavLink to="/" end>Coins</NavLink>
            <NavLink to="/rules">How it works</NavLink>
          </nav>
          <div className="nav-actions">
            <Link to="/launch" className="btn btn-green btn-sm nav-launch">Launch</Link>
            <WalletButton />
          </div>
        </div>
      </header>
      <main key={pathname} className="page-enter"><Outlet /></main>
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand"><Logo size={26} /><span>Every token born from CONDOM is a better coin.</span></div>
          <div className="footer-links">
            <Link to="/rules">How it works</Link>
            <Link to="/launch">Launch</Link>
            <span className="dim">Coins launched here are pump.fun tokens. Nothing here is financial advice.</span>
          </div>
        </div>
      </footer>
      <nav className="tabbar glass">
        <NavLink to="/" end><span className="tb-ico"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="2.6" /></svg></span>Coins</NavLink>
        <NavLink to="/launch" className="tb-launch"><span className="tb-plus">+</span></NavLink>
        <NavLink to="/rules"><span className="tb-ico"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M10 2.8l6 2.4v4.3c0 3.8-2.6 6.4-6 7.7-3.4-1.3-6-3.9-6-7.7V5.2z" /><path d="M7.3 10l1.9 1.9 3.6-3.7" strokeLinejoin="round" /></svg></span>Rules</NavLink>
      </nav>
    </div>
  )
}
