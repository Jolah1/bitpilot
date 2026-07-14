import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type RuntimeInfo } from './api'
import type { Tech } from './types'

/**
 * Runtime info from the backend (`GET /api/runtime`). Tells the UI which
 * services are real vs simulated *right now*. The UI uses this to render
 * the correct chip on each mission card and the honest copy on the landing
 * page. If the runtime endpoint isn't reachable yet, we assume the worst
 * case ("simulated") so we never accidentally claim something is real.
 */
const RuntimeContext = createContext<RuntimeInfo | null>(null)

export function RuntimeProvider({ children }: { children: ReactNode }) {
    const { data } = useQuery({
        queryKey: ['runtime'],
        queryFn: () => api.runtime(),
        staleTime: 60_000,
        retry: 1,
    })
    return <RuntimeContext.Provider value={data ?? null}>{children}</RuntimeContext.Provider>
}

export function useRuntime(): RuntimeInfo | null {
    return useContext(RuntimeContext)
}

/**
 * Is the given tech being served by a real backend service?
 *
 * - bitcoin / nostr: always real (we either don't touch a network or we
 *   really do publish to public Nostr relays).
 * - lightning: real iff LNbits creds are configured.
 * - ecash: real iff a Cashu mint URL is configured (the default is the
 *   public testnut, so this is true out of the box).
 *
 * When the `/api/runtime` call hasn't completed yet we assume worst case
 * (simulated) for lightning and ecash, better to under-claim than over-claim.
 */
export function useIsTechReal(tech: Tech): boolean {
    const runtime = useRuntime()
    return useMemo(() => {
        switch (tech) {
            case 'bitcoin':
            case 'nostr':
                return true
            case 'lightning':
                return runtime?.lightning_real ?? false
            case 'ecash':
                return runtime?.ecash_real ?? false
        }
    }, [tech, runtime])
}
