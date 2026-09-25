# Product Overview — Garba Partner

> Status: Approved baseline for MVP · Owner: Product · Related: [MVP scope](MVP-scope.md), [User flows](user-flows.md), [Security architecture](../architecture/security-architecture.md)

## 1. Product vision

**Garba Partner helps adults find a Garba partner and dance at events they're already planning to go to. Users choose who they talk to, and nobody's phone number, exact location or event plans are shown to strangers.**

Garba and Dandiya Raas are social dances. Many people skip Navratri events, or stand at the edge of the circle, because their friends aren't going, they moved to a new city, or they want a partner at their own skill level. Garba Partner connects these people through the events themselves:

1. Discover Garba events in your city.
2. Say you are going and, if you like, that you're looking for a partner there.
3. See other people looking for a partner at the same event and send them an interest.
4. If they accept, chat inside the app and plan to meet at the event.
5. Later: buy the event pass in the same place.

### Positioning statement

For adults (18+) who want to attend Garba events with a dance partner, Garba Partner is an event-centric partner-finding app. Generic dating or social apps put the person first. Garba Partner puts the **event** first and is built around **consent and privacy**: a chat opens only after both sides agree, and contact details are never shared by the platform.

### What Garba Partner is not

- **Not a dating app.** Users may connect for any reason. Marketing, copy and UI focus on dancing and events, not romance.
- **Not a background-check service.** Verification confirms specific, limited facts, such as "this person's selfie matches their profile photos". It **never** means a person is safe, trustworthy or who they claim to be in every respect. The product must never say otherwise (see §7).
- **Not an event organiser.** In the MVP, Garba Partner lists events. It does not run them.

## 2. Problem statement

| Problem | Who feels it | How we address it |
|---|---|---|
| "My friends aren't going, and I don't want to go alone." | Newcomers to a city, students, working professionals | Event-based partner discovery |
| "I want a partner at my level." | Experienced dancers | Experience level and dance style filters |
| "I don't know which events are happening or which are good." | Everyone | Curated, admin-published event listings by city |
| "Meeting strangers online feels unsafe." | Especially women | Mutual consent before chat, no phone or location exposure, block/report, photo verification, safety centre |
| "Pass buying is scattered across WhatsApp and random sites." | Everyone | Razorpay pass purchase (post-MVP) |

## 3. Product principles

These principles settle product arguments. When a feature conflicts with one of them, the principle wins unless the change is explicitly approved.

1. **Safety and privacy are features, not settings.** Protective defaults are on. Users opt *in* to exposure, never opt *out*.
2. **Consent before contact.** Nobody can message anyone until both have agreed (interest → accept → match).
3. **Minimum necessary data.** We don't collect data we don't need. We don't keep data longer than we need it. We never show private data (phone number, date of birth, exact location, event plans) to other users.
4. **Honest trust signals.** Badges describe exactly what was checked and nothing more.
5. **Event-first.** Every major feature should make it easier to get to, and enjoy, a real event.
6. **Simple MVP.** Ship the smallest product that is safe and useful. Add complexity only when real usage calls for it.
7. **18+ only.** No exceptions and no "teen mode".

## 4. User roles

| Role | Where | Description |
|---|---|---|
| **Visitor** | Web (public pages only) | Not logged in. Can see the landing page, public event listings (event details only, no attendee data), the safety centre, terms and privacy policy. Cannot see any user profile. |
| **Registered user (unonboarded)** | Web | Phone verified by OTP but profile not complete. Can only finish onboarding, read the safety centre, and log out or delete the account. |
| **Member** | Web | Onboarded adult user. Can browse events, mark attendance, discover partners, send and receive interests, chat with matches, block, report, and request photo verification. |
| **Suspended member** | Web | Temporarily restricted. Can log in, see the reason and end date of the suspension, read the safety centre, and delete the account. Cannot discover, send interests, chat or be discovered. |
| **Banned member** | Web | Permanently restricted. Login shows a ban notice only. |
| **Moderator** (admin) | Admin panel | Reviews reports, verification requests and photos. Applies warnings, suspensions and bans. |
| **Event manager** (admin) | Admin panel | Creates, edits, publishes and cancels events. Manages cities and areas. |
| **Super admin** (admin) | Admin panel | Everything above, plus managing admin accounts, viewing audit logs and revealing a user's phone number in audited, reason-required cases (e.g. a legal request). |

