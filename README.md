# InfoPermintaan

Antarmuka Vite + React dengan backend Vercel Functions dan MongoDB untuk ruang chat bersama.

## Menjalankan aplikasi

```bash
npm install
npm run dev
```

`npm run build` membuat hasil produksi di `dist/`.

## Backend chat

- Buat database MongoDB Atlas dan siapkan connection string.
- Tambahkan `MONGODB_URI`, `MONGODB_DB` (misalnya `infopermintaan`), dan `SESSION_SECRET` di pengaturan environment variables Vercel. Secret harus acak dan minimal 32 karakter; jangan masukkan kredensial ke Git.
- Deploy proyek ke Vercel. Endpoint API ada di `api/`; akun dibuat dari dialog chat. Kata sandi disimpan sebagai hash, dan sesi menggunakan cookie HttpOnly.
- Semua pengguna terdaftar melihat ruang chat yang sama. Pesan tersimpan di koleksi `messages`, dan antarmuka memeriksa pesan baru setiap 4 detik.

`npm run dev` menjalankan Vite untuk antarmuka saja; untuk menjalankan Vercel Functions secara lokal, isi `.env.local` (gunakan `.env.example` sebagai acuan) lalu jalankan `npx vercel dev` dari Vercel CLI.

## Catatan

- Status permintaan tetap data dummy acak, bukan pengecekan sistem pemasangan internet.
- Chat ini merupakan ruang bersama, bukan pesan pribadi. Siapa pun yang membuat akun dapat membaca pesan di ruangan tersebut.
- Untuk deployment publik, atur akses jaringan MongoDB dengan aman dan pertimbangkan pembatasan pendaftaran, moderasi, serta rate limiting.