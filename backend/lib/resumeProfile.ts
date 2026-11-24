/**
 * Resume → profile extraction and merge rules.
 *
 * Pure module (no database, no framework imports) so it can be unit tested:
 *   - extractProfileFromResume(): heuristic field extraction from resume text
 *   - buildProfilePatch(): decides which profile fields a new resume replaces
 *
 * Merge rule: a new resume is the source of truth for professional details.
 * Detected fields overwrite the profile. Fields the resume does not provide are
 * reset ONLY when their current value was not typed by the user (i.e. it is
 * sample data or was derived from an earlier resume) — hand-edited values stay.
 */

export type ResumeProfileDraft = {
  fullName: string;
  contactEmail: string;
  currentTitle: string;
  /** null = the resume gives no reliable signal */
  yearsExperience: number | null;
  education: string;
  summary: string;
  interests: string;
  targetRole: string;
  targetRoleSource: "objective" | "title" | "skills" | "";
  isStudent: boolean;
};

export type ProfileFields = {
  fullName: string;
  contactEmail: string;
  currentTitle: string;
  yearsExperience: number;
  education: string;
  targetRole: string;
  interests: string;
  summary: string;
};

export type ProfileFieldKey = keyof ProfileFields;

export type FieldChange = {
  field: ProfileFieldKey;
  label: string;
  value: string;
  kind: "updated" | "cleared" | "suggested";
};

export const FIELD_LABELS: Record<ProfileFieldKey, string> = {
  fullName: "Full name",
  contactEmail: "Contact email",
  currentTitle: "Current job title",
  yearsExperience: "Years of experience",
  education: "Education",
  targetRole: "Target role",
  interests: "Career interests",
  summary: "Professional summary",
};

/* ------------------------------ text helpers ------------------------------ */

const ACRONYMS = new Set(["ai", "ml", "qa", "ui", "ux", "sre", "ios", "api", "aws", "gcp", "hr", "it", "ui/ux", "ii", "iii"]);
const SMALL_WORDS = new Set(["and", "of", "in", "for", "the", "&"]);

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.replace(/(^|[-/'])([a-z])/g, (_match, lead: string, char: string) => `${lead}${char.toUpperCase()}`);
    })
    .join(" ");
}

function normalizeName(value: string) {
  const hasLower = /[a-z]/.test(value);
  return hasLower ? value : toTitleCase(value);
}

function nonEmptyLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function stripBullet(line: string) {
  return line.replace(/^[•●▪■◦*·\-–]\s+/, "").trim();
}

