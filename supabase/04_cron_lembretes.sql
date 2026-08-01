-- ============================================================
-- CRON de LEMBRETES de reserva (roda sozinho, sem o app aberto)
-- Rode uma vez no SQL Editor do Supabase.
-- ============================================================

-- 1) Tabela para não repetir o mesmo lembrete
create table if not exists public.lembretes_enviados (
  chave text primary key,
  criado_em timestamptz not null default now()
);
alter table public.lembretes_enviados enable row level security;
-- (sem policy: só o service_role/Edge Function acessa; ninguém pelo app)

-- 2) Extensões necessárias para agendar e chamar HTTP
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3) Agenda: chama a Edge Function "lembretes" a cada 15 minutos
--    >>> TROQUE os dois valores abaixo:
--        SEU_PROJETO      -> o ref do projeto (ex: lusibpbafbkyygxrxvzr)
--        SUA_SERVICE_KEY  -> a Service Role Key (Project Settings > API)
select cron.schedule(
  'lembretes-reservas',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://SEU_PROJETO.supabase.co/functions/v1/lembretes',
    headers := jsonb_build_object(
                 'Content-Type','application/json',
                 'Authorization','Bearer SUA_SERVICE_KEY'
               ),
    body    := '{}'::jsonb
  );
  $$
);

-- Para ver os agendamentos:   select * from cron.job;
-- Para remover este cron:     select cron.unschedule('lembretes-reservas');
-- Limpeza opcional (chaves antigas):
--   delete from public.lembretes_enviados where criado_em < now() - interval '60 days';
