import { normalizeMerchantName } from '@/lib/normalize'

describe('normalizeMerchantName', () => {
  it('returns null for empty / nullish input', () => {
    expect(normalizeMerchantName(null)).toBeNull()
    expect(normalizeMerchantName(undefined)).toBeNull()
    expect(normalizeMerchantName('')).toBeNull()
    expect(normalizeMerchantName('   ')).toBeNull()
  })

  it('strips known processor prefixes but keeps the merchant', () => {
    expect(normalizeMerchantName('SQ *BLUE BOTTLE')).toBe('Blue Bottle')
    expect(normalizeMerchantName('TST* THE DEPANNEUR')).toBe('The Depanneur')
    expect(normalizeMerchantName('PAYPAL *STEAMGAMES')).toBe('Steamgames')
  })

  it('does NOT strip a real merchant that merely contains "*" (e.g. Uber)', () => {
    // UBER is not a wrapper prefix — "EATS" must survive.
    expect(normalizeMerchantName('UBER* EATS')).toBe('Uber Eats')
    expect(normalizeMerchantName('UBER *TRIP')).toBe('Uber Trip')
  })

  it('strips trailing Canadian province and country codes', () => {
    expect(normalizeMerchantName('BLUE BOTTLE MONTREAL QC')).toBe('Blue Bottle Montreal')
    expect(normalizeMerchantName('SOME SHOP TORONTO ON CA')).toBe('Some Shop Toronto')
  })

  it('strips store / reference numbers and numeric runs', () => {
    expect(normalizeMerchantName('WAL-MART #1234')).toBe('Wal-Mart')
    expect(normalizeMerchantName('SQ *BLUE BOTTLE 3491 MONTREAL QC')).toBe('Blue Bottle Montreal')
    expect(normalizeMerchantName('COSTCO STORE #07 ANJOU')).toBe('Costco Anjou')
  })

  it('strips domains and url noise', () => {
    expect(normalizeMerchantName('AMAZON.COM*A12B3')).toBe('Amazon')
    expect(normalizeMerchantName('NETFLIX.COM')).toBe('Netflix')
  })

  it('title-cases a clean all-caps descriptor', () => {
    expect(normalizeMerchantName('HYDRO QUEBEC')).toBe('Hydro Quebec')
  })

  it('is stable: normalizing its own output is a no-op', () => {
    const once = normalizeMerchantName('SQ *BLUE BOTTLE 3491 MONTREAL QC')
    expect(normalizeMerchantName(once)).toBe(once)
  })

  it('falls back to the (title-cased) original if cleaning empties it', () => {
    expect(normalizeMerchantName('12345')).toBe('12345')
    expect(normalizeMerchantName('#999')).toBe('#999')
  })
})
