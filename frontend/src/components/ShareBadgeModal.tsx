/**
 * Modal that displays the TierBadgeCard and offers download/share actions.
 *
 * Why client-side rasterization: the badge is purely a function of the
 * participant's name, tree, earned-at, and id, no server roundtrip needed.
 * SVG download serializes the in-DOM <svg>; PNG download draws that SVG
 * onto a 1200x1600 offscreen canvas (2x retina) for a crisp social-share
 * image. No third-party libs.
 *
 * "Share on X" tries the Web Share API first with the PNG as a File. That
 * lets mobile and Safari attach the image directly to the tweet draft —
 * the most common share path today. When Web Share isn't supported (most
 * desktop Chrome/Firefox), we fall back to downloading the PNG AND
 * opening the X compose URL so the user can drag the image into the
 * tweet. Either way the image ends up in the post.
 */
import { useEffect, useRef, useState } from 'react'
import type { Badge } from '../lib/types'
import { useFocusTrap } from '../lib/useFocusTrap'
import { TierBadgeCard, badgeIdFor, rankTitleFor } from './TierBadgeCard'
import { getNsec } from '../lib/auth'
import { signNostrTextNote } from '../lib/crypto'
import { api, type BadgeCertificate } from '../lib/api'

const PNG_SCALE = 2 // 2x the 600x800 SVG => 1200x1600 PNG

// Public share caption. Deliberately omits the badge id: it used to embed a
// fragment derivable from the participant, and a public post is the last
// place that belongs. The certificate link is different: the learner
// explicitly created it to be public proof, so once one exists it rides
// along in shares.
function buildShareText(tree: Badge['tree'], certUrl: string | null): string {
    const base = `I just earned my ${rankTitleFor(tree)} badge on BitPilot, learning Bitcoin by doing.`
    return certUrl ? `${base} Verify it: ${certUrl}` : base
}

