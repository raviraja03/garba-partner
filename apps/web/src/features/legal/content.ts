import { APP_NAME } from '@garba-partner/shared';

/*
 * The privacy policy (/privacy-policy) and terms (/terms), as data. Edit the wording here.
 *
 * IMPORTANT
 * - This is a plain-language draft written from what the application actually does. It is not
 *   legal advice. Have a lawyer review it before launch (India: the Digital Personal Data
 *   Protection Act 2023 and the IT Rules 2021 both apply to a service like this).
 * - Fill in OPERATOR below. Until `email` is set, both pages say that contact details are still
 *   to be published.
 * - Keep it true. If the product changes (a new provider, a new kind of data, different
 *   retention), change the policy in the same release, and update LAST_UPDATED.
 */

/** Who runs the service. `null` = not filled in yet. */
export const OPERATOR: {
  /** Registered name of the business or person operating GarbaMates. */
  legalName: string | null;
  /** Registered postal address. */
  address: string | null;
  /** Where privacy requests, complaints and legal notices are sent. */
  email: string | null;
  /** Grievance officer (required for Indian intermediaries): a named person. */
  grievanceOfficer: string | null;
} = {
  legalName: null,
  address: null,
  email: null,
  grievanceOfficer: null,
};

export const LAST_UPDATED = '12 October 2026';

/** A paragraph, or a bullet list. */
export type Block = string | readonly string[];

