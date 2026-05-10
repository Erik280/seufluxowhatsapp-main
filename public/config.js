/**
 * Runtime config — substituído pelo entrypoint do container em produção.
 * Em dev local, edite estes valores diretamente.
 */
window.__CONFIG__ = {
  SUPABASE_URL: "__SUPABASE_URL__",
  SUPABASE_ANON_KEY: "__SUPABASE_ANON_KEY__",
  API_BASE_URL: "__API_BASE_URL__",
};
