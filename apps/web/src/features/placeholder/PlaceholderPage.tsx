export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text">{title}</h1>
      <p className="mt-1 text-sm text-muted">Coming soon.</p>
    </div>
  );
}