export interface LegalSection {
  /** Used as the anchor (`#data-we-collect`). */
  id: string;
  heading: string;
  blocks: readonly Block[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: readonly LegalSection[];
}

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy Policy',
  intro: `This policy explains what ${APP_NAME} collects about you, why, who it is shared with, how long it is kept, and the choices you have. ${APP_NAME} is for adults (18 and over) only.`,
  sections: [
    {
      id: 'data-we-collect',
      heading: 'What we collect',
      blocks: [
        'Information you give us:',
        [
          'Your mobile number, used to sign you in. It is stored encrypted, and looked up through a one-way hash.',
          'Your profile: first name, date of birth, gender, city and (optionally) area, Garba level, the dates you are free, a short bio, and optionally your Instagram username.',
          'Your profile photo. Location and camera data (EXIF) is removed from every photo before it is stored.',
          'Who you would like to dance with: preferred gender, age range, and whether to see verified members only.',
          'Messages you send to your matches, interests you send or receive, and the events you say you are going to.',
          'Reports you make about other members or messages, and people you block.',
          'Verification material, if you choose to verify your photo or identity.',
        ],
        'Information created when you use the service:',
        [
          'Sign-in records: one-time login codes (stored only as a hash, for a few minutes), and your active sessions with the browser type.',
          'Request logs: for each request to our servers we record the time, the address requested, the result, how long it took, your account ID if you are signed in, your IP address and your browser type. We do not record what you typed or the content of pages.',
          'Notification history: which notifications were sent to you and whether they were delivered.',
          'Pass purchases: the event, quantity, amount, and payment status. We never see or store your card, UPI or bank details.',
        ],
      ],
    },
    {
      id: 'how-we-use-it',
      heading: 'How we use it',
      blocks: [
        [
          'To create your account and sign you in.',
          'To show your profile to other members and suggest members to you, based on city, age, Garba level, dates and preferences.',
          'To let matched members chat.',
          'To send you notifications in the app and, if you have turned it on, on WhatsApp.',
          'To sell event passes and handle refunds.',
          'To keep members safe: reviewing reports, enforcing the community guidelines, detecting spam and abuse, and applying warnings, restrictions, suspensions or bans.',
          'To keep the service running: fixing errors, preventing fraud, and limiting how often sensitive actions can be repeated.',
        ],
        'We do not sell your personal information, and we do not use it for third-party advertising.',
      ],
    },
    {
      id: 'what-others-see',
      heading: 'What other members can see',
      blocks: [
        'Other members can see your first name, age (not your date of birth), gender, city, Garba level, bio, photo and verification badges. Your area is shown only if you choose to show it.',
        'Other members never see your mobile number, your date of birth, your Instagram username, your exact location, or who you have blocked or reported.',
        'Messages are visible to you and the member you matched with. Our moderators can read a conversation only when it has been reported, and each such access is recorded.',
      ],
    },
    {
      id: 'who-we-share-with',
      heading: 'Who we share information with',
      blocks: [
        'We use other companies to run parts of the service. They receive only what they need:',
        [
          'Meta (WhatsApp): your mobile number and the message, to deliver login codes and, if you opted in, notifications on WhatsApp.',
          'Cloudinary: profile and event images, for storage and delivery.',
          'Razorpay: your payment, when you buy an event pass. Razorpay collects your payment details directly.',
          'Our hosting provider: the servers and database the service runs on.',
        ],
        'We may also disclose information when the law requires it, or when it is necessary to protect someone’s safety or to investigate serious abuse of the service.',
        'Event organizers do not receive your contact details from us.',
      ],
    },
    {
      id: 'whatsapp',
      heading: 'WhatsApp messages',
      blocks: [
        'Login codes are sent to your mobile number on WhatsApp each time you ask to sign in.',
        'Other notifications (such as a new interest, a match or a pass update) are sent on WhatsApp only if you have turned on “Also notify me on WhatsApp”. It is off by default, and you can turn it off at any time in notification settings.',
        'These messages never contain chat text, another member’s name or contact details, or your location.',
      ],
    },
    {
      id: 'how-long',
      heading: 'How long we keep it',
      blocks: [
        [
          'Your profile, photo, preferences, matches and messages: for as long as your account exists.',
          'Login codes: a short time, and only as a hash. A code stops working after 5 minutes.',
          'Request logs, including IP addresses: about 30 days.',
          'In-app notifications: 90 days.',
          'Payment and booking records: for as long as tax and accounting law requires.',
          'Reports and moderation records: kept after an account is closed where needed to protect members and prevent banned accounts from returning.',
        ],
      ],
    },
    {
      id: 'your-choices',
      heading: 'Your choices and rights',
      blocks: [
        [
          'See and correct your information: on your profile and preferences pages. Your date of birth cannot be changed once set; contact us if it is wrong.',
          'Hide your profile from discovery: in preferences.',
          'Choose which notifications you receive, and whether to receive them on WhatsApp: in notification settings.',
          'Block or report any member, at any time.',
          'Ask for a copy of your information, ask us to delete your account and data, or withdraw a consent you gave: contact us using the details below.',
          'Complain about how we handled your information: contact us first; you may also complain to the Data Protection Board of India.',
        ],
        'When an account is deleted, your profile, photo and contact details are removed. Some records are kept where the law requires it or where they are needed for safety, as described above.',
      ],
    },
    {
      id: 'security',
      heading: 'How we protect it',
      blocks: [
        'Mobile numbers are encrypted in our database. Login codes, session tokens and administrator passwords are stored only as hashes. All traffic uses HTTPS. Access by our staff is limited by role and recorded.',
        'No system is perfectly secure. If a breach affects your information, we will tell you and the authorities as the law requires.',
      ],
    },
    {
      id: 'safety-note',
      heading: 'Verification is not a guarantee',
      blocks: [
        'A verification badge shows that a specific check was completed, such as a mobile number or a photo. It does not confirm who someone is and is not a guarantee of safety. Please follow the advice in our safety centre when meeting anyone.',
      ],
    },
    {
      id: 'children',
      heading: 'Age',
      blocks: [
        `${APP_NAME} is only for people aged 18 or over. We do not knowingly collect information from anyone under 18. If we learn that an account belongs to someone under 18, we will close it.`,
      ],
    },
    {
      id: 'cookies',
      heading: 'Cookies and storage',
      blocks: [
        'We use one essential cookie to keep you signed in. We do not use advertising or tracking cookies, and we do not use third-party analytics.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      blocks: [
        'When we change this policy we update this page and the date at the top. If a change affects how we use information you have already given us, we will ask for your consent again where the law requires it.',
      ],
    },
  ],
};

