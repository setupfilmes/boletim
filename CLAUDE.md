# CLAUDE.md — Boletim de Câmera (v2)

Contexto para o Claude Code continuar este projeto. Leia antes de mexer no código.

## Quem e para quê

- Dono: **Antonio** (Setup Filmes, Goiânia) — trabalha como 1º AC / DoP. Fala português; responda em português.
- App de **boletim de câmera** (camera report) para usar **no set**, inspirado no Pocket AC.
- Prioridades, nesta ordem: **funcionar 100% offline**, **velocidade no set (quase sem digitar)**, legibilidade sob sol,
  dados seguros (nunca perder um take).
- Usuários: assistentes de câmera com conta própria (e-mail + senha). Projetos podem ser compartilhados.

## Estado atual (set/2026)

- v2 construída do zero e testada (testes E2E com backend Supabase simulado — ver `tests/`).
- Supabase: projeto criado, `supabase/schema.sql` já executado, "Confirm email" desligado.
- `public/config.js` preenchido (projeto `gfqfmepxcqrvsnhfdviv`) e build gerado em 24/09/2026.
- **Pendente:** publicar `dist/` no Netlify (drag-and-drop), configurar "Site URL" no Supabase, instalar no celular.
- Ainda **não testado com Supabase real nem em aparelho real** (Samsung S25+, iPhone, iPad).
- A v1 (single-file, localStorage) foi abandonada; não há migração de dados dela.

## Comandos

```bash
npm install
npm run dev       # http://localhost:5173 — sem config.js preenchido, o app mostra a tela "Conectar ao banco"
npm run build     # gera dist/ (é isso que vai pro Netlify)
npm run preview   # serve dist/ localmente (testa service worker/offline)
```
Requer Node 20.19+ (recomendado Node 22 LTS).

## Stack

React 19 · Vite 8 · Tailwind CSS 4 (`@tailwindcss/vite`, sem tailwind.config) · vite-plugin-pwa (Workbox, generateSW)
· Dexie 4 + dexie-react-hooks (IndexedDB) · @supabase/supabase-js 2 · react-router 8 (**HashRouter**)
· jsPDF + jspdf-autotable · fontes Syne + DM Mono via @fontsource (empacotadas, funcionam offline).
JavaScript (sem TypeScript). Sem backend próprio: Supabase (Postgres + Auth + RLS) + site estático.

## Arquitetura — "local primeiro"

```
UI (screens) ──> repo.js ──> IndexedDB (Dexie, 1 banco por usuário: boletim_<userId>)
                                 │  linhas com _dirty=1, _rev, _err
                              sync.js  <──>  Supabase (PostgREST + RLS)
```

- **Toda gravação** passa por `src/lib/repo.js`: grava no IndexedDB na hora, marca `_dirty=1`, incrementa `_rev`,
  chama `scheduleSync()`. A UI lê com `useLiveQuery` (`src/lib/hooks.js`) — nunca direto do Supabase
  (exceção: aba Equipe, que é online por natureza).
- **`src/lib/sync.js`**:
  - *push*: tabelas na ordem `projects, kit_items, scenes, shots, takes` (pais antes dos filhos); `upsert` em lotes
    de 200; se o lote falhar, tenta linha a linha e grava `_err` na linha recusada. Só limpa `_dirty` se `_rev`
    não mudou durante o envio. Linha com `deleted=true` enviada com sucesso é apagada do aparelho.
  - *pull*: lista completa de `projects` (detecta projeto novo/compartilhado/removido) + `project_members` do
    usuário (papéis → meta `roles`) + incremental por tabela usando cursor `updated_at` (relógio do **servidor**,
    trigger `touch_updated_at`) com 60 s de sobreposição. Projeto que aparece pela 1ª vez → baixa todos os
    filhos dele. Linha local com `_dirty` nunca é sobrescrita pelo servidor (último envio vence).
  - Dispara: login, evento `online`, app voltando ao primeiro plano, a cada 60 s, e 1,5 s após gravações.
- **Exclusão = soft delete** (`deleted=true`) para propagar entre aparelhos. Excluir cena/plano marca os
  filhos também. Excluir projeto (só o dono) marca o projeto e remove os filhos localmente.
