-- Instalación completa en un solo paso (pegar en Supabase > SQL Editor > Run)
-- Generado a partir de supabase/migrations/. No editar a mano.

-- Evaluación de Desempeño - esquema inicial
-- Padrón y organigrama vienen de CapitalIA (solo lectura) y se sincronizan una vez por día.
-- Cada período congela una foto del padrón con el evaluador de cada agente.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type rol_usuario as enum ('evaluador', 'capital_humano', 'directora_ch', 'admin');
create type estado_periodo as enum ('preparacion', 'abierto', 'cerrado');
create type estado_evaluacion as enum ('borrador', 'enviada');
create type estado_solicitud as enum ('pendiente', 'aprobada', 'rechazada');

-- ---------------------------------------------------------------------------
-- Padrón sincronizado desde CapitalIA
-- ---------------------------------------------------------------------------
create table unidades (
  codigo          text primary key,
  nombre          text not null,
  tipo            text not null,              -- secretaria | subsecretaria | direccion | subdireccion
  id_grh          text,                       -- id en GRH; null en unidades creadas en CapitalIA
  depende_de      text,                       -- código de la unidad padre; null en secretarías
  activa          boolean not null default true,
  sincronizado_en timestamptz not null default now()
);

create table agentes (
  legajo          text primary key,
  nombre          text not null,
  activo          boolean not null default true,
  unidad_codigo   text not null,              -- dónde presta servicios (no dónde cobra)
  unidad_id_grh   text,
  secretaria      text,
  sincronizado_en timestamptz not null default now()
);
create index agentes_unidad_idx on agentes (unidad_codigo);

