import "@/styles/relay.css";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <main style={{ maxWidth: 520, margin: "0 auto", padding: "40px 16px" }}>{children}</main>;
}
