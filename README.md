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
- Tambahkan `MONGODB_URI`, `MONGODB_DB` (misalnya `infopermintaan`), `SESSION_SECRET`, dan `ADMIN_PASSWORD` di pengaturan environment variables Vercel. `SESSION_SECRET` harus acak dan minimal 32 karakter; `ADMIN_PASSWORD` minimal 8 karakter. Untuk keamanan, gunakan password yang kuat dan jangan masukkan kredensial ke Git.
- Pastikan `ADMIN_PASSWORD` dan `SESSION_SECRET` diaktifkan untuk environment deployment yang sedang dibuka (Production, Preview, atau Development), lalu redeploy setelah mengubah nilainya.
- Deploy proyek ke Vercel. Endpoint API ada di `api/`; akun dibuat dari dialog chat. Kata sandi disimpan sebagai hash, dan sesi menggunakan cookie HttpOnly.
- Tautan **Mode admin** ada di halaman Tentang Kami. Masuk dengan `ADMIN_PASSWORD` untuk membuat akun, mereset kata sandi, atau menghapus akun pengguna. Reset kata sandi dan penghapusan akun mencabut akses sesi chat lama. Akses admin dijaga backend, bukan hanya tampilan frontend.
- Semua pengguna terdaftar melihat ruang chat yang sama. Pesan dan foto tersimpan di koleksi `messages`, dan antarmuka memeriksa pesan baru setiap 4 detik. Pengguna chat dapat menghapus satu pesan pilihan untuk semua orang atau menghapus seluruh riwayat. Foto dikompres di browser menjadi JPEG maksimal 1 MB sebelum dikirim.

`npm run dev` menjalankan Vite untuk antarmuka saja; untuk menjalankan Vercel Functions secara lokal, isi `.env.local` (gunakan `.env.example` sebagai acuan) lalu jalankan `npx vercel dev` dari Vercel CLI.

## Catatan

- Status permintaan tetap data dummy acak, bukan pengecekan sistem pemasangan internet.
- Chat ini merupakan ruang bersama, bukan pesan pribadi. Siapa pun yang membuat akun dapat membaca pesan di ruangan tersebut.
- Untuk deployment publik, atur akses jaringan MongoDB dengan aman dan pertimbangkan pembatasan pendaftaran, moderasi, serta rate limiting.