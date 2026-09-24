-- =====================================================================
--  BOLETIM DE CÂMERA — Schema do banco (Supabase / PostgreSQL)
--  Cole este arquivo inteiro no Supabase > SQL Editor > Run.
--  Pode ser executado de novo com segurança (é idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title            text not null,
  production_type  text,            -- Curta, Longa, Série, Publicidade, Clipe...
  company          text,            -- Produtora
  director         text,
  dop              text,
  first_ac         text,
  second_ac        text,
  logger           text,            -- DIT / GMA / Logger
  camera_body      text,            -- Ex: ARRI Alexa Mini LF
  kit              jsonb not null default '{}'::jsonb,  -- {"lens":[...],"filter":[...]} kit do projeto
  notes            text,
  deleted          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null default 'editor' check (role in ('editor','viewer')),
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.scenes (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  number       text not null,       -- "12", "12A"
  int_ext      text,                -- INT / EXT / INT-EXT
  period       text,                -- DIA / NOITE / ...
  location     text,
  description  text,
  sort_order   double precision not null default 0,
  created_by   uuid default auth.uid(),
  deleted      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.shots (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  scene_id     uuid not null references public.scenes(id) on delete cascade,
  code         text not null,       -- "1", "A", "3B"
  shot_type    text,                -- PG, PA, PM, PP, PPP, Detalhe...
  description  text,
  sort_order   double precision not null default 0,
  created_by   uuid default auth.uid(),
  deleted      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.takes (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  scene_id     uuid not null references public.scenes(id) on delete cascade,
  shot_id      uuid not null references public.shots(id) on delete cascade,
  take_number  integer not null,
  shoot_date   date not null default current_date,   -- diária
  camera       text,                -- A, B...
  roll         text,                -- cartão / magazine (A001)
  clip         text,                -- nome do clipe (A001C003)
  lens         text,
  t_stop       text,
  filters      jsonb not null default '[]'::jsonb,
  focus        text,
  iso          text,
  shutter      text,
  fps          text,
  wb           text,
  status       text check (status in ('good','ng','check')),
  notes        text,                -- notas de pós / VFX
  recorded_at  timestamptz,         -- horário do take (relógio do aparelho)
  created_by   uuid default auth.uid(),
  deleted      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.kit_items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category    text not null check (category in ('lens','filter','tstop','focus','iso','shutter','fps','wb','camera')),
  value       text not null,
  sort_order  double precision not null default 0,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Índices (sincronização e navegação)
create index if not exists projects_owner_idx    on public.projects(owner_id);
create index if not exists projects_updated_idx  on public.projects(updated_at);
create index if not exists members_user_idx      on public.project_members(user_id);
create index if not exists scenes_project_idx    on public.scenes(project_id);
create index if not exists scenes_updated_idx    on public.scenes(updated_at);
create index if not exists shots_project_idx     on public.shots(project_id);
create index if not exists shots_scene_idx       on public.shots(scene_id);
create index if not exists shots_updated_idx     on public.shots(updated_at);
create index if not exists takes_project_idx     on public.takes(project_id);
create index if not exists takes_shot_idx        on public.takes(shot_id);
create index if not exists takes_updated_idx     on public.takes(updated_at);
create index if not exists kit_owner_idx         on public.kit_items(owner_id);
create index if not exists kit_updated_idx       on public.kit_items(updated_at);

-- ---------------------------------------------------------------------
-- updated_at sempre com o relógio do servidor (base da sincronização)
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['projects','scenes','shots','takes','kit_items'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before insert or update on public.%1$s
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Funções de permissão (security definer evita recursão de RLS)
-- ---------------------------------------------------------------------
create or replace function public.can_access_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = p and owner_id = auth.uid())
      or exists (select 1 from public.project_members where project_id = p and user_id = auth.uid());
$$;

create or replace function public.can_edit_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = p and owner_id = auth.uid())
      or exists (select 1 from public.project_members
                 where project_id = p and user_id = auth.uid() and role = 'editor');
$$;

create or replace function public.is_project_owner(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = p and owner_id = auth.uid());
$$;

-- Só o dono pode trocar o dono ou excluir o projeto
create or replace function public.guard_project_update() returns trigger
language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then
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
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.scenes          enable row level security;
alter table public.shots           enable row level security;
alter table public.takes           enable row level security;
alter table public.kit_items       enable row level security;

-- projects
drop policy if exists projects_select on public.projects;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (owner_id = auth.uid() or public.can_access_project(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = auth.uid() or public.can_edit_project(id));
create policy projects_update on public.projects for update to authenticated
  using (public.can_edit_project(id)) with check (public.can_edit_project(id));
create policy projects_delete on public.projects for delete to authenticated
  using (owner_id = auth.uid());

-- project_members
drop policy if exists members_select on public.project_members;
drop policy if exists members_delete on public.project_members;
create policy members_select on public.project_members for select to authenticated
  using (public.can_access_project(project_id));
create policy members_delete on public.project_members for delete to authenticated
  using (public.is_project_owner(project_id) or user_id = auth.uid());

-- scenes / shots / takes (mesma regra)
do $$
declare t text;
begin
  foreach t in array array['scenes','shots','takes'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated
                    using (public.can_access_project(project_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated
                    with check (public.can_edit_project(project_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated
                    using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated
                    using (public.can_edit_project(project_id))', t);
  end loop;
end $$;

-- kit_items (cada usuário tem o seu kit)
drop policy if exists kit_all on public.kit_items;
create policy kit_all on public.kit_items for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- Compartilhar projeto com outro assistente (pelo e-mail da conta dele)
-- ---------------------------------------------------------------------
create or replace function public.add_project_member(p_project uuid, p_email text, p_role text default 'editor')
returns public.project_members
language plpgsql security definer set search_path = public, auth as $$
declare
  v_user uuid;
  v_row  public.project_members;
begin
  if not public.is_project_owner(p_project) then
    raise exception 'Somente o dono do projeto pode adicionar pessoas';
  end if;
  if p_role not in ('editor','viewer') then
    raise exception 'Permissão inválida';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then
    raise exception 'Nenhuma conta com este e-mail. Peça para a pessoa criar a conta no app primeiro.';
  end if;
  if v_user = auth.uid() then
    raise exception 'Você já é o dono deste projeto';
  end if;
  insert into public.project_members (project_id, user_id, email, role)
  values (p_project, v_user, lower(trim(p_email)), p_role)
  on conflict (project_id, user_id) do update set role = excluded.role
  returning * into v_row;
  -- "toca" o projeto para o novo membro receber na próxima sincronização
  update public.projects set updated_at = now() where id = p_project;
  return v_row;
end $$;

revoke all on function public.add_project_member(uuid, text, text) from public, anon;
grant execute on function public.add_project_member(uuid, text, text) to authenticated;

-- Permissões de tabela para usuários logados (o RLS acima filtra as linhas)
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.projects, public.scenes, public.shots, public.takes, public.kit_items to authenticated;
grant select, delete on public.project_members to authenticated;
revoke all on public.projects, public.scenes, public.shots, public.takes,
  public.kit_items, public.project_members from anon;
