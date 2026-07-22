export default function Loading() {
  return (
    <div role="status" aria-label="Loading inbox" className="page-stack">
      <header className="page-header">
        <div className="space-y-2">
          <div className="skeleton h-3 w-28 rounded" />
          <div className="skeleton h-7 w-32 rounded-lg" />
          <div className="skeleton h-4 w-80 max-w-full rounded" />
        </div>
      </header>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton size-11 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-4 w-40 max-w-full rounded" />
              <div className="skeleton h-3 w-64 max-w-full rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
