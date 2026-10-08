import { cx } from './cx';

const SIZE = {
  sm: 'size-8 text-caption',
  md: 'size-10 text-small',
  lg: 'size-14 text-h3',
  xl: 'size-24 text-h1',
} as const;

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((word) => (word ? word.charAt(0).toUpperCase() : '')).join('');
}

/**
 * A member's photo, or their initials when there is none. Decorative by default (the name is
 * normally printed next to it); pass `decorative={false}` when the avatar stands alone.
 */
export function Avatar({
  name,
  src,
  size = 'md',
  decorative = true,
  className,
}: {
  name: string;
  src?: string | null | undefined;
  size?: keyof typeof SIZE;
  decorative?: boolean;
  className?: string;
}) {
  const box = cx('shrink-0 rounded-full ring-2 ring-card', SIZE[size], className);
  if (src) {
    return (
      <img
        src={src}
        alt={decorative ? '' : name}
        loading="lazy"
        decoding="async"
        className={cx(box, 'bg-brand-100 object-cover')}
      />
    );
  }
  return (
    <span
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
      className={cx(
        box,
        'inline-flex items-center justify-center bg-brand-100 font-bold text-brand-700',
      )}
    >
      {initials(name)}
    </span>
  );
}
