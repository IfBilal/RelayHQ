export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="subline" role="status">Loading payments…</p>
      <div className="card panel" aria-hidden="true" style={{ minHeight: 160, opacity: 0.5 }} />
    </div>
  );
}
