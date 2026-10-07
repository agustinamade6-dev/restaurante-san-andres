// Configuración por defecto de la app de escritorio y su migración. Módulo sin dependencias de Electron
// para poder probarlo con vitest.

const DEFAULT_CONFIG = {
  port: 3000,
  // true = acepta conexiones de tablets/comanderas en la red local (http://IP-de-esta-PC:3000).
  // Windows mostrará el aviso del firewall la primera vez.
  lan: false,
  // Datos que se imprimen en los tickets. Editar con los datos reales del comercio y reiniciar la app.
  negocio: {
    nombre: 'AKROS Café',
    cuit: '30-12345678-9',
    direccion: 'Calle y número, Ciudad',
  },
};

// Valores por defecto de versiones anteriores, que los config.json ya creados conservan.
const NEGOCIO_ANTERIOR = {
  nombre: 'Restaurante San Andrés',
  direccion: 'Av. San Martín 1234, San Andrés',
};

// Reemplaza solo los valores que siguen siendo los de ejemplo de antes; lo que el comercio editó no se toca.
// Devuelve { config, cambio } (config nuevo, sin mutar el recibido).
function migrarNegocio(config) {
  const negocio = config && typeof config.negocio === 'object' && config.negocio ? config.negocio : null;
  if (!negocio) return { config, cambio: false };
  const nuevo = { ...negocio };
  for (const campo of Object.keys(NEGOCIO_ANTERIOR)) {
    if (nuevo[campo] === NEGOCIO_ANTERIOR[campo]) nuevo[campo] = DEFAULT_CONFIG.negocio[campo];
  }
  const cambio = Object.keys(NEGOCIO_ANTERIOR).some((c) => nuevo[c] !== negocio[c]);
  return { config: cambio ? { ...config, negocio: nuevo } : config, cambio };
}

module.exports = { DEFAULT_CONFIG, NEGOCIO_ANTERIOR, migrarNegocio };
