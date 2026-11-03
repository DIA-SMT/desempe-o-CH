-- Uso de Migue, el asistente: una fila por pregunta libre, para limitar cuántas hace cada
-- persona por día. No se guarda el texto de las preguntas ni las respuestas.
create table consultas_asistente (
  id         bigint generated always as identity primary key,
  usuario_id uuid not null references usuarios (id) on delete cascade,
  creada_en  timestamptz not null default now()
);
create index consultas_asistente_usuario on consultas_asistente (usuario_id, creada_en);

-- Sin políticas: solo la usa el servidor con la clave de servicio
alter table consultas_asistente enable row level security;
