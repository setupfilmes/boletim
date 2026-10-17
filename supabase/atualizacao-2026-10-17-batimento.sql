-- =====================================================================
--  ATUALIZAÇÃO 17/10/2026 — BATIMENTO DIÁRIO (MANTER O SUPABASE ATIVO)
--  Cole no Supabase > SQL Editor > Run (pode rodar mais de uma vez).
--  O mesmo conteúdo está no schema.sql.
-- =====================================================================

-- O plano grátis pausa o projeto sem uso. Uma consulta só de leitura (ping) pode não contar como uso,
-- então a GitHub Action grava todo dia um "batimento" real no banco (uma linha por origem, sempre atualizada:
-- chamar várias vezes só muda a data, não enche a tabela).
create table if not exists public.heartbeat (
  origin  text primary key,
  at      timestamptz not null default now(),
  count   bigint not null default 0
);
alter table public.heartbeat enable row level security; -- sem policies: ninguém lê/escreve direto
revoke all on public.heartbeat from anon, authenticated;

create or replace function public.heartbeat(p_origin text default 'github') returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v timestamptz;
begin
  if p_origin not in ('github', 'app') then raise exception 'origem inválida'; end if;
  insert into public.heartbeat (origin, at, count) values (p_origin, now(), 1)
  on conflict (origin) do update set at = now(), count = public.heartbeat.count + 1
  returning at into v;
  return v;
end $$;
revoke all on function public.heartbeat(text) from public;
grant execute on function public.heartbeat(text) to anon, authenticated;