Admin accounts are completely separate from member accounts: different table, different login method, different token audience. See [security architecture](../architecture/security-architecture.md#3-authentication).

## 5. Feature summary

| Area | MVP | Post-MVP |
|---|---|---|
| Authentication | Mobile OTP login, JWT access token + rotating refresh token | Optional passkeys |
| Profile | First name, age (from DOB), gender, city/area, bio, experience, styles, 1–6 photos, partner preferences | Prompts, video intro |
| Verification | **Photo verification**: a selfie with a random gesture, reviewed by a moderator | **ID/age verification** through a licensed provider (e.g. DigiLocker-based). We store only the outcome, never the Aadhaar number or document image |
| Events | Admin-curated listings by city, "Going"/"Interested", opt in to "Looking for a partner" | Organiser self-service, pass sales, check-in |
| Partner discovery | By event (reciprocal) and by city, with filters | Recommendations, groups |
| Interests & matches | Send interest, accept/decline/withdraw, unmatch | Super-interest, intro notes |
| Chat | 1:1 text chat between matches (Socket.IO), read receipts | Images, voice notes, web push |
| Safety | Block, report user, report message, safety centre, contact-sharing nudge, auto-hide on repeated reports | Automated text moderation, trusted contacts |
| Admin | Dashboard, users, sanctions, reports queue, verification queue, photo review, events, cities, audit log | Analytics, organiser portal |
| Payments | — | Razorpay pass purchase, digital passes, refunds |

The full in/out list with acceptance criteria is in [MVP-scope.md](MVP-scope.md).

## 6. Success metrics (MVP)

| Metric | Definition | Initial target (to be validated) |
|---|---|---|
| Activation | % of OTP-verified users who complete onboarding | ≥ 60% |
| Event engagement | % of members who mark attendance on at least one event | ≥ 50% |
| Match rate | % of sent interests that are accepted | Track as a baseline |
| Conversation rate | % of matches with at least one message from each side | ≥ 40% |
| Safety: report handling time | Median time from report to first moderator action | < 12 h (P0 reports < 1 h during event season) |
| Safety: repeat offender rate | % of sanctioned users who are reported again within 30 days | Track as a baseline |
| Verification uptake | % of members with photo verification | Track as a baseline |

Metrics come from aggregate database queries in the admin dashboard. The MVP has **no third-party tracking/analytics SDK that sends personal data**. If product analytics are added later, they must be privacy-reviewed and disclosed in the privacy policy.

## 7. Safety and trust positioning (mandatory copy rules)

These rules apply to all UI copy, marketing, notifications and support replies.

- ✅ Say "**Photo verified** — this member took a live selfie that matched their profile photos."
- ❌ Never say "verified safe", "trusted member", "background checked", "100% genuine" or "safe to meet".
- Every verification badge must link to a short explanation that includes: *"Verification does not guarantee a person's identity, intentions or safety. Always follow our safety tips."*
- The safety centre is linked from the profile view, the chat screen and the match screen.
- Every chat starts with a safety reminder: meet at the event or another public place, tell a friend, and don't send money.

## 8. Legal and compliance considerations (India)

These items are **requirements to be confirmed with legal counsel before launch**. They are not legal advice.

- **Digital Personal Data Protection Act, 2023 (DPDP)**: notice and consent, purpose limitation, data minimisation, a way for users to access, correct and delete their data, breach notification, and reasonable security safeguards.
- **IT Act 2000 and IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021**: a published grievance officer, grievance acknowledgement and resolution timelines, and content takedown procedures.
- **Aadhaar Act and UIDAI regulations**: we must not collect, store or display Aadhaar numbers or Aadhaar images. Any future ID verification goes through a licensed/authorised provider and we keep only the outcome.
- **SMS/OTP**: TRAI DLT registration of sender ID and OTP templates with the chosen SMS provider.
- **Payments (post-MVP)**: Razorpay handles card data. We never touch raw card data (no PCI scope beyond SAQ-A-style checkout).
- **Age**: the service is 18+. We collect a self-declared date of birth, reject anyone under 18, and treat "underage" reports as highest priority.

## 9. Assumptions

- Launch is **web-only** (mobile-first responsive web app). Native apps are out of scope.
- Launch starts with a small set of cities, seeded by admins (e.g. Ahmedabad, Vadodara, Surat, Mumbai, Pune, Bengaluru). Final list to be confirmed.
- Usage is highly **seasonal** and peaks around Navratri. Architecture and moderation staffing must plan for burst load (see [system architecture](../architecture/system-architecture.md#8-scalability-and-future-considerations)).
- The UI is English only for the MVP. Gujarati and Hindi are candidates for post-MVP.
