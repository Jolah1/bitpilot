/**
 * Minimal inline formatting for mission prose: **bold**, *italic*, and
 * `code`. Mission content in types.ts uses these markers for emphasis;
 * without this they print literally ("**Cold savings**:") in lessons,
 * quizzes, and Do-step helpers.
 *
 * Deliberately not a markdown engine: no links, no headings, no HTML.
 * Anything else in the text passes through untouched, and the input is
 * rendered as React text nodes, never injected as HTML.
 */
import type { ReactNode } from 'react'

const codeStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.9em',
    background: 'rgba(128, 128, 128, 0.14)',
    borderRadius: 4,
    padding: '1px 5px',
    // Lesson prose embeds opaque strings with no spaces or hyphens in them
    // (a Cashu token, an invoice, a hex key). Without this they lay out as
    // one unbreakable word several thousand pixels wide, and the mission
    // card clips the overflow instead of scrolling it, so the learner sees
    // only the first line and cannot select the rest.
    overflowWrap: 'anywhere',
}

// **bold**  |  *italic* (non-space at both ends, so "5 * 3 * 2" is left
// alone)  |  `code`
const TOKEN = /\*\*([^*\n]+)\*\*|\*(\S(?:[^*\n]*\S)?)\*|`([^`\n]+)`/g

export function rich(text: string): ReactNode {
    if (!/[*`]/.test(text)) return text
    const parts: ReactNode[] = []
    let last = 0
    let key = 0
    TOKEN.lastIndex = 0
    for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
        if (m.index > last) parts.push(text.slice(last, m.index))
        if (m[1] !== undefined) {
            parts.push(<strong key={key++}>{m[1]}</strong>)
        } else if (m[2] !== undefined) {
            parts.push(<em key={key++}>{m[2]}</em>)
        } else {
            parts.push(
                <code key={key++} style={codeStyle}>
                    {m[3]}
                </code>,
            )
        }
        last = m.index + m[0].length
    }
    if (last < text.length) parts.push(text.slice(last))
    return parts
}
