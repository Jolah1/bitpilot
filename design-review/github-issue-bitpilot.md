# UX: Seed phrase and Nostr identity Do steps, gate the secret reveal

## Summary

BitPilot already teaches better than most paid Bitcoin courses, and the copy is genuinely strong. This issue is about one opportunity: at the two moments where the app hands a learner a real secret (the seed phrase in mission 11 and the Nostr key pair in mission 14), the interaction currently moves faster than the stakes deserve. A few focused changes would turn the hardest moment in the product into the clearest one, and help many more learners finish with a secret they actually saved.

## Review framework

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

## Findings ordered by screen

**Seed phrase Do step, mission 11**

Principle 1 and 10. The app generates a real 12 word BIP39 phrase and renders it inside the green success results block, then immediately offers a full width Next button. There is no reveal gate and no confirmation that the learner saved the words, so the interaction teaches a glance and a click rather than the habit of protecting a secret.

Principle 4. The phrase is shown in a two column grid next to a line labelled "commitment (sent to server)." A beginner cannot tell that the commitment is safe to send while the phrase must never leave their hands. The word commitment also has an everyday meaning that adds confusion for second language readers.

Principle 2. The mission is tagged "Simulated," which is honest but may lead the learner to treat the phrase as fake, so the intended habit does not form.

**Nostr identity Do step, mission 14**

Principle 1 and 10. This key pair is real and is used to sign notes broadcast to public relays later in the app. The nsec is displayed in plain text by default, labelled "nsec (NEVER share)," and the Next button is live immediately. The all caps warning is carrying weight that the interaction itself does not back up. If the learner advances without saving the nsec, the identity is gone.

Principle 7. The npub and the nsec look almost identical to a beginner, since both are long strings that start with n. Colour and a label alone are not enough to prevent the classic mistake of copying the wrong one.

Privacy note. Showing the secret key in plain text by default is a shoulder surfing and screenshot risk in a room full of strangers at a workshop.

**Real, permanent, public actions, for example nostr publish**

Principle 1 and 2. Publishing a Nostr note broadcasts a real, public, permanent message to real relays, yet it is presented with the same weight as a simulated payment. There is no confirmation that names the permanence before the note goes out.

## Suggested changes

Seed phrase Do step:
1. We could move the 12 words onto a clearly bordered protected surface, shown as a numbered grid so they read as these twelve and nothing else.
2. We could remove the "commitment (sent to server)" line from the learner view entirely, so nothing safe to send sits beside the secret.
3. We could keep the Next button inactive until the learner confirms with a single checkbox, for example "I have written down all 12 words on paper."
4. We could reframe the tag from "Simulated" to "Practice," since the phrase itself is really generated and the skill is real.

Nostr identity Do step:
1. We could place the public key and the secret key on visibly different surfaces so they can never be confused.
2. We could hide the nsec by default and reveal it only on a deliberate tap, which also protects against shoulder surfing and screenshots.
3. We could keep the Next button inactive until the learner confirms they saved the secret key.

Real, permanent, public actions:
1. We could add one calm confirmation step before any real, irreversible, public action, starting with publishing a Nostr note. The copy could name the permanence in plain words, for example: this note is public and cannot be fully deleted once sent, and it can be read by anyone, including in your own country.
2. We could keep the existing Real and Simulated chips, and make the weight of the confirmation match how permanent the action is. An easy path back to edit keeps the friction protective rather than punishing.

Plain language pass, since these are the most jargon heavy screens in an otherwise very clear app:
1. Replace "commitment (sent to server)" with plain words, or hide it.
2. Prefer short, literal sentences over idioms in these two missions, so the hardest moment is also the clearest.

## Reference

Wallet of Satoshi is a useful benchmark for how calm and sparse a high stakes screen can feel: one job, one large action, everything technical hidden. Muun is a useful benchmark for gentle onboarding and for framing a secret as a kit the user keeps rather than a test they might fail. Both were explored against the mission 14 secret key screen during this review, and the one pattern worth carrying into production regardless of visual style is hiding the secret behind a deliberate reveal tap.
