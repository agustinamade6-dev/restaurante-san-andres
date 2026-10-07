import Image from 'next/image';

/**
 * Logo del comercio (public/logo.png, 864 × 274). El original tiene fondo blanco y la app es oscura:
 * se muestra sobre una placa blanca redondeada para que se lea y se vea intencional.
 * `alto` es la altura del logo en píxeles; el ancho sale de la proporción.
 */
export default function Logo({ alto = 40, className = '' }: { alto?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center bg-white rounded-xl px-2.5 py-1 shadow-sm shrink-0 ${className}`}>
      <Image
        src="/logo.png"
        alt="AKROS Café"
        width={864}
        height={274}
        priority
        style={{ height: alto, width: 'auto' }}
      />
    </span>
  );
}
