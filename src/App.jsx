import { useEffect, useState } from "react";

const outcomes = [
  {
    status: "Permintaan diterima",
    tone: "blue",
    detail: "Permintaan Anda sudah masuk dan sedang menunggu verifikasi.",
    step: "Verifikasi data",
  },
  {
    status: "Survei lokasi dijadwalkan",
    tone: "purple",
    detail: "Tim survei akan menghubungi Anda untuk menentukan jadwal.",
    step: "Survei lokasi",
  },
  {
    status: "Menunggu ketersediaan jaringan",
    tone: "orange",
    detail: "Pengecekan jaringan di area Anda sedang berlangsung.",
    step: "Pengecekan jaringan",
  },
  {
    status: "Instalasi dalam proses",
    tone: "green",
    detail: "Permintaan instalasi sedang diproses oleh tim teknis.",
    step: "Proses instalasi",
  },
  {
    status: "Permintaan selesai",
    tone: "teal",
    detail: "Simulasi permintaan ini telah selesai diproses.",
    step: "Selesai",
  },
];

function App() {
  const [page, setPage] = useState("home");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [loginError, setLoginError] = useState("");
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatError, setChatError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (page !== "chat") return undefined;

    let active = true;
    async function loadMessages() {
      try {
        const response = await fetch("/api/messages");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Pesan tidak dapat dimuat.");
        if (active) {
          setMessages(data.messages);
          setChatError("");
        }
      } catch (requestError) {
        if (active) setChatError(requestError.message);
      }
    }

    loadMessages();
    const timer = window.setInterval(loadMessages, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [page]);

  function checkRequest(event) {
    event.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      setError("Masukkan nomor telepon yang terdiri dari 8–15 digit.");
      setResult(null);
      return;
    }

    const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
    setResult({
      ...outcome,
      reference: `DEMO-${digits.slice(-4)}-${Math.floor(1000 + Math.random() * 9000)}`,
    });
    setError("");
  }

  function openChatLogin() {
    setShowLogin(true);
    setLoginError("");
    setUsername("");
    setPassword("");
    setAuthMode("login");
  }

  async function signIn(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const response = await fetch(`/api/auth/${authMode === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Tidak dapat masuk.");
      setUser(data.user);
      setMessages([]);
      setChatError("");
      setShowLogin(false);
      setPage("chat");
    } catch (requestError) {
      setLoginError(requestError.message);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setChatError("");
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pesan tidak dapat dikirim.");
      setMessages((current) => [...current, data.message]);
      setDraft("");
    } catch (requestError) {
      setChatError(requestError.message);
    } finally {
      setSending(false);
    }
  }

  async function signOut() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Tidak dapat keluar.");
      setUser(null);
      setPage("about");
      setMessages([]);
      setChatError("");
    } catch (requestError) {
      setChatError(requestError.message);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage("home")} aria-label="Ke beranda">
          <span className="brand-mark">✓</span>
          <span>
            <strong>InfoPermintaan</strong>
            <small>Tracking pemasangan internet</small>
          </span>
        </button>
        <nav aria-label="Navigasi utama">
          <button className={page === "home" ? "nav-link active" : "nav-link"} onClick={() => setPage("home")}>
            Cek Permintaan
          </button>
          <button className={page === "about" ? "nav-link active" : "nav-link"} onClick={() => setPage("about")}>
            Tentang Kami
          </button>
        </nav>
      </header>

      <main>
        {page === "home" && (
          <section className="hero">
            <div className="hero-content">
              <span className="eyebrow"><span className="eyebrow-dot" /> LAYANAN PELANGGAN</span>
              <h1>Pantau permintaan<br /><span>pemasangan internet</span></h1>
              <p className="hero-copy">
                Cek perkembangan permintaan pemasangan Anda dengan mudah. Cukup masukkan nomor telepon yang didaftarkan.
              </p>

              <form className="search-card" onSubmit={checkRequest}>
                <label htmlFor="phone">Nomor telepon terdaftar</label>
                <div className="search-row">
                  <div className="input-wrap">
                    <span className="phone-icon" aria-hidden="true">⌕</span>
                    <input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      placeholder="Contoh: 081234567890"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                    />
                  </div>
                  <button className="primary-button" type="submit">Cek Status <span aria-hidden="true">→</span></button>
                </div>
                {error && <p className="form-error" role="alert">{error}</p>}
                <p className="privacy-note"><span aria-hidden="true">ⓘ</span> Nomor telepon Anda hanya digunakan untuk simulasi ini.</p>
              </form>

              {result && (
                <article className="result-card" aria-live="polite">
                  <div className="result-top">
                    <div>
                      <p className="result-label">HASIL SIMULASI</p>
                      <h2>{result.status}</h2>
                    </div>
                    <span className={`status-pill ${result.tone}`}>{result.step}</span>
                  </div>
                  <p className="result-detail">{result.detail}</p>
                  <div className="result-footer">
                    <span>Nomor referensi</span><strong>{result.reference}</strong>
                  </div>
                  <p className="demo-notice">Status ini dipilih secara acak dan bukan hasil pengecekan jaringan atau sistem resmi.</p>
                </article>
              )}
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="art-glow" />
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="signal-card">
                <div className="signal-icon"><span>⌁</span></div>
                <div className="signal-lines"><i /><i /><i /></div>
                <div className="signal-check">✓</div>
              </div>
              <span className="float-dot dot-one" /><span className="float-dot dot-two" />
            </div>
          </section>
        )}

        {page === "about" && (
          <section className="subpage">
            <span className="eyebrow"><span className="eyebrow-dot" /> TENTANG KAMI</span>
            <h1>Informasi layanan</h1>
            <p className="subpage-copy">
              InfoPermintaan adalah demo antarmuka untuk memantau permintaan pemasangan internet. Hasil pengecekan pada halaman ini adalah data simulasi.
            </p>
            <div className="about-card">
              <div className="about-icon">✦</div>
              <div>
                <h2>Butuh bantuan lebih lanjut?</h2>
                <p>Masuk atau buat akun untuk bergabung ke ruang chat bersama.</p>
                <button className="primary-button about-button" onClick={openChatLogin}>Buka ruang chat <span aria-hidden="true">→</span></button>
              </div>
            </div>
          </section>
        )}

        {page === "chat" && (
          <section className="subpage chat-page">
            <button className="back-link" onClick={() => setPage("about")}>← Kembali ke Tentang Kami</button>
            <div className="chat-heading">
              <div><span className="eyebrow"><span className="eyebrow-dot" /> RUANG CHAT</span><h1>Chat bersama</h1></div>
              <div className="chat-actions">
                <span className="demo-badge">BERSAMA</span>
                <button className="logout-button" onClick={signOut}>Keluar</button>
              </div>
            </div>
            <div className="chat-panel">
              <div className="chat-contact">
                <span className="avatar">C</span>
                <div><strong>Ruang bersama</strong><small>Masuk sebagai {user?.username}</small></div>
                <span className="online-dot" />
              </div>
              <div className="messages" aria-live="polite">
                {messages.map((message) => (
                  <div key={message.id} className={message.senderId === user?.id ? "message mine" : "message"}>
                    {message.senderId !== user?.id && <strong className="message-author">{message.username}</strong>}
                    <p>{message.text}</p>
                    <time>{new Date(message.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</time>
                  </div>
                ))}
              </div>
              {chatError && <p className="form-error chat-error" role="alert">{chatError}</p>}
              <form className="message-form" onSubmit={sendMessage}>
                <input
                  aria-label="Tulis pesan"
                  placeholder="Tulis pesan..."
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={1000}
                />
                <button className="send-button" type="submit" aria-label="Kirim pesan" disabled={sending || !draft.trim()}>↑</button>
              </form>
            </div>
            <p className="chat-disclaimer">Pesan disimpan di MongoDB. Percakapan diperbarui otomatis setiap beberapa detik.</p>
          </section>
        )}
      </main>

      <footer>
        <span>© 2026 InfoPermintaan · Demo antarmuka</span>
        <span>Status ditampilkan hanya untuk keperluan simulasi.</span>
      </footer>

      {showLogin && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowLogin(false);
        }}>
          <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
            <button className="close-button" onClick={() => setShowLogin(false)} aria-label="Tutup">×</button>
            <div className="modal-icon">↪</div>
            <span className="eyebrow"><span className="eyebrow-dot" /> VERIFIKASI ULANG</span>
            <h2 id="login-title">{authMode === "register" ? "Buat akun chat" : "Masuk untuk melanjutkan"}</h2>
            <p>{authMode === "register" ? "Buat akun untuk mengirim dan membaca pesan di ruang bersama." : "Masuk dengan akun Anda untuk membuka ruang chat."}</p>
            <form onSubmit={signIn}>
              <label htmlFor="username">Nama pengguna</label>
              <input id="username" autoComplete="username" minLength={3} maxLength={24} value={username} onChange={(event) => setUsername(event.target.value)} />
              <label htmlFor="password">Kata sandi</label>
              <input id="password" type="password" autoComplete={authMode === "register" ? "new-password" : "current-password"} minLength={authMode === "register" ? 10 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
              {loginError && <p className="form-error" role="alert">{loginError}</p>}
              <button className="primary-button modal-submit" type="submit">{authMode === "register" ? "Buat akun & masuk" : "Masuk ke chat"} <span aria-hidden="true">→</span></button>
            </form>
            <button className="auth-toggle" onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setLoginError(""); }}>
              {authMode === "register" ? "Sudah punya akun? Masuk" : "Belum punya akun? Buat akun"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
