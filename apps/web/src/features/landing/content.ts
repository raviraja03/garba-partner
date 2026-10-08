import type { IconName } from '../../components/ui/Icon';

/*
 * All the wording of the visitor home page (pages/LandingPage.tsx), kept apart from the layout
 * so it can be edited without touching markup.
 *
 * Honesty rules for this file: no user counts, city counts, testimonials, ratings, dates,
 * funding or founders. Only describe what the product does today; anything not built yet is
 * marked `comingSoon`. Never promise safety ("100% safe", "everyone is verified").
 */

export const HERO = {
  eyebrow: 'The social platform for Garba lovers',
  body: 'GarbaMates is a social platform built for Garba lovers to find partners, make friends, join groups, and discover Garba events.',
  note: 'For adults (18+) only.',
} as const;

export const ABOUT = {
  heading: 'More Than Just Garba.',
  paragraphs: [
    'Garba is more than a dance.',
    'It’s the music, the energy, the colors, the celebrations — and most importantly, the people you share it with.',
    'GarbaMates brings Garba lovers together in one social platform where they can find Garba partners, make new friends, join groups, and discover Garba events.',
  ],
  statement: 'One community. Endless Garba connections.',
  /** The four things in one glance, beside the text. */
  tiles: ['Partners', 'Friends', 'Groups', 'Events'],
} as const;

export type Tint = 'purple' | 'pink' | 'orange' | 'yellow';

export interface Feature {
  title: string;
  text: string;
  icon: IconName;
  tint: Tint;
  /** Not in the product yet: shown with a "Coming soon" badge. */
  comingSoon?: boolean;
  link?: { to: string; label: string };
}

export const FEATURES_HEADING = 'Everything You Love About Garba. In One Place.';

export const FEATURES: Feature[] = [
  {
    title: 'Find Garba Partners',
    text: 'Find someone who matches your Garba vibe.',
    icon: 'heart',
    tint: 'pink',
  },
  {
    title: 'Make Garba Friends',
    text: 'Meet new people who share your passion for Garba and Dandiya.',
    icon: 'chat',
    tint: 'purple',
  },
  {
    title: 'Join Garba Groups',
    text: 'Find your community and celebrate together.',
    icon: 'users',
    tint: 'orange',
    comingSoon: true,
  },
  {
    title: 'Discover Garba Events',
    text: 'Explore Garba and Dandiya events happening around you.',
    icon: 'calendar',
    tint: 'yellow',
    link: { to: '/events', label: 'Explore events' },
  },
];

export const PERSONAS = {
  heading: 'Made for Every Garba Lover',
  body: 'Whether you’re coming with friends or coming alone, there’s a place for you at GarbaMates.',
  cards: [
    { emoji: '🕺', title: 'The Solo Dancer', text: 'Looking for someone to dance with?' },
    { emoji: '💃', title: 'The Newcomer', text: 'New city? Find your Garba circle.' },
    { emoji: '👯', title: 'The Friend Group', text: 'Meet more people who match your vibe.' },
    { emoji: '🎉', title: 'The Event Explorer', text: 'Discover what’s happening around you.' },
  ],
} as const;

export const STORY = {
  heading: 'Why We Built GarbaMates',
  intro: [
    'Garba is more than a dance.',
    'It’s the music, the energy, the colors, the late-night celebrations — and most importantly, the people you share it with.',
    'But finding the right people to dance with isn’t always easy.',
  ],
  maybes: [
    'Maybe your friends aren’t available.',
    'Maybe you’re new to the city.',
    'Maybe you’re looking for a Garba partner.',
    'Maybe you simply want to meet people who share the same passion.',
  ],
  turn: 'That’s why we created GarbaMates.',
  outro: [
    'A place where Garba lovers can connect, make new friends, find their Garba partners, join communities, and discover events around them.',
    'Because the best Garba memories aren’t just about the dance.',
  ],
  closing: 'They’re about the people you meet along the way.',
} as const;

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
