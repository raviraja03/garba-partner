/** Escapes `%`, `_` and `\` so user input is matched literally inside a LIKE/ILIKE pattern. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
