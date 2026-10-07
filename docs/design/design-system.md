# GarbaMates Design System

> Related: [Project structure](../setup/project-structure.md), [Coding standards](../development/coding-standards.md), [Nginx (CSP)](../deployment/nginx.md)

## 1. Purpose

One source for how GarbaMates looks and behaves: brand colours, type, spacing, and the reusable components every page is built from. If a page needs a colour, a size or a control, it comes from here. Nothing is hardcoded in a page.

**Status:** the tokens and components exist and the site header, footer, sign-in layout and logo use them. The individual pages still carry their earlier layouts and are restyled phase by phase; they already show the new colours and font because the tokens changed underneath them.

**Brand line:** *Find Your People. Find Your Vibe.* (`APP_TAGLINE`). Use it sparingly: the footer and the sign-in screens.

## 2. Where things live

| What | Where |
|---|---|
| Tokens (colours, type, radius, shadows, motion) | [`packages/config/tailwind/theme.css`](../../packages/config/tailwind/theme.css), shared by the web app and the admin panel |
| Product name and tagline | `APP_NAME`, `APP_TAGLINE` in `packages/shared/src/constants/app.ts` |
| Logo, app icon, favicons | `apps/{web,admin}/public/brand/` |
| Font file and its licence | `apps/{web,admin}/public/fonts/` |
| Components (web) | `apps/web/src/components/ui/` and `apps/web/src/components/` |
| Admin panel | Uses the same tokens. Its own small primitives (`apps/admin/src/components/ui/`) are not replaced yet |

Styling is Tailwind CSS v4 only. No second styling system, no component library, no icon library.

## 3. Colours

The five brand colours are fixed. Do not change them or add other bright colours.

| Token | Value | Tailwind | Use |
|---|---|---|---|
| Deep Purple | `#2D1B69` | `primary`, `brand-600` | Text accents, links, navigation, primary buttons, focus |
| Garba Pink | `#E91E63` | `secondary`, `accent-500` | The one headline action of a page; social signals |
| Vibrant Orange | `#FF8A00` | `accent-orange` | Festive fills and highlights |
| Marigold Yellow | `#FFC107` | `accent-yellow` | Festive fills, warnings |
| Soft Cream | `#FFF7ED` | `background`, `surface` | Page background |

Derived shades (tints and shades of the brand colours, plus neutrals):

| Token | Use |
|---|---|
| `brand-50 … brand-900` | Purple scale. `50`/`100` chip and hover backgrounds, `200`/`300` outlines, `500` focus ring, `700`+ hover and dark text |
| `accent-50`, `100`, `200`, `600`, `700` | Pink scale. `600` hover and small counters, `700` small pink text |
| `accent-orange-soft`, `accent-yellow-soft` | Badge and alert backgrounds |
| `card` (`#FFFFFF`), `ink`, `muted`, `line` | Card surface, body text, secondary text, hairlines |
| `success`, `success-soft`, `danger`, `danger-soft` | Status |

### Contrast rules (WCAG AA)

| Combination | Ratio | Rule |
|---|---|---|
| Purple on cream / white on purple | 13.4 / 14.3 | Any text |
| `muted` on cream | 6.0 | Secondary text |
| White on pink | 4.35 | **Large bold text only**: that is why the `cta` button exists only in the large size |
| `accent-700` on white | 6.9 | Small pink text |
| White on orange / yellow | 2.4 / 1.6 | **Never.** Orange and yellow carry purple text (6.0 / 8.8) |
| White on `accent-600` | 5.3 | Count bubbles |

## 4. Typography

One family: **Plus Jakarta Sans** (variable, weights 200–800, SIL Open Font License), self-hosted because the production content security policy allows fonts from our own domain only. System fonts are the fallback.

