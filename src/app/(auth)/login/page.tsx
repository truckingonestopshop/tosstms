'use client';

import React, { useState, useTransition } from 'react';
import { AuthShell, authButton, authInput, authLabel, authLabelText } from '@/components/auth/AuthShell';
import { signIn, sendReset, type AuthState } from './actions';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<AuthState>({});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await signIn(state, formData);
      if (res?.error) {
        setState(res);
      }
    });
  };

  const handleDemoSignIn = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append('email', 'dev@truckingonestopshop.net');
      formData.append('password', 'demo12345');
      formData.append('next', '/');
      await signIn(state, formData);
      router.push('/');
    });
  };

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Sign In</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Enter your invited credentials to access the dispatch board.
          </p>
        </div>

        <label className={authLabel}>
          <span className={authLabelText}>Work Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@truckingonestopshop.net"
            className={authInput}
          />
        </label>

        <label className={authLabel}>
          <div className="flex items-center justify-between">
            <span className={authLabelText}>Password</span>
          </div>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={authInput}
          />
        </label>

        {state.error && (
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {state.error}
          </div>
        )}

        {state.info && (
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
            {state.info}
          </div>
        )}

        <button type="submit" disabled={isPending} className={authButton}>
          {isPending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Signing in...
            </span>
          ) : (
            'Sign In to TOSS TMS'
          )}
        </button>

        <div className="pt-2">
          <button
            type="button"
            onClick={handleDemoSignIn}
            className="w-full text-center text-xs py-2 rounded-lg border border-white/10 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            Quick Team Sign-In (dev@truckingonestopshop.net)
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
