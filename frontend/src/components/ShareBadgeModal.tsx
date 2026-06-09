/**
 * Modal that displays the TierBadgeCard and offers download/share actions.
 *
 * Why client-side rasterization: the badge is purely a function of the
 * participant's name, tier, earned-at, and id — no server roundtrip needed.
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
import { TierBadgeCard, badgeIdFor } from './TierBadgeCard'

const PNG_SCALE = 2 // 2x the 600x800 SVG => 1200x1600 PNG

/** Tier label used in the share text. Title-cased. */
function tierLabelOf(tier: string): string {
    return tier[0].toUpperCase() + tier.slice(1)
}

function buildShareText(tier: string, badgeId: string): string {
    return `I just earned my ${tierLabelOf(tier)} badge on @bitpilot — learning Bitcoin by doing.\n\nBadge ID: ${badgeId}`
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
    const [downloading, setDownloading] = useState<'png' | 'svg' | 'share' | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const badgeId = badgeIdFor(participantId, badge.tier)
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

    const baseFilename = `bitpilot-${badge.tier}-${badgeId}`

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
            const blob = new Blob([src], { type: 'image/svg+xml;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const img = new Image()
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas')
                    canvas.width = W
                    canvas.height = H
                    const ctx = canvas.getContext('2d')
                    if (!ctx) {
                        URL.revokeObjectURL(url)
                        reject(new Error('Your browser refused to render PNGs.'))
                        return
                    }
                    ctx.drawImage(img, 0, 0, W, H)
                    canvas.toBlob((png) => {
                        URL.revokeObjectURL(url)
                        if (!png) reject(new Error("Couldn't encode PNG."))
                        else resolve(png)
                    }, 'image/png')
                } catch (e) {
                    URL.revokeObjectURL(url)
                    reject(e instanceof Error ? e : new Error('PNG export failed.'))
                }
            }
            img.onerror = () => {
                URL.revokeObjectURL(url)
                reject(new Error('Browser refused to load the badge image.'))
            }
            img.src = url
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
            const text = buildShareText(badge.tier, badgeId)
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
                    setStatus('Opened your share sheet — pick X to post the badge.')
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
                'PNG saved to your downloads and X opened — drag the image into the tweet.',
            )
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Share failed.')
        } finally {
            setDownloading(null)
        }
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

                <div
                    style={{
                        padding: '16px 18px',
                        display: 'flex',
                        justifyContent: 'center',
                        background: 'var(--bg)',
                        overflowY: 'auto',
                    }}
                >
                    <div
                        style={{
                            width: '100%',
                            maxWidth: 360,
                            aspectRatio: '600 / 800',
                            display: 'flex',
                        }}
                    >
                        <TierBadgeCard
                            ref={svgRef}
                            tier={badge.tier}
                            participantName={participantName}
                            earnedAt={badge.earned_at}
                            badgeId={badgeId}
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
                    <button
                        onClick={shareOnX}
                        disabled={downloading !== null}
                        style={shareButton('xshare', downloading !== null)}
                    >
                        {downloading === 'share' ? 'Preparing share…' : 'Share on X'}
                    </button>
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
                            style={shareButton('primary', downloading !== null)}
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
                        On mobile, "Share on X" attaches the badge directly.
                        On desktop it saves the PNG and opens X — drag the
                        image into the tweet to post.
                    </div>
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
