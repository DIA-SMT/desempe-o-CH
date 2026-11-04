-- La nómina de funcionarios trae el CUIL: se guarda el DNI, para que quien sea titular de una unidad
-- entre con CiDiTuc directo (sin vincular el legajo la primera vez).
alter table no_evaluables add column dni text check (dni ~ '^[1-9][0-9]{5,7}$');
