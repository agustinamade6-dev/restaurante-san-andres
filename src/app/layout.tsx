import type { Metadata } from "next";
import "./globals.css";
import DeteccionSesionVencida from "@/components/DeteccionSesionVencida";

export const metadata: Metadata = {
  title: "Restaurante San Andrés - Sistema de Gestión",
  description: "Sistema integral de gestión para Restaurante San Andrés: comandas, cocina y administración",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased min-h-screen">
        <DeteccionSesionVencida />
        {children}
      </body>
    </html>
  );
}
