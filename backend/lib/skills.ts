/**
 * Deterministic skill extraction + normalization used by resume processing,
 * the local (non-AI) analysis engine and skill-gap calculations.
 */

export const SKILL_DICTIONARY: string[] = [
  // languages
  "javascript", "typescript", "python", "java", "c", "c++", "c#", "go", "rust", "ruby", "php", "kotlin", "swift", "scala", "sql", "bash",
  // frontend
  "react", "next.js", "vue", "angular", "svelte", "redux", "tailwind css", "css", "html", "sass", "vite", "webpack",
  // backend
  "node.js", "express", "fastapi", "django", "flask", "spring boot", "graphql", "rest api", "microservices", "grpc", "celery",
  // data
  "postgresql", "mysql", "sqlite", "mongodb", "redis", "elasticsearch", "dynamodb", "snowflake", "bigquery",
  // data science / ml
  "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch", "machine learning", "deep learning", "nlp", "llm", "data visualization", "airflow", "spark", "statistics",
  // cloud / devops
  "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "github actions", "ci/cd", "linux", "nginx", "observability", "prometheus",
  // product / qa / design
  "jest", "pytest", "cypress", "playwright", "unit testing", "selenium", "figma", "accessibility", "design systems",
  // professional
  // tools + computer science fundamentals
  "git", "github", "vercel", "streamlit", "lstm", "react router", "ui/ux design", "design thinking", "prototyping",
  "object-oriented programming", "operating systems", "computer networks", "dbms",
  "system design", "data structures", "algorithms", "agile", "scrum", "communication", "leadership", "problem solving", "stakeholder management", "product thinking", "technical writing",
];

const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  "node": "node.js",
  nodejs: "node.js",
  "node js": "node.js",
  reactjs: "react",
  "react.js": "react",
  "nextjs": "next.js",
  "next js": "next.js",
  postgres: "postgresql",
  "postgres sql": "postgresql",
  "ms sql": "mysql",
  "mongo": "mongodb",
  gcp: "gcp",
  "google cloud": "gcp",
  "amazon web services": "aws",
  pytest_: "pytest",
  "rest": "rest api",
  "restful api": "rest api",
  "rest apis": "rest api",
  k8s: "kubernetes",
  "gh actions": "github actions",
  cicd: "ci/cd",
  "tailwind": "tailwind css",
  ml: "machine learning",
  "scikit learn": "scikit-learn",
  "sklearn": "scikit-learn",
  "power bi": "data visualization",
  "tableau": "data visualization",
  "dsa": "data structures",
  oop: "object-oriented programming",
  oops: "object-oriented programming",
  html5: "html",
  css3: "css",
  "ui/ux": "ui/ux design",
  "communication skills": "communication",
  "team leadership": "leadership",
  pyspark: "spark",
  "unit tests": "unit testing",
  "a11y": "accessibility",
};

export function canonicalSkill(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/[•|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/, "");
  if (!base) return "";
  if (ALIASES[base]) return ALIASES[base];
  const dictionaryMatch = SKILL_DICTIONARY.find((skill) => skill === base);
  if (dictionaryMatch) return dictionaryMatch;
  return base.length > 40 ? "" : base;
}

export function normalizeSkillList(list: unknown): string[] {
  const raw = Array.isArray(list) ? list : [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const canonical = canonicalSkill(item);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    output.push(canonical);
    if (output.length >= 60) break;
  }
  return output;
}

export function extractSkillsFromText(text: string): string[] {
  const haystack = ` ${text.toLowerCase().replace(/[\n\r]+/g, " ").replace(/[^a-z0-9+#./\- ]/g, " ").replace(/\s+/g, " ")} `;
  const found: string[] = [];
  const seen = new Set<string>();
  for (const [alias, target] of Object.entries(ALIASES)) {
    const needle = alias.includes(".") || alias.includes("/") ? alias : ` ${alias} `;
    if (haystack.includes(needle) && !seen.has(target)) {
      seen.add(target);
      found.push(target);
    }
  }
  for (const skill of SKILL_DICTIONARY) {
    const needle = ` ${skill} `;
    if (haystack.includes(needle) && !seen.has(skill)) {
      seen.add(skill);
      found.push(skill);
    }
  }
  return found;
}

export function skillLabel(skill: string) {
  const special: Record<string, string> = {
    javascript: "JavaScript",
    c: "C",
    git: "Git",
    pytorch: "PyTorch",
    lstm: "LSTM",
    dbms: "DBMS",
    "ui/ux design": "UI/UX Design",
    typescript: "TypeScript",
    python: "Python",
    java: "Java",
    "c++": "C++",
    "c#": "C#",
    "node.js": "Node.js",
    "next.js": "Next.js",
    "rest api": "REST API",
    "tailwind css": "Tailwind CSS",
    html: "HTML",
    css: "CSS",
    sql: "SQL",
    sqlite: "SQLite",
    mysql: "MySQL",
    postgresql: "PostgreSQL",
    mongodb: "MongoDB",
    redis: "Redis",
    graphql: "GraphQL",
    docker: "Docker",
    kubernetes: "Kubernetes",
    terraform: "Terraform",
    aws: "AWS",
    gcp: "GCP",
    azure: "Azure",
    "ci/cd": "CI/CD",
    github: "GitHub",
    fastapi: "FastAPI",
    django: "Django",
    flask: "Flask",
    "spring boot": "Spring Boot",
    "machine learning": "Machine Learning",
    "deep learning": "Deep Learning",
    nlp: "NLP",
    llm: "LLMs",
    figma: "Figma",
    "design systems": "Design Systems",
    "system design": "System Design",
    "data structures": "Data Structures",
    algorithms: "Algorithms",
  };
  if (special[skill]) return special[skill];
  return skill.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function titleCase(value: string) {
  return value
    .split(" ")
    .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}
