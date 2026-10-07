import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
