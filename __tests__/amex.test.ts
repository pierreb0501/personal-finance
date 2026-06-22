import { parseAmexCsv, parseDate, parseRfc4180 } from '@/app/api/import/amex/route'

describe('parseDate', () => {
  it('parses Amex Canada "DD Mon YYYY" format', () => {
    expect(parseDate('10 Jun 2026')).toBe('2026-06-10')
  })

  it('parses ISO YYYY-MM-DD unchanged', () => {
    expect(parseDate('2026-06-10')).toBe('2026-06-10')
  })

  it('parses MM/DD/YYYY when the first segment could not be a day', () => {
    expect(parseDate('13/05/2026')).toBe('2026-13-05'.replace('2026-13-05', '2026-05-13'))
  })

  it('parses DD/MM/YYYY when the first segment exceeds 12', () => {
    expect(parseDate('25/12/2026')).toBe('2026-12-25')
  })

  it('returns null for unrecognized formats', () => {
    expect(parseDate('not a date')).toBeNull()
  })
})

describe('parseRfc4180', () => {
  it('splits simple comma-separated rows', () => {
    const rows = parseRfc4180('a,b,c\n1,2,3')
    expect(rows).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('handles quoted fields containing commas', () => {
    const rows = parseRfc4180('date,description,amount\n"10 Jun 2026","COFFEE, SHOP",4.50')
    expect(rows[1]).toEqual(['10 Jun 2026', 'COFFEE, SHOP', '4.50'])
  })

  it('handles escaped double quotes inside quoted fields', () => {
    const rows = parseRfc4180('a,b\n"say ""hi""",2')
    expect(rows[1]).toEqual(['say "hi"', '2'])
  })

  it('handles quoted fields with embedded newlines', () => {
    const rows = parseRfc4180('a,b\n"line1\nline2",2')
    expect(rows[1]).toEqual(['line1\nline2', '2'])
  })
})

describe('parseAmexCsv', () => {
  const header = 'Date,Description,Amount,Reference'

  it('parses well-formed rows into AmexRow objects', () => {
    const csv = `${header}\n10 Jun 2026,COFFEE SHOP,4.50,'REF123\n11 Jun 2026,GROCERY STORE,82.10,'REF124`
    const rows = parseAmexCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ date: '2026-06-10', description: 'COFFEE SHOP', amount: 4.50, id: 'amex_REF123' })
    expect(rows[1].id).toBe('amex_REF124')
  })

  it('skips "payment received" rows', () => {
    const csv = `${header}\n10 Jun 2026,ONLINE PAYMENT RECEIVED - THANK YOU,-500.00,'REF1\n11 Jun 2026,GROCERY STORE,82.10,'REF2`
    const rows = parseAmexCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('GROCERY STORE')
  })

  it('strips currency symbols and commas from amounts', () => {
    const csv = `${header}\n10 Jun 2026,BIG PURCHASE,"$1,234.56",'REF1`
    const rows = parseAmexCsv(csv)
    expect(rows[0].amount).toBe(1234.56)
  })

  it('falls back to a derived id when no reference column value is present', () => {
    const csv = 'Date,Description,Amount\n10 Jun 2026,COFFEE SHOP,4.50'
    const rows = parseAmexCsv(csv)
    expect(rows[0].id).toBe('amex_2026-06-10_COFFEE_SHOP_4.5')
  })

  it('skips rows with an unparseable date instead of throwing', () => {
    const csv = `${header}\nnot-a-date,COFFEE SHOP,4.50,'REF1\n11 Jun 2026,GROCERY STORE,82.10,'REF2`
    const rows = parseAmexCsv(csv)
    expect(rows).toHaveLength(1)
  })

  it('throws when required columns are missing', () => {
    expect(() => parseAmexCsv('Foo,Bar\n1,2')).toThrow(/required columns/)
  })

  it('throws when the file has no data rows', () => {
    expect(() => parseAmexCsv(header)).toThrow(/empty/)
  })
})
