import { aiFailurePayload, generateValidatedJson } from "@backend/lib/ai/gemini";
import { normalizeSkillList, skillLabel } from "@backend/lib/skills";

export type ProjectDraft = {
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  requiredSkills: string[];
  technologies: string[];
  outcome: string;
  steps: string[];
};

export type ProjectOutcome = {
  projects: ProjectDraft[];
  engine: "gemini" | "local";
  warning: string | null;
};

const TRACK_TEMPLATES: Array<{
  match: RegExp;
  projects: ProjectDraft[];
}> = [
  {
    match: /(frontend|front-end|react|ui|ux|web)/,
    projects: [
      {
        title: "Accessible analytics dashboard",
        description:
          "Build a responsive analytics dashboard with filterable charts, keyboard navigation and a documented component library.",
        difficulty: "intermediate",
        requiredSkills: ["react", "typescript", "accessibility"],
        technologies: ["React", "TypeScript", "Tailwind CSS"],
        outcome: "A deployed dashboard plus a reusable component library with accessibility notes in the README.",
        steps: [
          "Define the data contract and seed a local dataset of 500+ records.",
          "Build layout shell, sidebar and responsive breakpoints.",
          "Implement filterable charts with an accessible data table fallback.",
          "Add keyboard navigation, focus states and axe audit fixes.",
          "Write a README with screenshots, trade-offs and next steps.",
        ],
      },
      {
        title: "Real-time collaborative notes",
        description:
          "Ship a multiplayer notes app with optimistic updates, presence indicators and conflict handling.",
        difficulty: "advanced",
        requiredSkills: ["react", "websockets", "state management"],
        technologies: ["Next.js", "PostgreSQL", "WebSockets"],
        outcome: "A public demo where two browsers can edit the same document without data loss.",
        steps: [
          "Model documents, revisions and collaborators.",
          "Implement the editor with optimistic local writes.",
          "Add a websocket layer for broadcast and presence.",
          "Handle reconnect and conflicting edits deterministically.",
          "Add an automated multi-client test.",
        ],
      },
    ],
  },
  {
    match: /(backend|api|server|node|python|java|go)/,
    projects: [
      {
        title: "Production-grade REST API with observability",
        description:
          "Design a resource-oriented API with auth, validation, pagination, idempotency and structured logging.",
        difficulty: "intermediate",
        requiredSkills: ["rest api", "postgresql", "unit testing"],
        technologies: ["Node.js or FastAPI", "PostgreSQL", "Docker"],
        outcome: "A documented API with OpenAPI schema, seeded data and load-test results.",
        steps: [
          "Model the domain and write migration scripts.",
          "Implement auth, validation and consistent error envelopes.",
          "Add pagination, filtering and idempotency keys.",
          "Write integration tests covering failure paths.",
          "Add structured logs and a health endpoint.",
        ],
      },
      {
        title: "Event-driven job pipeline",
        description:
          "Build a queue-backed worker system that ingests jobs, retries failures and exposes pipeline metrics.",
        difficulty: "advanced",
        requiredSkills: ["queues", "docker", "observability"],
        technologies: ["Redis or SQS", "Docker", "PostgreSQL"],
        outcome: "A demo showing retries, dead-letter handling and a metrics dashboard.",
        steps: [
          "Define the job envelope and idempotency strategy.",
          "Implement producer and worker with backoff retries.",
          "Add dead-letter handling and replay tooling.",
          "Instrument throughput, latency and failure metrics.",
          "Document operating limits in a runbook.",
        ],
      },
    ],
  },
  {
    match: /(data|ml|machine learning|ai|analyst|scientist)/,
    projects: [
      {
        title: "End-to-end churn prediction service",
        description:
          "Train, evaluate and serve a churn model with a reproducible pipeline and an interactive exploration notebook.",
        difficulty: "advanced",
        requiredSkills: ["python", "pandas", "scikit-learn"],
        technologies: ["Python", "scikit-learn", "FastAPI"],
        outcome: "A scored model card, evaluation notebook and a small prediction API.",
        steps: [
          "Clean and document the dataset, including leakage checks.",
          "Establish a baseline and iterate with feature engineering.",
          "Evaluate with precision/recall trade-offs and explain the choice.",
          "Package the model behind a prediction endpoint.",
          "Write a model card covering limitations and monitoring.",
        ],
      },
      {
        title: "LLM-powered document assistant",
        description:
          "Build a retrieval-augmented assistant over a document set, with citations and evaluation of answer quality.",
        difficulty: "intermediate",
        requiredSkills: ["python", "llm", "nlp"],
        technologies: ["Python", "Vector store", "Streaming UI"],
        outcome: "A working assistant with cited answers and a small evaluation suite.",
        steps: [
          "Chunk and embed the documents into a vector store.",
          "Implement retrieval with metadata filters.",
          "Generate cited answers and handle the no-context case.",
          "Build a 20-question evaluation set and record scores.",
          "Publish a demo with cost and latency notes.",
        ],
      },
    ],
  },
  {
    match: /(devops|cloud|platform|sre|infrastructure)/,
    projects: [
      {
        title: "One-command cloud deployment platform",
        description: "Containerise an app and deploy it with infrastructure-as-code, CI/CD and rollback.",
        difficulty: "intermediate",
        requiredSkills: ["docker", "ci/cd", "terraform"],
        technologies: ["Docker", "GitHub Actions", "Terraform"],
        outcome: "A repository where one command provisions and deploys the stack reproducibly.",
        steps: [
          "Containerise the app with a multi-stage build.",
          "Write infrastructure as code with remote state.",
          "Add a CI pipeline with tests and image scanning.",
          "Implement health checks and zero-downtime rollout.",
          "Document rollback and cost estimates.",
        ],
      },
    ],
  },
];

