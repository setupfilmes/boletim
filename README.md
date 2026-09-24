# Boletim de Câmera — guia de instalação

Web app (PWA) para 1º AC. Funciona no navegador do celular, tablet e computador, e pode ser instalado
como ícone no Android, iPhone e iPad. Depois de instalado, **tudo funciona sem internet**: criar e editar
projetos, cenas, planos e takes, usar o kit de presets e gerar o PDF/CSV da diária. Quando houver internet,
o app sincroniza sozinho com o banco na nuvem (backup, outros aparelhos, equipe).

```
Projeto  →  Cenas  →  Planos  →  Takes
```

---

## O que tem aqui

| Pasta / arquivo | Para que serve |
|---|---|
| `supabase/schema.sql` | Cria o banco de dados (tabelas, permissões e segurança). Roda uma vez no Supabase. |
| `public/config.js` | Onde entram o endereço e a chave pública do seu Supabase. |
| `src/` | Código do app (React + Tailwind). |
| `dist/` (no zip "para-publicar") | O app pronto, para arrastar no Netlify. |

---

## Passo 1 — Criar o banco (Supabase, grátis)

1. Crie uma conta em **supabase.com** e clique em **New project**.
   - Região: **South America (São Paulo)**.
   - Anote a senha do banco (não é usada pelo app, mas guarde).
2. No menu lateral, abra **SQL Editor** → **New query**.
3. Cole **todo** o conteúdo de `supabase/schema.sql` e clique em **Run**. Deve aparecer "Success".
   (Pode rodar de novo no futuro sem perder dados.)
4. **Authentication → Sign In / Providers → Email**:
   - Mais simples: **desligue "Confirm email"**. Assim a conta já entra ao ser criada.
   - Se preferir manter a confirmação por e-mail, faça também o item 6 abaixo.
5. **Project Settings → API Keys**: copie
   - **Project URL** (`https://xxxx.supabase.co`)
   - **Publishable key** (`sb_publishable_...`) — em projetos antigos, a chave **anon public** (`eyJ...`).
   - ⚠️ Nunca use a *secret key* / *service_role* no app.
6. (Depois do Passo 3) **Authentication → URL Configuration → Site URL**: coloque o endereço do seu
   app no Netlify. Isso faz os links de "esqueci a senha" e de confirmação voltarem para o app.

## Passo 2 — Configurar o app

Abra o arquivo `config.js` (na pasta que vai para o Netlify) num editor de texto e preencha:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxx.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_xxxxxxxx',
}
```

Salve. Faça isso **antes** de publicar.

## Passo 3 — Publicar (Netlify, grátis)

1. Entre em **app.netlify.com/drop**.
2. Arraste a **pasta** do app (a que tem `index.html`, `config.js`, `assets/`…) para a área indicada.
3. Em segundos você recebe um endereço tipo `https://nome-aleatorio.netlify.app`.
   Em **Site configuration → Change site name** dá para trocar para algo como `boletim-setup.netlify.app`.
4. Volte ao Supabase e faça o item 6 do Passo 1.

## Passo 4 — Instalar no aparelho

Com internet, abra o endereço do app e:

- **Android (Chrome):** menu **⋮** → **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone / iPad (Safari):** botão **Compartilhar** → **Adicionar à Tela de Início**.

Depois abra **pelo ícone**, crie sua conta (ou entre) e espere o indicador de nuvem ficar verde.
Pronto: a partir daí o app abre e funciona sem internet.

> **iPhone/iPad:** o app instalado na Tela de Início guarda os dados separado do Safari. Faça o login
> e use sempre **pelo ícone**.

---

## No set

- **Cena → Plano → + TAKE**: o take novo já vem com lente, T-stop, filtros, foco, ISO, shutter, FPS, WB,
  câmera e cartão do take anterior (do mesmo plano; no 1º take de um plano, do último take do projeto).
- Toque em qualquer campo para abrir os **botões grandes** do kit. **Adicionar novo** aplica o valor e já
  salva no kit.
- **GOOD / NG / CHECK** em um toque. Takes antigos ficam compactos logo abaixo (dá para mudar o status ali).
- **Diárias** (dentro do projeto): PDF e CSV de cada dia, gerados no próprio aparelho.
  "PDF" abre o compartilhamento (WhatsApp, e-mail, Drive…); "Baixar" salva o arquivo.
- **Conta → Modo sol**: tela branca de alto contraste para externa.

### Indicador de nuvem (canto superior)

| Ícone | Significado |
|---|---|
| Nuvem verde | Tudo sincronizado |
| Nuvem amarela + número | Alterações salvas no aparelho, aguardando envio |
| Nuvem cortada cinza | Sem internet — tudo continua salvo no aparelho |
| Nuvem cortada amarela | Sessão expirou — os dados continuam no aparelho; entre de novo em **Conta** para sincronizar |

### O que precisa de internet

- Instalar o app e fazer o **primeiro login** em cada aparelho.
- Sincronizar (automático quando a conexão volta).
- Compartilhar um projeto com outra pessoa (aba **Equipe**).

Todo o resto funciona offline.

## Equipe (compartilhar projeto)

Na aba **Equipe** do projeto, o dono adiciona outra pessoa pelo **e-mail da conta dela** (ela precisa ter
criado a conta antes), como **Pode editar** ou **Só visualizar**. Os takes registrados por qualquer um
aparecem para todos após a sincronização. Só o dono pode excluir o projeto.

## Atualizar o app no futuro

No Netlify: **Deploys** → arraste a pasta nova. Os aparelhos pegam a versão nova sozinhos na próxima
abertura com internet. **Os dados não são afetados.** Lembre de manter o `config.js` preenchido na pasta nova.

## Avisos importantes

- **Plano grátis do Supabase pausa o banco após 7 dias sem nenhum acesso.** Os dados não se perdem, e o
  app continua funcionando offline, mas a sincronização para até você reativar o projeto no painel do
  Supabase (botão *Restore*). Em época de filmagem isso não acontece, porque o app acessa o banco o tempo todo.
- **Sair da conta** com alterações pendentes: o app avisa. As alterações ficam guardadas no aparelho e
  são enviadas quando você entrar de novo com a mesma conta.
- **Conta → Exportar backup (JSON)** gera uma cópia de tudo, a qualquer momento, mesmo offline.

---

## Para desenvolvedores (ver também CLAUDE.md)

```bash
npm install
npm run dev      # desenvolvimento (http://localhost:5173)
npm run build    # gera a pasta dist/ para publicar
```

Stack: React 19, Tailwind CSS 4, Vite + vite-plugin-pwa (Workbox), Dexie (IndexedDB),
Supabase (Postgres + Auth + RLS), jsPDF.

Arquitetura "local primeiro": toda gravação vai para o IndexedDB do aparelho e é marcada como pendente;
`src/lib/sync.js` envia as pendências (upsert) e baixa o que mudou no servidor (cursor por `updated_at`,
definido pelo relógio do servidor). Exclusões são "soft delete" (`deleted = true`) para se propagarem entre
aparelhos. As permissões ficam no banco (Row Level Security), não no app.
