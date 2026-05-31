import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Holding = {
  securityName: string
  tickerSymbol: string | null
  quantity: number
  institutionValue: number
  accountName: string
}

function formatCAD(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n)
}

export function InvestmentsCard({ holdings }: { holdings: Holding[] }) {
  const total = holdings.reduce((s, h) => s + h.institutionValue, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-baseline">
          <span>Investments</span>
          {holdings.length > 0 && <span className="text-lg font-semibold">{formatCAD(total)}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {holdings.length === 0
          ? <p className="text-muted-foreground text-sm">No data yet — click Sync</p>
          : (
            <ul className="space-y-2">
              {holdings.map((h, i) => (
                <li key={i} className="flex justify-between items-start text-sm">
                  <div>
                    <p className="font-medium">{h.securityName}</p>
                    <p className="text-muted-foreground text-xs">
                      {h.quantity} shares · {h.accountName}
                      {h.tickerSymbol && <Badge variant="outline" className="ml-1 text-xs">{h.tickerSymbol}</Badge>}
                    </p>
                  </div>
                  <span className="font-medium ml-4">{formatCAD(h.institutionValue)}</span>
                </li>
              ))}
            </ul>
          )
        }
      </CardContent>
    </Card>
  )
}
