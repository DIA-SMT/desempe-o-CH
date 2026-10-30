-- Pases manuales: cuando Capital Humano aprueba que un agente pase al equipo de otro
-- director, ese cambio no se pierde al "Actualizar foto del padrón".
-- La corrección definitiva de dónde presta servicios se hace en CapitalIA.

alter table padron_periodo add column reasignado boolean not null default false;

create or replace function preparar_padron(p_periodo bigint) returns table (agentes int, sin_evaluador int)
language plpgsql security definer set search_path = public as $$
begin
  if not es_ch() then
    raise exception 'Solo Capital Humano puede preparar el padrón';
  end if;

  insert into padron_periodo (periodo_id, legajo, nombre, unidad_codigo, unidad_nombre, secretaria, evaluador_id)
  select p_periodo, a.legajo, a.nombre, a.unidad_codigo, coalesce(u.nombre, a.unidad_codigo), a.secretaria,
         evaluador_de(p_periodo, a.unidad_codigo, a.legajo)
  from agentes a left join unidades u on u.codigo = a.unidad_codigo
  where a.activo
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
