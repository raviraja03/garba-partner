import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { normalizeIndianMobile } from '@garba-partner/shared';
import { AuthLayout } from '../components/AuthLayout';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { sendOtp } from '../features/auth/auth-api';
import type { OtpPageState } from './VerifyOtpPage';

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
      subtitle="Log in or sign up with your mobile number. We'll text you a 6-digit code."
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
        <div>
          <label htmlFor="phone" className="block text-sm font-semibold">
            Mobile number
          </label>
          <div className="mt-1 flex rounded-xl bg-white ring-1 ring-black/10 focus-within:ring-2 focus-within:ring-brand-600">
            <span className="flex items-center pl-4 text-muted" aria-hidden="true">
              +91
            </span>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
              }}
              aria-invalid={error !== null}
              aria-describedby={error ? 'phone-error' : undefined}
              className="w-full rounded-xl bg-transparent px-3 py-3 outline-none"
              required
            />
          </div>
        </div>

        {error && (
          <div id="phone-error">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        <Button type="submit" loading={submitting}>
          Send code
        </Button>
      </form>

      <p className="mt-6 text-xs text-muted">
        By continuing you confirm you are 18 or older and agree to our Terms and Privacy Policy.
      </p>
    </AuthLayout>
  );
}
