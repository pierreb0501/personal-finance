import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Snapshot = {
  date: string
  netWorth: number
}

type Props = {
  latest: Snapshot | null
  history: Snapshot[]
}

function formatCAD(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n)
}

export function NetWorthCard({ latest, history }: Props) {
  if (!latest) {
    return (
      <Card>
        <CardHeader><CardTitle>Net Worth</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground text-sm">No data yet — click Sync</CardContent>
      </Card>
    )
  }

  const trend = history.length >= 2
    ? latest.netWorth - history[0].netWorth
    : null

  return (
    <Card>
      <CardHeader><CardTitle>Net Worth</CardTitle></CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{formatCAD(latest.netWorth)}</p>
        {trend !== null && (
          <p className={`text-sm mt-1 ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend >= 0 ? '+' : ''}{formatCAD(trend)} (30 days)
          </p>
        )}
      </CardContent>
    </Card>
  )
}
