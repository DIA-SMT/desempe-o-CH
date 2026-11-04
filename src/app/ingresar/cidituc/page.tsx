import { redirect } from 'next/navigation';
import { Migue } from '@/components/Migue';
import { datosVincular } from '@/lib/ingreso-cidituc';
import { FormVincular } from './FormVincular';

// Primer ingreso con CiDiTuc: CiDiTuc ya verificó quién es la persona; falta saber qué legajo es suyo
export default async function VincularCidituc() {
  const datos = await datosVincular();
  if (!datos) redirect('/ingresar?error=cidituc-estado');

  return (
    <div className="ingreso">
      <section className="card">
        <p className="eyebrow sun">Primer ingreso con CiDiTuc</p>
        <h1>Hola, {datos.nombre.split(' ')[0] || 'bienvenido/a'}</h1>
        <p className="sub">
          Para encontrar tu cuenta, ingresá tu número de legajo. Lo pedimos una sola vez: la próxima vez entrás directo con
          CiDiTuc.
        </p>
        <FormVincular />
      </section>
      <figure className="home-migue" style={{ margin: 0 }}>
        <Migue alt="Migue con una lapicera y un cuaderno" />
        <figcaption>Tu legajo figura en tu recibo de sueldo.</figcaption>
      </figure>
    </div>
  );
}
