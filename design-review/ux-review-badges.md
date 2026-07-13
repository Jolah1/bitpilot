## Bitcoin UX Review: Badge and level completion flow

A focused review of what happens when a learner finishes a skill tree in BitPilot: the full screen celebration modal, the share badge modal, and the badge artwork itself. Reviewed from the real components (BadgeCelebrationModal, ShareBadgeModal, TierBadgeCard) so the critique is of the exact words and actions on screen.

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

This flow is a joy. The timing is right: the celebration only fires after a whole tree is done, so it feels earned rather than constant. The interrupt is bold on purpose, the badge swings, confetti falls, and the copy ("Tree complete", "You earned the {tree} badge") is warm and clear. Dismissal is handled with real care: Escape, backdrop tap, and an auto focused Continue button all work, reduced motion is respected, and focus is trapped correctly even with the nested share modal. This is thoughtful engineering in service of a good feeling.

The one place the calm care of the rest of the flow drops away is the moment the badge leaves the app and goes onto the public internet. The share action posts to X with the learner's name and a fragment of their internal ID, and it does this with no pause and no privacy note. For a general learner that is a small thing. For the activist, journalist, or dissident this product is built for, it is the single most consequential screen in the whole badge flow, and right now it is the least protected. That is the theme of this review.

A secondary theme: the naming of the share action drifts. It is called "Save / share badge" on the button, the modal it opens is titled "Your badge", the code comments call it "Save badge", and the follow up copy talks about tweeting. The learner meets three slightly different names for one thing.

### Findings ordered by screen

**Celebration modal (fires on tree completion)**

Principle 2, trust. The subline promise is lovely: "Save the badge or share it, it's yours." It sets the right tone of ownership. Keep it.

Principle 7, visible state. "Continue mission" is singular, but the learner is returning to a whole set of next missions, and the dismiss hint just below even says "return to your next mission". We could align these to one phrasing, for example "Back to missions".

Cohesiveness. The primary button says "Save / share badge" while the modal it opens is titled "Your badge". A learner taps a button about saving and lands on a screen titled something else. One consistent name, used on the button, the modal title, and the subline, would make the two screens feel like one action.

**Share badge modal**

Principle 1 and 2, permanence and trust. This is the most important finding. "Share on X" posts a public, permanent tweet from the learner's account. Public posts cannot be reliably deleted once they spread, and this one ties the learner's chosen name to the statement that they are learning Bitcoin. There is no confirmation that names what is about to happen and no note about who will see it. This is the same shape as publishing a Nostr note, which the app now confirms carefully, so the two experiences should match. Before opening X, we could show one calm line: this opens a public post on X from your account, and anyone can see it.

Privacy, carried to the lens below. The badge image and the tweet both include a Badge ID of the form BP, tree, then the first eight characters of the participant's internal id. Posting it publicly exposes a stable fragment that is identical across every badge the same person shares, which lets an observer link all of a learner's badges to one identity. Combined with the name printed on the badge, this is a real correlation and deanonymisation vector for a high risk user.

Principle 4, jargon. "Badge ID" is unexplained. A learner does not know what it is, why it exists, or why it is being posted to X. To a privacy minded user an unexplained ID that gets published reads as tracking. If it stays, it needs a plain explanation. Better, it does not need to be in the public tweet at all.

Principle 6 and 9, user range and on brand education. The app spends a whole tree teaching Nostr, a censorship resistant way to publish that the learner now owns keys for, and then the only built in share target is X, a centralised platform many in this audience actively avoid. Offering "Share to Nostr" would be more on brand, more private, and a genuine teaching moment: use the thing you just learned. X can stay as a secondary option.

Principle 7, visible state. The desktop share path is clunky. The copy explains that it "saves the PNG and opens X, drag the image into the tweet to post." That is a manual two step drag that many people will not complete, and it is easy to think the share failed. The error and success messages elsewhere in this modal are excellent ("PNG saved to your downloads and X opened"), so the bar is already high. A clearer desktop flow, or at least a numbered two step instruction, would reduce drop off.

**Badge artwork (TierBadgeCard)**

