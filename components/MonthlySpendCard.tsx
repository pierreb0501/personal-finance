import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatCAD(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n)
}

export function MonthlySpendCard({ total }: { total: number }) {
  const month = new Date().toLocaleString('en-CA', { month: 'long', year: 'numeric' })
  return (
    <Card>
      <CardHeader><CardTitle>Spent in {month}</CardTitle></CardHeader>
      <CardContent>
        {total === 0
          ? <p className="text-muted-foreground text-sm">No data yet — click Sync</p>
          : <p className="text-3xl font-bold">{formatCAD(total)}</p>
        }
      </CardContent>
    </Card>
  )
}
