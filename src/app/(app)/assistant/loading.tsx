export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading Kairos assistant"
      className="mx-auto max-w-[720px] space-y-6"
    >
      <header className="flex items-center gap-4">
        <div className="skeleton size-20 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="skeleton h-3 w-40 rounded" />
          <div className="skeleton h-7 w-48 rounded-lg" />
          <div className="skeleton h-4 w-full max-w-sm rounded" />
        </div>
      </header>
      <div className="skeleton h-32 rounded-2xl" />
      <div className="skeleton h-56 rounded-2xl" />
    </div>
  );
}