const GENERIC: ProjectDraft[] = [
  {
    title: "Career intelligence mini-app",
    description:
      "Build a small full-stack app that stores a user profile, computes a match score against pasted job descriptions and charts progress over time.",
    difficulty: "beginner",
    requiredSkills: ["javascript", "rest api", "sql"],
    technologies: ["Next.js or React", "PostgreSQL", "Tailwind CSS"],
    outcome: "A deployed app with auth, persistence and one real analytics view.",
    steps: [
      "Model users, skills and saved job descriptions.",
      "Build CRUD APIs with validation.",
      "Add the score comparison view.",
      "Persist history and chart it.",
      "Write a README explaining architecture decisions.",
    ],
  },
  {
    title: "Interview question bank with spaced repetition",
    description:
      "Create a personal interview prep tool with question banks, confidence scoring and a daily review queue.",
    difficulty: "intermediate",
    requiredSkills: ["typescript", "database design", "unit testing"],
    technologies: ["TypeScript", "PostgreSQL", "Testing library"],
    outcome: "A daily-use study tool with persisted progress and tests for the scheduler.",
    steps: [
      "Design the question, attempt and review tables.",
      "Implement a spaced-repetition scheduler.",
      "Build the review UI and keyboard shortcuts.",
      "Add tests for scheduling edge cases.",
      "Ship a lightweight analytics view of recall accuracy.",
    ],
  },
];

export function localProjects(input: {
  targetRole: string;
  currentSkills: string[];
  missingSkills: string[];
}): ProjectDraft[] {
  const role = input.targetRole.toLowerCase();
  const template = TRACK_TEMPLATES.find((entry) => entry.match.test(role));
  const base = template ? template.projects : GENERIC;
  const extra = normalizeSkillList(input.missingSkills).slice(0, 3).map(skillLabel);
  return base.slice(0, 4).map((project, index) => ({
    ...project,
    requiredSkills: normalizeSkillList([...project.requiredSkills, ...input.missingSkills.slice(0, 2)]),
    steps: [...project.steps, extra.length && index === 0 ? `Stretch: introduce ${extra.join(", ")} to close a saved skill gap.` : ""].filter(
      Boolean,
    ) as string[],
  }));
}

function coerceProjects(raw: unknown): ProjectDraft[] {
  const value = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(raw) ? raw : Array.isArray(value.projects) ? value.projects : [];
  const projects = list
    .map((item) => {
      const project = (item ?? {}) as Record<string, unknown>;
      const title = typeof project.title === "string" ? project.title.trim().slice(0, 160) : "";
      if (!title) return null;
      const difficultyRaw = String(project.difficulty ?? "intermediate").toLowerCase();
      const difficulty = (["beginner", "intermediate", "advanced"] as const).includes(
        difficultyRaw as "beginner",
      )
        ? (difficultyRaw as "beginner" | "intermediate" | "advanced")
        : "intermediate";
      return {
        title,
        description: typeof project.description === "string" ? project.description.slice(0, 900) : "",
        difficulty,
        requiredSkills: normalizeSkillList(project.requiredSkills).slice(0, 8),
        technologies: normalizeSkillList(project.technologies).slice(0, 8),
        outcome: typeof project.outcome === "string" ? project.outcome.slice(0, 500) : "",
        steps: Array.isArray(project.steps)
          ? project.steps.filter((step): step is string => typeof step === "string").slice(0, 8)
          : [],
      } satisfies ProjectDraft;
    })
    .filter((item): item is ProjectDraft => Boolean(item))
    .slice(0, 4);
  if (projects.length === 0) throw new Error("No projects");
  return projects;
}

export async function generateProjects(input: {
  targetRole: string;
  currentSkills: string[];
  missingSkills: string[];
  interests: string;
  startIndex: number;
}): Promise<ProjectOutcome> {
  const system = [
    "You are EVOLNEX, a staff engineer who designs portfolio projects that get candidates hired.",
    "Recommend exactly 3 projects, scoped to 1-3 weeks each, emphasising the candidate's missing skills.",
    "Respond with JSON only:",
    '{ "projects": [{ "title": string, "description": string, "difficulty": "beginner"|"intermediate"|"advanced", "requiredSkills": string[], "technologies": string[], "outcome": string, "steps": string[] }] }',
  ].join("\n");

  const prompt = [
    `Target role: ${input.targetRole || "software engineer"}`,
    `Current skills: ${input.currentSkills.join(", ") || "unknown"}`,
    `Skills to close: ${input.missingSkills.join(", ") || "none recorded"}`,
    input.interests ? `Interests: ${input.interests}` : "",
    input.startIndex > 0 ? "Provide fresh ideas different from a standard CRUD tutorial." : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = await generateValidatedJson({
      system,
      prompt,
      validate: (raw) => ({ projects: coerceProjects(raw) }),
    });
    return { projects: ai.data.projects, engine: "gemini", warning: null };
  } catch (error) {
    return {
      projects: localProjects(input),
      engine: "local",
      warning: `${aiFailurePayload(error).message} These recommendations come from the EVOLNEX rules-based project library matched to your role and skills — not from AI.`,
    };
  }
}
