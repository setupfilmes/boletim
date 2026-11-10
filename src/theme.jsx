import { createContext, useContext, useEffect, useState } from 'react'

// Temas do design system: claro (escritório/revisão), escuro (uso geral no celular),
// sol (alto contraste para externa de dia) e noite (alto contraste, preto puro, set escuro).
export const THEMES = [
  { id: 'claro', label: 'Claro', hint: 'Escritório, revisão, computador' },
  { id: 'escuro', label: 'Escuro', hint: 'Uso geral no celular' },
  { id: 'sol', label: 'Sol', hint: 'Alto contraste para externa de dia' },
  { id: 'noite', label: 'Noite', hint: 'Alto contraste, preto puro, set escuro' },
]
const OLD = { dark: 'escuro', sun: 'sol' } // nomes da versão anterior

const Ctx = createContext(null)
const KEY = 'boletim.theme'

function initial() {
  try {
    const v = localStorage.getItem(KEY)
    if (v) return OLD[v] || (THEMES.some((t) => t.id === v) ? v : 'escuro')
  } catch { /* sem storage */ }
  return 'escuro'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initial)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--fundo').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#121316')
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])
  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
