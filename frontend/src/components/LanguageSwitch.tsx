import { useLanguage } from '../lib/language'

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
    const { language, setLanguage, t } = useLanguage()
    return (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40 }}>
            {!compact && <span style={{ color: 'var(--muted)', fontSize: 11 }}>{t('language')}</span>}
            <select
                aria-label={t('language')}
                value={language}
                onChange={(event) => setLanguage(event.target.value === 'pcm' ? 'pcm' : 'en')}
                style={{ minHeight: 36, padding: '6px 28px 6px 9px', borderRadius: 'var(--radius-1)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontSize: 12 }}
            >
                <option value="en">{t('english')}</option>
                <option value="pcm">{t('pidgin')}</option>
            </select>
        </label>
    )
}
