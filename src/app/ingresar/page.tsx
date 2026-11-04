import { redirect } from 'next/navigation';
import { Migue } from '@/components/Migue';
import { leerConfig } from '@/lib/cidituc';
import { MAIL_CH } from '@/lib/contacto';
import { usuarioActual } from '@/lib/sesion';
import { FormIngreso } from './FormIngreso';

const ERRORES: Record<string, string> = {
  enlace: 'El enlace venció o ya se usó. Pedí uno nuevo.',
  'no-habilitado': `Tu cuenta no está habilitada. Pedile a la Dirección de Capital Humano (${MAIL_CH}) que te dé de alta.`,
  'cidituc-estado': 'El ingreso tardó demasiado o se abrió en otra pestaña. Probá de nuevo.',
  'cidituc-token': 'CiDiTuc no confirmó tu ingreso. Probá de nuevo.',
  'cidituc-validacion': 'No pudimos comunicarnos con CiDiTuc. Probá de nuevo en unos minutos.',
  'cidituc-admin': 'La cuenta de administración entra con mail y contraseña.',
  'cidituc-servidor': 'No pudimos abrir tu sesión. Probá de nuevo en unos minutos.',
  'cidituc-config': 'El ingreso con CiDiTuc todavía no está disponible.',
};

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await usuarioActual()) redirect('/');
  const { error } = await searchParams;
  const cidituc = !!leerConfig();
  const mensaje = error ? ERRORES[error] : undefined;

  return (
    <div className="ingreso">
      <section className="card">
        <p className="eyebrow sun">Dirección de Capital Humano</p>
        <h1>Evaluación de Desempeño</h1>
        {mensaje && <p className="error-msg" role="alert">{mensaje}</p>}
        {cidituc ? (
          <>
            <p className="sub">
              Ingresá con tu cuenta CiDiTuc, con tu CUIL y tu clave. Solo pueden evaluar los directores y secretarios
              habilitados por Capital Humano.
            </p>
            <a className="btn primary btn-cidituc" href="/auth/cidituc/login">Ingresar con CiDiTuc</a>
            <details className="otro-ingreso">
              <summary>Ingreso con mail y contraseña (Capital Humano)</summary>
              <FormIngreso />
            </details>
          </>
        ) : (
          <>
            <p className="sub">
              Ingresá con tu mail institucional y tu contraseña. Solo pueden ingresar los directores evaluadores y el equipo
              de Capital Humano.
            </p>
            <FormIngreso />
          </>
        )}
      </section>
      <figure className="home-migue" style={{ margin: 0 }}>
        <Migue alt="Migue con una lapicera y un cuaderno" />
        <figcaption>Hola, soy Migue. Te acompaño en la evaluación de tu equipo.</figcaption>
      </figure>
    </div>
  );
}
