-- =====================================================================
--  ATUALIZAÇÃO 25/09/2026 — FOTOS DE REFERÊNCIA POR TAKE
--  Cole no Supabase > SQL Editor > Run (pode rodar mais de uma vez).
--  O mesmo conteúdo está no schema.sql.
-- =====================================================================

-- Uma linha por foto (arquivo no Storage em take-photos/<projeto>/<take>/<foto>.jpg)
create table if not exists public.take_photos (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  take_id     uuid not null references public.takes(id) on delete cascade,
  path        text not null,
  width       int,
  height      int,
  caption     text,
  created_by  uuid default auth.uid(),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.take_photos add column if not exists caption text; -- legenda / motivo da foto
create index if not exists take_photos_project_idx on public.take_photos(project_id);
create index if not exists take_photos_take_idx    on public.take_photos(take_id);
create index if not exists take_photos_updated_idx on public.take_photos(updated_at);

drop trigger if exists touch_take_photos on public.take_photos;
create trigger touch_take_photos before insert or update on public.take_photos
  for each row execute function public.touch_updated_at();

alter table public.take_photos enable row level security;
drop policy if exists take_photos_select on public.take_photos;
drop policy if exists take_photos_insert on public.take_photos;
drop policy if exists take_photos_update on public.take_photos;
drop policy if exists take_photos_delete on public.take_photos;
create policy take_photos_select on public.take_photos for select to authenticated
  using (public.can_access_project(project_id));
create policy take_photos_insert on public.take_photos for insert to authenticated
  with check (public.can_edit_project(project_id));
create policy take_photos_update on public.take_photos for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy take_photos_delete on public.take_photos for delete to authenticated
  using (public.can_edit_project(project_id));

grant select, insert, update, delete on public.take_photos to authenticated;
revoke all on public.take_photos from anon;

-- Pasta privada no Storage (até 5 MB por arquivo; o app envia ~300 KB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('take-photos', 'take-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Acesso pelos mesmos papéis do projeto: 1º nível da pasta = id do projeto
drop policy if exists take_photos_obj_select on storage.objects;
drop policy if exists take_photos_obj_insert on storage.objects;
drop policy if exists take_photos_obj_update on storage.objects;
drop policy if exists take_photos_obj_delete on storage.objects;
create policy take_photos_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'take-photos' and public.can_access_project(((storage.foldername(name))[1])::uuid));
create policy take_photos_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'take-photos' and public.can_edit_project(((storage.foldername(name))[1])::uuid));
create policy take_photos_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'take-photos' and public.can_edit_project(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'take-photos' and public.can_edit_project(((storage.foldername(name))[1])::uuid));
create policy take_photos_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'take-photos' and public.can_edit_project(((storage.foldername(name))[1])::uuid));
