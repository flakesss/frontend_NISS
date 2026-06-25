// ── API Client ──────────────────────────────────────────────────────────────
// Semua panggilan ke backend Express (http://localhost:3000) melalui proxy Vite
// sehingga tidak ada masalah CORS saat development.

const BASE = '/api'

async function get(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`)
  return res.json()
}

// ── Health ───────────────────────────────────────────────────────────────────
export const checkHealth  = () => get('/')

// ── Devices ──────────────────────────────────────────────────────────────────
export const getDevices   = () => get('/devices')
export const getDevice    = (id) => get(`/devices/${id}`)

// ── Events (in-memory, real-time) ────────────────────────────────────────────
export const getEvents    = () => get('/events')

// ── Recordings (Supabase DB) ─────────────────────────────────────────────────
export const getRecordings     = () => get('/recordings')
export const getRecordingUrl   = (id) => get(`/recordings/${id}/url`)

// URL streaming langsung melalui backend proxy (tidak perlu async, langsung pakai sebagai src)
// Backend meneruskan video dari Supabase + mendukung Range request untuk seek
export const getStreamUrl = (id) => `/api/recordings/${id}/stream`

// ── Commands ─────────────────────────────────────────────────────────────────
export const sendCommand = (deviceId, cmd) =>
  post(`/devices/${deviceId}/command`, { cmd })
