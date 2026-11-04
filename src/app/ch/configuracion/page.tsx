import { LeyendaCategorias, Regla } from '@/components/Escala';
import { esSinMail } from '@/lib/cidituc';
import { f0 } from '@/lib/formato';
import { fecha, periodoActual } from '@/lib/periodos';
import { puedeGestionarUsuarios, requerirCH, ROLES, type Rol } from '@/lib/sesion';
import { clienteAdmin, traerTodo } from '@/lib/supabase/admin';
import { abrirPeriodo, actualizarFoto, cambiarUsuario, cerrarPeriodo, crearPeriodo, guardarUsuarioCH, sincronizarAhora } from '../actions';
import { ImportarEvaluadores } from './ImportarEvaluadores';

interface Asignacion { unidad_codigo: string; usuarios: { nombre: string; email: string } | null }
interface UsuarioFila { id: string; email: string; nombre: string; rol: Rol; ve_respuestas: boolean; activo: boolean; dni: string | null }

export default async function Configuracion() {
  const yo = await requerirCH();
  const db = clienteAdmin();
  const periodo = await periodoActual(db);

  const [{ count: agentes }, { data: unidades }, { data: ultima }, comps, asignaciones, { data: usuariosCH }, conAgentes] = await Promise.all([
    db.from('agentes').select('legajo', { count: 'exact', head: true }).eq('activo', true),
    db.from('unidades').select('codigo, nombre').eq('activa', true),
    db.from('agentes').select('sincronizado_en').order('sincronizado_en', { ascending: false }).limit(1),
    periodo ? db.from('competencias').select('orden, tipo, nombre, descripcion').eq('periodo_id', periodo.id).order('orden') : Promise.resolve({ data: [] }),
    periodo
      ? traerTodo<Asignacion>((d, h) =>
          // relación muchos-a-uno: PostgREST devuelve un objeto, no una lista
          db.from('asignaciones').select('unidad_codigo, usuarios(nombre, email)').eq('periodo_id', periodo.id).range(d, h)
            .overrideTypes<Asignacion[], { merge: false }>())
      : Promise.resolve([]),
    db.from('usuarios').select('id, email, nombre, rol, ve_respuestas, activo, dni').neq('rol', 'evaluador').order('nombre'),
    traerTodo<{ legajo: string; unidad_codigo: string }>((d, h) => db.from('agentes').select('legajo, unidad_codigo').eq('activo', true).range(d, h)),
  ]);
  const noEvaluables = new Map((await traerTodo<{ legajo: string; motivo: string }>((d, h) =>
    db.from('no_evaluables').select('legajo, motivo').range(d, h))).map((n) => [n.legajo, n.motivo]));

  // Se evalúa al personal con legajo de 5 dígitos que no es funcionario ni de convenio 5
  const evaluables = conAgentes.filter((a) => /^\d{5}$/.test(a.legajo) && !noEvaluables.has(a.legajo));
  const fuera = (motivo: string) => conAgentes.filter((a) => /^\d{5}$/.test(a.legajo) && noEvaluables.get(a.legajo) === motivo).length;
  const seisDigitos = conAgentes.filter((a) => !/^\d{5}$/.test(a.legajo)).length;
  const nombreUnidad = new Map((unidades ?? []).map((u) => [u.codigo as string, u.nombre as string]));
  const unidadesConAgentes = new Set(evaluables.map((a) => a.unidad_codigo));
  const asignadas = asignaciones.filter((a) => unidadesConAgentes.has(a.unidad_codigo)).length;
  const competencias = (comps.data ?? []) as { orden: number; tipo: string; nombre: string; descripcion: string }[];
  const gestiona = puedeGestionarUsuarios(yo);

  return (
    <>
      <div className="cfg">
        {/* Período */}
        <section className="card">
          <h2>Período de evaluación</h2>
          {!periodo ? (
            <form action={crearPeriodo} style={{ display: 'grid', gap: 12 }}>
              <p className="sub" style={{ fontSize: '.88rem' }}>No hay un período en curso. Al crearlo se copian las competencias del período anterior.</p>
              <div className="field"><label htmlFor="nombre">Nombre</label><input id="nombre" name="nombre" type="text" required placeholder="2do semestre 2026" /></div>
              <div className="form-grid">
                <div className="field"><label htmlFor="inicio">Apertura</label><input id="inicio" name="inicio" type="date" required /></div>
                <div className="field"><label htmlFor="cierre">Cierre</label><input id="cierre" name="cierre" type="date" required /></div>
              </div>
              <button className="btn primary" style={{ justifySelf: 'start' }}>Crear período</button>
            </form>
          ) : (
            <>
              <dl className="facts" style={{ margin: 0 }}>
                <div><dt>Nombre</dt><dd>{periodo.nombre}</dd></div>
                <div><dt>Apertura</dt><dd className="num">{fecha(periodo.inicio)}</dd></div>
                <div><dt>Cierre</dt><dd className="num">{fecha(periodo.cierre)}</dd></div>
                <div><dt>Estado</dt><dd>{periodo.estado === 'abierto' ? <span className="pill ok">Abierto</span> : <span className="pill warn">En preparación</span>}</dd></div>
              </dl>
              {periodo.estado === 'preparacion' ? (
                <form action={abrirPeriodo} style={{ display: 'grid', gap: 8 }}>
                  <input type="hidden" name="id" value={periodo.id} />
                  <p className="sub" style={{ fontSize: '.88rem' }}>
                    Al abrirlo se congela la foto del padrón y cada director ve a su equipo. Antes, cargá los evaluadores: hay {asignadas} de {unidadesConAgentes.size} unidades con evaluador.
                  </p>
                  <button className="btn primary" style={{ justifySelf: 'start' }}>Abrir período</button>
                </form>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  <form action={actualizarFoto} className="acciones">
                    <input type="hidden" name="id" value={periodo.id} />
                    <button className="btn">Actualizar foto del padrón</button>
                    <span className="sub" style={{ fontSize: '.82rem' }}>
                      {periodo.padron_congelado_en ? `Última: ${fecha(periodo.padron_congelado_en)}. ` : ''}Suma agentes nuevos y recalcula evaluadores de quienes no tienen evaluación.
                    </span>
                  </form>
                  <form action={cerrarPeriodo} className="acciones">
                    <input type="hidden" name="id" value={periodo.id} />
                    <input name="confirmar" type="text" placeholder="Escribí CERRAR" aria-label="Confirmación para cerrar" style={{ maxWidth: 160 }} />
                    <button className="btn">Cerrar período</button>
                  </form>
                </div>
              )}
            </>
          )}
        </section>

        {/* Padrón */}
        <section className="card">
          <h2>Padrón de CapitalIA</h2>
          <dl className="facts" style={{ margin: 0 }}>
            <div><dt>Agentes activos</dt><dd>{f0(agentes ?? 0)}</dd></div>
            <div><dt>A evaluar</dt><dd>{f0(evaluables.length)}</dd></div>
            <div><dt>Unidades</dt><dd>{f0(unidades?.length ?? 0)}</dd></div>
            <div><dt>Última sincronización</dt><dd className="num">{ultima?.[0] ? fecha(ultima[0].sincronizado_en) : 'Nunca'}</dd></div>
          </dl>
          <p className="sub" style={{ fontSize: '.86rem' }}>
            No se evalúan: {f0(fuera('funcionario'))} funcionarios de la nómina, {f0(seisDigitos)} con legajo de 6 dígitos y{' '}
            {fuera('convenio') ? `${f0(fuera('convenio'))} de convenio 5` : 'el personal de convenio 5 (falta cargar la lista)'}.
            Las listas se cargan con <code>npm run padron:no-evaluables</code>.
          </p>
          <p className="sub" style={{ fontSize: '.86rem' }}>Se sincroniza solo todos los días a las 6. La repartición indica dónde presta servicios cada agente.</p>
          <form action={sincronizarAhora}><button className="btn">Sincronizar ahora</button></form>
        </section>
      </div>

      {/* Evaluadores */}
      <section className="card" style={{ padding: '18px 20px', display: 'grid', gap: 14, marginBottom: 16 }}>
        <div className="section-h">
          <div>
            <h2>Evaluadores por unidad</h2>
            <p className="sub" style={{ fontSize: '.88rem' }}>
              {periodo ? `${asignadas} de ${unidadesConAgentes.size} unidades con personal tienen evaluador en este período.` : 'Creá el período para cargar evaluadores.'}
            </p>
          </div>
        </div>
        <p className="sub" style={{ fontSize: '.88rem', maxWidth: '70ch' }}>
          Completá la planilla <code>data/evaluadores-por-unidad.csv</code> (generada desde el organigrama) con el legajo del
          evaluador de cada unidad (el mail y el DNI son opcionales: con CiDiTuc alcanza con el legajo) y subila acá. En cada
          Dirección evalúa su director; si no hay, el superior inmediato (Subsecretario o Secretario). En las Secretarías y
          Subsecretarías, su titular evalúa al personal directo. Una unidad sin evaluador sube al nivel de arriba. Los
          funcionarios no se evalúan.
        </p>
        {periodo && <ImportarEvaluadores />}
        {asignaciones.length > 0 && (
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ver las {asignaciones.length} asignaciones cargadas</summary>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table className="data">
                <thead><tr><th>Unidad</th><th>Evaluador/a</th><th>Mail</th></tr></thead>
                <tbody>
                  {asignaciones.map((a) => (
                    <tr key={a.unidad_codigo}><td>{nombreUnidad.get(a.unidad_codigo) ?? a.unidad_codigo}</td><td>{a.usuarios?.nombre}</td><td>{esSinMail(a.usuarios?.email) ? <span className="muted">Sin mail (entra con CiDiTuc)</span> : a.usuarios?.email}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      {/* Usuarios de Capital Humano */}
      <section className="card" style={{ padding: '18px 20px', display: 'grid', gap: 14, marginBottom: 16 }}>
        <div>
          <h2>Usuarios de Capital Humano</h2>
          <p className="sub" style={{ fontSize: '.88rem' }}>
            Los encargados ven los puntajes de cada persona. La Dirección de Capital Humano y los administradores los ven siempre.
          </p>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Nombre</th><th>Rol</th><th>Ve puntajes</th><th>CiDiTuc</th><th>Estado</th>{gestiona && <th />}</tr></thead>
            <tbody>
              {((usuariosCH ?? []) as UsuarioFila[]).map((u) => {
                const ve = u.rol !== 'capital_humano' || u.ve_respuestas;
                return (
                  <tr key={u.id}>
                    <td><strong>{u.nombre}</strong><span className="sm">{u.email}</span></td>
                    <td><span className="chip-rol">{ROLES[u.rol]}</span></td>
                    <td>{ve ? 'Sí' : 'No'}</td>
                    <td>{u.rol === 'admin' ? <span className="muted">Solo contraseña</span> : u.dni ? 'DNI cargado' : <span className="muted">Sin DNI</span>}</td>
                    <td>{u.activo ? <span className="pill ok">Activo</span> : <span className="pill">Sin acceso</span>}</td>
                    {gestiona && (
                      <td className="num">
                        {u.id !== yo.id && (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {u.rol === 'capital_humano' && (
                              <form action={cambiarUsuario}>
                                <input type="hidden" name="id" value={u.id} /><input type="hidden" name="campo" value="ve_respuestas" />
                                <input type="hidden" name="valor" value={u.ve_respuestas ? '0' : '1'} />
                                <button className="btn sm">{u.ve_respuestas ? 'Quitar encargado' : 'Hacer encargado'}</button>
                              </form>
                            )}
                            <form action={cambiarUsuario}>
                              <input type="hidden" name="id" value={u.id} /><input type="hidden" name="campo" value="activo" />
                              <input type="hidden" name="valor" value={u.activo ? '0' : '1'} />
                              <button className="btn sm">{u.activo ? 'Quitar acceso' : 'Dar acceso'}</button>
                            </form>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {gestiona && (
          <form action={guardarUsuarioCH} className="form-grid">
            <div className="field"><label htmlFor="u-nombre">Apellido y nombre</label><input id="u-nombre" name="nombre" type="text" required /></div>
            <div className="field"><label htmlFor="u-email">Mail institucional</label><input id="u-email" name="email" type="email" required /></div>
            <div className="field"><label htmlFor="u-dni">DNI o CUIL (para entrar con CiDiTuc)</label><input id="u-dni" name="dni" type="text" inputMode="numeric" autoComplete="off" /></div>
            <div className="field">
              <label htmlFor="u-rol">Rol</label>
              <select id="u-rol" name="rol" defaultValue="capital_humano">
                <option value="capital_humano">{ROLES.capital_humano}</option>
                <option value="directora_ch">{ROLES.directora_ch}</option>
                {yo.rol === 'admin' && <option value="admin">{ROLES.admin}</option>}
              </select>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 42 }}>
              <input type="checkbox" name="ve_respuestas" /> Encargado (ve puntajes)
            </label>
            <button className="btn primary" style={{ justifySelf: 'start' }}>Dar de alta</button>
          </form>
        )}
      </section>

      {/* Escala y competencias */}
      <section className="card" style={{ padding: '18px 20px', display: 'grid', gap: 14, marginBottom: 16 }}>
        <h2>Escala de calificación</h2>
        <p className="sub">La suma de las {competencias.length || 10} competencias (de 1 a 10 cada una) da el puntaje final sobre 100.</p>
        <Regla />
        <LeyendaCategorias />
      </section>
      {competencias.length > 0 && (
        <div className="grid2">
          {(['G', 'E'] as const).map((t) => (
            <section key={t} className="card chart">
              <h2>Competencias {t === 'G' ? 'genéricas' : 'específicas'}</h2>
              <ul className="comp-list">
                {competencias.filter((c) => c.tipo === t).map((c) => (
                  <li key={c.orden}><strong>{c.nombre}</strong><p>{c.descripcion}</p></li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
