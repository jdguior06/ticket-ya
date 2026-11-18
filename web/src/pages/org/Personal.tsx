import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Empty, Field, Loading, PageTitle } from '../../components/ui';
import { api } from '../../lib/api';
import { errorText } from '../../lib/messages';
import type { User } from '../../lib/types';

export function Personal() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [created, setCreated] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api<User[]>('/auth/users?role=DOORMAN').then(setUsers).catch((e) => setListError(errorText(e)));
  useEffect(() => {
    void load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setCreated('');
    setSaving(true);
    try {
      await api('/auth/users', { method: 'POST', body: { ...form, role: 'DOORMAN' } });
      setCreated(`Portero creado. Puede entrar con ${form.email} y la contraseña que definiste.`);
      setForm({ name: '', email: '', password: '' });
      void load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageTitle>Porteros</PageTitle>
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section>
          {listError && <Alert>{listError}</Alert>}
          {!users && !listError && <Loading />}
          {users && users.length === 0 && <Empty title="Aún no hay porteros">Crea una cuenta para quien escaneará las entradas en la puerta.</Empty>}
          {users && users.length > 0 && (
            <ul className="divide-y divide-linea rounded-2xl bg-white ring-1 ring-linea">
              {users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                  <span className="font-semibold">{u.name}</span>
                  <span className="text-tinta-suave">{u.email}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <form onSubmit={submit} className="space-y-4 self-start rounded-2xl bg-white p-6 ring-1 ring-linea">
          <h2 className="text-xl font-bold">Nuevo portero</h2>
          <Field label="Nombre" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label="Correo" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Field label="Contraseña" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint="Mínimo 8 caracteres. Compártela con el portero." />
          {error && <Alert>{error}</Alert>}
          {created && <Alert tone="ok">{created}</Alert>}
          <Button type="submit" loading={saving} className="w-full">
            Crear portero
          </Button>
        </form>
      </div>
    </>
  );
}
