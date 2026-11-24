import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "EVOLNEX — AI Career Intelligence Platform",
  description:
    "EVOLNEX turns your resume, skills and target roles into a measurable career plan: job-fit intelligence, learning roadmaps, portfolio projects, mock interviews and application tracking.",
  applicationName: "EVOLNEX",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
