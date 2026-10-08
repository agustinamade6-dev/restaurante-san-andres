import Image from 'next/image';

/**
 * Marca de agua del comercio: la taza del logo en dorado, grande, centrada en la pantalla y casi transparente.
 * public/logo-taza-dorada.png (646 × 800) es la taza recortada del logo original, con fondo transparente y el color
 * ya aplicado en la imagen (no con filtros CSS, que cambian según el equipo).
 *
 * Va DETRÁS del contenido: el contenedor de la pantalla tiene que llevar `isolate` (contexto de apilamiento propio)
 * para que el -z-10 lo deje sobre el fondo de la pantalla pero debajo de todo lo demás. Encima del contenido
 * aclararía los textos y bajaría su contraste. No recibe clics ni lo anuncian los lectores de pantalla.
 */
export default function MarcaDeAgua() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center">
      <Image
        src="/logo-taza-dorada.png"
        alt=""
        width={646}
        height={800}
        priority
        className="h-[min(85vh,90vw)] w-auto opacity-[0.22] select-none"
      />
    </div>
  );
}
