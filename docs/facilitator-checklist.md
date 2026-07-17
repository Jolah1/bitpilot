# Facilitator checklist: running a live BitPilot workshop

Everything here was rehearsed end to end against the real app. App URL: **https://bitpilot-app.vercel.app**

## Before the session

- [ ] Open the app on the venue wifi from both a laptop and a phone. If either fails, sort the network out first.
- [ ] Pick your facilitator device (the one you will project or keep open all session). Use a normal browser window, not incognito: your facilitator key is stored in the browser, and losing it means losing the dashboard for that session.
- [ ] On the landing page choose "🎓 Run a Workshop", enter your name and a session name learners will recognize, then hit "Start the first mission".
- [ ] Switch the header toggle to **FACILITATOR**. While the room is empty the join QR shows automatically, with the join link and a Copy button under it.
- [ ] Optional dry run: scan the QR with your own phone, join under a test name, and confirm you appear on the roster within a few seconds.

## As people arrive

- [ ] Project the QR, or paste the join link into the group chat with the Copy button. Learners scan, type their name, and tap "Start the first mission". That is the entire onboarding.
- [ ] The QR hides itself once people start joining. "Show QR" in the header brings it back for latecomers.
- [ ] Confirm the **Participants** tile matches the room. New joins appear within one poll cycle (about 3 seconds), no refresh needed.

## During the session

The dashboard updates itself every few seconds. What each part tells you:

- **Participants / Finished / Avg. progress** tiles: the room at a glance.
- **Needs a hand**: counts learners idle for 4 minutes or more. When it goes above zero, find that row on the roster and check on them in person.
- **Where is everyone?**: the spread of the class across the curriculum, with a note on which mission most of the room is on. Use it to decide when to pause and explain something to everyone at once.
- **Roster rows**: each learner's current flight path and per-mission progress chips.

Tips:

- Learners each control their own pace; there is no facilitator gating. If the spread gets wide, that is normal.
- The first flight path (Money Basics, 8 missions) takes a typical learner 30 to 45 minutes including quizzes.
- Finishing a flight path triggers the badge celebration on the learner's device: they can save the badge, share it, or mint a verifiable certificate. Budget a few minutes for this, people enjoy it.

## Large rooms (roughly 20+ learners)

The backend rate limiter budgets requests per IP address, and a whole venue usually shares one public IP. The default budget absorbs a small room easily but a big class tapping through quizzes at the same moment can hit "Too many requests" errors. For a big session, raise the limits ahead of time:

```
fly secrets set RATE_LIMIT_PER_SEC=50 RATE_LIMIT_BURST=300 -a bitpilot
```

and restore the defaults afterwards with `fly secrets unset RATE_LIMIT_PER_SEC RATE_LIMIT_BURST -a bitpilot`.

## Wrapping up

- [ ] Call out the badge and certificate flow: anyone who finished a flight path can share their badge or generate a verifiable certificate link from the celebration screen.
- [ ] Tell learners the app keeps working after the session: their progress lives in their browser plus the server, and the same device picks up where they left off.
- [ ] Note down where people got stuck or asked questions. That list is the best input for the next content pass.
- [ ] "Exit" in the header leaves the dashboard. The session stays live on the server, so you can return to it from the same browser.
