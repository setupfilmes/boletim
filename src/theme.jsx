import { createContext, useContext, useEffect, useState } from 'react'

const Ctx = createContext(null)
const KEY = 'boletim.theme'

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem(KEY) || 'dark' } catch { return 'dark' } })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'sun' ? '#ffffff' : '#0A0A0B')
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])
  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
