import { useApiHealth } from '../features/system/useApiHealth';

const DOT_CLASS = {
  checking: 'bg-muted animate-pulse',
  online: 'bg-success',
  offline: 'bg-danger',
} as const;

/** Small indicator showing whether the API health check succeeds. */
export function ApiStatus() {
  const health = useApiHealth();

  const label =
    health.status === 'checking'
      ? 'Checking API…'
      : health.status === 'online'
        ? 'API online'
        : `API offline — ${health.reason}`;

  return (
    <p
      className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm text-muted shadow-sm ring-1 ring-black/5"
      role="status"
      aria-live="polite"
    >
      <span className={`size-2 rounded-full ${DOT_CLASS[health.status]}`} aria-hidden="true" />
      {label}
    </p>
  );
}
