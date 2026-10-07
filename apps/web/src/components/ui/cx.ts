/** Joins class names, skipping empty values: `cx('a', active && 'b')`. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
