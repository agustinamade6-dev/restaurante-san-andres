'use client';

import Link from 'next/link';
import Logo from '@/components/Logo';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Package,
  Truck,
  DollarSign,
  ClipboardList,
  Users,
  LogOut,
  Wallet,
} from 'lucide-react';

const navItems = [
  {
    href: '/admin',
    label: 'Dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  { href: '/admin/caja', label: 'Caja', icon: Wallet },
  { href: '/admin/menu', label: 'Menú & Precios', icon: UtensilsCrossed },
  { href: '/admin/inventario', label: 'Inventario', icon: Package },
  { href: '/admin/proveedores', label: 'Proveedores', icon: Truck },
  { href: '/admin/costos', label: 'Costos', icon: DollarSign },
  { href: '/admin/historial', label: 'Historial', icon: ClipboardList },
  { href: '/admin/usuarios', label: 'Personal', icon: Users },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[var(--card)] border-r border-[var(--border)] flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-5 border-b border-[var(--border)]">
          <Link href="/" className="flex flex-col items-start gap-2 group">
            <Logo alto={60} />
            <p className="text-[10px] text-[var(--muted)] uppercase tracking-widest font-semibold">Panel de Admin</p>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Back to home / Logout */}
        <div className="p-3 border-t border-[var(--border)] flex flex-col gap-2">
          <button 
            onClick={async () => {
              // Aunque el servidor no responda, se vuelve al inicio (la cookie vence sola).
              await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
              window.location.href = '/';
            }}
            className="nav-link text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full text-left"
          >
            <LogOut className="w-5 h-5" />
            Bloquear Terminal
          </button>
        </div>
      </aside>

      {/* Main content */}
      {/* Zona con scroll propio: enfocable para poder desplazarla con el teclado. */}
      <main className="flex-1 overflow-y-auto p-6" tabIndex={0} aria-label="Contenido de administración">
        {children}
      </main>
    </div>
  );
}
