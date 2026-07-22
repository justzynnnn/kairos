export default function Loading() {
  return (
    <div role="status" aria-label="Loading settings" className="space-y-4">
      <div className="skeleton h-6 w-40 rounded-lg" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-24 rounded-2xl" />
      ))}
    </div>
  );
}
