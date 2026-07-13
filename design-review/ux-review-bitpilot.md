## Bitcoin UX Review

BitPilot, a mobile first web app that teaches Bitcoin, Lightning, Nostr, and eCash through short Learn, Quiz, Do missions. Reviewed for two audiences: learners (primary) and facilitators (secondary). Reviewed from the actual frontend source, screen by screen, in the order a learner meets them.

### Review framework

1. Mistakes are permanent. Unlike a bank transfer, a Bitcoin transaction cannot be reversed, so the design must prevent errors before they happen rather than recovering from them after.
2. Trust is everything. Every screen must answer the user's unspoken question: is my money safe, can I go back, and is everything okay?
3. Onboarding is a crisis point. The first time someone uses a Bitcoin wallet is the moment they are most likely to make a serious mistake, so the first run experience must be exceptionally careful and gentle.
4. Jargon kills adoption. Words like peers, node, mempool and UTXO are normal to developers but meaningless to most users, and every jargon word in the main flow is a person who gives up and leaves.
5. Progressive disclosure. Show beginners the simple version and hide advanced controls until they are actually needed, so the app works for both a first timer and a power user without overwhelming either.
6. Extreme user range. Bitcoin wallets are used by complete beginners and highly technical sovereignty focused users, and the design must work for both ends of that spectrum without patronising one or overwhelming the other.
7. Invisible tech, visible state. The user should never need to understand the technology underneath, but they should always know exactly what is happening right now: did it work, is it pending, or did something fail?
8. Security vs usability tension. Every confirmation step and friction point should earn its place by genuinely protecting the user, not just adding annoying steps that train people to click through without reading.
9. Education is part of the UX. There is no support team to call, so the app itself must teach people as they go through tooltips, loading screen copy, and contextual explanations rather than hiding help in external documentation.
10. Password Protection. There is no central authority who can reset anything. If someone loses their seed phrase, their bitcoin is gone permanently. The design has to make users understand this responsibility from the very beginning, without terrifying them into giving up.

### First impressions

The copy is genuinely good. Someone on this team can write. The landing hero, "Learn Bitcoin by actually using it," is clear, confident, and free of jargon. The four step strip (Learn, Quiz, Do, Level Up) names each step with a plain verb. The trust row on the landing (no real money, your keys your browser, open source, no accounts) is exactly the reassurance a nervous beginner needs, and it appears early. This is already ahead of most Bitcoin products.

The product also feels cohesive. One amber accent, one compass medallion motif, one card style, one type scale. A learner would experience it as a single consistent thing, not a patchwork.

The one place where the calm, careful tone breaks is the highest stakes moment in the whole app: the two missions that hand the user a real secret. The seed phrase mission and the Nostr identity mission both generate a real secret in the browser and then drop it into a results panel with no gate, no confirmation, and no pause. Everywhere else the app slows the user down to protect them (there is even a timed "read the lesson" delay before the quiz unlocks). At the exact moment where slowing down matters most, the app speeds up. That is the core theme of this review.

A second theme: the app mixes simulated and real actions, and the honesty about which is which is good but inconsistent in weight. Some real actions are irreversible (a published Nostr note, a real keypair) and some simulated actions are harmless. A beginner cannot yet tell the difference on their own, so the interface has to carry that weight for them, and right now it carries it unevenly.

### Findings ordered by screen

**Landing (first screen a solo learner sees)**

Principle 4, jargon. The eight tree descriptions are strong but a few lean technical for a cold visitor: "Private bearer money, redeemable to Lightning" and "Signet on-chain, your own node, the long game." A brand new person does not yet know bearer, signet, or node. These sit on the marketing page before any teaching has happened, so we could soften them to outcomes, for example "Cash like tokens you can spend instantly" and "Practice on a safe test network and run your own setup."

Principle 2, trust. The simulated status notes ("Lightning and eCash integrations are currently simulated") are honest and welcome. They currently read as small print. Given that "is my money safe" is the first question a beginner has, we could lift this into the trust row itself so the reassurance and the honesty travel together.

Principle 6, extreme user range. Three primary calls to action share the hero: Continue your missions, Start Learning Bitcoin (or Start fresh), and Run a Workshop. For a first time solo learner, "Run a Workshop" competes for attention with the one thing they should do. We could demote the workshop entry to a quieter secondary position so the learner path is the obvious one.

**Setup (name entry, both solo and join)**

Principle 3, onboarding. This screen is calm and well judged. The privacy line, "Nothing leaves your browser except a real Nostr note you choose to publish later," is a great sentence and exactly the right promise to make here.

Principle 7, visible state. The join variant shows "session, [first 8 characters]" in monospace. To a beginner this looks like a code they might need to keep or might have gotten wrong. A short human label ("You are joining a shared session") would carry more meaning than the truncated id.

Principle 2, trust and reversibility. The button reads "Start the first mission." Good. One small thing: there is no statement of what a name is used for beyond the missions, and whether it is visible to a facilitator. In a workshop a learner may not want their real name on someone else's dashboard. A one line note ("Your name is shown to the person running your session") would remove a quiet privacy worry.

