-- Semestres anteriores de las personas que cada director tiene a cargo en un período.
-- Las evaluaciones históricas no tienen evaluador usuario, así que el director no las ve por RLS:
-- las lee con estas funciones, que solo devuelven lo de su propio equipo.

-- Puntaje anterior de cada persona. Aparece recién cuando el director envió la evaluación de
-- este período, para que no condicione la nueva.
create function historial_equipo(p_periodo bigint)
returns table (legajo text, periodo_id bigint, periodo text, cierre date, total smallint)
language sql stable security definer set search_path = public as $$
  select pp.legajo, p.id, p.nombre, p.cierre, e.total
  from padron_periodo pp
  join evaluaciones actual on actual.periodo_id = pp.periodo_id and actual.legajo = pp.legajo
    and actual.estado = 'enviada' and actual.evaluador_id = mi_id()
  join evaluaciones e on e.legajo = pp.legajo and e.periodo_id <> pp.periodo_id and e.estado = 'enviada'
  join periodos p on p.id = e.periodo_id and (p.historico or p.estado = 'cerrado')
  where pp.periodo_id = p_periodo and pp.evaluador_id = mi_id()
  order by pp.legajo, p.cierre
$$;

-- Promedio de cada semestre anterior de las personas que hoy tiene a cargo.
-- Con menos de 3 evaluadas el promedio sería, en la práctica, el puntaje de alguien: no se devuelve.
create function resumen_equipo(p_periodo bigint)
returns table (periodo_id bigint, periodo text, cierre date, evaluadas int, promedio numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.cierre, count(*)::int,
         case when count(*) >= 3 then round(avg(e.total), 1) end
  from padron_periodo pp
  join evaluaciones e on e.legajo = pp.legajo and e.periodo_id <> pp.periodo_id and e.estado = 'enviada'
  join periodos p on p.id = e.periodo_id and (p.historico or p.estado = 'cerrado')
  where pp.periodo_id = p_periodo and pp.evaluador_id = mi_id()
  group by p.id
  order by p.cierre
$$;

revoke execute on function historial_equipo(bigint) from public, anon;
revoke execute on function resumen_equipo(bigint) from public, anon;
grant execute on function historial_equipo(bigint) to authenticated;
grant execute on function resumen_equipo(bigint) to authenticated;
