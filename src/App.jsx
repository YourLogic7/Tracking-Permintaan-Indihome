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
  const [accounts, setAccounts] = useState([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [accountPasswords, setAccountPasswords] = useState({});
  const [newAccount, setNewAccount] = useState({ username: "", password: "" });
  const [adminError, setAdminError] = useState("");
  const [adminNotice, setAdminNotice] = useState("");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const response = await fetch("/api/auth/me");
        if (response.status === 401) return;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Sesi tidak dapat dipulihkan.");
        if (active) {
          setUser(data.user);
          setPage(data.user.role === "admin" ? "admin" : "chat");
        }
      } catch (requestError) {
        console.error("Session restoration failed:", requestError);
      }
    }

    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (page !== "chat" && page !== "admin") return undefined;

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

    async function loadAccounts() {
      try {
        const response = await fetch("/api/admin/users");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Daftar akun tidak dapat dimuat.");
        if (active) {
          setAccounts(data);
          setAccountsLoaded(true);
          setAdminError("");
        }
      } catch (requestError) {
        if (active) setAdminError(requestError.message);
      }
    }

    if (page === "chat") loadMessages();
    else loadAccounts();
    const timer = page === "chat" ? window.setInterval(loadMessages, 4000) : null;
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
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

  function openAdminLogin() {
    setShowLogin(true);
    setLoginError("");
    setUsername("");
    setPassword("");
    setAuthMode("admin");
  }

  async function signIn(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const endpoint = authMode === "admin"
        ? "/api/admin/login"
        : `/api/auth/${authMode === "register" ? "register" : "login"}`;
      const body = authMode === "admin" ? { password } : { username, password };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Tidak dapat masuk.");
      setUser(data.user);
      setMessages([]);
      setChatError("");
      setAdminError("");
      setAdminNotice("");
      setAccountsLoaded(false);
      setShowLogin(false);
      setPage(authMode === "admin" ? "admin" : "chat");
    } catch (requestError) {
      setLoginError(requestError.message);
    }
  }

  async function refreshAccounts() {
    const response = await fetch("/api/admin/users");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Daftar akun tidak dapat dimuat.");
    setAccounts(data);
    setAccountsLoaded(true);
  }

  async function createAccount(event) {
    event.preventDefault();
    setAdminError("");
    setAdminNotice("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAccount),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Akun tidak dapat dibuat.");
      setNewAccount({ username: "", password: "" });
      setAdminNotice(`Akun ${data.user.username} berhasil dibuat.`);
      await refreshAccounts();
    } catch (requestError) {
      setAdminError(requestError.message);
    }
  }

  async function resetAccountPassword(id, username) {
    const password = accountPasswords[id] || "";
    setAdminError("");
    setAdminNotice("");
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kata sandi tidak dapat diperbarui.");
      setAccountPasswords((current) => ({ ...current, [id]: "" }));
      setAdminNotice(`Kata sandi akun ${username} berhasil diperbarui.`);
    } catch (requestError) {
      setAdminError(requestError.message);
    }
  }

  async function removeAccount(account) {
    if (!window.confirm(`Hapus akun ${account.username}?`)) return;
    setAdminError("");
    setAdminNotice("");
    try {
      const response = await fetch(`/api/admin/users/${account.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Akun tidak dapat dihapus.");
      setAdminNotice(`Akun ${account.username} berhasil dihapus.`);
      await refreshAccounts();
    } catch (requestError) {
      setAdminError(requestError.message);
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
    const isAdmin = user?.role === "admin";
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Tidak dapat keluar.");
      setUser(null);
      setPage("about");
      setMessages([]);
      setChatError("");
      setAdminError("");
      setAdminNotice("");
    } catch (requestError) {
      if (isAdmin) setAdminError(requestError.message);
      else setChatError(requestError.message);
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
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setDarkMode((current) => !current)}
            aria-pressed={darkMode}
            aria-label={darkMode ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
          >
            <span aria-hidden="true">{darkMode ? "☀" : "☾"}</span>
            <span className="theme-toggle-label">{darkMode ? "Mode terang" : "Mode gelap"}</span>
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
                <button className="admin-entry" onClick={openAdminLogin}>Mode admin</button>
              </div>
            </div>
          </section>
        )}

        {page === "admin" && (
          <section className="subpage admin-page">
            <button className="back-link" onClick={() => setPage("about")}>← Kembali ke Tentang Kami</button>
            <div className="chat-heading">
              <div><span className="eyebrow"><span className="eyebrow-dot" /> PANEL ADMIN</span><h1>Kelola akun</h1></div>
              <button className="logout-button" onClick={signOut}>Keluar dari admin</button>
            </div>
            <p className="subpage-copy">Buat akun pengguna, perbarui kata sandi, atau hapus akun yang sudah terdaftar.</p>
            <form className="account-create-card" onSubmit={createAccount}>
              <h2>Buat akun pengguna</h2>
              <div className="account-create-fields">
                <label>Nama pengguna
                  <input minLength={3} maxLength={24} placeholder="contoh: nama_pengguna" value={newAccount.username} onChange={(event) => setNewAccount((current) => ({ ...current, username: event.target.value }))} required />
                </label>
                <label>Kata sandi sementara
                  <input type="password" minLength={10} maxLength={128} placeholder="Minimal 10 karakter" value={newAccount.password} onChange={(event) => setNewAccount((current) => ({ ...current, password: event.target.value }))} required />
                </label>
                <button className="primary-button" type="submit">Buat akun <span aria-hidden="true">→</span></button>
              </div>
            </form>
            {adminError && <p className="form-error admin-feedback" role="alert">{adminError}</p>}
            {adminNotice && <p className="admin-notice" role="status">{adminNotice}</p>}
            <div className="accounts-card">
              <h2>Akun terdaftar <span>{accounts.length}</span></h2>
              {accounts.length === 0 ? (
                <p className="accounts-empty">{accountsLoaded ? "Belum ada akun terdaftar." : "Memuat daftar akun..."}</p>
              ) : (
                <div className="accounts-list">
                  {accounts.map((account) => (
                    <div className="account-row" key={account.id}>
                      <div className="account-identity">
                        <span className="avatar">{account.username.slice(0, 1).toUpperCase()}</span>
                        <div><strong>{account.username}</strong><small>Bergabung {new Date(account.createdAt).toLocaleDateString("id-ID")}</small></div>
                      </div>
                      <div className="account-controls">
                        <input
                          aria-label={`Kata sandi baru untuk ${account.username}`}
                          type="password"
                          minLength={10}
                          maxLength={128}
                          placeholder="Kata sandi baru"
                          value={accountPasswords[account.id] || ""}
                          onChange={(event) => setAccountPasswords((current) => ({ ...current, [account.id]: event.target.value }))}
                        />
                        <button className="small-action" disabled={(accountPasswords[account.id] || "").length < 10} onClick={() => resetAccountPassword(account.id, account.username)}>Simpan sandi</button>
                        <button className="small-action danger" onClick={() => removeAccount(account)}>Hapus</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
            <h2 id="login-title">{authMode === "admin" ? "Masuk mode admin" : authMode === "register" ? "Buat akun chat" : "Masuk untuk melanjutkan"}</h2>
            <p>{authMode === "admin" ? "Masukkan password admin yang sudah diatur di environment Vercel." : authMode === "register" ? "Buat akun untuk mengirim dan membaca pesan di ruang bersama." : "Masuk dengan akun Anda untuk membuka ruang chat."}</p>
            <form onSubmit={signIn}>
              {authMode !== "admin" && <>
                <label htmlFor="username">Nama pengguna</label>
                <input id="username" autoComplete="username" minLength={3} maxLength={24} value={username} onChange={(event) => setUsername(event.target.value)} />
              </>}
              <label htmlFor="password">{authMode === "admin" ? "Password admin" : "Kata sandi"}</label>
              <input id="password" type="password" autoComplete={authMode === "register" ? "new-password" : "current-password"} minLength={authMode === "register" ? 10 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
              {loginError && <p className="form-error" role="alert">{loginError}</p>}
              <button className="primary-button modal-submit" type="submit">{authMode === "admin" ? "Masuk admin" : authMode === "register" ? "Buat akun & masuk" : "Masuk ke chat"} <span aria-hidden="true">→</span></button>
            </form>
            {authMode !== "admin" && <button className="auth-toggle" onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setLoginError(""); }}>
              {authMode === "register" ? "Sudah punya akun? Masuk" : "Belum punya akun? Buat akun"}
            </button>}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
