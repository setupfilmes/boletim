import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { TopBar, Empty, useDialog } from '../components/ui'
import { Button, Icon } from '../ds/components'
import { useProject, useTakesByProject, useRole } from '../lib/hooks'
import { useAuth } from '../auth'
import { update } from '../lib/repo'
import { decodeCsv, parseCsv, shortClip } from '../lib/resolveCsv'
import { natCompare, plural, fmtDate } from '../lib/util'

// Conferência com o cartão (DIT / logger): lista os arquivos reais do cartão (pasta escolhida no computador ou o
// "Export Metadata" do Resolve) e confere com os takes do boletim. Casa pelo nome do arquivo já gravado no take e,
// se não houver, pelo clipe (A001C003). Nada sai do aparelho: só os nomes dos arquivos são lidos.
const VIDEO = /\.(braw|r3d|ari|arx|mxf|mov|mp4|crm|dng)$/i

// "A001_09190403_C001.braw" → data/hora do relógio da câmera (mês, dia, hora, minuto)
const camClock = (name) => {
  const m = String(name).match(/^[A-Z]\d{3}_(\d\d)(\d\d)(\d\d)(\d\d)_C\d+/i)
  return m ? `${m[2]}/${m[1]} ${m[3]}:${m[4]}` : ''
}

