export const f1 = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const f0 = (n: number) => Math.round(n).toLocaleString('es-AR');
export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const promedio = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
