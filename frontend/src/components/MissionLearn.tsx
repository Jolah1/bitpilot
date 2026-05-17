import { Mission } from '../lib/types'

interface Props {
    mission: Mission
    onContinue: () => void
}

export function MissionLearn({ mission, onContinue }: Props) {
    return (
        <div>
            {mission.learn.map((block, i) => (
                <div key={i} style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: 16,
                    marginBottom: 12,
                }}>
                    <div style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 10,
                        color: 'var(--bitcoin)',
                        letterSpacing: 2,
                        textTransform: 'uppercase',
                        marginBottom: 8,
                    }}>
                        {block.label}
                    </div>
                    <div
                        style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.75 }}
                        dangerouslySetInnerHTML={{ __html: block.text.replace(/<strong>/g, '<span style="color:var(--bitcoin);font-weight:700">').replace(/<\/strong>/g, '</span>') }}
                    />
                </div>
            ))}
            <button onClick={onContinue} style={{
                width: '100%', padding: 14,
                background: 'var(--bitcoin)', color: '#000',
                fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700,
                border: 'none', borderRadius: 4, cursor: 'pointer', marginTop: 8,
                letterSpacing: 0.5,
            }}>
                Continue to quiz →
            </button>
        </div>
    )
}
