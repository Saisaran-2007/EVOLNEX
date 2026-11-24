import { eq } from "drizzle-orm";
import { db } from "@backend/db";
import {
  applicationEvents,
  applications,
  interviewQuestions,
  interviewSessions,
  jobAnalyses,
  profiles,
  projects,
  reminders,
  resumes,
  roadmapTasks,
  roadmaps,
  skills,
  users,
} from "@backend/db/schema";
import { ensureProfile, hashPassword } from "@backend/lib/auth";
import { SAMPLE_PROFILE, SAMPLE_SKILLS } from "@backend/lib/sampleData";

export const DEMO_EMAIL = "demo@evolnex.app";
export const DEMO_PASSWORD = "evolnex-demo";

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const daysAhead = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const RESUME_TEXT = `JORDAN ELLIS
Frontend Developer · jordan.ellis@example.com · Berlin, Germany

SUMMARY
Product-minded frontend developer with 3 years of experience building customer-facing web applications.
Comfortable across the stack with TypeScript, React, Next.js and Node.js. Strong CSS and accessibility fundamentals.

EXPERIENCE
Frontend Developer — Meridian Health (2023 - present)
- Built a patient scheduling dashboard in React and TypeScript used by 12,000 monthly users.
- Reduced initial load time by 38% through route-level code splitting and image optimisation.
- Built and documented a component library with Tailwind CSS, adopted by three product teams.
- Designed REST API contracts with the backend team and added integration tests.

Junior Developer — Cobalt Studio (2022 - 2023)
- Delivered marketing sites with Next.js, headless CMS and analytics instrumentation.
- Wrote SQL reporting queries in PostgreSQL for weekly client dashboards.

SKILLS
TypeScript, JavaScript, React, Next.js, Node.js, CSS, HTML, PostgreSQL, REST API, SQL, accessibility, unit testing`;

const DEMO_SKILLS = SAMPLE_SKILLS;

/**
 * Creates the demo account if missing and seeds a realistic workspace once.
 * Never touches other accounts and never deletes existing demo records.
 */
export async function ensureDemoUser() {
  const existing = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  let user = existing[0];

  if (!user) {
    const [created] = await db
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        fullName: "Jordan Ellis",
        passwordHash: hashPassword(DEMO_PASSWORD),
        emailVerifiedAt: new Date(),
        isDemo: true,
      })
      .returning();
    user = created;
    await ensureProfile(user.id);
  }

  const existingResumes = await db.select({ id: resumes.id }).from(resumes).where(eq(resumes.userId, user.id)).limit(1);
  if (!existingResumes[0]) {
    await seedWorkspace(user.id);
  }
  return user;
}

