-- Resumen de resultados de cada período (incluidos los históricos) para el tablero de
-- Capital Humano: se calcula en la base para no traer miles de evaluaciones por página.
-- Solo lo usa el servidor con la clave de servicio.

create function resumen_periodos(p_secretaria text default null)
returns table (
  periodo_id bigint, nombre text, cierre date, historico boolean,
  evaluadas int, promedio numeric, basico int, intermedio int, avanzado int, experto int, lider int,
  todo_igual int  -- evaluaciones con el mismo puntaje en todas las competencias
)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.cierre, p.historico,
         count(*)::int, round(avg(e.total), 1),
         count(*) filter (where e.total < 40)::int,
         count(*) filter (where e.total between 40 and 59)::int,
         count(*) filter (where e.total between 60 and 79)::int,
         count(*) filter (where e.total between 80 and 99)::int,
         count(*) filter (where e.total >= 100)::int,
         count(*) filter (where (select count(distinct x) from unnest(e.puntajes) x) = 1)::int
  from periodos p
  join evaluaciones e on e.periodo_id = p.id and e.estado = 'enviada'
  join padron_periodo pp on pp.periodo_id = e.periodo_id and pp.legajo = e.legajo
  where p_secretaria is null or pp.secretaria = p_secretaria
  group by p.id
  order by p.cierre
$$;

revoke execute on function resumen_periodos(text) from public, anon, authenticated;
grant execute on function resumen_periodos(text) to service_role;
