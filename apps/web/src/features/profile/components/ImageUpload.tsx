import { useEffect, useId, useState, type ChangeEvent } from 'react';
import type { ProfileImageDto } from '@garba-partner/shared';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { buttonClass } from '../../../components/ui/button-styles';
import { useDeleteProfileImage, useUploadProfileImage } from '../hooks';
import { PHOTO_ACCEPT, PHOTO_MAX_MB, checkPhotoFile } from '../photo-file';

/**
 * The main profile photo. A profile always keeps one: it can be replaced at any time, and
 * removed only when there is an extra photo to take its place (`canRemove`).
 */
export function ImageUpload({
  image,
  canRemove = false,
  onDone,
}: {
  image: ProfileImageDto | null;
  /** True when the member has extra photos: removing this one promotes the oldest of them. */
  canRemove?: boolean;
  onDone?: () => void;
}) {
  const inputId = useId();
  const upload = useUploadProfileImage();
  const remove = useDeleteProfileImage();
  // The chosen file and its local preview URL (created in the event handler, not in an effect).
  const [selected, setSelected] = useState<{ file: File; previewUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = selected?.file ?? null;
  const previewUrl = selected?.previewUrl ?? null;

  // Release the object URL when the selection changes or the component unmounts.
  useEffect(() => {
    if (!selected) return;
    return () => {
      URL.revokeObjectURL(selected.previewUrl);
    };
  }, [selected]);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    event.target.value = '';
    setError(null);
    if (!chosen) return;
    const problem = await checkPhotoFile(chosen);
    if (problem) {
      setSelected(null);
      setError(problem);
      return;
    }
    setSelected({ file: chosen, previewUrl: URL.createObjectURL(chosen) });
  }

  async function handleUpload() {
    if (!file) return;
    setError(null);
    try {
      await upload.mutateAsync(file);
      setSelected(null);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  }

  async function handleRemove() {
    setError(null);
    try {
      await remove.mutateAsync(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the photo.');
    }
  }

  const shown = previewUrl ?? image?.url ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-5">
        <div className="flex aspect-[4/5] w-28 shrink-0 items-center justify-center overflow-hidden rounded-card bg-brand-100 ring-1 ring-brand-200 sm:w-36">
          {shown ? (
            <img
              src={shown}
              alt={previewUrl ? 'Selected photo preview' : 'Your profile photo'}
              className="size-full object-cover"
            />
          ) : (
            <span className="px-2 text-center text-caption text-muted">No photo yet</span>
          )}
        </div>
        <div className="space-y-2 text-small text-muted">
          <p>A clear, recent photo of your face. JPEG, PNG or WebP, up to {PHOTO_MAX_MB} MB.</p>
          <p>We remove location and camera data (EXIF) from every photo before storing it.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={inputId}
          className={buttonClass({
            variant: 'secondary',
            className:
              'cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-500',
          })}
        >
          {image || file ? 'Choose another photo' : 'Choose a photo'}
          <input
            id={inputId}
            type="file"
            accept={PHOTO_ACCEPT.join(',')}
            onChange={(event) => void handleChange(event)}
            className="sr-only"
          />
        </label>
        {file && (
          <Button fullWidth={false} loading={upload.isPending} onClick={() => void handleUpload()}>
            Upload photo
          </Button>
        )}
        {image && !file && canRemove && (
          <Button variant="link" loading={remove.isPending} onClick={() => void handleRemove()}>
            Remove photo
          </Button>
        )}
      </div>
      {image && !file && (
        <p className="text-caption text-muted">
          {canRemove
            ? 'If you remove your main photo, your oldest extra photo becomes the main one.'
            : 'Your profile needs at least one photo. To change it, choose another photo.'}
        </p>
      )}

      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
