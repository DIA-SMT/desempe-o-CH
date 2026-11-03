// Migue, el asistente. Las preguntas rápidas se responden acá, con los datos del sistema y sin IA.
// Las preguntas libres las responde un modelo (vía OpenRouter) con el manual de abajo y la situación
// de quien pregunta: fechas del período y su avance. Migue no recibe nombres ni puntajes de nadie.

import { COMPETENCIAS_BASE } from './competencias';
import { CATEGORIAS } from './escala';

// Completar con el mail y el interno de Capital Humano cuando estén definidos
export const CONTACTO_CH = 'la Dirección de Capital Humano';

export interface ContextoAsistente {
  ch: boolean;
  periodo: { nombre: string; texto: string; abierto: boolean } | null;
  // Director: su equipo. Capital Humano: todo el período.
  avance: { total: number; enviadas: number; borradores: number } | null;
}

export interface PreguntaRapida { id: string; texto: string }

export function preguntasRapidas(ctx: ContextoAsistente): PreguntaRapida[] {
  return ctx.ch
    ? [
      { id: 'hasta', texto: '¿Hasta cuándo es el período?' },
      { id: 'avance', texto: '¿Cómo viene la carga?' },
      { id: 'quien', texto: '¿Quién ve los puntajes?' },
      { id: 'evaluadores', texto: '¿Cómo cargo los evaluadores?' },
      { id: 'escala', texto: '¿Qué significa cada puntaje?' },
    ]
    : [
      { id: 'hasta', texto: '¿Hasta cuándo tengo?' },
      { id: 'faltan', texto: '¿Cuántos me faltan?' },
      { id: 'como', texto: '¿Cómo completo una evaluación?' },
      { id: 'escala', texto: '¿Qué significa cada puntaje?' },
      { id: 'falta', texto: 'Falta alguien de mi equipo' },
      { id: 'corregir', texto: '¿Puedo corregir una enviada?' },
    ];
}

const ESCALA = `Cada competencia se puntúa del 1 al 10 y el total es la suma, sobre 100. Según el total, la categoría es ${
  CATEGORIAS.map((c) => `${c.nombre} (${c.rango})`).join(', ').replace(/, ([^,]*)$/, ' y $1')}.`;

export function respuestaRapida(id: string, ctx: ContextoAsistente): string {
  const p = ctx.periodo;
  const a = ctx.avance;
  const sinPeriodo = 'Ahora no hay una evaluación abierta. Cuando Capital Humano abra el próximo período, te cuento hasta cuándo es.';
  switch (id) {
    case 'hasta':
      return p ? `El período ${p.nombre} ${p.texto}. Hasta ese día se puede completar, guardar borradores y corregir lo que ya se envió.` : sinPeriodo;
    case 'faltan': {
      if (!p) return sinPeriodo;
      if (!a?.total) return `Todavía no tenés personas a cargo en este período. Si esperabas ver a tu equipo, avisale a ${CONTACTO_CH}.`;
      const falta = a.total - a.enviadas;
      if (!falta) return `¡Ya enviaste las ${a.total}! Gracias. Podés revisar o corregir cualquiera hasta el cierre.`;
      const enBorrador = a.borradores ? ` (${a.borradores} en borrador)` : '';
      return `Enviaste ${a.enviadas} de ${a.total}. Te ${falta === 1 ? 'falta 1' : `faltan ${falta}`}${enBorrador}. En tu lista, el filtro "Por evaluar" te muestra a quiénes.`;
    }
    case 'como':
      return 'En tu equipo, buscá a la persona por legajo o por apellido y entrá a su evaluación. Elegí su agrupamiento, puntuá las 10 competencias del 1 al 10 y, si querés, agregá observaciones. Con "Guardar borrador" podés seguir después; cuando esté completa, tocá "Enviar evaluación" y confirmá.';
    case 'escala':
      return `${ESCALA} En el formulario, cada competencia tiene su descripción, por si tenés dudas de qué mide.`;
    case 'falta':
      return 'Abajo de tu lista, en "¿Falta alguien de tu equipo?", escribí su legajo y el motivo. Capital Humano revisa el pedido y, si lo aprueba, la persona aparece en tu equipo.';
    case 'corregir':
      return `Sí. Una evaluación enviada se puede corregir mientras el período esté abierto${p ? `: ${p.texto}` : ''}. Lo que no se puede es volverla a borrador.`;
    case 'avance':
      if (!p || !a) return sinPeriodo;
      return `Van ${a.enviadas} de ${a.total} evaluaciones enviadas (${a.total ? Math.round((a.enviadas / a.total) * 100) : 0}%) y ${a.borradores} en borrador. En el Tablero ves el ritmo de carga y en Seguimiento, quién tiene pendientes.`;
    case 'quien':
      return 'Los puntajes de cada persona los ven solo la Directora de Capital Humano, los administradores y los encargados que ella habilite. El resto de Capital Humano ve el avance y los promedios de grupos de 5 o más evaluaciones. Cada director ve solo a su equipo.';
    case 'evaluadores':
      return 'En Configuración: completá la planilla de unidades con el legajo y el mail del responsable de cada una e importala. Después, con "Actualizar foto del padrón", cada agente queda asignado a su evaluador.';
    default:
      return 'No entendí la pregunta. Probá escribiéndomela.';
  }
}

