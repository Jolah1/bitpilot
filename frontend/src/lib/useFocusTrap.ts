/**
 * Trap Tab/Shift+Tab focus inside a container while it's mounted, and
 * restore focus to whatever was focused before mount when it unmounts.
 *
 * Why: BitPilot's modals (badge celebration, share badge) dim the page
 * behind them. Without a trap, a keyboard user pressing
 * Tab eventually walks out of the modal into the still-rendered page
 * underneath, a confusing, inaccessible experience.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null)
 *   useFocusTrap(ref, isOpen)
 *   return <div ref={ref}>…modal markup…</div>
 *
 * Notes:
 *   - We re-query focusable elements on every Tab so dynamic content
 *     (e.g. a success message replacing a form) is handled correctly.
 *   - We don't auto-focus the first element here, each modal already
 *     manages its own initial focus, often on a primary action rather
 *     than the topmost focusable. The trap just keeps focus contained.
 */
import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFocusTrap(
    containerRef: RefObject<HTMLElement | null>,
    active: boolean,
) {
    useEffect(() => {
        if (!active) return
        const container = containerRef.current
        if (!container) return

        // Remember the element that opened us so we can return focus
        // on unmount. Falls back to document.body if there's nothing.
        const opener = document.activeElement as HTMLElement | null

        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return
            const focusables = Array.from(
                container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
            ).filter((el) => el.offsetParent !== null || el === document.activeElement)
            if (focusables.length === 0) {
                // Nothing to focus inside; swallow Tab so it doesn't escape.
                e.preventDefault()
                return
            }
            const first = focusables[0]
            const last = focusables[focusables.length - 1]
            const current = document.activeElement as HTMLElement | null

            if (e.shiftKey) {
                if (current === first || !container.contains(current)) {
                    e.preventDefault()
                    last.focus()
                }
            } else {
                if (current === last || !container.contains(current)) {
                    e.preventDefault()
                    first.focus()
                }
            }
        }

        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('keydown', onKey)
            // Restore focus to the opener. Wrapped in a try because the
            // element may have been removed from the DOM by the parent.
            try {
                opener?.focus?.()
            } catch {
                /* ignore */
            }
        }
    }, [active, containerRef])
}