| Class | Size | Use |
|---|---|---|
| `text-display` | 36 → 56px, fluid | Landing and hero headings |
| `text-h1` | 28 → 36px, fluid | Page title (one per page) |
| `text-h2` | 22 → 26px, fluid | Section title |
| `text-h3` | 18px | Card title |
| `text-body` | 16px | Body text and form controls |
| `text-small` | 14px | Secondary text |
| `text-caption` | 13px | Metadata. **The smallest size for anything meant to be read** |
| `text-label` | 14px semibold | Form labels |
| `text-button` | 16px semibold | Buttons |

The heading sizes scale with the screen on their own; don't add breakpoint classes to them. Each class sets its weight and line height.

## 5. Spacing, shape, elevation, motion

| Token | Value | Use |
|---|---|---|
| `px-gutter` | 16px | Horizontal page padding on mobile (`sm:px-6` above) |
| `space-y-section` | 32px | Gap between page sections |
| `max-w-page` | 1152px | Full page width (header, footer, wide pages) |
| `max-w-prose` | 672px | Forms and reading text |
| `rounded-control` | 14px | Buttons, inputs, alerts |
| `rounded-card` | 20px | Cards, dialogs |
| `rounded-full` | — | Badges, avatars, icon buttons |
| `shadow-card` | soft | Resting cards |
| `shadow-raised` | medium | Hovered cards, menus |
| `shadow-overlay` | strong | Dialogs |
| `animate-fade-in`, `pop-in`, `sheet-up`, `drawer-in` | 160–240ms | Overlays |

Inside components use Tailwind's 4px scale (`gap-2`, `p-4`, `p-5` …).

Motion is short and purposeful. Members who set "reduce motion" on their device get none: a global rule in `theme.css` switches animations and transitions off. A visible focus outline is applied globally to every focusable element.

**Breakpoints** (Tailwind defaults): mobile below `sm` 640px, tablet `sm`–`lg`, desktop from `lg` 1024px. Design the mobile layout first, then add `sm:` and `lg:`.

## 6. Logo

The artwork is final. Use the files as provided: never recolour, redraw, crop or rebuild it in CSS.

| Component | File | Use |
|---|---|---|
| `<Logo />` | `brand/logo.webp` | Full logo. **Light backgrounds only** (the wordmark is purple) |
| `<LogoIcon />` | `brand/icon.webp` | App icon. Any background; use it on purple or dark surfaces |
| — | `brand/favicon-32.png`, `favicon-192.png`, `apple-touch-icon.png` | Browser tab and home-screen icons (linked in `index.html`) |

There is no web app manifest, because the site is not a PWA.

## 7. Components

Import from `apps/web/src/components/ui/`. Check this list before writing new markup.

| Component | File | Notes |
|---|---|---|
| `Button`, `LinkButton` | `Button.tsx`, `button-styles.ts` | Variants below. `LinkButton` is a navigation link that looks like a button: never style a `<Link>` by hand |
| `Input`, `Select`, `Textarea`, `Choice` | `Input.tsx` | Always inside `Field`. `Choice` is a checkbox or radio whose whole row is the touch target |
| `Field` | `Field.tsx` | Label, hint, error, with the ARIA wiring |
| `Card` | `Card.tsx` | `padding`, `interactive` (hover lift), `as` |
| `Badge`, `CountBadge` | `Badge.tsx` | Tones: neutral, brand, pink, orange, yellow, success, danger |
| `Avatar` | `Avatar.tsx` | Photo or initials; sizes sm, md, lg, xl |
| `Modal`, `Drawer` | `Dialog.tsx` | Native `<dialog>`. `Modal` is a centred card on desktop and a bottom sheet on phones. `Drawer` slides from the right or bottom |
| `Dropdown` | `Dropdown.tsx` | Menu button with keyboard support |
| `Alert` | `Alert.tsx` | Tones: error, warning, success, info |
| `Skeleton`, `SkeletonCard`, `SkeletonRow`, `LoadingRegion` | `Skeleton.tsx` | Loading placeholders for lists |
| `Spinner`, `FullPageSpinner` | `Spinner.tsx`, `../FullPageSpinner.tsx` | Inline and whole-page loading |
| `EmptyState` | `EmptyState.tsx` | Empty lists and failed loads, with a next step |
| `Tabs` | `Tabs.tsx` | Tab buttons with arrow-key support and optional counts; pair with a `role="tabpanel"` region |
| `Icon` | `Icon.tsx` | 22 line icons drawn in the current text colour |
| `TEXT_LINK`, `BACK_LINK` | `link-styles.ts` | Class strings for a link inside a sentence (always underlined) and for the "← Back to …" link on detail pages. Use these instead of restyling links per page |
| `Navbar`, `Footer`, `Logo`, `PageContainer`, `PageHeader`, `AuthLayout` | `../Navbar.tsx` and siblings | Global layout (below) |
| `VerificationBadges` | `features/profile/components/VerificationBadges.tsx` | Member badges, with the wording for what each check covers |
| `VerifiedBadge` | `features/events/components/VerifiedBadge.tsx` | Organizer and event badges |
| `useIsDesktop()` | `lib/use-media-query.ts` | For mounting one of two layouts (sidebar or bottom sheet). Prefer CSS breakpoints when both can stay in the page |