export const TERMS: LegalDocument = {
  title: 'Terms and Conditions',
  intro: `These terms are the agreement between you and the operator of ${APP_NAME} when you use the website. By creating an account you accept them, along with our Privacy Policy and Community Guidelines.`,
  sections: [
    {
      id: 'the-service',
      heading: 'What GarbaMates is',
      blocks: [
        `${APP_NAME} is a social platform for people who love Garba: you can create a profile, find partners and friends, chat with members you have matched with, and discover Garba events.`,
        `${APP_NAME} introduces members to each other and lists events. We do not organise events unless we say so, we are not a party to anything you arrange with another member, and we do not run background checks.`,
      ],
    },
    {
      id: 'eligibility',
      heading: 'Who can use it',
      blocks: [
        [
          'You must be at least 18 years old.',
          'You must use your own mobile number and give accurate information about yourself.',
          'One account per person. You may not share your account or let someone else use it.',
          'You may not create a new account if we have banned you.',
        ],
      ],
    },
    {
      id: 'your-account',
      heading: 'Your account',
      blocks: [
        'You sign in with a one-time code sent to your mobile number on WhatsApp. Never share that code with anyone: we will never ask you for it. You are responsible for what happens through your account.',
      ],
    },
    {
      id: 'conduct',
      heading: 'How you must behave',
      blocks: [
        'You must follow the Community Guidelines. In particular, you must not:',
        [
          'Harass, threaten, stalk or abuse anyone, or send sexual content that is not wanted.',
          'Ask other members for money, or use the service to sell, advertise or recruit.',
          'Pretend to be someone else, or post a photo that is not of you.',
          'Share another person’s private information.',
          'Use the service if you are under 18, or to contact anyone under 18.',
          'Post anything illegal, hateful or violent.',
          'Copy, scrape or collect other members’ information, or interfere with how the service works.',
        ],
      ],
    },
    {
      id: 'your-content',
      heading: 'Your content',
      blocks: [
        'Your profile, photo and messages remain yours. You give us permission to store and display them as needed to run the service, for example showing your profile to other members.',
        'You are responsible for what you post. We may remove content or photos that break these terms or the Community Guidelines.',
      ],
    },
    {
      id: 'safety',
      heading: 'Your safety',
      blocks: [
        'Meeting someone you first met online carries risk. You are responsible for your own decisions and safety. Meet in busy public places, tell a friend where you are going, and never send money or share passwords, login codes or your home address.',
        'A verification badge shows that a specific check was completed. It is not a guarantee of who someone is or that they are safe.',
        'You can block or report any member at any time. In an emergency, contact the police (112).',
      ],
    },
    {
      id: 'moderation',
      heading: 'Reports and enforcement',
      blocks: [
        'Reports are reviewed by our moderators. Depending on what happened we may dismiss a report, send a warning, restrict messaging, suspend an account for a time, or ban it. We do not tell a member who reported them.',
      ],
    },
    {
      id: 'events-and-passes',
      heading: 'Events and passes',
      blocks: [
        [
          'Events are run by their organizers, who are responsible for the event, the venue, entry rules and any changes or cancellation.',
          'Event details are provided by organizers. A “verified” badge means we checked specific details of the organizer or event; it is not an endorsement or a guarantee.',
          'Some events sell passes on GarbaMates. Payment is handled by Razorpay. A pass is confirmed only when you see it under “My passes”.',
          'Passes cannot be cancelled by you once bought. If an event is cancelled or a pass cannot be honoured, we cancel the booking and refund the amount paid to the original payment method. Refund timing depends on your bank or payment provider.',
          'Some events link to the organizer’s own ticketing site. Those purchases are between you and the organizer.',
        ],
      ],
    },
    {
      id: 'availability',
      heading: 'Changes and availability',
      blocks: [
        'We may change, pause or stop parts of the service. We try to keep it available but do not promise it will always be, or that it will be free of errors.',
      ],
    },
    {
      id: 'ending',
      heading: 'Ending your account',
      blocks: [
        'You can stop using the service at any time and ask us to delete your account. We may suspend or close an account that breaks these terms. Some records are kept after an account is closed, as explained in the Privacy Policy.',
      ],
    },
    {
      id: 'liability',
      heading: 'Our responsibility',
      blocks: [
        'The service is provided as it is. To the extent the law allows, we are not responsible for the behaviour of other members or of event organizers, for anything that happens at an event or a meeting, or for losses we could not reasonably have foreseen. Nothing in these terms limits any right you have that the law does not allow to be limited.',
      ],
    },
    {
      id: 'law',
      heading: 'Governing law',
      blocks: [
        'These terms are governed by the laws of India, and the courts of India have jurisdiction over any dispute.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to these terms',
      blocks: [
        'When we change these terms we update this page and the date at the top. Continuing to use the service after a change means you accept the new terms.',
      ],
    },
  ],
};
