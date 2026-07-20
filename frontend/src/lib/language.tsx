import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Journey } from './journeys'
import type { MissionDef } from './types'

export type Language = 'en' | 'pcm'

const LANGUAGE_KEY = 'bitpilot-language'

const UI = {
    en: {
        language: 'Language', english: 'English', pidgin: 'Pidgin', start: 'Start',
        free: '100% free · no signup · nothing to buy', heroLine1: 'Use Bitcoin',
        heroLine2: 'for something useful.',
        heroBody: 'Choose a real task—receive a payment, send money, protect savings, publish independently, or contribute code. BitPilot guides you and explains Bitcoin when you need it.',
        continueMissions: '↻ Continue your missions', differentTask: 'Start a different task',
        chooseTask: '⚡ Choose a practical task', workshop: '🎓 Run a Workshop',
        continueCode: '📲 Continue with a code', firstResult: 'First useful result in about 25–60 minutes · works on your phone',
        whatNeed: 'What do you need to do?', chooseUseful: 'Choose one useful result. Learn only what you need while doing it.',
        outcome: 'Outcome', ready: '✓ Capability ready', steps: 'steps', reviewSkill: 'Review this skill',
        continueTask: 'Continue this task', startTask: 'Start this task', practicalJourneys: 'Practical journeys',
        differentOutcome: 'Choose a different outcome', about: 'about', completed: '✓ Completed', stepsComplete: 'steps complete',
        showLibrary: 'Explore the complete mission library', hideLibrary: 'Hide complete mission library',
        learner: 'Learner', achievements: 'Achievements', facilitator: 'Facilitator', anotherDevice: '📲 Another device',
        exit: 'Exit', view: 'View', exitLanding: 'Exit to landing', myTask: 'My task', flightPaths: 'Flight paths',
        stuck: 'I’m stuck — ask for help', helpSent: '🆘 Help request sent · update it', stopping: 'What is stopping you?',
        facilitatorSees: 'Pick the closest answer. Your facilitator will see it immediately.', optionalNote: 'Optional: tell them what happened',
        sendHelp: 'Send help request', sending: 'Sending…', okayNow: 'I’m okay now',
    },
    pcm: {
        language: 'Language', english: 'English', pidgin: 'Pidgin', start: 'Start',
        free: 'Free well-well · no signup · nothing to buy', heroLine1: 'Use Bitcoin',
        heroLine2: 'do something wey useful.',
        heroBody: 'Choose wetin you wan do—collect payment, send money, protect your savings, publish by yourself, or join build project. BitPilot go guide you and explain Bitcoin when you need am.',
        continueMissions: '↻ Continue where you stop', differentTask: 'Choose another thing',
        chooseTask: '⚡ Choose wetin you wan do', workshop: '🎓 Start Workshop',
        continueCode: '📲 Continue with code', firstResult: 'You fit get first useful result for 25–60 minutes · e dey work for phone',
        whatNeed: 'Wetin you wan do?', chooseUseful: 'Choose one useful result. You go learn only wetin you need as you dey do am.',
        outcome: 'Wetin you go fit do', ready: '✓ You don sabi am', steps: 'steps', reviewSkill: 'Check this skill again',
        continueTask: 'Continue this task', startTask: 'Start this task', practicalJourneys: 'Useful things to learn',
        differentOutcome: 'Choose another result', about: 'about', completed: '✓ You don finish', stepsComplete: 'steps don finish',
        showLibrary: 'See all the lessons', hideLibrary: 'Hide all the lessons',
        learner: 'Learner', achievements: 'Wetin I don achieve', facilitator: 'Facilitator', anotherDevice: '📲 Another device',
        exit: 'Comot', view: 'Page', exitLanding: 'Go back home', myTask: 'My task', flightPaths: 'All lessons',
        stuck: 'I don stuck — ask for help', helpSent: '🆘 Help request don send · change am', stopping: 'Wetin dey stop you?',
        facilitatorSees: 'Choose the answer wey near wetin happen. Your facilitator go see am now-now.', optionalNote: 'If you like, explain wetin happen',
        sendHelp: 'Send help request', sending: 'Dey send…', okayNow: 'I dey okay now',
    },
} as const

