'use client';

import { useEffect, useRef } from 'react';
import type { Tip } from '@/lib/tip';

// Capa única de tooltips para gráficos: se activa con el puntero o el foco.
// Los textos se insertan con textContent.
export function Tooltips() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current!;
    const mostrar = (el: HTMLElement, x: number, y: number) => {
      let spec: Tip;
      try { spec = JSON.parse(el.dataset.tip!); } catch { return; }
      box.textContent = '';
      const t = document.createElement('div');
      t.className = 'tip-t';
      t.textContent = spec.title;
      box.appendChild(t);
      for (const r of spec.rows) {
        const row = document.createElement('div');
        row.className = 'tip-r';
        const i = document.createElement('i'); i.className = r.k; row.appendChild(i);
        const v = document.createElement('strong'); v.textContent = r.v; row.appendChild(v);
        const l = document.createElement('span'); l.textContent = r.l; row.appendChild(l);
        box.appendChild(row);
      }
      box.hidden = false;
      const w = box.offsetWidth, h = box.offsetHeight;
      let left = x + 14, top = y + 14;
      if (left + w > innerWidth - 8) left = x - w - 14;
      if (top + h > innerHeight - 8) top = y - h - 14;
      box.style.left = `${Math.max(8, left)}px`;
      box.style.top = `${Math.max(8, top)}px`;
    };
    const ocultar = () => { box.hidden = true; };
    const mover = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      if (el) mostrar(el, e.clientX, e.clientY); else ocultar();
    };
    const foco = (e: FocusEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      if (!el) return;
      const r = el.getBoundingClientRect();
      mostrar(el, r.left + r.width / 2, r.bottom);
    };
    document.addEventListener('pointermove', mover);
    document.addEventListener('focusin', foco);
    document.addEventListener('focusout', ocultar);
    document.addEventListener('scroll', ocultar, true);
    return () => {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('focusin', foco);
      document.removeEventListener('focusout', ocultar);
      document.removeEventListener('scroll', ocultar, true);
    };
  }, []);

  return <div className="tip" ref={ref} hidden />;
}