-- ---------------------------------------------------------------------------
-- Usuarios del sistema (solo directivos y Capital Humano)
-- ---------------------------------------------------------------------------
create table usuarios (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique check (email = lower(email)),
  nombre        text not null,
  legajo        text,
  rol           rol_usuario not null default 'evaluador',
  ve_respuestas boolean not null default false,  -- "encargados" de Capital Humano
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Períodos y competencias (las competencias quedan guardadas con cada período)
-- ---------------------------------------------------------------------------
create table periodos (
  id                   bigint generated always as identity primary key,
  nombre               text not null,
  inicio               date not null,
  cierre               date not null,
  estado               estado_periodo not null default 'preparacion',
  historico            boolean not null default false,  -- importado de años anteriores
  padron_congelado_en  timestamptz,
  creado_en            timestamptz not null default now(),
  check (cierre >= inicio)
);
create unique index un_solo_periodo_abierto on periodos ((true)) where estado = 'abierto';

create table competencias (
  id          bigint generated always as identity primary key,
  periodo_id  bigint not null references periodos (id) on delete cascade,
  orden       smallint not null,
  tipo        char(1) not null check (tipo in ('G', 'E')),   -- genérica / específica
  nombre      text not null,
  descripcion text not null,
  unique (periodo_id, orden)
);

-- Quién evalúa cada unidad en cada período
create table asignaciones (
  periodo_id    bigint not null references periodos (id) on delete cascade,
  unidad_codigo text not null,
  evaluador_id  uuid not null references usuarios (id),
  primary key (periodo_id, unidad_codigo)
);

-- Foto del padrón al abrir el período
create table padron_periodo (
  periodo_id    bigint not null references periodos (id) on delete cascade,
  legajo        text not null,
  nombre        text not null,
  unidad_codigo text not null,
  unidad_nombre text not null,
  secretaria    text,
  evaluador_id  uuid references usuarios (id),        -- null: falta asignar evaluador
  primary key (periodo_id, legajo)
);
create index padron_periodo_evaluador_idx on padron_periodo (periodo_id, evaluador_id);

-- ---------------------------------------------------------------------------
-- Evaluaciones
-- ---------------------------------------------------------------------------
create table evaluaciones (
  id             bigint generated always as identity primary key,
  periodo_id     bigint not null,
  legajo         text not null,
  evaluador_id   uuid references usuarios (id),        -- null en evaluaciones históricas importadas
  agrupamiento   text check (agrupamiento in ('FG', 'ADM', 'PRO', 'TEC', 'MYP', 'SG')),
  puntajes       smallint[] not null,                  -- uno por competencia, en orden; null = sin puntuar
  observaciones  text not null default '' check (char_length(observaciones) <= 600),
  estado         estado_evaluacion not null default 'borrador',
  total          smallint not null default 0,
  enviada_en     timestamptz,
  actualizada_en timestamptz not null default now(),
  unique (periodo_id, legajo),
  foreign key (periodo_id, legajo) references padron_periodo (periodo_id, legajo)
);
create index evaluaciones_evaluador_idx on evaluaciones (periodo_id, evaluador_id);

-- Pedidos de un director para sumar a alguien que no figura en su equipo
create table solicitudes (
  id             bigint generated always as identity primary key,
  periodo_id     bigint not null references periodos (id) on delete cascade,
  legajo         text not null,
  nombre         text not null default '',       -- copiado del padrón al pedir, para mostrarlo al director
  solicitante_id uuid not null references usuarios (id),
  motivo         text not null check (char_length(motivo) <= 200),
  estado         estado_solicitud not null default 'pendiente',
  resuelta_por   uuid references usuarios (id),
  resuelta_en    timestamptz,
  creada_en      timestamptz not null default now()
);

-- Registro de accesos y cambios sobre datos sensibles
create table auditoria (
  id         bigint generated always as identity primary key,
  usuario_id uuid references usuarios (id),
  accion     text not null,
  detalle    jsonb not null default '{}',
  creado_en  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Quién es el usuario actual (a partir del mail del JWT de Supabase Auth)
-- ---------------------------------------------------------------------------
create function mi_usuario() returns usuarios
language sql stable security definer set search_path = public as $$
  select u.* from usuarios u
  where u.email = lower(coalesce(auth.jwt() ->> 'email', '')) and u.activo
$$;

create function mi_id() returns uuid
language sql stable security definer set search_path = public as $$
  select (mi_usuario()).id
$$;

create function es_ch() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((mi_usuario()).rol in ('capital_humano', 'directora_ch', 'admin'), false)
$$;

create function puede_ver_respuestas() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (mi_usuario()).rol in ('directora_ch', 'admin')
    or ((mi_usuario()).rol = 'capital_humano' and (mi_usuario()).ve_respuestas),
    false)
$$;

-- ---------------------------------------------------------------------------
-- Validación de evaluaciones
-- ---------------------------------------------------------------------------
create function validar_evaluacion() returns trigger
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
    if new.agrupamiento is null then
      raise exception 'Falta indicar el agrupamiento del agente';
    end if;
    new.enviada_en := now();
  end if;

  new.total := (select coalesce(sum(p), 0) from unnest(new.puntajes) p);
  new.actualizada_en := now();
  return new;
end $$;

create trigger evaluaciones_validar
  before insert or update on evaluaciones
  for each row execute function validar_evaluacion();

-- ---------------------------------------------------------------------------
-- Quién evalúa a un agente: el evaluador asignado a su unidad; si no hay,
-- el de la unidad superior. Nadie se evalúa a sí mismo: el responsable de una
-- unidad queda a cargo del evaluador del nivel de arriba.
-- ---------------------------------------------------------------------------
create function evaluador_de(p_periodo bigint, p_unidad text, p_legajo text) returns uuid
language plpgsql stable set search_path = public as $$
declare
  v_unidad text := p_unidad;
  v_evaluador uuid;
  v_vueltas int := 0;
begin
  while v_unidad is not null and v_vueltas < 10 loop
    select a.evaluador_id into v_evaluador
    from asignaciones a join usuarios u on u.id = a.evaluador_id
    where a.periodo_id = p_periodo and a.unidad_codigo = v_unidad
      and u.activo and coalesce(u.legajo, '') <> p_legajo;
    if v_evaluador is not null then
      return v_evaluador;
    end if;
    select depende_de into v_unidad from unidades where codigo = v_unidad;
    v_vueltas := v_vueltas + 1;
  end loop;
  return null;
end $$;

-- Congela (o actualiza) la foto del padrón del período. Se puede volver a correr
-- mientras el período está abierto: suma agentes nuevos y recalcula el evaluador
-- de quienes todavía no tienen una evaluación cargada.
create function preparar_padron(p_periodo bigint) returns table (agentes int, sin_evaluador int)
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
    where not exists (
      select 1 from evaluaciones e
      where e.periodo_id = padron_periodo.periodo_id and e.legajo = padron_periodo.legajo
    );

  update periodos set padron_congelado_en = now() where id = p_periodo;

  return query
    select count(*)::int, count(*) filter (where pp.evaluador_id is null)::int
    from padron_periodo pp where pp.periodo_id = p_periodo;
end $$;

create function abrir_periodo(p_periodo bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_ch() then
    raise exception 'Solo Capital Humano puede abrir un período';
  end if;
  if (select count(*) from competencias where periodo_id = p_periodo) = 0 then
    raise exception 'El período no tiene competencias cargadas';
  end if;
  perform preparar_padron(p_periodo);
  update periodos set estado = 'abierto' where id = p_periodo;
end $$;

-- Para el pedido de "falta alguien de mi equipo": el director solo ve nombre y unidad
create function buscar_agente(p_legajo text)
returns table (legajo text, nombre text, unidad_nombre text, unidad_codigo text)
language sql stable security definer set search_path = public as $$
  select a.legajo, a.nombre, coalesce(u.nombre, a.unidad_codigo), a.unidad_codigo
  from agentes a left join unidades u on u.codigo = a.unidad_codigo
  where mi_id() is not null and a.legajo = p_legajo and a.activo
$$;

-- Aprueba un pedido: el agente pasa al equipo de quien lo pidió
create function resolver_solicitud(p_id bigint, p_aprobar boolean) returns void
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
    update padron_periodo set evaluador_id = s.solicitante_id
    where periodo_id = s.periodo_id and legajo = s.legajo;
    if not found then
      insert into padron_periodo (periodo_id, legajo, nombre, unidad_codigo, unidad_nombre, secretaria, evaluador_id)
      select s.periodo_id, a.legajo, a.nombre, a.unidad_codigo, coalesce(u.nombre, a.unidad_codigo), a.secretaria, s.solicitante_id
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

-- Seguridad por fila (RLS)
--  * Evaluador: ve y carga solo las evaluaciones de la gente que tiene a cargo.
--  * Capital Humano: ve el padrón, el avance y gestiona períodos y solicitudes.
--  * Puntajes individuales: solo la directora de CH, admin y los encargados (ve_respuestas).
-- Las operaciones de administración (alta de usuarios, sincronización) corren en el
-- servidor con la clave de servicio, después de verificar el rol en la aplicación.

alter table unidades       enable row level security;
alter table agentes        enable row level security;
alter table usuarios       enable row level security;
alter table periodos       enable row level security;
alter table competencias   enable row level security;
alter table asignaciones   enable row level security;
alter table padron_periodo enable row level security;
alter table evaluaciones   enable row level security;
alter table solicitudes    enable row level security;
alter table auditoria      enable row level security;

-- Padrón completo: solo Capital Humano
create policy unidades_ch on unidades for select to authenticated using (es_ch());
create policy agentes_ch  on agentes  for select to authenticated using (es_ch());

-- Usuarios: cada uno se ve a sí mismo; Capital Humano ve a todos
create policy usuarios_ver on usuarios for select to authenticated
  using (id = mi_id() or es_ch());

-- Períodos y competencias: cualquier usuario habilitado los lee; Capital Humano los edita
create policy periodos_ver on periodos for select to authenticated using (mi_id() is not null);
create policy periodos_ch  on periodos for all    to authenticated using (es_ch()) with check (es_ch());
create policy competencias_ver on competencias for select to authenticated using (mi_id() is not null);
create policy competencias_ch  on competencias for all    to authenticated using (es_ch()) with check (es_ch());

-- Asignaciones: el evaluador ve las suyas; Capital Humano las gestiona
create policy asignaciones_ver on asignaciones for select to authenticated
  using (evaluador_id = mi_id() or es_ch());
create policy asignaciones_ch on asignaciones for all to authenticated
  using (es_ch()) with check (es_ch());

-- Foto del padrón: el evaluador ve a su equipo; Capital Humano ve todo
create policy padron_periodo_ver on padron_periodo for select to authenticated
  using (evaluador_id = mi_id() or es_ch());

-- Evaluaciones
create policy evaluaciones_ver on evaluaciones for select to authenticated
  using (evaluador_id = mi_id() or puede_ver_respuestas());

create policy evaluaciones_crear on evaluaciones for insert to authenticated
  with check (
    evaluador_id = mi_id()
    and exists (
      select 1 from padron_periodo pp
      where pp.periodo_id = evaluaciones.periodo_id
        and pp.legajo = evaluaciones.legajo
        and pp.evaluador_id = mi_id()
    )
  );

create policy evaluaciones_editar on evaluaciones for update to authenticated
  using (evaluador_id = mi_id())
  with check (
    evaluador_id = mi_id()
    and exists (
      select 1 from padron_periodo pp
      where pp.periodo_id = evaluaciones.periodo_id
        and pp.legajo = evaluaciones.legajo
        and pp.evaluador_id = mi_id()
    )
  );

-- Solicitudes: el director ve y crea las suyas; Capital Humano ve todas
create policy solicitudes_ver on solicitudes for select to authenticated
  using (solicitante_id = mi_id() or es_ch());
create policy solicitudes_crear on solicitudes for insert to authenticated
  with check (solicitante_id = mi_id() and estado = 'pendiente');

-- Auditoría: cualquiera registra lo suyo; solo dirección de CH y admin la leen
create policy auditoria_registrar on auditoria for insert to authenticated
  with check (usuario_id = mi_id());
create policy auditoria_ver on auditoria for select to authenticated
  using (coalesce((mi_usuario()).rol in ('directora_ch', 'admin'), false));

-- Funciones: nada para usuarios anónimos
revoke execute on function mi_usuario(), mi_id(), es_ch(), puede_ver_respuestas(),
  preparar_padron(bigint), abrir_periodo(bigint), buscar_agente(text), resolver_solicitud(bigint, boolean)
  from public;
grant execute on function mi_usuario(), mi_id(), es_ch(), puede_ver_respuestas(),
  preparar_padron(bigint), abrir_periodo(bigint), buscar_agente(text), resolver_solicitud(bigint, boolean)
  to authenticated, service_role;

-- Los usuarios también se cargan a mano desde el Table Editor de Supabase:
-- el mail se guarda siempre en minúsculas y sin espacios, y el nombre sin espacios sobrantes.

create function normalizar_usuario() returns trigger
language plpgsql as $$
begin
  new.email := lower(btrim(new.email));
  new.nombre := btrim(new.nombre);
  new.legajo := nullif(btrim(new.legajo), '');
  return new;
end $$;

create trigger usuarios_normalizar
  before insert or update on usuarios
  for each row execute function normalizar_usuario();
