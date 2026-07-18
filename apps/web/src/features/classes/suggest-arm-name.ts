/**
 * "Has A and B -> suggest C" (SPEC_V0.2.md §4) — always editable, so this
 * only needs to be a reasonable default, not a strict validator. Non-letter
 * arm names are ignored for the purpose of picking the next letter.
 */
export function suggestNextArmName(existingNames: string[]): string {
  const letterCodes = existingNames
    .map((name) => name.trim())
    .filter((name) => /^[A-Za-z]$/.test(name))
    .map((name) => name.toUpperCase().charCodeAt(0));

  const lastCode = letterCodes.length > 0 ? Math.max(...letterCodes) : "A".charCodeAt(0) - 1;
  const nextCode = lastCode + 1;
  return nextCode <= "Z".charCodeAt(0) ? String.fromCharCode(nextCode) : "";
}
