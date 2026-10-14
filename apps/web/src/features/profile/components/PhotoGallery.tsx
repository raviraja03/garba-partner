import { useId, useState, type ChangeEvent } from 'react';
import { LIMITS, type ProfilePhotoDto } from '@garba-partner/shared';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { buttonClass } from '../../../components/ui/button-styles';
import { useAddProfilePhoto, useDeleteProfilePhoto } from '../hooks';
import { PHOTO_ACCEPT, preparePhotoFile } from '../photo-file';

/**
 * The member's extra photos (besides the main one): a grid with "Remove" under each photo and
 * an "Add photo" button until the limit is reached. A chosen photo is uploaded straight away.
 */
export function PhotoGallery({ photos }: { photos: ProfilePhotoDto[] }) {
  const inputId = useId();
  const add = useAddProfilePhoto();
  const remove = useDeleteProfilePhoto();
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const full = photos.length >= LIMITS.PROFILE_EXTRA_PHOTOS_MAX;

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    event.target.value = '';
    setError(null);
    if (!chosen) return;
    const prepared = await preparePhotoFile(chosen);
    if (!prepared.file) {
      setError(prepared.error);
      return;
    }
    try {
      await add.mutateAsync(prepared.file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  }

  async function handleRemove(photoId: string) {
    setError(null);
    setRemovingId(photoId);
    try {
      await remove.mutateAsync(photoId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the photo.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-small text-muted">
        Add up to {LIMITS.PROFILE_EXTRA_PHOTOS_MAX} more photos. They are shown on your profile
        page, below your main photo.
      </p>

      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="space-y-1">
              <div className="aspect-[4/5] overflow-hidden rounded-card bg-brand-100 ring-1 ring-brand-200">
                <img
                  src={photo.url}
                  alt={`Extra ${String(index + 1)} of ${String(photos.length)}`}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              </div>
              <Button
                variant="link"
                loading={removingId === photo.id}
                disabled={remove.isPending}
                aria-label={`Remove extra photo ${String(index + 1)}`}
                onClick={() => void handleRemove(photo.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="text-small text-muted">
          You have added the maximum number of photos. Remove one to add another.
        </p>
      ) : (
        <label
          htmlFor={inputId}
          aria-busy={add.isPending}
          className={buttonClass({
            variant: 'secondary',
            className:
              'cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-500 aria-busy:pointer-events-none aria-busy:opacity-60',
          })}
        >
          {add.isPending ? 'Uploading…' : photos.length > 0 ? 'Add another photo' : 'Add a photo'}
          <input
            id={inputId}
            type="file"
            accept={PHOTO_ACCEPT.join(',')}
            disabled={add.isPending}
            onChange={(event) => void handleChange(event)}
            className="sr-only"
          />
        </label>
      )}

      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
