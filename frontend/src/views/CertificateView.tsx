import { useEffect, useState } from 'react'
import { api, ApiError, type BadgeCertificate } from '../lib/api'
import { BrandMark } from '../components/BrandMark'
import { ThemeToggle } from '../components/ThemeToggle'
import { TierBadgeCard } from '../components/TierBadgeCard'
import { card, ghostButton, primaryButton } from '../lib/ui'
import type { Theme } from '../lib/theme'
import { TREES, type Tree } from '../lib/types'

/**
 * Public certificate page, reached via a ?cert=<id> deep link. No auth:
 * the unguessable id is the capability, and the learner created the
 * certificate knowing it would be public.
 *
 * What this page must communicate, in order: (1) whether the certificate
 * is authentic, (2) what exactly it certifies (mission completion checked
 * server-side; the pilot name is self-chosen, not a legal identity), and
 * (3) how a skeptic can verify it without trusting this page, via the
 * embedded Nostr event and the server's signing pubkey.
 */
export default function CertificateView({
    theme,
    onToggleTheme,
    certId,
    onHome,
}: {
    theme: Theme
    onToggleTheme: () => void
    certId: string
    onHome: () => void
}) {
    const [cert, setCert] = useState<BadgeCertificate | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        api.getCertificate(certId)
            .then((c) => {
                if (!cancelled) setCert(c)
            })
            .catch((e) => {
                if (cancelled) return
                if (e instanceof ApiError && e.status === 404) {
                    setError('No certificate found for this link. Check that the full link was copied.')
                } else {
                    setError(e instanceof Error ? e.message : 'Could not load the certificate.')
                }
            })
        return () => {
            cancelled = true
        }
    }, [certId])

    const fmtDate = (unixSeconds: number) =>
        new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })

    // The wire tree slug is validated against the known flight paths so a
    // bad row can never index THEMES with an unknown key.
    const treeKey: Tree = TREES.some((t) => t.key === cert?.tree)
        ? (cert!.tree as Tree)
        : 'money'

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    gap: 8,
                }}
            >
                <button onClick={onHome} style={{ ...ghostButton, padding: '8px 14px', minHeight: 40 }} aria-label="Go to the BitPilot home page">
                    ← BitPilot
                </button>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>

            <main
                id="main-content"
                style={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    padding: 'clamp(1rem, 4vw, 2rem)',
                }}
            >
                <div style={{ width: '100%', maxWidth: 560 }}>
                    {error ? (
                        <div style={{ ...card, padding: 'clamp(20px, 5vw, 32px)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                <BrandMark size={32} />
                                <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Certificate not found</h1>
                            </div>
                            <p role="alert" style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>{error}</p>
                            <button style={{ ...primaryButton(false), marginTop: 12 }} onClick={onHome}>
                                Go to BitPilot
                            </button>
                        </div>
                    ) : !cert ? (
                        <div style={{ ...card, padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }} aria-busy="true">
                            Checking the certificate…
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Verdict banner first: the one thing a visitor came to learn. */}
                            <div
                                role="status"
                                style={{
                                    ...card,
                                    padding: '14px 18px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    border: cert.signature_valid
                                        ? '1px solid rgba(16, 197, 126, 0.45)'
                                        : '1px solid rgba(248, 113, 113, 0.45)',
                                }}
                            >
                                <span aria-hidden="true" style={{ fontSize: 22 }}>
                                    {cert.signature_valid ? '✅' : '⚠️'}
                                </span>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: 15 }}>
                                        {cert.signature_valid ? 'Verified certificate' : 'Signature check failed'}
                                    </div>
                                    <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                                        {cert.signature_valid
                                            ? 'The cryptographic signature on this record checks out.'
                                            : 'Do not trust this record. Its signature does not match its contents.'}
                                    </div>
                                </div>
                            </div>

                            {/* The badge itself. */}
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <div style={{ width: '100%', maxWidth: 340, aspectRatio: '600 / 800', display: 'flex' }}>
                                    <TierBadgeCard
                                        tree={treeKey}
                                        participantName={cert.participant_name}
                                        earnedAt={cert.earned_at}
                                        badgeId={`BP-CERT-${cert.id.slice(0, 8).toUpperCase()}`}
                                        fluid
                                    />
                                </div>
                            </div>

                            <div style={{ ...card, padding: 'clamp(18px, 4vw, 26px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <h1 style={{ fontSize: 'clamp(18px, 4.5vw, 22px)', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
                                    {cert.participant_name} earned the {cert.rank} badge
                                </h1>
                                <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
                                    BitPilot checked every one of the {cert.missions_completed} missions
                                    in the {cert.tree_label} flight path on the server as it was
                                    completed. The pilot name is self-chosen; this certificate proves
                                    the work, not a legal identity.
                                </p>
                                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 16, rowGap: 8, fontSize: 13.5 }}>
                                    <dt style={{ color: 'var(--muted)', fontWeight: 600 }}>Pilot</dt>
                                    <dd style={{ margin: 0, fontWeight: 700 }}>{cert.participant_name}</dd>
                                    <dt style={{ color: 'var(--muted)', fontWeight: 600 }}>Flight path</dt>
                                    <dd style={{ margin: 0 }}>{cert.tree_label}</dd>
                                    <dt style={{ color: 'var(--muted)', fontWeight: 600 }}>Missions verified</dt>
                                    <dd style={{ margin: 0 }}>{cert.missions_completed} of {cert.missions_completed}</dd>
                                    <dt style={{ color: 'var(--muted)', fontWeight: 600 }}>Badge earned</dt>
                                    <dd style={{ margin: 0 }}>{fmtDate(cert.earned_at)}</dd>
                                    <dt style={{ color: 'var(--muted)', fontWeight: 600 }}>Certified</dt>
                                    <dd style={{ margin: 0 }}>{fmtDate(cert.issued_at)}</dd>
                                    <dt style={{ color: 'var(--muted)', fontWeight: 600 }}>Certificate id</dt>
                                    <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all' }}>{cert.id}</dd>
                                </dl>

                                {/* Independent verification: everything a skeptic needs
                                    to check this without trusting the page. */}
                                <details>
                                    <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                                        Verify it yourself
                                    </summary>
                                    <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <p style={{ margin: 0 }}>
                                            This certificate is a Nostr event (kind 8, badge award)
                                            signed by BitPilot's certificate key. Paste the event
                                            below into any tool that checks Nostr signatures; the
                                            signature covers every field, so nothing can be altered
                                            without breaking it.
                                        </p>
                                        <div>
                                            <div style={{ fontWeight: 700, marginBottom: 2 }}>Signed by</div>
                                            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' }}>{cert.server_npub}</code>
                                        </div>
                                        <pre
                                            style={{
                                                margin: 0,
                                                padding: 12,
                                                background: 'var(--bg)',
                                                border: '1px solid var(--border)',
                                                borderRadius: 'var(--radius-2)',
                                                fontSize: 10.5,
                                                lineHeight: 1.5,
                                                overflowX: 'auto',
                                            }}
                                        >
                                            {JSON.stringify(cert.event, null, 2)}
                                        </pre>
                                    </div>
                                </details>
                            </div>

                            <button className="bp-press" style={{ ...primaryButton(false), minHeight: 48, fontSize: 15 }} onClick={onHome}>
                                Learn Bitcoin by doing, free on BitPilot
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
