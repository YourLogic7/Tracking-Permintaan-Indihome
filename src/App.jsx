import { useEffect, useRef, useState } from "react";
import CameraSession from "./CameraSession.jsx";

const MAX_CHAT_IMAGE_BYTES = 1024 * 1024;

async function prepareChatImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Pilih file gambar yang valid.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Ukuran foto asli maksimal 15 MB.");

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Foto tidak dapat diproses di browser ini.");

    let blob;
    for (const maxDimension of [1280, 1024, 800]) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.82, 0.68, 0.54]) {
        blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (!blob) throw new Error("Foto tidak dapat dikompres.");
        if (blob.size <= MAX_CHAT_IMAGE_BYTES) break;
      }
      if (blob.size <= MAX_CHAT_IMAGE_BYTES) break;
    }

    if (!blob || blob.size > MAX_CHAT_IMAGE_BYTES) {
      throw new Error("Foto terlalu besar setelah dikompres. Coba pilih foto lain.");
    }

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Foto tidak dapat dibaca."));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}

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
  const [cameraSessions, setCameraSessions] = useState([]);
  const [cameraRequestingUserId, setCameraRequestingUserId] = useState("");
  const [chatError, setChatError] = useState("");
  const [draft, setDraft] = useState("");
  const [chatImage, setChatImage] = useState("");
  const [preparingImage, setPreparingImage] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const messagesRequestId = useRef(0);
  const dismissedCameraSessionIds = useRef(new Set());
  const [accounts, setAccounts] = useState([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [accountPasswords, setAccountPasswords] = useState({});
  const [newAccount, setNewAccount] = useState({ username: "", password: "" });
  const [adminError, setAdminError] = useState("");
  const [adminNotice, setAdminNotice] = useState("");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const isAdmin = user?.role === "admin";

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
      const requestId = ++messagesRequestId.current;
      try {
        const response = await fetch("/api/messages");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Pesan tidak dapat dimuat.");
        if (active && requestId === messagesRequestId.current) {
          setMessages(data.messages);
          setChatError("");
        }
      } catch (requestError) {
        if (active && requestId === messagesRequestId.current) setChatError(requestError.message);
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

    if (page === "chat" && !clearingChat) loadMessages();
    else if (page === "admin") loadAccounts();
    const timer = page === "chat" && !clearingChat ? window.setInterval(loadMessages, 4000) : null;
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [page, clearingChat]);

  useEffect(() => {
    if (page !== "chat" || !user) {
      setCameraSessions([]);
      return undefined;
    }

    let active = true;
    async function loadCameraSessions() {
      try {
        const response = await fetch("/api/camera");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Sesi kamera tidak dapat dimuat.");
        if (active) {
          setCameraSessions(data.sessions.filter((cameraSession) => !dismissedCameraSessionIds.current.has(cameraSession.id)));
        }
      } catch (requestError) {
        if (active) setChatError(requestError.message);
      }
    }

    loadCameraSessions();
    const timer = window.setInterval(loadCameraSessions, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [page, user?.id, user?.role]);

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
        : "/api/auth/login";
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
      setReplyingTo(null);
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

  async function handleImageSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPreparingImage(true);
    setChatError("");
    try {
      setChatImage(await prepareChatImage(file));
    } catch (requestError) {
      setChatError(requestError.message || "Foto tidak dapat diproses.");
    } finally {
      setPreparingImage(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !chatImage) || sending || preparingImage || clearingChat || deletingMessageId) return;
    setSending(true);
    setChatError("");
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          ...(chatImage ? { imageData: chatImage } : {}),
          ...(replyingTo ? { replyToId: replyingTo.id } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pesan tidak dapat dikirim.");
      setMessages((current) => [...current, data.message]);
      setDraft("");
      setChatImage("");
      setReplyingTo(null);
    } catch (requestError) {
      setChatError(requestError.message);
    } finally {
      setSending(false);
    }
  }

  async function clearChat() {
    if (clearingChat || sending || deletingMessageId) return;
    if (!window.confirm("Hapus seluruh riwayat chat untuk semua pengguna? Tindakan ini tidak dapat dibatalkan.")) return;

    messagesRequestId.current += 1;
    setClearingChat(true);
    setChatError("");
    try {
      const response = await fetch("/api/messages", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Riwayat chat tidak dapat dihapus.");
      setMessages([]);
      setReplyingTo(null);
    } catch (requestError) {
      setChatError(requestError.message);
    } finally {
      setClearingChat(false);
    }
  }

  async function deleteMessage(message) {
    if (deletingMessageId || clearingChat || sending) return;
    if (!window.confirm("Hapus pesan ini dari ruang chat untuk semua pengguna?")) return;

    setDeletingMessageId(message.id);
    setChatError("");
    try {
      const response = await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pesan tidak dapat dihapus.");
      messagesRequestId.current += 1;
      setMessages((current) => current.filter((item) => item.id !== message.id));
      setReplyingTo((current) => current?.id === message.id ? null : current);
    } catch (requestError) {
      setChatError(requestError.message);
    } finally {
      setDeletingMessageId(null);
    }
  }

  async function requestCamera(targetUserId) {
    setCameraRequestingUserId(targetUserId);
    setChatError("");
    try {
      const response = await fetch("/api/camera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", targetUserId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Permintaan kamera tidak dapat dikirim.");
      setCameraSessions((current) => [data.session, ...current.filter((item) => item.id !== data.session.id)]);
    } catch (requestError) {
      setChatError(requestError.message);
    } finally {
      setCameraRequestingUserId("");
    }
  }

  function closeCameraSession(sessionId) {
    dismissedCameraSessionIds.current.add(sessionId);
    setCameraSessions((current) => current.filter((item) => item.id !== sessionId));
  }

  async function signOut() {
    const isAdmin = user?.role === "admin";
    try {
      for (const cameraSession of cameraSessions.filter((item) => ["requested", "accepted", "active"].includes(item.status))) {
        const stopResponse = await fetch("/api/camera", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", sessionId: cameraSession.id }),
        });
        if (!stopResponse.ok) throw new Error("Sesi kamera tidak dapat dihentikan. Hentikan kamera terlebih dahulu.");
      }
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Tidak dapat keluar.");
      setUser(null);
      setPage("about");
      setMessages([]);
      setReplyingTo(null);
      setChatImage("");
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
              <div className="chat-actions">
                <button className="small-action" onClick={() => setPage("chat")}>Masuk ruang chat</button>
                <button className="logout-button" onClick={signOut}>Keluar dari admin</button>
              </div>
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
            <button className="back-link" onClick={() => setPage(isAdmin ? "admin" : "about")}>
              {isAdmin ? "← Kembali ke Panel Admin" : "← Kembali ke Tentang Kami"}
            </button>
            <div className="chat-heading">
              <div><span className="eyebrow"><span className="eyebrow-dot" /> RUANG CHAT</span><h1>{isAdmin ? "Riwayat percakapan" : "Pelaporan Pengaduan"}</h1></div>
              <div className="chat-actions">
                <span className="demo-badge">BERSAMA</span>
                <button className="clear-chat-button" onClick={clearChat} disabled={clearingChat || sending || Boolean(deletingMessageId)}>
                  {clearingChat ? "Menghapus..." : "Hapus riwayat"}
                </button>
                {!isAdmin && (
                  <button className="logout-button" onClick={signOut}>Keluar</button>
                )}
              </div>
            </div>
            <div className="chat-panel">
              <div className="chat-contact">
                <span className="avatar">C</span>
                <div><strong>Ruang bersama</strong><small>{isAdmin ? "Mode admin · dapat mengirim pesan" : `Masuk sebagai ${user?.username}`}</small></div>
                <span className="online-dot" />
              </div>
              {cameraSessions.map((cameraSession) => (
                <CameraSession
                  key={cameraSession.id}
                  session={cameraSession}
                  isAdmin={isAdmin}
                  onClose={closeCameraSession}
                />
              ))}
              <div className="messages" aria-live="polite">
                {messages.map((message) => (
                  <div key={message.id} className={message.senderId === user?.id ? "message mine" : "message"}>
                    {message.senderId !== user?.id && <strong className="message-author">{message.username}</strong>}
                    {message.replyTo && (
                      <div className="message-reply-quote">
                        <strong>{message.replyTo.username}</strong>
                        <span>{message.replyTo.text || "Foto"}</span>
                      </div>
                    )}
                    {message.imageType && (
                      <img className="message-image" src={`/api/messages/${message.id}/image`} alt="Foto dalam pesan chat" loading="lazy" />
                    )}
                    {message.text && <p>{message.text}</p>}
                    <time>{new Date(message.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</time>
                    {message.senderId === user?.id && (
                      <span className="message-read-status">{message.isRead ? "Read" : "D"}</span>
                    )}
                    {!isAdmin && (
                      <div className="message-actions">
                        <button
                          className="reply-button"
                          type="button"
                          onClick={() => setReplyingTo(message)}
                          disabled={clearingChat || sending || Boolean(deletingMessageId)}
                        >
                          Balas
                        </button>
                        <button
                          className="delete-message-button"
                          type="button"
                          onClick={() => deleteMessage(message)}
                          disabled={clearingChat || sending || Boolean(deletingMessageId)}
                        >
                          {deletingMessageId === message.id ? "Menghapus..." : "Hapus"}
                        </button>
                      </div>
                    )}
                    {isAdmin && (
                      <div className="message-actions">
                        {message.senderId !== "admin" && (
                          <>
                            <button
                              className="reply-button"
                              type="button"
                              onClick={() => setReplyingTo(message)}
                              disabled={clearingChat || sending || Boolean(deletingMessageId)}
                            >
                              Balas
                            </button>
                            {(() => {
                              const existingSession = cameraSessions.find((item) => (
                                item.targetUserId === message.senderId && ["requested", "accepted", "active"].includes(item.status)
                              ));
                              const anotherSessionActive = cameraSessions.some((item) => (
                                ["requested", "accepted", "active"].includes(item.status)
                              ));
                              return (
                                <button
                                  className="camera-request-button"
                                  type="button"
                                  disabled={Boolean(existingSession) || anotherSessionActive || Boolean(cameraRequestingUserId)}
                                  onClick={() => requestCamera(message.senderId)}
                                >
                                  {cameraRequestingUserId === message.senderId
                                    ? "Mengirim permintaan..."
                                    : existingSession
                                      ? existingSession.status === "requested" ? "Menunggu persetujuan kamera" : "Sesi kamera aktif"
                                      : "Minta kamera depan"}
                                </button>
                                  );
                            })()}
                          </>
                        )}
                        <button
                          className="delete-message-button"
                          type="button"
                          onClick={() => deleteMessage(message)}
                          disabled={clearingChat || sending || Boolean(deletingMessageId)}
                        >
                          {deletingMessageId === message.id ? "Menghapus..." : "Hapus"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {chatError && <p className="form-error chat-error" role="alert">{chatError}</p>}
              {replyingTo && (
                <div className="replying-to">
                  <div>
                    <strong>Membalas {replyingTo.username}</strong>
                    <span>{replyingTo.text || "Foto"}</span>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} aria-label="Batalkan balasan">×</button>
                </div>
              )}
              {chatImage && (
                <div className="chat-image-preview">
                  <img src={chatImage} alt="Pratinjau foto yang akan dikirim" />
                  <button type="button" onClick={() => setChatImage("")} aria-label="Hapus foto">×</button>
                </div>
              )}
              <form className="message-form" onSubmit={sendMessage}>
                <label className="photo-button" aria-label="Pilih foto">
                  <span aria-hidden="true">＋</span>
                  <input
                    type="file"
                    accept="image/*"
                    aria-label="Pilih foto untuk dikirim"
                    disabled={sending || preparingImage || clearingChat}
                    onChange={handleImageSelection}
                  />
                </label>
                <label className="camera-button" aria-label="Ambil foto dengan kamera belakang" title="Kamera belakang">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    aria-label="Ambil foto dari kamera belakang"
                    disabled={sending || preparingImage || clearingChat}
                    onChange={handleImageSelection}
                  />
                </label>
                <label className="camera-button front-camera-button" aria-label="Ambil foto dengan kamera depan" title="Kamera depan">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
                    <circle cx="12" cy="11.5" r="1.5" />
                    <path d="M9.5 16a2.5 2.5 0 0 1 5 0" />
                  </svg>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    aria-label="Ambil foto dari kamera depan"
                    disabled={sending || preparingImage || clearingChat}
                    onChange={handleImageSelection}
                  />
                </label>
                <input
                  aria-label="Tulis pesan"
                  placeholder={preparingImage ? "Menyiapkan foto..." : "Tulis pesan..."}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={1000}
                />
                <button className="send-button" type="submit" aria-label="Kirim pesan" disabled={sending || preparingImage || clearingChat || (!draft.trim() && !chatImage)}>↑</button>
              </form>
            </div>
            <p className="chat-disclaimer">{isAdmin ? "Admin dapat menghapus satu pesan atau seluruh riwayat chat." : "Pesan disimpan di MongoDB. Percakapan diperbarui otomatis setiap beberapa detik."}</p>
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
            <h2 id="login-title">{authMode === "admin" ? "Masuk mode admin" : "Masuk untuk melanjutkan"}</h2>
            <p>{authMode === "admin" ? "Masukkan password admin yang sudah diatur di environment Vercel." : "Masuk dengan akun yang dibuat oleh admin untuk membuka ruang chat."}</p>
            <form onSubmit={signIn}>
              {authMode !== "admin" && <>
                <label htmlFor="username">Nama pengguna</label>
                <input id="username" autoComplete="username" minLength={3} maxLength={24} value={username} onChange={(event) => setUsername(event.target.value)} />
              </>}
              <label htmlFor="password">{authMode === "admin" ? "Password admin" : "Kata sandi"}</label>
              <input id="password" type="password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
              {loginError && <p className="form-error" role="alert">{loginError}</p>}
              <button className="primary-button modal-submit" type="submit">{authMode === "admin" ? "Masuk admin" : "Masuk ke chat"} <span aria-hidden="true">→</span></button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
