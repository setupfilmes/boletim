import { HashRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router'
import { AuthProvider, useAuth } from './auth'
import { ThemeProvider } from './theme'
import { DialogProvider } from './components/ui'
import { IconFilm, IconBox, IconUser } from './components/icons'
import { supabase } from './lib/supabase'
import Setup from './screens/Setup'
import Login, { NewPassword } from './screens/Login'
import Projects from './screens/Projects'
import Project from './screens/Project'
import Scene from './screens/Scene'
import Shot from './screens/Shot'
import Kit from './screens/Kit'
import Account from './screens/Account'

function BottomNav() {
  const { pathname } = useLocation()
  if (!['/', '/kit', '/conta'].includes(pathname)) return null
  const item = (to, label, Icon) => (
    <NavLink to={to} end className={({ isActive }) =>
      `flex min-h-16 flex-col items-center justify-center gap-0.5 font-display text-xs font-bold uppercase tracking-wide ${isActive ? 'text-accent' : 'text-muted'}`}>
      <Icon size={24} />{label}
    </NavLink>
  )
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-bg/95 backdrop-blur">
      {item('/', 'Projetos', IconFilm)}
      {item('/kit', 'Kit', IconBox)}
      {item('/conta', 'Conta', IconUser)}
    </nav>
  )
}

function Gate() {
  const { loading, user, recovery } = useAuth()
  if (!supabase) return <Setup />
  if (loading) return <div className="flex h-full items-center justify-center font-display text-muted">Carregando…</div>
  if (recovery) return <NewPassword />
  if (!user) return <Login />
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Projects />} />
        <Route path="/p/:projectId" element={<Project />} />
        <Route path="/p/:projectId/s/:sceneId" element={<Scene />} />
        <Route path="/p/:projectId/s/:sceneId/sh/:shotId" element={<Shot />} />
        <Route path="/kit" element={<Kit />} />
        <Route path="/conta" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </HashRouter>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <DialogProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </DialogProvider>
    </ThemeProvider>
  )
}
