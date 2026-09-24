set -e
cd /home/claude/boletim && npx vite build >/dev/null 2>&1
rm -rf /var/lib/apptest/assets && cp -r dist/* /var/lib/apptest/
ANON=$(grep ANON /tmp/claude-0/stack/gw.log | cut -d' ' -f2)
echo "window.APP_CONFIG = { SUPABASE_URL: 'http://localhost:54321', SUPABASE_ANON_KEY: '$ANON' }" > /var/lib/apptest/config.js
psql -h 127.0.0.1 -p 54322 -U postgres -d app -qc "delete from auth.users" 
rm -f /tmp/claude-0/stack/offline.flag
