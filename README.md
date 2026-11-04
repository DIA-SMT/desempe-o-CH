# Evaluación de Desempeño

Sistema de la Dirección de Capital Humano de la Municipalidad de San Miguel de Tucumán para que cada director evalúe
a las personas que tiene a cargo, y para que Capital Humano siga el avance y analice los resultados.

- **Directores**: ven solo a su equipo, buscan por legajo o nombre y completan las 10 competencias (1 a 10, total sobre 100).
- **Capital Humano**: abre y cierra períodos, carga evaluadores, aprueba cambios de equipo y ve el tablero.
- **Puntajes individuales**: solo la Dirección de Capital Humano, administradores y los usuarios marcados como encargados.
  El resto de Capital Humano ve el avance y los promedios de grupos de 5 o más evaluaciones.
- **Semestres anteriores para el director**: el promedio de su equipo actual en cada semestre (con 3 o más evaluadas) y el
  puntaje anterior de cada persona, que aparece recién cuando envía la evaluación de este período.
- **Contacto**: capitalhumano@smt.gob.ar (`src/lib/contacto.ts`), en los pedidos de cambio de equipo y en Migue.

Next.js 16 + Supabase (Postgres, ingreso por mail y seguridad por fila). El padrón y el organigrama se leen de CapitalIA.

## Puesta en marcha

1. **Supabase**: crear un proyecto en supabase.com. En *SQL Editor*, pegar y correr `supabase/instalar.sql`
   (todas las migraciones juntas).
2. **Ingreso por mail** (*Authentication*):
   - *Sign In / Providers*: dejar Email activado y **desactivar "Allow new users to sign up"**. Las cuentas las crea el sistema.
   - *URL Configuration*: Site URL = la dirección del sistema; agregar `<dirección>/auth/confirm` en Redirect URLs.
   - *Emails > Magic Link*: reemplazar el enlace por
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
     (así el enlace funciona aunque se abra en otro navegador).
   - Para mandar mails a todos los directores, configurar un SMTP propio en *Emails > SMTP Settings*: el de
     Supabase tiene un límite bajo de envíos por hora.
3. **Variables**: copiar `.env.example` a `.env.local` y completarlo (Project Settings > API).
4. **Instalar y cargar datos**:
   ```bash
   npm install
   npm run padron:sync          # baja el padrón a data/cache (para la planilla)
   npm run padron:planilla      # genera data/evaluadores-por-unidad.csv
   npm run usuario:crear -- tu.mail@smt.gob.ar "Apellido Nombre" admin
   npm run dev
   ```
   Los cambios futuros de la base se aplican con `npm run db:migrar` (necesita `SUPABASE_DB_URL`).
   **Ingreso con contraseña (modo actual)**: además de la fila en `usuarios`, crear la cuenta en
   *Authentication → Users → Add user → Create new user* con el mismo mail, una contraseña y *Auto Confirm User* marcado.
   El ingreso por enlace sigue disponible desde la pantalla de ingreso.
5. **Usuarios**: los directores se dan de alta al importar la planilla. Para cargar a alguien a mano, agregá una fila en
   *Table Editor → usuarios* (mail, nombre, rol y, para encargados de CH, `ve_respuestas`). La cuenta de ingreso se crea
   sola la primera vez que pide el enlace; no hace falta tocar *Authentication*.
6. En el sistema (como admin): *Configuración* → **Sincronizar ahora** → **Crear período** → completar la planilla de
   evaluadores y **importarla** → **Abrir período**.

## Evaluaciones de años anteriores

La planilla del Google Forms (una hoja por semestre, con las mismas 10 competencias) se importa como períodos
históricos cerrados. El Excel tiene datos personales: guardalo en `data/historico/`, que está fuera de git.

```bash
npm run historico:importar -- "data/historico/archivo.xlsx"            # revisa y muestra el resumen
npm run historico:importar -- "data/historico/archivo.xlsx" --cargar   # lo escribe en la base
```

- Si una persona aparece más de una vez en un semestre, vale la última respuesta.
- La repartición escrita en el formulario se cruza por nombre con CapitalIA o con
  `data/equivalencias-reparticiones.csv` (nombres viejos o abreviados). Si no hay equivalencia, se usa la unidad actual del agente.
- Volver a importar una hoja reemplaza ese semestre. El tablero compara contra el último período cerrado.

## Ingreso con CiDiTuc

