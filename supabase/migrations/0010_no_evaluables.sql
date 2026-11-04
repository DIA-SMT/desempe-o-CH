-- Quién no se evalúa (criterio de Capital Humano, 04/11/2026). Se evalúa al personal de planta y
-- contratado con legajo de 5 dígitos, salvo:
--   - los funcionarios (secretarios, subsecretarios, directores, subdirectores, coordinadores y otros
--     cargos), según la nómina que pasa Capital Humano;
--   - el personal de convenio 5, cuando se cargue la lista.
-- Se cargan con scripts/importar-no-evaluables.mjs. De la nómina sale también el titular de cada unidad.

create table no_evaluables (
  legajo        text primary key,
  nombre        text not null default '',
  motivo        text not null check (motivo in ('funcionario', 'convenio')),
  funcion       text,  -- de la nómina: DIRECTOR, SECRETARIO, SUBSECRETARIO, COORDINADOR…
  reparticion   text,  -- como la escribe la nómina
  unidad_codigo text,  -- la unidad de CapitalIA que le corresponde (cruce por nombre)
  cargado_en    timestamptz not null default now()
);
alter table no_evaluables enable row level security;
create policy no_evaluables_ch on no_evaluables for select to authenticated using (es_ch());

-- Por qué no se evalúa a una persona: 'legajo' (no tiene 5 dígitos), 'funcionario' o 'convenio'.
-- Null: se evalúa.
create function motivo_no_evaluable(p_legajo text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_legajo, '') !~ '^[0-9]{5}$' then 'legajo'
    else (select n.motivo from no_evaluables n where n.legajo = p_legajo)
  end
$$;
revoke execute on function motivo_no_evaluable(text) from public, anon;
grant execute on function motivo_no_evaluable(text) to authenticated;

-- La foto del padrón deja afuera a quien no se evalúa (y saca a quien quedó de una foto anterior,
-- si todavía no tiene una evaluación cargada).
create or replace function preparar_padron(p_periodo bigint) returns table (agentes int, sin_evaluador int)
language plpgsql security definer set search_path = public as $$
begin
  if not es_ch() then
    raise exception 'Solo Capital Humano puede preparar el padrón';
  end if;

  delete from padron_periodo pp
  where pp.periodo_id = p_periodo
    and motivo_no_evaluable(pp.legajo) is not null
    and not exists (select 1 from evaluaciones e where e.periodo_id = pp.periodo_id and e.legajo = pp.legajo);

  insert into padron_periodo (periodo_id, legajo, nombre, unidad_codigo, unidad_nombre, secretaria, evaluador_id)
  select p_periodo, a.legajo, a.nombre, a.unidad_codigo, coalesce(u.nombre, a.unidad_codigo), a.secretaria,
         evaluador_de(p_periodo, a.unidad_codigo, a.legajo)
  from agentes a left join unidades u on u.codigo = a.unidad_codigo
  where a.activo and motivo_no_evaluable(a.legajo) is null
  on conflict (periodo_id, legajo) do update
    set evaluador_id = excluded.evaluador_id
    where not padron_periodo.reasignado
      and not exists (
        select 1 from evaluaciones e
        where e.periodo_id = padron_periodo.periodo_id and e.legajo = padron_periodo.legajo
      );

  update periodos set padron_congelado_en = now() where id = p_periodo;

  return query
    select count(*)::int, count(*) filter (where pp.evaluador_id is null)::int
    from padron_periodo pp where pp.periodo_id = p_periodo;
end $$;

-- Un pedido para sumar a alguien que no se evalúa no se puede aprobar
create or replace function resolver_solicitud(p_id bigint, p_aprobar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s solicitudes;
begin
  if not es_ch() then
    raise exception 'Solo Capital Humano puede resolver solicitudes';
  end if;
  select * into s from solicitudes where id = p_id for update;
  if s.estado <> 'pendiente' then
    raise exception 'La solicitud ya fue resuelta';
  end if;
  if p_aprobar and motivo_no_evaluable(s.legajo) is not null then
    raise exception 'Esa persona no se evalúa (es funcionario, de convenio 5 o su legajo no tiene 5 dígitos)';
  end if;
  if p_aprobar then
    update padron_periodo set evaluador_id = s.solicitante_id, reasignado = true
    where periodo_id = s.periodo_id and legajo = s.legajo;
    if not found then
      insert into padron_periodo (periodo_id, legajo, nombre, unidad_codigo, unidad_nombre, secretaria, evaluador_id, reasignado)
      select s.periodo_id, a.legajo, a.nombre, a.unidad_codigo, coalesce(u.nombre, a.unidad_codigo), a.secretaria, s.solicitante_id, true
      from agentes a left join unidades u on u.codigo = a.unidad_codigo where a.legajo = s.legajo;
    end if;
    update evaluaciones set evaluador_id = s.solicitante_id
    where periodo_id = s.periodo_id and legajo = s.legajo and estado = 'borrador';
  end if;
  update solicitudes
    set estado = case when p_aprobar then 'aprobada'::estado_solicitud else 'rechazada'::estado_solicitud end,
        resuelta_por = mi_id(), resuelta_en = now()
  where id = p_id;
end $$;
