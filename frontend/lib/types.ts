export type ProfileDTO = {
  id: number;
  userId: number;
  fullName: string;
  contactEmail: string;
  currentTitle: string;
  yearsExperience: number;
  education: string;
  targetRole: string;
  interests: string;
  summary: string;
  preferences: { weeklyHours?: number; difficulty?: string; locations?: string; remoteOnly?: boolean };
  updatedAt: string;
};

export type SkillDTO = { id: number; name: string; label: string; source: string; level: string };

export type AnalysisDTO = {
  id: number;
  jobTitle: string;
  company: string;
  jobDescription: string;
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  partialSkills: string[];
  recommendedSkills: string[];
  readiness: string;
  summary: string;
  recommendations: string[];
  engine: string;
  model: string;
  createdAt: string;
};

export type TaskDTO = {
  id: number;
  week: number;
  title: string;
  description: string;
  skill: string;
  resourceLabel: string;
  resourceUrl: string;
  exercise: string;
  durationHours: number;
  completed: boolean;
  completedAt: string | null;
};

export type RoadmapDTO = {
  id: number;
  title: string;
  targetRole: string;
  summary: string;
  estimatedWeeks: number;
  focusSkills: string[];
  engine: string;
  createdAt: string;
};

export type ProjectDTO = {
  id: number;
  title: string;
  description: string;
  difficulty: string;
  requiredSkills: string[];
  technologies: string[];
  outcome: string;
  steps: string[];
  status: string;
  engine: string;
  createdAt: string;
  updatedAt: string;
};

export type InterviewQuestionDTO = {
  id: number;
  sessionId: number;
  position: number;
  question: string;
  focus: string;
  answer: string;
  score: number | null;
  scores: Record<string, number>;
  feedback: string;
  improvements: string[];
  answeredAt: string | null;
};

export type InterviewSessionDTO = {
  id: number;
  role: string;
  difficulty: string;
  status: string;
  overallScore: number | null;
  summary: string;
  strengths: string[];
  improvements: string[];
  engine: string;
  createdAt: string;
  completedAt: string | null;
  questionCount?: number;
  answeredCount?: number;
};

export type ApplicationEventDTO = {
  id: number;
  fromStage: string | null;
  toStage: string;
  note: string;
  createdAt: string;
};

export type ApplicationDTO = {
  id: number;
  company: string;
  jobTitle: string;
  jobUrl: string;
  stage: string;
  notes: string;
  appliedAt: string | null;
  followUpAt: string | null;
  followUpNote: string;
  createdAt: string;
  updatedAt: string;
  history: ApplicationEventDTO[];
  reminders: Array<{ id: number; title: string; dueAt: string; done: boolean; note: string }>;
};

export type OverviewData = {
  profile: ProfileDTO | null;
  profileCompletion: { percent: number; missing: string[] };
  resume: { id: number; filename: string; status: string; skillsCount: number; createdAt: string; note: string } | null;
  skills: Array<{ name: string; label: string; source: string }>;
  analysis: AnalysisDTO | null;
  analysisCount: number;
  roadmap: {
    id: number;
    title: string;
    targetRole: string;
    total: number;
    completed: number;
    percent: number;
    nextTask: TaskDTO | null;
  } | null;
  projects: { total: number; active: number; completed: number };
  interviews: {
    sessions: number;
    answered: number;
    averageScore: number | null;
    last: { id: number; role: string; status: string; overallScore: number | null; createdAt: string } | null;
  };
  applications: { total: number; active: number; offers: number; byStage: Array<{ key: string; count: number }> };
  reminders: Array<{ id: number; title: string; dueAt: string; note: string }>;
  ai: { configured: boolean };
};

export type AnalyticsData = {
  skills: { total: number; fromResume: number; list: Array<{ name: string; label: string; source: string }> };
  learning: {
    tasksTotal: number;
    tasksCompleted: number;
    completionRate: number;
    hoursPlanned: number;
    hoursCompleted: number;
    roadmapTitle: string | null;
    historicalTasks: number;
  };
  projects: { total: number; completed: number; inProgress: number; notStarted: number };
  interviews: {
    sessions: number;
    completed: number;
    answersEvaluated: number;
    averageScore: number | null;
    trend: Array<{ label: string; value: number; role: string }>;
    dimensions: Array<{ key: string; label: string; value: number; samples: number }>;
  };
  applications: {
    total: number;
    byStage: Array<{ stage: string; count: number }>;
    submitted: number;
    responded: number;
    offers: number;
    responseRate: number;
    offerRate: number;
    upcomingFollowUps: Array<{ id: number; company: string; jobTitle: string; stage: string; followUpAt: string }>;
  };
  learningActivity: Array<{ label: string; value: number }>;
};

export type AiStatus = {
  provider: string;
  configured: boolean;
  primaryModel: string;
  fallbackModels: string[];
  mode: "gemini" | "local-engine";
  note: string;
};
