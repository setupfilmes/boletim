-- =====================================================================
--  ATUALIZAÇÃO 19/10/2026 — DIÁRIAS (PASTAS POR DIA DE FILMAGEM)
--  Cole no Supabase > SQL Editor > Run (pode rodar mais de uma vez).
--  O mesmo conteúdo está no schema.sql.
-- =====================================================================

-- Diária = um dia de filmagem do projeto (Dia 01, Dia 02…). Os takes pertencem à diária pela data (takes.shoot_date).
create table if not exists public.shoot_days (
  id          uuid primary key,
  project_id  uuid not null references public.projects(id) on delete cascade,
  number      int not null,
  date        date not null,
  notes       text,
  created_by  uuid default auth.uid(),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Cenas de cada diária, na ordem de gravação arrumada pela equipe. Uma cena gravada em 2 dias aparece nos 2.
create table if not exists public.day_scenes (
  id          uuid primary key,
  project_id  uuid not null references public.projects(id) on delete cascade,
  day_id      uuid not null references public.shoot_days(id) on delete cascade,
  scene_id    uuid not null references public.scenes(id) on delete cascade,
  sort_order  double precision not null default 0,
  created_by  uuid default auth.uid(),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shoot_days_project_idx on public.shoot_days(project_id);
create index if not exists shoot_days_updated_idx on public.shoot_days(updated_at);
create index if not exists day_scenes_project_idx on public.day_scenes(project_id);
create index if not exists day_scenes_day_idx     on public.day_scenes(day_id);
create index if not exists day_scenes_updated_idx on public.day_scenes(updated_at);

do $$
declare t text;
begin
  foreach t in array array['shoot_days','day_scenes'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before insert or update on public.%1$s
                    for each row execute function public.touch_updated_at()', t);
    execute format('alter table public.%1$s enable row level security', t);
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
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
    execute format('revoke all on public.%1$s from anon', t);
  end loop;
end $$;
