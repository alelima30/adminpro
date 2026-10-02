-- ============================================================================
-- 12 — CPF na solicitação de cadastro
--
-- Rodar UMA VEZ no SQL Editor do Supabase, como os demais arquivos numerados.
--
-- POR QUE: a mesma pessoa entra no sistema por dois caminhos — a
-- administração cadastra, e ela mesma se cadastra pelo link do app. Hoje o
-- sistema reconhece que são a mesma pessoa comparando o NOME. Isso resolve
-- "ALESSANDRA SOUZA" × "Alessandra Souza", mas não resolve
-- "Alessandra S. Souza" × "Alessandra Souza" — e aí nascem duas fichas da
-- mesma pessoa, cada uma com o seu histórico.
--
-- O CPF resolve: nome muda de grafia, CPF não.
--
-- O campo é OPCIONAL (quem não tiver CPF continua se cadastrando). Quando
-- vem preenchido, a tela de aprovação pergunta à administração se é a mesma
-- pessoa que já está no cadastro, em vez de criar um segundo registro.
--
-- SEGURANÇA: a conferência acontece na APROVAÇÃO, nunca na página pública.
-- A página de cadastro não tem (e não pode ter) acesso de leitura ao cadastro
-- de condôminos: se tivesse, qualquer pessoa poderia digitar CPFs até acertar
-- um e descobrir quem mora onde. Por isso o CPF só é GRAVADO lá, e só é
-- COMPARADO aqui dentro, por quem já está autenticado no condomínio.
-- ============================================================================

alter table public.solicitacoes
  add column if not exists cpf text;

-- IMPRESCINDIVEL: o Supabase mantem um cache do formato das tabelas (PostgREST).
-- Criar a coluna nao avisa esse cache, e enquanto ele nao recarrega o app leva
-- um erro que parece outra coisa inteiramente:
--
--     Could not find the 'cpf' column of 'solicitacoes' in the schema cache
--
-- A linha abaixo manda recarregar na hora. Sem ela, o cadastro publico fica
-- quebrado ate o cache expirar sozinho -- e quem estiver tentando se cadastrar
-- nesse meio tempo simplesmente nao consegue.
notify pgrst, 'reload schema';

-- Conferência: deve listar a coluna 'cpf'.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'solicitacoes'
 order by ordinal_position;
