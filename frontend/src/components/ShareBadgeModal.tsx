/**
 * Modal that displays the TierBadgeCard and offers download/share actions.
 *
 * Why client-side rasterization: the badge is purely a function of the
 * participant's name, tier, earned-at, and id — no server roundtrip needed.
 * SVG download serializes the in-DOM <svg>; PNG download draws that SVG
 * onto a 1200x1600 offscreen canvas (2x retina) for a crisp social-share
 * image. No third-party libs.
 *
 * "Share on X" uses the twitter intent URL with pre-filled text. We can't
 * attach an image to that link (Twitter requires an upload), so the flow
 * is: user clicks "Download PNG" first, then "Share on X" opens the
 * compose page with text and they attach the PNG manually. The buttons
 * are ordered to make that obvious.
 */
import { useRef, useState } from 'react'
import type { Badge } from '../lib/types'
import { TierBadgeCard, badgeIdFor } from './TierBadgeCard'

const PNG_SCALE = 2 // 2x the 600x800 SVG => 1200x1600 PNG

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
    const [downloading, setDownloading] = useState<'png' | 'svg' | null>(null)
    const [error, setError] = useState<string | null>(null)
    const badgeId = badgeIdFor(participantId, badge.tier)

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

    const downloadPng = () => {
        setError(null)
        const src = serializeSvg()
        if (!src) {
            setError('Could not read badge image. Try reopening this dialog.')
            return
        }
        setDownloading('png')
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
                    setError('Your browser refused to render PNGs. Try Chrome or Firefox.')
                    setDownloading(null)
                    URL.revokeObjectURL(url)
                    return
                }
                ctx.drawImage(img, 0, 0, W, H)
                canvas.toBlob((png) => {
                    if (!png) {
                        setError("Couldn't encode PNG. Try Download SVG instead.")
                    } else {
                        const pngUrl = URL.createObjectURL(png)
                        triggerDownload(pngUrl, `${baseFilename}.png`)
                        URL.revokeObjectURL(pngUrl)
                    }
                    URL.revokeObjectURL(url)
                    setDownloading(null)
                }, 'image/png')
            } catch (e) {
                setError(
                    e instanceof Error
                        ? `PNG export failed: ${e.message}`
                        : 'PNG export failed.',
                )
                URL.revokeObjectURL(url)
                setDownloading(null)
            }
        }
        img.onerror = () => {
            setError('Browser refused to load the badge image. Try Download SVG.')
            URL.revokeObjectURL(url)
            setDownloading(null)
        }
        img.src = url
    }

    const shareOnX = () => {
        const tierLabel = badge.tier[0].toUpperCase() + badge.tier.slice(1)
        const text = `I just earned my ${tierLabel} badge on @bitpilot — learning Bitcoin by doing.\n\nBadge ID: ${badgeId}`
        const u = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
        window.open(u, '_blank', 'noopener,noreferrer')
    }

    return (
        <div
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
                    <button onClick={shareOnX} style={shareButton('xshare', false)}>
                        Share on X
                    </button>
                    <div
                        style={{
                            fontSize: 11,
                            color: 'var(--muted)',
                            textAlign: 'center',
                            lineHeight: 1.5,
                        }}
                    >
                        Download the PNG first, then attach it when X opens the
                        compose dialog. Your badge ID is stable — re-downloads
                        give the same image.
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