Principle 2, trust. The badges are genuinely beautiful and the one line descriptions per tree are strong. They give the learner a real artefact to feel proud of.

Privacy, carried to the lens below. The badge prints the learner's name and the Badge ID directly onto the shareable image, so both travel with every download and every post. This is fine for a name the learner chose to be public, and risky for one they did not realise would end up on the open internet.

Principle 4, jargon. Two descriptions lean technical for a completion keepsake that may be shared with non technical friends: "Blocks, fees, miners, UTXOs" and "Keys, seeds, addresses, multisig". They are accurate, and by this point earned, so this is low priority, but UTXO and multisig are the two words most likely to puzzle someone who receives the badge.

### Priority actions

1. Add one calm confirmation before "Share on X" that names what is about to happen: a public post from the learner's account that anyone can see. This matches the care the app now takes before publishing a Nostr note, and it protects exactly the high risk users this product exists for.
2. Rethink what gets published. Remove the Badge ID from the public tweet and consider removing it from the shared image, or replace it with a value that is not derived from the participant's internal id, so sharing a badge cannot correlate a person across badges or leak part of their id.
3. Add "Share to Nostr" as a first class option, ideally the default. It is more private, it is more on brand, and it turns the share moment into a final lesson in using the identity the learner just created. Keep X as a secondary choice.

### Privacy first lens

The badge flow is where BitPilot quietly asks the learner to step from a private practice space onto the public internet, and right now it does so without flagging the change.

The name on the badge comes from whatever the learner typed at setup, which for many people is their real first name. That name is printed onto the badge image and included in the tweet. A learner who used their real name during a workshop may not expect it to end up in a public post. A short note at the share step, and an easy way to use a different display name on the badge, would give them control.

The Badge ID exposes the first eight characters of the participant's internal id. Because it is stable across all of that learner's badges, an observer who sees two of their shared badges can link them to one person, and the fragment is a partial handle to the internal id itself. This is a concrete correlation risk, not a theoretical one, and it is the kind of thing a journalist or activist would reasonably worry about.

The default and only share target is X. For an audience that includes people in high risk environments, defaulting to a centralised, surveillance heavy platform is the opposite of what the rest of the app teaches. Nostr, which the learner now has keys for, is the more coherent and safer default.

None of this requires scaring the learner. The fix is a calm sentence at the share step, a private by default choice of what to publish, and an on brand alternative to X.

### Non-native English speaker lens

The badge flow is mostly plain and warm, which is right. A few idioms and platform specific phrases could confuse a second language reader.

"hit Continue" and "hit Continue to return to your next mission." Original, in the dismiss hint. Hit here means press, which is idiomatic. Suggested replacement: "press Continue".

"drag the image into the tweet to post." Original, desktop share help. This assumes familiarity with the X posting flow and uses "drag into the tweet", which is hard to picture for someone who does not use X in English. Suggested replacement: a short numbered instruction, for example: 1, we saved the badge image to your downloads. 2, we opened X. 3, add the saved image to your post.

"it's yours." Original, celebration subline. Warm and fine, but "it is yours" reads a touch clearer for a second language reader.

"Grasped what bitcoin is." Original, Money tree badge description. Grasped is a less common word. Suggested replacement: "Learned what bitcoin is".

"Badge ID". Even setting privacy aside, ID plus an unexplained code is confusing. If it stays, a plain label such as "Badge number" with one line of explanation would help.

General note: the buttons and status messages are short and clear, which is exactly the standard to hold. The only rough spots are the two places that describe the X specific workflow.

### What is working well

The emotional design is excellent. The celebration is earned, bold, and genuinely fun, and the badges themselves are beautiful artefacts a learner will want to keep. The dismissal handling is a small masterclass: Escape, backdrop, auto focused Continue, reduced motion support, and correct focus trapping through a nested modal. The status and error copy in the share modal is clear and human. And the instinct to let people take something with them at the end of a tree is exactly right for motivation and word of mouth.

The recommendations here are about carrying the same care the app shows everywhere else across the one threshold where the learner steps into public. Name what is about to happen, let them choose what to reveal, and offer the private, on brand way to share that the app just spent a whole tree teaching them.
