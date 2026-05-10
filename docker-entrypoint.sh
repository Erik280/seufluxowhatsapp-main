#!/bin/sh
# ============================================================
# Entrypoint: injeta variáveis de ambiente no config.js
# em runtime — sem precisar rebuild.
# ============================================================

CONFIG_FILE="/usr/share/nginx/html/config.js"

# Substitui os placeholders com valores reais das env vars
sed -i "s|__SUPABASE_URL__|${VITE_SUPABASE_URL:-}|g" "$CONFIG_FILE"
sed -i "s|__SUPABASE_ANON_KEY__|${VITE_SUPABASE_ANON_KEY:-}|g" "$CONFIG_FILE"
sed -i "s|__API_BASE_URL__|${VITE_API_BASE_URL:-}|g" "$CONFIG_FILE"

echo "✅ config.js injetado com variáveis de ambiente"

# Inicia o Nginx
exec nginx -g "daemon off;"
