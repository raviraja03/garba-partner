import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { ImageUpload } from '../features/profile/components/ImageUpload';
import { PreferencesForm } from '../features/profile/components/PreferencesForm';
import { ProfileForm } from '../features/profile/components/ProfileForm';
import { useCreateProfile, useMyProfile } from '../features/profile/hooks';

type Step = 'details' | 'photo' | 'preferences';

const STEPS: readonly { id: Step; label: string }[] = [
  { id: 'details', label: 'About you' },
  { id: 'photo', label: 'Photo' },
  { id: 'preferences', label: 'Preferences' },
];

/** Three steps: profile details → photo → preferences. Resumes where the member left off. */
export function OnboardingPage() {
  const navigate = useNavigate();
  const myProfile = useMyProfile();
  const createProfile = useCreateProfile();
  const [step, setStep] = useState<Step | null>(null);

  if (myProfile.isPending) return <FullPageSpinner />;
  if (myProfile.isError)
    return <Alert tone="error">We couldn't load your profile. Please refresh.</Alert>;

  const data = myProfile.data;
  const current: Step =
    step ??
    (data.profile === null ? 'details' : data.profile.image === null ? 'photo' : 'preferences');
  if (data.profileStatus === 'complete' && step === null) return <Navigate to="/profile" replace />;

  const currentIndex = STEPS.findIndex((s) => s.id === current);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-accent-600">
          Step {currentIndex + 1} of {STEPS.length}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">Create your profile</h1>
        <ol className="mt-4 flex gap-2" aria-label="Onboarding steps">
          {STEPS.map((s, index) => (
            <li
              key={s.id}
              aria-current={s.id === current ? 'step' : undefined}
              className={`flex-1 rounded-full py-1 text-center text-xs font-semibold ${index <= currentIndex ? 'bg-brand-600 text-white' : 'bg-brand-50 text-muted'}`}
            >
              {s.label}
            </li>
          ))}
        </ol>
      </div>

      {current === 'details' && (
        <ProfileForm
          mode="create"
          submitLabel="Continue"
          onCreate={async (input) => {
            await createProfile.mutateAsync(input);
            setStep('photo');
          }}
        />
      )}

      {current === 'photo' && (
        <div className="space-y-6">
          <p className="text-muted">
            Add a clear photo of yourself. Your profile is only shown to other members once it has a
            photo.
          </p>
          <ImageUpload
            image={data.profile?.image ?? null}
            onDone={() => {
              setStep('preferences');
            }}
          />
          {data.profile?.image && (
            <Button
              variant="secondary"
              onClick={() => {
                setStep('preferences');
              }}
            >
              Continue
            </Button>
          )}
        </div>
      )}

      {current === 'preferences' && data.preferences && (
        <div className="space-y-4">
          <p className="text-muted">
            Who would you like to dance with? You can change this any time.
          </p>
          <PreferencesForm
            initial={data.preferences}
            submitLabel="Finish"
            onSaved={() => {
              void navigate('/profile', { replace: true });
            }}
          />
        </div>
      )}
    </div>
  );
}
