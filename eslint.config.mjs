import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Proceso principal de Electron, hooks de electron-builder y scripts de Node: son CommonJS (package.json no declara
  // "type": "module"), así que `require` es la forma correcta de importar ahí.
  {
    files: ["electron/**/*.js", "scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Salidas de build que no son código fuente.
  globalIgnores(["desktop-build/**", "release/**", "dist/**", "graphify-out/**", "coverage/**", ".stryker-tmp/**", "reports/**", "playwright-report/**", "test-results/**"]),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
