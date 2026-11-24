import { aiFailurePayload, generateValidatedJson } from "@backend/lib/ai/gemini";
import { clamp } from "@backend/lib/api";
import { extractSkillsFromText, normalizeSkillList, skillLabel } from "@backend/lib/skills";

export type QuestionDraft = { question: string; focus: string };

export const SCORE_DIMENSIONS = [
  "relevance",
  "technical",
  "clarity",
  "communication",
  "problemSolving",
  "completeness",
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];
export type DimensionScores = Partial<Record<ScoreDimension, number>>;

export type Evaluation = {
  score: number;
  scores: Record<ScoreDimension, number>;
  feedback: string;
  improvements: string[];
};

export type InterviewAggregate = {
  overallScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
};

const WEIGHTS: Record<ScoreDimension, number> = {
  relevance: 0.2,
  technical: 0.25,
  clarity: 0.15,
  communication: 0.1,
  problemSolving: 0.2,
  completeness: 0.1,
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "how", "what", "why", "would", "could", "should", "this", "that",
  "have", "does", "about", "into", "from", "when", "which", "there", "their", "them", "then", "than", "are", "was",
  "were", "will", "can", "our", "out", "use", "using", "explain", "describe", "walk", "through", "tell", "give",
]);

const STRUCTURE_WORDS = ["first", "second", "next", "then", "finally", "for example", "for instance", "in short", "overall"];
const PROBLEM_WORDS = [
  "trade-off", "tradeoff", "because", "constraint", "assumption", "approach", "alternative", "edge case", "test",
  "scale", "measure", "tradeoff", "complexity", "risk", "mitigate", "monitor", "diagnose", "root cause",
];

const BANKS: Record<string, string[]> = {
  behavioural: [
    "Tell me about a project you owned end to end. What was your specific contribution and what outcome did you deliver?",
    "Describe a time you disagreed with a teammate on a technical decision. How did you resolve it?",
    "Walk me through a failure you experienced recently. What did you change afterwards?",
    "How do you prioritise when two stakeholders need conflicting work delivered in the same sprint?",
    "Tell me about a time you had to learn something quickly to unblock delivery.",
  ],
  technical: [
    "How would you debug a production endpoint that suddenly became slow? Walk through your investigation.",
    "Explain how you would design a data model for a job application tracker used by thousands of users.",
    "What is the difference between authentication and authorisation, and how would you implement both safely?",
    "How do you decide what to unit test, integration test and verify manually?",
    "Describe how you would make a feature you built observable in production.",
  ],
  "system design": [
    "Design a resume-to-job matching service. What are the core components and failure modes?",
    "How would you scale an API from 100 to 100,000 requests per minute? Where does it break first?",
    "Design a rate limiter for a public API. What are the trade-offs between accuracy and cost?",
    "How would you store and query time-series career progress metrics at scale?",
    "Design the notification system for application follow-up reminders.",
  ],
  frontend: [
    "How do you structure a React application so state stays predictable as it grows?",
    "A page feels slow for users on mid-range phones. How do you diagnose and fix it?",
    "Explain how you would build an accessible multi-step form with validation.",
    "How do you decide between server rendering, static generation and client fetching?",
    "Describe your approach to reusable component APIs and design systems.",
  ],
  "data/ai": [
    "How would you evaluate whether a machine-learning feature actually improved the product?",
    "Explain how you would handle missing data and class imbalance in a prediction pipeline.",
    "How do you detect and mitigate data leakage in a model you are training?",
    "What would you monitor after deploying a model to production?",
    "How would you design retrieval evaluation for an LLM assistant?",
  ],
};

function roleBucket(role: string) {
  const value = role.toLowerCase();
  if (/(data|ml|machine learning|ai|scientist|analyst)/.test(value)) return "data/ai";
  if (/(frontend|front-end|react|ui)/.test(value)) return "frontend";
  if (/(architect|system design|staff|principal|platform)/.test(value)) return "system design";
  if (/(engineer|developer|backend|full.?stack|software)/.test(value)) return "technical";
  return "behavioural";
}

