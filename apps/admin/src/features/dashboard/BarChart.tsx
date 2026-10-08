import { useId } from 'react';

/**
 * A minimal, dependency-free bar chart (inline SVG). Bars for one series; an accessible table
 * with the same numbers is rendered for screen readers. Used only where a trend matters for
 * operations (sign-ups vs matches, sales, moderation load).
 */
export function BarChart({
  title,
  labels,
  values,
  format = (value) => String(value),
  color = '#2D1B69',
}: {
  title: string;
  labels: string[];
  values: number[];
  format?: (value: number) => string;
  color?: string;
}) {
  const id = useId();
  const max = Math.max(1, ...values);
  const width = 600;
  const height = 140;
  const gap = values.length > 60 ? 1 : 2;
  const barWidth = Math.max(1, width / values.length - gap);
  const total = values.reduce((sum, value) => sum + value, 0);
  const short = (date: string) => date.slice(5); // MM-DD

  return (
    <figure className="space-y-2 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold" id={`${id}-title`}>
          {title}
        </span>
        <span className="text-muted">Total {format(total)}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        className="h-36 w-full"
        role="img"
        aria-labelledby={`${id}-title`}
        preserveAspectRatio="none"
      >
        {values.map((value, i) => {
          const barHeight = (value / max) * (height - 4);
          return (
            <rect
              key={labels[i] ?? i}
              x={i * (barWidth + gap)}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              fill={color}
              rx={1}
            >
              <title>{`${labels[i] ?? ''}: ${format(value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-muted" aria-hidden="true">
        <span>{labels[0] ? short(labels[0]) : ''}</span>
        <span>peak {format(max === 1 && total === 0 ? 0 : max)}</span>
        <span>{labels.at(-1) ? short(labels.at(-1) ?? '') : ''}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {values.map((value, i) => (
            <tr key={labels[i] ?? i}>
              <th scope="row">{labels[i]}</th>
              <td>{format(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
