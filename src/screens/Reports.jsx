import { useMemo, useState } from 'react'
import { Btn, Card, Empty, useDialog } from '../components/ui'
import { IconFile, IconShare } from '../components/icons'
import { useTakesByProject, useShotsByProject } from '../lib/hooks'
import { buildCsv, buildPdf, buildDitCsv, buildAle, downloadFile, shareFile } from '../lib/export'
import { fmtDate, todayISO, plural } from '../lib/util'
import { countTakes } from '../lib/cameras'

export default function Reports({ project }) {
  const takes = useTakesByProject(project.id)
  const shots = useShotsByProject(project.id)
  const { notify, actionSheet } = useDialog()
  const [busy, setBusy] = useState(null)

  const days = useMemo(() => {
    const m = {}
    for (const t of takes || []) {
      const o = (m[t.shoot_date] ||= { date: t.shoot_date, rows: [], scenes: new Set() })
      o.rows.push(t)
      o.scenes.add(t.scene_id)
    }
    const shotsById = Object.fromEntries((shots || []).map((s) => [s.id, s]))
    return Object.values(m).map((d) => ({ ...d, ...countTakes(d.rows, shotsById) })).sort((a, b) => b.date.localeCompare(a.date))
  }, [takes, shots])

  const run = async (key, fn, date, mode) => {
    setBusy(key)
    try {
      const file = await fn(project.id, date)
      if (mode === 'share') {
        const r = await shareFile(file)
        if (r === 'downloaded') notify('Arquivo salvo em Downloads')
      } else {
        downloadFile(file)
        notify('Arquivo salvo em Downloads')
      }
    } catch (e) {
      notify(`Erro ao gerar: ${e.message}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const Actions = ({ date, id }) => (
    <div className="grid grid-cols-3 gap-2">
      <Btn size="sm" onClick={() => run(`${id}-pdf-s`, buildPdf, date, 'share')} disabled={!!busy} data-testid={`pdf-${id}`}>
        <IconShare size={18} /> PDF
      </Btn>
      <Btn size="sm" variant="surface" onClick={() => run(`${id}-pdf-d`, buildPdf, date, 'download')} disabled={!!busy}>
        <IconFile size={18} /> Baixar
      </Btn>
      <Btn size="sm" variant="surface" onClick={() => run(`${id}-csv`, buildCsv, date, 'share')} disabled={!!busy} data-testid={`csv-${id}`}>
        CSV
      </Btn>
      <Btn size="sm" variant="ghost" className="col-span-3" disabled={!!busy} data-testid={`dit-${id}`}
        onClick={() => actionSheet('Arquivos para DIT / pós', [
          { label: 'CSV para DIT (Silverstack / Drylab)', onClick: () => run(`${id}-dit`, buildDitCsv, date, 'share') },
          { label: 'ALE (Avid / DaVinci Resolve / Silverstack)', onClick: () => run(`${id}-ale`, buildAle, date, 'share') },
        ])}>
        Arquivos para DIT / pós
      </Btn>
    </div>
  )

  if (!takes) return null
  if (!days.length) return <Empty title="Nenhuma diária ainda">Assim que você registrar takes, cada dia de filmagem aparece aqui para gerar o boletim em PDF ou CSV — mesmo sem internet.</Empty>

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {days.map((d) => (
        <Card key={d.date} className="p-4">
          <div className="flex items-center gap-3">
            <div className="font-display text-2xl font-extrabold">{fmtDate(d.date)}</div>
            {d.date === todayISO() && <span className="rounded border border-accent px-1 text-xs font-bold text-accent">HOJE</span>}
          </div>
          <div className="mb-3 font-mono text-sm text-muted">{plural(d.scenes.size, 'cena')} · {plural(d.takes, 'take')} · {d.good} good</div>
          <Actions date={d.date} id={d.date} />
        </Card>
      ))}
      {days.length > 1 && (
        <Card className="p-4">
          <div className="mb-3 font-display text-lg font-extrabold">Todas as diárias</div>
          <Actions date={null} id="all" />
        </Card>
      )}
      {busy && <div className="text-center text-sm text-muted">Gerando…</div>}
    </div>
  )
}