**Session not found (stale deep link)**

Principle 2, trust. This screen is a highlight. It explains what happened in plain words, does not blame the user, and offers the one useful next action. Keep it. The heading "This session has sailed" is charming but see the non native English note below, because sailed is an idiom.

**Mission, Learn step**

Principle 9, education. The forced dwell timer ("Read the lesson, Ns") is a thoughtful anti skim mechanic and fits the teaching mission. It earns its place.

Principle 8, security vs usability. One caution: a countdown that disables the only forward button can read as the app being broken to someone who has already read the lesson, or to a returning user reviewing content. Consider letting the button enable on scroll to the end as an alternative path, so the friction targets skimming rather than punishing fast readers.

**Mission, Quiz step**

Principle 9, education. Strong work here. Options are shuffled so position cannot be gamed, and a wrong answer shows a specific reason ("Not quite," plus the explanation) and sends the user back to the lesson rather than letting them guess again. That is real teaching, not a gate.

Principle 7, visible state. On a correct answer the panel says "Correct. Opening the next step" and advances automatically. The auto advance is smooth, but a user who blinked may not know why the screen changed. A brief hold or a subtle transition label would keep them oriented.

**Mission, Do step, seed phrase (mission 11)**

Principle 1, mistakes are permanent. Principle 10, password protection. This is the most important finding in the review. The app generates a real 12 word BIP39 phrase and renders it inside the green success results block, in a two column detail grid, next to a line labelled "commitment (sent to server)." The summary line says "Your 12 words, write these down on paper." Then a full width primary button invites the user straight to the next mission. There is no reveal gate, no "I have written these down" confirmation, and the phrase sits on screen next to a cryptographic hash that looks equally important to a beginner. The whole point of this mission is to build the habit that a seed phrase is the one thing you protect forever. Right now the interaction teaches the opposite habit: a secret appears, you glance at it, you click the bright button. We could gate the reveal behind a tap, present the words in a numbered grid that clearly reads as "these twelve and nothing else," and require a short confirmation (retype two random words, or at minimum an explicit "I saved these" checkbox) before the Next button activates.

Principle 4, jargon. The label "commitment (sent to server)" is developer language and, worse, sits inches from the secret the user must never send anywhere. A beginner cannot tell that the commitment is safe to send and the phrase is not. Either hide the commitment entirely from the learner view or relabel it in plain words that make the safe or not safe distinction obvious.

Principle 2, trust. The seed mission is tagged "Simulated," which is honest, but it may undercut the lesson. If the user believes the phrase is fake, the habit does not form. Consider keeping the phrase real (it already is, generated locally) and reframing the tag to say the reward is practice while the skill is real.

**Mission, Do step, Nostr identity (mission 14)**

Principle 1, mistakes are permanent. Principle 10, password protection. Same structural issue and higher stakes, because this keypair is real and is used to sign notes broadcast to public relays later in the app. The results block shows the npub labelled "share freely," the nsec labelled "NEVER share," and a next step line, "Copy your nsec into a password manager before continuing," and then the Next button is immediately live. The all caps NEVER is doing a lot of work that the interaction itself is not backing up. The nsec is displayed by default rather than gated, and nothing stops the user from advancing without saving it. If they lose it, the identity and any reputation attached to it are gone. We could gate the nsec behind an explicit "Reveal my secret key" tap, keep it hidden by default, and require the save step to be acknowledged before Next activates.

Principle 7, visible state. npub and nsec look almost identical to a beginner (both long strings starting with n). Color and an icon alone may not be enough. A stronger visual split, for example the public key on a calm surface and the secret key on a clearly marked protected surface with a copy button and a "keep this private" affordance, would prevent the classic mistake of pasting the wrong one.

**Mission, Do step, real actions (pay, ecash spend, nostr publish, onchain signet)**

Principle 7, visible state. The Real and Simulated chips on the result are a genuinely good pattern. Keep them and make them consistent everywhere.

Principle 1, mistakes are permanent. The Nostr publish action ("GM Nostr, I just finished BitPilot") broadcasts a real, public, permanent note to real relays. This is irreversible in practice and public forever, yet it is presented with the same weight as a simulated payment. Before publishing, we could show a short, calm confirmation that names the permanence in plain words: this note is public and cannot be deleted from every relay, publish it? That single step matches the "prevent, do not recover" principle without scaring anyone.

Principle 4, jargon. "Your signet transaction id (64 hex characters)" and the placeholder "64-character hex" will stop a beginner cold. By this point the lesson has hopefully introduced signet, but the input helper could still say what to paste in human terms, for example "Paste the long ID your test transaction produced," with the technical detail available on tap.

**Finished screen**

Principle 2, trust. Warm and motivating. "You did it," the tree checklist, and the completion count all land well. One number to check: "That puts you ahead of about 99% of people on earth." It is a fun line, but an invented statistic can read as marketing to the more skeptical, sovereignty minded end of the audience. Consider a claim you can stand behind, or phrasing it as encouragement rather than a figure.

