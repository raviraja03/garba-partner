import { Link } from 'react-router';

/**
 * Shown under a received message that looks like a request for money or payment details
 * (`looksLikeMoneyRequest`). A heuristic: it may also appear on harmless messages, so it warns
 * and never accuses.
 */
export function MoneyWarning({ onReport }: { onReport: () => void }) {
  return (
    <div
      role="note"
      className="mt-1.5 max-w-[82%] rounded-control bg-accent-yellow-soft px-3 py-2 text-caption text-primary ring-1 ring-accent-yellow/60 sm:max-w-[70%]"
    >
      <strong>Be careful:</strong> never send money, gift cards, UPI payments, OTPs or bank details
      to someone you met here, whatever the reason. Buy passes only through the official event link.{' '}
      <button type="button" className="font-semibold underline" onClick={onReport}>
        Report a money request
      </button>{' '}
      ·{' '}
      <Link to="/safety#money" className="font-semibold underline">
        Scam tips
      </Link>
    </div>
  );
}
