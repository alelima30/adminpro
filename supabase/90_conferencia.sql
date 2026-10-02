-- ============================================================================
-- 90 — CONFERÊNCIA (só leitura, não altera nada)
--
-- Rode no SQL Editor do Supabase e me mande o resultado.
--
-- É UMA consulta só, de propósito: o SQL Editor do Supabase mostra apenas o
-- resultado do ÚLTIMO comando quando se roda vários de uma vez — e a
-- conferência inteira some, menos a última linha. Aqui tudo vem numa tabela.
--
-- Não há nenhum insert, update, delete ou alter. Pode rodar quantas vezes
-- quiser, inclusive com gente usando o sistema.
-- ============================================================================

with conferencia as (

  -- 1) A coluna 'cpf' existe em solicitacoes?
  --    É a causa provável do erro no cadastro público.
  select 1 as ord,
         '1. coluna cpf em solicitacoes' as item,
         case when exists (
           select 1 from information_schema.columns
            where table_schema='public' and table_name='solicitacoes' and column_name='cpf'
         ) then 'SIM — existe'
           else 'NAO — rode o 12_cpf_solicitacoes.sql' end as resultado

  union all
  -- 2) Módulos DESLIGADOS no Village Castelo. Vazio = tudo ligado.
  select 2, '2. modulos DESLIGADOS no APVC',
         coalesce((
           select string_agg(m.chave, ', ' order by m.chave)
             from public.condominios c,
                  jsonb_each_text(coalesce(c.modulos,'{}'::jsonb)) as m(chave, valor)
            where c.codigo='APVC' and m.valor='false'
         ), '(nenhum — tudo ligado)')

  union all
  -- 3) A Central de Acompanhamento já tem assuntos?
  --    0 = o 11_acompanhamento_apvc.sql pode ser rodado sem perder nada.
  select 3, '3. assuntos na Central',
         coalesce((
           select jsonb_array_length(valor->'itens')::text || ' assunto(s) — NAO rode o 11'
             from public.modulo_dados
            where condominio_id='APVC' and modulo='acompanhamento'
         ), 'vazia — pode rodar o 11 sem perder nada')

  union all
  -- 4) Reservas por situação. A Portaria mostra as aprovadas.
  select 4, '4. reservas ' || coalesce(status,'(sem situacao)'),
         count(*)::text || ' reserva(s)'
    from public.reservas
   where condominio_id='APVC'
   group by status

  union all
  -- 5) Quem tem acesso, e em que nível.
  select 5, '5. usuarios ' || coalesce(nivel,'(sem nivel)') || ' / ' || coalesce(status,'(sem status)'),
         count(*)::text || ' pessoa(s)'
    from public.usuarios
   where condominio_id='APVC'
   group by nivel, status

  union all
  -- 6) Telas extras por usuário (diretores na Central, portaria no Painel).
  select 6, '6. tela extra de ' || pessoa, telas
    from (
      select u.key as pessoa,
             coalesce((
               select string_agg(t.key, ', ' order by t.key)
                 from jsonb_each_text(coalesce(u.value->'modulos','{}'::jsonb)) as t(key, val)
                where t.val='true'
             ), '(nenhuma marcada)') as telas
        from public.modulo_dados md,
             jsonb_each(coalesce(md.valor,'{}'::jsonb)) as u(key, value)
       where md.condominio_id='APVC' and md.modulo='supervisores'
    ) x

  union all
  -- 7) Solicitações de cadastro ainda esperando aprovação.
  select 7, '7. cadastros pendentes',
         coalesce((
           select count(*)::text || ' aguardando aprovacao'
             from public.solicitacoes
            where condominio_id='APVC' and status='pendente'
         ), '0')
)
select item, resultado
  from conferencia
 order by ord, item;