/** Re-joins lines that a PDF wrapped mid-sentence. */
function joinWrapped(lines: string[]) {
  const out: string[] = [];
  for (const raw of lines) {
    const line = stripBullet(raw);
    if (!line) continue;
    const previous = out[out.length - 1];
    if (previous && (/[,(&|/]$/.test(previous) || /^[a-z(]/.test(line))) {
      out[out.length - 1] = `${previous} ${line}`;
    } else {
      out.push(line);
    }
  }
  return out;
}

/* ------------------------------- sections -------------------------------- */

type SectionKey = "summary" | "experience" | "education" | "skills" | "projects" | "interests" | "other";

const SECTION_PATTERNS: Array<[SectionKey, RegExp]> = [
  ["summary", /^((professional|career|executive|personal)\s+)?(summary|profile|objective|overview|statement)$|^about(\s+me)?$|^summary\s+of\s+qualifications$/],
  [
    "experience",
    /^((work|professional|relevant|industry|employment|internship|career)\s+)?(experience|experiences|history|employment|internships?)$|^experience\s*(&|and)\s*internships?$|^internships?\s*(&|and)\s*experience$/,
  ],
  ["education", /^(education|academics?|academic\s+(background|qualifications?|details|profile)|educational\s+(background|qualifications?)|education\s*(&|and)\s*\w+)$/],
  ["skills", /^((technical|core|key|professional|relevant)\s+)?(skills|competencies|technologies|tech\s+stack)(\s*(&|and)\s*[\w\s]+)?$|^skills\s+summary$/],
  ["projects", /^((personal|academic|key|selected|notable|major|technical)\s+)?projects?$/],
  ["interests", /^(interests|hobbies|hobbies\s*(&|and)\s*interests|interests\s*(&|and)\s*hobbies|areas?\s+of\s+interest)$/],
];

function knownSection(line: string): SectionKey | null {
  if (line.length > 44) return null;
  const value = line
    .toLowerCase()
    .replace(/^[\s•#*\-–]+/, "")
    .replace(/[:\-–—\s]+$/, "")
    .trim();
  for (const [key, pattern] of SECTION_PATTERNS) {
    if (pattern.test(value)) return key;
  }
  return null;
}

function sectionKeyFor(line: string): SectionKey | null {
  const known = knownSection(line);
  if (known) return known;
  // Unknown ALL-CAPS short lines ("CERTIFICATIONS", "LEADERSHIP AND ACTIVITIES") still end a section.
  if (/^[A-Z][A-Z &/,'-]{2,43}$/.test(line)) return "other";
  return null;
}

type Parsed = {
  lines: string[];
  nameIndex: number;
  name: string;
  preamble: string[];
  sections: Array<{ key: SectionKey; lines: string[] }>;
};

const NAME_RE = /^[A-Z][a-zA-Z.'-]*(?:\s+[A-Z][a-zA-Z.'-]*){1,3}$/;
const NAME_BLOCKLIST = ["resume", "curriculum", "vitae", "portfolio", "cv"];

function findName(lines: string[]) {
  for (let index = 0; index < Math.min(6, lines.length); index += 1) {
    const line = lines[index];
    const head = line.split(/\s*[·|–—•]\s*|\s+-\s+|,\s+/)[0].trim();
    if (!head || head.length > 48 || /\d/.test(head) || head.includes("@")) continue;
    if (NAME_BLOCKLIST.some((word) => head.toLowerCase().split(/\s+/).includes(word))) continue;
    if (knownSection(head)) continue;
    if (NAME_RE.test(head)) return { name: normalizeName(head), index };
  }
  return { name: "", index: -1 };
}

function parse(text: string): Parsed {
  const lines = nonEmptyLines(text);
  const { name, index: nameIndex } = findName(lines);
  const preamble: string[] = [];
  const sections: Parsed["sections"] = [];
  lines.forEach((line, index) => {
    const key = index === nameIndex ? null : sectionKeyFor(line);
    if (key) {
      sections.push({ key, lines: [] });
      return;
    }
    const current = sections[sections.length - 1];
    if (current) current.lines.push(line);
    else preamble.push(line);
  });
  return { lines, nameIndex, name, preamble, sections };
}

function sectionLines(parsed: Parsed, key: SectionKey) {
  return parsed.sections.filter((section) => section.key === key).flatMap((section) => section.lines);
}

/* --------------------------------- title --------------------------------- */

const ROLE_NOUNS =
  "engineer|developer|scientist|analyst|designer|architect|manager|specialist|consultant|administrator|programmer|tester|intern|trainee";
const TITLE_MODIFIERS =
  "senior|sr\\.?|junior|jr\\.?|lead|principal|staff|associate|assistant|graduate|software|frontend|front-end|front end|backend|back-end|back end|full[\\s-]?stack|web|mobile|ios|android|data|machine learning|ml|ai|devops|platform|cloud|site reliability|sre|qa|test|automation|security|product|ui/ux|ui|ux|system|systems|embedded|application|applications|solutions|research|business|technical|engineering|project|program|development|design|network|database|game";

/** "<modifier…> <role noun>" anywhere in a sentence, e.g. "senior backend engineer". */
const TITLE_IN_TEXT = new RegExp(`\\b(?:(?:${TITLE_MODIFIERS})\\s+)+(?:${ROLE_NOUNS})\\b`, "i");
/** A whole short segment that reads as a job title, e.g. "Web Development Intern". */
const TITLE_SEGMENT = new RegExp(
  `^(?:[A-Za-z][A-Za-z+#./&-]*\\s+){0,5}(?:${ROLE_NOUNS}|lead)(?:\\s+(?:i{1,3}|iv|[1-4]))?$`,
  "i",
);
const ASPIRATION_RE = /\b(aspiring|seeking|looking\s+for|to\s+become|aim(?:ing)?\s+to|future|wants?\s+to)\b/i;

function titleFromSegments(line: string) {
  const cleaned = stripBullet(line).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  for (const segment of cleaned.split(/\s+[—–|@]\s+|\s*[|·•]\s*|\s+-\s+|\s+at\s+|,\s+/)) {
    const candidate = segment.trim();
    if (candidate.length < 4 || candidate.length > 60 || /\d|@/.test(candidate)) continue;
    if (TITLE_SEGMENT.test(candidate)) return toTitleCase(candidate);
  }
  return "";
}

const STUDENT_RE = /\b(undergraduate|undergrad|student|fresher|pursuing|final[-\s]year|sophomore|freshman|currently\s+studying)\b/i;
const STUDENT_FIELD_RE =
  /((?:[A-Z][A-Za-z]+)(?:\s+(?:(?:and|of|&)\s+)?[A-Z][A-Za-z]+){0,5})\s+(undergraduate|student)\b/;
const LEADING_ADJECTIVES = /^(?:(?:motivated|passionate|dedicated|enthusiastic|final|aspiring|curious|driven|ambitious|hardworking|detail|a|an|the)\s+)+/i;

function studentTitle(text: string, education: string) {
  const match = text.match(STUDENT_FIELD_RE);
  if (match) {
    const field = match[1].replace(LEADING_ADJECTIVES, "").trim();
    if (field.length >= 3) return `${field} ${toTitleCase(match[2])}`.slice(0, 160);
  }
  if (/\b(m\.?\s?sc|m\.?\s?tech|master|mba|ph\.?\s?d)/i.test(education)) return "Graduate Student";
  if (/\b(b\.?\s?sc|b\.?\s?tech|b\.?\s?e\b|bachelor|undergraduate)/i.test(`${education} ${text}`)) return "Undergraduate Student";
  return "Student";
}

/* --------------------------------- years --------------------------------- */

const EXPLICIT_YEARS = /(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b[^.]{0,50}?\b(?:experience|exp)\b/i;
const EXPLICIT_YEARS_ALT = /\b(?:experience|exp)\b[^.]{0,30}?\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i;
const RANGE_RE =
  /((?:19|20)\d{2})\s*(?:[–—-]|to)\s*(?:[A-Za-z]{3,9}\.?,?\s+|\d{1,2}\/)?((?:19|20)\d{2}|present|now|current|ongoing|till\s+date|date)/gi;

function yearsFromRanges(text: string): number | null {
  const currentYear = new Date().getFullYear();
  let earliest = Number.POSITIVE_INFINITY;
  let latest = 0;
  for (const match of text.matchAll(RANGE_RE)) {
    const start = Number.parseInt(match[1], 10);
    const end = /^\d{4}$/.test(match[2]) ? Number.parseInt(match[2], 10) : currentYear;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || start > currentYear) continue;
    earliest = Math.min(earliest, start);
    latest = Math.max(latest, Math.min(end, currentYear));
  }
  if (latest === 0) return null;
  const span = latest - earliest;
  return span >= 0 && span <= 50 ? span : null;
}

/* ------------------------------ target role ------------------------------ */

const TRACKS: Record<"frontend" | "backend" | "ml" | "data" | "ops", string[]> = {
  frontend: ["javascript", "typescript", "react", "next.js", "vue", "angular", "svelte", "html", "css", "tailwind css", "vite", "redux", "sass"],
  backend: ["node.js", "express", "fastapi", "django", "flask", "spring boot", "rest api", "graphql", "postgresql", "mysql", "mongodb", "sql", "redis", "microservices"],
  ml: ["machine learning", "deep learning", "pytorch", "tensorflow", "scikit-learn", "nlp", "llm", "lstm"],
  data: ["pandas", "numpy", "data visualization", "statistics", "spark", "airflow", "bigquery", "snowflake"],
  ops: ["docker", "kubernetes", "aws", "azure", "gcp", "terraform", "ci/cd", "github actions", "linux"],
};

/** Suggests a role from the skill mix. Always presented to the user as a suggestion. */
export function suggestRoleFromSkills(skills: string[]): string {
  const set = new Set(skills);
  const count = (track: keyof typeof TRACKS) => TRACKS[track].filter((skill) => set.has(skill)).length;
  const frontend = count("frontend");
  const backend = count("backend");
  const ml = count("ml");
  const data = count("data");
  const ops = count("ops");
  const web = Math.max(frontend, backend);
  if (ml >= 3 && ml >= web) return "Machine Learning Engineer";
  if (data >= 3 && data >= web) return ml >= 2 ? "Data Scientist" : "Data Analyst";
  if (ops >= 3 && ops >= web) return "DevOps Engineer";
  if (frontend >= 2 && backend >= 2) return "Full Stack Developer";
  if (frontend >= 2 && frontend > backend) return "Frontend Developer";
  if (backend >= 2) return "Backend Developer";
  if (skills.length >= 3) return "Software Engineer";
  return "";
}

/* ------------------------------- extraction ------------------------------ */

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const DEGREE_RE =
  /((?:b\.?\s?sc|m\.?\s?sc|bachelor'?s?|master'?s?|ph\.?\s?d|b\.?\s?e\b|m\.?\s?tech|b\.?\s?tech|mba|associate'?s?)[^.®©\n]{4,110})/i;

/**
 * Extracts profile fields from resume text.
 * Empty strings / null mean "this resume does not tell us".
 */
export function extractProfileFromResume(text: string, skills: string[]): ResumeProfileDraft {
  const parsed = parse(text);
  const flat = parsed.lines.join(" ");

  const summaryLines = sectionLines(parsed, "summary");
  const experienceLines = sectionLines(parsed, "experience");
  const educationLines = sectionLines(parsed, "education");
  const interestLines = sectionLines(parsed, "interests");
  // The preamble is the leading run of lines, so its indexes line up with `lines`.
  const headline = parsed.preamble.filter((_line, index) => index !== parsed.nameIndex);

  // Summary: explicit section, else a real paragraph sitting under the contact block.
  let summary = summaryLines.join(" ").replace(/\s+/g, " ").trim();
  if (summary.length < 40) {
    const loose = headline
      .filter((line) => !line.includes("@") && !/https?:|www\.|\.com\b|\+?\d[\d\s()-]{7,}/i.test(line))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    summary = loose.length >= 120 ? loose : "";
  }
  summary = summary.slice(0, 1200);

  // Education: section lines (re-joining PDF wraps), else a degree mention.
  let education = joinWrapped(educationLines).slice(0, 3).join(" · ");
  if (!education) education = (flat.match(DEGREE_RE)?.[1] ?? "").replace(/\s+/g, " ").trim();
  education = education.slice(0, 300);

  const hasExperience = experienceLines.length > 0;
  const studentContext = `${summary} ${educationLines.join(" ")} ${headline.join(" ")}`;
  const isStudent = STUDENT_RE.test(studentContext);

  // Title: headline under the name → first role in the experience section →
  // "<Title> with N years…" opening of the summary → student fallback.
  let currentTitle = "";
  for (const line of headline.slice(0, 4)) {
    currentTitle = titleFromSegments(line);
    if (currentTitle) break;
  }
  if (!currentTitle) {
    for (const line of experienceLines.slice(0, 4)) {
      currentTitle = titleFromSegments(line);
      if (currentTitle) break;
    }
  }
  if (!currentTitle && summary) {
    const opening = summary.slice(0, 90);
    const match = opening.match(TITLE_IN_TEXT);
    if (match && !ASPIRATION_RE.test(opening.slice(0, match.index ?? 0))) {
      currentTitle = toTitleCase(match[0]);
    }
  }
  const employmentTitle = currentTitle;
  if (!currentTitle && isStudent) currentTitle = studentTitle(studentContext, education);

  // Years: explicit statement → span of dated roles in the experience section →
  // 0 for a student with no work history → unknown.
  let yearsExperience: number | null = null;
  const explicit = flat.match(EXPLICIT_YEARS) ?? flat.match(EXPLICIT_YEARS_ALT);
  if (explicit) {
    const years = Number.parseInt(explicit[1], 10);
    if (Number.isFinite(years) && years <= 50) yearsExperience = years;
  }
  if (yearsExperience === null && hasExperience) yearsExperience = yearsFromRanges(experienceLines.join(" "));
  if (yearsExperience === null && !hasExperience && isStudent) yearsExperience = 0;

  // Target role: stated objective → current employment title → skill-mix suggestion.
  let targetRole = "";
  let targetRoleSource: ResumeProfileDraft["targetRoleSource"] = "";
  const aspiration = summary.match(ASPIRATION_RE);
  if (aspiration && aspiration.index !== undefined) {
    const window = summary.slice(aspiration.index, aspiration.index + 110);
    const match = window.match(TITLE_IN_TEXT);
    if (match) {
      targetRole = toTitleCase(match[0]);
      targetRoleSource = "objective";
    }
  }
  if (!targetRole && employmentTitle) {
    targetRole = employmentTitle;
    targetRoleSource = "title";
  }
  if (!targetRole) {
    targetRole = suggestRoleFromSkills(skills);
    targetRoleSource = targetRole ? "skills" : "";
  }

  return {
    fullName: parsed.name.slice(0, 160),
    contactEmail: (text.match(EMAIL_RE)?.[0] ?? "").slice(0, 320),
    currentTitle: currentTitle.slice(0, 160),
    yearsExperience,
    education,
    summary,
    interests: joinWrapped(interestLines).join(", ").slice(0, 400),
    targetRole: targetRole.slice(0, 160),
    targetRoleSource,
    isStudent,
  };
}

/* ------------------------------- merge rules ----------------------------- */

function sameText(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Builds the profile patch for a newly uploaded resume.
 *
 * @param current      profile as stored now
 * @param draft        extraction from the new resume
 * @param priorDrafts  extractions from the user's earlier resumes
 * @param sample       seeded sample values (sample workspace only), else null
 */
export function buildProfilePatch(
  current: ProfileFields,
  draft: ResumeProfileDraft,
  priorDrafts: ResumeProfileDraft[],
  sample: Partial<ProfileFields> | null,
): { patch: Partial<ProfileFields>; changes: FieldChange[] } {
  const patch: Partial<ProfileFields> = {};
  const changes: FieldChange[] = [];

  /** True when the stored value was typed by the user rather than sample- or resume-derived. */
  const userAuthoredText = (field: Exclude<ProfileFieldKey, "yearsExperience">) => {
    const value = current[field];
    if (!value.trim()) return false;
    const sampleValue = sample?.[field];
    if (typeof sampleValue === "string" && sameText(sampleValue, value)) return false;
    return !priorDrafts.some((prior) => prior[field] && sameText(prior[field], value));
  };

  const setText = (field: Exclude<ProfileFieldKey, "yearsExperience">, value: string, kind: FieldChange["kind"]) => {
    if (value === current[field]) return;
    patch[field] = value;
    changes.push({ field, label: FIELD_LABELS[field], value: value.slice(0, 200), kind });
  };

  // Resume-owned fields: a detected value always wins; an undetected one is
  // cleared only if the stored value is not the user's own.
  for (const field of ["fullName", "contactEmail", "currentTitle", "education", "summary"] as const) {
    const detected = draft[field];
    if (detected) {
      setText(field, detected, "updated");
    } else if (field !== "fullName" && current[field].trim() && !userAuthoredText(field)) {
      setText(field, "", "cleared");
    }
  }

  if (draft.yearsExperience !== null) {
    if (draft.yearsExperience !== current.yearsExperience) {
      patch.yearsExperience = draft.yearsExperience;
      changes.push({ field: "yearsExperience", label: FIELD_LABELS.yearsExperience, value: String(draft.yearsExperience), kind: "updated" });
    }
  } else if (current.yearsExperience !== 0) {
    const fromSample = sample?.yearsExperience === current.yearsExperience;
    const fromResume = priorDrafts.some((prior) => prior.yearsExperience === current.yearsExperience);
    if (fromSample || fromResume) {
      patch.yearsExperience = 0;
      changes.push({ field: "yearsExperience", label: FIELD_LABELS.yearsExperience, value: "0", kind: "cleared" });
    }
  }

  // User-owned fields: the resume only fills these when the user has not set their own.
  if (!userAuthoredText("targetRole")) {
    const kind = !draft.targetRole ? "cleared" : draft.targetRoleSource === "skills" ? "suggested" : "updated";
    setText("targetRole", draft.targetRole, kind);
  }
  if (!userAuthoredText("interests")) {
    setText("interests", draft.interests, draft.interests ? "updated" : "cleared");
  }

  return { patch, changes };
}
