-- Protege o ADMIN MASTER da plataforma (super_admin = true):
-- admins de condominio nao conseguem ve-lo nem altera-lo/exclui-lo.
-- Rode uma vez no SQL Editor do Supabase.

drop policy if exists usr_self on public.usuarios;
create policy usr_self on public.usuarios for select
  using (
    id = auth.uid()
    or is_super()
    or (is_admin_cond() and condominio_id = auth_condominio() and super_admin = false)
  );

drop policy if exists usr_admin on public.usuarios;
create policy usr_admin on public.usuarios for all
  using (
    is_super()
    or (is_admin_cond() and condominio_id = auth_condominio() and super_admin = false)
  )
  with check (
    is_super()
    or (is_admin_cond() and condominio_id = auth_condominio() and super_admin = false)
  );
