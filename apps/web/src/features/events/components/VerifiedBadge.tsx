import { VERIFIED_EVENT_NOTE, VERIFIED_ORGANIZER_NOTE } from '../verified-copy';

export function VerifiedBadge({ kind }: { kind: 'organizer' | 'event' }) {
  const organizer = kind === 'organizer';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800"
      title={organizer ? VERIFIED_ORGANIZER_NOTE : VERIFIED_EVENT_NOTE}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 fill-current">
        <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm3.6 6.1-4.2 4.3a.8.8 0 0 1-1.1 0L4.4 8.5a.8.8 0 1 1 1.1-1.1l1.3 1.3 3.7-3.7a.8.8 0 0 1 1.1 1.1Z" />
      </svg>
      {organizer ? 'Verified organizer' : 'Verified event'}
    </span>
  );
}
