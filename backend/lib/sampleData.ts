import type { ProfileFields } from "@backend/lib/resumeProfile";

/**
 * Values the sample workspace is seeded with (see seed.ts).
 *
 * Kept in one place so a real resume upload can recognise these as sample data
 * — not something the user typed — and replace them.
 */
export const SAMPLE_PROFILE: ProfileFields = {
  fullName: "Jordan Ellis",
  contactEmail: "jordan.ellis@example.com",
  currentTitle: "Frontend Developer",
  yearsExperience: 3,
  education: "BSc Computer Science, Technical University of Berlin",
  targetRole: "Senior Full Stack Engineer",
  interests: "Developer tooling, design systems, applied AI in product workflows",
  summary:
    "Product-minded frontend developer moving toward full-stack ownership. I care about accessible interfaces, clear API contracts and measurable outcomes. Currently closing gaps in containerisation, cloud infrastructure and system design.",
};

export const SAMPLE_SKILLS = [
  "typescript",
  "javascript",
  "react",
  "next.js",
  "node.js",
  "css",
  "html",
  "postgresql",
  "rest api",
  "sql",
  "unit testing",
  "accessibility",
];
