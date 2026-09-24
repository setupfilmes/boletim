import { createClient } from '@supabase/supabase-js'

const LOCAL_KEY = 'boletim.config'

// Ordem: config.js (publicado com o site) > configuração salva neste aparelho
const CACHE_KEY = 'boletim.config.cache'

export function readConfig() {
  const c = (typeof window !== 'undefined' && window.APP_CONFIG) || {}
  if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY) {
    const cfg = { url: c.SUPABASE_URL.trim(), key: c.SUPABASE_ANON_KEY.trim() }
    // guarda uma cópia: se o app abrir sem internet e o config.js não carregar, usa esta
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
    return { ...cfg, source: 'file' }
  }
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    if (cached?.url && cached?.key) return { ...cached, source: 'file' }
  } catch { /* ignore */ }
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null')
    if (saved?.url && saved?.key) return { ...saved, source: 'device' }
  } catch { /* ignore */ }
  return null
}

export function saveDeviceConfig(url, key) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ url: url.trim(), key: key.trim() }))
}
export function clearDeviceConfig() {
  localStorage.removeItem(LOCAL_KEY)
}

const cfg = readConfig()

export const supabase = cfg
  ? createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'boletim.auth' },
    })
  : null

export const configSource = cfg?.source || null
