import { redirect } from 'next/navigation';
import { Migue } from '@/components/Migue';
import { datosPortal } from '@/lib/ingreso-cidituc';
import { cancelarPortal, confirmarPortal } from '../actions';

// "LUISA DEL CARMEN" → "Luisa del Carmen"
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
const nombrePropio = (s: string) =>
  s.toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');

// Entrada desde el portal de CiDiTuc: CiDiTuc ya dijo quién es la persona. Antes de abrir la sesión
// confirma que es ella (el portal no manda el state que protege el ingreso desde este sistema).
export default async function ConfirmarPortal() {
  const datos = await datosPortal();
  if (!datos) redirect('/ingresar?error=cidituc-estado');
  const nombre = nombrePropio(`${datos.nombre} ${datos.apellido}`) || 'tu cuenta CiDiTuc';

  return (
    <div className="ingreso">
      <section className="card">
        <p className="eyebrow sun">Ingreso con CiDiTuc</p>
        <h1>Vas a entrar como {nombre}</h1>
        <p className="sub">
          Llegaste desde tu cuenta CiDiTuc. Confirmá que sos vos para entrar a la Evaluación de Desempeño.
        </p>
        <form action={confirmarPortal}>
          <button className="btn primary btn-cidituc">Entrar como {nombre.split(' ')[0]}</button>
        </form>
        <form action={cancelarPortal}>
          <button className="btn ghost" style={{ justifySelf: 'start' }}>No soy yo</button>
        </form>
      </section>
      <figure className="home-migue" style={{ margin: 0 }}>
        <Migue alt="Migue saludando" />
        <figcaption>Si no sos vos, tocá «No soy yo» y entrá con tu propio CiDiTuc.</figcaption>
      </figure>
    </div>
  );
}
