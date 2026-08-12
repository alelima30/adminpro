-- ===========================================================================
-- Corrige o agendamento dos lembretes.
--
-- O agendamento antigo chamava  /functions/v1/lembretes  (plural), mas a
-- funcao publicada se chama     /functions/v1/lembrete   (singular).
-- A chamada caia em "nao encontrado" e nenhum lembrete era enviado.
--
-- Versao migration do arquivo supabase/06_corrige_cron_lembrete.sql.
-- Pode rodar mesmo que o 06 ja tenha sido aplicado na mao: cron.schedule
-- com o mesmo nome substitui o agendamento anterior.
--
-- A chave usada abaixo e a publicavel (sb_publishable_...), a mesma que ja
-- esta no site em adminpro.html. Nao e segredo.
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
  $cron$
  select net.http_post(
    url     := 'https://lusibpbafbkyygxrxvzr.supabase.co/functions/v1/lembrete',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer sb_publishable_w0CUYP7hq4okx5cdyL_zZw_JponH6bU'
               ),
    body    := '{}'::jsonb
  );
  $cron$
);
