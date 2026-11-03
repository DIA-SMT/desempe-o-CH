-- Evaluaciones de años anteriores (Google Forms de Capital Humano), importadas con
-- scripts/importar-historico.mjs como períodos históricos cerrados.
-- El formulario anterior no pedía agrupamiento y el evaluador no es un usuario del sistema:
-- se guarda tal como lo escribió en el formulario.

alter table evaluaciones
  add column evaluador_legajo text,   -- solo en históricas: legajo del evaluador según el formulario
  add column evaluador_nombre text,   -- solo en históricas
  add column funcion          text;   -- solo en históricas: "función que cumple", texto libre

-- enviada_en pasa a ser la fecha del primer envío (las correcciones no la cambian),
-- para poder seguir el ritmo de carga. En las históricas se respeta la fecha del formulario.
create or replace function validar_evaluacion() returns trigger
language plpgsql set search_path = public as $$
declare
  v_estado estado_periodo;
  v_historico boolean;
  v_n int;
begin
  select estado, historico into v_estado, v_historico from periodos where id = new.periodo_id;
  if not v_historico and v_estado <> 'abierto' then
    raise exception 'El período no está abierto para cargar evaluaciones';
  end if;

  select count(*) into v_n from competencias where periodo_id = new.periodo_id;
  if coalesce(array_length(new.puntajes, 1), 0) <> v_n then
    raise exception 'Se esperaban % puntajes y llegaron %', v_n, coalesce(array_length(new.puntajes, 1), 0);
  end if;
  if exists (select 1 from unnest(new.puntajes) p where p is not null and (p < 1 or p > 10)) then
    raise exception 'Cada competencia se puntúa del 1 al 10';
  end if;

  if tg_op = 'UPDATE' then
    if old.estado = 'enviada' and new.estado = 'borrador' then
      raise exception 'Una evaluación enviada no puede volver a borrador';
    end if;
    if new.legajo <> old.legajo or new.periodo_id <> old.periodo_id then
      raise exception 'No se puede cambiar el agente ni el período de una evaluación';
    end if;
  end if;

  if new.estado = 'enviada' then
    if exists (select 1 from unnest(new.puntajes) p where p is null) then
      raise exception 'Faltan competencias por puntuar';
    end if;
    if new.agrupamiento is null and not v_historico then
      raise exception 'Falta indicar el agrupamiento del agente';
    end if;
    if tg_op = 'UPDATE' and old.estado = 'enviada' then
      new.enviada_en := old.enviada_en;
    elsif not v_historico or new.enviada_en is null then
      new.enviada_en := now();
    end if;
  end if;

  new.total := (select coalesce(sum(p), 0) from unnest(new.puntajes) p);
  new.actualizada_en := now();
  return new;
end $$;