export function localQuestions(input: { role: string; difficulty: string; count?: number }): QuestionDraft[] {
  const count = clamp(input.count ?? 5, 3, 8);
  const primary = roleBucket(input.role);
  const pools = [BANKS[primary], BANKS.behavioural, BANKS.technical, BANKS["system design"]];
  const questions: QuestionDraft[] = [];
  const seen = new Set<string>();
  for (const pool of pools) {
    for (const question of pool) {
      if (seen.has(question)) continue;
      seen.add(question);
      questions.push({
        question,
        focus: primary === "behavioural" ? "Behavioural judgement" : skillLabel(primary.replace("/", " / ")),
      });
      if (questions.length >= count) break;
    }
    if (questions.length >= count) break;
  }
  const prefix =
    input.difficulty === "junior"
      ? "Answer as an early-career engineer: be concrete about what you personally did."
      : input.difficulty === "senior"
        ? "Answer as a senior engineer: cover trade-offs, risk and stakeholder impact."
        : "Answer as a mid-level engineer: show ownership, reasoning and measurable results.";
  return questions.slice(0, count).map((item) => ({ ...item, focus: `${item.focus} · ${prefix}` }));
}

function scoreAnswerLocal(input: { question: string; answer: string; role: string }): Evaluation {
  const answer = input.answer.trim();
  const words = answer.split(/\s+/).filter(Boolean);
  const sentences = answer.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
  const lower = ` ${answer.toLowerCase()} `;

  if (words.length < 8) {
    const scores: Record<ScoreDimension, number> = {
      relevance: 12,
      technical: 8,
      clarity: 18,
      communication: 12,
      problemSolving: 8,
      completeness: 6,
    };
    return {
      score: 11,
      scores,
      feedback:
        "This answer is too short to evaluate meaningfully. In a real interview this reads as a non-answer — give a structured response with a concrete example and the result.",
      improvements: [
        "Use a 3-part structure: context, action you personally took, measurable outcome.",
        "Aim for 120-250 words — long enough to show reasoning, short enough to keep attention.",
        "Include at least one concrete technology or number to anchor the answer.",
      ],
    };
  }

  const questionTokens = new Set(
    input.question.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3 && !STOPWORDS.has(token)),
  );
  const answerTokens = new Set(answer.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const overlap = [...questionTokens].filter((token) => answerTokens.has(token)).length;
  const relevance = clamp(45 + (overlap / Math.max(1, questionTokens.size)) * 55, 20, 100);

  const mentionedSkills = extractSkillsFromText(answer);
  const digits = (answer.match(/\b\d+(\.\d+)?%?\b/g) ?? []).length;
  const technical = clamp(
    30 + Math.min(45, mentionedSkills.length * 12) + Math.min(20, digits * 5) + (lower.includes("complexity") ? 5 : 0),
    15,
    100,
  );

  const avgSentence = sentences.length ? words.length / sentences.length : words.length;
  const filler = (lower.match(/\b(um|uh|kind of|sort of|maybe|stuff|things)\b/g) ?? []).length;
  const clarity = clamp(100 - Math.abs(avgSentence - 18) * 2.5 - filler * 6, 20, 100);

  const structureHits = STRUCTURE_WORDS.filter((word) => lower.includes(word)).length;
  const communication = clamp(40 + structureHits * 12 + Math.min(20, sentences.length * 3) - filler * 4, 20, 100);

  const problemHits = PROBLEM_WORDS.filter((word) => lower.includes(word)).length;
  const problemSolving = clamp(35 + problemHits * 11, 20, 100);

  const idealLength = words.length >= 110 ? 100 : words.length >= 60 ? 78 : 55;
  const completeness = clamp(idealLength - (words.length > 400 ? 12 : 0) + (lower.includes("result") || digits > 0 ? 5 : 0), 25, 100);

  const scores: Record<ScoreDimension, number> = {
    relevance,
    technical,
    clarity,
    communication,
    problemSolving,
    completeness,
  };
  const score = clamp(
    SCORE_DIMENSIONS.reduce((total, dimension) => total + scores[dimension] * WEIGHTS[dimension], 0),
    1,
    100,
  );

  const strongest = [...SCORE_DIMENSIONS].sort((a, b) => scores[b] - scores[a])[0];
  const weakest = [...SCORE_DIMENSIONS].sort((a, b) => scores[a] - scores[b])[0];
  const focusLabels: Record<ScoreDimension, string> = {
    relevance: "relevance to the question",
    technical: "technical depth",
    clarity: "clarity",
    communication: "communication structure",
    problemSolving: "problem-solving reasoning",
    completeness: "completeness",
  };

  const improvements: string[] = [];
  if (scores.relevance < 70) improvements.push("Restate the question and answer it directly in your first two sentences.");
  if (scores.technical < 70)
    improvements.push(`Name the specific ${input.role ? `${input.role} ` : ""}tools or concepts you would use, and explain why.`);
  if (scores.problemSolving < 70) improvements.push("Make trade-offs explicit: what you chose, what you rejected, and why.");
  if (scores.clarity < 70) improvements.push("Shorten sentences and remove filler; aim for ~18 words per sentence.");
  if (scores.completeness < 70) improvements.push("Finish with the measurable outcome or what you would do differently.");
  if (improvements.length === 0) improvements.push("Add a brief failure or risk note to show senior-level self-awareness.");

  return {
    score,
    scores,
    feedback: `Strongest dimension: ${focusLabels[strongest]}. Weakest: ${focusLabels[weakest]}. Measured with the EVOLNEX local rubric: ${mentionedSkills.length} technical term${
      mentionedSkills.length === 1 ? "" : "s"
    } detected, ${words.length} words, ${sentences.length} sentences${
      digits ? `, ${digits} quantified detail${digits === 1 ? "" : "s"}` : " and no quantified details"
    }. ${
      score >= 78
        ? "This is a hire-signal answer — tighten the weakest dimension and rehearse it."
        : score >= 58
          ? "Solid foundation. Add specificity and explicit reasoning to lift this into a strong answer."
          : "Needs restructuring: lead with a direct answer, then evidence, then outcome."
    }`,
    improvements: improvements.slice(0, 4),
  };
}

