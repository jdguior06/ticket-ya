import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router';
import { Layout, RequireRole } from './components/Layout';
import { Login, Registro } from './pages/Acceso';
import { Cartelera } from './pages/Cartelera';
import { EventoDetalle } from './pages/EventoDetalle';
import { MisCompras } from './pages/MisCompras';
import { MisEntradas } from './pages/MisEntradas';
import { EventoForm } from './pages/org/EventoForm';
import { MisEventos } from './pages/org/MisEventos';
import { Personal } from './pages/org/Personal';
import { Ventas } from './pages/org/Ventas';
import { Loading } from './components/ui';

// El escáner (@zxing) pesa: solo lo descarga el portero.
const Portero = lazy(() => import('./pages/portero/Portero').then((m) => ({ default: m.Portero })));

function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-4xl font-extrabold">Esta página no existe</h1>
      <Link to="/" className="mt-4 inline-block font-semibold underline">
        Volver a la cartelera
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Cartelera />} />
        <Route path="eventos/:id" element={<EventoDetalle />} />
        <Route path="login" element={<Login />} />
        <Route path="registro" element={<Registro />} />

        <Route element={<RequireRole roles={['CUSTOMER']} />}>
          <Route path="mis-entradas" element={<MisEntradas />} />
          <Route path="mis-compras" element={<MisCompras />} />
        </Route>

        <Route element={<RequireRole roles={['ORGANIZER']} />}>
          <Route path="organizador" element={<MisEventos />} />
          <Route path="organizador/eventos/nuevo" element={<EventoForm />} />
          <Route path="organizador/eventos/:id" element={<EventoForm key="edit" />} />
          <Route path="organizador/eventos/:id/ventas" element={<Ventas />} />
          <Route path="organizador/personal" element={<Personal />} />
        </Route>

        <Route element={<RequireRole roles={['DOORMAN']} />}>
          <Route
            path="portero"
            element={
              <Suspense fallback={<Loading />}>
                <Portero />
              </Suspense>
            }
          />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
