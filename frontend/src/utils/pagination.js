/**
 * Page numbers to show for numbered pagination: always the first and last page,
 * the current page with one neighbour each side, and 'gap' markers where pages
 * are skipped. A gap of exactly one page shows that page instead of an ellipsis.
 */
export function pageItems(current, totalPages, siblings = 1) {
  if (totalPages <= 0) return []
  const page = Math.min(Math.max(1, current), totalPages)
  const wanted = new Set([1, totalPages])
  for (let offset = -siblings; offset <= siblings; offset += 1) {
    const value = page + offset
    if (value >= 1 && value <= totalPages) wanted.add(value)
  }
  // Keep a compact, stable width near the edges (1 2 3 4 … 9).
  if (page <= 2 + siblings) for (let value = 2; value <= Math.min(totalPages, 3 + siblings); value += 1) wanted.add(value)
  if (page >= totalPages - 1 - siblings) for (let value = Math.max(1, totalPages - 2 - siblings); value < totalPages; value += 1) wanted.add(value)
  const sorted = [...wanted].sort((a, b) => a - b)
  const items = []
  sorted.forEach((value, index) => {
    const previous = sorted[index - 1]
    if (previous && value - previous === 2) items.push(previous + 1)
    else if (previous && value - previous > 2) items.push('gap')
    items.push(value)
  })
  return items
}
