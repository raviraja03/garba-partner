import { useEffect, useId, useState, type ChangeEvent } from 'react';
import { LIMITS, PROFILE_IMAGE_MIME_TYPES, type ProfileImageDto } from '@garba-partner/shared';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { useDeleteProfileImage, useUploadProfileImage } from '../hooks';

const ACCEPT: readonly string[] = PROFILE_IMAGE_MIME_TYPES;
const MAX_MB = LIMITS.PROFILE_IMAGE_MAX_BYTES / 1024 / 1024;

/** Quick client-side checks; the server re-validates by decoding the file. */
async function checkFile(file: File): Promise<string | null> {
  if (!ACCEPT.includes(file.type)) return 'Please choose a JPEG, PNG or WebP photo.';
  if (file.size > LIMITS.PROFILE_IMAGE_MAX_BYTES)
    return `Your photo must be ${String(MAX_MB)} MB or smaller.`;
  try {
    const bitmap = await createImageBitmap(file);
    const smallest = Math.min(bitmap.width, bitmap.height);
    bitmap.close();
    if (smallest < LIMITS.PROFILE_IMAGE_MIN_DIMENSION) {
      return `Your photo must be at least ${String(LIMITS.PROFILE_IMAGE_MIN_DIMENSION)}×${String(LIMITS.PROFILE_IMAGE_MIN_DIMENSION)} pixels.`;
    }
  } catch {
    return 'That file could not be read as an image.';
  }
  return null;
}

export function ImageUpload({
  image,
  onDone,
}: {
  image: ProfileImageDto | null;
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
    const problem = await checkFile(chosen);
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
        <div className="flex h-40 w-30 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-50 ring-1 ring-black/5">
          {shown ? (
            <img
              src={shown}
              alt={previewUrl ? 'Selected photo preview' : 'Your profile photo'}
              className="size-full object-cover"
            />
          ) : (
            <span className="px-2 text-center text-xs text-muted">No photo yet</span>
          )}
        </div>
        <div className="space-y-2 text-sm text-muted">
          <p>A clear, recent photo of your face. JPEG, PNG or WebP, up to {MAX_MB} MB.</p>
          <p>We remove location and camera data (EXIF) from every photo before storing it.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={inputId}
          className="cursor-pointer rounded-xl bg-white px-4 py-3 font-semibold ring-1 ring-black/10 hover:bg-brand-50 focus-within:ring-2 focus-within:ring-brand-600"
        >
          {image || file ? 'Choose another photo' : 'Choose a photo'}
          <input
            id={inputId}
            type="file"
            accept={ACCEPT.join(',')}
            onChange={(event) => void handleChange(event)}
            className="sr-only"
          />
        </label>
        {file && (
          <Button
            className="w-auto! px-6"
            loading={upload.isPending}
            onClick={() => void handleUpload()}
          >
            Upload photo
          </Button>
        )}
        {image && !file && (
          <Button variant="link" loading={remove.isPending} onClick={() => void handleRemove()}>
            Remove photo
          </Button>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
