-- Ingreso con CiDiTuc (Ciudad Digital): la persona se identifica con su CUIL y acá se guarda su DNI.
-- El DNI se carga en la planilla de evaluadores, en Configuración o en el primer ingreso
-- (vinculación por legajo: ver src/lib/cidituc.ts). Solo entra quien ya está en esta tabla.

alter table usuarios add column dni text unique check (dni ~ '^[1-9][0-9]{5,7}$');

-- El DNI se guarda solo con dígitos y sin ceros adelante (acepta también el CUIL completo)
create or replace function normalizar_usuario() returns trigger
language plpgsql as $$
declare
  v_doc text := regexp_replace(coalesce(new.dni, ''), '\D', '', 'g');
begin
  new.email := lower(btrim(new.email));
  new.nombre := btrim(new.nombre);
  new.legajo := nullif(btrim(new.legajo), '');
  if length(v_doc) = 11 then
    v_doc := substr(v_doc, 3, 8);
  end if;
  new.dni := nullif(ltrim(v_doc, '0'), '');
  return new;
end $$;