export type UiKey = keyof typeof UI.en

const LanguageContext = createContext<{
    language: Language
    setLanguage: (language: Language) => void
    t: (key: UiKey) => string
} | null>(null)

function savedLanguage(): Language {
    if (typeof localStorage === 'undefined') return 'en'
    return localStorage.getItem(LANGUAGE_KEY) === 'pcm' ? 'pcm' : 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguage] = useState<Language>(savedLanguage)
    useEffect(() => {
        document.documentElement.lang = language === 'pcm' ? 'pcm' : 'en'
        try { localStorage.setItem(LANGUAGE_KEY, language) } catch { /* private mode */ }
    }, [language])
    const value = useMemo(() => ({ language, setLanguage, t: (key: UiKey) => UI[language][key] }), [language])
    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
    const value = useContext(LanguageContext)
    if (!value) throw new Error('useLanguage must be used inside LanguageProvider')
    return value
}

export function localizeJourney(journey: Journey, language: Language): Journey {
    if (language !== 'pcm' || journey.id !== 'send-remittance') return journey
    return {
        ...journey,
        title: 'Send money give person',
        audience: 'For Nigerians wey dey send money go house or receive support',
        promise: 'Compare naira cost, prepare the receiver, and practise safe Lightning transfer.',
        outcome: 'I fit compare transfer cost and send money go house safely.',
        capabilities: [
            { mission: 23, label: 'I fit create Lightning invoice' },
            { mission: 24, label: 'I fit send Lightning payment' },
            { mission: 110, label: 'I fit repeat safe transfer without lesson help' },
        ],
    }
}

