# Testes (referência)

Usados durante o desenvolvimento da v2 contra um backend local que imita o Supabase:

1. Postgres 16 na porta 54322 → `psql -f bootstrap.sql` e depois `psql -f ../supabase/schema.sql` (banco `app`).
2. `rls_test.sql` → testa as políticas de segurança (dono / editor / viewer).
3. PostgREST 12 com `pgrst.conf` (porta 3001).
4. `node gateway.mjs` → auth mínima + proxy em http://localhost:54321 (imprime a chave "ANON" de teste).
   `TTL=100` encurta a validade do token (usado em `expiry.mjs`); `OFFLINE_FLAG=<arquivo>` simula servidor fora do ar.
5. App compilado servido em http://localhost:8080 com `config.js` apontando para o gateway (`reset.sh` faz isso).
6. `node e2e.mjs`, `expiry.mjs`, `recovery.mjs`, `ipad.mjs` (Playwright).

Os caminhos (/tmp/claude-0/..., /var/lib/...) são do ambiente Linux original — ajuste antes de rodar.
Alternativa: `npx supabase start` (Supabase CLI + Docker) e apontar o `config.js` para ele.
