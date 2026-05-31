import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCAD } from '@/lib/format'

type Category = { category: string; total: number }

function formatCategory(raw: string) {
  return raw.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export function CategoryBreakdownCard({ categories }: { categories: Category[] }) {
  const grandTotal = categories.reduce((s, c) => s + c.total, 0)

  return (
    <Card>
      <CardHeader><CardTitle>Spending by Category</CardTitle></CardHeader>
      <CardContent>
        {categories.length === 0
          ? <p className="text-muted-foreground text-sm">No data yet — click Sync</p>
          : (
            <ul className="space-y-2">
              {categories.map((cat) => (
                <li key={cat.category} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-0.5">
                      <span>{formatCategory(cat.category)}</span>
                      <span className="font-medium">{formatCAD(cat.total)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${(cat.total / grandTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </CardContent>
    </Card>
  )
}
