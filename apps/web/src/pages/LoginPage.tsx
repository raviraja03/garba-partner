import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { normalizeIndianMobile } from '@garba-partner/shared';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/ui/Button';
import { cx } from '../components/ui/cx';
import { sendOtp } from '../features/auth/auth-api';
import type { OtpPageState } from './VerifyOtpPage';
import { TEXT_LINK } from '../components/ui/link-styles';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      const result = await sendOtp({ phone: normalized });
      // The phone number travels in router state (memory), never in the URL.
      const state: OtpPageState = { phone: normalized, result, ...(from ? { from } : {}) };
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
      subtitle="Log in or sign up with your mobile number. We'll send a 6-digit code to your WhatsApp."
    >
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

        <Button type="submit" size="lg" loading={submitting}>
          Send code
        </Button>
      </form>

      <p className="mt-6 text-caption text-muted">
        By continuing you confirm you are 18 or older and agree to follow our{' '}
        <Link to="/guidelines" className={TEXT_LINK}>
          community guidelines
        </Link>
        .
      </p>
    </AuthLayout>
  );
}
