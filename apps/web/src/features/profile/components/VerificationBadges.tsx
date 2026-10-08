import { Badge } from '../../../components/ui/Badge';

/*
 * What each check means, in full. A badge states what was checked and nothing more: it is
 * never a promise about a person's intentions or safety.
 */
export const PHOTO_VERIFIED_NOTE =
  "This member took a live selfie that matched their profile photo. Verification does not guarantee a person's identity, intentions or safety.";
export const ID_VERIFIED_NOTE =
  "This member completed an identity check with a licensed provider. Verification does not guarantee a person's intentions or safety.";

/** The member's verification badges (nothing when they have none). */
export function VerificationBadges({
  photoVerified,
  identityVerified,
  className,
}: {
  photoVerified: boolean;
  identityVerified: boolean;
  className?: string;
}) {
  if (!photoVerified && !identityVerified) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1.5 ${className ?? ''}`}>
      {photoVerified && (
        <Badge tone="success" icon="check" title={PHOTO_VERIFIED_NOTE}>
          Photo verified
        </Badge>
      )}
      {identityVerified && (
        <Badge tone="success" icon="check" title={ID_VERIFIED_NOTE}>
          ID verified
        </Badge>
      )}
    </span>
  );
}
