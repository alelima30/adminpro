-- ===========================================================================
-- AdminPro · Reservas — seguranca e integridade
--
-- Rode este arquivo INTEIRO no Supabase → SQL Editor → New query → Run.
--
-- (1) Morador NAO pode mais mudar o STATUS da propria reserva.
--     Antes: a policy deixava o dono editar a linha e so conferia o condominio,
--     entao por chamada direta a API ele poderia passar de 'pendente' para
--     'confirmada', furando a aprovacao da administracao.
--     Agora: morador edita os dados da propria reserva, mas o status so muda
--     por admin/gestor/super. Ele ainda pode CANCELAR a propria reserva.
--
-- (2) O banco passa a impedir DUAS reservas no mesmo espaco/data com horarios
--     sobrepostos (protege contra duas pessoas salvando ao mesmo tempo).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) STATUS protegido
-- ---------------------------------------------------------------------------

-- Guarda o status anterior e so deixa mudar quem tem permissao.
create or replace function public.reservas_protege_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    -- admin do condominio ou super-admin: pode qualquer mudanca
    if is_super() or is_admin_cond() then
      return new;
    end if;
    -- morador dono: so pode CANCELAR a propria reserva
    if new.status = 'cancelada' then
      return new;
    end if;
    raise exception 'Somente a administracao pode alterar o status da reserva.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reservas_protege_status on public.reservas;
create trigger trg_reservas_protege_status
  before update on public.reservas
  for each row execute function public.reservas_protege_status();


-- ---------------------------------------------------------------------------
-- 2) Sem sobreposicao de horario (trava no banco)
-- ---------------------------------------------------------------------------

create extension if not exists btree_gist;

-- Converte data + horario ("07:00-08:00", "07:00–08:00" ou "07:00") em periodo.
-- Sem hora de fim: assume 1 hora. Fim <= inicio (22:00-01:00): vira a madrugada.
-- Horario invalido devolve NULL e a restricao simplesmente ignora a linha.
create or replace function public.reserva_periodo(p_data date, p_horario text)
returns tsrange
language plpgsql
immutable
as $$
declare
  h    text := replace(coalesce(p_horario, ''), '–', '-');
  t_i  time;
  t_f  time;
  ts_i timestamp;
  ts_f timestamp;
begin
  if p_data is null or btrim(h) = '' then
    return null;
  end if;

  t_i := btrim(split_part(h, '-', 1))::time;
  ts_i := p_data + t_i;

  if btrim(split_part(h, '-', 2)) = '' then
    ts_f := ts_i + interval '1 hour';
  else
    t_f := btrim(split_part(h, '-', 2))::time;
    ts_f := p_data + t_f;
    if ts_f <= ts_i then
      ts_f := ts_f + interval '1 day';   -- vira a madrugada
    end if;
  end if;

  return tsrange(ts_i, ts_f, '[)');
exception when others then
  return null;                            -- horario fora do padrao: nao trava
end;
$$;

-- ATENCAO: se ja existirem reservas sobrepostas, o comando abaixo falha.
-- Use a consulta do final do arquivo para encontrar e ajustar antes.
alter table public.reservas drop constraint if exists reservas_sem_sobreposicao;
alter table public.reservas
  add constraint reservas_sem_sobreposicao
  exclude using gist (
    condominio_id with =,
    espaco        with =,
    public.reserva_periodo(data, horario) with &&
  )
  where (status not in ('cancelada', 'concluida'));


-- ---------------------------------------------------------------------------
-- Conferencia: lista reservas sobrepostas que ja existem (rode ANTES se der erro)
-- ---------------------------------------------------------------------------
-- select a.id, a.espaco, a.data, a.horario, b.id, b.horario
-- from public.reservas a
-- join public.reservas b
--   on a.condominio_id = b.condominio_id
--  and a.espaco = b.espaco
--  and a.id < b.id
--  and a.status not in ('cancelada','concluida')
--  and b.status not in ('cancelada','concluida')
--  and public.reserva_periodo(a.data, a.horario) && public.reserva_periodo(b.data, b.horario)
-- order by a.data;