### Buttons

| Variant | Look | Use |
|---|---|---|
| `primary` | Purple | The default action of a screen or form |
| `cta` | Pink, large, bold | The **one** headline action of a page ("Find a partner", "Buy pass"). At most one per screen |
| `secondary` | White, purple outline | The alternative next to a primary button |
| `ghost` | No background | Low-emphasis actions in toolbars and cards |
| `danger` | Red | Destructive actions (block, unmatch) |
| `link` | Text link | Inline actions |

Sizes `sm`, `md`, `lg`; every size keeps a 44px touch target. `loading` disables the button and shows a spinner.

The `cta` text must stay bold (weight 700) at its 19px size: white on Garba Pink is 4.35:1, which only meets WCAG AA as large bold text. Each variant sets its own font weight for that reason. Enabled buttons, tabs, menu items, selects and checkbox rows get a pointer cursor from `index.css`; disabled ones show `not-allowed`.

`Button` is full-width by default, because the forms written before the design system expect that. Pass `fullWidth={false}` for an inline button. `LinkButton` is inline by default.

### Navigation (`Navbar`)

A top bar on every screen (sticky, translucent cream): logo, notifications, account.

| Screen | Destinations | Account |
|---|---|---|
| Desktop, from 1024px | Home, Events, Discover, Interests, Matches, Chats in the top bar. The current page has purple text and a pink bar on the header's bottom edge | Menu under the member's avatar: profile, passes, safety centre, log out |
| Tablet and mobile | A **bottom tab bar** within thumb reach: Home, Events, Discover, Chats, More. The current tab has a filled pill behind its icon and bold text | The avatar in the top bar opens the profile. **More** opens a bottom sheet with Interests, Matches, profile, passes, safety centre and log out |
| Visitors (any width) | Events and a Log in button in the top bar. No tab bar: there is nothing else to reach | — |

- Nothing is hidden on small screens without a replacement.
- Every tab and sheet row is at least 44px (tabs are 64px tall, sheet rows 52px).
- Tab labels are 12px: the one place below the 13px minimum, because five labels must fit a 360px screen. They always sit under an icon.
- The sheet is a `Drawer`: focus moves into it, Escape or a tap outside closes it, and it slides up (not for members who ask for reduced motion).
- The unread-chat count shows on the Chats link or tab.
- A "Skip to content" link is the first focusable element on every page.

### Page container (`PageContainer`)

Every page sits in one centred column with the same side padding as the header and footer (16px on phones, 24px from 640px, 32px from 1024px), so content never touches the screen edge.

| Width | Size | Pages |
|---|---|---|
| `wide` | 1152px (`max-w-page`) | Lists and grids: `/events`, `/discover`. Their grids are 1 column on phones, 2 on tablets, 3 on desktop |
| `content` | 768px | Everything else: forms, chats, profiles, reading text |

