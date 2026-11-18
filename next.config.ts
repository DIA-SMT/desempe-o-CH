import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: { position: 'bottom-left' }, // abajo a la derecha está Migue
  // Las pantallas de ingreso no se pueden mostrar dentro de otra página: nadie puede tapar el botón
  // «Entrar como…» con algo y hacer que la persona lo toque sin ver el nombre
  async headers() {
    const sinMarco = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
    ];
    return [{ source: '/ingresar/:ruta*', headers: sinMarco }, { source: '/ingresar', headers: sinMarco }];
  },
};

export default nextConfig;
