import { useState } from 'react';
import { GuideDogIllustration, type GuideDogCoat } from '../components/GuideDogIllustration';
import { ApiError } from '../lib/api';
import { createAccount, login } from '../lib/auth';

export function Login({ coat }: { coat: GuideDogCoat }) {
  const [mode, setMode] = useState<'login' | 'create'>('login');
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(name.trim(), passcode);
      } else {
        await createAccount(name.trim(), passcode);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <GuideDogIllustration coat={coat} className="mx-auto h-12 w-16" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Tanzer Training Tracker
          </h1>
          <p className="text-sm text-gray-500">
            {mode === 'login' ? 'Log in as an instructor' : 'Create your instructor account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2"
              placeholder="e.g. Abby"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Passcode
            </label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              required
              minLength={4}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2"
              placeholder={mode === 'create' ? 'At least 4 characters' : 'Your passcode'}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'create' : 'login');
            setError(null);
          }}
          className="w-full text-center text-sm text-sky-500 hover:underline"
        >
          {mode === 'login' ? 'New instructor? Create an account' : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
}
