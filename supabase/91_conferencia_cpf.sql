-- ============================================================================
-- 91 — JÁ RODEI O SQL DO CPF? (só leitura, não altera nada)
--
-- Rode no SQL Editor do Supabase e me mande o resultado (ou só me diga o que
-- apareceu na coluna "resultado").
--
-- ANTES DE RODAR: confirme no canto de cima da tela que o projeto selecionado
-- é o do AdminPro — lusibpbafbkyygxrxvzr. Foi aí que a conferência anterior
-- mostrou "NAO" para a coluna cpf: o SQL tinha rodado, mas em outro projeto.
--
-- É UMA consulta só, de propósito: o SQL Editor mostra apenas o resultado do
-- ÚLTIMO comando quando se roda vários de uma vez.
--
-- Não há insert, update, delete nem alter. Pode rodar com gente usando o
-- sistema, quantas vezes quiser.
-- ============================================================================

with conf as (

  -- 1) O que importa: a coluna existe?
  select 1 as ord,
         '1. coluna cpf em solicitacoes' as item,
         case when exists (
           select 1 from information_schema.columns
            where table_schema='public'
              and table_name='solicitacoes'
              and column_name='cpf'
         ) then 'SIM — o SQL ja rodou neste projeto'
           else 'NAO — o SQL ainda nao rodou AQUI (rode o 12_cpf_solicitacoes.sql)'
         end as resultado

  union all
  -- 2) Confirma que a tabela conferida é mesmo a certa. Se vier "nao existe",
  --    o projeto selecionado não é o do AdminPro.
  select 2, '2. tabela solicitacoes',
         case when exists (
           select 1 from information_schema.tables
            where table_schema='public' and table_name='solicitacoes'
         ) then 'existe' else 'NAO existe — projeto errado selecionado' end

  union all
  -- 3) Tipo da coluna. Tem de ser text e aceitar vazio (o CPF é opcional).
  select 3, '3. tipo da coluna cpf',
         coalesce((
           select data_type || ', aceita vazio: ' || is_nullable
             from information_schema.columns
            where table_schema='public'
              and table_name='solicitacoes'
              and column_name='cpf'
         ), '(a coluna nao existe)')

  union all
  -- 4) Já chegou cadastro com CPF preenchido? Prova de que a tela está
  --    gravando de verdade, não só de que a coluna existe.
  --
  --    Lê o CPF por to_jsonb(s.*)->>'cpf', e não por s.cpf, de propósito: o
  --    Postgres analisa a consulta TODA antes de executar, então escrever
  --    s.cpf derrubaria esta conferência com "column cpf does not exist"
  --    justamente no caso que ela existe para detectar. Por jsonb, a coluna
  --    ausente simplesmente volta vazia.
  select 4, '4. cadastros com cpf preenchido',
         (select count(*) filter (where coalesce(to_jsonb(s.*)->>'cpf','') <> '')::text
                 || ' de ' || count(*)::text || ' cadastro(s)'
            from public.solicitacoes s)
)
select item, resultado from conf order by ord;
