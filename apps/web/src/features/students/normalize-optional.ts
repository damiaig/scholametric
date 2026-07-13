/**
 * react-hook-form leaves untouched optional text fields as "" rather than
 * undefined. Sending "" straight through would fail backend validators that
 * require either a real value or absence entirely (e.g. guardianEmail's
 * @IsEmail() rejects an empty string) — this normalizes "" to undefined so
 * JSON.stringify omits the key.
 */
export function normalizeOptionalString(value: string | undefined): string | undefined {
  return value ? value : undefined;
}
