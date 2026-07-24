import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getDevice,
  getEvents,
  getRecordings,
  getStreamUrl,
  getThumbnailUrl,
  sendCommand,
  SNAPSHOT_URL,
  LIVE_URL,
  getStreamInfo,
  SNAPSHOT_CS_URL,
  getCsStats,
  NGROK_HEADERS,
  analyzePhoto,
  getCsQuality,
  setCsMr,
} from './api'

// ─── Konstanta visual (tidak berubah) ────────────────────────────────────────
const TAG_COLORS = {
  Normal:   ['#5BC079', 'rgba(91,192,121,.14)'],
  Moderate: ['#F5A623', 'rgba(245,166,35,.16)'],
  Risiko:   ['#EF4444', 'rgba(239,68,68,.14)'],
  Video:    ['#2A6FDB', 'rgba(42,111,219,.14)'],
  Foto:     ['#7A5AF5', 'rgba(122,90,245,.14)'],
}
const OVERLAY_COLORS = { Video: '#2A6FDB', Foto: '#7A5AF5' }

const THUMB_BG = [
  'radial-gradient(circle at 50% 42%,#d07a6a,#9c3f38 45%,#4a1614 80%,#1c0807)',
  'radial-gradient(circle at 40% 50%,#caa15a,#9c6f34 45%,#4a2e12 82%,#1c1206)',
  'radial-gradient(circle at 58% 38%,#c96a78,#8e3346 46%,#451221 82%,#1c0710)',
  'radial-gradient(circle at 46% 54%,#b87a6a,#8a463a 46%,#42201a 82%,#180a08)',
  'radial-gradient(circle at 52% 46%,#d4856e,#a84f3e 45%,#511f17 82%,#1e0a07)',
]

const DUR_HEIGHTS   = [40, 58, 34, 70, 52, 88, 46, 64, 100]
const PHOTO_HEIGHTS = [30, 52, 44, 38, 66, 48, 80, 58, 92]
const NAV_ITEMS     = ['Live', 'Riwayat', 'Database']

const ICON_MAP = {
  photo: ['#7A5AF5', 'rgba(122,90,245,.12)'],
  rec:   ['#2A6FDB', 'rgba(42,111,219,.12)'],
  ai:    ['#F5A623', 'rgba(245,166,35,.12)'],
}