const PIDGIN_MISSIONS: Record<number, {
    name: string; tagline: string; heading: string; body: string; tip: string
    question: string; options: string[]; actionLabel: string; helper: string
}> = {
    10: {
        name: 'Company wallet or your own wallet', tagline: 'Know who really hold the key to your money.',
        heading: 'Who hold the keys?',
        body: 'If company hold your private keys, na custodial wallet be that. You get account, but na dem control the bitcoin. Dem fit freeze account, get hacked, or close business.\n\nIf na you hold the keys, na self-custody. Nobody fit freeze you, but if you lose your backup, nobody fit recover the money.\n\nMany people start with company wallet because e easier, then move as their savings grow. No shame—but make you know which one you dey use.',
        tip: 'Simple rule: if company fit reset your password, na dem hold the keys.',
        question: 'Wallet app email password reset link give you. Which kind wallet be that?',
        options: ['Custodial—company fit reset your access', 'Self-custodial—seed phrase reset password', 'E depend on the country'],
        actionLabel: 'I understand', helper: 'Confirm who hold the keys for the wallet wey you plan to use.',
    },
    21: {
        name: 'Why Lightning dey exist', tagline: 'Bitcoin main network strong, but e no fast enough for small daily payment.',
        heading: 'How to make small Bitcoin payment fast',
        body: 'Bitcoin blocks take about 10 minutes and the main network fit handle only small number of transactions each second. If everybody use am for daily payment, fee go high and confirmation go slow.\n\nLightning na another layer on top of Bitcoin. Payments move fast between channels, while only opening and final closing touch the main Bitcoin network.\n\nThe result na quick small payments with low fees, without changing Bitcoin base rules.',
        tip: 'Lightning make small Bitcoin payment fast and cheap.',
        question: 'Which problem Lightning dey solve?',
        options: ['Bitcoin no get security', 'Main Bitcoin network too slow and costly for plenty small payments', 'Bitcoin need CEO'],
        actionLabel: 'I understand', helper: 'Explain why you go use Lightning for small transfer instead of main Bitcoin network.',
    },
    80: {
        name: 'Money to send and space to receive', tagline: 'To send and to receive need different channel balance.',
        heading: 'Lightning channel get two sides',
        body: 'Every Lightning channel get sats for two sides. Outbound liquidity mean money wey you fit send. Inbound liquidity mean space wey allow you receive.\n\nNew channel fit get plenty outbound but no inbound. That mean you fit send, but receiving fit fail. Some wallets and Lightning service providers arrange this for you.\n\nOnce you know the difference, failed invoice no look like mystery again.',
        tip: 'Outbound = you fit send. Inbound = you fit receive. You need both.',
        question: 'You fund new channel with 100,000 sats, then try receive 5,000 sats. Wetin fit happen?',
        options: ['E must work because balance plenty', 'E fit fail because inbound space never dey', 'Dem must charge routing fee'],
        actionLabel: 'I understand liquidity', helper: 'Check whether the wallet get ability to receive before anybody send big payment.',
    },
    23: {
        name: 'Receive sats with Lightning', tagline: 'Create invoice and see how e look.',
        heading: 'Lightning invoice na payment request',
        body: 'To receive with Lightning, create invoice. The invoice carry amount and information wey wallet need to route payment.\n\nOne invoice na for one payment. If you wan receive again, create fresh one. Invoice still get expiry time.\n\nBitPilot go create 100-sat practice invoice. The label for top go tell you if na simulation or test network.',
        tip: 'Invoice fit expire and na one payment only. Create fresh one when you need am.',
        question: 'How many times one Lightning invoice fit collect payment?',
        options: ['Any number of times', 'One time only', 'Any time before expiry'],
        actionLabel: 'Create my Lightning invoice', helper: 'We go create 100-sat invoice. Check the top label to know whether na simulation or test network.',
    },
    24: {
        name: 'Send sats with Lightning', tagline: 'Lightning address look like email and easy to use.',
        heading: 'Lightning address: alice@getalby.com',
        body: 'Fresh invoice every time fit stress. Lightning address solve am with name wey look like email, like alice@getalby.com. Your wallet go request fresh invoice behind the scene and pay am.\n\nFor this practice, you go send only 50 sats. Check the label to know whether na simulation or test network before you continue.',
        tip: 'You need receiving wallet to collect and balance to send.',
        question: 'Which one look like Lightning address?',
        options: ['Long random letters and numbers', 'alice@somewallet.com', 'Only QR code'],
        actionLabel: 'Send 50 sats', helper: 'Type any Lightning address, like demo@ln.tips. Check the top label first.',
    },
    106: {
        name: 'Compare the real transfer cost', tagline: 'The fee wey dem advertise no be all the money wey receiver go lose.',
        heading: 'Compare wetin receiver go finally get',
        body: 'Ada for Lagos dey expect ₦80,000. One app fit talk say fee small, but give bad naira rate. Another one fit show bigger fee but deliver more money after conversion and cash-out. Bitcoin route fit still get wallet, conversion, or cash-out cost.\n\nUse the real quotes wey dey your screen. Put the naira amount wey each route promise, then remove every charge wey receiver still need pay. BitPilot no dey fetch or recommend exchange rate.\n\nBetter route na the safe one wey leave more spendable naira for receiver when dem need am—not the one wey shout “zero fee” pass.',
        tip: 'Ask: “How much receiver fit really spend?” That one number help you compare routes.',
        question: 'Which number best help you compare two ways to send money?',
        options: ['The percentage fee wey dem advertise', 'The final spendable money wey receiver get', 'How many people download the app'],
        actionLabel: 'Save my comparison', helper: 'Enter two naira quotes. BitPilot go remove the fees and show wetin receiver fit really spend.',
    },
    107: {
        name: 'Prepare the receiver', tagline: 'Payment never complete until the other person fit use am.',
        heading: 'Agree how receiver go collect and use the money before you send',
        body: 'Before you send serious money, confirm say receiver fit open wallet, create invoice, know when payment enter, and know whether dem go keep sats or change am.\n\nSend small test first. Make receiver confirm the amount inside their own wallet. Talk about cash-out too: which service dem fit use, the fees, ID requirement, and wetin dem go do if the service no work.\n\nNo make your first payment be urgent full amount.',
        tip: 'Small test first, receiver confirm by themself, then send the main amount.',
        question: 'Wetin suppose happen before you send the full money?',
        options: ['Send everything first and explain later', 'Send small test and confirm receiver fit use or change am', 'Ask for another person screenshot'],
        actionLabel: 'Receiver don ready', helper: 'Confirm say receiver get wallet, fit confirm payment, and get real plan to use or cash out.',
    },
    108: {
        name: 'Stop transfer scam', tagline: 'Bitcoin no fit reverse money wey you send give scammer.',
        heading: 'Confirm the person and the request two different ways',
        body: 'Scammers like urgency: “I change wallet, send now.” If address, invoice, or phone number change, slow down.\n\nContact the receiver through another trusted way. Ask question only dem suppose know. Confirm part of the destination or make dem create fresh invoice while una dey talk. No trust payment address from strange message.\n\nFor any new destination, send small test even if you don pay the person before.',
        tip: 'New destination mean new confirmation. Urgency no cancel this rule.',
        question: 'Your family member message from new number and say make you pay urgently. Wetin safe pass?',
        options: ['Pay now because e urgent', 'Confirm through another trusted way, then send small test', 'Forward the address give more people'],
        actionLabel: 'I don confirm the request', helper: 'Talk the second trusted way wey you go use before you pay new destination.',
    },
    109: {
        name: 'When payment fail', tagline: 'Failed payment no mean say make you pay twice.',
        heading: 'Check the payment status before you try again',
        body: 'Lightning payment fit fail because invoice expire, route no get enough liquidity, network cut, or receiver no fit collect the amount.\n\nFirst check wallet status: succeeded, pending, or failed. If e succeed, no pay again; ask receiver to refresh. If e pending, wait. If e fail clear-clear, create fresh invoice before you retry.\n\nKeep the payment ID so support fit investigate.',
        tip: 'Succeeded: no resend. Pending: wait. Failed: use fresh invoice and retry once.',
        question: 'Your wallet talk say payment still pending. Wetin you go do?',
        options: ['Send the same money again now-now', 'Wait for final status and keep payment ID', 'Delete wallet history'],
        actionLabel: 'I know the recovery steps', helper: 'Practise am: succeeded, pending, or failed—then choose the correct next step.',
    },
    110: {
        name: 'Do am again without BitPilot', tagline: 'The real test na to do the next transfer safely without lesson help.',
        heading: 'Your transfer checklist wey you fit use every time',
        body: 'Before:\n• Compare the final spendable amount.\n• Confirm receiver and destination through trusted way.\n• Agree how receiver go use or change the money.\n\nDuring:\n• Send small test.\n• Make receiver confirm am for their own wallet.\n• Send the main amount only after confirmation.\n\nAfter:\n• Save payment ID.\n• Confirm the final usable amount.\n• If anything look wrong, check whether e succeed, pending, or fail before you act.',
        tip: 'Save this checklist where you dey check before you send money.',
        question: 'Wetin show say this journey work?',
        options: ['To remember every technical word', 'To repeat safe transfer with checklist and no lesson help', 'To finish before everybody'],
        actionLabel: 'I fit repeat am safely', helper: 'Read the checklist once without lesson, then explain the steps with your own words.',
    },
}

export function localizeMission(mission: MissionDef, language: Language): MissionDef {
    const copy = language === 'pcm' ? PIDGIN_MISSIONS[mission.id] : undefined
    if (!copy) return mission
    return {
        ...mission,
        name: copy.name,
        tagline: copy.tagline,
        learn: { ...mission.learn, heading: copy.heading, body: copy.body, tip: copy.tip },
        quiz: {
            ...mission.quiz,
            question: copy.question,
            options: mission.quiz.options.map((option, index) => ({ ...option, text: copy.options[index] ?? option.text })),
        },
        do: { ...mission.do, actionLabel: copy.actionLabel, helper: copy.helper },
    }
}