- **IDs são UUID gerados no aparelho** (funciona offline). Itens de kit usam UUID determinístico
  (`stableUuid(userId|categoria|valor)`) para não duplicar entre aparelhos.
- **Auth offline** (`src/auth.jsx`): guarda `boletim.lastUser` no localStorage. Se não houver sessão válida
  (offline/expirada), entra em modo "só no aparelho" (`sessionOk=false`) em vez de mandar pro login.
  `getSession()` tem um timeout de 2,5 s (200 ms se offline) porque o supabase-js pode ficar ~30 s tentando renovar
  o token sem internet. `SIGNED_OUT` não iniciado pelo usuário **não** tira o usuário do app.
- **Config** (`public/config.js` → `window.APP_CONFIG`): carregado fora do bundle para poder editar sem rebuild.
  Fica fora do precache do SW (NetworkFirst) e o app guarda uma cópia em `localStorage` (`boletim.config.cache`)
  porque no 1º acesso o SW ainda não controla a página → sem essa cópia, o app abriria offline sem config.
  Fallback: tela `Setup.jsx` salva URL/chave só no aparelho (`boletim.config`).

## Modelo de dados (`supabase/schema.sql`)

`projects` (owner_id, título, equipe, `kit` jsonb `{lens:[], filter:[]}`) → `scenes` (number texto, int_ext, period,
location) → `shots` (code, shot_type) → `takes` (take_number, shoot_date = diária, camera, roll, clip, lens, t_stop,
filters jsonb[], focus, iso, shutter, fps, wb, status good|ng|check, notes, recorded_at).
`project_id` é denormalizado em scenes/shots/takes (RLS e sync simples). `kit_items` por usuário (category ∈
lens, filter, tstop, focus, iso, shutter, fps, wb, camera). `project_members` (editor|viewer).
Todos os campos de câmera são **texto** (ex.: "T2.8", "180°", "1/50").

Segurança só no banco (RLS): `can_access_project()`, `can_edit_project()`, `is_project_owner()` (security definer);
trigger `guard_project_update` impede não-dono de trocar dono ou excluir; RPC `add_project_member(project, email,
role)` busca a conta em `auth.users`. O schema é **idempotente** (pode rodar de novo). Para mudar o schema:
editar `schema.sql` mantendo idempotência (`if not exists`, `create or replace`, `drop policy if exists`)
e **também** atualizar `COLUMNS` em `src/lib/db.js` (lista do que é enviado no push) e, se criar índice local,
a versão do Dexie em `openDb()` (`db.version(2).stores(...)` — nunca editar a versão 1).

## Mapa de arquivos

- `src/App.jsx` rotas (HashRouter): `/`, `/p/:projectId?tab=cenas|diarias|equipe|info`, `/p/:pid/s/:sceneId`,
  `/p/:pid/s/:sid/sh/:shotId`, `/kit`, `/conta`. Barra inferior só em `/`, `/kit`, `/conta`.
- `src/screens/Shot.jsx` — **tela principal do set** (takes, gavetas de presets, status, notas).
  Topo: `ShotNav` (‹ plano anterior · n/total · próximo › ou "+ Plano" no último; troca com `replace`).
  Card do take aberto: status → cartão/clipe/notas → campos de câmera. No celular os campos de câmera ficam
  recolhidos num resumo (abertos só no take 1 do plano); no tablet (`md+`) ficam sempre abertos.
- `src/lib/repo.js` — CRUD + `createNextTake()` (campos "grudados": `STICKY_FIELDS`, vêm do último take do plano;
  no 1º take do plano, do último take do **mesmo projeto**; projeto novo começa em branco — decisão de produto).
  Clipe: `incrCode()` do take gravado por último no **mesmo cartão** (qualquer plano); se esse take não tem clipe,
  o novo vem vazio (não "pula" números com base em takes antigos).
- `src/lib/export.js` — PDF (A4 paisagem) / CSV (`;` + BOM para Excel pt-BR) / backup JSON, tudo no aparelho.
  jsPDF usa Helvetica (Latin-1): `pdfSafe()` troca `∞` por `INF` etc. jsPDF é carregado com `import()` dentro de
  `buildPdf()` (bundle inicial menor); o chunk entra no precache do SW, então o PDF continua funcionando offline.
