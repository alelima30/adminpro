-- ===========================================================================
-- AdminPro · Morador NAO edita reserva ja criada
--
-- Rode este arquivo INTEIRO no Supabase -> SQL Editor -> New query -> Run.
--
-- O QUE MUDA
--   Morador  : cria reserva e pode CANCELAR a propria. Nao altera mais nada
--              (data, horario, espaco, unidade, status...) — nem pela API.
--   Admin    : continua livre (admin do condominio, gestor e super-admin).
--
-- POR QUE
--   Antes o morador podia, por chamada direta a API, mudar o horario de uma
--   reserva JA APROVADA mantendo o status "confirmada" — a administracao
--   aprovava um horario e acabava com outro, sem saber.
--
-- Este arquivo SUBSTITUI o gatilho criado em 05_reservas_seguranca.sql
-- (aquele so protegia o status). Pode rodar mesmo que o 05 nao tenha rodado.
-- ===========================================================================

create or replace function public.reservas_protege_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Administracao: sem restricao
  if is_super() or is_admin_cond() then
    return new;
  end if;

  -- Morador dono da reserva: unica alteracao permitida e CANCELAR.
  -- (status vai para 'cancelada' e nenhum outro campo muda)
  if new.status = 'cancelada'
     and old.status is distinct from 'cancelada'
     and new.espaco   is not distinct from old.espaco
     and new.data     is not distinct from old.data
     and new.horario  is not distinct from old.horario
     and new.unidade  is not distinct from old.unidade
  then
    return new;
  end if;

  raise exception 'Alteracoes nesta reserva sao feitas pela administracao. Voce pode cancelar e criar uma nova.';
end;
$$;

drop trigger if exists trg_reservas_protege_status on public.reservas;
create trigger trg_reservas_protege_status
  before update on public.reservas
  for each row execute function public.reservas_protege_status();


-- ---------------------------------------------------------------------------
-- CONFERENCIA
-- ---------------------------------------------------------------------------
-- O gatilho esta instalado?
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.reservas'::regclass
  and not tgisinternal;