`AppShell` picks the width from the route (`WIDE_PAGES`). Vertical padding is 24 / 32 / 40px by screen size. Signed-in pages leave room at the bottom for the tab bar.

### Page titles (`PageHeader`)

One `h1` per page, always `text-h1`. `h1`, `h2` and `h3` get their size from their level by default (set in `theme.css`), so the hierarchy is the same on every page. `PageHeader` renders an optional back link, the title, a one-line description and the page's actions; use it for new and redesigned pages.

### Sign-in layout (`AuthLayout`)

Phones and tablets: one column, logo on top. Desktop: a Deep Purple panel with the app icon, the brand line and three short points beside the form.

### Footer

Deep Purple, with the app icon and name (the full logo's purple wordmark can't sit on purple), the brand line, and three link groups: Product, Safety, Rules. Signed-in members also get "Find a partner" and "My passes". Two columns on phones, three on tablets, four on desktop.

**Never add a link to a page that does not exist.** There are no About, Privacy, Terms or Contact pages yet; add them when they are written.

## 8. Loading, empty and error states

| State | Use |
|---|---|
| List or grid loading | `LoadingRegion` with `SkeletonCard` or `SkeletonRow`, as many as usually fit. Not the text "Loading…" |
| Whole page or session loading | `FullPageSpinner` |
| Button action in progress | `loading` on the button |
| Empty list | `EmptyState` with a title in plain words and the next step as a button |
| Failed load | `EmptyState tone="error"` with a retry, or `Alert tone="error"` inline. Never the raw API error text |

## 9. Accessibility checklist for new UI

- Text contrast follows §3. Colour is never the only signal: pair it with text or an icon.
- Every control has a visible label (`Field`), and errors are announced.
- Touch targets are at least 44px.
- Icons next to text are decorative (the default). An icon-only button has an `aria-label`.
- Dialogs use `Modal` or `Drawer` (focus is trapped, Escape closes). Don't use the browser's `confirm()` in new code.
- Images reserve their space (`width` and `height`, or an aspect-ratio class) and use `object-cover`.
- Safety wording never promises safety: a verification badge states what was checked, nothing more.

## 10. Page patterns

Every member and visitor page now uses the components above. Patterns to copy:

| Pattern | Where to look |
|---|---|
| Purple hero with one pink `cta` button | `HomePage`, the visitor view of `EventsPage`, `MatchPage` |
| Filters in a sticky sidebar on desktop and a bottom `Drawer` on phones | `DiscoverPage` |
| Labelled filter row above a card grid | `EventsPage` |
| Content beside a sticky action card (desktop); actions right after the key facts (phones) | `EventDetailPage` |
| Primary action pinned above the tab bar on phones | `PartnerProfilePage` |
| Full-height panel with its own scrolling list | `ChatPage` |
| List of tappable rows (64px or taller) | `MemberRow`, `ChatsPage`, `BookingsPage`, `NotificationsPage` |
| Destructive action confirmed in a `Modal` | `SafetyActions` (block), `MatchPage` (unmatch) |
| Form inside a `Modal` | Reporting a message in `ChatPage` |

`/`, `/events`, `/discover` and `/events/<slug>` use the wide container; every other page uses the content width.

## 11. Mobile rules

There is no separate mobile app or codebase: the same responsive components serve every screen. Layouts are written for a 360px phone first and gain columns upward.

