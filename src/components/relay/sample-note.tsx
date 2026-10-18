export function SampleNote({ children = "SAMPLE DATA · Not connected to live records yet" }: { children?: React.ReactNode }) {
  return <div className="content-header-note">{children}</div>;
}
