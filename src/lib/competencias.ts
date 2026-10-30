// Competencias del formulario de Capital Humano. Se copian a cada período nuevo;
// así, si cambian en el futuro, la comparación con años anteriores sigue siendo válida.

export interface Competencia {
  orden: number;
  tipo: 'G' | 'E';
  nombre: string;
  descripcion: string;
}

export const COMPETENCIAS_BASE: Competencia[] = [
  { orden: 1, tipo: 'G', nombre: 'Resolución de problemas', descripcion: 'Habilidad para identificar y analizar problemas de manera crítica, generar opciones de solución y tomar decisiones fundamentadas para resolverlos. Implica pensamiento analítico, creatividad y aplicación de estrategias efectivas.' },
  { orden: 2, tipo: 'G', nombre: 'Comunicación efectiva', descripcion: 'Habilidad para transmitir y recibir información de manera clara, precisa y adecuada al contexto, fomentando relaciones laborales positivas y entendimiento mutuo.' },
  { orden: 3, tipo: 'G', nombre: 'Trabajo en equipo', descripcion: 'Capacidad de colaborar de manera productiva con otros, aprovechando la diversidad de habilidades y conocimientos para alcanzar objetivos comunes. Implica comunicación efectiva, cooperación, apoyo mutuo y una disposición para compartir responsabilidades.' },
  { orden: 4, tipo: 'G', nombre: 'Conocimiento técnico en función de las tareas', descripcion: 'Capacidad para aplicar conocimientos y habilidades técnicas específicas para realizar tareas de manera efectiva. Implica comprender la teoría y los procedimientos relacionados con el trabajo y poder adaptarlos a diversas situaciones.' },
  { orden: 5, tipo: 'G', nombre: 'Desempeño en trabajo bajo presión', descripcion: 'Capacidad para mantener un nivel de rendimiento elevado, manejar el estrés y tomar decisiones efectivas en situaciones de alta presión o urgencia. Implica la gestión del tiempo, la priorización de tareas y la capacidad de resolver problemas rápidamente.' },
  { orden: 6, tipo: 'G', nombre: 'Responsabilidad ambiental', descripcion: 'Conciencia y compromiso con la protección del entorno y la adopción de prácticas sostenibles en el trabajo diario. Incluye la identificación de impactos ambientales y la implementación de medidas para minimizarlos.' },
  { orden: 7, tipo: 'E', nombre: 'Variabilidad', descripcion: 'Capacidad para adaptarse y responder a cambios en el entorno o en las condiciones de trabajo. Implica flexibilidad, apertura a nuevas formas de hacer las cosas y capacidad de ajuste a nuevas circunstancias.' },
  { orden: 8, tipo: 'E', nombre: 'Iniciativa y autonomía', descripcion: 'Capacidad de actuar de manera independiente y proactiva para identificar oportunidades y tomar decisiones sin necesidad de una supervisión constante. Implica motivación interna, auto-gestión y la disposición de asumir la responsabilidad de sus acciones y resultados.' },
  { orden: 9, tipo: 'E', nombre: 'Responsabilidad en el logro de las tareas', descripcion: 'Capacidad de cumplir con las tareas y objetivos asignados en tiempo y forma, actuando con compromiso, dedicación y responsabilidad sobre los resultados obtenidos.' },
  { orden: 10, tipo: 'E', nombre: 'Ordenamiento de las tareas', descripcion: 'Compromiso con mantener un orden lógico y sistemático en la realización de tareas, asegurando que los procesos se sigan adecuadamente y cumplan con los estándares de calidad y eficiencia.' },
];

// Nombres cortos para gráficos y tablas
const CORTOS: Record<string, string> = {
  'Conocimiento técnico en función de las tareas': 'Conocimiento técnico',
  'Desempeño en trabajo bajo presión': 'Trabajo bajo presión',
  'Responsabilidad en el logro de las tareas': 'Responsabilidad en el logro',
  'Ordenamiento de las tareas': 'Ordenamiento de tareas',
};
export const nombreCorto = (nombre: string) => CORTOS[nombre] ?? nombre;
