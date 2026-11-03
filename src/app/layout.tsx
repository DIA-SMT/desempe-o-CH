import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import { Suspense } from 'react';
import { Asistente } from '@/components/Asistente';
import { Aviso } from '@/components/Aviso';
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
  return (
    <html lang="es" className={poppins.variable}>
      <body>
        <Encabezado usuario={usuario} />
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
