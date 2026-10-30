import Link from 'next/link';
import { fecha, periodoActual, textoCierre } from '@/lib/periodos';
import { requerirCH } from '@/lib/sesion';
import { clienteAdmin } from '@/lib/supabase/admin';
import { Pestanas } from './Pestanas';

export default async function LayoutCH({ children }: { children: React.ReactNode }) {
  const usuario = await requerirCH();
  const db = clienteAdmin();
  const periodo = await periodoActual(db);
  const [{ count: pendientes }, { count: equipoPropio }] = await Promise.all([
    db.from('solicitudes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    periodo?.estado === 'abierto'
      ? db.from('padron_periodo').select('legajo', { count: 'exact', head: true }).eq('periodo_id', periodo.id).eq('evaluador_id', usuario.id)
      : Promise.resolve({ count: 0 }),
  ]);

  return (
    <>
      <section className="ch-head">
        <p className="eyebrow sun">Capital Humano</p>
        <h1>Panel de evaluación</h1>
        <p className="sub">
          {periodo
            ? periodo.estado === 'abierto'
              ? `Período ${periodo.nombre}: abrió el ${fecha(periodo.inicio)} y ${textoCierre(periodo)}.`
              : `Período ${periodo.nombre} en preparación. Todavía no está abierto para los directores.`
            : 'No hay un período en curso. Creá uno en Configuración.'}
          {(equipoPropio ?? 0) > 0 && <> · <Link href="/equipo">Evaluar a mi equipo</Link></>}
        </p>
      </section>
      <Pestanas pendientes={pendientes ?? 0} />
      {children}
    </>
  );
}