async function seedWorkspace(userId: number) {
  await db
    .update(profiles)
    .set({
      ...SAMPLE_PROFILE,
      preferences: { weeklyHours: 8, difficulty: "intermediate", locations: "Berlin / Remote EU", remoteOnly: true },
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, userId));

  await db
    .insert(skills)
    .values(DEMO_SKILLS.map((name) => ({ userId, name, source: "manual" as const })))
    .onConflictDoNothing();

  await db.insert(resumes).values({
    userId,
    filename: "Jordan-Ellis-2026.pdf",
    mimeType: "application/pdf",
    sizeBytes: 184_320,
    textContent: RESUME_TEXT,
    status: "processed",
    processingNote: "Extracted 12 skills from PDF resume.",
    extractedSkills: DEMO_SKILLS.slice(0, 12).map((name) => ({ name, source: "resume", category: "detected" })),
    isActive: true,
    createdAt: daysAgo(9),
  });

  const [analysis] = await db
    .insert(jobAnalyses)
    .values({
      userId,
      jobTitle: "Senior Full Stack Engineer",
      company: "Northwind Labs",
      jobDescription:
        "We are hiring a Senior Full Stack Engineer to own features end to end across our TypeScript, React and Node.js stack. You will design REST API contracts, model PostgreSQL schemas, containerise services with Docker, deploy on AWS and contribute to system design reviews. Experience with GraphQL, Redis and CI/CD pipelines is a plus.",
      fitScore: 64,
      matchedSkills: ["typescript", "react", "javascript", "next.js", "node.js", "postgresql", "rest api"],
      missingSkills: ["docker", "aws", "system design", "kubernetes", "ci/cd", "graphql"],
      partialSkills: ["redis", "unit testing"],
      recommendedSkills: ["docker", "system design", "aws", "ci/cd", "graphql"],
      readiness: "developing",
      summary:
        "Strong product-engineering match: TypeScript, React and PostgreSQL are already evidenced in your resume. The gap is infrastructure ownership — Docker, AWS and CI/CD — plus system design depth expected at senior level.",
      recommendations: [
        "Ship one Dockerised service with a CI/CD pipeline so deployment ownership is evidenced.",
        "Prepare two system-design walkthroughs (API scaling and schema modelling) with trade-offs.",
        "Add measurable AWS infrastructure work to the top third of your resume.",
      ],
      engine: "gemini",
      model: "gemini-2.0-flash",
      createdAt: daysAgo(6),
    })
    .returning();

  const [roadmap] = await db
    .insert(roadmaps)
    .values({
      userId,
      title: "Senior full-stack readiness plan",
      targetRole: "Senior Full Stack Engineer",
      summary:
        "An 6-week plan at roughly 8 focused hours per week to convert strong frontend signal into credible full-stack and infrastructure ownership.",
      estimatedWeeks: 6,
      focusSkills: ["docker", "system design", "aws", "ci/cd", "graphql"],
      analysisId: analysis.id,
      engine: "gemini",
      createdAt: daysAgo(5),
    })
    .returning();

  const taskSeed = [
    {
      week: 1,
      title: "Containerise an existing service with Docker",
      description: "Package the Meridian scheduling API and Next.js client into a multi-stage Docker build with a compose file for local development.",
      skill: "docker",
      resourceLabel: "Docker Getting Started",
      resourceUrl: "https://docs.docker.com/get-started/",
      exercise: "Commit a Dockerfile plus docker-compose.yml and document image size before/after.",
      durationHours: 4,
      completed: true,
    },
    {
      week: 1,
      title: "Add a CI pipeline with tests and image scan",
      description: "Automate lint, typecheck, unit tests and a container build for every pull request.",
      skill: "ci/cd",
      resourceLabel: "GitHub Actions Quickstart",
      resourceUrl: "https://docs.github.com/en/actions/quickstart",
      exercise: "Add a required status check and record the first green pipeline run.",
      durationHours: 3,
      completed: true,
    },
    {
      week: 2,
      title: "Design a scalable job-matching API",
      description: "Produce a system design document for a resume-to-job matching service: data model, queueing, caching and failure modes.",
      skill: "system design",
      resourceLabel: "System Design Primer",
      resourceUrl: "https://github.com/donnemartin/system-design-primer",
      exercise: "Write a 2-page design doc with a diagram and explicit trade-offs.",
      durationHours: 5,
      completed: false,
    },
    {
      week: 3,
      title: "Deploy to AWS with infrastructure as code",
      description: "Provision a containerised app on AWS (ECS Fargate or App Runner) using Terraform with remote state.",
      skill: "aws",
      resourceLabel: "AWS Skill Builder",
      resourceUrl: "https://skillbuilder.aws/",
      exercise: "Ship a public staging URL and add a rollback runbook.",
      durationHours: 6,
      completed: false,
    },
    {
      week: 4,
      title: "Add GraphQL in front of an existing REST service",
      description: "Model a schema for jobs and applications, then compare resolver performance with the REST endpoints.",
      skill: "graphql",
      resourceLabel: "GraphQL Learn",
      resourceUrl: "https://graphql.org/learn/",
      exercise: "Document latency differences and when you would choose GraphQL again.",
      durationHours: 5,
      completed: false,
    },
    {
      week: 5,
      title: "Senior-level mock interview loop",
      description: "Run a senior mock interview covering system design, TypeScript depth and behavioural ownership stories.",
      skill: "communication",
      resourceLabel: "EVOLNEX Mock Interview",
      resourceUrl: "/interview",
      exercise: "Complete one session and rewrite your two weakest answers.",
      durationHours: 2,
      completed: false,
    },
  ];

  await db.insert(roadmapTasks).values(
    taskSeed.map((task) => ({
      roadmapId: roadmap.id,
      userId,
      week: task.week,
      title: task.title,
      description: task.description,
      skill: task.skill,
      resourceLabel: task.resourceLabel,
      resourceUrl: task.resourceUrl,
      exercise: task.exercise,
      durationHours: task.durationHours,
      completed: task.completed,
      completedAt: task.completed ? daysAgo(3) : null,
    })),
  );

  await db.insert(projects).values([
    {
      userId,
      title: "Dockerised full-stack job tracker",
      description:
        "Full-stack application tracker with a Next.js client, Node API and PostgreSQL, packaged with compose and deployed through a CI/CD pipeline.",
      difficulty: "intermediate",
      requiredSkills: ["typescript", "docker", "ci/cd", "postgresql"],
      technologies: ["Next.js", "Node.js", "PostgreSQL", "Docker", "GitHub Actions"],
      outcome: "A public repo where one command runs the stack and every PR builds a verified image.",
      steps: [
        "Model applications and stage history.",
        "Build the API with validation and auth.",
        "Containerise both services with compose.",
        "Add CI with tests and a container scan.",
        "Deploy to a cloud host and document rollback.",
      ],
      status: "in_progress",
      engine: "gemini",
      createdAt: daysAgo(5),
      updatedAt: daysAgo(2),
    },
    {
      userId,
      title: "Accessible analytics dashboard",
      description:
        "Responsive analytics dashboard with filterable charts, keyboard navigation and a documented component library.",
      difficulty: "intermediate",
      requiredSkills: ["react", "typescript", "accessibility"],
      technologies: ["React", "TypeScript", "Tailwind CSS"],
      outcome: "A deployed dashboard with axe-clean accessibility and reusable chart primitives.",
      steps: [
        "Seed 500+ records and define the data contract.",
        "Build the layout shell and responsive breakpoints.",
        "Implement filterable charts with a table fallback.",
        "Fix keyboard and focus issues from an axe audit.",
        "Publish a README with screenshots.",
      ],
      status: "completed",
      engine: "local",
      createdAt: daysAgo(24),
      updatedAt: daysAgo(10),
    },
    {
      userId,
      title: "Resume-to-job matching service",
      description:
        "System-design showcase: a queue-backed matching service that scores resumes against job descriptions and caches embeddings.",
      difficulty: "advanced",
      requiredSkills: ["system design", "aws", "redis"],
      technologies: ["Node.js", "PostgreSQL", "Redis", "AWS"],
      outcome: "A design doc plus a working prototype with load-test numbers.",
      steps: [
        "Write the design doc with failure modes.",
        "Implement the ingest worker and matching endpoint.",
        "Add caching and measure hit rate.",
        "Load-test at 100 requests per second.",
        "Publish results and trade-offs.",
      ],
      status: "not_started",
      engine: "gemini",
      createdAt: daysAgo(4),
      updatedAt: daysAgo(4),
    },
  ]);

  const [session] = await db
    .insert(interviewSessions)
    .values({
      userId,
      role: "Senior Full Stack Engineer",
      difficulty: "senior",
      status: "completed",
      overallScore: 74,
      summary:
        "Across 3 evaluated answers your average is 74/100. Strongest signal: technical accuracy. Biggest lift available: completeness — finish answers with the measurable outcome.",
      strengths: ["Technical accuracy (81/100 average)", "Clarity (77/100 average)"],
      improvements: [
        "Finish answers with the measurable outcome or what you would do differently.",
        "Make trade-offs explicit: what you chose, what you rejected, and why.",
      ],
      engine: "gemini",
      createdAt: daysAgo(3),
      completedAt: daysAgo(3),
    })
    .returning();

  await db.insert(interviewQuestions).values([
    {
      sessionId: session.id,
      userId,
      position: 1,
      question: "Design a resume-to-job matching service. What are the core components and failure modes?",
      focus: "System design",
      answer:
        "I would split it into an ingest service that stores resumes and a matching endpoint. Resumes are parsed once and stored as structured skills in PostgreSQL, then scoring compares the skill set to the job description. To keep latency low I would cache the parsed representation and make matching asynchronous with a queue when the corpus is large. Main failure modes are parser failures on scanned PDFs, queue backlog during traffic spikes, and stale cache after a profile update. I would add a dead-letter queue, a cache invalidation hook, and monitor queue depth.",
      score: 76,
      scores: { relevance: 82, technical: 78, clarity: 74, communication: 72, problemSolving: 82, completeness: 66 },
      feedback:
        "Strong decomposition with explicit failure handling and monitoring. Completeness is the weakest dimension — you did not state expected latency or throughput targets.",
      improvements: ["Add concrete latency and throughput targets.", "Close with the measurable outcome."],
      answeredAt: daysAgo(3),
    },
    {
      sessionId: session.id,
      userId,
      position: 2,
      question: "Tell me about a project you owned end to end. What was your specific contribution and what outcome did you deliver?",
      focus: "Behavioural judgement",
      answer:
        "At Meridian Health I owned the patient scheduling dashboard end to end. I designed the API contract with the backend team, built the React and TypeScript interface, and set up component tests. The result was a dashboard used by 12,000 monthly users with a 38 percent faster initial load after code splitting. When the design changed late in the cycle, I negotiated a two-phase release so we could ship the booking flow first.",
      score: 81,
      scores: { relevance: 88, technical: 76, clarity: 84, communication: 86, problemSolving: 80, completeness: 78 },
      feedback:
        "Clear ownership with quantified outcomes and stakeholder negotiation. Technical depth is slightly thin — one sentence on the architecture decision would strengthen it.",
      improvements: ["Name one architectural trade-off you made.", "State what you would do differently now."],
      answeredAt: daysAgo(3),
    },
    {
      sessionId: session.id,
      userId,
      position: 3,
      question: "How would you diagnose and fix a page that feels slow for users on mid-range phones?",
      focus: "Frontend performance",
      answer:
        "I start with real-user metrics rather than synthetic scores, so I would look at field data broken down by device and route. Then I profile the bundle to see which dependencies dominate, check image sizes and fonts, and look for main-thread work like large hydration trees. The fix is usually a mix of route-level code splitting, image optimisation and deferring non-critical work. I verify with a before-and-after comparison and monitor the same metric after release.",
      score: 68,
      scores: { relevance: 78, technical: 72, clarity: 70, communication: 62, problemSolving: 70, completeness: 54 },
      feedback:
        "Correct investigation order and a sensible fix strategy. Completeness is low: no concrete before/after numbers and no prioritisation of which fix comes first.",
      improvements: ["Quantify the improvement you achieved.", "Explain how you prioritise competing optimisations."],
      answeredAt: daysAgo(3),
    },
  ]);

  const applicationSeed = [
    {
      company: "Northwind Labs",
      jobTitle: "Senior Full Stack Engineer",
      stage: "interview",
      jobUrl: "https://example.com/northwind/senior-fullstack",
      notes: "Third round is a system design panel with the platform lead. Prepare the matching-service design.",
      appliedAt: daysAgo(12),
      followUpAt: daysAhead(2),
      followUpNote: "Send the design doc summary before the panel.",
    },
    {
      company: "Signal Forge",
      jobTitle: "Platform Engineer",
      stage: "screening",
      jobUrl: "https://example.com/signal-forge/platform",
      notes: "Recruiter asked for AWS experience — roadmap week 3 covers this.",
      appliedAt: daysAgo(7),
      followUpAt: daysAhead(5),
      followUpNote: "Share Terraform repo once staging is live.",
    },
    {
      company: "Lumen Analytics",
      jobTitle: "Frontend Engineer",
      stage: "offer",
      jobUrl: "https://example.com/lumen/frontend",
      notes: "Offer received, deadline in 10 days. Negotiating remote allowance.",
      appliedAt: daysAgo(28),
      followUpAt: null,
      followUpNote: "",
    },
    {
      company: "Cobalt Studio",
      jobTitle: "Full Stack Developer",
      stage: "applied",
      jobUrl: "https://example.com/cobalt/fullstack",
      notes: "Referral from a former colleague.",
      appliedAt: daysAgo(4),
      followUpAt: daysAhead(6),
      followUpNote: "Ping the referral for a status update.",
    },
    {
      company: "Aster Health",
      jobTitle: "Software Engineer II",
      stage: "rejected",
      jobUrl: "",
      notes: "Rejected after the take-home. Feedback: strengthen testing narrative.",
      appliedAt: daysAgo(34),
      followUpAt: null,
      followUpNote: "",
    },
    {
      company: "Kite Robotics",
      jobTitle: "Product Engineer",
      stage: "interested",
      jobUrl: "https://example.com/kite/product-engineer",
      notes: "Interesting hardware-adjacent product work. Tailor a resume version with CI/CD evidence.",
      appliedAt: null,
      followUpAt: null,
      followUpNote: "",
    },
  ];

  for (const item of applicationSeed) {
    const [application] = await db
      .insert(applications)
      .values({
        userId,
        company: item.company,
        jobTitle: item.jobTitle,
        stage: item.stage,
        jobUrl: item.jobUrl,
        notes: item.notes,
        appliedAt: item.appliedAt,
        followUpAt: item.followUpAt,
        followUpNote: item.followUpNote,
        createdAt: item.appliedAt ?? daysAgo(2),
        updatedAt: daysAgo(1),
      })
      .returning();
    await db.insert(applicationEvents).values({
      applicationId: application.id,
      userId,
      fromStage: null,
      toStage: "interested",
      note: "Application added to tracker.",
      createdAt: item.appliedAt ?? daysAgo(2),
    });
    if (item.stage !== "interested") {
      await db.insert(applicationEvents).values({
        applicationId: application.id,
        userId,
        fromStage: "interested",
        toStage: item.stage,
        note: `Stage moved to ${item.stage}.`,
        createdAt: daysAgo(1),
      });
    }
    if (item.followUpAt) {
      await db.insert(reminders).values({
        userId,
        applicationId: application.id,
        title: `Follow up with ${item.company}`,
        dueAt: item.followUpAt,
        note: item.followUpNote,
      });
    }
  }
}
