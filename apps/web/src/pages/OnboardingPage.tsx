import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { cx } from '../components/ui/cx';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { ImageUpload } from '../features/profile/components/ImageUpload';
import { PreferencesForm } from '../features/profile/components/PreferencesForm';
import { ProfileForm } from '../features/profile/components/ProfileForm';
import { useCreateProfile, useMyProfile } from '../features/profile/hooks';

type Step = 'details' | 'photo' | 'preferences';

const STEPS: readonly { id: Step; label: string; intro: string }[] = [
  { id: 'details', label: 'About you', intro: 'Tell other members who you are and how you dance.' },
  {
    id: 'photo',
    label: 'Photo',
    intro:
      'Add a clear photo of yourself. Your profile is only shown to other members once it has a photo.',
  },
  {
    id: 'preferences',
    label: 'Preferences',
    intro: 'Who would you like to dance with? You can change this any time.',
  },
];

/** Three steps: profile details → photo → preferences. Resumes where the member left off. */
export function OnboardingPage() {
  const navigate = useNavigate();
  const myProfile = useMyProfile();
  const createProfile = useCreateProfile();
  const [step, setStep] = useState<Step | null>(null);

  if (myProfile.isPending) return <FullPageSpinner />;
  if (myProfile.isError) {
    return (
      <EmptyState tone="error" title="We couldn't load your profile">
        Check your connection and refresh the page.
      </EmptyState>
    );
  }

  const data = myProfile.data;
  const current: Step =
    step ??
    (data.profile === null ? 'details' : data.profile.image === null ? 'photo' : 'preferences');
  if (data.profileStatus === 'complete' && step === null) return <Navigate to="/profile" replace />;

  const currentIndex = STEPS.findIndex((s) => s.id === current);
  const currentStep = STEPS[currentIndex];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-label text-accent-700">
          Step {currentIndex + 1} of {STEPS.length}
        </p>
        <h1 className="text-h1">Create your profile</h1>
        <ol className="mt-5 grid grid-cols-3 gap-2" aria-label="Onboarding steps">
          {STEPS.map((s, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            return (
              <li key={s.id} aria-current={active ? 'step' : undefined}>
                <span
                  className={cx(
                    'block h-1.5 rounded-full transition-colors duration-300',
                    done || active ? 'bg-accent-500' : 'bg-brand-100',
                  )}
                />
                <span
                  className={cx(
                    'mt-2 flex items-center gap-1.5 text-caption font-semibold',
                    active ? 'text-ink' : done ? 'text-success' : 'text-muted',
                  )}
                >
                  <span
                    className={cx(
                      'flex size-5 shrink-0 items-center justify-center rounded-full text-[0.75rem]',
                      done
                        ? 'bg-success text-white'
                        : active
                          ? 'bg-brand-600 text-white'
                          : 'bg-brand-100 text-muted',
                    )}
                    aria-hidden="true"
                  >
                    {done ? <Icon name="check" className="size-3" /> : index + 1}
                  </span>
                  {s.label}
                  {done && <span className="sr-only"> (done)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </header>

      {currentStep && <p className="text-muted">{currentStep.intro}</p>}

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
        <div className="space-y-5">
          <Card>
            <ImageUpload
              image={data.profile?.image ?? null}
              onDone={() => {
                setStep('preferences');
              }}
            />
          </Card>
          {data.profile?.image && (
            <Button
              size="lg"
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
        <PreferencesForm
          initial={data.preferences}
          submitLabel="Finish"
          onSaved={() => {
            void navigate('/profile', { replace: true });
          }}
        />
      )}
    </div>
  );
}
