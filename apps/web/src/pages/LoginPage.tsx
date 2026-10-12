import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { normalizeIndianMobile } from '@garba-partner/shared';
import { AuthLayout } from '../components/AuthLayout';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { cx } from '../components/ui/cx';
import { phoneSignIn } from '../features/auth/firebase-phone-sdk';
import { isPhoneSignInConfigured } from '../lib/firebase';
import type { OtpPageState } from './VerifyOtpPage';
import { TEXT_LINK } from '../components/ui/link-styles';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Arriving here (first visit, or "Change number") starts over: any earlier code is forgotten
  // and its reCAPTCHA removed.
  useEffect(() => {
    void phoneSignIn.reset();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeIndianMobile(phone);
    if (!normalized) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Google's reCAPTCHA check runs first (usually unseen), then Firebase sends the SMS.
      await phoneSignIn.requestCode(normalized);
      // The number stays in memory with the pending code: never in the URL or in storage.
      const state: OtpPageState = from ? { from } : {};
      await navigate('/login/verify', { state });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Find your Garba partner"
      subtitle="Log in or sign up with your mobile number. We'll text you a 6-digit code."
    >
      {!isPhoneSignInConfigured && (
        <div className="mb-5">
          <Alert tone="warning">
            Sign-in is not set up on this site yet. Please try again later.
          </Alert>
        </div>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
        <div>
          <label htmlFor="phone" className="block text-label">
            Mobile number
          </label>
          <div
            className={cx(
              'mt-1.5 flex min-h-13 items-center rounded-control bg-card ring-1 transition-shadow focus-within:ring-2',
              error
                ? 'ring-2 ring-danger'
                : 'ring-brand-200 hover:ring-brand-300 focus-within:ring-brand-500',
            )}
          >
            <span
              className="flex items-center gap-2 border-r border-line py-1 pr-3 pl-4 font-semibold text-ink"
              aria-hidden="true"
            >
              +91
            </span>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              enterKeyHint="go"
              placeholder="98765 43210"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
              }}
              aria-invalid={error !== null}
              aria-describedby={error ? 'phone-error' : 'phone-hint'}
              className="w-full min-w-0 bg-transparent px-3 py-3 text-[1.0625rem] tracking-wide outline-none placeholder:text-muted/60"
              required
            />
          </div>
          {error ? (
            <p id="phone-error" role="alert" className="mt-1.5 text-small font-medium text-danger">
              {error}
            </p>
          ) : (
            <p id="phone-hint" className="mt-1.5 text-caption text-muted">
              We only use your number to sign you in. Other members never see it.
            </p>
          )}
        </div>

        <Button type="submit" size="lg" loading={submitting} disabled={!isPhoneSignInConfigured}>
          Send code
        </Button>
        <p className="text-caption text-muted">
          The code arrives by SMS. Standard message rates may apply.
        </p>
      </form>

      <p className="mt-6 text-caption text-muted">
        By continuing you confirm you are 18 or older and agree to our{' '}
        <Link to="/terms" className={TEXT_LINK}>
          terms
        </Link>
        ,{' '}
        <Link to="/privacy-policy" className={TEXT_LINK}>
          privacy policy
        </Link>{' '}
        and{' '}
        <Link to="/guidelines" className={TEXT_LINK}>
          community guidelines
        </Link>
        .
      </p>
    </AuthLayout>
  );
}
