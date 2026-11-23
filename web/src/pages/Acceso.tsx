import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Alert, Button, Field } from '../components/ui';
import { homeFor, useAuth } from '../lib/auth';
import { errorText } from '../lib/messages';

function useReturnTo() {
  const [params] = useSearchParams();
  const v = params.get('volver');
  return v && v.startsWith('/') && !v.startsWith('//') ? v : null;
}

function Shell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[26rem] pt-2 sm:pt-8">
      <div className="rounded-2xl border border-linea bg-white p-6 shadow-elevada sm:p-8">
        <h1 className="text-3xl">{title}</h1>
        <p className="mt-1.5 mb-7 text-tinta-suave">{subtitle}</p>
        {children}
      </div>
      <p className="mt-6 text-center text-tinta-suave">{footer}</p>
    </div>
  );
}

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const volver = useReturnTo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={volver ?? homeFor(user.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const u = await login(email, password);
      navigate(volver ?? homeFor(u.role), { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell
      title="Inicia sesión"
      subtitle="Para comprar entradas y ver las que ya tienes."
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <Link className="font-medium text-tinta underline underline-offset-2" to={`/registro${volver ? `?volver=${encodeURIComponent(volver)}` : ''}`}>
            Crea una
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Correo" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" loading={loading} className="w-full">
          Iniciar sesión
        </Button>
      </form>
    </Shell>
  );
}

export function Registro() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const volver = useReturnTo();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={volver ?? homeFor(user.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      navigate(volver ?? '/', { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell
      title="Crea tu cuenta"
      subtitle="Es gratis y solo te pide tres datos."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link className="font-medium text-tinta underline underline-offset-2" to={`/login${volver ? `?volver=${encodeURIComponent(volver)}` : ''}`}>
            Inicia sesión
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre" autoComplete="name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} hint="Aparece en tus entradas." />
        <Field label="Correo" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} hint="Ahí te llega la confirmación de compra." />
        <Field label="Contraseña" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint="Mínimo 8 caracteres." />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" loading={loading} className="w-full">
          Crear cuenta
        </Button>
      </form>
    </Shell>
  );
}
