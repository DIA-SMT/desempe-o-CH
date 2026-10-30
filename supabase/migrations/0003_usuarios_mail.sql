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
