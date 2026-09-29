import type { ReportReason } from './enums.js';

/**
 * Community guidelines (docs/safety/community-guidelines.md). Shown on the web app's
 * Community guidelines page and cited by warnings: each report reason maps to the guideline it
 * breaks, so a member who is warned sees which rule it was about (never who reported them).
 */
export interface CommunityGuideline {
  id: string;
  title: string;
  summary: string;
  /** Concrete examples of what is not allowed. */
  examples: readonly string[];
  /** Report reasons / sanction reason codes covered by this guideline. */
  reasons: readonly ReportReason[];
}

/** Bump when the text changes materially (shown on the page). */
export const GUIDELINES_VERSION = '2026-09-30';

export const COMMUNITY_GUIDELINES: readonly CommunityGuideline[] = [
  {
    id: 'adults_only',
    title: 'Adults only (18+)',
    summary: 'Garba Partner is only for people aged 18 or over.',
    examples: ['Creating an account if you are under 18', 'Using a photo of someone under 18'],
    reasons: ['underage'],
  },
  {
    id: 'be_respectful',
    title: 'Be respectful',
    summary: 'Treat every member with respect. "No" means no, and silence means no.',
    examples: [
      'Insults, bullying or hateful comments',
      'Repeated messages after someone has stopped replying',
      'Pressuring someone to meet, share contact details or photos',
    ],
    reasons: ['harassment'],
  },
  {
    id: 'no_threats',
    title: 'No threats or violence',
    summary: 'Never threaten, intimidate or endanger anyone, online or at an event.',
    examples: ['Threats of harm', 'Following someone or turning up uninvited', 'Blackmail'],
    reasons: ['threatening_behavior'],
  },
  {
    id: 'keep_it_appropriate',
    title: 'Keep it appropriate',
    summary: 'This is a dance-partner platform. Keep photos, profiles and messages appropriate.',
    examples: ['Sexual messages or photos', 'Unwanted advances', 'Offensive or graphic content'],
    reasons: ['inappropriate_behavior'],
  },
  {
    id: 'be_yourself',
    title: 'Be yourself',
    summary: 'Use your own name, age and recent photos. Never pretend to be someone else.',
    examples: [
      'Fake or misleading profiles',
      "Using someone else's photos",
      'Pretending to be an organizer, celebrity or Garba Partner staff',
    ],
    reasons: ['fake_profile', 'impersonation'],
  },
  {
    id: 'never_ask_for_money',
    title: 'Never ask for money',
    summary:
      'Do not ask members for money, gifts, payments, bank details or OTPs, for any reason. Pay for passes only through the official event link.',
    examples: [
      'Requests for money, UPI transfers or gift cards',
      'Selling passes or "investment" offers in chat',
      'Asking for OTPs, card or bank details',
    ],
    reasons: ['asking_for_money'],
  },
  {
    id: 'no_spam',
    title: 'No spam or promotion',
    summary: 'Do not send the same message to many members or promote products and services.',
    examples: ['Copy-pasted messages', 'Advertising or links to other services'],
    reasons: ['spam'],
  },
  {
    id: 'meet_safely',
    title: 'Meet safely',
    summary:
      'Meet at the event or in a busy public place, tell a friend where you are going and arrange your own travel.',
    examples: ['Insisting on meeting somewhere private', 'Offering to pick someone up from home'],
    reasons: [],
  },
];

/** The guideline a report reason / sanction reason code refers to (null for `other`). */
export function guidelineForReason(reason: ReportReason): CommunityGuideline | null {
  return COMMUNITY_GUIDELINES.find((guideline) => guideline.reasons.includes(reason)) ?? null;
}
