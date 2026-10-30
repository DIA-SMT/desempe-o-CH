import Image from 'next/image';

// El tamaño lo define el CSS de cada contexto (.ingreso, .done-card, .vacio)
export function Migue({ alt = '' }: { alt?: string }) {
  return (
    <div className="migue">
      <Image src="/migue.jpeg" alt={alt} width={400} height={400} />
    </div>
  );
}
