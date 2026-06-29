// Turn a raw bank descriptor (Plaid's `name`, e.g. "SQ *BLUE BOTTLE 3491 MONTREAL QC")
// into a clean, human-readable, *stable* merchant name. We only run this when Plaid
// gives us no enriched `merchant_name`; those rows are both the ugliest to read and
// the only ones that can't currently carry a category rule (the rule key is the
// merchant name). Normalizing here gives them a readable label AND a consistent key,
// so the existing "apply to all <merchant>" rule machinery starts working on them.
//
// Conservative by design: we strip only well-known noise. When in doubt we keep the
// token rather than risk mangling a real name. Never returns an empty string — if
// cleaning removes everything, we fall back to the trimmed raw input.

// Payment-processor / aggregator prefixes that wrap the real merchant as "PREFIX *Name".
// Allowlisted (not generic) so "UBER* EATS" keeps "EATS" — Uber is the merchant, not a wrapper.
const PROCESSOR_PREFIX =
  /^(?:SQ|SQU|TST|TQ|PP|PAYPAL|GOOGLE|GOOG|STRIPE|SP|IC|CKO|WPY|EBAY|AMZN MKTP|AMAZON)\s*\*+\s*/i

// Trailing Canadian province (optionally followed by a country code) — pure location noise.
const CA_PROVINCES = 'AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT'
const TRAILING_PROVINCE = new RegExp(`\\s+(?:${CA_PROVINCES})(?:\\s+(?:CA|CAN|USA|US))?\\s*$`, 'i')

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

export function normalizeMerchantName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const original = raw.trim()
  if (!original) return null

  let s = original

  // 1. Strip a known leading processor prefix ("SQ *", "TST*", "PAYPAL *", …).
  s = s.replace(PROCESSOR_PREFIX, '')

  // 2. Drop URL noise and bare domains.
  s = s.replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
  s = s.replace(/\.(?:com|ca|net|org|co|io)\b/gi, ' ')

  // 3. Drop "*REF" order/reference codes — a "*" followed by a token containing a
  //    digit (e.g. "AMAZON.COM*A12B3"). Requires the digit so "UBER* EATS" is safe.
  s = s.replace(/\*+\s*[A-Za-z0-9]*\d[A-Za-z0-9]*/g, ' ')

  // 4. Strip trailing location (Canadian province / country code).
  s = s.replace(TRAILING_PROVINCE, ' ')

  // 5. Strip store / reference markers ("#1234", "STORE #07").
  s = s.replace(/\bstore\s*#?\s*\d+/gi, ' ')
  s = s.replace(/#\s*\d+/g, ' ')

  // 6. Strip standalone numeric runs (store ids, card tails, ref numbers).
  s = s.replace(/\b\d{3,}\b/g, ' ')

  // 7. Drop leftover processor punctuation.
  s = s.replace(/[*#]+/g, ' ')

  // 8. Collapse whitespace.
  s = s.replace(/\s{2,}/g, ' ').trim()

  // Never hand back nothing — if we stripped it to death, keep the original.
  if (!s) return toTitleCase(original)

  return toTitleCase(s)
}
