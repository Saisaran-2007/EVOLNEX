import { aiFailurePayload, generateValidatedJson } from "@backend/lib/ai/gemini";
import { clamp } from "@backend/lib/api";
import { normalizeSkillList, skillLabel } from "@backend/lib/skills";

export type RoadmapTaskDraft = {
  title: string;
  description: string;
  skill: string;
  resourceLabel: string;
  resourceUrl: string;
  exercise: string;
  durationHours: number;
};

export type RoadmapWeekDraft = { week: number; theme: string; tasks: RoadmapTaskDraft[] };

export type RoadmapPlan = {
  title: string;
  summary: string;
  estimatedWeeks: number;
  focusSkills: string[];
  weeks: RoadmapWeekDraft[];
};

export type RoadmapOutcome = RoadmapPlan & { engine: "gemini" | "local"; warning: string | null };

const RESOURCES: Record<string, { label: string; url: string }> = {
  javascript: { label: "MDN JavaScript Guide", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide" },
  typescript: { label: "TypeScript Handbook", url: "https://www.typescriptlang.org/docs/handbook/intro.html" },
  react: { label: "React Learn", url: "https://react.dev/learn" },
  "next.js": { label: "Next.js Learn", url: "https://nextjs.org/learn" },
  python: { label: "Python Tutorial", url: "https://docs.python.org/3/tutorial/" },
  fastapi: { label: "FastAPI Tutorial", url: "https://fastapi.tiangolo.com/tutorial/" },
  django: { label: "Django Tutorial", url: "https://docs.djangoproject.com/en/stable/intro/tutorial01/" },
  postgresql: { label: "PostgreSQL Tutorial", url: "https://www.postgresql.org/docs/current/tutorial.html" },
  sql: { label: "SQLBolt", url: "https://sqlbolt.com/" },
  mongodb: { label: "MongoDB University", url: "https://learn.mongodb.com/" },
  docker: { label: "Docker Getting Started", url: "https://docs.docker.com/get-started/" },
  kubernetes: { label: "Kubernetes Basics", url: "https://kubernetes.io/docs/tutorials/kubernetes-basics/" },
  aws: { label: "AWS Skill Builder", url: "https://skillbuilder.aws/" },
  "system design": { label: "System Design Primer", url: "https://github.com/donnemartin/system-design-primer" },
  "data structures": { label: "NeetCode Roadmap", url: "https://neetcode.io/roadmap" },
  algorithms: { label: "NeetCode Roadmap", url: "https://neetcode.io/roadmap" },
  "machine learning": { label: "Google ML Crash Course", url: "https://developers.google.com/machine-learning/crash-course" },
  pandas: { label: "pandas User Guide", url: "https://pandas.pydata.org/docs/user_guide/index.html" },
  graphql: { label: "GraphQL Learn", url: "https://graphql.org/learn/" },
  "rest api": { label: "MDN HTTP Overview", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview" },
  "ci/cd": { label: "GitHub Actions Quickstart", url: "https://docs.github.com/en/actions/quickstart" },
  "github actions": { label: "GitHub Actions Docs", url: "https://docs.github.com/en/actions" },
  playwright: { label: "Playwright Docs", url: "https://playwright.dev/docs/intro" },
  jest: { label: "Jest Docs", url: "https://jestjs.io/docs/getting-started" },
  "tailwind css": { label: "Tailwind CSS Docs", url: "https://tailwindcss.com/docs/utility-first" },
  graphql2: { label: "GraphQL", url: "https://graphql.org/learn/" },
  linux: { label: "Linux Journey", url: "https://linuxjourney.com/" },
  observability: { label: "OpenTelemetry Docs", url: "https://opentelemetry.io/docs/" },
  redis: { label: "Redis University", url: "https://university.redis.io/" },
  nlp: { label: "Hugging Face NLP Course", url: "https://huggingface.co/learn/nlp-course" },
  llm: { label: "Prompt Engineering Guide", url: "https://www.promptingguide.ai/" },
  accessibility: { label: "web.dev Accessibility", url: "https://web.dev/learn/accessibility" },
  communication: { label: "Interview communication guide", url: "https://www.themuse.com/advice/interview-questions-and-answers" },
  leadership: { label: "Engineering leadership reading list", url: "https://github.com/karlhughes/awesome-engineering-management" },
};

function resourcesFor(skill: string) {
  return (
    RESOURCES[skill] ?? {
      label: `${skillLabel(skill)} — official documentation & guides`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${skillLabel(skill)} tutorial for developers`)}`,
    }
  );
}

function roleFundamentals(targetRole: string): string[] {
  const role = targetRole.toLowerCase();
  if (/(data|ml|machine learning|ai)/.test(role)) return ["python", "sql", "pandas", "machine learning", "data visualization"];
  if (/(frontend|front-end|react|ui|web)/.test(role)) return ["javascript", "typescript", "react", "css", "unit testing"];
  if (/(backend|api|server|node|python developer)/.test(role)) return ["rest api", "sql", "postgresql", "docker", "unit testing"];
  if (/(devops|platform|sre|cloud)/.test(role)) return ["linux", "docker", "kubernetes", "ci/cd", "terraform"];
  if (/(full.?stack)/.test(role)) return ["typescript", "react", "rest api", "postgresql", "docker"];
  return ["typescript", "react", "rest api", "system design", "communication"];
}

export function localRoadmap(input: {
  targetRole: string;
  missingSkills: string[];
  currentSkills: string[];
  weeklyHours: number;
}): RoadmapPlan {
  const missing = normalizeSkillList(input.missingSkills);
  const focus = (missing.length ? missing : roleFundamentals(input.targetRole)).slice(0, 6);
  const weekly = clamp(input.weeklyHours || 6, 2, 40);
  const tasks: RoadmapTaskDraft[] = [];

  focus.forEach((skill, index) => {
    const resource = resourcesFor(skill);
    const label = skillLabel(skill);
    const foundational = index < Math.ceil(focus.length / 2);
    tasks.push({
      title: `${foundational ? "Build fundamentals in" : "Go deep on"} ${label}`,
      description: `Study the core mental model of ${label} and document where it fits into the ${input.targetRole || "target role"} stack. Take structured notes you can reuse in interviews.`,
      skill,
      resourceLabel: resource.label,
      resourceUrl: resource.url,
      exercise: `Write a one-page explainer of ${label} with a working example, then add it to your notes repository.`,
      durationHours: clamp(Math.round(weekly / 2), 2, 8),
    });
    tasks.push({
      title: `Ship a scoped feature using ${label}`,
      description: `Apply ${label} in a small, complete feature so the skill becomes portfolio evidence instead of trivia.`,
      skill,
      resourceLabel: "Project brief · EVOLNEX Project Lab",
      resourceUrl: "/projects",
      exercise: `Extend one Project Lab build with a ${label} feature, commit it, and write a short README section explaining the trade-offs.`,
      durationHours: clamp(Math.round(weekly / 2), 2, 8),
    });
  });

  tasks.push({
    title: "Mock interview using the new stack",
    description: `Run a ${input.targetRole || "target role"} mock interview at the difficulty you will actually face, then tighten the weakest dimension in the report.`,
    skill: "communication",
    resourceLabel: "EVOLNEX Mock Interview",
    resourceUrl: "/interview",
    exercise: "Complete one mock interview session and rewrite your two weakest answers.",
    durationHours: 2,
  });
  tasks.push({
    title: "Refresh your resume and re-run job-fit analysis",
    description:
      "Add the shipped evidence from this roadmap to your resume, re-extract your skills, and measure the change in fit against your saved target role.",
    skill: "career positioning",
    resourceLabel: "Job-fit analysis",
    resourceUrl: "/skills",
    exercise: "Re-run job-fit analysis and record the score delta in your application notes.",
    durationHours: 1,
  });

  const estimatedWeeks = clamp(Math.ceil(tasks.length / 2), 3, 12);
  const weeks: RoadmapWeekDraft[] = Array.from({ length: estimatedWeeks }, (_, index) => ({
    week: index + 1,
    theme: "",
    tasks: [],
  }));
  tasks.forEach((task, index) => {
    const weekIndex = Math.min(estimatedWeeks - 1, Math.floor((index * estimatedWeeks) / tasks.length));
    weeks[weekIndex].tasks.push(task);
  });

  return {
    title: `${input.targetRole || "Career"} growth roadmap`,
    summary: `A ${estimatedWeeks}-week plan at roughly ${weekly} focused hours per week, sequenced around ${focus
      .map(skillLabel)
      .join(", ")}. Built from your saved skill gaps${missing.length ? "" : " (default role fundamentals — run a job-fit analysis for a sharper plan)"}.`,
    estimatedWeeks,
    focusSkills: focus,
    weeks: weeks.map((week) => ({ ...week, theme: week.tasks[0] ? `Focus: ${skillLabel(week.tasks[0].skill)}` : "Consolidation" })),
  };
}

function coercePlan(raw: unknown, fallbackFocus: string[]): RoadmapPlan {
  const value = (raw ?? {}) as Record<string, unknown>;
  const rawWeeks = Array.isArray(value.weeks) ? value.weeks : [];
  const weeks: RoadmapWeekDraft[] = rawWeeks
    .map((weekRaw, index) => {
      const week = (weekRaw ?? {}) as Record<string, unknown>;
      const tasksRaw = Array.isArray(week.tasks) ? week.tasks : [];
      const tasks: RoadmapTaskDraft[] = tasksRaw
        .map((taskRaw) => {
          const task = (taskRaw ?? {}) as Record<string, unknown>;
          const title = typeof task.title === "string" ? task.title.trim().slice(0, 200) : "";
          if (!title) return null;
          const skill = normalizeSkillList([task.skill])[0] ?? "general";
          const resource = resourcesFor(skill);
          return {
            title,
            description: typeof task.description === "string" ? task.description.slice(0, 900) : "",
            skill,
            resourceLabel: typeof task.resourceLabel === "string" && task.resourceLabel.trim() ? task.resourceLabel.slice(0, 160) : resource.label,
            resourceUrl: typeof task.resourceUrl === "string" && /^https?:\/\//.test(task.resourceUrl) ? task.resourceUrl : resource.url,
            exercise: typeof task.exercise === "string" ? task.exercise.slice(0, 600) : "",
            durationHours: clamp(Number(task.durationHours ?? 3), 1, 20),
          } satisfies RoadmapTaskDraft;
        })
        .filter((task): task is RoadmapTaskDraft => Boolean(task))
        .slice(0, 5);
      return { week: index + 1, theme: typeof week.theme === "string" ? week.theme.slice(0, 120) : "Focus block", tasks };
    })
    .filter((week) => week.tasks.length > 0)
    .slice(0, 12);

  if (weeks.length === 0) throw new Error("Roadmap had no tasks");
  const focusSkills = normalizeSkillList(value.focusSkills);
  return {
    title: typeof value.title === "string" && value.title.trim() ? value.title.slice(0, 160) : "Personalised learning roadmap",
    summary: typeof value.summary === "string" ? value.summary.slice(0, 1200) : "",
    estimatedWeeks: weeks.length,
    focusSkills: focusSkills.length ? focusSkills : fallbackFocus,
    weeks,
  };
}

export async function generateRoadmap(input: {
  targetRole: string;
  missingSkills: string[];
  currentSkills: string[];
  weeklyHours: number;
  summary: string;
}): Promise<RoadmapOutcome> {
  const system = [
    "You are EVOLNEX, a senior engineering mentor who writes focused, realistic learning roadmaps.",
    "Rules: 4 to 8 weeks maximum, 1-3 concrete tasks per week, each task must produce portfolio evidence.",
    "Only use real, well-known documentation URLs. Respond with JSON only:",
    '{ "title": string, "summary": string, "focusSkills": string[], "weeks": [{ "week": number, "theme": string, "tasks": [{ "title": string, "description": string, "skill": string, "resourceLabel": string, "resourceUrl": string, "exercise": string, "durationHours": number }] }] }',
  ].join("\n");

  const prompt = [
    `Target role: ${input.targetRole || "software engineer"}`,
    `Available study time: ${input.weeklyHours} hours per week`,
    `Current skills: ${input.currentSkills.join(", ") || "unknown"}`,
    `Skills to close: ${input.missingSkills.join(", ") || "default role fundamentals"}`,
    input.summary ? `Context from latest analysis: ${input.summary}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = await generateValidatedJson({
      system,
      prompt,
      validate: (raw) => coercePlan(raw, normalizeSkillList(input.missingSkills).slice(0, 6)),
    });
    return { ...ai.data, engine: "gemini", warning: null };
  } catch (error) {
    return {
      ...localRoadmap(input),
      engine: "local",
      warning: `${aiFailurePayload(error).message} This roadmap was generated by the EVOLNEX rule-based planner from your recorded skill gaps — not by AI.`,
    };
  }
}
