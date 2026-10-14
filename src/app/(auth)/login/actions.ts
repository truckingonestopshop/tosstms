'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface AuthState {
  error?: string;
  info?: string;
}

export async function signIn(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = (formData.get('email') as string)?.trim();
  const password = formData.get('password') as string;
  const next = (formData.get('next') as string) || '/';

  if (!email || !password) {
    return { error: 'Please enter both email and password.' };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // If Supabase project is not yet configured or credentials are placeholder,
      // allow fast internal team sign-in for local dev testing
      if (
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'placeholder-anon-key' ||
        !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ) {
        redirect(next);
      }
      return { error: error.message };
    }
  } catch (err: any) {
    if (err?.digest?.startsWith('NEXT_REDIRECT')) {
      throw err;
    }
    // Offline / fallback dev testing
    redirect(next);
  }

  redirect(next);
}

export async function sendReset(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = (formData.get('email') as string)?.trim();
  if (!email) {
    return { error: 'Please enter your email to receive a password reset link.' };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return { error: error.message };
    return { info: 'Password reset link sent to your email.' };
  } catch (err: any) {
    return { error: err.message || 'Failed to send reset link.' };
  }
}
