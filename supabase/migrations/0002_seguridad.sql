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
