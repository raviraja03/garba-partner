# User Personas — Garba Partner

> Related: [Product overview](product-overview.md), [User flows](user-flows.md)

Personas are fictional composites. They keep design decisions tied to real needs. Each persona lists the **product implications** that the MVP must satisfy.

---

## Member personas

### P1 — Priya, "new in town" (primary)

- 26, software engineer, moved from Vadodara to Pune eight months ago.
- Loves Garba and has danced since school, but her Pune friends aren't Gujarati and aren't interested.
- Would rather go with one or two people at her level than go alone.
- Cautious about meeting strangers from the internet. She has had bad experiences with unsolicited messages on other apps.

**Goals:** find events in Pune and find a partner or two who are also going.
**Frustrations:** being messaged by people she never agreed to talk to, and people asking for her number on the first message.
**Product implications:**
- Event-first discovery, filterable by city.
- Nobody can message her unless she accepts their interest.
- Her phone number is never shown, and the app nudges her when someone shares contact details in chat.
- She can see whether someone is photo verified, and she understands what that means.
- One-tap block and report from chat.

### P2 — Rohan, "the skilled dancer"

- 29, marketing executive in Ahmedabad and an experienced dancer. Enters competitions at some events.
- His regular partner moved abroad. He wants someone at an advanced level who knows the steps (e.g. two-taali, three-taali, dodhiyu, popatiyu).

**Goals:** filter partners by experience and style for a specific event.
**Frustrations:** generic apps have no idea what "advanced Garba" means.
**Product implications:**
- Profile fields for dance experience (beginner, intermediate, advanced) and styles (Garba, Dandiya Raas).
- Discovery filters for experience and style.
- Event-specific "looking for a partner" opt-in.

### P3 — Kavya, "safety first"

- 22, final-year college student in Surat. Excited for her first Navratri as an adult living in a hostel.
- Her parents worry. She wants to go with people but will only meet them at the venue.

**Goals:** meet a partner in a crowded, public place and keep full control.
**Frustrations:** fake profiles, being followed, and people finding out where she lives.
**Product implications:**
- No exact location anywhere. She picks her city and, optionally, an area.
- Her event attendance is visible **only** to other members who are also looking for a partner at the same event, and only if she opts in.
- Safety centre with meeting tips and helplines.
- Blocking someone makes her invisible to them everywhere, immediately.
- Unmatch removes the conversation for both people.

### P4 — Arjun, "the occasional user"

- 34, lives in Mumbai. Goes to one or two big events a season.
- Interested in finding good events more than in finding a partner.

**Goals:** see what's on this weekend, and later buy a pass easily.
**Product implications:**
- Useful event listings even for members who never use discovery.
- `discovery_enabled` can be turned off. The member can browse events without being discoverable.
- Pass purchasing (post-MVP) builds on the event listing.

---

## Admin personas

### A1 — Meera, moderator

- Part-time trust & safety moderator during Navratri. Works through queues on a laptop.

**Goals:** handle the most urgent reports first, make consistent decisions and act quickly.
**Product implications:**
- Report queue sorted by priority (P0 underage/safety → P1 harassment → P2 other), then by age.
- The report view shows the reported message in context (snapshot), the history of past reports against the user and previous sanctions.
- One-click actions: dismiss, warn, remove photo, suspend (preset durations), ban, each with a required note.
- Verification queue shows the selfie, the requested gesture and the profile photos side by side.
- She never sees phone numbers.

### A2 — Sanjay, event manager

- Operations staff who collects event information from organisers and posters.

**Goals:** add accurate events quickly and fix them when details change.
**Product implications:**
- Event form with draft → published → cancelled lifecycle, cover image upload and preview.
- Cancelling an event notifies members who marked attendance.

### A3 — Super admin

- Founder/tech lead. Manages admin accounts and handles legal requests.

**Product implications:**
- Admin account management with roles and mandatory TOTP.
- Audit log of every admin action.
- Revealing a phone number requires a written reason and is audit-logged.

---

## Anti-personas (threat actors we design against)

Anti-personas drive the safety requirements. Each maps to a specific control in [security architecture](../architecture/security-architecture.md).

| Anti-persona | Behaviour | Primary controls |
|---|---|---|
| **The mass messager** | Sends interests to everyone and spams contact details once matched | Daily interest limit, message rate limit, contact-sharing nudge, reports, auto-hide threshold |
| **The scammer** | Fake profile, builds rapport, asks for money or moves the conversation to another platform | Photo verification, "never send money" safety copy, report reason `scam_spam`, ban + phone-hash ban list |
| **The stalker** | Tries to find where a specific person lives or will be | No exact location, reciprocal and opt-in event visibility, no "last seen" timestamps, EXIF stripping on photos, symmetric blocking |
| **The harasser** | Sends abusive messages, then makes new accounts after being blocked | Block and report, message snapshots for evidence, ban on phone hash, OTP rate limits |
| **The minor** | Under 18, lies about age | DOB gate, a locked DOB after underage rejection, P0 "underage" reports with immediate auto-hide, future ID-based age check |
| **The scraper** | Automates profile harvesting | Auth required for every profile, cursor-paginated and rate-limited discovery, no public profile URLs, no sequential IDs |
| **The malicious insider** | Admin misuses access | Least-privilege roles, phone numbers hidden by default, audited phone reveal, audit log, TOTP |
