import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LearnerView from './views/LearnerView'
import FacilitatorDashboard from './views/FacilitatorDashboard'
import { ThemeToggle } from './components/ThemeToggle'
import { Theme, applyTheme, getSavedTheme, saveTheme } from './lib/theme'
import './index.css'

const queryClient = new QueryClient()
type View = 'learner' | 'facilitator'

const MISSIONS_PREVIEW = [
  { emoji: '🪪', title: 'Get your Bitcoin ID', desc: 'Create an identity no one can take away' },
  { emoji: '📥', title: 'Receive real Bitcoin', desc: 'Get actual sats sent to you instantly' },
  { emoji: '📤', title: 'Send 50 sats', desc: 'Pay someone as easy as sending an email' },
  { emoji: '🎟️', title: 'Claim a secret token', desc: 'Private digital cash — untraceable' },
  { emoji: '📢', title: 'Post your first note', desc: 'Publish a message no one can delete' },
]

export default function App() {
  const [view, setView] = useState<View>('learner')
  const [theme, setTheme] = useState<Theme>(getSavedTheme)
  const [screen, setScreen] = useState<'landing' | 'setup' | 'app'>('landing')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [sessionName, setSessionName] = useState('')
  const [participantName, setParticipantName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { applyTheme(theme); saveTheme(theme) }, [theme])
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  const start = async () => {
    if (!participantName.trim()) return
    setLoading(true); setError('')
    try {
      const sName = sessionName.trim() || 'BitPilot Session'
      const session: any = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: sName })
      }).then(r => { if (!r.ok) throw new Error(); return r.json() })
      const participant: any = await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: participantName.trim(), session_id: session.id })
      }).then(r => { if (!r.ok) throw new Error(); return r.json() })
      setSessionId(session.id)
      setParticipantId(participant.id)
      setScreen('app')
    } catch {
      setError('Backend not reachable. Make sure cargo run is running in another terminal.')
    }
    setLoading(false)
  }

  const btnStyle = (bg: string, color: string): React.CSSProperties => ({
    background: bg, color, border: 'none', borderRadius: 8,
    padding: '10px 20px', fontWeight: 700, fontSize: 14,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', gap: 6, transition: 'opacity 0.15s',
  })

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px',
    border: '1.5px solid var(--border)', borderRadius: 10,
    background: 'var(--bg)', color: 'var(--text)', fontSize: 15,
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  if (screen === 'landing') return (
    <QueryClientProvider client={queryClient}>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22, color: '#F7931A' }}>⚡</span>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em' }}>BitPilot</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button onClick={() => setScreen('setup')} style={{ ...btnStyle('#F7931A', '#000'), borderRadius: 10 }}>Start for free →</button>
          </div>
        </nav>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '64px 24px 32px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(247,147,26,0.1)', border: '1px solid rgba(247,147,26,0.3)', borderRadius: 100, padding: '6px 16px', marginBottom: 28 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F7931A', display: 'inline-block' }} />
            <span style={{ fontSize: 11, color: '#F7931A', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>No experience needed</span>
          </div>

          <h1 style={{ fontSize: 'clamp(36px, 7vw, 68px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: 20 }}>
            Learn Bitcoin<br />by <span style={{ color: '#F7931A' }}>actually using it.</span>
          </h1>

          <p style={{ fontSize: 17, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto 36px' }}>
            In 15 minutes you'll send real Bitcoin, create an unstealable identity, and post a message no company can ever delete.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 56 }}>
            <button onClick={() => setScreen('setup')} style={{ ...btnStyle('#F7931A', '#000'), fontSize: 16, padding: '14px 28px', borderRadius: 12 }}>
              ⚡ Start my Bitcoin journey
            </button>
            <button onClick={() => { setView('facilitator'); setScreen('setup') }} style={{ ...btnStyle('transparent', 'var(--text)'), fontSize: 16, padding: '14px 28px', borderRadius: 12, border: '1.5px solid var(--border2)' }}>
              I'm running a session
            </button>
          </div>

          <div style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 64 }}>
            {[['15 min', 'to complete'], ['5', 'real missions'], ['0₦', 'cost to join'], ['₿', 'real Bitcoin']].map(([num, label]) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#F7931A' }}>{num}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <h2 style={{ textAlign: 'center', fontSize: 26, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.02em' }}>5 missions. Real Bitcoin.</h2>
          <p style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: 28, fontSize: 14 }}>Every mission: Learn → Quiz → Do. You can't skip ahead.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
            {MISSIONS_PREVIEW.map((m, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(247,147,26,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{m.emoji}</div>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#F7931A', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{i + 1}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '40px 24px 60px', borderTop: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 10 }}>Ready to try real Bitcoin?</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: 14 }}>Free. 15 minutes. No wallet needed.</p>
          <button onClick={() => setScreen('setup')} style={{ ...btnStyle('#F7931A', '#000'), fontSize: 16, padding: '14px 28px', borderRadius: 12 }}>
            ⚡ Begin now
          </button>
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--muted)' }}>
            Open source · <a href="https://github.com/Jolah1/bitpilot" target="_blank" rel="noreferrer" style={{ color: '#F7931A' }}>github.com/Jolah1/bitpilot</a>
          </div>
        </div>
      </div>
    </QueryClientProvider>
  )

  if (screen === 'setup') return (
    <QueryClientProvider client={queryClient}>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24, position: 'relative' }}>
        <button onClick={() => setScreen('landing')} style={{ position: 'absolute', top: 20, left: 20, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>← Back</button>
        <div style={{ position: 'absolute', top: 20, right: 20 }}><ThemeToggle theme={theme} onToggle={toggleTheme} /></div>

        <div style={{ width: '100%', maxWidth: 440 }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 28 }}>
            {[0,1,2,3,4].map(i => <div key={i} style={{ width: i===0?28:8, height: 8, borderRadius: 100, background: i===0?'#F7931A':'var(--border2)' }} />)}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 22, color: '#F7931A' }}>⚡</span>
                <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Let's go!</span>
              </div>
              <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>Tell us your name — you'll earn real Bitcoin as you learn.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 600 }}>Your name</label>
              <input style={inputStyle} placeholder="e.g. Amaka, Chidi, Fatima…" value={participantName} onChange={e => setParticipantName(e.target.value)} onKeyDown={e => e.key==='Enter'&&start()} autoFocus />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 600 }}>Session name <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
              <input style={inputStyle} placeholder="e.g. Lagos Bitcoin Meetup" value={sessionName} onChange={e => setSessionName(e.target.value)} onKeyDown={e => e.key==='Enter'&&start()} />
            </div>

            {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#ef4444', lineHeight: 1.5 }}>⚠️ {error}</div>}

            <button onClick={start} disabled={!participantName.trim()||loading} style={{ ...btnStyle('#F7931A','#000'), fontSize: 15, padding: 14, borderRadius: 12, width: '100%', opacity: loading||!participantName.trim()?0.5:1 }}>
              {loading ? '⏳ Starting…' : '⚡ Start earning sats →'}
            </button>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10, fontWeight: 600 }}>What you'll do</div>
              {MISSIONS_PREVIEW.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(247,147,26,0.12)', border: '1px solid rgba(247,147,26,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#F7931A', flexShrink: 0 }}>{i+1}</div>
                  <span style={{ fontSize: 13 }}>{m.emoji} {m.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </QueryClientProvider>
  )

  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 18, color: '#F7931A' }}>⚡</span>
          <span style={{ fontSize: 15, fontWeight: 800 }}>BitPilot</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(['learner','facilitator'] as View[]).map(v => (
            <button key={v} onClick={()=>setView(v)} style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 6, fontWeight: 700, border: `1px solid ${view===v?'#F7931A':'var(--border2)'}`, cursor: 'pointer', background: view===v?'rgba(247,147,26,0.12)':'transparent', color: view===v?'#F7931A':'var(--muted)' }}>{v}</button>
          ))}
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button onClick={()=>setScreen('landing')} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>Exit</button>
        </div>
      </div>
      <div style={{ paddingTop: 52 }}>
        {view==='learner' ? <LearnerView participantId={participantId!} /> : <FacilitatorDashboard sessionId={sessionId!} />}
      </div>
    </QueryClientProvider>
  )
}
