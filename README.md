# NISS Endoscopy — Frontend

Dashboard web untuk sistem endoskopi NISS. Dibangun dengan React + Vite, di-deploy ke Vercel, terhubung ke backend melalui Cloudflare Tunnel di `app.satsetin.com`.

## Fitur

- **Live stream** kamera endoskopi via snapshot polling (JPEG setiap 500ms)
- **Rekam video & foto** dengan kontrol langsung dari browser
- **Galeri & Riwayat** rekaman dan foto tersimpan di Supabase
- **Database view** tabel lengkap semua media
- **Responsive** — tampilan desktop dan mobile dengan bottom navigation
- **Modal pemutar video** dengan H.264 transcoding otomatis oleh backend

## Tech Stack

- [React 19](https://react.dev/) — UI library
- [Vite 8](https://vitejs.dev/) — bundler & dev server
- [Vercel](https://vercel.com/) — hosting & deployment otomatis dari GitHub

## Struktur File

```
src/
├── main.jsx          # entry point React
├── App.jsx           # root component
├── App.css           # reset minimal
├── index.css         # global styles + responsive layout
├── api.js            # semua fungsi fetch ke backend
└── NISSDashboard.jsx # komponen utama dashboard
```

## Instalasi & Development

### Prasyarat

- Node.js 18+
- Backend NISS berjalan di `localhost:3000` (lihat repo [backend_NISS](https://github.com/flakesss/backend_NISS))

### Setup

```bash
git clone https://github.com/flakesss/frontend_NISS.git
cd frontend_NISS
npm install
```

### Konfigurasi Environment

Buat file `.env.local` (atau `.env`) di root directory frontend dengan konfigurasi berikut:

```env
# Development — kosongkan agar Vite proxy ke localhost:3000
VITE_API_URL=

# Production via Cloudflare Tunnel / domain publik
# VITE_API_URL=https://app.satsetin.com
```

| Variabel | Default | Keterangan |
|---|---|---|
| `VITE_API_URL` | *(kosong)* | URL dasar REST API backend. Saat dikosongkan pada mode development, semua request `/api/...` akan di-proxy oleh Vite ke `localhost:3000` secara otomatis (sesuai `vite.config.js`). Untuk deployment production (misal di Vercel), isi dengan URL publik backend (contoh: `https://app.satsetin.com`). |

Saat `VITE_API_URL` dikosongkan, semua request `/api/...` akan di-proxy oleh Vite ke `localhost:3000` secara otomatis (dikonfigurasi di `vite.config.js`).

### Menjalankan Dev Server

```bash
npm run dev
```

Buka `http://localhost:5173`.

### Build Production

```bash
npm run build
```

Output ada di folder `dist/`. Salin ke backend untuk di-serve bersama API:

```bash
cp -r dist ../backend/frontend/dist
```

---

## Deployment ke Vercel

### Otomatis (direkomendasikan)

1. Fork / push repo ini ke GitHub
2. Import repo di [vercel.com](https://vercel.com/) → **Add New Project**
3. Set environment variable di Vercel dashboard:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://app.satsetin.com` |

4. Setiap push ke `main` akan trigger deploy otomatis

### Manual via CLI

```bash
npm install -g vercel
vercel --prod
```

---

## Konfigurasi Backend URL

File `src/api.js` otomatis mendeteksi environment:

```
VITE_API_URL tidak di-set  →  pakai /api  →  Vite proxy  →  localhost:3000
VITE_API_URL di-set        →  request langsung ke Cloudflare Tunnel URL
```

---

## Perintah yang Tersedia

```bash
npm run dev      # jalankan dev server (http://localhost:5173)
npm run build    # build production ke ./dist
npm run preview  # preview hasil build secara lokal
npm run lint     # lint dengan oxlint
```

---

## Catatan

- **Format video**: backend otomatis transcode ke H.264 MP4 via ffmpeg sebelum dikirim ke browser
- **Snapshot polling**: live stream menggunakan polling JPEG setiap 500ms (bukan MJPEG stream) untuk kompatibilitas lintas browser dan proxy
- **Cloudflare Tunnel**: akses publik backend via `app.satsetin.com`, dikelola Docker Compose di sisi server
