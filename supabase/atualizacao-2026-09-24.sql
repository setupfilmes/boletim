-- =====================================================================
--  ATUALIZAÇÃO 24/09/2026 — cole no Supabase > SQL Editor > Run
--  (o mesmo conteúdo já está no schema.sql; pode rodar mais de uma vez)
--  Som/circle/marcações/campos extras nos takes, transferência de dono,
--  trava de exclusão de conta dona de projetos e ping para manter o banco acordado.
-- =====================================================================

-- Take: som (sync|mos), circle take, marcações de claquete (['pu','ser','tail','afs','ns']) e campos extras do projeto
alter table public.takes add column if not exists sound text;
alter table public.takes add column if not exists circled boolean;
alter table public.takes add column if not exists marks jsonb;
alter table public.takes add column if not exists extra jsonb;
-- Dono não pode ter a conta apagada enquanto tiver projetos (antes: apagava os projetos em cascata, para todos)
alter table public.projects drop constraint if exists projects_owner_id_fkey;
alter table public.projects add constraint projects_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete restrict;

-- Só o dono pode trocar o dono ou excluir o projeto
create or replace function public.guard_project_update() returns trigger
language plpgsql as $$
begin
  -- troca de dono só pela função transfer_project (que liga app.transfer durante a transação)
  if new.owner_id is distinct from old.owner_id and coalesce(current_setting('app.transfer', true), '') <> 'on' then
    raise exception 'Não é permitido trocar o dono do projeto';
  end if;
  if new.deleted is distinct from old.deleted and old.owner_id is distinct from auth.uid() then
    raise exception 'Somente o dono pode excluir o projeto';
  end if;
  return new;
end $$;

drop trigger if exists guard_project on public.projects;
create trigger guard_project before update on public.projects
  for each row execute function public.guard_project_update();

-- ---------------------------------------------------------------------
-- Transferir o projeto para alguém da equipe (o dono antigo vira editor)
-- ---------------------------------------------------------------------
create or replace function public.transfer_project(p_project uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_old   uuid;
  v_email text;
begin
  select owner_id into v_old from public.projects where id = p_project;
  if v_old is null or v_old <> auth.uid() then
    raise exception 'Somente o dono pode transferir o projeto';
  end if;
  if not exists (select 1 from public.project_members where project_id = p_project and user_id = p_new_owner) then
    raise exception 'A pessoa precisa fazer parte da equipe do projeto';
  end if;
  select email into v_email from auth.users where id = v_old;
  perform set_config('app.transfer', 'on', true);
  update public.projects set owner_id = p_new_owner where id = p_project;
  perform set_config('app.transfer', 'off', true);
  delete from public.project_members where project_id = p_project and user_id = p_new_owner;
  insert into public.project_members (project_id, user_id, email, role)
  values (p_project, v_old, lower(v_email), 'editor')
  on conflict (project_id, user_id) do update set role = 'editor';
end $$;

revoke all on function public.transfer_project(uuid, uuid) from public, anon;
grant execute on function public.transfer_project(uuid, uuid) to authenticated;

-- "Ping" usado pela GitHub Action que mantém o projeto grátis do Supabase acordado (pausa após 7 dias sem uso)
create or replace function public.ping() returns timestamptz
language sql stable as $$ select now() $$;
grant execute on function public.ping() to anon, authenticated;
