-- Avance del área: quien tiene unidades asignadas ve cómo van las evaluaciones de toda la gente
-- de esas unidades y de las que dependen de ellas, cuando la evalúa otra persona (directores de su
-- secretaría, el director de despacho, pases aprobados). Así un secretario que no evalúa a nadie
-- igual sigue el avance de su secretaría.
-- Solo el estado de cada evaluación (enviada, borrador o pendiente): nunca puntajes. Los puntajes
-- individuales siguen siendo de quien evalúa y de Capital Humano.
create function avance_area(p_periodo bigint)
returns table (legajo text, nombre text, unidad_nombre text, evaluador_id uuid, evaluador text, estado text)
language sql stable security definer set search_path = public as $$
  with recursive area (codigo, nivel) as (
    select a.unidad_codigo, 0 from asignaciones a
    where a.periodo_id = p_periodo and a.evaluador_id = mi_id()
    union
    select u.codigo, area.nivel + 1 from unidades u join area on u.depende_de = area.codigo
    where area.nivel < 10
  )
  select pp.legajo, pp.nombre, pp.unidad_nombre, pp.evaluador_id, ev.nombre,
         coalesce(e.estado::text, 'pendiente')
  from padron_periodo pp
  left join usuarios ev on ev.id = pp.evaluador_id
  left join evaluaciones e on e.periodo_id = pp.periodo_id and e.legajo = pp.legajo
  where pp.periodo_id = p_periodo
    and pp.unidad_codigo in (select codigo from area)
    and pp.evaluador_id is distinct from mi_id()
    and pp.legajo <> coalesce((mi_usuario()).legajo, '')  -- un titular de planta no ve su propia evaluación
  order by ev.nombre nulls last, pp.nombre, pp.legajo
$$;

revoke execute on function avance_area(bigint) from public, anon;
grant execute on function avance_area(bigint) to authenticated;
