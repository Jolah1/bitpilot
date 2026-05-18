import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Participant, Mission } from "../lib/types";
import { fetchParticipant, completePhase } from "../lib/api";

// ── Emoji + plain-English mission metadata ───────────────────────────────────
const MISSIONS = [
    {
        id: 1,
        emoji: "🪪",
        name: "Get your Bitcoin ID",
        tagline: "Like a username, but nobody can steal it",
        learn: {
            heading: "What is a Nostr identity?",
            body: "Think of it like creating a Gmail account — but instead of Google owning it, YOU own it forever. Nobody can delete it or take it away. You'll get two keys:\n\n🔑 Your PUBLIC key (npub) — share this freely, like your phone number\n🔒 Your PRIVATE key (nsec) — NEVER share this, like your PIN",
            tip: "Write your private key on paper and keep it somewhere safe!",
        },
        quiz: {
            question: "Your PRIVATE key (nsec) is like your PIN. What should you do with it?",
            options: [
                { text: "Post it on Twitter so people can find me", correct: false },
                { text: "Keep it secret and never share it with anyone", correct: true },
                { text: "Send it to a friend for safekeeping", correct: false },
            ],
        },
        action: "Generate my Bitcoin ID",
        actionHint: "Tap the button — it takes less than a second!",
    },
    {
        id: 2,
        emoji: "📥",
        name: "Receive real Bitcoin",
        tagline: "Get actual sats sent to you right now",
        learn: {
            heading: "What is a Lightning invoice?",
            body: "Lightning is like a super-fast lane on the Bitcoin highway. Instead of waiting 10 minutes for a normal Bitcoin transaction, Lightning sends money in under a second.\n\n🧾 An invoice is like a payment request — like asking someone to pay you on PayPal, but for Bitcoin.\n\nYou'll create an invoice and the facilitator will pay it. Real money. Real Bitcoin.",
            tip: "The amount is tiny (a few pennies) — this is just practice!",
        },
        quiz: {
            question: "Lightning Bitcoin transactions are…",
            options: [
                { text: "Slow — takes about 10 minutes", correct: false },
                { text: "Instant — under a second", correct: true },
                { text: "Impossible — Bitcoin can't be sent fast", correct: false },
            ],
        },
        action: "Create my payment request",
        actionHint: "We'll create a QR code. The facilitator will scan it to send you sats!",
    },
    {
        id: 3,
        emoji: "📤",
        name: "Send 50 sats",
        tagline: "Pay someone with real Bitcoin",
        learn: {
            heading: "What is a Lightning Address?",
            body: "A Lightning Address looks like an email address (e.g. alice@ln.tips) but it's actually a Bitcoin payment address.\n\nSending Bitcoin used to be complicated. With a Lightning Address it's as easy as sending an email — just type the address and press send!\n\n50 sats is less than 1 penny. Think of it like a practice payment.",
            tip: "No need to worry about the amount — 50 sats is tiny!",
        },
        quiz: {
            question: "A Lightning Address looks like…",
            options: [
                { text: "A long random string of letters and numbers", correct: false },
                { text: "An email address like alice@wallet.com", correct: true },
                { text: "A phone number", correct: false },
            ],
        },
        action: "Send 50 sats",
        actionHint: "Type the address your facilitator gives you and hit Send!",
    },
    {
        id: 4,
        emoji: "🎟️",
        name: "Claim a secret token",
        tagline: "Private money — like cash, but digital",
        learn: {
            heading: "What is eCash?",
            body: "When you pay with a card, your bank knows exactly what you bought. Not ideal!\n\neCash is like digital cash — when you hand someone a £10 note, nobody tracks it. Cashu eCash works the same way on Bitcoin.\n\n🔒 It's completely private\n💸 It's real Bitcoin value\n⚡ It's instant\n\nYou'll receive a token (just a piece of text) that you can redeem for real sats.",
            tip: "Think of it like receiving a gift card code over text message!",
        },
        quiz: {
            question: "What makes eCash special compared to normal card payments?",
            options: [
                { text: "It's faster than Lightning", correct: false },
                { text: "Nobody can track what you spend it on", correct: true },
                { text: "You can spend more than you have", correct: false },
            ],
        },
        action: "Claim my token",
        actionHint: "Paste the token code your facilitator sends you",
    },
    {
        id: 5,
        emoji: "📢",
        name: "Post your first note",
        tagline: "Send a message the whole world can see — forever",
        learn: {
            heading: "What is Nostr?",
            body: "Twitter/X can delete your account anytime. Facebook can ban you. Nostr is different.\n\nNostr is a messaging network where nobody is in charge. Your posts are signed with your private key (from Mission 1!) — so only YOU can post as you, and nobody can delete it.\n\nYou'll publish a short note to the whole Nostr network. It'll be there forever.",
            tip: "Keep it friendly — it really is permanent!",
        },
        quiz: {
            question: "On Nostr, who can delete your posts?",
            options: [
                { text: "The company that runs Nostr", correct: false },
                { text: "Nobody — Nostr has no company in charge", correct: true },
                { text: "Your internet provider", correct: false },
            ],
        },
        action: "Publish my note",
        actionHint: "Write anything you like — your first Nostr message!",
    },
];

