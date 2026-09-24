// TEST-ONLY stand-in for Supabase: minimal GoTrue-compatible auth + /rest/v1 proxy to PostgREST.
import http from 'node:http'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'
const PGRST = 'http://127.0.0.1:3001'
const b64u = (b) => Buffer.from(b).toString('base64url')
export function sign(payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const p = b64u(JSON.stringify(payload))
  const s = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')
  return `${h}.${p}.${s}`
}
function verify(tok) {
  const [h, p, s] = tok.split('.')
  const exp = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')
  if (exp !== s) return null
  const pl = JSON.parse(Buffer.from(p, 'base64url'))
  if (pl.exp && pl.exp < Date.now() / 1000) return null
  return pl
}
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'app', '-At', '-c', q]).toString().trim()
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const hash = (pw) => crypto.createHash('sha256').update(pw).digest('hex')
const refresh = new Map()
const TTL = Number(process.env.TTL || 3600)

function userObj(row) {
  return { id: row.id, aud: 'authenticated', role: 'authenticated', email: row.email, email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email' }, user_metadata: row.meta || {}, identities: [], created_at: row.created_at, updated_at: new Date().toISOString() }
}
function getUser(where) {
  const r = sql(`select json_build_object('id',id,'email',email,'pw',encrypted_password,'meta',raw_user_meta_data,'created_at',created_at) from auth.users where ${where}`)
  return r ? JSON.parse(r) : null
}
function session(u) {
  const now = Math.floor(Date.now() / 1000)
  const access = sign({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, exp: now + TTL, iat: now, session_id: crypto.randomUUID() })
  const rt = crypto.randomBytes(16).toString('hex')
  refresh.set(rt, u.id)
  return { access_token: access, token_type: 'bearer', expires_in: TTL, expires_at: now + TTL, refresh_token: rt, user: userObj(u) }
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range, x-supabase-api-version',
}
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', ...cors }); res.end(obj === undefined ? '' : JSON.stringify(obj)) }
const body = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)) })

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
  const url = new URL(req.url, 'http://x')
  const raw = await body(req)
  if (process.env.OFFLINE_FLAG && (await import('node:fs')).existsSync(process.env.OFFLINE_FLAG)) { req.socket.destroy(); return }
  try {
    if (url.pathname.startsWith('/rest/v1/')) {
      const headers = { ...req.headers }
      delete headers.host; delete headers['content-length']
      const r = await fetch(PGRST + url.pathname.slice(8) + url.search, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw })
      const out = Buffer.from(await r.arrayBuffer())
      const h = { ...cors }
      r.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k)) h[k] = v })
      res.writeHead(r.status, h); return res.end(out)
    }
    const j = raw ? JSON.parse(raw) : {}
    const auth = (req.headers.authorization || '').replace(/^Bearer /i, '')
    if (url.pathname === '/auth/v1/signup') {
      if (getUser(`lower(email)=lower(${lit(j.email)})`)) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' })
      sql(`insert into auth.users(email, encrypted_password, raw_user_meta_data) values (${lit(j.email.toLowerCase())}, ${lit(hash(j.password))}, ${lit(JSON.stringify(j.data || {}))}::jsonb)`)
      return send(res, 200, session(getUser(`email=${lit(j.email.toLowerCase())}`)))
    }
    if (url.pathname === '/auth/v1/token') {
      const gt = url.searchParams.get('grant_type')
      if (gt === 'password') {
        const u = getUser(`lower(email)=lower(${lit(j.email)})`)
        if (!u || u.pw !== hash(j.password)) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
        return send(res, 200, session(u))
      }
      if (gt === 'refresh_token') {
        const id = refresh.get(j.refresh_token)
        if (!id) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
        refresh.delete(j.refresh_token)
        return send(res, 200, session(getUser(`id=${lit(id)}`)))
      }
    }
    if (url.pathname === '/auth/v1/user') {
      const pl = verify(auth)
      if (!pl?.sub) return send(res, 401, { code: 401, msg: 'invalid JWT' })
      if (req.method === 'PUT') {
        if (j.data) sql(`update auth.users set raw_user_meta_data = raw_user_meta_data || ${lit(JSON.stringify(j.data))}::jsonb where id=${lit(pl.sub)}`)
        if (j.password) sql(`update auth.users set encrypted_password=${lit(hash(j.password))} where id=${lit(pl.sub)}`)
      }
      return send(res, 200, userObj(getUser(`id=${lit(pl.sub)}`)))
    }
    if (url.pathname === '/auth/v1/logout') return send(res, 204)
    if (url.pathname === '/auth/v1/recover') return send(res, 200, {})
    send(res, 404, { msg: 'not found ' + url.pathname })
  } catch (e) {
    console.error(e); send(res, 500, { msg: String(e) })
  }
}).listen(54321, () => {
  console.log('gateway on 54321')
  console.log('ANON', sign({ role: 'anon', iss: 'supabase-test', iat: 1700000000, exp: 2000000000 }))
})
