import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ textAlign: "center", alignItems: "center" }}>
        <div className="eyebrow">404 · Not found</div>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>This page is not part of your workspace</h1>
        <p className="small muted">
          The page you requested does not exist. Head back to your career dashboard or the public site.
        </p>
        <div className="row" style={{ gap: 10, justifyContent: "center" }}>
          <Link href="/overview" className="btn btn-primary">Open workspace</Link>
          <Link href="/" className="btn">Home</Link>
        </div>
      </div>
    </div>
  );
}
