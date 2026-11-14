import { useState } from 'react';
import './Login.css';
import { ApiError } from '../lib/api';
import { createAccount, login } from '../lib/auth';
import { hasMemorySyncRecovery } from '../data/store';
import { hasMemoryDraftRecovery } from '../lib/newLogDraft';

export function Login() {
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
    <div className="instructor-login">
      <div className="instructor-login__sheet">
        <header>
          <h1><img src={`${import.meta.env.BASE_URL}tanzer-wordmark.webp`} alt="Tanzer Training Tracker" /></h1>
          <h2>{mode === 'login' ? 'Instructor sign-in' : 'Create your instructor account'}</h2>
        </header>

        {(hasMemorySyncRecovery() || hasMemoryDraftRecovery()) && <p role="status" className="rounded-md border border-amber-500 p-3 text-sm">
          Some changes are held only in this open page. Keep it open and log back in to the same instructor account to recover them. Closing or reloading can lose changes that were not stored on this device.
        </p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="instructor-name">
              Name
            </label>
            <input
              id="instructor-name"
              autoComplete="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="instructor-passcode">
              Passcode
            </label>
            <input
              id="instructor-passcode"
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              required
              minLength={4}
              placeholder={mode === 'create' ? 'At least 4 characters' : 'Your passcode'}
            />
          </div>

          {error && <p role="alert" className="instructor-login__error">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'create' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? 'New instructor? Create an account' : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
}
