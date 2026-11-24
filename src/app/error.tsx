"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[evolnex] client error boundary", error.message);
  }, [error]);

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ textAlign: "center", alignItems: "center" }}>
        <div className="eyebrow">Something went wrong</div>
        <h1 style={{ fontSize: 23, fontWeight: 700 }}>We could not render this view</h1>
        <p className="small muted">
          Your saved data is safe. Retry the request — if the problem continues, sign out and back in to refresh your
          session.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <a href="/overview" className="small link">Return to dashboard</a>
      </div>
    </div>
  );
}