// ── Race mechanic: countdown + leaderboard position ──────────────────────────
interface RaceState {
    active: boolean;
    endsAt: number | null;
    prizePool: number;
    myRank: number | null;
    totalParticipants: number;
}

function RaceBanner({ race, sessionId }: { race: RaceState; sessionId: string }) {
    const [secondsLeft, setSecondsLeft] = useState(0);

    useEffect(() => {
        if (!race.active || !race.endsAt) return;
        const tick = () => setSecondsLeft(Math.max(0, Math.round((race.endsAt! - Date.now()) / 1000)));
        tick();
        const t = setInterval(tick, 500);
        return () => clearInterval(t);
    }, [race]);

    if (!race.active) return null;

    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const urgent = secondsLeft < 30;

    return (
        <div className={`race-banner ${urgent ? "urgent" : ""}`}>
            <div className="race-left">
                <span className="race-icon">⚡</span>
                <div>
                    <p className="race-title">Race is ON!</p>
                    <p className="race-sub">First to finish wins {race.prizePool.toLocaleString()} sats</p>
                </div>
            </div>
            <div className="race-right">
                <div className={`race-timer ${urgent ? "urgent" : ""}`}>
                    {mins > 0 ? `${mins}m ` : ""}{String(secs).padStart(2, "0")}s
                </div>
                {race.myRank !== null && (
                    <div className="race-rank">#{race.myRank} of {race.totalParticipants}</div>
                )}
            </div>

            <style>{`
        .race-banner {
          display: flex; align-items: center; justify-content: space-between;
          background: var(--color-background-warning);
          border: 0.5px solid var(--color-border-warning);
          border-radius: var(--border-radius-lg);
          padding: 12px 16px; margin-bottom: 1.25rem;
          transition: background 0.3s;
        }
        .race-banner.urgent { background: var(--color-background-danger); border-color: var(--color-border-danger); }
        .race-left { display: flex; align-items: center; gap: 10px; }
        .race-icon { font-size: 1.25rem; }
        .race-title { font-size: 14px; font-weight: 500; color: var(--color-text-warning); margin: 0; }
        .race-banner.urgent .race-title { color: var(--color-text-danger); }
        .race-sub { font-size: 12px; color: var(--color-text-secondary); margin: 0; }
        .race-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .race-timer { font-size: 22px; font-weight: 500; font-family: var(--font-mono); color: var(--color-text-warning); }
        .race-timer.urgent { color: var(--color-text-danger); }
        .race-rank { font-size: 11px; color: var(--color-text-secondary); }
      `}</style>
        </div>
    );
}

