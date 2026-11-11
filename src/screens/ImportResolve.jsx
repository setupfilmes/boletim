import { useState } from 'react'
import { useNavigate } from 'react-router'
import { TopBar, TextInput, useDialog } from '../components/ui'
import { Button, Icon } from '../ds/components'
import { decodeCsv, analyzeResolveCsv, importResolvePlan } from '../lib/resolveImport'
import { fmtDate, plural } from '../lib/util'

// Importar projeto do DaVinci Resolve: Media Pool → selecionar os clipes → botão direito → Export Metadata (CSV).
// 1) escolhe o arquivo  2) prévia (o que vai entrar, diárias marcáveis, avisos)  3) cria o projeto no aparelho.
export default function ImportResolve() {
  const nav = useNavigate()
  const { notify } = useDialog()
  const [plan, setPlan] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState(null)
  const [title, setTitle] = useState('')
  const [keys, setKeys] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [showWarn, setShowWarn] = useState(false)

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null); setPlan(null)
    try {
      const p = analyzeResolveCsv(decodeCsv(await f.arrayBuffer()))
      setPlan(p); setFileName(f.name); setTitle(`${p.project.title} (v2)`)
      setKeys(new Set(p.dayGroups.filter((g) => g.include).map((g) => g.key)))
    } catch (err) {
      setError(err.message || String(err))
    }
  }
  const chosen = plan ? plan.takes.filter((t) => keys.has(t.shoot_date || 'sem-data')) : []
  const toggle = (k) => setKeys((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const doImport = async () => {
    setBusy(true)
    try {
      const id = await importResolvePlan(plan, title.trim() || plan.project.title, [...keys])
      notify(`Projeto importado · ${plural(chosen.length, 'clipe')}`)
      nav(`/p/${id}?tab=diarias`, { replace: true })
    } catch (err) {
      setError(err.message || String(err)); setBusy(false)
    }
  }
  const c = plan?.counts
  const stat = (n, label) => (
    <div className="rounded-[10px] border-2 border-line bg-surface px-3 py-2">
      <div className="font-mono text-2xl font-bold">{n}</div>
      <div className="text-[13px] font-bold uppercase tracking-[.07em] text-muted">{label}</div>
    </div>
  )
  const cnt = (f) => chosen.filter(f).length

  return (
    <>
      <TopBar title="Importar do Resolve" back="/" />
      <main className="mx-auto grid max-w-3xl gap-4 px-4 pt-4 pb-28" data-testid="import-resolve">
        {!plan && (
          <section className="grid gap-3 rounded-2xl border-2 border-line bg-surface p-4">
            <h2 className="text-xl font-bold">Arquivo de metadados</h2>
            <p className="text-[15px] text-muted">
              No DaVinci Resolve: Media Pool → selecione os clipes → botão direito → <b>Export Metadata</b>. O arquivo é lido
              aqui no aparelho; nada é enviado antes de você confirmar.
            </p>
            <label className="bc-btn bc-btn--primario bc-btn--g flex cursor-pointer items-center justify-center gap-2">
              <Icon name="file-spreadsheet" size={22} /> Escolher arquivo CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} data-testid="import-file" />
            </label>
          </section>
        )}
        {error && <div className="rounded-[10px] border-2 border-ng bg-ng-soft px-3 py-2 text-[15px] font-bold">{error}</div>}

        {plan && (
          <>
            <section className="grid gap-3 rounded-2xl border-2 border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">O que vai entrar</h2>
                <button type="button" className="bc-link" onClick={() => setPlan(null)}>Trocar arquivo</button>
              </div>
              <p className="-mt-2 truncate font-mono text-[13px] text-muted">{fileName}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="import-counts">
                {stat(chosen.length, 'clipes')}
                {stat(new Set(chosen.map((t) => t.shoot_date)).size, 'diárias')}
                {stat(new Set(chosen.filter((t) => t.scene !== 'AVULSOS').map((t) => t.scene)).size, 'cenas')}
                {stat(new Set(chosen.map((t) => t.roll).filter(Boolean)).size, 'cartões')}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[15px] sm:grid-cols-3">
                <span><b>GOOD ★★★★★</b> valeu · {cnt((t) => t.status === 'good' && t.rating === 5)}</span>
                <span><b>GOOD ★★★</b> reserva · {cnt((t) => t.status === 'good' && t.rating < 5)}</span>
                <span><b>NG</b> não valeu · {cnt((t) => t.status === 'ng')}</span>
                <span><b>CHECK</b> checar · {cnt((t) => t.status === 'check')}</span>
                <span><b>Sem resultado</b> · {cnt((t) => !t.status)}</span>
                <span><b>Avulsos</b> · {cnt((t) => t.scene === 'AVULSOS')}</span>
              </div>
              <p className="text-[15px] text-muted">
                Reservas sem estrelas no Resolve entram com 3 estrelas. Falso REC, ensaio e clipes sem claquete vão para a
                cena <b>AVULSOS</b>. {c.ignored ? `${plural(c.ignored, 'arquivo')} que não são de câmera (som, fotos, timelines) ficam de fora.` : ''}
              </p>
            </section>

            <section className="grid gap-2 rounded-2xl border-2 border-line bg-surface p-4">
              <h2 className="text-xl font-bold">Diárias</h2>
              <p className="-mt-1 text-[15px] text-muted">Desmarque o que não é do filme (ex.: teste de câmera).</p>
              <div className="grid gap-1" data-testid="import-days">
                {plan.dayGroups.map((g) => (
                  <label key={g.key} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] px-2 hover:bg-surface2">
                    <input type="checkbox" className="h-6 w-6 accent-[var(--acao)]" checked={keys.has(g.key)} onChange={() => toggle(g.key)} />
                    <span className="w-20 font-bold">{g.day ? `Dia ${String(g.day).padStart(2, '0')}` : 'Sem diária'}</span>
                    <span className="w-28 font-mono">{g.date ? fmtDate(g.date) : 'sem data'}</span>
                    <span className="flex-1 truncate text-[15px] text-muted">{plural(g.count, 'clipe')} · {g.folders.join(', ')}</span>
                  </label>
                ))}
              </div>
            </section>

            {plan.warnings.length > 0 && (
              <section className="grid gap-2 rounded-2xl border-2 border-check-ink bg-check-soft p-4">
                <button type="button" className="flex items-center justify-between text-left" onClick={() => setShowWarn((v) => !v)}>
                  <span className="text-xl font-bold">{plural(plan.warnings.length, 'aviso')}</span>
                  <span className="bc-link">{showWarn ? 'Esconder' : 'Ver'}</span>
                </button>
                {showWarn && (
                  <ul className="grid gap-1 text-[15px]">
                    {plan.warnings.map((w, i) => <li key={i}><b className="font-mono">{w.clip}</b> — {w.text}</li>)}
                  </ul>
                )}
              </section>
            )}

            <section className="grid gap-3 rounded-2xl border-2 border-line bg-surface p-4">
              <h2 className="text-xl font-bold">Projeto novo</h2>
              <TextInput label="Nome do projeto" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="import-title" />
              <p className="text-[15px] text-muted">
                Vem do arquivo: direção {plan.project.director || '—'} · foto {plan.project.dop || '—'} · continuidade{' '}
                {plan.project.scriptSupervisor || '—'} · DIT {plan.project.logger || '—'} · câmera {plan.project.camera_body || '—'}.
                Dá para corrigir depois na ficha técnica. Os projetos que você já tem não são alterados.
              </p>
              <Button variant="primario" size="g" block icon="check" disabled={busy || !chosen.length} onClick={doImport} data-testid="import-go">
                {busy ? 'Importando…' : `Criar projeto com ${plural(chosen.length, 'clipe')}`}
              </Button>
            </section>
          </>
        )}
      </main>
    </>
  )
}