**Facilitator dashboard**

Principle 6, extreme user range. Reviewed only at the copy and structure level, since as you noted this flow likely wants a wider frame. The loading and empty states are quiet and clear. When we reach the mockup stages we should treat this as its own layout problem rather than a phone screen, because a facilitator scanning a room of learners needs a table or grid, not a single column.

Privacy note carried to the privacy lens below: the facilitator view lists participants by the name they typed, which connects to the Setup finding about telling learners their name is visible.

### Priority actions

1. Rebuild the seed phrase and Nostr identity Do steps so the secret is gated behind a deliberate reveal, is visually separated from anything safe to send, and cannot be skipped past without an explicit "I saved this" confirmation. This is the one place where the app currently teaches the wrong habit at the most important moment.
2. Add a plain language, one step confirmation before any real, irreversible, public action, starting with publishing a Nostr note. Name the permanence in calm words. Keep the Real and Simulated chips, and make the weight of an action match how permanent it is.
3. Remove developer language from the learner path where it sits next to safety decisions, especially "commitment (sent to server)" beside the seed phrase, and soften the technical tree descriptions and the signet input helper.

### Privacy first lens

The foundations are strong. Keys are generated locally, the Setup copy promises that nothing leaves the browser except a note the user chooses to publish, and the trust row states there are no accounts. An activist would find a lot to trust here.

Three places to tighten for high risk users:

The learner types a name and it appears on a facilitator dashboard. A learner in a sensitive context may not realize this. We could say plainly at the point of entry that the name is shown to the session host, and we could suggest a nickname is fine. The placeholders already model first names, so nudging toward a chosen handle would help.

The real Nostr note and profile are public and permanent. The current flow lets a beginner publish before they fully understand that a public relay note ties a persistent identity to whatever they wrote and can be seen by anyone, including in their own country. For the high risk audience this is the single most consequential action in the app. A calm pre publish explanation of what public and permanent mean, plus a reminder that this identity is real and reusable, protects exactly the people you built this for.

The nsec is the person's real identity secret. Displaying it by default, in plain text, next to a bright forward button, is a shoulder surfing and screenshot risk in a room full of strangers at a workshop. Gating it behind a reveal tap and keeping it hidden by default is a privacy win as much as a security one.

Nothing in the copy makes the user feel surveilled, and the language is empowering rather than dependency creating. That tone is right for this audience.

### Non-native English speaker lens

The writing is mostly plain and short, which is exactly right. A few items rely on idiom or English specific phrasing that a second language reader could miss in a stressful moment.

"This session has sailed." Original heading on the stale link screen. Sailed is an idiom for gone or too late and will not translate. Suggested replacement: "This session is no longer available."

"No filler." Original, in the Learn step description. Filler in this sense is informal. Suggested replacement: "Only what you need."

"prove the idea actually landed." Original, Quiz step description. Landed here is idiomatic. Suggested replacement: "check that the idea is clear."

"Not quite." Original, wrong answer feedback. Common but idiomatic softener. It is gentle, so it can stay, but "That answer is not correct." is clearer for a second language reader if you want maximum clarity.

"Got it, take the quiz." Original, Learn step button. Got it is idiomatic. Suggested replacement: "I understand, take the quiz."

"GM Nostr." Original, default note text. GM is community slang for good morning and will read as a typo to newcomers. It is a fun in joke, so consider keeping it but not as the default prewritten text a beginner publishes without understanding it.

"the whole stack." Original, hero paragraph. Stack is developer jargon here. Suggested replacement: "everything, step by step."

"drive-by visitor," "the long game," "act accordingly." These appear in code comments and tree copy. "The long game" and "act accordingly" (in "The chain is public, act accordingly") are idioms. Suggested replacement for the tree line: "Everything on the chain is public, so plan for that."

"commitment (sent to server)." Beyond being jargon, commitment has an everyday meaning (a promise) that will confuse a second language reader entirely. Remove from the learner view or relabel in plain words.

General note: the app already favors short sentences and simple words in most places. Holding that standard through the two secret revealing missions, which are currently the most jargon heavy screens, would make the hardest moment the clearest one.

### What is working well

The Learn, Quiz, Do model is a genuinely strong teaching loop, and the execution shows care: shuffled quiz answers, specific wrong answer explanations that send you back to the lesson, and a forced reading pause. This is better pedagogy than most paid Bitcoin courses.

The honesty about simulated versus real, expressed through the Real and Simulated chips and the plain status notes, builds exactly the kind of trust this space usually fails at.

The privacy posture is excellent by default: local key generation, no accounts, and a clear promise that nothing leaves the browser without consent.

The tone is warm without being childish, and it holds together as one product. The Session not found screen in particular is a small masterclass in blameless, helpful error handling.

And most of the copy already passes the plain language test. The team clearly values clarity. The recommendations above are about extending that same clarity and care into the two or three screens where the stakes are highest and the current design lets the user move too fast.