function tagStyle(label) {
  const c = TAG_COLORS[label] || ['#8A8A8A', 'rgba(138,138,138,.14)']
  return { color: c[0], background: c[1], fontSize: '10px', fontWeight: 600, padding: '4px 9px', borderRadius: '7px', letterSpacing: '.03em', whiteSpace: 'nowrap' }
}
function overlayTagStyle(label) {
  return { position: 'absolute', top: '9px', left: '9px', color: '#fff', background: OVERLAY_COLORS[label] || '#161616', fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '7px', letterSpacing: '.04em', zIndex: 2 }
}
function fmtTime(n) {
  const s = Math.round(n)
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}
function timeAgo(isoString) {
  if (!isoString) return ''
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000)
  if (diff < 60)  return `${diff} dtk lalu`
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`
  return `${Math.floor(diff / 86400)} hari lalu`
}

// ─── Thumbnail galeri ─────────────────────────────────────────────────────────
function GalleryThumb({ item }) {
  const [loaded, setLoaded] = useState(false)
  const [error,  setError]  = useState(false)
  const thumbUrl = item.id ? getThumbnailUrl(item.id) : null

  return (
    <div style={{ position: 'relative', height: '110px', borderRadius: '14px', overflow: 'hidden', background: item.bg || '#111' }}>

      {/* Gradient placeholder — selalu ada, pudar saat gambar asli sudah muat */}
      <div style={{
        position: 'absolute', inset: 0,
        background: item.bg || '#111',
        transition: 'opacity .35s',
        opacity: (thumbUrl && loaded && !error) ? 0 : 1,
      }} />

      {/* Thumbnail asli (foto atau frame video) */}
      {thumbUrl && !error && (
        <img
          src={thumbUrl}
          alt={item.title}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            opacity: loaded ? 1 : 0,
            transition: 'opacity .35s',
          }}
        />
      )}

      {/* Vignette tipis agar overlay teks tetap terbaca */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.55) 0%, transparent 55%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 24px rgba(0,0,0,.35)', pointerEvents: 'none' }} />

      {/* Badge tipe (Video / Foto) */}
      <span style={overlayTagStyle(item.type)}>{item.type}</span>

      {/* Tombol play untuk video */}
      {item.isVideo && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,.35)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#161616"><path d="M8 5v14l11-7z"/></svg>
        </div>
      )}

      {/* Badge durasi / IMG */}
      <div style={{ position: 'absolute', bottom: '8px', right: '9px', fontSize: '10px', fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,.55)', padding: '2px 7px', borderRadius: '6px' }}>
        {item.dur}
      </div>
    </div>
  )
}

// ─── Komponen utama ───────────────────────────────────────────────────────────
export default function NISSDashboard({
  deviceId    = 'endoskop-01',
}) {
  // ── state device (dari backend) ──
  const [deviceInfo,  setDeviceInfo]  = useState(null)          // { status, lastSeen, … }
  const [online,      setOnline]      = useState(false)

  // ── state kontrol lokal ──
  const [recording,   setRecording]   = useState(false)
  const [elapsed,     setElapsed]     = useState(0)
  const [activeNav,   setActiveNav]   = useState('Live')
  const [streamOk,    setStreamOk]    = useState(false)
  const [frameUrl,    setFrameUrl]    = useState(null)
  const [streamMode,  setStreamMode]  = useState('mjpeg')  // 'mjpeg' (live asli) | 'polling' (fallback)
  const [streamInfo,  setStreamInfo]  = useState(null)     // { width, height, fps } — asli dari Pi
  const [measuredFps, setMeasuredFps] = useState(null)      // FPS terukur nyata saat mode polling
  const lastFrameTsRef = useRef(null)
  const [csMode,  setCsMode]  = useState(false)   // true → pakai Compressive Sensing (belum direkonstruksi di Pi)
  const [csStats, setCsStats] = useState(null)    // { bytesIn, bytesOut } — perbandingan ukuran payload CS vs JPEG
  const [liveMr,        setLiveMr]        = useState(100)  // MR (%) live-encode CS aktual di Pi
  const [liveMrSending,  setLiveMrSending] = useState(false)
  const liveMrInitRef = useRef(false)  // supaya nilai awal dari /info tidak menimpa slider setelah user ganti
  const [csCaptureEnabled, setCsCaptureEnabled] = useState(false)  // foto disimpan = hasil rekonstruksi CS (bukan JPEG mentah)
  const [csCaptureMr,      setCsCaptureMr]      = useState(70)     // MR dipakai sebelum tombol Foto ditekan
  const [analyzing,   setAnalyzing]   = useState(false)
  const [analysis,    setAnalysis]    = useState(null)   // { prediction, confidence, probabilities }
  const [analysisErr, setAnalysisErr] = useState(null)
  const [csQualityOpen, setCsQualityOpen] = useState(false)  // toggle panel "Info Kompresi" di modal galeri
  const [csQualityLoading, setCsQualityLoading] = useState(false)
  const [csQuality,    setCsQuality]    = useState(null)  // { csType, mrPercent, psnr, ssim, originalBytes, csPayloadBytes }
  const [csQualityErr, setCsQualityErr] = useState(null)
  const [csMrPercent,  setCsMrPercent]  = useState(100)  // MR (%) yang bisa diatur manual untuk simulasi Info Kompresi
  const csImageBlobRef = useRef(null)  // cache blob gambar supaya ganti MR tidak perlu fetch ulang
  const frameUrlRef = useRef(null)
  const [filterType,  setFilterType]  = useState('Semua') // filter Riwayat: Semua|Video|Foto

  // ── state data dari backend ──
  const [activities,  setActivities]  = useState([])
  const [recordings,  setRecordings]  = useState([])
  const [modalOpen,   setModalOpen]   = useState(false)
  const [modalItem,   setModalItem]   = useState({})
  const [modalUrl,    setModalUrl]    = useState(null)
  const [urlLoading,  setUrlLoading]  = useState(false)
  const [videoError,  setVideoError]  = useState(null)
  const [cmdLoading,  setCmdLoading]  = useState(false)
  const [cmdError,    setCmdError]    = useState(null)

  // Ref untuk blob URL video yang dibuat saat ngrok-mode — perlu di-revoke saat modal tutup
  const modalBlobRef = useRef(null)

  const recordingRef  = useRef(recording)
  recordingRef.current = recording

  // Refs untuk grace-period setelah kirim command —
  // mencegah polling paksa-reset state rekaman.
  const cmdSentAtRef = useRef(null)   // timestamp terakhir command dikirim
  const lastCmdRef   = useRef(null)   // nama command terakhir ('rekam'|'stop'|'foto')
  const GRACE_MS     = 12_000        // 12 detik grace period

  // ── Timer rekaman lokal ──
  useEffect(() => {
    const id = setInterval(() => {
      if (recordingRef.current) setElapsed(e => e + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Saat device online, coba MJPEG live dulu (lebih cepat dari polling) ──
  useEffect(() => {
    if (!online) { setStreamOk(false); return }
    setStreamMode(csMode ? 'polling' : 'mjpeg')
    setStreamOk(false)
    lastFrameTsRef.current = null
    setMeasuredFps(null)
  }, [online]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Info resolusi & FPS asli kamera Pi (bukan angka statis) ──
  useEffect(() => {
    if (!online) { setStreamInfo(null); return }
    let stopped = false
    const fetchInfo = async () => {
      try {
        const data = await getStreamInfo()
        if (!stopped) {
          setStreamInfo(data)
          if (!liveMrInitRef.current && typeof data.csMrPercent === 'number') {
            liveMrInitRef.current = true
            setLiveMr(data.csMrPercent)
          }
        }
      } catch { /* biarkan streamInfo lama / null, tidak kritikal */ }
    }
    fetchInfo()
    const id = setInterval(fetchInfo, 5000)
    return () => { stopped = true; clearInterval(id) }
  }, [online])

  // ── Mode Compressive Sensing dipaksa pakai polling (belum ada varian MJPEG) ──
  useEffect(() => {
    if (csMode) { setStreamMode('polling'); setStreamOk(false) }
    else if (online) { setStreamMode('mjpeg'); setStreamOk(false) }
  }, [csMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Statistik ukuran payload CS vs JPEG (dipoll tiap 3 detik saat mode CS aktif) ──
  useEffect(() => {
    if (!csMode || !online) { setCsStats(null); return }
    let stopped = false
    const fetchStats = async () => {
      try {
        const data = await getCsStats()
        if (!stopped) setCsStats(data.last)
      } catch { /* abaikan */ }
    }
    fetchStats()
    const id = setInterval(fetchStats, 3000)
    return () => { stopped = true; clearInterval(id) }
  }, [csMode, online])

  // ── Fallback: snapshot polling — dipakai kalau MJPEG live gagal dimuat, atau mode CS aktif ──
  useEffect(() => {
    if (!online || streamMode !== 'polling') return
    let stopped = false
    const snapshotUrl = csMode ? SNAPSHOT_CS_URL : SNAPSHOT_URL
    const poll = async () => {
      if (stopped) return
      try {
        const res = await fetch(`${snapshotUrl}?_=${Date.now()}`, { headers: NGROK_HEADERS })
        if (res.ok) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          setFrameUrl(prev => {
            if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current)
            frameUrlRef.current = url
            return url
          })
          // ukur FPS nyata: jarak waktu antar frame yang benar-benar diterima
          const now = performance.now()
          if (lastFrameTsRef.current) {
            const instFps = 1000 / (now - lastFrameTsRef.current)
            setMeasuredFps(prev => prev == null ? instFps : prev * 0.7 + instFps * 0.3)
          }
          lastFrameTsRef.current = now
          setStreamOk(true)
          if (!stopped) setTimeout(poll, 500)
        } else {
          setStreamOk(false)
          if (!stopped) setTimeout(poll, 2000)
        }
      } catch {
        setStreamOk(false)
        if (!stopped) setTimeout(poll, 2000)
      }
    }
    poll()
    return () => { stopped = true }
  }, [online, streamMode, csMode])

  // ── MJPEG gagal dimuat → jatuh ke mode polling snapshot ──
  const onLiveError = useCallback(() => {
    setStreamMode(mode => mode === 'mjpeg' ? 'polling' : mode)
  }, [])

  const onLiveLoad = useCallback(() => {
    if (streamMode === 'mjpeg') setStreamOk(true)
  }, [streamMode])

  // ── Polling: status device setiap 3 detik ──
  const fetchDevice = useCallback(async () => {
    try {
      const data = await getDevice(deviceId)
      setDeviceInfo(data)
      setOnline(data.status === 'online' || data.status === 'idle' || data.status === 'recording')

      // Jangan override state lokal selama grace period setelah command dikirim.
      // Ini mencegah polling me-reset UI sebelum Pi sempat memperbarui statusnya.
      const cmdAge      = cmdSentAtRef.current ? Date.now() - cmdSentAtRef.current : Infinity
      const inGrace     = cmdAge < GRACE_MS

      if (!inGrace) {
        // Di luar grace period → sinkronkan dengan status nyata dari device
        if (data.status === 'recording' && !recordingRef.current) {
          setRecording(true)
          setElapsed(0)
        } else if (data.status !== 'recording' && recordingRef.current) {
          // Device berhenti merekam dari sisi Pi (bukan dari tombol Stop UI)
          setRecording(false)
        }
      }
    } catch {
      setOnline(false)
    }
  }, [deviceId])

  // ── Polling: events terbaru setiap 5 detik ──
  const fetchEvents = useCallback(async () => {
    try {
      const data = await getEvents()
      // Hapus duplikat: event yang sama storage_path + event type hanya tampil sekali
      const seen = new Set()
      const unique = data.filter(ev => {
        // file ada di semua event; storage_path hanya di recording_stopped & snapshot_taken
        const key = `${ev.event}|${ev.storage_path || ev.file}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      // Konversi event backend → format activities
      const mapped = unique.slice(0, 6).map(ev => {
        const isPhoto  = ev.event === 'snapshot_taken'
        const isRecord = ev.event === 'recording_stopped' || ev.event === 'recording_started'
        return {
          kind: isPhoto ? 'photo' : isRecord ? 'rec' : 'ai',
          text: ev.event === 'snapshot_taken'     ? 'Foto diambil'
              : ev.event === 'recording_started'  ? 'Rekaman dimulai'
              : ev.event === 'recording_stopped'  ? 'Rekaman disimpan'
              : ev.event,
          time: timeAgo(ev.receivedAt),
          tag:  isPhoto ? 'Foto' : isRecord ? 'Video' : 'Moderate',
          raw:  ev,
        }
      })
      if (mapped.length > 0) setActivities(mapped)
    } catch { /* abaikan, backend mungkin belum ready */ }
  }, [])

  // ── Load recordings (galeri) satu kali saat mount + setiap 30 detik ──
  const fetchRecordings = useCallback(async () => {
    try {
      const data = await getRecordings()
      // Deduplikasi by storage_path — jaga-jaga kalau DB masih punya entri duplikat lama
      const seen = new Set()
      const unique = data.filter(r => {
        if (!r.storage_path || seen.has(r.storage_path)) return false
        seen.add(r.storage_path)
        return true
      })
      setRecordings(unique)
    } catch { /* abaikan */ }
  }, [])

  useEffect(() => {
    fetchDevice()
    fetchEvents()
    fetchRecordings()

    const deviceTimer     = setInterval(fetchDevice,     3000)
    const eventsTimer     = setInterval(fetchEvents,     5000)
    const recordingsTimer = setInterval(fetchRecordings, 30000)

    return () => {
      clearInterval(deviceTimer)
      clearInterval(eventsTimer)
      clearInterval(recordingsTimer)
    }
  }, [fetchDevice, fetchEvents, fetchRecordings])

  // ── Helpers untuk menghitung statistik dari recordings ──
  const videoRecordings = recordings.filter(r => r.type === 'video')
  const photoRecordings = recordings.filter(r => r.type === 'foto')
  const totalDurationSec = videoRecordings.reduce((acc, r) => acc + (r.duration_sec || 0), 0)
  const totalDurationMnt = Math.round(totalDurationSec / 60)
  const sessionsToday = recordings.filter(r => {
    const d = new Date(r.created_at)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate()
  }).length

  // ── Kirim perintah ke device ──
  async function sendCmd(cmd, extra) {
    setCmdError(null)
    setCmdLoading(true)
    // Catat waktu & nama command agar grace period aktif
    cmdSentAtRef.current = Date.now()
    lastCmdRef.current   = cmd
    try {
      await sendCommand(deviceId, cmd, extra)
    } catch (e) {
      setCmdError(e.message)
      // Batalkan grace period jika command gagal terkirim (lanjutan di bawah)
      cmdSentAtRef.current = null
      lastCmdRef.current   = null
    } finally {
      setCmdLoading(false)
    }
  }

  // ── Ubah MR live-encode CS di Pi (real-time, bukan simulasi) ──
  async function onLiveMrChange(newMr) {
    setLiveMr(newMr)
    if (!deviceId) return
    setLiveMrSending(true)
    try {
      await setCsMr(deviceId, newMr)
    } catch { /* koneksi Pi mungkin lambat, slider tetap tampilkan nilai lokal */ }
    finally { setLiveMrSending(false) }
  }

  function onRecord() {
    if (recording) { onStop(); return }
    setRecording(true)
    setElapsed(0)
    sendCmd('rekam')
  }

  function onStop() {
    if (!recording) return
    setRecording(false)
    sendCmd('stop')
    // Refresh galeri setelah jeda upload (~10 detik), tidak perlu tunggu 30 detik
    setTimeout(fetchRecordings, 10000)
  }

  function onPhoto() {
    sendCmd('foto', csCaptureEnabled ? { mr: csCaptureMr } : undefined)
  }

  // ── Analisis faringitis on-demand dari foto/video yang sedang dibuka di modal ──
  // Foto: pakai gambar itu sendiri. Video: pakai thumbnail (frame pertama) karena
  // model butuh 1 gambar, bukan video utuh.
  async function onAnalyze() {
    if (analyzing || !modalItem.id) return
    setAnalyzing(true)
    setAnalysisErr(null)
    setAnalysis(null)
    try {
      const imgUrl = modalItem.isVideo ? getThumbnailUrl(modalItem.id) : modalUrl
      if (!imgUrl) throw new Error('Media belum siap')
      const res = await fetch(imgUrl, { headers: NGROK_HEADERS })
      if (!res.ok) throw new Error(`Gagal mengambil gambar (${res.status})`)
      const blob = await res.blob()
      const result = await analyzePhoto(blob)
      setAnalysis(result)
    } catch (e) {
      setAnalysisErr('Gagal menganalisis media. Coba lagi.')
      setAnalysis(null)
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Toggle "Info Kompresi": simulasi encode+decode CS di atas foto/thumbnail
  // yang sedang dibuka, tampilkan jenis metode, PSNR, dan SSIM ──
  async function runCsQuality(mrPercent) {
    setCsQualityLoading(true)
    setCsQualityErr(null)
    try {
      let blob = csImageBlobRef.current
      if (!blob) {
        const imgUrl = modalItem.isVideo ? getThumbnailUrl(modalItem.id) : modalUrl
        if (!imgUrl) throw new Error('Media belum siap')
        const res = await fetch(imgUrl, { headers: NGROK_HEADERS })
        if (!res.ok) throw new Error(`Gagal mengambil gambar (${res.status})`)
        blob = await res.blob()
        csImageBlobRef.current = blob
      }
      const result = await getCsQuality(blob, mrPercent)
      setCsQuality(result)
    } catch (e) {
      setCsQualityErr('Gagal menghitung info kompresi. Coba lagi.')
      setCsQuality(null)
    } finally {
      setCsQualityLoading(false)
    }
  }

  async function onToggleCsQuality() {
    const willOpen = !csQualityOpen
    setCsQualityOpen(willOpen)
    if (!willOpen || csQuality || csQualityLoading || !modalItem.id) return
    runCsQuality(csMrPercent)
  }

  function onCsMrChange(newMr) {
    setCsMrPercent(newMr)
    runCsQuality(newMr)
  }

  // ── Buka modal galeri + ambil media URL ──
  async function openModal(item) {
    // Revoke blob URL lama jika ada
    if (modalBlobRef.current) {
      URL.revokeObjectURL(modalBlobRef.current)
      modalBlobRef.current = null
    }

    setModalItem(item)
    setModalUrl(null)
    setVideoError(null)
    setModalOpen(true)
    setAnalysis(null)
    setAnalysisErr(null)
    setCsQualityOpen(false)
    setCsQuality(null)
    setCsQualityErr(null)
    setCsMrPercent(100)
    csImageBlobRef.current = null

    if (!item.id) return

    setUrlLoading(true)
    try {
      // Foto & video sama-sama lewat proxy backend (/recordings/:id/stream), BUKAN
      // signed URL Supabase langsung -- file di storage sekarang terenkripsi (.enc),
      // signed URL Supabase cuma mengarah ke ciphertext mentah yang tidak bisa
      // ditampilkan browser (memicu CORB). Backend yang mendekripsinya dulu.
      const streamUrl = getStreamUrl(item.id)
      const needsBypass = Object.keys(NGROK_HEADERS).length > 0
      if (needsBypass) {
        // <video>/<img> tidak bisa kirim custom header, jadi fetch dulu ke blob
        // agar header ngrok-skip-browser-warning bisa dikirim via fetch()
        const res = await fetch(streamUrl, { headers: NGROK_HEADERS })
        if (!res.ok) throw new Error(`Server error ${res.status}`)
        const blob = await res.blob()
        const blobUrl = URL.createObjectURL(blob)
        modalBlobRef.current = blobUrl
        setModalUrl(blobUrl)
      } else {
        // Akses lokal (localhost/dev) — tidak perlu bypass, pakai URL langsung
        setModalUrl(streamUrl)
      }
    } catch (e) {
      setVideoError('Gagal mengambil media: ' + e.message)
    } finally {
      setUrlLoading(false)
    }
  }

  function closeModal() {
    setModalOpen(false)
    if (modalBlobRef.current) {
      URL.revokeObjectURL(modalBlobRef.current)
      modalBlobRef.current = null
    }
  }

  const recBtnStyle = recording
    ? { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239,68,68,.16)', color: '#EF4444', border: '1.5px solid #EF4444', borderRadius: '14px', padding: '10px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: cmdLoading ? 0.6 : 1 }
    : { display: 'flex', alignItems: 'center', gap: '8px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: '14px', padding: '11px 22px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: cmdLoading ? 0.6 : 1 }

  const stopBtnStyle = recording
    ? { display: 'flex', alignItems: 'center', gap: '7px', background: '#fff', color: '#161616', border: 'none', borderRadius: '14px', padding: '11px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: cmdLoading ? 0.6 : 1 }
    : { display: 'flex', alignItems: 'center', gap: '7px', background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.35)', border: 'none', borderRadius: '14px', padding: '11px 20px', fontSize: '13px', fontWeight: 600, cursor: 'not-allowed', fontFamily: 'inherit' }

  // ── Galeri: hanya dari DB, tidak ada data palsu ──
  const displayGallery = recordings.slice(0, 10).map((r, i) => ({
    id:      r.id,
    type:    r.type === 'video' ? 'Video' : 'Foto',
    title:   r.type === 'video' ? `Rekaman ${i + 1}` : `Foto ${i + 1}`,
    time:    timeAgo(r.created_at),
    dur:     r.type === 'video' ? fmtTime(r.duration_sec || 0) : 'IMG',
    isVideo: r.type === 'video',
    bg:      THUMB_BG[i % THUMB_BG.length],
    path:    r.storage_path,
  }))

  const displayActivities = activities
  const displaySessions   = sessionsToday
  const displayPhotos     = photoRecordings.length
  const displayDuration   = totalDurationMnt

  // ── Timestamp live ──
  const [nowStr, setNowStr] = useState('')
  useEffect(() => {
    function tick() {
      const d = new Date()
      setNowStr(d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' · ' + d.toLocaleTimeString('id-ID'))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="niss-page" style={{ minHeight: '100vh', background: '#EFEFEF' }}>
      <div style={{ maxWidth: '1380px', margin: '0 auto' }}>

        {/* ── ERROR BANNER ── */}
        {cmdError && (
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: '12px', padding: '10px 16px', marginBottom: '16px', color: '#EF4444', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>⚠️ {cmdError}</span>
            <button onClick={() => setCmdError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '16px' }}>×</button>
          </div>
        )}

        {/* ── TOP NAV ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFFFFF', borderRadius: '22px', padding: '12px 16px 12px 18px', boxShadow: '0 8px 26px rgba(20,20,20,.05)', marginBottom: '22px' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '11px', background: '#161616', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" fill="#5BC079"/>
              </svg>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <span style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '.04em' }}>NISS</span>
              <span style={{ fontSize: '10px', fontWeight: 500, color: '#8A8A8A', letterSpacing: '.06em', marginTop: '3px' }}>ENDOSCOPY</span>
            </div>
          </div>

          {/* Nav tabs — disembunyikan di mobile, diganti bottom nav */}
          <div className="niss-top-tabs" style={{ alignItems: 'center', gap: '4px', background: '#F4F4F4', borderRadius: '14px', padding: '5px' }}>
            {NAV_ITEMS.map(label => {
              const active = label === activeNav
              return (
                <button key={label} onClick={() => setActiveNav(label)} style={{ background: active ? '#161616' : 'transparent', color: active ? '#fff' : '#161616', fontSize: '13px', fontWeight: active ? 600 : 500, padding: '8px 16px', borderRadius: '10px', whiteSpace: 'nowrap', transition: 'all .15s ease', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {label}
                </button>
              )
            })}
          </div>

          {/* Bell + user */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button style={{ width: '40px', height: '40px', borderRadius: '13px', background: '#F4F4F4', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', border: 'none', cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#161616" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.7 21a2 2 0 0 1-3.4 0"/>
              </svg>
              <span style={{ position: 'absolute', top: '9px', right: '10px', width: '7px', height: '7px', borderRadius: '50%', background: '#EF4444', border: '2px solid #F4F4F4' }}></span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', background: '#F4F4F4', borderRadius: '13px', padding: '5px 12px 5px 5px' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '9px', background: 'linear-gradient(135deg,#5BC079,#3a8f57)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 700 }}>DA</div>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>dr. Anita</span>
                <span style={{ fontSize: '10px', color: '#8A8A8A', fontWeight: 500 }}>Operator</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════ TAB: LIVE ══════════════════════════════ */}
        {activeNav === 'Live' && <>

        {/* ── HERO ROW ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', marginBottom: '20px' }}>

          {/* LIVE ENDOSKOP */}
          <div className="niss-live-card" style={{ background: '#101012', borderRadius: '24px', padding: '16px', boxShadow: '0 16px 40px rgba(20,20,20,.10)', position: 'relative', overflow: 'hidden' }}>
            <div className="niss-live-box" style={{ position: 'relative', borderRadius: '18px', overflow: 'hidden', background: '#000' }}>
              {/* ── Live stream dari Pi (snapshot polling) ── */}
              {online && streamMode === 'mjpeg' && (
                <img
                  src={LIVE_URL}
                  alt="Live Endoskop"
                  onLoad={onLiveLoad}
                  onError={onLiveError}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: streamOk ? 'block' : 'none' }}
                />
              )}
              {streamMode === 'polling' && streamOk && frameUrl && (
                <img
                  src={frameUrl}
                  alt="Live Endoskop"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              )}
              {!streamOk && (
                /* Fallback: Pi offline atau stream error → tampilkan placeholder */
                <>
                  <div className="niss-drift" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 52% 42%,#d07a6a 0%,#b14d44 30%,#7d2b27 58%,#3a100f 82%,#160606 100%)' }}></div>
                  <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 70%,rgba(255,180,150,.35),transparent 38%),radial-gradient(circle at 72% 30%,rgba(120,30,28,.6),transparent 45%)', mixBlendMode: 'overlay' }}></div>
                  <div style={{ position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22.89 3.11L1.11 20.89M8 4h12a2 2 0 0 1 2 2v10M4 8.82V18a2 2 0 0 0 2 2h10"/>
                      <path d="m17 12 5 2.9V9.1L17 12z"/>
                    </svg>
                    <span style={{ color: 'rgba(255,255,255,.35)', fontSize: '13px', fontWeight: 500 }}>
                      {online ? 'Menghubungkan ke kamera…' : 'Perangkat offline'}
                    </span>
                    {online && !streamOk && (
                      <span style={{ color: 'rgba(255,255,255,.35)', fontSize: '12px', fontWeight: 500 }}>
                        Menghubungkan ke kamera…
                      </span>
                    )}
                  </div>
                </>
              )}
              <div className="niss-scan" style={{ position: 'absolute', left: 0, right: 0, height: '60px', background: 'linear-gradient(180deg,rgba(255,255,255,.05),transparent)', pointerEvents: 'none' }}></div>
              <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 80px 20px rgba(0,0,0,.4)', pointerEvents: 'none' }}></div>

              {/* toggle mode Compressive Sensing */}
              <div style={{ position: 'absolute', top: '14px', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={() => setCsMode(m => !m)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: csMode ? 'rgba(122,90,245,.92)' : 'rgba(0,0,0,.45)',
                    backdropFilter: 'blur(6px)', border: 'none', borderRadius: '11px',
                    padding: '6px 11px', cursor: 'pointer',
                  }}
                >
                  <span style={{ color: '#fff', fontSize: '11px', fontWeight: 600, letterSpacing: '.03em' }}>
                    Mode: {csMode ? 'Compressive Sensing' : 'Normal'}
                  </span>
                </button>
                {csMode && csStats && (
                  <div style={{ background: 'rgba(0,0,0,.5)', borderRadius: '9px', padding: '4px 9px', color: 'rgba(255,255,255,.75)', fontSize: '10px', fontWeight: 500 }}>
                    CS: {(csStats.bytesIn / 1024).toFixed(1)}KB terkirim · JPEG hasil: {(csStats.bytesOut / 1024).toFixed(1)}KB · {csStats.reconstructMs}ms
                  </div>
                )}
                {csMode && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)',
                      borderRadius: '9px', padding: '5px 10px', marginTop: '2px',
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,.6)', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      MR
                    </span>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={liveMr}
                      onChange={(e) => setLiveMr(Number(e.target.value))}
                      onMouseUp={(e) => onLiveMrChange(Number(e.target.value))}
                      onTouchEnd={(e) => onLiveMrChange(Number(e.target.value))}
                      style={{ width: '110px', accentColor: '#7A5AF5' }}
                    />
                    <span style={{ color: '#fff', fontSize: '10px', fontWeight: 700, minWidth: '30px' }}>
                      {liveMr}%{liveMrSending ? '…' : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* top-left status */}
              <div style={{ position: 'absolute', top: '14px', left: '14px', display: 'flex', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)', borderRadius: '11px', padding: '6px 11px' }}>
                  <span style={{ position: 'relative', width: '8px', height: '8px', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: online ? '#5BC079' : '#8A8A8A' }}></span>
                    <span className="niss-pulse" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: online ? '#5BC079' : '#8A8A8A' }}></span>
                  </span>
                  <span style={{ color: '#fff', fontSize: '11px', fontWeight: 600, letterSpacing: '.03em' }}>
                    {online ? (deviceInfo?.status ?? 'Online') : 'Offline'}
                  </span>
                  {online && (
                    <span title="MQTT terenkripsi AES-128-GCM" style={{ fontSize: '11px', opacity: 0.85, cursor: 'default' }}>🔒</span>
                  )}
                </div>
                {recording && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'rgba(239,68,68,.92)', borderRadius: '11px', padding: '6px 11px' }}>
                    <span className="niss-blink" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff', flexShrink: 0 }}></span>
                    <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700, letterSpacing: '.06em' }}>REC {fmtTime(elapsed)}</span>
                  </div>
                )}
              </div>

              {/* top-right device */}
              <div style={{ position: 'absolute', top: '14px', right: '14px', textAlign: 'right' }}>
                <div style={{ color: '#fff', fontSize: '12px', fontWeight: 600 }}>{deviceId}</div>
                <div style={{ color: 'rgba(255,255,255,.6)', fontSize: '10px', fontWeight: 500, marginTop: '3px', letterSpacing: '.04em' }}>
                  {streamInfo
                    ? `${streamInfo.width}×${streamInfo.height} · ${
                        streamMode === 'polling' && measuredFps
                          ? `${measuredFps.toFixed(1)} FPS (terukur)`
                          : `${streamInfo.fps} FPS`
                      }`
                    : '— × — · — FPS'}
                </div>
              </div>

              {/* crosshair */}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '54px', height: '54px', border: '1px solid rgba(255,255,255,.22)', borderRadius: '50%' }}></div>
              <div style={{ position: 'absolute', bottom: '14px', left: '14px', color: 'rgba(255,255,255,.55)', fontSize: '10px', fontWeight: 500, letterSpacing: '.05em' }}>{nowStr}</div>
            </div>

            {/* toggle Foto via CS: diatur SEBELUM capture, foto tersimpan = hasil rekonstruksi CS */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '10px 6px 0', flexWrap: 'wrap' }}>
              <button
                onClick={() => setCsCaptureEnabled(v => !v)}
                title="Jika aktif, foto yang tersimpan adalah hasil rekonstruksi Compressive Sensing pada MR di samping (bukan JPEG mentah kamera)"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: csCaptureEnabled ? 'rgba(122,90,245,.92)' : 'rgba(255,255,255,.08)',
                  color: csCaptureEnabled ? '#fff' : 'rgba(255,255,255,.6)',
                  border: 'none', borderRadius: '10px', padding: '6px 11px',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Foto via CS: {csCaptureEnabled ? 'ON' : 'OFF'}
              </button>
              {csCaptureEnabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,.06)', borderRadius: '10px', padding: '6px 11px' }}>
                  <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '11px', fontWeight: 600 }}>MR</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={csCaptureMr}
                    onChange={(e) => setCsCaptureMr(Number(e.target.value))}
                    style={{ width: '110px', accentColor: '#7A5AF5' }}
                  />
                  <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700, minWidth: '30px' }}>{csCaptureMr}%</span>
                </div>
              )}
            </div>
            {csCaptureEnabled && (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.4)', fontSize: '10px', padding: '4px 12px 0' }}>
                Foto akan diproses CS (encode+rekonstruksi OMP) di Pi sebelum disimpan — bisa perlu beberapa detik lebih lama dari biasanya.
              </div>
            )}

            {/* capture controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '18px 6px 6px' }}>
              <button onClick={onRecord} disabled={cmdLoading} style={recBtnStyle}>
                <span className={recording ? 'niss-blink' : ''} style={{ width: '10px', height: '10px', borderRadius: '50%', background: recording ? '#EF4444' : '#fff', flexShrink: 0 }}></span>
                <span>{recording ? 'Merekam…' : 'Rekam'}</span>
              </button>
              <button onClick={onStop} disabled={!recording || cmdLoading} style={stopBtnStyle}>
                <svg width="13" height="13" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/>
                </svg>
                <span>Stop</span>
              </button>
              <button onClick={onPhoto} disabled={cmdLoading} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FFFFFF', color: '#161616', border: 'none', borderRadius: '14px', padding: '11px 20px', fontSize: '13px', fontWeight: 600, cursor: cmdLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: cmdLoading ? 0.6 : 1 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4z"/>
                  <circle cx="12" cy="13" r="3.5"/>
                </svg>
                <span>Foto</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── METRICS + ACTIVITY + GALLERY ── */}
        <div className="niss-metrics">

          {/* Sesi Hari Ini */}
          <div style={{ background: '#fff', borderRadius: '22px', padding: '20px', boxShadow: '0 8px 26px rgba(20,20,20,.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#8A8A8A', letterSpacing: '.05em', textTransform: 'uppercase' }}>Sesi Hari Ini</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#5BC079', background: 'rgba(91,192,121,.12)', padding: '4px 8px', borderRadius: '7px' }}>Normal</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', margin: '14px 0 12px' }}>
              <span style={{ fontSize: '34px', fontWeight: 700, lineHeight: 1 }}>{displaySessions}</span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#8A8A8A', marginBottom: '5px' }}>rekaman</span>
            </div>
            <svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="none">
              <path d="M0 26 L18 20 L36 24 L54 12 L72 18 L90 8 L108 14 L120 6" fill="none" stroke="#5BC079" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* Total Durasi */}
          <div style={{ background: '#fff', borderRadius: '22px', padding: '20px', boxShadow: '0 8px 26px rgba(20,20,20,.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#8A8A8A', letterSpacing: '.05em', textTransform: 'uppercase' }}>Total Durasi</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#F5A623', background: 'rgba(245,166,35,.12)', padding: '4px 8px', borderRadius: '7px' }}>+12%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', margin: '14px 0 12px' }}>
              <span style={{ fontSize: '34px', fontWeight: 700, lineHeight: 1 }}>{displayDuration}</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#8A8A8A', marginBottom: '4px' }}>mnt</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '34px' }}>
              {DUR_HEIGHTS.map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, minHeight: '5px', background: h >= 88 ? '#F5A623' : '#E2E2E2', borderRadius: '3px' }}></div>
              ))}
            </div>
          </div>

          {/* Jumlah Foto */}
          <div style={{ background: '#fff', borderRadius: '22px', padding: '20px', boxShadow: '0 8px 26px rgba(20,20,20,.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#8A8A8A', letterSpacing: '.05em', textTransform: 'uppercase' }}>Jumlah Foto</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#5BC079', background: 'rgba(91,192,121,.12)', padding: '4px 8px', borderRadius: '7px' }}>Tersimpan</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', margin: '14px 0 12px' }}>
              <span style={{ fontSize: '34px', fontWeight: 700, lineHeight: 1 }}>{displayPhotos}</span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#8A8A8A', marginBottom: '5px' }}>gambar</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '34px' }}>
              {PHOTO_HEIGHTS.map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, minHeight: '5px', background: h >= 80 ? '#5BC079' : '#E2E2E2', borderRadius: '3px' }}></div>
              ))}
            </div>
          </div>

          {/* AKTIVITAS TERBARU */}
          <div className="niss-metric-activity" style={{ background: '#fff', borderRadius: '22px', padding: '20px', boxShadow: '0 8px 26px rgba(20,20,20,.05)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>Aktivitas Terbaru</span>
              <button onClick={onPhoto} disabled={cmdLoading} style={{ width: '30px', height: '30px', borderRadius: '10px', background: '#161616', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 500, lineHeight: 1, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>+</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {displayActivities.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '32px 0', color: '#B0B0B0' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>Belum ada aktivitas</span>
                </div>
              ) : displayActivities.map((a, i) => {
                const c = ICON_MAP[a.kind] || ICON_MAP.rec
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 0', borderBottom: '1px solid #F2F2F2' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '11px', background: c[1], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ width: '11px', height: '11px', borderRadius: a.kind === 'rec' ? '50%' : '3px', background: c[0] }}></span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.3 }}>{a.text}</div>
                      <div style={{ fontSize: '11px', color: '#8A8A8A', fontWeight: 500, marginTop: '2px' }}>{a.time}</div>
                    </div>
                    <span style={tagStyle(a.tag)}>{a.tag}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* GALLERY */}
          <div className="niss-metric-gallery" style={{ background: '#fff', borderRadius: '22px', padding: '20px', boxShadow: '0 8px 26px rgba(20,20,20,.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>Galeri Rekaman &amp; Foto</span>
              <button onClick={() => { setActiveNav('Riwayat'); setFilterType('Semua') }} style={{ fontSize: '12px', fontWeight: 600, color: '#161616', background: '#F4F4F4', padding: '8px 14px', borderRadius: '11px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Lihat semua</button>
            </div>
            {displayGallery.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '40px 0', color: '#B0B0B0' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2"/>
                  <path d="M16 3l-4 4-4-4"/>
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Belum ada rekaman atau foto tersimpan</span>
              </div>
            ) : (
              <div className="niss-grid-5">
                {displayGallery.map((item, i) => (
                  <div key={item.id || i} onClick={() => openModal(item)} style={{ cursor: 'pointer' }}>
                    <GalleryThumb item={item} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '9px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>{item.title}</span>
                      <span style={{ fontSize: '11px', color: '#8A8A8A', fontWeight: 500 }}>{item.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── akhir konten Live ── */}
        </>}

        {/* ══════════════════════════════ TAB: RIWAYAT ══════════════════════════════ */}
        {activeNav === 'Riwayat' && (() => {
          const filtered = recordings.filter(r =>
            filterType === 'Semua' ? true :
            filterType === 'Video' ? r.type === 'video' : r.type === 'foto'
          )
          const items = filtered.map((r, i) => ({
            id:      r.id,
            type:    r.type === 'video' ? 'Video' : 'Foto',
            title:   r.type === 'video' ? `Rekaman ${i + 1}` : `Foto ${i + 1}`,
            time:    timeAgo(r.created_at),
            dur:     r.type === 'video' ? fmtTime(r.duration_sec || 0) : 'IMG',
            isVideo: r.type === 'video',
            bg:      THUMB_BG[i % THUMB_BG.length],
            path:    r.storage_path,
          }))
          return (
            <div style={{ background: '#fff', borderRadius: '22px', padding: '24px', boxShadow: '0 8px 26px rgba(20,20,20,.05)' }}>
              {/* Header + filter */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <span style={{ fontSize: '16px', fontWeight: 700 }}>Riwayat Rekaman &amp; Foto</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['Semua', 'Video', 'Foto'].map(f => (
                    <button key={f} onClick={() => setFilterType(f)} style={{ fontSize: '12px', fontWeight: 600, padding: '7px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: filterType === f ? '#161616' : '#F4F4F4', color: filterType === f ? '#fff' : '#161616', transition: 'all .15s' }}>{f}</button>
                  ))}
                </div>
              </div>
              {/* Grid */}
              {items.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '60px 0', color: '#B0B0B0' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3l-4 4-4-4"/></svg>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Tidak ada {filterType === 'Semua' ? 'rekaman atau foto' : filterType.toLowerCase()} tersimpan</span>
                </div>
              ) : (
                <div className="niss-grid-4">
                  {items.map((item, i) => (
                    <div key={item.id || i} onClick={() => openModal(item)} style={{ cursor: 'pointer' }}>
                      <GalleryThumb item={item} />
                      <div style={{ marginTop: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{item.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#8A8A8A', fontWeight: 500 }}>{item.time}</span>
                          {item.isVideo && <span style={{ fontSize: '11px', fontWeight: 600, color: '#2A6FDB' }}>{item.dur}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* ══════════════════════════════ TAB: DATABASE ══════════════════════════════ */}
        {activeNav === 'Database' && (
          <div style={{ background: '#fff', borderRadius: '22px', padding: '24px', boxShadow: '0 8px 26px rgba(20,20,20,.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <span style={{ fontSize: '16px', fontWeight: 700 }}>Database Media</span>
              <span style={{ fontSize: '12px', color: '#8A8A8A', fontWeight: 500 }}>{recordings.length} file tersimpan</span>
            </div>
            {recordings.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '60px 0', color: '#B0B0B0' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Belum ada data tersimpan</span>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #F2F2F2' }}>
                      {['#', 'Tipe', 'Nama File', 'Tanggal', 'Durasi', 'Aksi'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: 600, color: '#8A8A8A', letterSpacing: '.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recordings.map((r, i) => {
                      const item = { id: r.id, type: r.type === 'video' ? 'Video' : 'Foto', title: r.type === 'video' ? `Rekaman ${i + 1}` : `Foto ${i + 1}`, time: timeAgo(r.created_at), dur: r.type === 'video' ? fmtTime(r.duration_sec || 0) : '—', isVideo: r.type === 'video', bg: THUMB_BG[i % THUMB_BG.length], path: r.storage_path }
                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid #F2F2F2' }} onMouseEnter={e => e.currentTarget.style.background='#FAFAFA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <td style={{ padding: '12px 14px', color: '#8A8A8A', fontWeight: 500 }}>{i + 1}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '7px', color: r.type === 'video' ? '#2A6FDB' : '#7A5AF5', background: r.type === 'video' ? 'rgba(42,111,219,.12)' : 'rgba(122,90,245,.12)' }}>{r.type === 'video' ? 'Video' : 'Foto'}</span>
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 500, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.storage_path?.split('/').pop() || '—'}</td>
                          <td style={{ padding: '12px 14px', color: '#8A8A8A', whiteSpace: 'nowrap' }}>{r.created_at ? new Date(r.created_at).toLocaleString('id-ID') : '—'}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 600, color: '#161616' }}>{r.type === 'video' ? fmtTime(r.duration_sec || 0) : '—'}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <button onClick={() => openModal(item)} style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '9px', border: 'none', background: '#F4F4F4', color: '#161616', cursor: 'pointer', fontFamily: 'inherit' }}>Putar</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── BOTTOM NAV (mobile only, via CSS) ── */}
      <nav className="niss-bottom-nav">
        {[
          { label: 'Live', icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="14" height="10" rx="2"/>
              <path d="m16 9 5-2v10l-5-2V9z"/>
            </svg>
          )},
          { label: 'Riwayat', icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          )},
          { label: 'Database', icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          )},
        ].map(({ label, icon }) => {
          const active = label === activeNav
          return (
            <button key={label} className="niss-bottom-nav-btn" onClick={() => setActiveNav(label)}
              style={{ color: active ? '#161616' : '#AAAAAA' }}>
              {icon}
              <span style={{ color: active ? '#161616' : '#AAAAAA' }}>{label}</span>
              {active && <div style={{ width: '18px', height: '3px', borderRadius: '2px', background: '#161616', marginTop: '1px' }} />}
            </button>
          )
        })}
      </nav>

      {/* ── MODAL ── */}
      {modalOpen && (
        <div onClick={() => closeModal()} style={{ position: 'fixed', inset: 0, background: 'rgba(16,16,18,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '40px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#101012', borderRadius: '24px', padding: '16px', width: '780px', maxWidth: '100%', boxShadow: '0 30px 80px rgba(0,0,0,.4)' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={overlayTagStyle(modalItem.type)}>{modalItem.type}</span>
                <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>{modalItem.title}</span>
                <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '12px', fontWeight: 500 }}>{modalItem.time}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Tombol Analisis faringitis */}
                <button
                  onClick={onAnalyze}
                  disabled={analyzing || urlLoading || !!videoError}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: '#fff', color: '#161616', border: 'none', borderRadius: '10px',
                    padding: '7px 12px', fontSize: '12px', fontWeight: 600,
                    cursor: (analyzing || urlLoading || videoError) ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', opacity: (analyzing || urlLoading || videoError) ? 0.6 : 1,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>
                  </svg>
                  {analyzing ? 'Menganalisis…' : 'Analisis'}
                </button>
                {/* Toggle Info Kompresi CS (PSNR/SSIM) */}
                <button
                  onClick={onToggleCsQuality}
                  disabled={urlLoading || !!videoError}
                  title="Info Kompresi (simulasi Compressive Sensing)"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: csQualityOpen ? 'rgba(122,90,245,.92)' : 'rgba(255,255,255,.08)',
                    color: csQualityOpen ? '#fff' : 'rgba(255,255,255,.7)',
                    border: 'none', borderRadius: '10px',
                    padding: '7px 12px', fontSize: '12px', fontWeight: 600,
                    cursor: (urlLoading || videoError) ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', opacity: (urlLoading || videoError) ? 0.6 : 1,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                  Info Kompresi
                </button>
                {/* Tombol download sebagai fallback */}
                {modalUrl && (
                  <a
                    href={modalUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.7)', borderRadius: '10px', padding: '7px 12px', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/>
                    </svg>
                    Unduh
                  </a>
                )}
                <button onClick={() => closeModal()} style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(255,255,255,.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Area media */}
            <div style={{ position: 'relative', height: '420px', borderRadius: '16px', overflow: 'hidden', background: modalItem.bg || '#000', boxShadow: 'inset 0 0 100px 20px rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

              {/* ── Loading spinner (saat fetch signed URL) ── */}
              {urlLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,.15)', borderTopColor: '#fff', borderRadius: '50%', animation: 'niss-spin 0.8s linear infinite' }} />
                  <span style={{ color: 'rgba(255,255,255,.6)', fontSize: '13px', fontWeight: 500 }}>Memuat media…</span>
                </div>
              )}

              {/* ── Error state ── */}
              {!urlLoading && videoError && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '24px', textAlign: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239,68,68,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 8v4m0 4h.01"/>
                    </svg>
                  </div>
                  <span style={{ color: '#EF4444', fontSize: '13px', fontWeight: 600 }}>{videoError}</span>
                  {modalUrl && (
                    <a href={modalUrl} target="_blank" rel="noreferrer" style={{ color: '#5BC079', fontSize: '12px', fontWeight: 600 }}>Coba buka di tab baru ↗</a>
                  )}
                </div>
              )}

              {/* ── VIDEO player ── */}
              {!urlLoading && !videoError && modalUrl && modalItem.isVideo && (
                <video
                  key={modalUrl}
                  src={modalUrl}
                  controls
                  playsInline
                  preload="metadata"
                  onError={(e) => {
                    // Ketika menggunakan src langsung (tanpa <source>),
                    // e.target.error adalah MediaError dengan code yang jelas.
                    const err  = e.target.error
                    const code = err ? err.code : null
                    const mediaErrMsg = {
                      1: 'Pemuatan video dibatalkan oleh pengguna.',
                      2: 'Error jaringan — video tidak bisa diunduh. Cek koneksi.',
                      3: 'Codec/format video tidak didukung browser ini.',
                      4: 'Sumber video tidak ditemukan atau URL sudah kedaluwarsa.',
                    }
                    const msg = code
                      ? (mediaErrMsg[code] || `Error media (kode ${code})`)
                      : (err?.message || 'Browser menolak memutar video ini.')
                    console.error('[Video error]', { code, message: err?.message, src: modalUrl })
                    setVideoError(msg + ' — gunakan tombol Unduh untuk putar secara lokal.')
                  }}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                />
              )}

              {/* ── FOTO viewer ── */}
              {!urlLoading && !videoError && modalUrl && !modalItem.isVideo && (
                <img
                  src={modalUrl}
                  alt={modalItem.title}
                  onError={() => setVideoError('Gagal memuat foto.')}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                />
              )}

              {/* ── Fallback: belum ada URL dan tidak sedang loading ── */}
              {!urlLoading && !videoError && !modalUrl && modalItem.isVideo && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#161616"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '12px' }}>Pratinjau tidak tersedia</span>
                </div>
              )}
            </div>

            {/* hasil analisis faringitis */}
            {(analysis || analysisErr) && (
              <div style={{
                marginTop: '14px',
                padding: '12px 16px',
                borderRadius: '14px',
                background: analysisErr ? 'rgba(239,68,68,.08)' : (analysis?.prediction === 'pharyngitis' ? 'rgba(239,68,68,.08)' : 'rgba(91,192,121,.08)'),
                border: `1px solid ${analysisErr ? 'rgba(239,68,68,.25)' : (analysis?.prediction === 'pharyngitis' ? 'rgba(239,68,68,.25)' : 'rgba(91,192,121,.25)')}`,
              }}>
                {analysisErr ? (
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#EF4444' }}>{analysisErr}</span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: analysis.prediction === 'pharyngitis' ? '#EF4444' : '#5BC079' }}>
                      {analysis.prediction === 'pharyngitis' ? 'Terindikasi Faringitis' : 'Tidak Terindikasi Faringitis'}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#8A8A8A' }}>
                      Keyakinan {(analysis.confidence * 100).toFixed(1)}% · {analysis.latency_ms} ms
                      {modalItem.isVideo && ' · dari frame pertama video'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* panel Info Kompresi CS (PSNR/SSIM) */}
            {csQualityOpen && (
              <div style={{
                marginTop: '14px',
                padding: '12px 16px',
                borderRadius: '14px',
                background: csQualityErr ? 'rgba(239,68,68,.08)' : 'rgba(122,90,245,.08)',
                border: `1px solid ${csQualityErr ? 'rgba(239,68,68,.25)' : 'rgba(122,90,245,.25)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,.7)', whiteSpace: 'nowrap' }}>
                    MR (measurement rate)
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={csMrPercent}
                    disabled={csQualityLoading}
                    onChange={(e) => setCsMrPercent(Number(e.target.value))}
                    onMouseUp={(e) => onCsMrChange(Number(e.target.value))}
                    onTouchEnd={(e) => onCsMrChange(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#7A5AF5' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#B9A6FF', minWidth: '38px', textAlign: 'right' }}>
                    {csMrPercent}%
                  </span>
                </div>
                {csQualityLoading ? (
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,.6)' }}>Menghitung info kompresi…</span>
                ) : csQualityErr ? (
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#EF4444' }}>{csQualityErr}</span>
                ) : csQuality ? (
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#B9A6FF', marginBottom: '8px' }}>
                      {csQuality.csType} · MR {csQuality.mrPercent}% · blok {csQuality.blockSize}×{csQuality.blockSize}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{csQuality.psnr} dB</div>
                        <div style={{ fontSize: '11px', color: '#8A8A8A' }}>PSNR</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{csQuality.ssim}</div>
                        <div style={{ fontSize: '11px', color: '#8A8A8A' }}>SSIM</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{(csQuality.csPayloadBytes / 1024).toFixed(1)} KB</div>
                        <div style={{ fontSize: '11px', color: '#8A8A8A' }}>Payload CS (simulasi)</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{(csQuality.rawPixelBytes / 1024 / 1024).toFixed(2)} MB</div>
                        <div style={{ fontSize: '11px', color: '#8A8A8A' }}>File asli (raw, belum dikompresi)</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#5BC079' }}>{(csQuality.rawPixelBytes / csQuality.csPayloadBytes).toFixed(2)}×</div>
                        <div style={{ fontSize: '11px', color: '#8A8A8A' }}>Lebih kecil dari raw</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '8px' }}>
                      Simulasi encode+decode CS di atas file JPEG yang tersimpan ({(csQuality.originalBytes / 1024).toFixed(1)} KB) — perbandingan ukuran di atas terhadap data mentah (raw, belum ada kompresi apa pun), bukan terhadap JPEG. Bukan payload asli yang dikirim dari Pi (yang mengukur langsung dari frame kamera mentah saat live, lihat toggle "Mode: Compressive Sensing" di live view).
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