// ── Main learner view ─────────────────────────────────────────────────────────
export default function LearnerView({
    participantId,
    sessionId,
}: {
    participantId: string;
    sessionId: string;
}) {
    const [phase, setPhase] = useState<"learn" | "quiz" | "do">("learn");
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [quizResult, setQuizResult] = useState<"correct" | "wrong" | null>(null);
    const [noteText, setNoteText] = useState("");

    const { data: participant } = useQuery({
        queryKey: ["participant", participantId],
        queryFn: () => fetchParticipant(participantId),
        refetchInterval: 5000,
    });

    const currentMissionIdx = participant?.missions_completed ?? 0;
    const mission = MISSIONS[currentMissionIdx];
    const allDone = currentMissionIdx >= 5;

    // Mock race state — replace with real API polling
    const race: RaceState = {
        active: true,
        endsAt: Date.now() + 4 * 60 * 1000,
        prizePool: 5000,
        myRank: participant ? (participant.missions_completed + 1) : null,
        totalParticipants: 12,
    };

    const completeMutation = useMutation({
        mutationFn: () =>
            completePhase({ participantId, missionId: mission.id, phase }),
        onSuccess: () => {
            if (phase === "learn") setPhase("quiz");
            else if (phase === "quiz") setPhase("do");
            else {
                setPhase("learn");
                setSelectedAnswer(null);
                setQuizResult(null);
            }
        },
    });

    const handleQuizSubmit = () => {
        if (selectedAnswer === null) return;
        const correct = mission.quiz.options[selectedAnswer].correct;
        setQuizResult(correct ? "correct" : "wrong");
        if (correct) {
            setTimeout(() => completeMutation.mutate(), 800);
        }
    };

    if (allDone) {
        return (
            <div className="lv-root">
                <div className="lv-done">
                    <div className="lv-done-icon">🎉</div>
                    <h1 className="lv-done-title">You did it!</h1>
                    <p className="lv-done-sub">
                        You just used real Bitcoin. Lightning. Nostr. eCash.<br />
                        Welcome to the future of money.
                    </p>
                    {race.myRank === 1 && (
                        <div className="lv-winner">
                            ⚡ You won the race! {race.prizePool.toLocaleString()} sats incoming!
                        </div>
                    )}
                </div>
                <style>{doneStyles}</style>
            </div>
        );
    }

    if (!mission) return null;

    return (
        <div className="lv-root">
            <RaceBanner race={race} sessionId={sessionId} />

            {/* Progress bar */}
            <div className="lv-progress-row">
                {MISSIONS.map((m, i) => (
                    <div
                        key={i}
                        className={`lv-progress-step ${i < currentMissionIdx ? "done" : i === currentMissionIdx ? "active" : ""
                            }`}
                    >
                        <div className="lv-step-dot">{i < currentMissionIdx ? "✓" : m.emoji}</div>
                        <span className="lv-step-label">{m.name}</span>
                    </div>
                ))}
            </div>

            {/* Mission card */}
            <div className="lv-card">
                <div className="lv-card-top">
                    <span className="lv-mission-emoji">{mission.emoji}</span>
                    <div>
                        <p className="lv-mission-num">Mission {currentMissionIdx + 1} of 5</p>
                        <h2 className="lv-mission-name">{mission.name}</h2>
                        <p className="lv-mission-tagline">{mission.tagline}</p>
                    </div>
                </div>

                {/* Phase tabs */}
                <div className="lv-tabs">
                    {(["learn", "quiz", "do"] as const).map((p, i) => (
                        <div
                            key={p}
                            className={`lv-tab ${phase === p ? "active" : ""} ${(p === "quiz" && phase === "learn") || (p === "do" && phase !== "do") ? "locked" : ""
                                }`}
                        >
                            <span className="lv-tab-num">{i + 1}</span>
                            <span className="lv-tab-name">
                                {p === "learn" ? "Read" : p === "quiz" ? "Quick quiz" : "Do it!"}
                            </span>
                        </div>
                    ))}
                </div>

                {/* ── LEARN phase ── */}
                {phase === "learn" && (
                    <div className="lv-phase">
                        <h3 className="lv-learn-heading">{mission.learn.heading}</h3>
                        <div className="lv-learn-body">
                            {mission.learn.body.split("\n\n").map((para, i) => (
                                <p key={i}>{para}</p>
                            ))}
                        </div>
                        <div className="lv-tip">
                            <span className="lv-tip-icon">💡</span>
                            <span>{mission.learn.tip}</span>
                        </div>
                        <button className="lv-btn primary" onClick={() => setPhase("quiz")}>
                            I understand — take the quiz →
                        </button>
                    </div>
                )}

                {/* ── QUIZ phase ── */}
                {phase === "quiz" && (
                    <div className="lv-phase">
                        <p className="lv-quiz-q">{mission.quiz.question}</p>
                        <div className="lv-options">
                            {mission.quiz.options.map((opt, i) => (
                                <button
                                    key={i}
                                    className={`lv-option ${selectedAnswer === i ? "selected" : ""} ${quizResult === "correct" && opt.correct ? "correct" : ""
                                        } ${quizResult === "wrong" && selectedAnswer === i ? "wrong" : ""}`}
                                    onClick={() => {
                                        if (quizResult) return;
                                        setSelectedAnswer(i);
                                    }}
                                    disabled={!!quizResult}
                                >
                                    <span className="lv-option-letter">
                                        {["A", "B", "C"][i]}
                                    </span>
                                    <span>{opt.text}</span>
                                </button>
                            ))}
                        </div>
                        {quizResult === "wrong" && (
                            <div className="lv-feedback wrong">
                                Not quite! Re-read the lesson and try again.
                                <button
                                    className="lv-btn ghost"
                                    style={{ marginTop: 8 }}
                                    onClick={() => {
                                        setSelectedAnswer(null);
                                        setQuizResult(null);
                                        setPhase("learn");
                                    }}
                                >
                                    ← Back to lesson
                                </button>
                            </div>
                        )}
                        {quizResult === "correct" && (
                            <div className="lv-feedback correct">
                                Correct! Opening the next step… ✓
                            </div>
                        )}
                        {!quizResult && (
                            <button
                                className="lv-btn primary"
                                onClick={handleQuizSubmit}
                                disabled={selectedAnswer === null}
                            >
                                Submit answer
                            </button>
                        )}
                    </div>
                )}

                {/* ── DO phase ── */}
                {phase === "do" && (
                    <div className="lv-phase">
                        <div className="lv-do-hint">
                            <span style={{ fontSize: "1.5rem" }}>👇</span>
                            <p>{mission.actionHint}</p>
                        </div>

                        {/* Mission-specific action UI */}
                        {currentMissionIdx === 4 && (
                            <textarea
                                className="lv-textarea"
                                placeholder="Write your first Nostr note here…"
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                rows={3}
                            />
                        )}

                        <button
                            className="lv-btn primary large"
                            onClick={() => completeMutation.mutate()}
                            disabled={
                                completeMutation.isPending ||
                                (currentMissionIdx === 4 && !noteText.trim())
                            }
                        >
                            {completeMutation.isPending ? (
                                <span className="lv-spinner" />
                            ) : (
                                <>
                                    {mission.emoji} {mission.action}
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            <style>{styles}</style>
        </div>
    );
}

const styles = `
  .lv-root {
    max-width: 560px; margin: 0 auto;
    padding: 1.25rem 1rem 3rem;
    font-family: var(--font-sans);
    color: var(--color-text-primary);
  }
  .lv-progress-row {
    display: flex; gap: 4px; margin-bottom: 1.25rem;
    overflow-x: auto; padding-bottom: 4px;
  }
  .lv-progress-step {
    display: flex; flex-direction: column; align-items: center;
    gap: 4px; flex: 1; min-width: 60px; opacity: 0.35;
  }
  .lv-progress-step.done { opacity: 0.7; }
  .lv-progress-step.active { opacity: 1; }
  .lv-step-dot {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--color-background-secondary);
    border: 0.5px solid var(--color-border-tertiary);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }
  .lv-progress-step.active .lv-step-dot {
    background: #F7931A; border-color: #F7931A; color: #000;
  }
  .lv-progress-step.done .lv-step-dot {
    background: var(--color-background-success);
    border-color: var(--color-border-success);
    color: var(--color-text-success); font-size: 12px;
  }
  .lv-step-label {
    font-size: 10px; color: var(--color-text-secondary);
    text-align: center; line-height: 1.2;
  }
  .lv-card {
    background: var(--color-background-primary);
    border: 0.5px solid var(--color-border-tertiary);
    border-radius: var(--border-radius-xl);
    overflow: hidden;
  }
  .lv-card-top {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 1.25rem 1.25rem 0;
  }
  .lv-mission-emoji { font-size: 2rem; line-height: 1; margin-top: 2px; }
  .lv-mission-num { font-size: 11px; color: var(--color-text-secondary); margin: 0 0 2px; letter-spacing: 0.06em; text-transform: uppercase; }
  .lv-mission-name { font-size: 20px; font-weight: 500; margin: 0 0 2px; }
  .lv-mission-tagline { font-size: 13px; color: var(--color-text-secondary); margin: 0; }
  .lv-tabs {
    display: flex; margin: 1rem 1.25rem 0;
    border: 0.5px solid var(--color-border-tertiary);
    border-radius: var(--border-radius-md); overflow: hidden;
  }
  .lv-tab {
    flex: 1; display: flex; align-items: center; justify-content: center;
    gap: 6px; padding: 8px 4px;
    font-size: 12px; color: var(--color-text-secondary);
    border-right: 0.5px solid var(--color-border-tertiary);
  }
  .lv-tab:last-child { border-right: none; }
  .lv-tab.active { background: var(--color-background-secondary); color: var(--color-text-primary); font-weight: 500; }
  .lv-tab.locked { opacity: 0.4; }
  .lv-tab-num {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--color-border-tertiary);
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; flex-shrink: 0;
  }
  .lv-tab.active .lv-tab-num { background: #F7931A; color: #000; }
  .lv-phase { padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
  .lv-learn-heading { font-size: 17px; font-weight: 500; margin: 0; }
  .lv-learn-body { font-size: 15px; line-height: 1.7; color: var(--color-text-primary); }
  .lv-learn-body p { margin: 0 0 0.75rem; }
  .lv-learn-body p:last-child { margin-bottom: 0; }
  .lv-tip {
    display: flex; align-items: flex-start; gap: 8px;
    background: var(--color-background-info);
    border: 0.5px solid var(--color-border-info);
    border-radius: var(--border-radius-md);
    padding: 10px 12px; font-size: 13px; color: var(--color-text-info);
  }
  .lv-tip-icon { flex-shrink: 0; }
  .lv-quiz-q { font-size: 16px; font-weight: 500; margin: 0; line-height: 1.4; }
  .lv-options { display: flex; flex-direction: column; gap: 8px; }
  .lv-option {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; font-size: 14px;
    background: var(--color-background-secondary);
    border: 0.5px solid var(--color-border-tertiary);
    border-radius: var(--border-radius-md);
    cursor: pointer; text-align: left; color: var(--color-text-primary);
    transition: border-color 0.15s, background 0.15s;
  }
  .lv-option:hover:not(:disabled) { border-color: var(--color-border-secondary); }
  .lv-option.selected { border-color: #F7931A; background: var(--color-background-primary); }
  .lv-option.correct { border-color: var(--color-border-success); background: var(--color-background-success); color: var(--color-text-success); }
  .lv-option.wrong { border-color: var(--color-border-danger); background: var(--color-background-danger); color: var(--color-text-danger); }
  .lv-option-letter {
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--color-background-primary);
    border: 0.5px solid var(--color-border-secondary);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 500; flex-shrink: 0;
  }
  .lv-feedback {
    padding: 10px 12px; border-radius: var(--border-radius-md);
    font-size: 13px; display: flex; flex-direction: column; gap: 4px;
  }
  .lv-feedback.correct { background: var(--color-background-success); color: var(--color-text-success); }
  .lv-feedback.wrong { background: var(--color-background-danger); color: var(--color-text-danger); }
  .lv-do-hint {
    display: flex; align-items: center; gap: 10px;
    font-size: 14px; color: var(--color-text-secondary); line-height: 1.4;
  }
  .lv-textarea {
    width: 100%; font-size: 15px; padding: 10px 12px;
    border-radius: var(--border-radius-md);
    font-family: var(--font-sans); resize: vertical;
    box-sizing: border-box;
  }
  .lv-btn {
    padding: 11px 18px; border-radius: var(--border-radius-md);
    font-size: 14px; font-weight: 500; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    transition: opacity 0.15s;
  }
  .lv-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .lv-btn.primary { background: #F7931A; color: #000; border: none; }
  .lv-btn.primary:hover:not(:disabled) { opacity: 0.88; }
  .lv-btn.primary.large { padding: 14px 18px; font-size: 16px; }
  .lv-btn.ghost { background: transparent; border: 0.5px solid var(--color-border-secondary); color: var(--color-text-secondary); font-size: 13px; align-self: flex-start; }
  .lv-spinner {
    width: 16px; height: 16px;
    border: 2px solid rgba(0,0,0,0.25); border-top-color: #000;
    border-radius: 50%; animation: lv-spin 0.7s linear infinite;
  }
  @keyframes lv-spin { to { transform: rotate(360deg); } }
  .lv-done {
    text-align: center; padding: 3rem 1rem;
    display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  }
  .lv-done-icon { font-size: 4rem; }
  .lv-done-title { font-size: 28px; font-weight: 500; margin: 0; }
  .lv-done-sub { font-size: 15px; color: var(--color-text-secondary); line-height: 1.6; margin: 0; }
  .lv-winner {
    background: var(--color-background-warning);
    border: 0.5px solid var(--color-border-warning);
    color: var(--color-text-warning); border-radius: var(--border-radius-lg);
    padding: 12px 20px; font-size: 15px; font-weight: 500;
  }
`;
const doneStyles = styles;

