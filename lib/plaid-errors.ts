// Plain-English explanations for the Plaid error codes that put an item into a
// non-ok state. Pure + dependency-free so it's safe to import in client
// components (unlike lib/plaid.ts, which constructs the server SDK client).
const PLAID_ERROR_REASONS: Record<string, string> = {
  ITEM_LOGIN_REQUIRED:
    'The institution ended the connection — usually a password change or a third-party access limit. Reconnect to restore it.',
  PENDING_EXPIRATION:
    'Your authorization is about to expire. Reconnect to renew it before it lapses.',
  PENDING_DISCONNECT:
    'The institution is dropping this connection. Reconnect to keep it alive.',
  USER_PERMISSION_REVOKED:
    'Access was revoked at the institution. Reconnect to re-grant permission.',
  USER_ACCOUNT_REVOKED:
    'The institution revoked this account. Reconnect to re-grant access.',
  INSTITUTION_DOWN:
    'The institution is temporarily unavailable. This usually clears on its own — no action needed.',
  INSTITUTION_NOT_RESPONDING:
    'The institution is not responding right now. This usually clears on its own.',
  INSTITUTION_NO_LONGER_SUPPORTED:
    'This institution is no longer supported by the data provider. Reconnecting may not help.',
}

// Human-readable reason for a stored Plaid error_code. Falls back to the raw
// code (so an unmapped code is still visible) or a generic line when null.
export function describePlaidError(errorCode: string | null | undefined): string {
  if (!errorCode) return 'The connection needs attention.'
  return PLAID_ERROR_REASONS[errorCode] ?? `Connection error (${errorCode}).`
}
