/**
 * Datos del comercio que se imprimen en los tickets. Se configuran con variables de entorno
 * (NEGOCIO_NOMBRE, NEGOCIO_CUIT, NEGOCIO_DIRECCION); en la app de escritorio salen de la sección
 * "negocio" del config.json. Si falta alguna, se usa el valor de ejemplo de siempre.
 */
const POR_DEFECTO = {
  restaurante: 'Restaurante San Andrés',
  cuit: '30-12345678-9',
  direccion: 'Av. San Martín 1234, San Andrés',
};

export function datosNegocio() {
  return {
    restaurante: process.env.NEGOCIO_NOMBRE?.trim() || POR_DEFECTO.restaurante,
    cuit: process.env.NEGOCIO_CUIT?.trim() || POR_DEFECTO.cuit,
    direccion: process.env.NEGOCIO_DIRECCION?.trim() || POR_DEFECTO.direccion,
  };
}
