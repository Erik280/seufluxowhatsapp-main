/**
 * SeuFluxo WhatsApp — Supabase Client (Frontend)
 * Usa config.js injetado em runtime para funcionar sem rebuild.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Tipo para o config injetado pelo entrypoint
declare global {
  interface Window {
    __CONFIG__?: {
      SUPABASE_URL: string;
      SUPABASE_ANON_KEY: string;
      API_BASE_URL: string;
    };
  }
}

function getConfig() {
  const cfg = window.__CONFIG__;

  // Em dev local, tenta usar VITE_ env vars como fallback
  const supabaseUrl = cfg?.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith('__')
    ? cfg.SUPABASE_URL
    : import.meta.env.VITE_SUPABASE_URL || '';

  const supabaseAnonKey = cfg?.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith('__')
    ? cfg.SUPABASE_ANON_KEY
    : import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const apiBaseUrl = cfg?.API_BASE_URL && !cfg.API_BASE_URL.startsWith('__')
    ? cfg.API_BASE_URL
    : import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  return { supabaseUrl, supabaseAnonKey, apiBaseUrl };
}

const { supabaseUrl, supabaseAnonKey, apiBaseUrl } = getConfig();

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export const API_BASE_URL = apiBaseUrl;
