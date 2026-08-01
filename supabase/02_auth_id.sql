-- Vincula cada solicitacao a conta de acesso criada no cadastro (Supabase Auth).
-- Rode uma vez no SQL Editor.
alter table public.solicitacoes add column if not exists auth_id uuid;
