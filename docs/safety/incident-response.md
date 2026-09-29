# Incident Response

> Related: [Moderation system](moderation-system.md), [Admin actions](admin-actions.md), [Abuse prevention](abuse-prevention.md), [Security architecture](../architecture/security-architecture.md)

## 1. Purpose and scope

What moderators and super admins do when something goes wrong: a member in danger, an under-18 account, a scam wave, a compromised account, or misuse of admin access. It covers **member safety incidents** and **platform security incidents**.

Ground rules for every incident:

- **Safety first, then evidence, then sanctions.** Separate people (block, hide, suspend) before investigating in depth.
- **Use the admin tools, not the database.** Every action goes through the audited API. No ad-hoc scripts against production data (`CLAUDE.md`, development rule 9).
- **Never reveal a reporter**, and never promise a member that someone is "safe" or "verified safe".
- **Write it down.** Every action needs a reason; the audit log is the incident timeline.

## 2. Severity levels

| Level | Examples | First response | Who |
|---|---|---|---|
| **SEV1 – immediate danger** | Threat of violence, stalking, someone in danger at an event, sexual exploitation, under-18 member in contact with adults | Within **1 hour**, around the clock during Navratri | On-call moderator + super admin |
| **SEV2 – serious harm** | Scam or money requests hitting several members, persistent harassment, impersonation of an organizer, compromised account | Within **4 hours** | Moderator |
| **SEV3 – guideline breach** | Spam, fake profile, inappropriate messages, one-off rudeness | Within **24 hours** | Moderator |

P0 reports (`threatening_behavior`, `underage`) are SEV1 by default. They come first in the queue and already hide the member from discovery.

## 3. Investigating

| Tool | Use |
|---|---|
| Reports queue (`/reports`) | Filter by priority, reason and **source** (automated flags) |
| Report detail | Evidence snapshot, other reports, sanction history, flag signals. **Assign to me** before acting |
| Open conversation (logged) | Only for open chat reports, 25 messages each side, audited under your name. Use only when the snapshot isn't enough |
| Member page (`/users/:id`) | Status, restrictions, matches, sanction history, moderation panel |
| Safety logs (`/safety-logs`) | Filter by member ID or event type: auth abuse, blocks, reports, flags, expiries |
| Audit log (`/audit-logs`, super admins) | Who did what, when; filter by target ID for a member's full moderation timeline |

## 4. Playbooks

### 4.1 Threat of violence / someone in danger (SEV1)

1. If there is a risk to life, the reporter is told in the app to call **112**. Our team does not replace emergency services.
2. Assign the report. Read the snapshot; open the conversation if needed.
3. **Suspend** the reported member ("until lifted") to cut all contact immediately. Sessions end and sockets disconnect at once.
4. Check other reports and safety logs for other victims. Close the member's other matches if needed.
5. If the threat is credible, **ban** and preserve evidence (the report snapshot and audit entries are retained; don't resolve related reports as `dismiss`).
6. Law-enforcement requests: see [§5](#5-law-enforcement-and-legal-requests).

### 4.2 Under-18 member (SEV1)

1. Assign the report and review the profile snapshot and photos.
2. If likely under 18: **suspend** straight away, then **ban** with reason code `underage` once confirmed. The ban closes every match.
3. Check the member's matches and conversations (via reports) for adults who pursued them; act on those accounts too.
4. Never ask the member for ID documents in chat or store copies.

### 4.3 Scam or money-request wave (SEV2)

1. Filter the queue by **Automated flags** and reason *Asking for money*.
2. For each flagged member: review the evidence (their own messages); **restrict chat** or suspend while reviewing; **ban** confirmed scammers.
3. If many accounts use the same script, search reports for the text in snapshots and look for sign-up bursts in the safety logs (`auth.*`).
4. Consider tightening `LIMITS.SUSPICIOUS_MONEY_MESSAGES` (a code change with a deploy).

### 4.4 Harassment (SEV2/3)

1. Blocking already separated the members. Look at other reports and the `frequently_blocked` flag.
2. First offence: **warn** (the member must acknowledge) or **restrict chat** for 3–7 days.
3. Repeat or severe: suspend, then ban.

### 4.5 Compromised member account (SEV2)

Signals: `auth.refresh_token_reuse` in the safety logs, a member saying "that wasn't me", sudden money requests from a long-standing account.

1. Suspend (revokes every session and disconnects sockets).
2. Once the owner confirms control of their phone number, **reactivate**. They sign in again with a new OTP.

### 4.6 Admin misuse or compromised admin account (SEV1)

1. A super admin reviews the **audit log** filtered by `adminId` (conversation views, sanctions, lifts).
2. Disable the admin account; revoke admin sessions. Admin lockout events appear as `admin.account_locked`.
3. Reverse wrongful sanctions with the lift actions (each audited with a reason).

### 4.7 Data exposure or security vulnerability (SEV1)

Follow [security architecture](../architecture/security-architecture.md): contain (rotate secrets, disable the affected feature), assess what data was exposed, and meet the legal notification duties (CERT-In reports within 6 hours for notifiable incidents; DPDP Act breach notifications).

## 5. Law-enforcement and legal requests

- Verify the request (official channel, case reference). Log the reference as the reason on any action you take.
- Preserve evidence: don't dismiss or delete related reports; sanctions and audit logs are never deleted.
- Revealing a member's phone number is a planned super-admin-only, audited action and is **not available yet**; until then, requests go to the engineering lead, who handles them outside the app.
- Disclose only what is legally required.

## 6. Communication

- **Reporter:** a generic acknowledgement ("Thank you. Our team will review your report."). Never the outcome in detail and never the other person's sanction.
- **Sanctioned member:** the in-app notice with the guideline ([admin actions §6](admin-actions.md#6-what-the-member-sees)). Never who reported them.
- **Public statements:** only by the project owner. Never describe verification as a guarantee of safety.

Helplines to share with members: **112** (emergency), **181** (Women Helpline), **1930** / cybercrime.gov.in (cyber fraud).

## 7. After an incident

1. Resolve every related report with a clear note.
2. For SEV1/SEV2, write a short review: timeline (from the audit and safety logs), what worked, what to change.
3. Turn lessons into changes: detection thresholds, guideline wording, new flags or playbooks. Update this document.