function coerceQuestionList(raw: unknown): QuestionDraft[] {
  const value = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(raw) ? raw : Array.isArray(value.questions) ? value.questions : [];
  const questions = list
    .map((item) => {
      if (typeof item === "string") return { question: item.trim(), focus: "General" };
      const record = (item ?? {}) as Record<string, unknown>;
      const question = typeof record.question === "string" ? record.question.trim() : "";
      if (!question) return null;
      return {
        question: question.slice(0, 600),
        focus: typeof record.focus === "string" ? record.focus.slice(0, 120) : "General",
      };
    })
    .filter((item): item is QuestionDraft => Boolean(item))
    .slice(0, 8);
  if (questions.length === 0) throw new Error("No questions");
  return questions;
}

function coerceEvaluation(raw: unknown): Evaluation {
  const value = (raw ?? {}) as Record<string, unknown>;
  const rawScores = (value.scores ?? {}) as Record<string, unknown>;
  const scores = {} as Record<ScoreDimension, number>;
  for (const dimension of SCORE_DIMENSIONS) {
    scores[dimension] = clamp(Number(rawScores[dimension] ?? value.score ?? 0), 0, 100);
  }
  const computed = clamp(
    SCORE_DIMENSIONS.reduce((total, dimension) => total + scores[dimension] * WEIGHTS[dimension], 0),
    1,
    100,
  );
  const feedback = typeof value.feedback === "string" ? value.feedback.trim().slice(0, 1600) : "";
  if (!feedback) throw new Error("Missing feedback");
  const improvements = Array.isArray(value.improvements)
    ? value.improvements.filter((item): item is string => typeof item === "string").slice(0, 5)
    : [];
  return { score: computed, scores, feedback, improvements };
}

