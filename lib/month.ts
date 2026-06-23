// Resolves the year/month a page should render: from searchParams if present,
// otherwise the current month. Shared by every month-aware page so "what
// month am I on" is parsed the same way everywhere.
export function parseMonthParams(params: { year?: string; month?: string }): { year: number; month: number } {
  const now = new Date()
  const year = params.year ? Number(params.year) : now.getFullYear()
  const month = params.month ? Number(params.month) : now.getMonth() + 1
  return { year, month }
}
