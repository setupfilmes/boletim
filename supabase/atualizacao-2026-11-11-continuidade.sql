-- =============================================================
-- Atualização 11/11/2026 — continuidade e importação do DaVinci Resolve
-- Só ACRESCENTA colunas (nada é apagado). Pode rodar de novo sem problema.
-- O app antigo (produção) continua funcionando: ele ignora as colunas novas.
-- =============================================================

-- Take
--   rating      estrelas da continuidade (1–5). GOOD com 5 = VALEU; GOOD com 2–4 = RESERVA.
--               Vai para o Rating do Resolve; GOOD = Good Take, NG = Rejected.
--   clip_type   clipe que não é take: falso_rec, ensaio, wild, insert, som (cobertura de som) (null = take normal)
--   duration    duração do take ("00:00:36:18" ou "0:36")
--   comments    notas de correção / pós (Comments do Resolve)
--   slate_as    o que estava escrito na claquete quando foi marcada errada (ex.: "54/1/1")
--   characters  personagens em cena (["Pauliane", "Valmir"])
--   file_name   nome real do arquivo (A001_09190403_C001.braw) — casa com o File Name do Resolve
alter table public.takes add column if not exists rating smallint;
alter table public.takes add column if not exists clip_type text;
alter table public.takes add column if not exists duration text;
alter table public.takes add column if not exists comments text;
alter table public.takes add column if not exists slate_as text;
alter table public.takes add column if not exists characters jsonb;
alter table public.takes add column if not exists file_name text;

alter table public.takes drop constraint if exists takes_rating_check;
alter table public.takes add constraint takes_rating_check check (rating is null or rating between 1 and 5);
alter table public.takes drop constraint if exists takes_clip_type_check;
alter table public.takes add constraint takes_clip_type_check
  check (clip_type is null or clip_type in ('falso_rec', 'ensaio', 'wild', 'insert', 'som'));

-- Plano: observação para a montagem (vai para o relatório final da continuidade)
alter table public.shots add column if not exists edit_note text;
