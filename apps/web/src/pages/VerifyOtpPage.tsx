import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { LIMITS, maskPhone } from '@garba-partner/shared';
import { AuthLayout } from '../components/AuthLayout';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { INPUT_CLASS } from '../components/ui/field-utils';
import { loginWithPhone } from '../features/auth/auth-api';
import { useAuth } from '../features/auth/auth-context';
import { phoneSignIn } from '../features/auth/firebase-phone-sdk';
import { PhoneSignInError, type PendingCode } from '../features/auth/phone-sign-in';
import { ApiClientError } from '../lib/api-client';

/** Router state handed over by the login page (kept in memory, never in the URL). */
export interface OtpPageState {
  from?: string;
}

const secondsUntilResend = (sentAt: number) =>
  Math.max(0, LIMITS.OTP_RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - sentAt) / 1000));

function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => {
      setRemaining((value) => value - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [remaining]);
  return [remaining, setRemaining] as const;
}

export function VerifyOtpPage() {
  const location = useLocation();
  // The pending code lives in memory only: after a reload there is nothing to verify.
  const [pending] = useState(() => phoneSignIn.pending());
  if (!pending) return <Navigate to="/login" replace />;
  const from = (location.state as OtpPageState | null)?.from;
  return <VerifyOtpForm pending={pending} {...(from ? { from } : {})} />;
}

function VerifyOtpForm({ pending, from }: { pending: PendingCode; from?: string }) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useCountdown(secondsUntilResend(pending.sentAt));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!new RegExp(`^\\d{${String(LIMITS.OTP_LENGTH)}}$`).test(code)) {
      setError(`Enter the ${String(LIMITS.OTP_LENGTH)}-digit code.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      // 1. Firebase checks the code. 2. Our API verifies Firebase's token and starts the session.
      const idToken = await phoneSignIn.confirmCode(code);
      const session = await loginWithPhone({ idToken });
      signIn(session);
      // Firebase has done its part: sign out of it and remove the reCAPTCHA.
      void phoneSignIn.reset();
      await navigate(from ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      const needsNewCode =
        (err instanceof PhoneSignInError && err.problem === 'code_expired') ||
        (err instanceof ApiClientError && err.code === 'PHONE_VERIFICATION_FAILED');
      if (needsNewCode) {
        setCode('');
        setResendIn(0);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const sent = await phoneSignIn.requestCode(pending.phone);
      setResendIn(secondsUntilResend(sent.sentAt));
      setCode('');
      setInfo('A new code is on its way.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout
      title="Enter your code"
      subtitle={
        <>
          We sent a {LIMITS.OTP_LENGTH}-digit code by SMS to{' '}
          <strong>{maskPhone(pending.phone)}</strong>. Never share this code with anyone.
        </>
      }
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
        <div>
          <label htmlFor="otp" className="block text-label">
            Verification code
          </label>
          <input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={LIMITS.OTP_LENGTH}
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, ''));
            }}
            aria-invalid={error !== null}
            aria-describedby={error ? 'otp-error' : undefined}
            placeholder={'•'.repeat(LIMITS.OTP_LENGTH)}
            className={`${INPUT_CLASS} min-h-16 text-center text-[1.75rem] font-bold tracking-[0.45em] placeholder:font-normal placeholder:text-brand-200`}
            required
          />
          {error && (
            <p id="otp-error" role="alert" className="mt-1.5 text-small font-medium text-danger">
              {error}
            </p>
          )}
        </div>

        {info && <Alert tone="success">{info}</Alert>}

        <Button type="submit" size="lg" loading={submitting} disabled={resending}>
          Verify and continue
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4">
        <Button
          variant="link"
          disabled={submitting}
          onClick={() => {
            // The login page forgets this code and removes its reCAPTCHA when it opens.
            void navigate('/login', { replace: true, state: from ? { from } : null });
          }}
        >
          Change number
        </Button>
        <Button
          variant="link"
          disabled={resendIn > 0 || resending || submitting}
          loading={resending}
          onClick={() => {
            void handleResend();
          }}
        >
          {resendIn > 0 ? `Resend in ${String(resendIn)}s` : 'Resend code'}
        </Button>
      </div>
    </AuthLayout>
  );
}
