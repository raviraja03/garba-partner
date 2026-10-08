import { Badge } from '../../../components/ui/Badge';
import { VERIFIED_EVENT_NOTE, VERIFIED_ORGANIZER_NOTE } from '../verified-copy';

export function VerifiedBadge({ kind }: { kind: 'organizer' | 'event' }) {
  const organizer = kind === 'organizer';
  return (
    <Badge
      tone="success"
      icon="check"
      title={organizer ? VERIFIED_ORGANIZER_NOTE : VERIFIED_EVENT_NOTE}
    >
      {organizer ? 'Verified organizer' : 'Verified event'}
    </Badge>
  );
}
