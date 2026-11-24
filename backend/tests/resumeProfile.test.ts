import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProfilePatch,
  extractProfileFromResume,
  suggestRoleFromSkills,
  type ProfileFields,
} from "@backend/lib/resumeProfile";
import { SAMPLE_PROFILE } from "@backend/lib/sampleData";
import { extractSkillsFromText } from "@backend/lib/skills";

const EXPERIENCED = `Priya Sharma
Senior Backend Engineer · priya.sharma@example.com · Amsterdam

SUMMARY
Backend engineer with 6 years of experience building distributed services in production.
I design REST API contracts and PostgreSQL schemas.

EXPERIENCE
Senior Backend Engineer — Helios Cloud (2021 - Present)
- Own Node.js and Python services.
Backend Developer — Datawise (2018 - 2021)

EDUCATION
MSc Computer Science, University of Amsterdam

SKILLS
Python, Node.js, PostgreSQL, Docker, Kubernetes, AWS, Redis, REST API, SQL`;

// Mirrors a typical student resume: ALL-CAPS name and headers, no work history,
// PDF-wrapped lines, club roles that must not be read as employment.
const STUDENT = `ARJUN MEHTA
| +91 9000000000 | arjun.mehta@example.com
GitHub: github.com/arjun-example
PROFESSIONAL SUMMARY
Computer Science and Engineering undergraduate at Example Institute of Technology, with a CGPA of
8.1/10.0. Possesses a foundation in programming, frontend and backend development. Brings
experience in student-club design activities, along with project-based development.
TECHNICAL SKILLS
Programming Languages: C, C++, Java, Python, JavaScript
Frontend Development: HTML5, CSS3, React.js, Vite
Backend Development: FastAPI, Node.js fundamentals, REST API integration
Databases: PostgreSQL, SQL
Computer Science Fundamentals: Object-Oriented Programming (OOP), Data Structures and Algorithms (DSA)
Tools and Platforms: Git, GitHub, Docker fundamentals
PROJECTS
NoteFlow – Notes Application | React.js, Vite, Python, FastAPI, PostgreSQL
• Worked on a full-stack notes application.
EDUCATION
Bachelor of Technology (B.Tech), Computer Science and Engineering | Example Institute of Technology,
Chennai
CGPA: 8.1/10.0
LEADERSHIP AND ACTIVITIES
Design Co-Lead – Computing Club
• Contribute to design for club events.
CERTIFICATIONS
• Example Cloud – AI Foundation`;

const draftOf = (text: string) => extractProfileFromResume(text, extractSkillsFromText(text));

test("experienced resume: every professional field is detected", () => {
  const draft = draftOf(EXPERIENCED);
  assert.equal(draft.fullName, "Priya Sharma");
  assert.equal(draft.contactEmail, "priya.sharma@example.com");
  assert.equal(draft.currentTitle, "Senior Backend Engineer");
  assert.equal(draft.yearsExperience, 6);
  assert.equal(draft.education, "MSc Computer Science, University of Amsterdam");
  assert.match(draft.summary, /^Backend engineer with 6 years/);
  assert.equal(draft.isStudent, false);
  assert.equal(draft.targetRole, "Senior Backend Engineer");
  assert.equal(draft.targetRoleSource, "title");
});

test("student resume: no employment is reported honestly, not left as stale data", () => {
  const draft = draftOf(STUDENT);
  assert.equal(draft.fullName, "Arjun Mehta", "ALL-CAPS names are normalised");
  assert.equal(draft.contactEmail, "arjun.mehta@example.com");
  assert.equal(draft.isStudent, true);
  assert.equal(draft.currentTitle, "Computer Science and Engineering Undergraduate");
  assert.equal(draft.yearsExperience, 0);
  assert.equal(
    draft.education,
    "Bachelor of Technology (B.Tech), Computer Science and Engineering | Example Institute of Technology, Chennai · CGPA: 8.1/10.0",
    "PDF-wrapped education lines are re-joined",
  );
  assert.match(draft.summary, /^Computer Science and Engineering undergraduate/);
  assert.equal(draft.targetRole, "Full Stack Developer");
  assert.equal(draft.targetRoleSource, "skills");
});

test("student resume: a club role is never mistaken for a job title", () => {
  assert.notEqual(draftOf(STUDENT).currentTitle, "Design Co-Lead");
});

test("years come from dated roles in the experience section only", () => {
  const text = `Sam Rivera
sam@example.com
EXPERIENCE
Web Development Intern, Acme Labs
Jun 2021 – Aug 2023
EDUCATION
BSc Computer Science, Example University (2010 - 2014)`;
  const draft = draftOf(text);
  assert.equal(draft.currentTitle, "Web Development Intern");
  assert.equal(draft.yearsExperience, 2, "education dates must not count as experience");
});

