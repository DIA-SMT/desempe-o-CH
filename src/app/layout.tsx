import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { Asistente } from '@/components/Asistente';
import { Aviso } from '@/components/Aviso';
import type { Tema } from '@/components/BotonTema';
import { Encabezado, Pie } from '@/components/Encabezado';
import { Tooltips } from '@/components/Tooltips';
import { usuarioActual } from '@/lib/sesion';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Evaluación de Desempeño',
  description: 'Evaluación de desempeño del personal municipal. Dirección de Capital Humano, Municipalidad de San Miguel de Tucumán.',
  icons: { icon: '/cimba-192.png', apple: '/cimba-192.png' },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();
  // Modo día por defecto; noche solo si la persona lo eligió (cookie del botón del encabezado)
  const tema: Tema = (await cookies()).get('tema')?.value === 'oscuro' ? 'oscuro' : 'claro';
  return (
    <html lang="es" className={poppins.variable} data-theme={tema === 'oscuro' ? 'dark' : 'light'}>
      <body>
        <Encabezado usuario={usuario} tema={tema} />
        <main className="wrap">{children}</main>
        <Pie />
        <Tooltips />
        {usuario && <Asistente />}
        <Suspense>
          <Aviso />
        </Suspense>
      </body>
    </html>
  );
}
