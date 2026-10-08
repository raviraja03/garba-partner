import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { CreatedOrderDto, EventDetailDto, EventPassDto } from '@garba-partner/shared';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button, LinkButton } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Select } from '../../components/ui/Input';
import { ApiClientError } from '../../lib/api-client';
import { useAuth } from '../auth/auth-context';
import { formatPaise } from './format';
import { createPassOrder, fetchOrder, verifyPassPayment } from './passes-api';
import { openCheckout } from './razorpay-checkout';

const POLL_MS = 3000;
const POLL_ATTEMPTS = 20;
const time = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' }).format(
    new Date(iso),
  );

/**
 * Buy passes on GarbaMates (Razorpay). Flow: server order → Razorpay Checkout → server-side
 * verification → booking confirmation. The browser's word is never final: if verification is
 * still pending (e.g. the network dropped), the order is polled until the webhook confirms it.
 */
export function BuyPass({ event, pass }: { event: EventDetailDto; pass: EventPassDto }) {
  const id = useId();
  const { state } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const max = Math.min(pass.maxPerOrder, pass.remaining ?? pass.maxPerOrder);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [pending, setPending] = useState<CreatedOrderDto | null>(null);
  // One key per checkout attempt: retries of the same attempt never create a second order.
  const idempotencyKey = useRef(crypto.randomUUID());

  if (state.status !== 'authenticated') {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <Icon name="ticket" className="size-5 text-brand-500" />
          Passes {formatPaise(pass.pricePaise)} each
        </p>
        <LinkButton to="/login" state={{ from: location.pathname }} variant="secondary" fullWidth>
          Log in to buy a pass
        </LinkButton>
      </div>
    );
  }
  if (!pass.onSale || pass.soldOut) {
    return (
      <p className="rounded-control bg-brand-900/5 px-4 py-3 text-center text-small font-semibold text-muted">
        {pass.soldOut ? 'Passes are sold out.' : 'Online pass sales are closed.'}
      </p>
    );
  }

  async function waitForBooking(orderId: string) {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      const order = await fetchOrder(orderId);
      if (order.bookingId) return order.bookingId;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    return null;
  }

  async function checkout(existing: CreatedOrderDto | null) {
    setBusy(true);
    setMessage(null);
    try {
      const created =
        existing ?? (await createPassOrder(event.id, quantity, idempotencyKey.current));
      setPending(created);
      const result = await openCheckout(created.checkout);
      if (result.kind === 'dismissed') {
        setMessage({
          tone: 'info',
          text: `Payment not completed. Your passes are held until ${time(created.order.expiresAt)}.`,
        });
        return;
      }
      if (result.kind === 'failed') {
        setMessage({ tone: 'error', text: `${result.message} You can try again.` });
        return;
      }
      setMessage({ tone: 'info', text: 'Payment received. Confirming your booking…' });
      const verified = await verifyPassPayment(created.order.id, result.payment).catch(() => null);
      const bookingId = verified?.booking?.id ?? (await waitForBooking(created.order.id));
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      if (bookingId) {
        idempotencyKey.current = crypto.randomUUID();
        setPending(null);
        await navigate(`/bookings/${bookingId}`);
      } else {
        setMessage({
          tone: 'info',
          text: 'We are still confirming your payment. Check “My passes” in a few minutes. If it is not confirmed, you will be refunded automatically.',
        });
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'ORDER_EXPIRED') setPending(null);
      setMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Icon name="ticket" className="size-5 text-brand-500" />
            Passes {formatPaise(pass.pricePaise)} each
          </p>
          {pass.remaining !== null && pass.remaining <= 20 && (
            <Badge tone="orange" className="mt-1.5">
              Only {pass.remaining} left
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor={`${id}-qty`} className="text-label">
            Quantity
          </label>
          <Select
            id={`${id}-qty`}
            className="w-20"
            fieldGap={false}
            value={quantity}
            disabled={busy || pending !== null}
            onChange={(e) => {
              setQuantity(Number(e.target.value));
              idempotencyKey.current = crypto.randomUUID();
            }}
          >
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Button size="lg" loading={busy} onClick={() => void checkout(pending)}>
        {pending ? 'Try payment again' : `Pay ${formatPaise(pass.pricePaise * quantity)}`}
      </Button>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <p className="text-caption text-muted">
        Secure payment by Razorpay (UPI, cards, net banking). GarbaMates never sees your card or UPI
        details. Only pay on this page — never send money to another member.
      </p>
    </div>
  );
}
