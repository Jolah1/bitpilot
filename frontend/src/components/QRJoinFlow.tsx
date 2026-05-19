import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { chip, ghostButton } from '../lib/ui'

/**
 * QR code + shareable link for a session.
 *
 * NOTE: the join URL points to `/join/:sessionId`, but there is no router
 * wired up to handle that path. For now this is a presentational helper
 * for sessions run on the same device — facilitators read the link out, or
 * use the copy button.
 */
export function QRSessionCard({
    sessionId,
    sessionName,
}: {
    sessionId: string
    sessionName: string
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const joinUrl = `${window.location.origin}/?session=${sessionId}`
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (canvasRef.current) {
            QRCode.toCanvas(canvasRef.current, joinUrl, {
                width: 200,
                margin: 1,
                color: { dark: '#0A0A0B', light: '#FFFFFF' },
            }).catch(() => { /* swallow — bad join URL shouldn't crash the page */ })
        }
    }, [joinUrl])

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(joinUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard API can be blocked. We still show the link inline so
            // the user can copy it manually.
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
