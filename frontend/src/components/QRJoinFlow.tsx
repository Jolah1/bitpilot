import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QRSessionCard({ sessionId, sessionName }: { sessionId: string; sessionName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const joinUrl = `${window.location.origin}/join/${sessionId}`;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, joinUrl, { width: 200, margin: 1 });
    }
  }, [joinUrl]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "1.5rem", border: "1px solid var(--border)", borderRadius: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-muted)" }}>Join Session</span>
        <span style={{ background: "var(--bitcoin-orange)", color: "#000", padding: "2px 8px", borderRadius: "4px", fontWeight: 600, fontSize: "0.75rem" }}>{sessionName}</span>
      </div>
      <div style={{ padding: "8px", background: "#fff", borderRadius: "8px" }}>
        <canvas ref={canvasRef} style={{ display: "block", borderRadius: "4px" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", border: "1px solid var(--border)", borderRadius: "6px", padding: "6px 10px", maxWidth: "260px" }}>
        <code style={{ fontSize: "0.65rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{joinUrl}</code>
        <button onClick={copyLink} style={{ fontSize: "0.65rem", background: "transparent", border: "none", color: copied ? "#22c55e" : "var(--bitcoin-orange)", cursor: "pointer" }}>
          {copied ? "✓ Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

export function JoinPage({ sessionId }: { sessionId: string }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [sessionInfo, setSessionInfo] = useState<{ name: string } | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then(r => r.json())
      .then(d => setSessionInfo({ name: d.name }))
      .catch(() => setSessionInfo({ name: "BitPilot Session" }));
  }, [sessionId]);

  const handleJoin = async () => {
    if (!name.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), session_id: sessionId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      localStorage.setItem("bitpilot_participant_id", data.id);
      localStorage.setItem("bitpilot_session_id", sessionId);
      setStatus("success");
      setTimeout(() => { window.location.href = `/learn/${sessionId}/${data.id}`; }, 1200);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to join");
      setStatus("error");
    }
  };

  return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: "1.5rem" }}>
      <div style={{ border: "1px solid var(--border)", borderRadius: "16px", padding: "2rem", width: "100%", maxWidth: "400px", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.5rem", color: "var(--bitcoin-orange)" }}>⚡</span>
          <span style={{ fontSize: "1.25rem", fontWeight: 700 }}>BitPilot</span>
        </div>
        {sessionInfo && (
          <div>
            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", color: "var(--text-muted)" }}>Joining session</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--bitcoin-orange)" }}>{sessionInfo.name}</div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-muted)" }}>Your name</label>
          <input
            type="text" placeholder="Satoshi" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleJoin()}
            disabled={status === "loading" || status === "success"}
            autoFocus
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px", fontSize: "0.95rem", outline: "none", boxSizing: "border-box" as const }}
          />
          <button
            onClick={handleJoin}
            disabled={!name.trim() || status === "loading" || status === "success"}
            style={{ padding: "12px", background: status === "success" ? "#22c55e" : "var(--bitcoin-orange)", color: "#000", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer" }}
          >
            {status === "success" ? "Joined! Starting…" : status === "loading" ? "Joining…" : "Join & Earn Sats →"}
          </button>
          {status === "error" && <p style={{ fontSize: "0.7rem", color: "#ef4444", margin: 0 }}>{errorMsg}</p>}
        </div>
        <p style={{ fontSize: "0.65rem", color: "var(--text-muted)", textAlign: "center", margin: 0 }}>Real Bitcoin. Real Lightning. Real Nostr.</p>
      </div>
    </div>
  );
}
