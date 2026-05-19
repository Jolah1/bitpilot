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
        <span style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--muted)" }}>Join Session</span>
        <span style={{ background: "var(--bitcoin)", color: "#000", padding: "2px 8px", borderRadius: "4px", fontWeight: 600, fontSize: "0.75rem" }}>{sessionName}</span>
      </div>
      <div style={{ padding: "8px", background: "#fff", borderRadius: "8px" }}>
        <canvas ref={canvasRef} style={{ display: "block", borderRadius: "4px" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", border: "1px solid var(--border)", borderRadius: "6px", padding: "6px 10px", maxWidth: "260px" }}>
        <code style={{ fontSize: "0.65rem", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{joinUrl}</code>
        <button onClick={copyLink} style={{ fontSize: "0.65rem", background: "transparent", border: "none", color: copied ? "#22c55e" : "var(--bitcoin)", cursor: "pointer" }}>
          {copied ? "✓ Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
