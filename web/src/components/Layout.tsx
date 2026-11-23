import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { homeFor, useAuth } from '../lib/auth';
import type { Role } from '../lib/types';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-1.5 sm:gap-2" aria-label="EntradasYa, ir a la cartelera">
      <svg viewBox="0 0 64 64" className="size-7 min-[380px]:size-8" aria-hidden="true">
        <path fill="currentColor" d="M8 14h48v12a6 6 0 0 0 0 12v12H8V38a6 6 0 0 0 0-12z" />
        <path stroke="var(--color-ambar)" strokeWidth="3" strokeDasharray="3 4" d="M40 16v32" />
      </svg>
      <span className="font-display text-lg font-extrabold tracking-tight min-[380px]:text-xl">EntradasYa</span>
    </Link>
  );
}

const LINKS: Record<Role | 'GUEST', { to: string; label: string }[]> = {
  GUEST: [{ to: '/', label: 'Cartelera' }],
  CUSTOMER: [
    { to: '/', label: 'Cartelera' },
    { to: '/mis-entradas', label: 'Mis entradas' },
    { to: '/mis-compras', label: 'Mis compras' },
  ],
  ORGANIZER: [
    { to: '/organizador', label: 'Mis eventos' },
    { to: '/organizador/personal', label: 'Porteros' },
    { to: '/', label: 'Cartelera' },
  ],
  DOORMAN: [{ to: '/portero', label: 'Control de ingreso' }],
};

export function Layout() {
  const { user, logout } = useAuth();
  const links = LINKS[user?.role ?? 'GUEST'];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-linea bg-papel/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-3 min-[380px]:px-4 sm:gap-6 sm:px-6">
          <Logo />
          <nav className="hidden gap-1 sm:flex" aria-label="Principal">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-[0.95rem] font-medium ${isActive ? 'bg-tinta text-white' : 'text-tinta-suave hover:text-tinta'}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap text-sm sm:gap-3 sm:text-[0.95rem]">
            {user ? (
              <>
                <span className="hidden text-tinta-suave md:inline">{user.name}</span>
                <button onClick={logout} className="rounded-full px-3 py-1.5 font-medium text-tinta hover:bg-tinta/5">
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="rounded-full px-2 py-1.5 font-medium hover:bg-tinta/5 sm:px-3">
                  <span className="sm:hidden">Entrar</span>
                  <span className="hidden sm:inline">Iniciar sesión</span>
                </Link>
                <Link to="/registro" className="rounded-full bg-tinta px-3 py-1.5 font-semibold text-white hover:bg-tinta/90 sm:px-4">
                  <span className="sm:hidden">Registrarme</span>
                  <span className="hidden sm:inline">Crear cuenta</span>
                </Link>
              </>
            )}
          </div>
        </div>
        {/* Navegación móvil */}
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 sm:hidden" aria-label="Principal móvil">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end
              className={({ isActive }) =>
                `shrink-0 rounded-full px-3 py-1 text-sm font-medium ${isActive ? 'bg-tinta text-white' : 'text-tinta-suave ring-1 ring-linea'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-sm text-tinta-suave sm:px-6">
        <Link to="/estado" className="hover:text-tinta hover:underline">
          Estado del sistema
        </Link>
      </footer>
    </div>
  );
}

/** Protege rutas por rol. Sin sesión -> login (y vuelve después). */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={`/login?volver=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