test("an aspiration in the summary is a target role, not the current title", () => {
  const text = `Lee Wong
lee@example.com
SUMMARY
Final-year Computer Science student seeking a position as a machine learning engineer after graduation.
EDUCATION
BSc Computer Science, Example University`;
  const draft = draftOf(text);
  assert.equal(draft.targetRole, "Machine Learning Engineer");
  assert.equal(draft.targetRoleSource, "objective");
  assert.equal(draft.currentTitle, "Computer Science Student");
});

test("skills: common resume spellings are recognised and OOP is not data structures", () => {
  const skills = extractSkillsFromText(STUDENT);
  for (const expected of ["html", "css", "react", "c", "git", "github", "object-oriented programming", "fastapi"]) {
    assert.ok(skills.includes(expected), `expected "${expected}" in ${skills.join(", ")}`);
  }
  assert.ok(!extractSkillsFromText("Strong OOP background").includes("data structures"));
});

test("role suggestion follows the skill mix", () => {
  assert.equal(suggestRoleFromSkills(["react", "javascript", "css"]), "Frontend Developer");
  assert.equal(suggestRoleFromSkills(["react", "html", "fastapi", "postgresql"]), "Full Stack Developer");
  assert.equal(suggestRoleFromSkills(["pytorch", "machine learning", "nlp", "python"]), "Machine Learning Engineer");
  assert.equal(suggestRoleFromSkills([]), "");
});

const profile = (overrides: Partial<ProfileFields> = {}): ProfileFields => ({
  fullName: "",
  contactEmail: "",
  currentTitle: "",
  yearsExperience: 0,
  education: "",
  targetRole: "",
  interests: "",
  summary: "",
  ...overrides,
});

test("merge: sample values the resume cannot confirm are replaced, not kept", () => {
  // The reported bug: a student resume left the sample title, years and target role in place.
  const { patch } = buildProfilePatch(SAMPLE_PROFILE, draftOf(STUDENT), [], SAMPLE_PROFILE);
  assert.equal(patch.fullName, "Arjun Mehta");
  assert.equal(patch.currentTitle, "Computer Science and Engineering Undergraduate");
  assert.equal(patch.yearsExperience, 0);
  assert.equal(patch.targetRole, "Full Stack Developer");
  assert.equal(patch.interests, "", "sample interests are cleared when the resume lists none");
});

test("merge: values the user typed survive when the resume does not provide them", () => {
  const current = profile({
    fullName: "Arjun Mehta",
    currentTitle: "Freelance Web Developer",
    targetRole: "Platform Engineer",
    interests: "Robotics",
    yearsExperience: 2,
  });
  const noTitle = `Arjun Mehta
arjun.mehta@example.com
EDUCATION
BSc Computer Science, Example University`;
  const { patch, changes } = buildProfilePatch(current, draftOf(noTitle), [], null);
  assert.equal(patch.currentTitle, undefined, "hand-typed title is kept");
  assert.equal(patch.targetRole, undefined, "hand-typed target role is kept");
  assert.equal(patch.interests, undefined, "hand-typed interests are kept");
  assert.equal(patch.yearsExperience, undefined, "hand-typed years are kept");
  assert.deepEqual(changes.map((change) => change.field).sort(), ["contactEmail", "education"]);
});

test("merge: values derived from the previous resume are replaced by the new one", () => {
  const previous = draftOf(EXPERIENCED);
  const current = profile({
    fullName: previous.fullName,
    contactEmail: previous.contactEmail,
    currentTitle: previous.currentTitle,
    yearsExperience: previous.yearsExperience ?? 0,
    education: previous.education,
    summary: previous.summary,
    targetRole: previous.targetRole,
  });
  const { patch } = buildProfilePatch(current, draftOf(STUDENT), [previous], null);
  assert.equal(patch.currentTitle, "Computer Science and Engineering Undergraduate");
  assert.equal(patch.yearsExperience, 0);
  assert.equal(patch.targetRole, "Full Stack Developer", "a target role taken from the old resume follows the new one");
});

test("merge: re-uploading the same resume changes nothing", () => {
  const draft = draftOf(EXPERIENCED);
  const current = profile({
    fullName: draft.fullName,
    contactEmail: draft.contactEmail,
    currentTitle: draft.currentTitle,
    yearsExperience: draft.yearsExperience ?? 0,
    education: draft.education,
    summary: draft.summary,
    targetRole: draft.targetRole,
  });
  const { patch, changes } = buildProfilePatch(current, draft, [draft], null);
  assert.deepEqual(patch, {});
  assert.equal(changes.length, 0);
});
