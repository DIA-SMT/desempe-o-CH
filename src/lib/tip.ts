// Datos de tooltip que viajan en el atributo data-tip; los lee el componente Tooltips.
export interface TipFila { k: string; v: string; l: string }
export interface Tip { title: string; rows: TipFila[] }

export const tip = (t: Tip) => ({ 'data-tip': JSON.stringify(t) });
