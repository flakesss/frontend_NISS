// ── API Client ──────────────────────────────────────────────────────────────
// Dev  : VITE_API_URL tidak di-set → pakai /api → Vite proxy → localhost:3000
// Prod : VITE_API_URL=https://petal-calibrate-stadium.ngrok-free.dev → Pi langsung

const API_URL = import.meta.env.VITE_API_URL || ''
const BASE    = API_URL ? API_URL : '/api'

// ngrok memblokir request browser tanpa header ini
const NGROK_HEADERS = API_URL ? { 'ngrok-skip-browser-warning': '1' } : {}

async function get(path) {
  const res = await fetch(BASE + path, { headers: NGROK_HEADERS })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...NGROK_HEADERS },
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

// URL streaming & thumbnail — langsung ke backend Pi (bukan lewat Vite proxy)
export const getStreamUrl    = (id) => `${BASE}/recordings/${id}/stream`
export const getThumbnailUrl = (id) => `${BASE}/recordings/${id}/thumbnail`

// URL live stream MJPEG dari Pi
export const LIVE_STREAM_URL = `${BASE}/stream/live`

// ── Commands ─────────────────────────────────────────────────────────────────
export const sendCommand = (deviceId, cmd) =>
  post(`/devices/${deviceId}/command`, { cmd })
