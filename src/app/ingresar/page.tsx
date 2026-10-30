import { redirect } from 'next/navigation';
import { Migue } from '@/components/Migue';
import { usuarioActual } from '@/lib/sesion';
import { FormIngreso } from './FormIngreso';

const ERRORES: Record<string, string> = {
  enlace: 'El enlace venció o ya se usó. Pedí uno nuevo.',
  'no-habilitado': 'Tu mail no está habilitado. Pedile a la Dirección de Capital Humano que te dé de alta.',
};

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await usuarioActual()) redirect('/');
  const { error } = await searchParams;

  return (
    <div className="ingreso">
      <section className="card">
        <p className="eyebrow sun">Dirección de Capital Humano</p>
        <h1>Evaluación de Desempeño</h1>
        <p className="sub">
          Ingresá con tu mail institucional y tu contraseña. Solo pueden ingresar los directores evaluadores y el equipo
          de Capital Humano.
        </p>
        <FormIngreso errorInicial={error ? ERRORES[error] : undefined} />
      </section>
      <figure className="home-migue" style={{ margin: 0 }}>
        <Migue alt="Migue con una lapicera y un cuaderno" />
        <figcaption>Hola, soy Migue. Te acompaño en la evaluación de tu equipo.</figcaption>
      </figure>
    </div>
  );
}
