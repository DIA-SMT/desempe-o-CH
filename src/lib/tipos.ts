export interface FilaPadron {
  legajo: string;
  nombre: string;
  unidad_codigo: string;
  unidad_nombre: string;
  secretaria: string | null;
  evaluador_id: string | null;
}

export interface FilaEvaluacion {
  legajo: string;
  estado: 'borrador' | 'enviada';
  total: number;
  puntajes: (number | null)[];
  agrupamiento: string | null;
  evaluador_id: string | null;
  enviada_en: string | null;
  actualizada_en: string;
}

export interface FilaCompetencia {
  orden: number;
  tipo: 'G' | 'E';
  nombre: string;
  descripcion: string;
}
