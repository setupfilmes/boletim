import { useTheme, THEMES } from '../theme'
import { Icon } from '../ds/components'

const ICON = { claro: 'sun', escuro: 'moon', sol: 'sun', noite: 'moon' }

// Os 4 temas do design system; Sol e Noite são de alto contraste (externa de dia / set escuro)
export default function ThemePicker() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tema" data-testid="theme-picker">
      {THEMES.map((t) => {
        const on = theme === t.id
        return (
          <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => setTheme(t.id)}
            className={`flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-[10px] border-2 px-3 py-2 text-left ${
              on ? 'border-accent bg-accent text-accent-ink' : 'border-borda bg-surface text-ink'}`}>
            <span className="flex items-center gap-2 text-[17px] font-bold"><Icon name={ICON[t.id]} size={20} />{t.label}</span>
            <span className={`text-[13px] leading-4 ${on ? '' : 'text-muted'}`}>{t.hint}</span>
          </button>
        )
      })}
    </div>
  )
}
