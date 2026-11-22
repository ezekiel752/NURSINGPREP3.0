export function formatPaidDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '-'
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d)
  } catch {
    return '-'
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '-'
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d)
  } catch {
    return '-'
  }
}

export function formatAmount(minor: number | string | undefined, currency = 'NGN'): string {
  const minorNum = Number(minor || 0)
  const major = minorNum / 100
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency || 'NGN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major)
  } catch {
    return `₦${major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}