| Rule | How it is done |
| --- | --- |
| Tested widths | 360, 375, 390, 414, 430, 480 (phones), 768, 834, 1024 (tablets), 1280, 1440 (desktop). Dialogs and chat are also checked on a short phone (360×640) and a phone held sideways (740×360). |
| No sideways scrolling | Pages never scroll horizontally. Wide content (admin tables, the admin section strip) scrolls inside its own box. |
| Touch targets | Controls are at least 44px tall below `lg` (inline links inside a sentence are exempt). Small text links get a larger hit area with `min-h-11` or an `::after` inset. |
| No zoom on focus | Inputs, selects and textareas use 16px text, so iOS does not zoom the page when one is focused. |
| Keyboard hints | Give fields `inputMode`, `autoComplete`, `autoCapitalize` and `enterKeyHint` where they help (phone and code: numeric; first name: words; Instagram: no capitals or autocorrect; chat: "send"). |
| Navigation | Bottom tab bar below `lg`; everything else in the "More" bottom sheet. Detail pages have a back link at the top. |
| Dialogs | `Modal` is a bottom sheet on phones and a centred card from `sm`. It is capped at 90% of the screen height; long content scrolls inside while Close and the action buttons stay in view. Filters use a bottom-sheet `Drawer` below `lg`. |
| Full-screen tasks | An open conversation (`/chats/<id>`) hides the tab bar and footer below `lg` and, below `md`, runs edge to edge under the header (`FOCUSED_PAGE` in `AppShell`). Its header has the back button. |
| Notches and home bars | The viewport uses `viewport-fit=cover`; the tab bar, dialog footers and chat composer pad themselves with `env(safe-area-inset-bottom)`. |
| Grids | Event cards: 1 column on phones, 2 from `sm`, 3 from `lg`. Profile cards: 1, 2 from `sm`, 3 from `md` (2 at `lg`, where the filter sidebar appears, 3 again from `xl`). |
| Images | Event images are 16:9 and cropped with `object-cover`. On an event's own page the banner is 21:9 on tablets so the details stay on the first screen. |
| Tap behaviour | `touch-action: manipulation` on controls (no double-tap delay), no grey tap flash, and text size does not change when the phone rotates (`index.css`). |
| Admin console | Below `md` the sidebar is replaced by a strip of sections that scrolls sideways under the header. Data tables keep their columns and scroll sideways inside their card. |

## 12. What is not done yet

- The admin panel has the new colours, font, logo and favicon and works on phones (section strip, scrolling tables), but it is not redesigned: its tables are not turned into cards, and its controls are not all 44px. Its status badges use Tailwind's stock green, red and amber rather than the design tokens.
- The Razorpay checkout window still names the merchant "Garba Partner": that string is set by the API, which this work does not touch.
- The events list API does not send `passPricePaise` (the shared type says it does), so event cards cannot show "Passes from ₹…". The card shows the price as soon as the API sends it; the event page already shows it.
- There are no About, Privacy, Terms or Contact pages. The onboarding consent text still names a Terms of Service and Privacy Policy.
- The "page not found" screen is branded but renders outside the site header and footer.
- No per-page browser titles or social-sharing meta tags, and no route-level code splitting.
- In a phone's sideways (landscape) position the page gutters do not yet allow for a notch at the side (`env(safe-area-inset-left/right)`).
- The chat composer relies on the browser resizing the page when the on-screen keyboard opens (`dvh` units). This could not be checked without a real phone.
- Onboarding keeps the tab bar, because "Log out" lives in the "More" sheet on phones.
- Web JavaScript is one 594 KB file (179 KB gzipped): pages are not loaded on demand, and the chat library loads for visitors too.
- Browser-tested in headless Edge (with touch and mobile emulation below 1024px) at all eleven widths in §11, as a visitor and as a signed-in member: horizontal overflow, one page title per page, touch-target sizes, input text size, text size, image distortion, content hidden behind the tab bar, sheets and dialogs, and the main actions of each journey. A final QA pass also checked, on every page at 390 and 1280px: colours against the token palette, fonts, text contrast (WCAG AA), labels, alt text, heading order, ARIA references, focus indicators while tabbing, hover feedback, and layout shift on load. The admin console was checked at eight widths for sideways scrolling and navigation. **Not tested**: a real Razorpay payment, account warning/suspension notices, a physical phone or tablet, the on-screen keyboard, Safari (iOS), Firefox, or a screen reader.
