-- =====================================================================
--  ATUALIZAÇÃO 19/10/2026 — CONVITE GUARDADO + AVISO DE PROJETO COMPARTILHADO
--  Cole no Supabase > SQL Editor > Run (pode rodar mais de uma vez).
--  O mesmo conteúdo está no schema.sql.
-- =====================================================================

-- Quem compartilhou e se a pessoa já viu o aviso "projeto compartilhado com você"
alter table public.project_members add column if not exists added_by_email text;
alter table public.project_members add column if not exists seen_at timestamptz;
-- compartilhamentos antigos (antes do aviso existir) contam como vistos
update public.project_members set seen_at = created_at where seen_at is null and added_by_email is null;

-- Convite para um e-mail que ainda não tem conta: vira membro quando a conta for criada (e o e-mail confirmado)
create table if not exists public.project_invites (
  project_id        uuid not null references public.projects(id) on delete cascade,
  email             text not null,
  role              text not null default 'editor' check (role in ('editor','viewer')),
  invited_by        uuid default auth.uid(),
  invited_by_email  text,
  created_at        timestamptz not null default now(),
  primary key (project_id, email)
);
create index if not exists project_invites_email_idx on public.project_invites(email);
alter table public.project_invites enable row level security;
drop policy if exists invites_select on public.project_invites;
drop policy if exists invites_delete on public.project_invites;
create policy invites_select on public.project_invites for select to authenticated
  using (public.is_project_owner(project_id));
create policy invites_delete on public.project_invites for delete to authenticated
  using (public.is_project_owner(project_id));
grant select, delete on public.project_invites to authenticated;
revoke all on public.project_invites from anon;

-- Compartilhar: se o e-mail já tem conta, entra na equipe na hora ('added'); senão guarda o convite ('invited')
create or replace function public.share_project(p_project uuid, p_email text, p_role text default 'editor')
returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := lower(trim(p_email));
  v_user  uuid;
  v_by    text;
begin
  if not public.is_project_owner(p_project) then
    raise exception 'Somente o dono do projeto pode adicionar pessoas';
  end if;
  if p_role not in ('editor','viewer') then
    raise exception 'Permissão inválida';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido';
  end if;
  select email into v_by from auth.users where id = auth.uid();
  select id into v_user from auth.users where lower(email) = v_email limit 1;
  if v_user = auth.uid() then
    raise exception 'Você já é o dono deste projeto';
  end if;
  if v_user is null then
    insert into public.project_invites (project_id, email, role, invited_by, invited_by_email)
    values (p_project, v_email, p_role, auth.uid(), v_by)
    on conflict (project_id, email) do update set role = excluded.role;
    return 'invited';
  end if;
  insert into public.project_members (project_id, user_id, email, role, added_by_email, seen_at)
  values (p_project, v_user, v_email, p_role, v_by, null)
  on conflict (project_id, user_id) do update set role = excluded.role;
  delete from public.project_invites where project_id = p_project and email = v_email;
  update public.projects set updated_at = now() where id = p_project; -- o novo membro recebe na próxima sincronização
  return 'added';
end $$;
revoke all on function public.share_project(uuid, text, text) from public, anon;
grant execute on function public.share_project(uuid, text, text) to authenticated;

-- Transforma os convites guardados de um e-mail em participação nos projetos
create or replace function public.claim_project_invites(p_user uuid, p_email text)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with moved as (
    insert into public.project_members (project_id, user_id, email, role, added_by_email, seen_at)
    select i.project_id, p_user, i.email, i.role, i.invited_by_email, null
    from public.project_invites i
    join public.projects p on p.id = i.project_id and p.owner_id <> p_user
    where i.email = lower(p_email)
    on conflict (project_id, user_id) do nothing
    returning project_id
  )
  update public.projects set updated_at = now() where id in (select project_id from moved);
  get diagnostics n = row_count;
  delete from public.project_invites where email = lower(p_email);
  return n;
end $$;
revoke all on function public.claim_project_invites(uuid, text) from public, anon, authenticated;

-- Ao criar a conta (ou confirmar o e-mail) os convites guardados viram participação. Nunca bloqueia o cadastro.
create or replace function public.on_auth_user_claim_invites()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and new.email is not null then
    begin
      perform public.claim_project_invites(new.id, new.email);
    exception when others then
      raise warning 'claim_project_invites falhou: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
drop trigger if exists claim_invites_on_signup on auth.users;
create trigger claim_invites_on_signup after insert or update of email_confirmed_at, email on auth.users
  for each row execute function public.on_auth_user_claim_invites();

-- Reserva: o app também pede, ao sincronizar, para pegar convites pendentes (só com e-mail confirmado)
create or replace function public.claim_my_invites()
returns int
language plpgsql security definer set search_path = public, auth as $$
declare v_email text; v_ok timestamptz;
begin
  select email, email_confirmed_at into v_email, v_ok from auth.users where id = auth.uid();
  if v_email is null or v_ok is null then return 0; end if;
  return public.claim_project_invites(auth.uid(), v_email);
end $$;
revoke all on function public.claim_my_invites() from public, anon;
grant execute on function public.claim_my_invites() to authenticated;

-- A pessoa viu o aviso "projeto compartilhado com você"
create or replace function public.mark_shares_seen(p_projects uuid[])
returns void
language sql security definer set search_path = public as $$
  update public.project_members set seen_at = now()
  where user_id = auth.uid() and project_id = any(p_projects) and seen_at is null;
$$;
revoke all on function public.mark_shares_seen(uuid[]) from public, anon;
grant execute on function public.mark_shares_seen(uuid[]) to authenticated;
