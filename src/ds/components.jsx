// Componentes do design system "Boletim de Câmera" (Claude Design, 21/10/2026), adaptados para o app.
// Estilos em ./bundle.css; cores e fontes em ./tokens.css (4 temas: claro, escuro, sol, noite).
import { useState, useRef, useEffect } from 'react';
import { ICONS } from './icons.js';
const cx = (...a) => a.filter(Boolean).join(' ');

/* ───────────────────────── Ícone ───────────────────────── */
export function Icon({ name, size = 24, strokeWidth = 2.25, title, className, style }) {
  const inner = ICONS[name] || '';
  return (
    <svg
      className={cx('bc-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={style}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

/* ───────────────────────── Botão ───────────────────────── */
export function Button({ variant = 'secundario', size = 'm', icon, iconRight, block, className, children, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('bc-btn', 'bc-btn--' + variant, 'bc-btn--' + size, block && 'bc-btn--block', !children && 'bc-btn--icone', className)}
    >
      {icon && <Icon name={icon} size={size === 'g' ? 28 : 24} />}
      {children && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={size === 'g' ? 28 : 24} />}
    </button>
  );
}

/* ───────────────────────── Status ───────────────────────── */
const STATUS = {
  GOOD: { icon: 'check', label: 'GOOD', key: 'good' },
  NG: { icon: 'x', label: 'NG', key: 'ng' },
  CHECK: { icon: 'triangle-alert', label: 'CHECK', key: 'check' },
};

export function StatusPicker({ value, onChange, size = 'g', disabled }) {
  return (
    <div className={cx('bc-status', 'bc-status--' + size)} role="group" aria-label="Status do take">
      {Object.keys(STATUS).map((k) => {
        const s = STATUS[k];
        const on = value === k;
        return (
          <button
            key={k}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            className={cx('bc-status__btn', 'bc-status__btn--' + s.key)}
            onClick={() => onChange && onChange(on ? null : k)}
          >
            <Icon name={s.icon} size={size === 'g' ? 28 : 22} strokeWidth={3} />
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StatusBadge({ status, compact }) {
  if (!status) {
    return <span className={cx('bc-badge', 'bc-badge--vazio', compact && 'bc-badge--compacto')}>{compact ? '—' : 'Sem status'}</span>;
  }
  const s = STATUS[status];
  return (
    <span className={cx('bc-badge', 'bc-badge--' + s.key, compact && 'bc-badge--compacto')} title={s.label}>
      <Icon name={s.icon} size={compact ? 16 : 18} strokeWidth={3} />
      {!compact && <span>{s.label}</span>}
      {compact && <span className="bc-sr">{s.label}</span>}
    </span>
  );
}

/* ───────────────────────── Take ───────────────────────── */
export function TakeNumber({ numero, circulado, size = 'g', label = true }) {
  return (
    <span className={cx('bc-takenum', 'bc-takenum--' + size, circulado && 'is-circulado')}>
      {label && size === 'g' && <span className="bc-takenum__rotulo">TAKE</span>}
      <span className="bc-takenum__disco">
        <span className="bc-takenum__n">{numero}</span>
        {circulado && size !== 'p' && (
          <span className="bc-takenum__estrela" aria-label="circulado">
            <Icon name="star" size={size === 'g' ? 20 : 12} strokeWidth={2.5} />
          </span>
        )}
      </span>
    </span>
  );
}

export function CircleToggle({ on, onChange, compact }) {
  return (
    <button
      type="button"
      aria-pressed={!!on}
      className={cx('bc-circ', on && 'is-on', compact && 'bc-circ--compacto')}
      onClick={() => onChange && onChange(!on)}
    >
      <Icon name="star" size={24} strokeWidth={2.5} />
      <span>{on ? 'Circulado' : 'Circular'}</span>
    </button>
  );
}

// Estrelas da continuidade (qualquer status). Em GOOD: 5 = VALEU, 1–4 = RESERVA. Tocar na estrela marcada apaga.
export function StarRating({ value, onChange, disabled, rotulo }) {
  const n = value || 0;
  return (
    <div className="bc-stars" role="radiogroup" aria-label="Estrelas do take">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={n === i} aria-label={i + (i === 1 ? ' estrela' : ' estrelas')}
          disabled={disabled} className={cx('bc-stars__btn', i <= n && 'is-on')} onClick={() => onChange && onChange(i === n ? null : i)}>
          <Icon name="star" size={26} strokeWidth={2.5} />
        </button>
      ))}
      <span className="bc-stars__rot">{rotulo ?? ''}</span>
    </div>
  );
}

export function SegmentToggle({ options, value, onChange, label }) {
  return (
    <div className="bc-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            className={cx('bc-seg__btn', on && 'is-on')}
            onClick={() => onChange && onChange(v)}
          >
            {o.icon && <Icon name={o.icon} size={20} />}
            <span>{o.label || v}</span>
          </button>
        );
      })}
    </div>
  );
}

const MARCAS = [
  { code: 'PU', label: 'Pickup' },
  { code: 'SER', label: 'Série' },
  { code: 'TAIL', label: 'Claq. no fim' },
  { code: 'AFS', label: 'Recomeço' },
  { code: 'NS', label: 'Sem claquete' },
];

export function MarkChips({ value = [], onChange, compacto }) {
  const toggle = (c) => {
    const has = value.includes(c);
    onChange && onChange(has ? value.filter((x) => x !== c) : value.concat(c));
  };
  return (
    <div className={cx('bc-marcas', compacto && 'bc-marcas--compacto')} role="group" aria-label="Marcações de claquete">
      {MARCAS.map((m) => {
        const on = value.includes(m.code);
        return (
          <button key={m.code} type="button" aria-pressed={on} title={m.label} aria-label={m.code + ' · ' + m.label} className={cx('bc-marca', on && 'is-on')} onClick={() => toggle(m.code)}>
            <span className="bc-marca__code">{m.code}</span>
            {!compacto && <span className="bc-marca__label">{m.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Dados de câmera ───────────────────────── */
export function FieldTile({ label, value, changed, span = 1, onPress, active, placeholder = '—' }) {
  return (
    <button
      type="button"
      className={cx('bc-field', changed && 'is-alterado', active && 'is-ativo')}
      style={span > 1 ? { gridColumn: 'span ' + span } : undefined}
      onClick={onPress}
      aria-label={label + ': ' + (value || 'vazio') + (changed ? ', alterado' : '')}
    >
      <span className="bc-field__topo">
        <span className="bc-field__rotulo">{label}</span>
        {changed && <span className="bc-field__mudou">MUDOU</span>}
      </span>
      <span className={cx('bc-field__valor', !value && 'is-vazio')}>{value || placeholder}</span>
    </button>
  );
}

export function QuickPicker({ label, options, value, onChange, anterior, outro = true }) {
  return (
    <div className="bc-qp">
      {label && <div className="bc-qp__rotulo">{label}</div>}
      <div className="bc-qp__lista" role="listbox" aria-label={label}>
        {options.map((o) => {
          const on = o === value;
          return (
            <button key={o} type="button" role="option" aria-selected={on} className={cx('bc-chip', on && 'is-on')} onClick={() => onChange && onChange(o)}>
              <span>{o}</span>
              {o === anterior && <span className="bc-chip__nota">anterior</span>}
            </button>
          );
        })}
        {outro && (
          <button type="button" className="bc-chip bc-chip--outro">
            <Icon name="pencil" size={20} />
            <span>Outro</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function Stepper({ label, value, onPrev, onNext }) {
  return (
    <div className="bc-stepper">
      {label && <div className="bc-qp__rotulo">{label}</div>}
      <div className="bc-stepper__linha">
        <button type="button" className="bc-stepper__btn" onClick={onPrev} aria-label="Diminuir">
          <Icon name="minus" size={28} strokeWidth={3} />
        </button>
        <output className="bc-stepper__valor">{value}</output>
        <button type="button" className="bc-stepper__btn" onClick={onNext} aria-label="Aumentar">
          <Icon name="plus" size={28} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

export function Sheet({ title, onClose, children, footer, inline }) {
  return (
    <div className={cx('bc-sheet-wrap', inline && 'is-inline')}>
      {!inline && <div className="bc-sheet-veu" onClick={onClose} />}
      <section className="bc-sheet" role="dialog" aria-label={title}>
        <div className="bc-sheet__alca" aria-hidden="true" />
        <header className="bc-sheet__topo">
          <h2 className="bc-sheet__titulo">{title}</h2>
          {onClose && <Button variant="fantasma" size="p" icon="x" aria-label="Fechar" onClick={onClose} />}
        </header>
        <div className="bc-sheet__corpo">{children}</div>
        {footer && <footer className="bc-sheet__rodape">{footer}</footer>}
      </section>
    </div>
  );
}

/* ───────────────────────── Sincronização ───────────────────────── */
const SYNC = {
  enviado: { icon: 'check-check', texto: () => 'Tudo enviado', curto: () => '' },
  pendente: { icon: 'cloud-upload', texto: (n) => n + (n === 1 ? ' pendente' : ' pendentes'), curto: (n) => String(n) },
  enviando: { icon: 'refresh-cw', texto: (n) => (n ? 'Enviando ' + n + '…' : 'Sincronizando…'), curto: (n) => (n ? String(n) : '') },
  offline: { icon: 'cloud-off', texto: (n) => 'Sem internet' + (n ? ' · ' + n + ' no aparelho' : ''), curto: (n) => (n ? String(n) : '') },
  erro: { icon: 'circle-alert', texto: (n) => (n || 1) + ((n || 1) === 1 ? ' com erro' : ' com erro'), curto: (n) => String(n || 1) },
};

export function SyncIndicator({ state = 'enviado', count = 0, compact, onPress }) {
  const s = SYNC[state];
  const full = s.texto(count);
  return (
    <button type="button" className={cx('bc-sync', 'bc-sync--' + state, compact && 'bc-sync--compacto')} onClick={onPress} aria-label={full} title={full}>
      <Icon name={s.icon} size={20} strokeWidth={2.5} className={state === 'enviando' ? 'bc-gira' : undefined} />
      <span>{compact ? s.curto(count) : full}</span>
    </button>
  );
}

/* ───────────────────────── Câmeras ───────────────────────── */
export function CameraBadge({ cam = 'A', size = 'm' }) {
  return (
    <span className={cx('bc-cam', 'bc-cam--' + String(cam).toLowerCase(), 'bc-cam--' + size)} aria-label={'Câmera ' + cam}>
      {cam}
    </span>
  );
}

export function CameraTabs({ cameras, value, onChange }) {
  return (
    <div className="bc-camtabs" role="tablist" aria-label="Câmeras">
      {cameras.map((c) => {
        const on = c.id === value;
        return (
          <button key={c.id} type="button" role="tab" aria-selected={on} className={cx('bc-camtab', on && 'is-on')} onClick={() => onChange && onChange(c.id)}>
            <CameraBadge cam={c.id} />
            <span className="bc-camtab__plano">{c.plano}</span>
            <StatusBadge status={c.status} compact />
            {c.circulado && <Icon name="star" size={18} strokeWidth={2.5} className="bc-camtab__estrela" />}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Etiquetas ───────────────────────── */
export function Tag({ children, icon, forte }) {
  return (
    <span className={cx('bc-tag', forte && 'bc-tag--forte')}>
      {icon && <Icon name={icon} size={16} strokeWidth={2.5} />}
      {children}
    </span>
  );
}

/* ───────────────────────── Cartões ───────────────────────── */
export function DiariaCard({ dia, data, cenas = 0, takes = 0, hoje, sync, onPress }) {
  return (
    <button type="button" className={cx('bc-card', 'bc-diaria', hoje && 'is-hoje')} onClick={onPress}>
      <span className="bc-diaria__esq">
        <span className="bc-diaria__rotulo">DIA</span>
        <span className="bc-diaria__num">{String(dia).padStart(2, '0')}</span>
      </span>
      <span className="bc-diaria__meio">
        <span className="bc-diaria__data">
          {data}
          {hoje && <Tag forte>HOJE</Tag>}
        </span>
        <span className="bc-diaria__info">
          {cenas} {cenas === 1 ? 'cena' : 'cenas'} · {takes} takes
        </span>
        {sync && <SyncIndicator state={sync.state} count={sync.count} />}
      </span>
      <Icon name="chevron-right" size={28} className="bc-card__seta" />
    </button>
  );
}

export function CenaCard({ ordem, numero, intExt, diaNoite, locacao, descricao, planos, takes, circulados, outrosDias, naoGravada, arrastavel, selecionada, onPress }) {
  const sel = selecionada !== undefined;
  return (
    <div className={cx('bc-card', 'bc-cena', naoGravada && 'is-pendente', selecionada && 'is-selecionada')}>
      {sel && (
        <span className="bc-cena__sel" aria-hidden="true">
          <span className="bc-perm__radio">{selecionada && <Icon name="check" size={18} strokeWidth={3.5} />}</span>
        </span>
      )}
      {arrastavel && (
        <span className="bc-cena__alca" aria-label="Arrastar para reordenar" role="button" tabIndex={0}>
          <Icon name="grip-vertical" size={24} />
          {ordem != null && <span className="bc-cena__ordem">{ordem}º</span>}
        </span>
      )}
      <button type="button" className="bc-cena__corpo" onClick={onPress} aria-pressed={sel ? !!selecionada : undefined}>
        <span className="bc-cena__linha1">
          <span className="bc-cena__num">
            <span className="bc-cena__rotulo">CENA</span>
            {numero}
          </span>
          <span className="bc-cena__tags">
            {intExt && <Tag>{intExt}</Tag>}
            {diaNoite && <Tag icon={diaNoite === 'NOITE' ? 'moon' : 'sun'}>{diaNoite}</Tag>}
          </span>
        </span>
        {locacao && <span className="bc-cena__loc">{locacao}</span>}
        {descricao && <span className="bc-cena__desc">{descricao}</span>}
        <span className="bc-cena__stats">
          {naoGravada ? (
            <span>Ainda não gravada</span>
          ) : (
            <>
              <span>{planos} {planos === 1 ? 'plano' : 'planos'}</span>
              <span>{takes} takes</span>
              <span className="bc-cena__circ">
                <Icon name="star" size={16} strokeWidth={2.5} /> {circulados}
              </span>
            </>
          )}
        </span>
        {outrosDias && <span className="bc-cena__outros">Também em {outrosDias}</span>}
      </button>
    </div>
  );
}

const PAPEIS = { dono: 'DONO', editar: 'PODE EDITAR', visualizar: 'SÓ VISUALIZAR' };
export function ProjetoCard({ nome, papel = 'dono', tipo, detalhe, atividade, pendentes = 0, offline, hoje, onPress }) {
  return (
    <button type="button" className={cx('bc-card', 'bc-projcard', hoje && 'is-hoje')} onClick={onPress}>
      <span className="bc-projcard__corpo">
        <span className="bc-projcard__l1">
          <strong className="bc-projcard__nome">{nome}</strong>
          <Tag forte={papel === 'dono'}>{PAPEIS[papel] || papel}</Tag>
        </span>
        {(tipo || detalhe) && <span className="bc-projcard__sub">{[tipo, detalhe].filter(Boolean).join(' · ')}</span>}
        {atividade && (
          <span className="bc-projcard__ativ">
            {hoje && <Tag forte>HOJE</Tag>}
            {atividade}
          </span>
        )}
      </span>
      {pendentes > 0 && (
        <span className={cx('bc-sync', 'bc-sync--compacto', offline ? 'bc-sync--offline' : 'bc-sync--pendente')} title={pendentes + ' pendentes'}>
          <Icon name={offline ? 'cloud-off' : 'cloud-upload'} size={20} strokeWidth={2.5} />
          <span>{pendentes}</span>
        </span>
      )}
      <Icon name="chevron-right" size={28} className="bc-card__seta" />
    </button>
  );
}

export function PlanoCard({ numero, tipo, descricao, cams, junto, proximo, takes = [], total = 0, podeGravar = true, onGravar, onVerTodos, onRenomear }) {
  return (
    <section className="bc-card bc-pcard" aria-label={'Plano ' + numero}>
      <header className="bc-pcard__topo">
        <span className="bc-pcard__id">
          <span className="bc-pcard__rot">PLANO</span>
          <span className="bc-pcard__num">{numero}</span>
        </span>
        <span className="bc-pcard__meta">
          <span className="bc-pcard__tags">
            {tipo && <Tag>{tipo}</Tag>}
            {cams && cams.map((c) => <CameraBadge key={c} cam={c} size="p" />)}
          </span>
          {descricao && <span className="bc-pcard__desc">{descricao}</span>}
          {junto && <span className="bc-pcard__junto">Roda junto com o plano {junto}</span>}
        </span>
        {podeGravar && (
          <Button icon="clapperboard" onClick={onGravar} aria-label={'Gravar take ' + proximo} className="bc-pcard__gravar">
            {'Gravar ' + proximo}
          </Button>
        )}
      </header>
      {takes.length > 0 ? (
        <div className="bc-pcard__takes">
          {takes.map((t, i) => (
            <button key={i} type="button" className="bc-pcard__take" onClick={t.onPress} aria-label={'Take ' + t.take + (t.cam ? ' câmera ' + t.cam : '') + ', ' + (t.status || 'sem status') + (t.circulado ? ', circulado' : '')}>
              <TakeNumber numero={t.take} circulado={t.circulado} size="p" label={false} />
              <StatusBadge status={t.status} compact />
              {t.cam && <span className="bc-pcard__cam">{t.cam}</span>}
            </button>
          ))}
          {total > takes.length && (
            <button type="button" className="bc-pcard__take bc-pcard__mais" onClick={onVerTodos}>
              +{total - takes.length}
            </button>
          )}
        </div>
      ) : (
        <p className="bc-pcard__vazio">Nenhum take ainda</p>
      )}
      {(total > 0 || onRenomear) && (
        <footer className="bc-pcard__rodape">
          {total > 0 ? (
            <button type="button" className="bc-link" onClick={onVerTodos}>
              {total === 1 ? 'Ver o take' : 'Todos os ' + total + ' takes'}
            </button>
          ) : <span />}
          {onRenomear && <Button variant="fantasma" size="p" icon="pencil" onClick={onRenomear}>Editar plano</Button>}
        </footer>
      )}
    </section>
  );
}


export function PlanoRow({ numero, tipo, descricao, takes = 0, circulados = 0, ultimo, cams, onPress }) {
  return (
    <button type="button" className="bc-plano" onClick={onPress}>
      <span className="bc-plano__num">{numero}</span>
      <span className="bc-plano__meio">
        <span className="bc-plano__l1">
          {tipo && <Tag>{tipo}</Tag>}
          {cams && cams.map((c) => <CameraBadge key={c} cam={c} size="p" />)}
        </span>
        {descricao && <span className="bc-plano__desc">{descricao}</span>}
        <span className="bc-plano__stats">
          {takes} {takes === 1 ? 'take' : 'takes'}
          {circulados > 0 && (
            <span className="bc-cena__circ">
              <Icon name="star" size={16} strokeWidth={2.5} /> {circulados}
            </span>
          )}
        </span>
      </span>
      {ultimo !== undefined && <StatusBadge status={ultimo} compact />}
      <Icon name="chevron-right" size={24} className="bc-card__seta" />
    </button>
  );
}

export function TakeRow({ take, status, circulado, estrelas, cam, clipe, lente, tstop, som = 'SYNC', marcas = [], hora, nota, fotos = 0, onPress }) {
  return (
    <button type="button" className={cx('bc-takerow', 'bc-takerow--' + (status ? STATUS[status].key : 'vazio'))} onClick={onPress}>
      <TakeNumber numero={take} circulado={circulado} size="m" label={false} />
      <span className="bc-takerow__meio">
        <span className="bc-takerow__l1">
          <StatusBadge status={status} />
          {estrelas > 0 && <span className="bc-takerow__estrelas" aria-label={estrelas + ' estrelas'}>{'★'.repeat(estrelas)}</span>}
          {cam && <CameraBadge cam={cam} size="p" />}
          {som === 'MOS' && <Tag icon="mic-off">MOS</Tag>}
          {marcas.map((m) => (
            <Tag key={m}>{m}</Tag>
          ))}
        </span>
        <span className="bc-takerow__dados">
          {[clipe, lente, tstop].filter(Boolean).join('  ·  ')}
        </span>
        {nota && <span className="bc-takerow__nota">{nota}</span>}
      </span>
      <span className="bc-takerow__dir">
        {hora && <span className="bc-takerow__hora">{hora}</span>}
        {fotos > 0 && (
          <span className="bc-takerow__fotos">
            <Icon name="image" size={16} /> {fotos}
          </span>
        )}
      </span>
    </button>
  );
}

export function PhotoRef({ src, legenda, meta, adicionar, onPress }) {
  if (adicionar) {
    return (
      <button type="button" className="bc-foto bc-foto--add" onClick={onPress}>
        <span className="bc-foto__img">
          <Icon name="camera" size={32} />
          <span>Tirar foto</span>
        </span>
        <span className="bc-foto__legenda">ou escolher da galeria</span>
      </button>
    );
  }
  return (
    <figure className="bc-foto" onClick={onPress}>
      <span className="bc-foto__img">{src ? <img src={src} alt={legenda || 'Foto de referência'} /> : <Icon name="image" size={32} />}</span>
      {meta && <span className="bc-foto__meta">{meta}</span>}
      <figcaption className={cx('bc-foto__legenda', !legenda && 'is-vazio')}>{legenda || 'Adicionar legenda'}</figcaption>
    </figure>
  );
}

/* ───────────────────────── Avisos ───────────────────────── */
const BANNER_ICON = { info: 'circle-alert', offline: 'cloud-off', erro: 'circle-alert', compartilhado: 'users', sucesso: 'check' };
export function Banner({ tone = 'info', title, children, action, onAction }) {
  return (
    <div className={cx('bc-banner', 'bc-banner--' + tone)} role={tone === 'erro' ? 'alert' : 'status'}>
      <Icon name={BANNER_ICON[tone]} size={24} strokeWidth={2.5} className="bc-banner__icone" />
      <div className="bc-banner__texto">
        {title && <strong>{title}</strong>}
        {children && <span>{children}</span>}
        {action && (
          <Button size="p" variant={tone === 'erro' ? 'perigo' : 'secundario'} onClick={onAction} className="bc-banner__acao">
            {action}
          </Button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'clapperboard', title, children, action, actionIcon = 'plus', onAction }) {
  return (
    <div className="bc-vazio">
      <span className="bc-vazio__icone">
        <Icon name={icon} size={40} strokeWidth={2} />
      </span>
      <h3 className="bc-vazio__titulo">{title}</h3>
      {children && <p className="bc-vazio__texto">{children}</p>}
      {action && (
        <Button variant="primario" icon={actionIcon} onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}

/* ───────────────────────── Navegação ───────────────────────── */
export function AppBar({ titulo, trilha, sync, onBack, actions }) {
  return (
    <header className="bc-appbar">
      {onBack && <Button variant="fantasma" size="p" icon="chevron-left" aria-label="Voltar" onClick={onBack} />}
      <div className="bc-appbar__titulos">
        {trilha && <span className="bc-appbar__trilha">{trilha}</span>}
        <span className="bc-appbar__titulo">{titulo}</span>
      </div>
      {sync && <SyncIndicator compact state={sync.state} count={sync.count} />}
      {actions}
    </header>
  );
}

const TABS = [
  { id: 'hoje', icon: 'clapperboard', label: 'Hoje' },
  { id: 'diarias', icon: 'calendar-days', label: 'Diárias' },
  { id: 'roteiro', icon: 'list', label: 'Roteiro' },
  { id: 'relatorios', icon: 'file-text', label: 'Relatórios' },
];
export function TabBar({ value = 'hoje', onChange, items = TABS }) {
  return (
    <nav className="bc-tabbar" aria-label="Navegação principal">
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} type="button" aria-current={on ? 'page' : undefined} className={cx('bc-tabbar__item', on && 'is-on')} onClick={() => onChange && onChange(t.id)}>
            <span className="bc-tabbar__icone">
              <Icon name={t.icon} size={24} strokeWidth={on ? 2.75 : 2.25} />
            </span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ───────────────────────── Formulários ───────────────────────── */
export function TextField({ label, value, onChange, placeholder, multiline, hint, mono }) {
  const id = useRef('bc-tf-' + Math.random().toString(36).slice(2, 8)).current;
  const El = multiline ? 'textarea' : 'input';
  return (
    <div className="bc-tf">
      {label && (
        <label className="bc-tf__rotulo" htmlFor={id}>
          {label}
        </label>
      )}
      <El
        id={id}
        className={cx('bc-tf__campo', multiline && 'is-multi', mono && 'is-mono')}
        value={value}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
        onChange={(e) => onChange && onChange(e.target.value)}
      />
      {hint && <span className="bc-tf__dica">{hint}</span>}
    </div>
  );
}

const PERMS = [
  { id: 'editar', icon: 'pencil', titulo: 'Pode editar', texto: 'Registra takes, muda dados e gera relatórios.' },
  { id: 'visualizar', icon: 'eye', titulo: 'Só visualizar', texto: 'Vê o projeto e baixa relatórios. Não altera nada.' },
];
export function PermissionPicker({ value = 'editar', onChange }) {
  return (
    <div className="bc-perm" role="radiogroup" aria-label="Permissão">
      {PERMS.map((p) => {
        const on = p.id === value;
        return (
          <button key={p.id} type="button" role="radio" aria-checked={on} className={cx('bc-perm__op', on && 'is-on')} onClick={() => onChange && onChange(p.id)}>
            <Icon name={p.icon} size={24} />
            <span className="bc-perm__txt">
              <strong>{p.titulo}</strong>
              <span>{p.texto}</span>
            </span>
            <span className="bc-perm__radio" aria-hidden="true">
              {on && <Icon name="check" size={18} strokeWidth={3.5} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function MemberRow({ nome, email, funcao, permissao = 'editar', dono, pendente }) {
  const iniciais = nome
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="bc-membro">
      <span className="bc-membro__avatar" aria-hidden="true">
        {iniciais}
      </span>
      <span className="bc-membro__txt">
        <strong>{nome}</strong>
        <span>{[funcao, email].filter(Boolean).join(' · ')}</span>
      </span>
      {dono ? (
        <Tag forte>DONO</Tag>
      ) : pendente ? (
        <Tag>CONVITE ENVIADO</Tag>
      ) : (
        <button type="button" className="bc-membro__perm">
          {permissao === 'editar' ? 'Pode editar' : 'Só visualizar'}
          <Icon name="chevron-down" size={20} />
        </button>
      )}
    </div>
  );
}

/* ───────────────────────── Registro de take ───────────────────────── */
const PADRAO_OPCOES = {
  lente: ['18mm', '25mm', '32mm', '40mm', '50mm', '75mm', '100mm', '135mm'],
  tstop: ['T1.4', 'T2', 'T2.8', 'T4', 'T5.6', 'T8', 'T11', 'T16'],
  filtros: ['—', 'ND.3', 'ND.6', 'ND.9', 'ND1.2', 'POL', 'BPM 1/8', 'BPM 1/4'],
  iso: ['400', '640', '800', '1280', '3200'],
  shutter: ['90°', '144°', '172.8°', '180°', '270°'],
  fps: ['23.976', '24', '25', '30', '48', '60', '120'],
  wb: ['3200K', '4300K', '5600K', '6500K'],
  foco: ['0,6m', '0,9m', '1,2m', '1,5m', '2m', '2,4m', '3m', '5m', '∞'],
};
const CAMPOS = [
  { k: 'rolo', label: 'ROLO' },
  { k: 'clipe', label: 'CLIPE', span: 2 },
  { k: 'lente', label: 'LENTE' },
  { k: 'tstop', label: 'T-STOP' },
  { k: 'foco', label: 'FOCO' },
  { k: 'filtros', label: 'FILTROS' },
  { k: 'iso', label: 'ISO' },
  { k: 'shutter', label: 'SHUTTER' },
  { k: 'fps', label: 'FPS' },
  { k: 'wb', label: 'WB' },
];
const avancaClipe = (c) => (c || '').replace(/(\d+)(?!.*\d)/, (m) => String(Number(m) + 1).padStart(m.length, '0'));

function novoRegistro(cam, dados) {
  return { id: cam.id, plano: cam.plano, dados: { ...dados }, anterior: { ...dados }, status: null, circulado: false };
}

export function TakeRecorder({ cena = '12', tipo = 'PP', takeInicial = 4, cameras, som: somIni = 'SYNC', opcoes = PADRAO_OPCOES, contexto = true, fotos = 0, temNota = false, onSalvar, onFoto, onNota }) {
  const camsIni = cameras || [{ id: 'A', plano: '12A', dados: { rolo: 'A001', clipe: 'A001C004', lente: '50mm', tstop: 'T2.8', foco: '2,4m', filtros: 'ND.6', iso: '800', shutter: '180°', fps: '24', wb: '5600K' } }];
  const [take, setTake] = useState(takeInicial);
  const [regs, setRegs] = useState(() => camsIni.map((c) => novoRegistro(c, c.dados)));
  const [ativa, setAtiva] = useState(camsIni[0].id);
  const [som, setSom] = useState(somIni);
  const [marcas, setMarcas] = useState([]);
  const [campo, setCampo] = useState(null);
  const [salvo, setSalvo] = useState(null);
  const multi = regs.length > 1;
  const reg = regs.find((r) => r.id === ativa);
  const raiz = useRef(null);
  const primeiro = useRef(true);
  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false;
      return;
    }
    let el = raiz.current && raiz.current.parentElement;
    while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
    if (el) el.scrollTop = 0;
  }, [take]);

  const atualiza = (fn) => setRegs((rs) => rs.map((r) => (r.id === ativa ? fn(r) : r)));
  const setDado = (k, v) => atualiza((r) => ({ ...r, dados: { ...r.dados, [k]: v } }));

  const proximo = () => {
    const resumo = regs.map((r) => (multi ? r.id + ' ' : '') + (r.status || 'sem status')).join(' · ');
    onSalvar && onSalvar({ take, som, marcas, registros: regs });
    setSalvo({ take, resumo });
    setTake(take + 1);
    setMarcas([]);
    setCampo(null);
    setRegs((rs) =>
      rs.map((r) => {
        const d = { ...r.dados, clipe: avancaClipe(r.dados.clipe) };
        return { ...r, dados: d, anterior: { ...r.dados, clipe: d.clipe }, status: null, circulado: false };
      })
    );
  };
  const mesmoStatus = () => setRegs((rs) => rs.map((r) => ({ ...r, status: reg.status })));

  const c = campo && CAMPOS.find((x) => x.k === campo);
  const idxT = opcoes.tstop.indexOf(reg.dados.tstop);

  return (
    <div className="bc-rec" ref={raiz}>
      {contexto && <div className="bc-rec__ctx">
        <span className="bc-rec__ctxtxt">
          <strong>CENA {cena}</strong>
          <span>·</span>
          <strong>{multi ? regs.map((r) => r.plano).join(' + ') : 'PLANO ' + reg.plano}</strong>
          <Tag>{tipo}</Tag>
        </span>
      </div>}


      {multi && <div className="bc-rec__cams"><CameraTabs cameras={regs.map((r) => ({ id: r.id, plano: r.plano, status: r.status, circulado: r.circulado }))} value={ativa} onChange={setAtiva} /></div>}

      {salvo && (
        <div className="bc-rec__salvo" role="status">
          <Icon name="check" size={20} strokeWidth={3} />
          <span>
            Take {salvo.take} salvo no aparelho · {salvo.resumo}
          </span>
        </div>
      )}

      <div className="bc-rec__take">
        <TakeNumber numero={take} circulado={reg.circulado} />
        <div className="bc-rec__takedir">
          <CircleToggle on={reg.circulado} onChange={(v) => atualiza((r) => ({ ...r, circulado: v }))} />
          <SegmentToggle label="Som" value={som} onChange={setSom} options={[{ value: 'SYNC', icon: 'mic' }, { value: 'MOS', icon: 'mic-off' }]} />
        </div>
      </div>

      <div className="bc-rec__bloco">
        <MarkChips compacto value={marcas} onChange={setMarcas} />
      </div>

      <div className="bc-rec__bloco">
        <div className="bc-rec__secrot">
          <span>Dados {multi ? 'da câmera ' + ativa : 'de câmera'}</span>
          <span className="bc-rec__dica">Iguais ao take anterior · toque para mudar</span>
        </div>
        <div className="bc-rec__grade">
          {CAMPOS.map((f) => (
            <FieldTile
              key={f.k}
              label={f.label}
              value={reg.dados[f.k]}
              span={f.span}
              active={campo === f.k}
              changed={f.k !== 'clipe' && reg.dados[f.k] !== reg.anterior[f.k]}
              onPress={() => setCampo(campo === f.k ? null : f.k)}
            />
          ))}
        </div>
      </div>

      <div className="bc-rec__extras">
        <Button icon={temNota ? 'check' : 'notebook-pen'} block onClick={() => onNota && onNota({ take, cam: ativa })}>
          {temNota ? 'Nota escrita' : 'Nota'}
        </Button>
        <Button icon="camera" block onClick={() => onFoto && onFoto({ take, cam: ativa })}>
          {fotos > 0 ? 'Foto · ' + fotos : 'Foto'}
        </Button>
      </div>

      <div className="bc-rec__rodape">
        {multi && (
          <div className="bc-rec__camrot">
            <span>
              Status da câmera <CameraBadge cam={ativa} size="p" />
            </span>
            {reg.status && (
              <button type="button" className="bc-link" onClick={mesmoStatus}>
                Usar em todas
              </button>
            )}
          </div>
        )}
        <StatusPicker value={reg.status} onChange={(v) => atualiza((r) => ({ ...r, status: v }))} />
        <Button variant="primario" size="g" block iconRight="arrow-right" onClick={proximo}>
          Próximo · Take {take + 1}
        </Button>
      </div>

      {c && (
        <Sheet
          title={c.label + (multi ? ' · câmera ' + ativa : '')}
          onClose={() => setCampo(null)}
          footer={
            <Button variant="primario" block onClick={() => setCampo(null)}>
              Pronto
            </Button>
          }
        >
          {campo === 'tstop' ? (
            <>
              <Stepper
                value={reg.dados.tstop}
                onPrev={() => setDado('tstop', opcoes.tstop[Math.max(0, idxT - 1)])}
                onNext={() => setDado('tstop', opcoes.tstop[Math.min(opcoes.tstop.length - 1, idxT + 1)])}
              />
              <QuickPicker options={opcoes.tstop} value={reg.dados.tstop} anterior={reg.anterior.tstop} onChange={(v) => setDado('tstop', v)} outro={false} />
            </>
          ) : opcoes[campo] ? (
            <QuickPicker options={opcoes[campo]} value={reg.dados[campo]} anterior={reg.anterior[campo]} onChange={(v) => setDado(campo, v)} />
          ) : (
            <TextField label={c.label} value={reg.dados[campo]} mono onChange={(v) => setDado(campo, v)} hint={campo === 'clipe' ? 'Avança sozinho a cada take: A001C004 → A001C005' : undefined} />
          )}
        </Sheet>
      )}
    </div>
  );
}
