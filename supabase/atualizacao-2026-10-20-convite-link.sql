-- =====================================================================
--  ATUALIZAÇÃO 20/10/2026 — CONVITE POR LINK (WHATSAPP)
--  Cole no Supabase > SQL Editor > Run (pode rodar mais de uma vez).
--  O mesmo conteúdo está no schema.sql.
-- =====================================================================

-- Link de convite: o dono gera, manda pelo WhatsApp; a primeira conta que abrir (logada) entra no projeto.
-- Vale para UMA pessoa (quem abrir primeiro), por 7 dias, e o dono pode cancelar.
create table if not exists public.project_invite_links (
  token             text primary key,
  project_id        uuid not null references public.projects(id) on delete cascade,
  role              text not null default 'editor' check (role in ('editor','viewer')),
  created_by        uuid default auth.uid(),
  created_by_email  text,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '7 days',
  used_by           uuid references auth.users(id) on delete set null,
  used_by_email     text,
  used_at           timestamptz
);
create index if not exists invite_links_project_idx on public.project_invite_links(project_id);
alter table public.project_invite_links enable row level security;
drop policy if exists invite_links_select on public.project_invite_links;
drop policy if exists invite_links_delete on public.project_invite_links;
create policy invite_links_select on public.project_invite_links for select to authenticated
  using (public.is_project_owner(project_id));
create policy invite_links_delete on public.project_invite_links for delete to authenticated
  using (public.is_project_owner(project_id));
grant select, delete on public.project_invite_links to authenticated;
revoke all on public.project_invite_links from anon;

-- Dono cria o link (32 caracteres aleatórios)
create or replace function public.create_invite_link(p_project uuid, p_role text default 'editor')
returns text
language plpgsql security definer set search_path = public, auth as $$
declare v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_project_owner(p_project) then
    raise exception 'Somente o dono do projeto pode convidar pessoas';
  end if;
  if p_role not in ('editor','viewer') then
    raise exception 'Permissão inválida';
  end if;
  insert into public.project_invite_links (token, project_id, role, created_by, created_by_email)
  values (v_token, p_project, p_role, auth.uid(), (select email from auth.users where id = auth.uid()));
  return v_token;
end $$;
revoke all on function public.create_invite_link(uuid, text) from public, anon;
grant execute on function public.create_invite_link(uuid, text) to authenticated;

-- Quem abriu o link (logado) entra no projeto com a permissão do convite. Devolve o id do projeto.
create or replace function public.accept_invite_link(p_token text)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  l public.project_invite_links;
  v_owner uuid;
  v_email text;
begin
  select * into l from public.project_invite_links where token = p_token;
  if l.token is null then
    raise exception 'Convite inválido ou cancelado. Peça um novo link ao dono do projeto.';
  end if;
  select owner_id into v_owner from public.projects where id = l.project_id and not deleted;
  if v_owner is null then
    raise exception 'Este projeto não existe mais.';
  end if;
  if v_owner = auth.uid() then
    return l.project_id; -- o próprio dono abriu o link
  end if;
  if exists (select 1 from public.project_members where project_id = l.project_id and user_id = auth.uid()) then
    return l.project_id; -- já participa
  end if;
  if l.used_by is not null and l.used_by <> auth.uid() then
    raise exception 'Este convite já foi usado por outra conta. Peça um novo link ao dono do projeto.';
  end if;
  if l.expires_at < now() then
    raise exception 'Este convite expirou. Peça um novo link ao dono do projeto.';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.project_members (project_id, user_id, email, role, added_by_email, seen_at)
  values (l.project_id, auth.uid(), lower(v_email), l.role, l.created_by_email, null)
  on conflict (project_id, user_id) do nothing;
  update public.project_invite_links set used_by = auth.uid(), used_by_email = lower(v_email), used_at = now()
  where token = p_token;
  update public.projects set updated_at = now() where id = l.project_id; -- chega na próxima sincronização
  return l.project_id;
end $$;
revoke all on function public.accept_invite_link(text) from public, anon;
grant execute on function public.accept_invite_link(text) to authenticated;
