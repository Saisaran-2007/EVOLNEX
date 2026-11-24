import { Suspense } from "react";
import { VerifyEmailForm } from "@frontend/components/AuthForms";

export const metadata = { title: "Verify email · EVOLNEX" };

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="auth-screen"><div className="skeleton" style={{ width: 400, height: 320 }} /></div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
