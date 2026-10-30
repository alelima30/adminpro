-- ============================================================================
-- 92 — POR QUE O LEMBRETE DE 24h NAO CHEGOU? (só leitura, não altera nada)
--
-- Rode no SQL Editor do Supabase (projeto lusibpbafbkyygxrxvzr) e me mande o
-- resultado. É UMA consulta só, porque o SQL Editor mostra apenas o resultado
-- do ÚLTIMO comando.
--
-- SE DER ERRO dizendo que o schema "cron" ou "net" não existe, essa JÁ É a
-- resposta: o agendamento nunca foi criado neste projeto. Nesse caso rode o
-- supabase/06_corrige_cron_lembrete.sql e confira de novo.
--
-- Não há insert, update, delete nem alter.
-- ============================================================================

with conf as (

  -- 1) O agendamento existe e está ligado?
  select 1 as ord, '1. agendamento do lembrete' as item,
         coalesce((
           select string_agg(jobname || ' · ' || schedule ||
                             ' · ' || case when active then 'LIGADO' else 'DESLIGADO' end, ' | ')
             from cron.job
            where command like '%functions/v1/lembrete%'
         ), 'NAO EXISTE — rode o 06_corrige_cron_lembrete.sql') as resultado

  union all
  -- 2) Para qual endereço ele chama? Tem de terminar em /lembrete (singular).
  select 2, '2. endereco chamado',
         coalesce((
           select substring(command from 'https://[^'']+')
             from cron.job where command like '%functions/v1/lembrete%' limit 1
         ), '(sem agendamento)')

  union all
  -- 3) As últimas execuções do agendamento deram certo?
  select 3, '3. ultimas execucoes do cron',
         coalesce((
           select string_agg(status || ' (' || to_char(start_time,'DD/MM HH24:MI') || ')', ', ')
             from (select status, start_time from cron.job_run_details
                    where jobid in (select jobid from cron.job where command like '%functions/v1/lembrete%')
                    order by start_time desc limit 5) x
         ), 'nenhuma execucao registrada')

  union all
  -- 4) O que a função RESPONDEU. 200 = rodou. 404 = nome errado.
  --    401/403 = chave recusada. Vazio = a chamada nem saiu.
  select 4, '4. resposta da funcao',
         coalesce((
           select string_agg(status_code::text || ' em ' || to_char(created,'DD/MM HH24:MI'), ', ')
             from (select status_code, created from net._http_response
                    order by created desc limit 5) y
         ), 'nenhuma resposta — a chamada nao saiu')

  union all
  -- 5) O conteúdo da resposta mais recente: diz quantos lembretes saíram e,
  --    agora, QUAIS falharam e por quê.
  select 5, '5. conteudo da ultima resposta',
         coalesce((
           select left(content, 400) from net._http_response
            where content is not null order by created desc limit 1
         ), '(nada)')

  union all
  -- 6) O aviso de 24h está LIGADO na configuração do condomínio?
  --    É isto que a função lê. Desligado aqui, ela não manda nada.
  select 6, '6. aviso de 24h ligado?',
         coalesce((
           select 'notif_lembrete_24h=' || coalesce(valor->>'notif_lembrete_24h','(ausente)') ||
                  ' · notif_lembrete_ativo=' || coalesce(valor->>'notif_lembrete_ativo','(ausente)') ||
                  ' · notif_lembrete_1h=' || coalesce(valor->>'notif_lembrete_1h','(ausente)')
             from public.modulo_dados
            where condominio_id='APVC' and modulo='cfg_reservas'
         ), 'SEM configuracao de reservas gravada')

  union all
  -- 7) Há reserva confirmada nas próximas 48h, e ela tem telefone?
  --    Sem telefone e sem e-mail, a função pula a reserva.
  select 7, '7. reservas confirmadas ate 48h',
         coalesce((
           select string_agg(to_char(data,'DD/MM') || ' ' || coalesce(horario,'?') ||
                             ' · ' || coalesce(espaco,'?') ||
                             ' · tel ' || case when coalesce(tel,'')='' then 'FALTANDO' else 'ok' end, ' | ')
             from public.reservas
            where condominio_id='APVC' and status='confirmada'
              and data >= (now() at time zone 'America/Sao_Paulo')::date
              and data <= ((now() at time zone 'America/Sao_Paulo')::date + 2)
         ), 'nenhuma reserva confirmada nas proximas 48h')

  union all
  -- 8) Chaves já marcadas como enviadas nas últimas 48h.
  select 8, '8. lembretes marcados como enviados (48h)',
         coalesce((
           select count(*)::text || ' chave(s): ' ||
                  coalesce(string_agg(chave, ', '), '')
             from public.lembretes_enviados
            where criado_em > now() - interval '48 hours'
         ), '0')
)
select item, resultado from conf order by ord;
