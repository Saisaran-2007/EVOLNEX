import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * EVOLNEX schema
 * All user-owned records carry a user_id foreign key for strict data isolation.
 */

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 24 }).notNull(), // verify_email | reset_password
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_tokens_token_hash_unique").on(table.tokenHash),
    index("auth_tokens_user_idx").on(table.userId),
  ],
);

export const profiles = pgTable(
  "profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 160 }).notNull().default(""),
    contactEmail: varchar("contact_email", { length: 320 }).notNull().default(""),
    currentTitle: varchar("current_title", { length: 160 }).notNull().default(""),
    yearsExperience: integer("years_experience").notNull().default(0),
    education: text("education").notNull().default(""),
    targetRole: varchar("target_role", { length: 160 }).notNull().default(""),
    interests: text("interests").notNull().default(""),
    summary: text("summary").notNull().default(""),
    preferences: jsonb("preferences")
      .$type<{ weeklyHours?: number; difficulty?: string; locations?: string; remoteOnly?: boolean }>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("profiles_user_unique").on(table.userId)],
);

export type ExtractedSkill = {
  name: string;
  category?: string;
  source?: string;
  level?: string;
};

export const resumes = pgTable(
  "resumes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull().default("application/pdf"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    textContent: text("text_content").notNull().default(""),
    status: varchar("status", { length: 32 }).notNull().default("processed"),
    processingNote: text("processing_note").notNull().default(""),
    extractedSkills: jsonb("extracted_skills").$type<ExtractedSkill[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("resumes_user_idx").on(table.userId)],
);

export const skills = pgTable(
  "skills",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    level: varchar("level", { length: 24 }).notNull().default("intermediate"),
    source: varchar("source", { length: 24 }).notNull().default("manual"), // manual | resume
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("skills_user_name_unique").on(table.userId, table.name),
    index("skills_user_idx").on(table.userId),
  ],
);

export const jobAnalyses = pgTable(
  "job_analyses",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobTitle: varchar("job_title", { length: 200 }).notNull(),
    company: varchar("company", { length: 200 }).notNull().default(""),
    jobDescription: text("job_description").notNull(),
    fitScore: integer("fit_score").notNull().default(0),
    matchedSkills: jsonb("matched_skills").$type<string[]>().notNull().default([]),
    missingSkills: jsonb("missing_skills").$type<string[]>().notNull().default([]),
    partialSkills: jsonb("partial_skills").$type<string[]>().notNull().default([]),
    recommendedSkills: jsonb("recommended_skills").$type<string[]>().notNull().default([]),
    readiness: varchar("readiness", { length: 32 }).notNull().default("developing"),
    summary: text("summary").notNull().default(""),
    recommendations: jsonb("recommendations").$type<string[]>().notNull().default([]),
    engine: varchar("engine", { length: 32 }).notNull().default("local"),
    model: varchar("model", { length: 80 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("job_analyses_user_idx").on(table.userId)],
);

export const roadmaps = pgTable(
  "roadmaps",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    targetRole: varchar("target_role", { length: 160 }).notNull().default(""),
    summary: text("summary").notNull().default(""),
    estimatedWeeks: integer("estimated_weeks").notNull().default(6),
    focusSkills: jsonb("focus_skills").$type<string[]>().notNull().default([]),
    analysisId: integer("analysis_id").references(() => jobAnalyses.id, { onDelete: "set null" }),
    engine: varchar("engine", { length: 32 }).notNull().default("local"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("roadmaps_user_idx").on(table.userId)],
);

export const roadmapTasks = pgTable(
  "roadmap_tasks",
  {
    id: serial("id").primaryKey(),
    roadmapId: integer("roadmap_id")
      .notNull()
      .references(() => roadmaps.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    week: integer("week").notNull().default(1),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description").notNull().default(""),
    skill: varchar("skill", { length: 120 }).notNull().default(""),
    resourceLabel: varchar("resource_label", { length: 200 }).notNull().default(""),
    resourceUrl: text("resource_url").notNull().default(""),
    exercise: text("exercise").notNull().default(""),
    durationHours: integer("duration_hours").notNull().default(3),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("roadmap_tasks_roadmap_idx").on(table.roadmapId),
    index("roadmap_tasks_user_idx").on(table.userId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    difficulty: varchar("difficulty", { length: 24 }).notNull().default("intermediate"),
    requiredSkills: jsonb("required_skills").$type<string[]>().notNull().default([]),
    technologies: jsonb("technologies").$type<string[]>().notNull().default([]),
    outcome: text("outcome").notNull().default(""),
    steps: jsonb("steps").$type<string[]>().notNull().default([]),
    status: varchar("status", { length: 24 }).notNull().default("not_started"),
    engine: varchar("engine", { length: 32 }).notNull().default("local"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("projects_user_idx").on(table.userId)],
);

export const interviewSessions = pgTable(
  "interview_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 160 }).notNull(),
    difficulty: varchar("difficulty", { length: 24 }).notNull().default("mid"),
    status: varchar("status", { length: 24 }).notNull().default("in_progress"),
    overallScore: integer("overall_score"),
    summary: text("summary").notNull().default(""),
    strengths: jsonb("strengths").$type<string[]>().notNull().default([]),
    improvements: jsonb("improvements").$type<string[]>().notNull().default([]),
    engine: varchar("engine", { length: 32 }).notNull().default("local"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("interview_sessions_user_idx").on(table.userId)],
);

export const interviewQuestions = pgTable(
  "interview_questions",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(1),
    question: text("question").notNull(),
    focus: varchar("focus", { length: 120 }).notNull().default(""),
    answer: text("answer").notNull().default(""),
    score: integer("score"),
    scores: jsonb("scores")
      .$type<{
        relevance?: number;
        technical?: number;
        clarity?: number;
        communication?: number;
        problemSolving?: number;
        completeness?: number;
      }>()
      .notNull()
      .default({}),
    feedback: text("feedback").notNull().default(""),
    improvements: jsonb("improvements").$type<string[]>().notNull().default([]),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (table) => [
    index("interview_questions_session_idx").on(table.sessionId),
    index("interview_questions_user_idx").on(table.userId),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    company: varchar("company", { length: 200 }).notNull(),
    jobTitle: varchar("job_title", { length: 200 }).notNull(),
    jobUrl: text("job_url").notNull().default(""),
    stage: varchar("stage", { length: 24 }).notNull().default("interested"),
    notes: text("notes").notNull().default(""),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    followUpAt: timestamp("follow_up_at", { withTimezone: true }),
    followUpNote: text("follow_up_note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("applications_user_idx").on(table.userId)],
);

export const applicationEvents = pgTable(
  "application_events",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromStage: varchar("from_stage", { length: 24 }),
    toStage: varchar("to_stage", { length: 24 }).notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("application_events_application_idx").on(table.applicationId),
    index("application_events_user_idx").on(table.userId),
  ],
);

export const reminders = pgTable(
  "reminders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    title: varchar("title", { length: 200 }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    note: text("note").notNull().default(""),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reminders_user_idx").on(table.userId)],
);

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Resume = typeof resumes.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type JobAnalysis = typeof jobAnalyses.$inferSelect;
export type Roadmap = typeof roadmaps.$inferSelect;
export type RoadmapTask = typeof roadmapTasks.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type InterviewSession = typeof interviewSessions.$inferSelect;
export type InterviewQuestion = typeof interviewQuestions.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type ApplicationEvent = typeof applicationEvents.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
