import { useMemo, useState } from 'react'
import { Btn, Card, Empty, useDialog } from '../components/ui'
import { IconFile, IconShare } from '../components/icons'
import { useTakesByProject, useShotsByProject } from '../lib/hooks'
import { buildCsv, buildPdf, buildDitCsv, buildAle, downloadFile, shareFile } from '../lib/export'
import { fmtDate, todayISO, plural } from '../lib/util'
import { countTakes } from '../lib/cameras'
import { useDays, dayLabel } from '../lib/days'
import { useAuth } from '../auth'
import { visao } from '../lib/funcao'
import { buildProgressPdf, buildFinalReportPdf, buildContinuityDailyPdf, buildResolveCsv } from '../lib/continuityReports'

export default function Reports({ project }) {
  const { user } = useAuth()
  const vis = visao(project, user?.id)
  const takes = useTakesByProject(project.id)
  const shots = useShotsByProject(project.id)
  const { notify, actionSheet } = useDialog()
  const [busy, setBusy] = useState(null)
  const daysList = useDays(project.id)
  const dayNum = Object.fromEntries((daysList || []).map((d) => [d.date, d.number]))

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
      if (file.missing?.length) notify(`${plural(file.missing.length, 'clipe')} sem nome de arquivo: o Resolve casa pelo File Name (veja a tela do DIT)`, 'error')
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
        Planilha
      </Btn>
      <Btn size="sm" variant="ghost" className="col-span-3" disabled={!!busy} data-testid={`dit-${id}`}
        onClick={() => actionSheet('Arquivos para DIT / pós', [
          { label: 'CSV para DIT (Silverstack / Drylab)', onClick: () => run(`${id}-dit`, buildDitCsv, date, 'share') },
          { label: 'ALE (Avid / DaVinci Resolve / Silverstack)', onClick: () => run(`${id}-ale`, buildAle, date, 'share') },
          { label: 'Metadados para o DaVinci Resolve (Import Metadata)', onClick: () => run(`${id}-resolve`, buildResolveCsv, date, 'share') },
        ])}>
        Arquivos para DIT / pós
      </Btn>
      {vis.continuidade && <Btn size="sm" variant="ghost" className="col-span-3" disabled={!!busy} data-testid={`cont-${id}`}
        onClick={() => run(`${id}-cont`, buildContinuityDailyPdf, date, 'share')}>
        Boletim da continuidade (PDF)
      </Btn>}
    </div>
  )

  if (!takes) return null
  if (!days.length) return <Empty title="Nenhuma diária ainda">Assim que você registrar takes, cada dia de filmagem aparece aqui para gerar o boletim em PDF ou CSV — mesmo sem internet.</Empty>

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {days.map((d) => (
        <Card key={d.date} className="p-4">
          <div className="flex items-center gap-3">
            {dayNum[d.date] != null && <div className="font-display text-2xl font-extrabold text-accent">{dayLabel(dayNum[d.date])}</div>}
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
      {vis.continuidade && <Card className="p-4">
        <div className="mb-1 font-display text-lg font-extrabold">Continuidade · projeto inteiro</div>
        <div className="mb-3 text-sm text-muted">Modelo dos relatórios entregues pela continuidade.</div>
        <div className="grid grid-cols-1 gap-2">
          <Btn size="sm" variant="surface" disabled={!!busy} onClick={() => run('progress', buildProgressPdf, null, 'share')} data-testid="progress">Relatório de progresso (PDF)</Btn>
          <Btn size="sm" variant="surface" disabled={!!busy} onClick={() => run('final', buildFinalReportPdf, null, 'share')} data-testid="final">Relatório final (PDF)</Btn>
          <Btn size="sm" variant="surface" disabled={!!busy} onClick={() => run('resolve', buildResolveCsv, null, 'share')} data-testid="resolve">Metadados para o DaVinci Resolve (CSV)</Btn>
        </div>
      </Card>}
      {busy && <div className="text-center text-sm text-muted">Gerando…</div>}
    </div>
  )
}
