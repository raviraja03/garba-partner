# Community Guidelines

> Related: [Moderation system](moderation-system.md), [Admin actions](admin-actions.md)

## 1. Purpose

The rules every member agrees to follow. The text lives in **one place**, `COMMUNITY_GUIDELINES` in `packages/shared/src/constants/guidelines.ts`, which drives:

- the public **Community guidelines** page (`/guidelines`, linked from the footer, the report form and safety notices);
- the guideline cited in a **warning** (each report reason maps to one guideline, `guidelineForReason`);
- the reason codes moderators pick when sanctioning.

Change the text there (and bump `GUIDELINES_VERSION`), not in the page.

## 2. The guidelines

| # | Guideline | Report reasons covered |
|---|---|---|
| 1 | **Adults only (18+).** Only people aged 18 or over may use Garba Partner | `underage` |
| 2 | **Be respectful.** "No" means no, and silence means no. No insults, bullying, hateful comments, pressure or repeated unwanted messages | `harassment` |
| 3 | **No threats or violence.** Never threaten, intimidate or endanger anyone, online or at an event | `threatening_behavior` |
| 4 | **Keep it appropriate.** No sexual messages or photos, unwanted advances or graphic content | `inappropriate_behavior` |
| 5 | **Be yourself.** Your own name, age and recent photos. Never pretend to be someone else | `fake_profile`, `impersonation` |
| 6 | **Never ask for money.** No requests for money, gifts, payments, bank details or OTPs; buy passes only through the official event link | `asking_for_money` |
| 7 | **No spam or promotion.** No copy-pasted messages or advertising | `spam` |
| 8 | **Meet safely.** Meet at the event or a busy public place, tell a friend, arrange your own travel | (advice) |

`other` maps to no specific guideline; the warning then says the behaviour went against the guidelines in general.

## 3. Enforcement

Moderators choose a proportionate action ([admin actions](admin-actions.md)): dismiss, warn, restrict chat, suspend (timed or until lifted) or ban. A report alone never bans anyone automatically. Members are never told who reported them.

The page also states that verification badges confirm specific checks only and are not a guarantee of identity or safety.

## 4. Known limitations

- Members are not yet asked to accept a specific guidelines version at sign-up (the terms acceptance covers them). A versioned acceptance step can reuse `GUIDELINES_VERSION`.
- English only.
