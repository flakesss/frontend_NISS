// ── API Client ──────────────────────────────────────────────────────────────
// Dev  : VITE_API_URL tidak di-set → pakai /api → Vite proxy → localhost:3000
// Prod : VITE_API_URL=https://<subdomain>.trycloudflare.com → Pi langsung (via Cloudflare Tunnel)

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const BASE    = API_URL ? API_URL : '/api'

// Header ini tidak diperlukan oleh Cloudflare Tunnel, disisakan kosong untuk kompatibilitas
export const NGROK_HEADERS = {}

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

// Snapshot URL — fallback polling frame (dipakai kalau MJPEG live gagal dimuat)
export const SNAPSHOT_URL = `${BASE}/stream/snapshot`

// Live URL — MJPEG asli dari Pi (lebih mulus/cepat dari polling snapshot)
export const LIVE_URL = `${BASE}/stream/live`

// Info resolusi & FPS asli kamera Pi (bukan angka statis di UI)
export const getStreamInfo = () => get('/stream/info')

// Snapshot Compressive Sensing (OMP+DCT) — payload belum direkonstruksi
// dikirim Pi→server, direkonstruksi jadi JPEG di service cs-reconstruct
export const SNAPSHOT_CS_URL = `${BASE}/stream/snapshot/cs`
export const getCsStats = () => get('/stream/cs-stats')

// ── Commands ─────────────────────────────────────────────────────────────────
export const sendCommand = (deviceId, cmd) =>
  post(`/devices/${deviceId}/command`, { cmd })

// Ubah MR (measurement rate) live-encode CS di Pi secara langsung (real-time,
// bukan simulasi) — dipakai oleh slider MR pada toggle "Mode: Compressive Sensing"
export const setCsMr = (deviceId, mrPercent) =>
  post(`/devices/${deviceId}/command`, { cmd: 'set_cs_mr', mr: mrPercent })

// ── Analisis faringitis on-demand ────────────────────────────────────────────
// imageBlob: Blob JPEG (mis. dari snapshot yang sedang ditampilkan)
export async function analyzePhoto(imageBlob) {
  const res = await fetch(BASE + '/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', ...NGROK_HEADERS },
    body: imageBlob,
  })
  if (!res.ok) throw new Error(`POST /analyze → ${res.status}`)
  return res.json()
}

// ── Info kompresi CS (toggle "Info Kompresi" pada modal galeri) ──────────────
// imageBlob: Blob JPEG (foto atau thumbnail video yang sedang dibuka di modal)
export async function getCsQuality(imageBlob, mrPercent) {
  const qs = mrPercent ? `?mr=${encodeURIComponent(mrPercent)}` : ''
  const res = await fetch(BASE + '/cs-quality' + qs, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', ...NGROK_HEADERS },
    body: imageBlob,
  })
  if (!res.ok) throw new Error(`POST /cs-quality → ${res.status}`)
  return res.json()
}
