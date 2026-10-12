import type { IconName } from '../../components/ui/Icon';

/*
 * All the wording of the visitor home page (pages/LandingPage.tsx), kept apart from the layout
 * so it can be edited without touching markup.
 *
 * Honesty rules for this file: no user counts, city counts, testimonials, ratings, dates,
 * funding or founders. Only describe what the product does today, and say so plainly when
 * something is not built yet. Never promise safety ("100% safe", "everyone is verified").
 */

export const HERO = {
  eyebrow: 'The social platform for Garba lovers',
  body: 'GarbaMates is a social platform built for Garba lovers to find partners, make friends, join groups, and discover Garba events.',
  note: 'For adults (18+) only.',
} as const;

export interface LandingPhoto {
  /** Path under `apps/web/public`, e.g. `/images/garba-night.webp`. */
  src: string;
  /** What the photo shows, for people who cannot see it. */
  alt: string;
  /** The file's real pixel size: reserves the space so nothing jumps while it loads. */
  width: number;
  height: number;
}

/**
 * "Find your Garba partner": a photo beside a short pitch and one button.
 *
 * `photo` is `null` until a real Garba photo is added, and the page shows a branded panel in
 * its place. To use a photo: put a file you have the right to publish in
 * `apps/web/public/images/` (WebP or JPEG, about 1200px wide, under ~200 KB) and fill this in:
 *
 *   photo: { src: '/images/garba-night.webp', alt: 'Dancers in a Garba circle at night', width: 1200, height: 900 },
 */
export const PARTNER: {
  eyebrow: string;
  heading: string;
  body: string;
  points: string[];
  button: string;
  photo: LandingPhoto | null;
} = {
  eyebrow: 'Find your partner',
  heading: 'Nine Nights Are Better With the Right Partner.',
  body: 'Tell us your city, your Garba level and the nights you’re free. We’ll show you people who are looking for a partner too.',
  points: [
    'People in your city who love Garba as much as you do',
    'Matched on Garba level and the nights you’re both free',
    'A chat opens only when both of you say yes',
  ],
  button: 'Find Your Partner',
  photo: null,
};

/** Three real ways to meet people in the app today (Discover, an event's partner list, Interests). */
export const FIND = {
  heading: 'How to Find Your Garba Mates',
  body: 'Three ways to meet people who match your vibe.',
  ways: [
    {
      icon: 'compass',
      tint: 'purple',
      title: 'Discover people near you',
      text: 'Browse members in your city and filter by age, Garba level and the dates you’re free.',
    },
    {
      icon: 'calendar',
      tint: 'yellow',
      title: 'Start from an event',
      text: 'Going to a Garba night? Open the event and see who else is looking for a partner there.',
    },
    {
      icon: 'heart',
      tint: 'pink',
      title: 'See who’s interested in you',
      text: 'When someone sends you an interest, you decide: accept it to match, or decline.',
    },
  ],
} as const satisfies {
  heading: string;
  body: string;
  ways: readonly { icon: IconName; tint: Tint; title: string; text: string }[];
};

/** The member's path, in order. Each step is something the app does today. */
export const HOW_IT_WORKS = {
  heading: 'How GarbaMates Works',
  body: 'From signing up to your first Garba night together, in four steps.',
  steps: [
    {
      title: 'Join with your mobile number',
      text: 'Sign up with a one-time code. No password to remember, and your number is never shown to other members.',
    },
    {
      title: 'Create your profile',
      text: 'Add a photo, your city, your Garba level and the nights you’re free, and say who you’d like to dance with.',
    },
    {
      title: 'Send an interest',
      text: 'Found someone? Send an interest. If they accept, it’s a match.',
    },
    {
      title: 'Chat and plan your night',
      text: 'Matches can chat in the app. Pick an event, agree where to meet, and dance.',
    },
  ],
} as const;

export type Tint = 'purple' | 'pink' | 'orange' | 'yellow';

export const COMMUNITY = {
  heading: 'It’s Not Just About Finding a Dance Partner.',
  lead: 'It’s about finding people who share your energy.',
  lines: [
    'People who love the same music.',
    'People who stay for one more Garba round.',
    'People who turn one night into lasting friendships.',
  ],
} as const;

/**
 * Each card describes something that exists in the app today: phone numbers and areas are
 * private, members can block and report, there are published guidelines and a safety centre,
 * the app is 18+, and a chat opens only after both people accept.
 */
export const TRUST = {
  heading: 'Connect With Confidence',
  body: 'We’re building GarbaMates with a focus on creating a respectful, welcoming, and positive community.',
  cards: [
    {
      emoji: '🔒',
      title: 'Privacy-focused',
      text: 'Your phone number is never shown to other members, and your area stays hidden unless you choose to show it.',
    },
    {
      emoji: '🛡️',
      title: 'Community safety',
      text: 'Built with community safety in mind: clear guidelines and a safety centre with tips for meeting in person.',
    },
    {
      emoji: '🚫',
      title: 'Report & Block',
      text: 'Block anyone, or report a profile or a message. Reports are reviewed by our moderators.',
    },
    {
      emoji: '🤝',
      title: 'Respectful community',
      text: 'For adults (18+) only. A chat opens only when both people say yes.',
    },
    {
      emoji: '❤️',
      title: 'Inclusive environment',
      text: 'Everyone who loves Garba is welcome, whatever your level or who you dance with.',
    },
  ],
  /** Required wording: a badge is never a promise of safety. */
  disclaimer:
    'No platform can guarantee safety. Verification badges show what was checked, not that someone is safe, so always meet in a busy, public place.',
} as const;

export const VISION = {
  heading: 'Our Vision',
  body: 'To build India’s most vibrant community for Garba lovers — where every dance begins with a connection.',
  line: 'From one Garba night to a community that celebrates together.',
} as const;

export const JOURNEY = {
  heading: 'From an Idea to a Community',
  stages: [
    {
      emoji: '💡',
      title: 'The Idea',
      text: 'We wanted to make it easier for Garba lovers to find their people.',
    },
    {
      emoji: '🛠️',
      title: 'Building GarbaMates',
      text: 'We’re building a platform focused on meaningful Garba connections.',
    },
    {
      emoji: '🚀',
      title: 'Launching Soon',
      text: 'We’re getting ready to bring Garba lovers together.',
    },
    {
      emoji: '💜',
      title: 'The Future',
      text: 'A growing community where everyone can find their people.',
    },
  ],
} as const;

export const FINAL_CTA = {
  heading: 'Your Garba People Are Out There.',
  body: 'Don’t just find a Garba event.',
  highlight: 'Find the people who make it unforgettable.',
} as const;
