// Escala de calificación: 10 competencias de 1 a 10, total sobre 100.

export const CATEGORIAS = [
  { id: 1, nombre: 'Básico', rango: '0 a 39' },
  { id: 2, nombre: 'Intermedio', rango: '40 a 59' },
  { id: 3, nombre: 'Avanzado', rango: '60 a 79' },
  { id: 4, nombre: 'Experto', rango: '80 a 99' },
  { id: 5, nombre: 'Líder', rango: '100' },
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export function categoria(total: number): Categoria {
  return CATEGORIAS[total >= 100 ? 4 : total >= 80 ? 3 : total >= 60 ? 2 : total >= 40 ? 1 : 0];
}

export const AGRUPAMIENTOS = [
  { id: 'FG', nombre: 'Funcionario de Gobierno' },
  { id: 'ADM', nombre: 'Administrativo' },
  { id: 'PRO', nombre: 'Profesional' },
  { id: 'TEC', nombre: 'Técnico' },
  { id: 'MYP', nombre: 'Mantenimiento y Producción' },
  { id: 'SG', nombre: 'Servicios Generales' },
] as const;

export type AgrupamientoId = (typeof AGRUPAMIENTOS)[number]['id'];

export const nombreAgrupamiento = (id: string | null | undefined) =>
  AGRUPAMIENTOS.find((g) => g.id === id)?.nombre ?? 'Sin indicar';

export const sumar = (p: (number | null)[]) => p.reduce<number>((s, v) => s + (v ?? 0), 0);
export const respondidas = (p: (number | null)[]) => p.filter((v) => v != null).length;
