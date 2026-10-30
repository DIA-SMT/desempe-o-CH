import Image from 'next/image';
import Link from 'next/link';
import { ROLES, type Usuario } from '@/lib/sesion';

export function Encabezado({ usuario }: { usuario: Usuario | null }) {
  return (
    <header className="top">
      <div className="wrap top-in">
        <Link href="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Image src="/cimba.png" alt="" width={31} height={36} priority />
          <span className="brand-t">
            <strong>Evaluación de Desempeño</strong>
            <span>Municipalidad de San Miguel de Tucumán · Capital Humano</span>
          </span>
        </Link>
        {usuario && (
          <div className="top-who">
            <span id="top-who">
              {usuario.nombre} · {ROLES[usuario.rol]}
            </span>
            <form action="/salir" method="post">
              <button className="btn sm" type="submit">
                Salir
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}

export function Pie() {
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <div className="foot-brand">
          <Image src="/cimba-blanco.png" alt="" width={35} height={40} />
          <div>
            <strong>Municipalidad de San Miguel de Tucumán</strong>
            <span>Dirección de Capital Humano</span>
          </div>
        </div>
        <p className="foot-note">Evaluación de Desempeño</p>
      </div>
    </footer>
  );
}