export async function generateInterviewQuestions(input: {
  role: string;
  difficulty: string;
  skills: string[];
  count: number;
  resumeText: string;
}): Promise<{ questions: QuestionDraft[]; engine: "gemini" | "local"; warning: string | null }> {
  const system = [
    "You are EVOLNEX, a technical interviewer at a top product company.",
    "Create realistic interview questions matched to the role and difficulty.",
    "Mix technical depth, system reasoning and behavioural signal. No duplicates.",
    'Respond with JSON only: { "questions": [{ "question": string, "focus": string }] }',
  ].join("\n");
  const prompt = [
    `Role: ${input.role}`,
    `Difficulty: ${input.difficulty}`,
    `Number of questions: ${input.count}`,
    `Candidate skills: ${input.skills.join(", ") || "unknown"}`,
    input.resumeText ? `Resume excerpt: ${input.resumeText.slice(0, 3000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = await generateValidatedJson({
      system,
      prompt,
      validate: (raw) => ({ questions: coerceQuestionList(raw).slice(0, input.count) }),
    });
    return { questions: ai.data.questions, engine: "gemini", warning: null };
  } catch (error) {
    return {
      questions: localQuestions({ role: input.role, difficulty: input.difficulty, count: input.count }),
      engine: "local",
      warning: `${aiFailurePayload(error).message} These questions come from the curated EVOLNEX interview bank — not from AI.`,
    };
  }
}

export async function evaluateAnswer(input: {
  role: string;
  difficulty: string;
  question: string;
  answer: string;
}): Promise<{ evaluation: Evaluation; engine: "gemini" | "local"; warning: string | null }> {
  const system = [
    "You are EVOLNEX, a rigorous but constructive interview evaluator.",
    "Score the candidate answer from 0-100 on each dimension: relevance, technical, clarity, communication, problemSolving, completeness.",
    "Be honest. Never inflate scores. Feedback must reference the answer's actual content.",
    'Respond with JSON only: { "scores": { "relevance": number, "technical": number, "clarity": number, "communication": number, "problemSolving": number, "completeness": number }, "feedback": string, "improvements": string[] }',
  ].join("\n");
  const prompt = [
    `Role: ${input.role}`,
    `Difficulty: ${input.difficulty}`,
    `Question: ${input.question}`,
    `Candidate answer:\n${input.answer.slice(0, 6000)}`,
  ].join("\n\n");

  try {
    const ai = await generateValidatedJson({ system, prompt, validate: coerceEvaluation });
    return { evaluation: ai.data, engine: "gemini", warning: null };
  } catch (error) {
    return {
      evaluation: scoreAnswerLocal(input),
      engine: "local",
      warning: `${aiFailurePayload(error).message} Feedback below was produced by the EVOLNEX local rubric, not by AI.`,
    };
  }
}

export function aggregateSession(
  questions: Array<{ score: number | null; scores: DimensionScores; improvements: string[] }>,
): InterviewAggregate {
  const scored = questions.filter((question) => typeof question.score === "number");
  const overallScore = scored.length
    ? clamp(scored.reduce((total, question) => total + (question.score ?? 0), 0) / scored.length, 0, 100)
    : 0;
  const totals: Record<ScoreDimension, number> = {
    relevance: 0,
    technical: 0,
    clarity: 0,
    communication: 0,
    problemSolving: 0,
    completeness: 0,
  };
  for (const question of scored) {
    for (const dimension of SCORE_DIMENSIONS) {
      totals[dimension] += question.scores?.[dimension] ?? 0;
    }
  }
  const averages = SCORE_DIMENSIONS.map((dimension) => ({
    dimension,
    value: scored.length ? Math.round(totals[dimension] / scored.length) : 0,
  })).sort((a, b) => b.value - a.value);

  const strengths = averages.slice(0, 2).map((item) => `${labelFor(item.dimension)} (${item.value}/100 average)`);
  const weakest = averages.slice(-2);
  const improvements = new Set<string>();
  for (const question of scored) {
    for (const improvement of question.improvements) improvements.add(improvement);
  }
  for (const item of weakest) improvements.add(`Raise ${labelFor(item.dimension).toLowerCase()} with your next practice round.`);

  const summary = scored.length
    ? `Across ${scored.length} evaluated answer${scored.length === 1 ? "" : "s"} your average is ${overallScore}/100. Strongest signal: ${labelFor(
        averages[0].dimension,
      ).toLowerCase()} at ${averages[0].value}/100. Biggest lift available: ${labelFor(
        averages[averages.length - 1].dimension,
      ).toLowerCase()} at ${averages[averages.length - 1].value}/100.`
    : "No answers were submitted in this session yet.";

  return {
    overallScore,
    summary,
    strengths: strengths.length ? strengths : ["No scored answers yet"],
    improvements: [...improvements].slice(0, 6),
  };
}

function labelFor(dimension: ScoreDimension) {
  const labels: Record<ScoreDimension, string> = {
    relevance: "Relevance",
    technical: "Technical accuracy",
    clarity: "Clarity",
    communication: "Communication",
    problemSolving: "Problem solving",
    completeness: "Completeness",
  };
  return labels[dimension];
}

export function normalizeSkillsForInterview(skills: string[]) {
  return normalizeSkillList(skills);
}
