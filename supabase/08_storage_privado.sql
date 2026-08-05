-- ===========================================================================
-- AdminPro · Cria o bucket "privado" e as regras de acesso a ele
--
-- PROBLEMA: o app envia informativos (PDF), fotos de condominos e
-- comprovantes para o bucket "privado" desde sempre, mas esse bucket
-- nunca foi criado por SQL — so existia uma instrucao em comentario no
-- schema.sql pedindo para criar na mao pelo Dashboard (Storage -> New
-- bucket). Se esse passo manual nunca foi feito, ou foi feito sem
-- policy nenhuma, TODO envio para o bucket falha: o Storage do Supabase
-- vem com RLS ligado por padrao e SEM NENHUMA policy — ou seja, tudo é
-- negado ate que uma regra libere.
--
-- Rode este arquivo inteiro no SQL Editor. Pode rodar mesmo que o bucket
-- ja exista (nao duplica) e mesmo que já tenha tentado criar policies
-- antes (substitui as antigas).
--
-- CONVENCAO DE CAMINHO usada pelo app dentro do bucket:
--   <condominio_id>/<pasta>/<arquivo>
--   Ex.: APVC/informativos/ed_30.pdf
-- A policy usa o primeiro pedaco do caminho para saber de qual
-- condominio é o arquivo — mesma logica de isolamento por condominio
-- que ja protege as tabelas do banco.
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('privado', 'privado', false)
on conflict (id) do nothing;

-- Leitura: qualquer usuario do MESMO condominio pode ver (moradores
-- precisam ler os informativos, nao so o admin).
drop policy if exists privado_select on storage.objects;
create policy privado_select on storage.objects for select
  using (
    bucket_id = 'privado'
    and (is_super() or (storage.foldername(name))[1] = auth_condominio())
  );

-- Envio: só admin/gestor do mesmo condominio.
drop policy if exists privado_insert on storage.objects;
create policy privado_insert on storage.objects for insert
  with check (
    bucket_id = 'privado'
    and (is_super() or (is_admin_cond() and (storage.foldername(name))[1] = auth_condominio()))
  );

-- Substituir (upload com upsert:true conta como update do objeto já existente).
drop policy if exists privado_update on storage.objects;
create policy privado_update on storage.objects for update
  using (
    bucket_id = 'privado'
    and (is_super() or (is_admin_cond() and (storage.foldername(name))[1] = auth_condominio()))
  )
  with check (
    bucket_id = 'privado'
    and (is_super() or (is_admin_cond() and (storage.foldername(name))[1] = auth_condominio()))
  );

-- Excluir: só admin/gestor do mesmo condominio.
drop policy if exists privado_delete on storage.objects;
create policy privado_delete on storage.objects for delete
  using (
    bucket_id = 'privado'
    and (is_super() or (is_admin_cond() and (storage.foldername(name))[1] = auth_condominio()))
  );

-- ---------------------------------------------------------------------------
-- CONFERENCIA
-- ---------------------------------------------------------------------------

-- 1) O bucket existe?
select id, name, public from storage.buckets where id = 'privado';

-- 2) As 4 regras foram criadas?
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'privado_%'
order by policyname;
