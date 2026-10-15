import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://grvuqxxjjiebnxnwcmxu.supabase.co';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_HZoqU37P3tgB-GG_WYJHqA_6nuPBXJm';

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
