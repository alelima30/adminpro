-- ===========================================================================
-- AdminPro · CORRIGE o agendamento dos lembretes
--
-- PROBLEMA: o agendamento antigo chamava  /functions/v1/lembretes  (plural),
-- mas a funcao publicada se chama        /functions/v1/lembrete   (singular).
-- Resultado: a chamada caia em "nao encontrado" e NENHUM lembrete era enviado
-- pelo servidor.
--
-- COMO USAR
--   1) Rode este arquivo inteiro no SQL Editor. Nao precisa editar nada:
--      a chave publicavel abaixo e a mesma que ja esta no site
--      (adminpro.html), e ela NAO e segredo.
--   2) Confira com as consultas do final.
--
-- OBS: este arquivo tambem existe como migration, aplicada sozinha pelo
-- GitHub Actions (supabase/migrations/). Rodar aqui na mao nao atrapalha:
-- cron.schedule com o mesmo nome substitui o agendamento anterior.
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamentos antigos (qualquer nome que tenhamos usado antes)
do $$
declare j record;
begin
  for j in
    select jobname from cron.job
    where jobname in ('lembretes-reservas', 'lembrete-reservas', 'adminpro-lembretes')
  loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

-- Agendamento correto: a cada 15 minutos, chamando /lembrete (singular)
select cron.schedule(
  'lembretes-reservas',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://lusibpbafbkyygxrxvzr.supabase.co/functions/v1/lembrete',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer sb_publishable_w0CUYP7hq4okx5cdyL_zZw_JponH6bU'
               ),
    body    := '{}'::jsonb
  );
  $$
);


-- ---------------------------------------------------------------------------
-- CONFERENCIA
-- ---------------------------------------------------------------------------

-- 1) O agendamento existe e esta ativo?
select jobid, jobname, schedule, active from cron.job;

-- 2) As ultimas execucoes deram certo? (rode alguns minutos depois)
-- select runid, jobid, status, return_message, start_time
-- from cron.job_run_details
-- order by start_time desc
-- limit 10;

-- 3) O que a funcao respondeu? (status 200 = ok; 404 = nome errado de novo)
-- select id, status_code, content, created
-- from net._http_response
-- order by created desc
-- limit 10;
