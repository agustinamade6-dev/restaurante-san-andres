import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  output: "standalone",
  // Versión de package.json disponible en las pantallas (p. ej. el inicio). Se fija al compilar, así el número que
  // ve el usuario siempre coincide con el del instalador.
  env: { NEXT_PUBLIC_APP_VERSION: packageJson.version },
  images: { unoptimized: true },
  // El rastreo de archivos del build standalone no puede saber qué lee process.cwd() (p. ej. la carpeta de
  // uploads) y copiaba todo el proyecto, incluidas las salidas del empaquetado: cada build metía el
  // desktop-build anterior dentro del nuevo y el instalador crecía en cada armado.
  outputFileTracingExcludes: {
    "/*": [
      "./desktop-build/**/*",
      "./release/**/*",
    ],
  },
};

export default nextConfig;
