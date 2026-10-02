-- ============================================================================
-- 90 — CONFERÊNCIA (só leitura, não altera nada)
--
-- Rode no SQL Editor do Supabase e me mande o resultado. São 6 perguntas; a
-- resposta de cada uma vem com um rótulo, então dá para ler sem decorar nada.
--
-- Não há nenhum insert, update, delete ou alter aqui. Pode rodar quantas
-- vezes quiser, inclusive com gente usando o sistema.
-- ============================================================================

-- 1) A coluna 'cpf' existe em solicitacoes?
--    É a causa provável do erro no cadastro público.
select '1. coluna cpf em solicitacoes' as pergunta,
       case when exists (
         select 1 from information_schema.columns
          where table_schema='public' and table_name='solicitacoes' and column_name='cpf'
       ) then 'SIM — existe' else 'NAO — precisa rodar o 12_cpf_solicitacoes.sql' end as resposta;

-- 2) Quais módulos estão liberados para o Village Castelo?
--    Só aparece aqui o que foi DESLIGADO (modulos->>chave = 'false').
--    Se vier vazio, está tudo ligado.
select '2. modulos DESLIGADOS no APVC' as pergunta,
       coalesce(string_agg(m.chave, ', ' order by m.chave), '(nenhum — tudo ligado)') as resposta
  from public.condominios c
  left join lateral jsonb_each_text(coalesce(c.modulos,'{}'::jsonb)) as m(chave, valor) on true
 where c.codigo = 'APVC' and m.valor = 'false';

-- 3) A Central de Acompanhamento já tem assuntos?
--    Se vier 0, o 11_acompanhamento_apvc.sql pode ser rodado sem perder nada.
select '3. assuntos na Central' as pergunta,
       coalesce((
         select jsonb_array_length(valor->'itens')::text
           from public.modulo_dados
          where condominio_id='APVC' and modulo='acompanhamento'
       ), '0 — pode rodar o 11 sem perder nada') as resposta;

-- 4) Reservas por situação (o que a Portaria mostra são as aprovadas).
select '4. reservas: ' || coalesce(status,'(sem status)') as pergunta,
       count(*)::text || ' reserva(s)' as resposta
  from public.reservas
 where condominio_id = 'APVC'
 group by status
 order by 2 desc;

-- 5) Quem tem acesso, e em que nível.
select '5. usuarios: ' || coalesce(nivel,'(sem nivel)') || ' / ' || coalesce(status,'(sem status)') as pergunta,
       count(*)::text || ' pessoa(s)' as resposta
  from public.usuarios
 where condominio_id = 'APVC'
 group by nivel, status
 order by 1;

-- 6) Telas extras por usuário (diretores na Central, portaria no Painel).
--    Guardadas no módulo 'supervisores', uma chave por e-mail.
select '6. telas extras' as pergunta,
       coalesce((
         select string_agg(pessoa || ' -> ' || telas, ' | ')
           from (
             select u.key as pessoa,
                    coalesce((
                      select string_agg(t.key, ', ' order by t.key)
                        from jsonb_each_text(coalesce(u.value->'modulos','{}'::jsonb)) as t(key, val)
                       where t.val = 'true'
                    ), '(nenhuma marcada)') as telas
               from public.modulo_dados md,
                    jsonb_each(coalesce(md.valor,'{}'::jsonb)) as u(key, value)
              where md.condominio_id='APVC' and md.modulo='supervisores'
           ) x
       ), '(ninguem com tela extra)') as resposta;