- `src/components/PickerSheet.jsx` — gaveta de botões grandes + "Adicionar novo" (salva no kit e no kit do projeto).
- `src/components/ui.jsx` — Btn, Sheet (gaveta), TopBar, Field, TextInput, ChipSelect, DialogProvider
  (`confirm`, `actionSheet`, `notify`). **Não usar `window.confirm/alert`.**
- `src/lib/kit.js` — categorias e kit padrão (lentes, ND/Pro-Mist, T-stops, foco, ISO, shutter, FPS, WB, câmeras).
- `src/index.css` — tokens de tema (escuro padrão + `data-theme="sun"` alto contraste). Cores via
  `bg-bg, bg-surface, bg-surface2, border-line, text-ink, text-muted, accent, good, ng, check`.

## Convenções e armadilhas já resolvidas (não reintroduzir)

- Mobile-first, alvos de toque ≥ 48 px, inputs com 16 px (evita zoom no iOS). Testar em 360 px, 412 px e iPad
  (820×1180 e 1180×820) — **sem rolagem horizontal**.
- `.grid > * { min-width: 0 }` global: sem isso, texto com `truncate` alarga a página no celular.
- `safe-top`/`safe-bottom`/`pb-bar` são `@utility` (em camada). Se virarem CSS solto, sobrescrevem `pb-4` etc.
- `Field` é `<div role="group">`, não `<label>` — label envolvendo chips fazia o toque no título acionar o 1º botão.
- `IconBtn` tem `shrink-0`; linhas de lista usam `min-w-0` no bloco de texto.
- Supabase usa fluxo *implicit* (tokens no `#` da URL). Funciona com o HashRouter porque o Router só monta depois
  de `getSession()`; recuperação de senha abre a tela `NewPassword`. Não trocar para PKCE sem pensar: no iOS o link
  do e-mail abre no Safari, que não compartilha armazenamento com o app instalado.
- Layout tablet: listas `md:grid-cols-2 lg:grid-cols-3`, campos do take `md:grid-cols-4`, gavetas centralizadas
  `md:max-w-2xl`. Manifest `orientation: 'any'`.
- Textos da interface em português do Brasil. Datas dd/mm/aaaa.

## Deploy

1. `public/config.js`: `SUPABASE_URL` = `https://<ref>.supabase.co`; `SUPABASE_ANON_KEY` = publishable key
   (`sb_publishable_...`). **Nunca** a secret key.
2. `npm run build` → arrastar a pasta `dist/` em app.netlify.com/drop (ou Deploys → arrastar, para atualizar).
3. Supabase → Authentication → URL Configuration → Site URL = endereço do Netlify.
4. Mudou só o `config.js`? Faça novo build/deploy para os aparelhos já instalados pegarem.
5. Supabase grátis pausa após 7 dias sem acesso (dados preservados; "Restore" no painel).

## Testes (`tests/`)

Scripts Playwright usados no desenvolvimento, contra um "Supabase de mentira" local:
Postgres 16 + PostgREST 12 + `tests/gateway.mjs` (auth mínima compatível com GoTrue + proxy `/rest/v1`).
`bootstrap.sql` cria os papéis/`auth.users`/`auth.uid()` que o schema espera; `rls_test.sql` testa as permissões.
Os caminhos nos scripts são do ambiente original (Linux) — adapte antes de rodar. Cobertura: cadastro, projeto
exemplo, takes via presets, campos grudados, offline + recarregar, PDF/CSV offline, sincronização ao voltar,
compartilhamento entre 2 contas, soft delete, logout/login, sessão expirada offline, link de nova senha, layout iPad.
Alternativa mais simples no Windows: Supabase CLI (`npx supabase start`, requer Docker).

## Ideias para próximas versões (não implementadas)

- Tempo real (Supabase Realtime) para 2 câmeras editando ao mesmo tempo.
- Campos por projeto configuráveis (ex.: timecode, LUT, altura/tilt, distância hiperfocal).
- Importar lista de cenas (CSV do roteiro/ordem do dia).
- Relatório por cartão/rolo para o DIT; fotos de referência por take (Supabase Storage).
- Resolver conflitos com merge por campo (hoje: último envio vence por linha).
