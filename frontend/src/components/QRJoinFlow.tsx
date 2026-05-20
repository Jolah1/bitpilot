import { useCallback, useState } from 'react'
import QRCode from 'qrcode'
import { chip, ghostButton } from '../lib/ui'

/**
 * QR code + shareable link for a session.
 *
 * The join URL is `${origin}/?session=<id>`. The App component parses the
 * `session` query param on mount (see App.tsx:rehydrate) and takes the
 * participant straight to the setup screen with the session pre-filled.
 *
 * Rendering note: we draw the QR via a *callback ref*, not a useEffect, so
 * the QR appears the instant the canvas element mounts. The previous
 * implementation used `useRef + useEffect([joinUrl])` which fired before
 * the canvas existed — the ref was null at effect time, the effect's
 * dependency (`joinUrl`) never changed afterwards, and the QR never drew.
 */
export function QRSessionCard({
    sessionId,
    sessionName,
}: {
    sessionId: string
    sessionName: string
}) {
    const joinUrl = `${window.location.origin}/?session=${sessionId}`
    const [copied, setCopied] = useState(false)

    // Draw the QR as soon as the canvas element is in the DOM. React calls
    // this with the node on mount and with null on unmount, so it doesn't
    // matter what order the parent decides to mount us in.
    const canvasRef = useCallback(
        (node: HTMLCanvasElement | null) => {
            if (!node) return
            QRCode.toCanvas(node, joinUrl, {
                width: 200,
                margin: 1,
                color: { dark: '#0A0A0B', light: '#FFFFFF' },
            }).catch((err) => {
                // We'd rather log + keep the page alive than crash on a
                // bad join URL. The link below is still copyable.
                // eslint-disable-next-line no-console
                console.warn('QR render failed:', err)
            })
        },
        [joinUrl],
    )

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(joinUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard API can be blocked (insecure context, iframe perms).
            // The link is still visible in the code element below.
        }
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 14,
                padding: 22,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-3)',
                background: 'var(--surface)',
                maxWidth: 320,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={chip('neutral')}>Join Session</span>
                <span style={chip('orange')}>{sessionName}</span>
            </div>
            <div style={{ padding: 8, background: '#FFFFFF', borderRadius: 'var(--radius-2)' }}>
                <canvas ref={canvasRef} style={{ display: 'block' }} aria-label="QR code with join link" />
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-1)',
                    padding: '6px 10px',
                    width: '100%',
                    maxWidth: 280,
                    boxSizing: 'border-box',
                    background: 'var(--bg)',
                }}
            >
                <code
                    style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        fontFamily: 'var(--font-mono)',
                    }}
                >
                    {joinUrl}
                </code>
                <button
                    onClick={copyLink}
                    style={{ ...ghostButton, padding: '4px 10px', fontSize: 11 }}
                    aria-label={copied ? 'Link copied' : 'Copy join link'}
                >
                    {copied ? '✓ Copied' : 'Copy'}
                </button>
            </div>
        </div>
    )
}
