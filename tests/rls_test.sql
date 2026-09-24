\set ON_ERROR_STOP 0
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@test.com'),
 ('00000000-0000-0000-0000-00000000000b','b@test.com');

-- helper to act as user
create or replace function pg_temp.act(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false); end $$;

set role authenticated;
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
insert into projects(id,title) values ('11111111-1111-1111-1111-111111111111','A Tela');
insert into scenes(id,project_id,number) values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','1');
select 'A sees projects', count(*) from projects;

select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select 'B sees projects (expect 0)', count(*) from projects;
select 'B sees scenes (expect 0)', count(*) from scenes;
\echo --- B inserts scene into A project (expect RLS error)
insert into scenes(project_id,number) values ('11111111-1111-1111-1111-111111111111','2');
\echo --- B tries to add himself (expect error)
select add_project_member('11111111-1111-1111-1111-111111111111','b@test.com','editor');

select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select 'A adds B viewer', role from add_project_member('11111111-1111-1111-1111-111111111111','B@test.com','viewer');
\echo --- unknown email (expect error)
select add_project_member('11111111-1111-1111-1111-111111111111','x@test.com','viewer');

select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select 'B viewer sees projects (expect 1)', count(*) from projects;
select 'B viewer sees scenes (expect 1)', count(*) from scenes;
\echo --- B viewer insert scene (expect RLS error)
insert into scenes(project_id,number) values ('11111111-1111-1111-1111-111111111111','2');

select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select 'A makes B editor', role from add_project_member('11111111-1111-1111-1111-111111111111','b@test.com','editor');

select pg_temp.act('00000000-0000-0000-0000-00000000000b');
insert into scenes(project_id,number) values ('11111111-1111-1111-1111-111111111111','2');
select 'B editor inserted scene; total (expect 2)', count(*) from scenes;
\echo --- B editor upserts project title (expect OK)
insert into projects(id,owner_id,title) values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','A Tela (rev)')
  on conflict (id) do update set title = excluded.title;
select 'title now', title from projects;
\echo --- B editor soft-deletes project (expect error)
update projects set deleted = true where id='11111111-1111-1111-1111-111111111111';
\echo --- B creates project owned by A (expect RLS error)
insert into projects(owner_id,title) values ('00000000-0000-0000-0000-00000000000a','hack');
\echo --- B kit item
insert into kit_items(category,value) values ('lens','50mm');
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select 'A sees B kit (expect 0)', count(*) from kit_items;
update projects set deleted = true where id='11111111-1111-1111-1111-111111111111';
select 'A soft-deleted', deleted from projects;
