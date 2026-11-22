interface AdminPlaceholderPageProps {
  title: string
}

export function AdminPlaceholderPage({ title }: AdminPlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <div className="border border-border bg-surface p-8 rounded-2xl space-y-4">
        <div className="space-y-1">
          <p className="text-xs uppercase font-extrabold tracking-widest text-accent">
            Under Development
          </p>
          <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
        </div>
        <p className="text-muted text-sm leading-relaxed max-w-xl">
          Coming next. This administrative view is staged for the upcoming phase of management tools.
        </p>
        <div className="pt-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
            Coming next
          </span>
        </div>
      </div>
    </div>
  )
}
