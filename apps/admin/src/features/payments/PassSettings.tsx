import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { LIMITS, type AdminEventDetailDto } from '@garba-partner/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { eventKeys } from '../events/hooks';
import { formatPaise } from './format';
import { updateEventPass } from './payments-api';

/**
 * Online pass sales for one event (Razorpay). Price in rupees (sent in paise); an empty price
 * stops sales; an empty capacity means unlimited. Existing orders keep their price.
 */
export function PassSettings({
  event,
  canManage,
}: {
  event: AdminEventDetailDto;
  canManage: boolean;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const { pass } = event;
  const [price, setPrice] = useState(pass.pricePaise === null ? '' : String(pass.pricePaise / 100));
  const [capacity, setCapacity] = useState(pass.capacity === null ? '' : String(pass.capacity));
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (input: { pricePaise: number | null; capacity: number | null }) =>
      updateEventPass(event.id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(eventKeys.detail(event.id), updated);
    },
  });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const pricePaise = price.trim() === '' ? null : Math.round(Number(price) * 100);
    const cap = capacity.trim() === '' ? null : Number(capacity);
    if (
      pricePaise !== null &&
      (!Number.isFinite(pricePaise) || pricePaise < LIMITS.PASS_PRICE_MIN_PAISE)
    ) {
      setError('Enter a price of at least ₹1, or leave it empty to stop online sales.');
      return;
    }
    if (cap !== null && (!Number.isInteger(cap) || cap < 1)) {
      setError('Capacity must be a whole number, or empty for unlimited.');
      return;
    }
    try {
      await save.mutateAsync({ pricePaise, capacity: cap });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p>
        {pass.pricePaise === null
          ? 'Passes are not sold on Garba Partner for this event.'
          : `${formatPaise(pass.pricePaise)} per pass · ${String(pass.sold)} sold · ${String(
              pass.reserved,
            )} held in checkout · capacity ${pass.capacity === null ? 'unlimited' : String(pass.capacity)}`}
      </p>
      {canManage && event.status !== 'archived' && (
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-wrap items-end gap-3">
          <label htmlFor={`${id}-price`} className="space-y-1">
            <span className="block text-xs font-semibold">Price per pass (₹)</span>
            <input
              id={`${id}-price`}
              inputMode="decimal"
              value={price}
              placeholder="Not sold"
              onChange={(e) => {
                setPrice(e.target.value);
              }}
              className="w-32 rounded-lg bg-white px-2 py-1 ring-1 ring-black/10"
            />
          </label>
          <label htmlFor={`${id}-capacity`} className="space-y-1">
            <span className="block text-xs font-semibold">Capacity</span>
            <input
              id={`${id}-capacity`}
              inputMode="numeric"
              value={capacity}
              placeholder="Unlimited"
              onChange={(e) => {
                setCapacity(e.target.value);
              }}
              className="w-32 rounded-lg bg-white px-2 py-1 ring-1 ring-black/10"
            />
          </label>
          <Button type="submit" className="w-auto! px-4 py-2!" loading={save.isPending}>
            Save pass settings
          </Button>
        </form>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-xs text-muted">
        Sales close when the event starts. Changes are recorded in the audit log.
      </p>
    </div>
  );
}
