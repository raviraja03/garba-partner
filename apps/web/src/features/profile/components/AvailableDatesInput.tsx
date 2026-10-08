import { useState } from 'react';
import { LIMITS, addDays, todayInIndia } from '@garba-partner/shared';
import { formatShortDate } from '../../../lib/format';
import { INPUT_CLASS } from '../../../components/ui/field-utils';

/** Pick the dates you can go dancing; shown as removable chips. */
export function AvailableDatesInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string[];
  onChange: (dates: string[]) => void;
  invalid: boolean;
}) {
  const today = todayInIndia();
  const max = addDays(today, LIMITS.AVAILABLE_DATES_HORIZON_DAYS);
  const [draft, setDraft] = useState('');
  const full = value.length >= LIMITS.AVAILABLE_DATES_MAX;

  function add() {
    if (!draft || draft < today || draft > max || value.includes(draft) || full) return;
    onChange([...value, draft].sort());
    setDraft('');
  }

  return (
    <div>
      <div className="flex items-end gap-2">
        <input
          id={id}
          type="date"
          min={today}
          max={max}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          aria-invalid={invalid}
          className={INPUT_CLASS}
          disabled={full}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft || full}
          className="min-h-12 shrink-0 rounded-control bg-brand-100 px-5 font-semibold text-brand-800 transition-colors hover:bg-brand-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {value.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Selected dates">
          {value.map((date) => (
            <li
              key={date}
              className="flex min-h-10 items-center rounded-full bg-brand-50 pl-3.5 text-small font-semibold text-brand-700 ring-1 ring-brand-200"
            >
              {formatShortDate(date)}
              <button
                type="button"
                onClick={() => {
                  onChange(value.filter((d) => d !== date));
                }}
                className="flex size-10 items-center justify-center rounded-full text-lg leading-none text-muted transition-colors hover:text-danger"
                aria-label={`Remove ${formatShortDate(date)}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