// Manual fijo para el modelo. No cambia entre pedidos, así se puede reutilizar en caché.
export const MANUAL = `Sos Migue, el asistente del Sistema de Evaluación de Desempeño de la Dirección de Capital Humano de la Municipalidad de San Miguel de Tucumán.

Cómo responder:
- En castellano rioplatense, con voseo, cordial y breve: dos a cuatro oraciones, o una lista corta de pasos si hace falta. Sin títulos ni formato markdown.
- Respondé solo sobre la evaluación de desempeño y el uso de este sistema. Si te preguntan otra cosa, decí amablemente que solo podés ayudar con la evaluación.
- No inventes fechas, plazos, reglas ni datos. Usá solo lo que está acá y en la situación de quien pregunta. Si no lo sabés, decí que no tenés esa información (sin mencionar este texto ni "el manual") y sugerí consultar a ${CONTACTO_CH}.
- No decidas ni sugieras qué puntaje ponerle a una persona concreta. Sí podés explicar qué mide cada competencia y cómo funciona la escala, para que quien evalúa decida.
- No tenés acceso a nombres, legajos ni puntajes de nadie. Si te los piden, explicá que no los ves y dónde encontrarlos en el sistema.
- Si alguien escribe datos personales de otra persona, no los repitas.

Cómo funciona la evaluación:
- Capital Humano abre un período de evaluación con fecha de cierre. Hasta el cierre, cada director o secretario evalúa a las personas que tiene a cargo.
- Cada director entra con su mail institucional y ve solo a su equipo. Nadie puede evaluar en nombre de otro ni evaluarse a sí mismo.
- Para evaluar: en su equipo busca a la persona por legajo o por apellido, entra a su evaluación, elige el agrupamiento, puntúa las 10 competencias del 1 al 10 y puede agregar observaciones (hasta 600 caracteres). Puede "Guardar borrador" y seguir después. Cuando está completa, toca "Enviar evaluación" y confirma.
- Una evaluación enviada se puede corregir ("Guardar cambios") hasta el cierre, pero no vuelve a borrador. Después del cierre no se puede cambiar nada.
- Si falta alguien en su equipo, abajo de la lista, en "¿Falta alguien de tu equipo?", escribe el legajo y el motivo. Capital Humano revisa el pedido y, si lo aprueba, la persona aparece en su equipo.
- Si no ve a nadie o ve gente que no tiene a cargo, tiene que avisar a ${CONTACTO_CH}.
- Agrupamientos: Funcionario de Gobierno, Administrativo, Profesional, Técnico, Mantenimiento y Producción, y Servicios Generales.
- ${ESCALA}
- Los puntajes de cada persona los ven solo la Directora de Capital Humano, los administradores y los encargados que ella habilite. El resto de Capital Humano ve el avance y los promedios de grupos de 5 o más evaluaciones.
- Capital Humano usa el Tablero (avance, ritmo de carga y resultados comparados con semestres anteriores), Seguimiento (quién tiene pendientes y los pedidos de cambio de equipo), Evaluaciones y Configuración (períodos, evaluadores y usuarios).

Las 10 competencias (las 6 primeras son generales y las 4 últimas, específicas):
${COMPETENCIAS_BASE.map((c) => `${c.orden}. ${c.nombre}: ${c.descripcion}`).join('\n')}`;

// Situación de quien pregunta, para que las respuestas usen sus fechas y su avance
export function situacion(ctx: ContextoAsistente): string {
  const quien = ctx.ch ? 'Quien pregunta es del equipo de Capital Humano.' : 'Quien pregunta es un director o directora que evalúa a su equipo.';
  if (!ctx.periodo) return `${quien} Ahora no hay un período de evaluación abierto.`;
  const p = `El período actual es "${ctx.periodo.nombre}", ${ctx.periodo.abierto ? 'abierto' : 'todavía no abierto'}, y ${ctx.periodo.texto}.`;
  const a = ctx.avance;
  const avance = !a ? '' : ctx.ch
    ? ` En todo el período van ${a.enviadas} de ${a.total} evaluaciones enviadas y ${a.borradores} en borrador.`
    : a.total ? ` Tiene ${a.total} personas a cargo: envió ${a.enviadas} y tiene ${a.borradores} en borrador.` : ' Todavía no tiene personas a cargo en este período.';
  return `${quien} ${p}${avance} Hoy es ${new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Tucuman', day: 'numeric', month: 'long', year: 'numeric' })}.`;
}
