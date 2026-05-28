# 🎮 Tebak Kata

Game tebak kata online berbasis browser dengan mode VS Player (realtime) dan VS Computer.

## Stack
- **Frontend**: HTML, CSS, Vanilla JS
- **Backend & Auth**: [Supabase](https://supabase.com)
- **Deploy**: [Vercel](https://vercel.com)
- **Repo**: GitHub

---

## 🚀 Setup Step-by-Step

### 1. Fork / Clone Repo

```bash
git clone https://github.com/USERNAME/tebak-kata.git
cd tebak-kata
```

### 2. Buat Project Supabase

1. Buka [supabase.com](https://supabase.com) → New Project
2. Beri nama project, pilih region terdekat (Singapore)
3. Tunggu hingga project siap

### 3. Jalankan SQL Schema

1. Di dashboard Supabase → **SQL Editor**
2. Copy isi file `supabase_schema.sql`
3. Paste dan klik **Run**

### 4. Ambil Kredensial Supabase

Di **Settings → API**:
- `Project URL` → salin ke `SUPABASE_URL`
- `anon public key` → salin ke `SUPABASE_ANON_KEY`

### 5. Update Config

Buka `js/config.js` dan isi:

```js
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGci...';
```

### 6. Push ke GitHub

```bash
git add .
git commit -m "init: tebak kata game"
git push origin main
```

### 7. Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) → New Project
2. Import repo GitHub kamu
3. Framework Preset: **Other**
4. Klik **Deploy**

✅ Selesai! Game kamu sudah live.

---

## 🎮 Cara Main

### VS Player
1. Login / daftar akun
2. Pilih **VS Player**
3. **Buat Room** → share kode ke teman
4. Tunggu teman join, lalu **Start Game**
5. Sistem akan mengacak siapa yang dapat role:
   - **QUESTION** 🗣️: Punya kata rahasia, balas petunjuk dari lawan
   - **ANSWER** 🔍: Tebak kata dengan bertanya petunjuk

### VS Computer
1. Login / daftar akun
2. Pilih **VS COM**
3. Kamu selalu jadi **ANSWER**, COM selalu jadi **QUESTION**
4. Tanya petunjuk ke COM, lalu tebak katanya
5. COM selalu menjawab jujur!

---

## 📁 Struktur File

```
tebak-kata/
├── index.html          # Main HTML (semua screen ada di sini)
├── css/
│   └── style.css       # Styling retro pixel game
├── js/
│   ├── config.js       # Konfigurasi Supabase (GANTI INI!)
│   ├── auth.js         # Login, register, logout
│   ├── game.js         # Logic game, room, realtime, COM AI
│   └── app.js          # Controller utama, UI logic
└── supabase_schema.sql # Schema database (jalankan 1x di Supabase)
```

---

## ⚙️ Supabase Auth Note

Game ini menggunakan trick email fake (`username@tebakkata.game`) agar pemain bisa login dengan username saja tanpa perlu email asli. Pastikan di **Supabase → Auth → Email** kamu disable "Confirm email" agar langsung bisa login setelah daftar:

**Authentication → Providers → Email → uncheck "Confirm email"**