Los evaluadores entran con su cuenta CiDiTuc (CUIL y clave) por Ciudad Digital (repo `ditec-desarrollo/cidituc`). La
lógica está en `src/lib/cidituc.ts`, y las rutas en `src/app/auth/cidituc/` y `src/app/ingresar/cidituc/`.

1. "Ingresar con CiDiTuc" (`/auth/cidituc/login`) guarda un `state` de un solo uso y manda a
   `ciudaddigital.smt.gob.ar/#/login?next=evaluacion-desempeno&state=…`.
2. Ciudad Digital vuelve a `/auth/cidituc/callback?auth=<JWT>&state=…`. El servidor compara el `state`, valida el token
   contra `authStatus` del backend municipal, pasa el CUIL a DNI y busca al usuario por DNI. El token no llega al navegador.
3. Si el DNI todavía no está cargado, la persona escribe su legajo una sola vez: se vincula solo si ese legajo está
   habilitado (está en la planilla de evaluadores) y el nombre que verificó CiDiTuc coincide con el del padrón.
4. Se abre una sesión normal de Supabase (`generateLink` + `verifyOtp`, sin mandar mails). Quien no está habilitado
   ve "No tenés evaluaciones para completar". La cuenta de administración entra solo con contraseña.

- El DNI también se puede cargar en la planilla (columna "DNI o CUIL del evaluador") o en Configuración.
- Con CiDiTuc el mail es opcional: a quien no tiene se le guarda uno de relleno (`legajo-<n>@sin-mail.invalid`) que no se
  muestra ni se exporta.
- Variables: `CIDITUC_LOGIN_URL`, `CIDITUC_BACKEND_URL`, `CIDITUC_NEXT_KEY`, `CIDITUC_SESSION_SECRET` (ver `.env.example`).
  Sin ellas, la pantalla de ingreso queda con mail y contraseña.
- Pruebas: `npm run pruebas`. Para probar de punta a punta en local, correr Ciudad Digital en la computadora con
  `VITE_APP_EVALUACION_DESEMPENO_CALLBACK_URL=http://localhost:3000/auth/cidituc/callback` y apuntar `CIDITUC_LOGIN_URL` a ella.

## Migue, el asistente

Botón flotante para quien inició sesión. Las preguntas rápidas se responden con los datos del sistema, sin IA. Las
preguntas escritas van a un modelo por OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`) con un manual fijo
(`src/lib/asistente.ts`) y la situación de quien pregunta: fechas del período y su avance. No recibe nombres ni puntajes.
Cada persona puede hacer hasta 40 preguntas escritas por día; no se guarda el texto.

## Despliegue en Vercel

Importar el repositorio, cargar las mismas variables de entorno (con `NEXT_PUBLIC_SITE_URL` apuntando a la dirección
pública) y un `CRON_SECRET` cualquiera. `vercel.json` programa la sincronización diaria del padrón a las 6 (hora de Argentina).

## Reglas de negocio

- Cada agente lo evalúa el evaluador asignado a su unidad; si la unidad no tiene, el del nivel superior.
  Nadie se evalúa a sí mismo.
- Criterio de Capital Humano: en cada Dirección evalúa su director; en las Secretarías, el Secretario, que evalúa a su
  personal directo y a los directores. Las subsecretarías se dejan sin evaluador para que suban al Secretario.
  `npm run padron:planilla` deja esa indicación en la columna Observaciones.
- El formulario es el mismo del Google Forms (agrupamiento y las 10 competencias), más un campo opcional de observaciones.
- Al abrir el período se congela una foto del padrón. Los pases durante el período van por solicitudes que aprueba CH.
- Una evaluación enviada se puede corregir hasta el cierre, pero no vuelve a borrador. Capital Humano no edita evaluaciones.
- Cada vez que alguien abre el detalle de una evaluación queda registrado en `auditoria`.
- Los datos del padrón (`data/cache/`) y `.env.local` están fuera de git: tienen datos personales y secretos.

## Estructura

- `src/app/equipo` — portal del director
- `src/app/ch` — panel de Capital Humano (tablero, seguimiento, evaluaciones, configuración)
- `src/lib` — sesión y roles, padrón, períodos, escala
- `supabase/migrations` — esquema, funciones y seguridad por fila
- `scripts` — sincronización del padrón, planilla de evaluadores, alta de usuarios
- `prototipo` — prototipo navegable original (datos ficticios)
