import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Catches render errors so a failure in one view can never blank the app.
 *
 * The case this was built for: every view except the learner is lazy
 * loaded, so a tab that has been open across a deploy asks for chunk
 * filenames that no longer exist on the server. The dynamic import
 * rejects, and with nothing catching it React unmounts the whole tree and
 * the user gets a white page with no explanation. A facilitator hitting
 * that mid-workshop has no way to know a reload fixes it.
 *
 * So a stale-chunk error reloads the page once, which is exactly the fix,
 * and only falls back to asking if that does not resolve it. Any other
 * error shows the same calm panel rather than nothing at all.
 */

/** Chunk-load failures, across browsers. Chrome, Firefox and Safari all word it differently. */
function isStaleChunkError(error: Error): boolean {
    const text = `${error.name} ${error.message}`
    return (
        /dynamically imported module/i.test(text) ||
        /Importing a module script failed/i.test(text) ||
        /error loading dynamically imported module/i.test(text) ||
        /Loading chunk \S+ failed/i.test(text) ||
        /ChunkLoadError/i.test(text)
    )
}

/**
 * One automatic reload per tab, then stop. Without this guard a genuinely
 * broken deploy would put the tab in a reload loop, which is worse than
 * the blank page: the user could not even read an error.
 */
const RELOAD_FLAG = 'bitpilot.chunk_reload_attempted'

function alreadyTriedReload(): boolean {
    try {
        return sessionStorage.getItem(RELOAD_FLAG) === '1'
    } catch {
        // Private mode or blocked storage: treat as "already tried" so we
        // never loop. The user still gets the panel with a button.
        return true
    }
}

function markReloadTried(): void {
    try {
        sessionStorage.setItem(RELOAD_FLAG, '1')
    } catch {
        /* nothing we can do; the guard above already fails safe */
    }
}

/** Clear the guard once the app renders normally again. */
export function clearChunkReloadFlag(): void {
    try {
        sessionStorage.removeItem(RELOAD_FLAG)
    } catch {
        /* ignore */
    }
}

interface State {
    error: Error | null
    /** True while the automatic reload is in flight, so we show nothing jarring. */
    reloading: boolean
}

export class ViewErrorBoundary extends Component<{ children: ReactNode }, State> {
    state: State = { error: null, reloading: false }

    static getDerivedStateFromError(error: Error): State {
        const reloading = isStaleChunkError(error) && !alreadyTriedReload()
        return { error, reloading }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Left in deliberately: this is the one place we learn that a
        // deploy stranded someone's open tab.
        console.error('BitPilot view error:', error, info.componentStack)
        if (isStaleChunkError(error) && !alreadyTriedReload()) {
            markReloadTried()
            window.location.reload()
        }
    }

    render() {
        const { error, reloading } = this.state
        if (!error) return this.props.children
        // The reload is already happening; a flash of error text would just
        // be noise on the way out.
        if (reloading) return null

        const stale = isStaleChunkError(error)
        return (
            <div
                role="alert"
                style={{
                    alignItems: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    justifyContent: 'center',
                    minHeight: '70vh',
                    padding: 24,
                    textAlign: 'center',
                }}
            >
                <div aria-hidden="true" style={{ fontSize: 34 }}>
                    {stale ? '🛫' : '⚠️'}
                </div>
                <h1 style={{ fontSize: 20, margin: 0 }}>
                    {stale ? 'BitPilot just updated' : 'Something went wrong'}
                </h1>
                <p
                    style={{
                        color: 'var(--muted)',
                        fontSize: 15,
                        lineHeight: 1.6,
                        margin: 0,
                        maxWidth: 420,
                    }}
                >
                    {stale
                        ? 'This tab was running an older version. Reloading picks up the new one. Your progress is saved on the server, so nothing is lost.'
                        : 'That view failed to load. Reloading usually clears it, and your progress is saved on the server.'}
                </p>
                <button
                    className="bp-press"
                    onClick={() => {
                        clearChunkReloadFlag()
                        window.location.reload()
                    }}
                    style={{
                        background: 'var(--bitcoin)',
                        border: 'none',
                        borderRadius: 'var(--radius-2)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 15,
                        fontWeight: 600,
                        padding: '12px 22px',
                    }}
                >
                    Reload BitPilot
                </button>
            </div>
        )
    }
}

export default ViewErrorBoundary
