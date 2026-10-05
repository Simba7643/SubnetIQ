import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  Command,
  ExternalLink,
  FolderKanban,
  GraduationCap,
  Home,
  Layers3,
  Menu,
  Moon,
  Network,
  ShieldCheck,
  Sparkles,
  Sun,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePreferences, type Locale } from '@/lib/preferences';
import { useTranslations } from '@/lib/i18n';
import { CommandPalette } from './CommandPalette';
import { AssistantWidget } from './AssistantWidget';
import { AnalyticsConsent } from './AnalyticsConsent';
import { PwaStatus } from './PwaStatus';
import { Seo } from './Seo';

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 740px)').matches);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const theme = usePreferences((state) => state.theme);
  const setTheme = usePreferences((state) => state.setTheme);
  const locale = usePreferences((state) => state.locale);
  const setLocale = usePreferences((state) => state.setLocale);
  const t = useTranslations();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 740px)');
    const change = () => {
      setMobile(media.matches);
      if (!media.matches) setNavOpen(false);
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!navOpen || !mobile || !sidebar) return;
    const menu = menuRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.workspace, .assistant-fab, .consent-banner, .skip-link',
      ),
    );
    const previous = background.map((element) => element.inert);
    background.forEach((element) => {
      element.inert = true;
    });
    const focusable = () =>
      Array.from(
        sidebar.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]'),
      );
    (sidebar.querySelector<HTMLElement>('[aria-current="page"]') || focusable()[0])?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setNavOpen(false);
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      const outside = !sidebar.contains(document.activeElement);
      if (event.shiftKey && (outside || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = overflow;
      background.forEach((element, index) => {
        element.inert = previous[index];
      });
      menu?.focus({ preventScroll: true });
    };
  }, [navOpen, mobile]);
  useEffect(() => {
    const close = () => setNavOpen(false);
    window.addEventListener('popstate', close);
    return () => window.removeEventListener('popstate', close);
  }, []);
  useEffect(() => {
    const listener = () => setOffline(!navigator.onLine);
    window.addEventListener('online', listener);
    window.addEventListener('offline', listener);
    return () => {
      window.removeEventListener('online', listener);
      window.removeEventListener('offline', listener);
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);
  const nav = [
    { to: '/', icon: Home, title: t.nav.home, end: true },
    { to: '/tools', icon: Network, title: t.nav.tools },
    { to: '/toolkit', icon: ShieldCheck, title: t.nav.toolkit },
    { to: '/templates', icon: Layers3, title: t.nav.templates },
  ];
  return (
    <>
      <Seo />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside
        ref={sidebarRef}
        id="primary-navigation"
        role={mobile && navOpen ? 'dialog' : undefined}
        aria-modal={mobile && navOpen ? true : undefined}
        aria-hidden={mobile && !navOpen ? true : undefined}
        className={`sidebar ${navOpen ? 'open' : ''}`}
        aria-label="Main navigation"
      >
        <Link className="brand" to="/" onClick={() => setNavOpen(false)}>
          <span className="brand-mark">
            <Network />
          </span>
          <span>
            Subnet<span className="brand-iq">IQ</span>
          </span>
        </Link>
        <button
          className="icon-button mobile-menu"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        >
          <X size={20} />
        </button>
        <div className="sidebar-subtitle">Network intelligence</div>
        <nav>
          <div className="nav-section-label">WORKSPACE</div>
          {nav.map((item) => (
            <NavLink
              onClick={() => setNavOpen(false)}
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <item.icon />
              {item.title}
            </NavLink>
          ))}
          <div className="nav-section-label">BUILD YOUR KNOWLEDGE</div>
          <NavLink
            onClick={() => setNavOpen(false)}
            to="/learn"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <GraduationCap />
            {t.nav.learn}
          </NavLink>
          <NavLink
            onClick={() => setNavOpen(false)}
            to="/practice"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <Command />
            {t.nav.practice}
          </NavLink>
          <NavLink
            onClick={() => setNavOpen(false)}
            to="/glossary"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <BookOpen />
            {t.nav.glossary}
          </NavLink>
          <div className="nav-section-label">YOUR SPACE</div>
          <NavLink
            onClick={() => setNavOpen(false)}
            to="/projects"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <FolderKanban />
            {t.nav.projects}
          </NavLink>
          <NavLink
            onClick={() => setNavOpen(false)}
            to="/assistant"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <Sparkles />
            {t.nav.assistant}
            <span className="nav-tag">AI</span>
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-callout">
            <strong>One subnet at a time.</strong>A little practice today makes tomorrow’s network
            easier.
            <Link to="/practice">
              Try the practice lab
              <ChevronRight size={12} />
            </Link>
          </div>
          <div className="sidebar-status">
            <span className="status-dot" />
            EXACT MATH · CLEAR THINKING<span style={{ marginInlineStart: 'auto' }}>v1.0</span>
          </div>
        </div>
      </aside>
      {navOpen && (
        <button
          className="mobile-nav-dismiss"
          aria-label="Dismiss navigation overlay"
          tabIndex={-1}
          onClick={() => setNavOpen(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="row">
            <button
              ref={menuRef}
              className="icon-button mobile-menu"
              aria-controls="primary-navigation"
              aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={navOpen}
              onClick={() => setNavOpen(!navOpen)}
            >
              <Menu size={20} />
            </button>
            <CommandPalette />
          </div>
          <div className="topbar-right">
            {offline && (
              <span className="offline-indicator">
                <WifiOff size={12} />
                Offline
              </span>
            )}
            <select
              className="locale-select"
              aria-label={t.common.language}
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              <option value="en">EN</option>
              <option value="am">አማ</option>
              <option value="ar">عربي</option>
              <option value="fr">FR</option>
              <option value="es">ES</option>
            </select>
            <button
              className="icon-button"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={t.common.theme}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <span className="topbar-divider" />
            {user ? (
              <Link to="/account" className="avatar" aria-label="Open your account">
                {(user.email || 'U').charAt(0).toUpperCase()}
              </Link>
            ) : (
              <Link className="button button-secondary" to="/auth">
                {t.common.signIn}
                <ExternalLink size={12} />
              </Link>
            )}
          </div>
        </header>
        <PwaStatus />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} SubnetIQ · Made for curious network minds.</span>
          <div className="footer-links">
            <Link to="/about">About</Link>
            <Link to="/blog">Field notes</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/cookies">Cookies</Link>
          </div>
        </footer>
      </div>
      <AssistantWidget />
      <AnalyticsConsent />
    </>
  );
}
