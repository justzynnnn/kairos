export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading planner"
      className="page-stack planner-page"
    >
      <header className="page-header">
        <div className="space-y-2">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-7 w-40 rounded-lg" />
          <div className="skeleton h-4 w-72 max-w-full rounded" />
        </div>
      </header>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-9 w-20 rounded-full" />
        ))}
      </div>
      <div className="skeleton h-[28rem] rounded-2xl" />
    </div>
  );
}
