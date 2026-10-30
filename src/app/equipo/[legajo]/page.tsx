import { notFound, redirect } from 'next/navigation';
import { fecha, periodoActual } from '@/lib/periodos';
import { requerirUsuario } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import type { FilaCompetencia } from '@/lib/tipos';
import { FormEvaluacion } from './FormEvaluacion';

export default async function Evaluar({ params }: { params: Promise<{ legajo: string }> }) {
  const usuario = await requerirUsuario();
  const { legajo } = await params;
  const supabase = await clienteServidor();
  const periodo = await periodoActual(supabase);
  if (!periodo || periodo.estado !== 'abierto') redirect('/equipo');

  const [{ data: agente }, { data: competencias }, { data: evaluacion }] = await Promise.all([
    supabase.from('padron_periodo').select('legajo, nombre, unidad_nombre, secretaria')
      .eq('periodo_id', periodo.id).eq('legajo', legajo).eq('evaluador_id', usuario.id).maybeSingle(),
    supabase.from('competencias').select('orden, tipo, nombre, descripcion').eq('periodo_id', periodo.id).order('orden'),
    supabase.from('evaluaciones').select('puntajes, agrupamiento, observaciones, estado, enviada_en, actualizada_en')
      .eq('periodo_id', periodo.id).eq('legajo', legajo).maybeSingle(),
  ]);
  if (!agente) notFound();

  const comps = (competencias ?? []) as FilaCompetencia[];
  const nota = evaluacion?.estado === 'enviada'
    ? `Enviada el ${fecha(evaluacion.enviada_en!)}. Podés modificarla hasta el cierre del período (${fecha(periodo.cierre)}).`
    : evaluacion ? `Tenés un borrador guardado el ${fecha(evaluacion.actualizada_en)}. Seguí desde donde lo dejaste.` : null;

  return (
    <FormEvaluacion
      agente={{ legajo: agente.legajo, nombre: agente.nombre, unidad: agente.unidad_nombre }}
      evaluador={usuario.nombre}
      competencias={comps}
      inicial={{
        puntajes: (evaluacion?.puntajes as (number | null)[] | undefined) ?? comps.map(() => null),
        agrupamiento: evaluacion?.agrupamiento ?? null,
        observaciones: evaluacion?.observaciones ?? '',
        enviada: evaluacion?.estado === 'enviada',
      }}
      nota={nota}
      cierre={fecha(periodo.cierre)}
    />
  );
}
