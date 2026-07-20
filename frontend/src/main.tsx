import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { LanguageProvider } from './lib/language'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <LanguageProvider><App /></LanguageProvider>
    </React.StrictMode>,
)

// Offline app shell (see public/sw.js). Production only: in dev a worker
// would cache Vite's module graph and serve stale code after every edit.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // No SW just means no offline shell; the app works without it.
        })
    })
}
