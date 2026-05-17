import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LearnerView } from './views/LearnerView'
import { FacilitatorDashboard } from './views/FacilitatorDashboard'
import { ThemeToggle } from './components/ThemeToggle'
import { Theme, applyTheme, getSavedTheme, saveTheme } from './lib/theme'
import './index.css'

const queryClient = new QueryClient()

// Replace with your real IDs from the curl commands
const DEMO_PARTICIPANT_ID = 'YOUR_PARTICIPANT_ID'
const DEMO_SESSION_ID = 'YOUR_SESSION_ID'

type View = 'learner' | 'facilitator'

export default function App() {
    const [view, setView] = useState<View>('learner')
    const [theme, setTheme] = useState<Theme>(getSavedTheme)

    // Apply theme on mount and whenever it changes
    useEffect(() => {
        applyTheme(theme)
        saveTheme(theme)
    }, [theme])

    const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

    return (
        <QueryClientProvider client={queryClient}>
            {/* Top-right controls */}
            <div style={{
                position: 'fixed', top: 0, right: 0, zIndex: 100,
                display: 'flex', alignItems: 'center', gap: 6, padding: 10,
                background: 'var(--surface)',
                borderBottom: '1px solid var(--border)',
                borderLeft: '1px solid var(--border)',
                borderBottomLeftRadius: 6,
            }}>
                {/* View switcher */}
                {(['learner', 'facilitator'] as View[]).map(v => (
                    <button
                        key={v}
                        onClick={() => setView(v)}
                        style={{
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
                            padding: '5px 12px', borderRadius: 3,
                            border: `1px solid ${view === v ? 'var(--bitcoin)' : 'var(--border2)'}`,
                            cursor: 'pointer',
                            background: view === v ? 'var(--bitcoin-dim)' : 'transparent',
                            color: view === v ? 'var(--bitcoin)' : 'var(--muted)',
                            fontWeight: view === v ? 700 : 400,
                            transition: 'all 0.15s',
                        }}
                    >
                        {v}
                    </button>
                ))}

                <div style={{ width: 1, height: 20, background: 'var(--border2)' }} />

                <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>

            {view === 'learner'
                ? <LearnerView participantId={DEMO_PARTICIPANT_ID} />
                : <FacilitatorDashboard sessionId={DEMO_SESSION_ID} />
            }
        </QueryClientProvider>
    )
}