export function ShareBadgeModal({
    badge,
    participantId,
    participantName,
    onClose,
}: {
    badge: Badge
    participantId: string
    participantName: string
    onClose: () => void
}) {
    const svgRef = useRef<SVGSVGElement | null>(null)
    const dialogRef = useRef<HTMLDivElement | null>(null)
    const [downloading, setDownloading] = useState<'png' | 'svg' | 'share' | 'nostr' | 'cert' | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    // Verifiable certificate for this badge, once the learner asks for one.
    // Issuance is idempotent server-side, so re-clicking is harmless.
    const [cert, setCert] = useState<BadgeCertificate | null>(null)
    const [certCopied, setCertCopied] = useState(false)
    // Which public share the learner has asked for and is being asked to
    // confirm. Public posts are permanent and de-anonymising, so they pass
    // through a confirmation step; the local PNG/SVG downloads do not.
    const [pendingShare, setPendingShare] = useState<'x' | 'nostr' | null>(null)
    const badgeId = badgeIdFor(participantId, badge.tree)
    // Sharing to Nostr needs the key the learner made in the Nostr identity
    // mission. If they haven't done it yet, we offer the option but explain.
    const hasNostrKey = getNsec() !== null
    useFocusTrap(dialogRef, true)

    // Escape closes the modal so the learner can dismiss without hunting
    // for the × button. Backdrop click is wired below via the dialog
    // wrapper's onClick.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    const baseFilename = `bitpilot-${badge.tree}-${badgeId}`

    const triggerDownload = (href: string, filename: string) => {
        const a = document.createElement('a')
        a.href = href
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    }

    const serializeSvg = (): string | null => {
        const node = svgRef.current
        if (!node) return null
        const clone = node.cloneNode(true) as SVGSVGElement
        if (!clone.getAttribute('xmlns')) {
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        }
        // The in-DOM card renders fluid (100%/100%) so it fits phone
        // screens; exports always go out at the full 600x800.
        clone.setAttribute('width', '600')
        clone.setAttribute('height', '800')
        return new XMLSerializer().serializeToString(clone)
    }

    const downloadSvg = () => {
        setError(null)
        const src = serializeSvg()
        if (!src) {
            setError('Could not read badge image. Try reopening this dialog.')
            return
        }
        setDownloading('svg')
        try {
            const blob = new Blob([src], { type: 'image/svg+xml;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            triggerDownload(url, `${baseFilename}.svg`)
            URL.revokeObjectURL(url)
        } finally {
            setDownloading(null)
        }
    }

    /**
     * Rasterize the in-DOM SVG to a PNG Blob. Resolves with the blob (and
     * keeps the intermediate object URL revoked) or rejects with an Error.
     */
    const renderPng = (): Promise<Blob> =>
        new Promise((resolve, reject) => {
            const src = serializeSvg()
            if (!src) {
                reject(new Error('Could not read badge image. Try reopening this dialog.'))
                return
            }
            const W = 600 * PNG_SCALE
            const H = 800 * PNG_SCALE
            const img = new Image()
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas')
                    canvas.width = W
                    canvas.height = H
                    const ctx = canvas.getContext('2d')
                    if (!ctx) {
                        reject(new Error('Your browser refused to render PNGs.'))
                        return
                    }
                    ctx.drawImage(img, 0, 0, W, H)
                    canvas.toBlob((png) => {
                        if (!png) reject(new Error("Couldn't encode PNG."))
                        else resolve(png)
                    }, 'image/png')
                } catch (e) {
                    reject(e instanceof Error ? e : new Error('PNG export failed.'))
                }
            }
            img.onerror = () => {
                reject(new Error('Browser refused to load the badge image.'))
            }
            // data: URL, not a blob object URL: the page CSP allows
            // `img-src 'self' data:` but not `blob:`, so a blob-backed
            // <img> is blocked and the whole PNG/share pipeline dies with
            // "refused to load". data: is already whitelisted.
            img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`
        })

    const downloadPng = async () => {
        setError(null)
        setStatus(null)
        setDownloading('png')
        try {
            const png = await renderPng()
            const pngUrl = URL.createObjectURL(png)
            triggerDownload(pngUrl, `${baseFilename}.png`)
            URL.revokeObjectURL(pngUrl)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'PNG export failed.')
        } finally {
            setDownloading(null)
        }
    }

    /**
     * Share on X with the PNG attached.
     *
     * Strategy:
     *   1. Render the PNG.
     *   2. If the browser supports Web Share API for files (mobile,
     *      Safari, recent Edge), call navigator.share({ files: [png] })
     *      so the OS sheet opens with the image already attached.
     *   3. Otherwise, save the PNG to the user's downloads AND open the
     *      X compose page with prefilled text. We surface a status line
     *      pointing the user to drag the freshly-downloaded PNG in.
     */
    const shareOnX = async () => {
        setError(null)
        setStatus(null)
        setDownloading('share')
        try {
            const png = await renderPng()
            const filename = `${baseFilename}.png`
            const text = buildShareText(badge.tree, certUrl)
            const file = new File([png], filename, { type: 'image/png' })

            // Web Share API with files: mobile + Safari + recent Edge.
            // `navigator.canShare` itself is feature-detected; some browsers
            // ship `navigator.share` without file support.
            const nav = navigator as Navigator & {
                canShare?: (data: { files?: File[] }) => boolean
            }
            if (
                typeof nav.canShare === 'function' &&
                nav.canShare({ files: [file] }) &&
                typeof nav.share === 'function'
            ) {
                try {
                    await nav.share({
                        files: [file],
                        text,
                        title: 'My BitPilot badge',
                    })
                    setStatus('Your share sheet is open. Pick X to post the badge.')
                    return
                } catch (e) {
                    // User dismissed the share sheet. Don't treat that
                    // as an error; just fall through to download fallback.
                    if (e instanceof DOMException && e.name === 'AbortError') {
                        return
                    }
                    // Other share failures: fall through to the download path.
                }
            }

            // Fallback: download the PNG so the user has it locally, then
            // open the X compose page so they can drag it into the tweet.
            const pngUrl = URL.createObjectURL(png)
            triggerDownload(pngUrl, filename)
            URL.revokeObjectURL(pngUrl)
            const u = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
            window.open(u, '_blank', 'noopener,noreferrer')
            setStatus(
                'Two steps to finish: 1) we saved the badge image to your ' +
                    'downloads, 2) we opened X in a new tab. Add the saved image ' +
                    'to your post, then send it.',
            )
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Share failed.')
        } finally {
            setDownloading(null)
        }
    }

    /**
     * Share the badge as a real Nostr note, signed in the browser with the
     * key the learner made in the Nostr identity mission. More private and
     * more on-brand than X: it uses the censorship-resistant identity the
     * app just taught them to own, instead of a centralised platform.
     */
    const shareOnNostr = async () => {
        setError(null)
        setStatus(null)
        const key = getNsec()
        if (!key) {
            setError('Finish the Nostr identity mission first to share here.')
            return
        }
        setDownloading('nostr')
        try {
            const event = signNostrTextNote(key, buildShareText(badge.tree, certUrl))
            const res = await api.broadcastNostrEvent(event)
            setStatus(
                res.simulated
                    ? 'Shared to Nostr (simulated in this build).'
                    : `Published to Nostr on ${res.relays.length} relay${res.relays.length === 1 ? '' : 's'}.`,
            )
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not share to Nostr.')
        } finally {
            setDownloading(null)
        }
    }

    const certUrl = cert ? `${window.location.origin}/?cert=${cert.id}` : null

    /**
     * Ask the backend to certify this badge. The result is a permanent
     * public record (display name, flight path, dates) behind an
     * unguessable link, backed by a Nostr event signed with the server's
     * key so anyone can verify it independently.
     */
    const getCertificate = async () => {
        setError(null)
        setStatus(null)
        setDownloading('cert')
        try {
            setCert(await api.issueBadgeCertificate(badge.tree))
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create the certificate.')
        } finally {
            setDownloading(null)
        }
    }

    const copyCertLink = async () => {
        if (!certUrl) return
        try {
            await navigator.clipboard.writeText(certUrl)
            setCertCopied(true)
            setTimeout(() => setCertCopied(false), 2000)
        } catch {
            setError('Could not copy. Long-press the link to copy it manually.')
        }
    }

    // Run the share the learner just confirmed, then clear the pending state.
    const runPendingShare = () => {
        const which = pendingShare
        setPendingShare(null)
        if (which === 'x') void shareOnX()
        else if (which === 'nostr') void shareOnNostr()
    }

    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-badge-title"
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                zIndex: 1100,
                fontFamily: 'var(--font-sans)',
                overflow: 'auto',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: 520,
                    borderRadius: 'var(--radius-3)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '95vh',
                }}
            >
                <div
                    style={{
                        padding: '14px 18px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <div
                        id="share-badge-title"
                        style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}
                    >
                        Your badge
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            background: 'transparent',
                            color: 'var(--muted)',
                            border: 'none',
                            fontSize: 22,
                            cursor: 'pointer',
                            lineHeight: 1,
                            padding: 4,
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Preview area. It flexes and scrolls so the badge can never
                    push the share buttons below the fold on a phone; the
                    buttons matter more than a bigger preview. */}
                <div
                    style={{
                        padding: '16px 18px',
                        display: 'flex',
                        justifyContent: 'center',
                        background: 'var(--bg)',
                        overflowY: 'auto',
                        flex: '1 1 auto',
                        minHeight: 120,
                    }}
                >
                    <div
                        style={{
                            width: '100%',
                            maxWidth: 320,
                            aspectRatio: '600 / 800',
                            display: 'flex',
                            margin: '0 auto',
                        }}
                    >
                        <TierBadgeCard
                            ref={svgRef}
                            tree={badge.tree}
                            participantName={participantName}
                            earnedAt={badge.earned_at}
                            badgeId={badgeId}
                            fluid
                        />
                    </div>
                </div>

                <div
                    style={{
                        padding: '14px 18px 16px',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        flexShrink: 0,
                    }}
                >
                    {error && (
                        <div
                            role="alert"
                            style={{
                                background: 'rgba(248, 113, 113, 0.08)',
                                border: '1px solid rgba(248, 113, 113, 0.3)',
                                borderRadius: 'var(--radius-2)',
                                color: 'var(--danger)',
                                padding: '10px 12px',
                                fontSize: 12,
                            }}
                        >
                            {error}
                        </div>
                    )}
                    {status && !error && (
                        <div
                            role="status"
                            style={{
                                background: 'rgba(16, 197, 126, 0.08)',
                                border: '1px solid rgba(16, 197, 126, 0.30)',
                                borderRadius: 'var(--radius-2)',
                                color: 'var(--success)',
                                padding: '10px 12px',
                                fontSize: 12,
                            }}
                        >
                            {status}
                        </div>
                    )}
                    {pendingShare ? (
                        <div
                            style={{
                                background: 'rgba(255, 87, 34, 0.08)',
                                border: '1px solid rgba(255, 87, 34, 0.30)',
                                borderRadius: 'var(--radius-2)',
                                padding: '12px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10,
                            }}
                        >
                            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                                <strong>This posts publicly.</strong> Your badge and the
                                name on it go out on{' '}
                                {pendingShare === 'x' ? 'X' : 'public Nostr relays'}, where
                                anyone can see it, including in your own country. A public
                                post cannot be fully deleted once it spreads.
                            </div>
                            <button
                                onClick={runPendingShare}
                                disabled={downloading !== null}
                                style={shareButton('xshare', downloading !== null)}
                            >
                                {pendingShare === 'x'
                                    ? 'Post to X'
                                    : 'Post to Nostr'}
                            </button>
                            <button
                                onClick={() => setPendingShare(null)}
                                disabled={downloading !== null}
                                style={shareButton('secondary', downloading !== null)}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={() => setPendingShare('nostr')}
                                disabled={downloading !== null}
                                style={shareButton('primary', downloading !== null)}
                                title={
                                    hasNostrKey
                                        ? undefined
                                        : 'Finish the Nostr identity mission to enable this'
                                }
                            >
                                {downloading === 'nostr' ? 'Sharing…' : '⚡ Share to Nostr'}
                            </button>
                            <button
                                onClick={() => setPendingShare('x')}
                                disabled={downloading !== null}
                                style={shareButton('xshare', downloading !== null)}
                            >
                                {downloading === 'share' ? 'Preparing share…' : 'Share on X'}
                            </button>
                            {cert && certUrl ? (
                                <div
                                    style={{
                                        background: 'rgba(16, 197, 126, 0.08)',
                                        border: '1px solid rgba(16, 197, 126, 0.30)',
                                        borderRadius: 'var(--radius-2)',
                                        padding: '12px 14px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 8,
                                    }}
                                >
                                    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                                        <strong>Certificate ready.</strong> Anyone with this
                                        link can confirm your badge is real. Shares from here
                                        now include it.
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input
                                            readOnly
                                            value={certUrl}
                                            aria-label="Certificate verification link"
                                            onFocus={(e) => e.currentTarget.select()}
                                            style={{
                                                flex: 1,
                                                minWidth: 0,
                                                fontFamily: 'ui-monospace, monospace',
                                                fontSize: 11,
                                                padding: '8px 10px',
                                                borderRadius: 'var(--radius-2)',
                                                border: '1px solid var(--border)',
                                                background: 'var(--bg)',
                                                color: 'var(--text)',
                                            }}
                                        />
                                        <button
                                            onClick={copyCertLink}
                                            style={shareButton('secondary', false)}
                                        >
                                            {certCopied ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                    <a
                                        href={certUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: 'var(--bitcoin, #C2410C)',
                                            textDecoration: 'underline',
                                            alignSelf: 'flex-start',
                                        }}
                                    >
                                        View the certificate page
                                    </a>
                                </div>
                            ) : (
                                <button
                                    onClick={getCertificate}
                                    disabled={downloading !== null}
                                    style={shareButton('secondary', downloading !== null)}
                                >
                                    {downloading === 'cert'
                                        ? 'Creating certificate…'
                                        : 'Get a verifiable certificate'}
                                </button>
                            )}
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: 8,
                                }}
                            >
                                <button
                                    onClick={downloadPng}
                                    disabled={downloading !== null}
                                    style={shareButton('secondary', downloading !== null)}
                                >
                                    {downloading === 'png' ? 'Rendering…' : '⬇ PNG'}
                                </button>
                                <button
                                    onClick={downloadSvg}
                                    disabled={downloading !== null}
                                    style={shareButton('secondary', downloading !== null)}
                                >
                                    {downloading === 'svg' ? '…' : '⬇ SVG'}
                                </button>
                            </div>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: 'var(--muted)',
                                    textAlign: 'center',
                                    lineHeight: 1.5,
                                }}
                            >
                                Nostr uses the key you made earlier, so it stays yours.
                                PNG and SVG just save the image to your device. A
                                certificate puts the name and date on this badge behind
                                a public link, so only make one if you want that.
                            </div>
                            <button
                                onClick={onClose}
                                disabled={downloading !== null}
                                style={shareButton('secondary', downloading !== null)}
                            >
                                Close
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

function shareButton(
    variant: 'primary' | 'secondary' | 'xshare',
    disabled: boolean,
): React.CSSProperties {
    const base: React.CSSProperties = {
        border: 'none',
        borderRadius: 'var(--radius-2)',
        padding: '12px 16px',
        fontWeight: 700,
        fontSize: 14,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-sans)',
        opacity: disabled ? 0.55 : 1,
    }
    if (variant === 'primary') {
        return {
            ...base,
            background: 'var(--gradient-bitcoin)',
            color: '#0A0A0B',
        }
    }
    if (variant === 'xshare') {
        return {
            ...base,
            background: '#0A0A0B',
            color: '#FFFFFF',
            border: '1px solid var(--border-strong)',
        }
    }
    return {
        ...base,
        background: 'transparent',
        color: 'var(--text)',
        border: '1.5px solid var(--border-strong)',
    }
}
