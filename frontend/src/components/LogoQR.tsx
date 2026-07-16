import { useCallback } from 'react'
import QRCode from 'qrcode'

/**
 * QR canvas with the BitPilot compass stamped in the middle.
 *
 * Error correction runs at level H (tolerates ~30% damage); the logo pad
 * covers well under that, so codes stay scannable. The logo is drawn from
 * the same-origin favicon, allowed by the img-src 'self' CSP; if it ever
 * fails to load the code simply renders logo-less.
 *
 * Rendering note: the QR is drawn via a *callback ref*, not a useEffect,
 * so it appears the instant the canvas element mounts regardless of the
 * order the parent mounts things in.
 */
export function LogoQRCanvas({
    value,
    size = 200,
    ariaLabel,
}: {
    value: string
    size?: number
    ariaLabel: string
}) {
    const canvasRef = useCallback(
        (node: HTMLCanvasElement | null) => {
            if (!node) return
            QRCode.toCanvas(node, value, {
                width: size,
                margin: 1,
                errorCorrectionLevel: 'H',
                color: { dark: '#0A0A0B', light: '#FFFFFF' },
            })
                .then(() => drawCenterLogo(node))
                .catch((err) => {
                    // Keep the page alive on a bad value; the link next to
                    // the QR is still copyable.
                    // eslint-disable-next-line no-console
                    console.warn('QR render failed:', err)
                })
        },
        [value, size],
    )
    return <canvas ref={canvasRef} style={{ display: 'block' }} aria-label={ariaLabel} />
}

/** White rounded pad first (so the mark never melts into dark modules), then the favicon on top. */
function drawCenterLogo(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.onload = () => {
        const logo = Math.round(canvas.width * 0.2)
        const pad = Math.round(logo * 0.16)
        const box = logo + pad * 2
        const x = (canvas.width - box) / 2
        const y = (canvas.height - box) / 2
        ctx.fillStyle = '#FFFFFF'
        ctx.beginPath()
        ctx.roundRect(x, y, box, box, Math.round(box * 0.22))
        ctx.fill()
        ctx.drawImage(img, x + pad, y + pad, logo, logo)
    }
    img.src = '/favicon.svg'
}
