import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@backend/db";
import {
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
  type Profile,
} from "@backend/db/schema";
import { normalizeSkillList, skillLabel } from "@backend/lib/skills";

export const PROFILE_FIELDS: Array<{ key: keyof Profile; label: string }> = [
  { key: "fullName", label: "Full name" },
  { key: "contactEmail", label: "Contact email" },
  { key: "currentTitle", label: "Current job title" },
  { key: "targetRole", label: "Target role" },
  { key: "education", label: "Education" },
  { key: "summary", label: "Professional summary" },
  { key: "interests", label: "Career interests" },
];

export async function getProfile(userId: number) {
  const rows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function getActiveResume(userId: number) {
  const rows = await db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserSkillRows(userId: number) {
  return db.select().from(skills).where(eq(skills.userId, userId)).orderBy(skills.name);
}

export async function resolveUserSkills(userId: number) {
  const [rows, resume] = await Promise.all([getUserSkillRows(userId), getActiveResume(userId)]);
  const fromResume = (resume?.extractedSkills ?? []).map((skill) => skill.name);
  return normalizeSkillList([...rows.map((row) => row.name), ...fromResume]).map((name) => ({
    name,
    label: skillLabel(name),
    source: rows.some((row) => row.name === name) ? "profile" : "resume",
  }));
}

export async function getLatestAnalysis(userId: number) {
  const rows = await db
    .select()
    .from(jobAnalyses)
    .where(eq(jobAnalyses.userId, userId))
    .orderBy(desc(jobAnalyses.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestRoadmap(userId: number) {
  const rows = await db
    .select()
    .from(roadmaps)
    .where(eq(roadmaps.userId, userId))
    .orderBy(desc(roadmaps.createdAt))
    .limit(1);
  const roadmap = rows[0];
  if (!roadmap) return null;
  const tasks = await db
    .select()
    .from(roadmapTasks)
    .where(and(eq(roadmapTasks.roadmapId, roadmap.id), eq(roadmapTasks.userId, userId)))
    .orderBy(roadmapTasks.week, roadmapTasks.id);
  return { roadmap, tasks };
}

export function profileCompletion(profile: Profile | null, input: { skillCount: number; hasResume: boolean }) {
  const missing: string[] = [];
  if (!profile) return { percent: 0, missing: PROFILE_FIELDS.map((field) => field.label).concat("Resume", "Skills") };
  for (const field of PROFILE_FIELDS) {
    const value = profile[field.key];
    if (!value || (typeof value === "string" && value.trim().length === 0)) missing.push(field.label);
  }
  if (profile.yearsExperience <= 0 && profile.currentTitle.trim().length === 0) {
    if (!missing.includes("Years of experience")) missing.push("Years of experience");
  }
  if (input.skillCount === 0) missing.push("Skills");
  if (!input.hasResume) missing.push("Resume");
  const total = PROFILE_FIELDS.length + 3;
  return { percent: Math.round(((total - missing.length) / total) * 100), missing };
}

export async function getOverviewData(userId: number) {
  const [profile, resume, skillList, analysis, roadmapData, projectRows, sessionRows, applicationRows, reminderRows] =
    await Promise.all([
      getProfile(userId),
      getActiveResume(userId),
      resolveUserSkills(userId),
      getLatestAnalysis(userId),
      getLatestRoadmap(userId),
      db.select().from(projects).where(eq(projects.userId, userId)),
      db
        .select({
          id: interviewSessions.id,
          role: interviewSessions.role,
          difficulty: interviewSessions.difficulty,
          status: interviewSessions.status,
          overallScore: interviewSessions.overallScore,
          createdAt: interviewSessions.createdAt,
        })
        .from(interviewSessions)
        .where(eq(interviewSessions.userId, userId))
        .orderBy(desc(interviewSessions.createdAt)),
      db.select().from(applications).where(eq(applications.userId, userId)),
      db
        .select()
        .from(reminders)
        .where(and(eq(reminders.userId, userId), eq(reminders.done, false)))
        .orderBy(reminders.dueAt)
        .limit(4),
    ]);

  const answered = await db
    .select({ id: interviewQuestions.id })
    .from(interviewQuestions)
    .where(and(eq(interviewQuestions.userId, userId), sql`${interviewQuestions.score} is not null`));

  const completion = profileCompletion(profile, {
    skillCount: skillList.length,
    hasResume: Boolean(resume),
  });
  const tasks = roadmapData?.tasks ?? [];
  const completedTasks = tasks.filter((task) => task.completed).length;
  const scoredSessions = sessionRows.filter((session) => typeof session.overallScore === "number");
  const activeStages = ["applied", "screening", "interview", "assessment"];
  const activeApplications = applicationRows.filter((application) => activeStages.includes(application.stage));

  return {
    profile,
    profileCompletion: completion,
    resume: resume
      ? {
          id: resume.id,
          filename: resume.filename,
          status: resume.status,
          skillsCount: resume.extractedSkills.length,
          createdAt: resume.createdAt,
          note: resume.processingNote,
        }
      : null,
    skills: skillList,
    analysis,
    analysisCount: analysis ? (await db.select({ id: jobAnalyses.id }).from(jobAnalyses).where(eq(jobAnalyses.userId, userId))).length : 0,
    roadmap: roadmapData
      ? {
          id: roadmapData.roadmap.id,
          title: roadmapData.roadmap.title,
          targetRole: roadmapData.roadmap.targetRole,
          total: tasks.length,
          completed: completedTasks,
          percent: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0,
          nextTask: tasks.find((task) => !task.completed) ?? null,
        }
      : null,
    projects: {
      total: projectRows.length,
      active: projectRows.filter((project) => project.status === "in_progress").length,
      completed: projectRows.filter((project) => project.status === "completed").length,
    },
    interviews: {
      sessions: sessionRows.length,
      answered: answered.length,
      averageScore: scoredSessions.length
        ? Math.round(scoredSessions.reduce((total, session) => total + (session.overallScore ?? 0), 0) / scoredSessions.length)
        : null,
      last: sessionRows[0] ?? null,
    },
    applications: {
      total: applicationRows.length,
      active: activeApplications.length,
      offers: applicationRows.filter((application) => application.stage === "offer").length,
      byStage: countBy(applicationRows.map((application) => application.stage)),
    },
    reminders: reminderRows,
  };
}

function countBy(values: string[]) {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map.entries()].map(([key, count]) => ({ key, count }));
}

export async function getAnalytics(userId: number) {
  const [skillList, resume, tasks, projectRows, sessionRows, applicationRows] = await Promise.all([
    resolveUserSkills(userId),
    getActiveResume(userId),
    db
      .select({ task: roadmapTasks, roadmap: roadmaps })
      .from(roadmapTasks)
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapTasks.roadmapId))
      .where(eq(roadmapTasks.userId, userId)),
    db.select().from(projects).where(eq(projects.userId, userId)),
    db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.userId, userId))
      .orderBy(interviewSessions.createdAt),
    db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId))
      .orderBy(desc(applications.createdAt)),
  ]);

  const sessionIds = sessionRows.map((session) => session.id);
  const questionRows = sessionIds.length
    ? await db
        .select()
        .from(interviewQuestions)
        .where(and(eq(interviewQuestions.userId, userId), inArray(interviewQuestions.sessionId, sessionIds)))
    : [];

  const scoredQuestions = questionRows.filter((question) => typeof question.score === "number");
  const dimensions = [
    ["relevance", "Relevance"],
    ["technical", "Technical"],
    ["clarity", "Clarity"],
    ["communication", "Communication"],
    ["problemSolving", "Problem solving"],
    ["completeness", "Completeness"],
  ] as const;
  const dimensionAverages = dimensions.map(([key, label]) => {
    const values = scoredQuestions.map((question) => question.scores?.[key] ?? 0).filter((value) => value > 0);
    return {
      key,
      label,
      value: values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : 0,
      samples: values.length,
    };
  });

  const latestRoadmapId = tasks.length
    ? tasks.reduce((latest, row) => (row.roadmap.createdAt > latest.createdAt ? row.roadmap : latest), tasks[0].roadmap).id
    : null;
  const latestTasks = latestRoadmapId ? tasks.filter((row) => row.task.roadmapId === latestRoadmapId) : [];

  const scores = sessionRows
    .filter((session) => typeof session.overallScore === "number")
    .map((session) => ({
      label: session.createdAt.toISOString().slice(5, 10),
      value: session.overallScore ?? 0,
      role: session.role,
    }));

  const stages = ["interested", "applied", "screening", "interview", "assessment", "offer", "rejected"];
  const submitted = applicationRows.filter((application) => application.stage !== "interested").length;
  const responded = applicationRows.filter((application) =>
    ["screening", "interview", "assessment", "offer"].includes(application.stage),
  ).length;
  const offers = applicationRows.filter((application) => application.stage === "offer").length;

  const last14 = Array.from({ length: 14 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (13 - index));
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const completed = tasks.filter(
      (row) => row.task.completedAt && row.task.completedAt >= day && row.task.completedAt < next,
    ).length;
    return { label: day.toISOString().slice(5, 10), value: completed };
  });

  return {
    skills: {
      total: skillList.length,
      fromResume: resume?.extractedSkills.length ?? 0,
      list: skillList,
    },
    learning: {
      tasksTotal: latestTasks.length,
      tasksCompleted: latestTasks.filter((row) => row.task.completed).length,
      completionRate: latestTasks.length
        ? Math.round((latestTasks.filter((row) => row.task.completed).length / latestTasks.length) * 100)
        : 0,
      hoursPlanned: latestTasks.reduce((total, row) => total + row.task.durationHours, 0),
      hoursCompleted: latestTasks.filter((row) => row.task.completed).reduce((total, row) => total + row.task.durationHours, 0),
      roadmapTitle: latestTasks[0]?.roadmap.title ?? null,
      historicalTasks: tasks.length,
    },
    projects: {
      total: projectRows.length,
      completed: projectRows.filter((project) => project.status === "completed").length,
      inProgress: projectRows.filter((project) => project.status === "in_progress").length,
      notStarted: projectRows.filter((project) => project.status === "not_started").length,
    },
    interviews: {
      sessions: sessionRows.length,
      completed: sessionRows.filter((session) => session.status === "completed").length,
      answersEvaluated: scoredQuestions.length,
      averageScore: scoredQuestions.length
        ? Math.round(
            scoredQuestions.reduce((total, question) => total + (question.score ?? 0), 0) / scoredQuestions.length,
          )
        : null,
      trend: scores,
      dimensions: dimensionAverages,
    },
    applications: {
      total: applicationRows.length,
      byStage: stages.map((stage) => ({
        stage,
        count: applicationRows.filter((application) => application.stage === stage).length,
      })),
      submitted,
      responded,
      offers,
      responseRate: submitted ? Math.round((responded / submitted) * 100) : 0,
      offerRate: submitted ? Math.round((offers / submitted) * 100) : 0,
      upcomingFollowUps: applicationRows
        .filter((application) => application.followUpAt && application.followUpAt.getTime() > Date.now())
        .sort((a, b) => (a.followUpAt?.getTime() ?? 0) - (b.followUpAt?.getTime() ?? 0))
        .slice(0, 5)
        .map((application) => ({
          id: application.id,
          company: application.company,
          jobTitle: application.jobTitle,
          stage: application.stage,
          followUpAt: application.followUpAt,
        })),
    },
    learningActivity: last14,
  };
}
