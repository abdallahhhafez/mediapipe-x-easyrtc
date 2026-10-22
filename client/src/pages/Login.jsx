import { useState } from 'react';
import { useAuth } from '../store/auth';
import { Button, Card, ErrorNote, Field, Input } from '../components/ui';
import Brand from '../components/Brand';

const DEMO = [
  { label: 'Nurse station', email: 'nurse@vitalwatch.test' },
  { label: 'Patient kiosk', email: 'patient1@vitalwatch.test' },
];

export default function Login() {
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('nurse@vitalwatch.test');
  const [password, setPassword] = useState('vitalwatch');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Brand to="/login" />
        </div>

        <Card>
          <h1 className="text-xl font-extrabold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">
            Continuous monitoring for patients at home.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email">
              <Input
                type="email"
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <ErrorNote error={error} />
            <Button type="submit" loading={busy} className="w-full">
              Sign in
            </Button>
          </form>
        </Card>

        <div className="mt-4 flex justify-center gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              onClick={() => setEmail(d.email)}
              className="chip transition hover:bg-hairline"
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
