import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/Logo';
import { Button, Card, Field, Input } from '../components/ui';

export function AuthScreen({ mode }: { mode: 'login' | 'setup' }) {
  const { login, setup } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSetup = mode === 'setup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isSetup) await setup(username, password);
      else await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-3 text-xl font-semibold text-slate-50">AI Orchestrator</h1>
          <p className="text-sm text-slate-400">
            {isSetup ? 'Create the first admin account' : 'Sign in to the control panel'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Username">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              minLength={3}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              required
              minLength={12}
            />
          </Field>
          {isSetup ? <p className="text-xs text-slate-500">Use at least 12 characters.</p> : null}
          {error ? (
            <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-sm text-rose-300">{error}</p>
          ) : null}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Please wait…' : isSetup ? 'Create account' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
