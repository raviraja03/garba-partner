import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { LIMITS, maskPhone, type SendOtpResultDto } from '@garba-partner/shared';
import { AuthLayout } from '../components/AuthLayout';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { sendOtp, verifyOtp } from '../features/auth/auth-api';
import { useAuth } from '../features/auth/auth-context';
import { ApiClientError } from '../lib/api-client';

/** Router state handed over by the login page (kept in memory, never in the URL). */
export interface OtpPageState {
  phone: string;
  result: SendOtpResultDto;
  from?: string;
}

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
  const state = location.state as OtpPageState | null;
  if (!state?.phone) return <Navigate to="/login" replace />;
  return <VerifyOtpForm initial={state} />;
}

function VerifyOtpForm({ initial }: { initial: OtpPageState }) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [devOtp, setDevOtp] = useState(initial.result.devOtp);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useCountdown(initial.result.resendAvailableInSeconds);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!new RegExp(`^\\d{${String(LIMITS.OTP_LENGTH)}}$`).test(code)) {
      setError(`Enter the ${String(LIMITS.OTP_LENGTH)}-digit code.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const session = await verifyOtp({ phone: initial.phone, code });
      signIn(session);
      await navigate(initial.from ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      if (
        err instanceof ApiClientError &&
        (err.code === 'OTP_EXPIRED' || err.code === 'OTP_ATTEMPTS_EXCEEDED')
      ) {
        setCode('');
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
      const result = await sendOtp({ phone: initial.phone });
      setDevOtp(result.devOtp);
      setResendIn(result.resendAvailableInSeconds);
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
          We sent a {LIMITS.OTP_LENGTH}-digit code to <strong>{maskPhone(initial.phone)}</strong>.
          Never share this code with anyone.
        </>
      }
    >
      {devOtp && (
        <div className="mb-4">
          <Alert tone="info">
            <strong>Development only:</strong> no SMS is sent locally. Your code is{' '}
            <code className="font-mono font-bold tracking-widest">{devOtp}</code>
          </Alert>
        </div>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
        <div>
          <label htmlFor="otp" className="block text-sm font-semibold">
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
            className="mt-1 w-full rounded-xl bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-brand-600"
            required
          />
        </div>

        {error && (
          <div id="otp-error">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        {info && <Alert tone="info">{info}</Alert>}

        <Button type="submit" loading={submitting}>
          Verify and continue
        </Button>
      </form>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Button
          variant="link"
          onClick={() => {
            void navigate('/login', { replace: true });
          }}
        >
          Change number
        </Button>
        <Button
          variant="link"
          disabled={resendIn > 0 || resending}
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
