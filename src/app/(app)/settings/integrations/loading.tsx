export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="subline" role="status">Loading integrations…</p>
      <div className="integration-grid" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div className="card integration-card" key={i} style={{ minHeight: 170, opacity: 0.5 }} />
        ))}
      </div>
    </div>
  );
}
