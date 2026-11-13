import { useEffect, useRef, useState } from "react";

async function postCamera(body) {
  const response = await fetch("/api/camera", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Sesi kamera tidak dapat diperbarui.");
  return data;
}

function CameraSession({ session, isAdmin, onClose }) {
  const [remoteStream, setRemoteStream] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const pollTimerRef = useRef(null);
  const pollBusyRef = useRef(false);
  const pollFailuresRef = useRef(0);
  const cursorRef = useRef("");
  const stoppedRef = useRef(false);
  const pendingCandidatesRef = useRef([]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  async function sendSignal(type, data) {
    await postCamera({ action: "signal", sessionId: session.id, type, data });
  }

  function createPeer(stream) {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peerRef.current = peer;
    peer.onicecandidate = (event) => {
      if (event.candidate && !stoppedRef.current) {
        sendSignal("candidate", event.candidate.toJSON()).catch((requestError) => {
          if (!stoppedRef.current) setError(requestError.message);
        });
      }
    };
    peer.ontrack = (event) => {
      setRemoteStream(event.streams[0] || new MediaStream([event.track]));
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") {
        setError("Koneksi video gagal. Coba minta akses kamera kembali.");
      }
    };
    if (stream) {
      for (const track of stream.getTracks()) peer.addTrack(track, stream);
    } else {
      peer.addTransceiver("video", { direction: "recvonly" });
    }
    return peer;
  }

  async function handleSignal(signal, peer) {
    if (signal.type === "offer" && !isAdmin) {
      await peer.setRemoteDescription(signal.data);
      for (const candidate of pendingCandidatesRef.current) {
        await peer.addIceCandidate(candidate);
      }
      pendingCandidatesRef.current = [];
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal("answer", peer.localDescription);
    } else if (signal.type === "answer" && isAdmin) {
      await peer.setRemoteDescription(signal.data);
      for (const candidate of pendingCandidatesRef.current) {
        await peer.addIceCandidate(candidate);
      }
      pendingCandidatesRef.current = [];
    } else if (signal.type === "candidate") {
      const candidate = new RTCIceCandidate(signal.data);
      if (peer.remoteDescription) await peer.addIceCandidate(candidate);
      else pendingCandidatesRef.current.push(candidate);
    }
  }

  function startPolling(peer) {
    if (pollTimerRef.current) return;
    const poll = async () => {
      if (pollBusyRef.current || stoppedRef.current) return;
      pollBusyRef.current = true;
      try {
        const query = new URLSearchParams({ sessionId: session.id });
        if (cursorRef.current) query.set("after", cursorRef.current);
        const response = await fetch(`/api/camera?${query}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Sinyal video tidak dapat dimuat.");
        if (stoppedRef.current) return;
        pollFailuresRef.current = 0;
        if (["ended", "rejected"].includes(data.session.status)) {
          stopPeer();
          onClose(session.id);
          return;
        }
        for (const signal of data.signals) {
          cursorRef.current = signal.id;
          if (signal.senderRole !== (isAdmin ? "admin" : "user")) {
            await handleSignal(signal, peer);
          }
        }
        setError("");
      } catch (requestError) {
        if (!stoppedRef.current) {
          setError(requestError.message);
          pollFailuresRef.current += 1;
          if (pollFailuresRef.current >= 5) {
            stopPeer();
            postCamera({ action: "stop", sessionId: session.id }).catch(() => {});
            onClose(session.id);
          }
        }
      } finally {
        pollBusyRef.current = false;
      }
    };
    poll();
    pollTimerRef.current = window.setInterval(poll, 1200);
  }

  function stopPeer(updateUi = true) {
    stoppedRef.current = true;
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (updateUi) {
      setRemoteStream(null);
    }
  }

  useEffect(() => {
    if (!isAdmin || !["accepted", "active"].includes(session.status) || peerRef.current) return;
    stoppedRef.current = false;
    try {
      if (!window.RTCPeerConnection) throw new Error("Browser ini tidak mendukung video real-time.");
      const peer = createPeer(null);
      startPolling(peer);
      peer.createOffer()
        .then((offer) => peer.setLocalDescription(offer))
        .then(() => sendSignal("offer", peer.localDescription))
        .catch((requestError) => {
          setError(requestError.message);
          stopPeer();
        });
    } catch (requestError) {
      setError(requestError.message);
      stopPeer();
    }
  }, [session.id, session.status, isAdmin]);

  useEffect(() => () => {
    const shouldNotify = !stoppedRef.current;
    stopPeer(false);
    if (shouldNotify) {
      postCamera({ action: "stop", sessionId: session.id }).catch(() => {});
    }
  }, [session.id]);

  async function acceptRequest() {
    setBusy(true);
    setError("");
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Browser ini tidak mendukung akses kamera. Buka aplikasi melalui HTTPS.");
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" } },
        audio: false,
      });
      await postCamera({ action: "accept", sessionId: session.id });
      stoppedRef.current = false;
      streamRef.current = stream;
      const peer = createPeer(stream);
      startPolling(peer);
    } catch (requestError) {
      stream?.getTracks().forEach((track) => track.stop());
      setError(requestError.message || "Kamera tidak dapat diakses.");
      if (stream) {
        postCamera({ action: "stop", sessionId: session.id }).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  async function finish(action) {
    setBusy(true);
    setError("");
    try {
      await postCamera({ action, sessionId: session.id });
      stopPeer();
      onClose(session.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const title = isAdmin
    ? `Kamera depan · ${session.username}`
    : "Permintaan akses kamera depan";

  return (
    <section className="camera-session" aria-live="polite">
      <div className="camera-session-heading">
        <div>
          <strong>{title}</strong>
          <small>
            {session.status === "requested" && isAdmin && "Menunggu persetujuan user."}
            {session.status === "requested" && !isAdmin && "Admin meminta akses kamera. Kamera belum aktif."}
            {session.status === "accepted" && "Menghubungkan video..."}
            {session.status === "active" && "Streaming aktif · hanya terlihat oleh admin."}
            {session.status === "rejected" && "Permintaan ditolak oleh user."}
            {session.status === "ended" && "Sesi kamera telah berakhir."}
          </small>
        </div>
        {["accepted", "active"].includes(session.status) && <span className="camera-live-badge">KAMERA AKTIF</span>}
      </div>
      {isAdmin && ["accepted", "active"].includes(session.status) && (
        <video
          ref={remoteVideoRef}
          className="camera-video"
          autoPlay
          playsInline
          aria-label={`Video kamera depan ${session.username}`}
        />
      )}
      {error && <p className="camera-error" role="alert">{error}</p>}
      <div className="camera-session-actions">
        {session.status === "requested" && !isAdmin && (
          <>
            <button type="button" className="camera-allow-button" disabled={busy} onClick={acceptRequest}>
              {busy ? "Meminta izin kamera..." : "Izinkan kamera depan"}
            </button>
            <button type="button" className="camera-stop-button" disabled={busy} onClick={() => finish("reject")}>Tolak</button>
          </>
        )}
        {session.status === "requested" && isAdmin && (
          <button type="button" className="camera-stop-button" disabled={busy} onClick={() => finish("stop")}>Batalkan permintaan</button>
        )}
        {["accepted", "active"].includes(session.status) && (
          <button type="button" className="camera-stop-button" disabled={busy} onClick={() => finish("stop")}>
            {busy ? "Menghentikan..." : "Hentikan kamera"}
          </button>
        )}
        {["rejected", "ended"].includes(session.status) && (
          <button type="button" className="camera-stop-button" onClick={() => onClose(session.id)}>Tutup</button>
        )}
      </div>
    </section>
  );
}

export default CameraSession;
