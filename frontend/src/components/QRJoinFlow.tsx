import { useState } from 'react'
import { LogoQRCanvas } from './LogoQR'
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
 * the canvas existed, the ref was null at effect time, the effect's
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
                <LogoQRCanvas value={joinUrl} size={200} ariaLabel="QR code with join link" />
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