export default function CardCheck() {
  const { projectId } = useParams()
  const project = useProject(projectId)
  const takes = useTakesByProject(projectId)
  const { user } = useAuth()
  const role = useRole(project, user?.id)
  const { notify } = useDialog()
  const [files, setFiles] = useState(null) // [{ name, tc }]
  const [source, setSource] = useState('')

  const fromFolder = (e) => {
    const list = [...(e.target.files || [])].map((f) => f.name).filter((n) => VIDEO.test(n))
    setFiles([...new Set(list)].map((name) => ({ name, tc: null })))
    setSource(`${plural(list.length, 'arquivo')} de vídeo na pasta`)
  }
  const fromCsv = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const rows = parseCsv(decodeCsv(await f.arrayBuffer()))
    const h = rows[0] || []
    const iName = h.indexOf('File Name'), iTc = h.indexOf('Start TC')
    if (iName < 0) return notify('Arquivo sem a coluna File Name', 'error')
    const list = rows.slice(1).map((r) => ({ name: r[iName], tc: iTc >= 0 ? r[iTc] : null })).filter((x) => VIDEO.test(x.name))
    setFiles(list); setSource(`${plural(list.length, 'clipe')} no CSV ${f.name}`)
  }

  const check = useMemo(() => {
    if (!files || !takes) return null
    const live = takes.filter((t) => !t.deleted)
    const byFile = new Map(live.filter((t) => t.file_name).map((t) => [t.file_name, t]))
    const byClip = new Map()
    for (const t of live) if (t.clip) { const k = t.clip.toUpperCase(); byClip.set(k, [...(byClip.get(k) || []), t]) }
    const matched = [], loose = [], fill = []
    const used = new Set()
    for (const f of files) {
      const code = shortClip(null, f.name)
      // pelo clipe só se o take ainda não tem nome de arquivo (senão o teste de câmera A001C001 casaria com o do filme)
      const t = byFile.get(f.name) || (byClip.get(code) || []).find((x) => !x.file_name && !used.has(x.id))
      if (!t) { loose.push({ ...f, code }); continue }
      used.add(t.id)
      matched.push({ ...f, code, take: t })
      if (!t.file_name) fill.push({ take: t, name: f.name })
    }
    const rolls = new Set(files.map((f) => shortClip(null, f.name).slice(0, 4)))
    const orphan = live.filter((t) => !used.has(t.id) && t.roll && rolls.has(t.roll.toUpperCase()))
    const dup = [...byClip.entries()].filter(([k, list]) => list.length > 1 && rolls.has(k.slice(0, 4)))
    return { matched, loose: loose.sort((a, b) => natCompare(a.code, b.code)), orphan: orphan.sort((a, b) => natCompare(a.clip, b.clip)), dup, fill, rolls: [...rolls].sort() }
  }, [files, takes])

  if (project === undefined) return null
  if (!project) return (<><TopBar title="Conferir cartão" back="/" /><Empty title="Projeto não encontrado" /></>)
  const canEdit = role !== 'viewer'
  const save = async () => {
    for (const x of check.fill) await update('takes', x.take.id, { file_name: x.name })
    notify(`${plural(check.fill.length, 'nome de arquivo')} gravado${check.fill.length === 1 ? '' : 's'} nos takes`)
  }
  const line = 'flex min-h-11 items-center gap-3 border-b border-line px-1 font-mono text-[15px]'
  const label = (t) => t.clip_type ? t.clip_type.replace('_', ' ').toUpperCase() : `T${t.take_number}`

  return (
    <>
      <TopBar title="Conferir cartão" subtitle={project.title} back={`/p/${projectId}`} />
      <main className="mx-auto grid max-w-3xl gap-4 px-4 pt-4 pb-28" data-testid="card-check">
        <section className="grid gap-3 rounded-2xl border-2 border-line bg-surface p-4">
          <h2 className="text-xl font-bold">Arquivos do cartão</h2>
          <p className="text-[15px] text-muted">Escolha a pasta do cartão (ou do backup) no computador, ou o CSV do Resolve (Export Metadata). Só os
            nomes dos arquivos são lidos; nada é enviado.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="bc-btn bc-btn--primario bc-btn--m flex cursor-pointer items-center justify-center gap-2">
              <Icon name="folder-open" size={22} /> Escolher pasta
              <input type="file" webkitdirectory="" directory="" multiple className="sr-only" onChange={fromFolder} data-testid="card-folder" />
            </label>
            <label className="bc-btn bc-btn--secundario bc-btn--m flex cursor-pointer items-center justify-center gap-2">
              <Icon name="file-spreadsheet" size={22} /> CSV do Resolve
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={fromCsv} data-testid="card-csv" />
            </label>
          </div>
          {source && <p className="font-mono text-[13px] text-muted">{source}</p>}
        </section>

        {check && (
          <>
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="card-summary">
              {[[check.matched.length, 'conferem'], [check.loose.length, 'clipes sem take'], [check.orphan.length, 'takes sem clipe'], [check.dup.length, 'clipes repetidos']].map(([n, l]) => (
                <div key={l} className={`rounded-[10px] border-2 px-3 py-2 ${n && l !== 'conferem' ? 'border-check-ink bg-check-soft' : 'border-line bg-surface'}`}>
                  <div className="font-mono text-2xl font-bold">{n}</div>
                  <div className="text-[13px] font-bold uppercase tracking-[.07em] text-muted">{l}</div>
                </div>
              ))}
            </section>
            <p className="text-[15px] text-muted">Cartões: {check.rolls.join(', ') || '—'}</p>

            {check.fill.length > 0 && canEdit && (
              <Button variant="primario" block icon="check" onClick={save} data-testid="card-save">
                Gravar o nome real do arquivo em {plural(check.fill.length, 'take')}
              </Button>
            )}

            {check.loose.length > 0 && (
              <section className="rounded-2xl border-2 border-line bg-surface p-4">
                <h2 className="mb-1 text-xl font-bold">Clipes sem take no boletim</h2>
                <p className="mb-2 text-[15px] text-muted">Falso REC, ensaio, take não anotado — ou o boletim pulou um número (deslocamento de clipe).</p>
                {check.loose.map((f) => (
                  <div key={f.name} className={line}><b className="w-24">{f.code}</b><span className="flex-1 truncate text-muted">{f.name}</span>
                    <span className="text-muted">{f.tc || camClock(f.name)}</span></div>
                ))}
              </section>
            )}
            {check.orphan.length > 0 && (
              <section className="rounded-2xl border-2 border-line bg-surface p-4">
                <h2 className="mb-1 text-xl font-bold">Takes sem clipe no cartão</h2>
                <p className="mb-2 text-[15px] text-muted">O clipe anotado não existe nos arquivos: confira o número (ex.: rec falso não anotado desloca os seguintes).</p>
                {check.orphan.map((t) => (
                  <div key={t.id} className={line}><b className="w-24">{t.clip || '—'}</b><span className="flex-1">{label(t)} · {fmtDate(t.shoot_date)}</span></div>
                ))}
              </section>
            )}
            {check.dup.length > 0 && (
              <section className="rounded-2xl border-2 border-line bg-surface p-4">
                <h2 className="mb-2 text-xl font-bold">Mesmo clipe em mais de um take</h2>
                {check.dup.map(([k, list]) => (
                  <div key={k} className={line}><b className="w-24">{k}</b><span className="flex-1">{list.map(label).join(', ')}</span></div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </>
  )
}
