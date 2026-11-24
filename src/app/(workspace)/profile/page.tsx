"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@frontend/components/icons";
import { EmptyState, Notice, PageHeader, SkillChips } from "@frontend/components/ui";
import { api, formatDate, timeAgo } from "@frontend/lib/client";
import type { ProfileDTO, SkillDTO } from "@frontend/lib/types";

type ProfileResponse = {
  profile: ProfileDTO | null;
  completion: { percent: number; missing: string[] };
  skills: SkillDTO[];
  resumeSkills: Array<{ name: string; label: string }>;
  resume: { id: number; filename: string; status: string; processingNote: string; sizeBytes: number; createdAt: string; skillsCount: number } | null;
  account: { email: string; emailVerified: boolean };
};

type SyncResponse = {
  profileUpdates: Array<{ field: string; label: string; value: string; kind: "updated" | "cleared" | "suggested" }>;
  skillsAdded: string[];
  skillsRemoved: string[];
  skillsTotal: number;
  analysisRefresh: { jobTitle: string; company: string; previousScore: number; newScore: number; changed: boolean; engine: string } | null;
  analysisRefreshFailed: boolean;
  message: string;
};

type FormState = {
  fullName: string;
  contactEmail: string;
  currentTitle: string;
  yearsExperience: string;
  education: string;
  targetRole: string;
  interests: string;
  summary: string;
};

const EMPTY_FORM: FormState = {
  fullName: "",
  contactEmail: "",
  currentTitle: "",
  yearsExperience: "0",
  education: "",
  targetRole: "",
  interests: "",
  summary: "",
};

export default function ProfilePage() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [skillInput, setSkillInput] = useState("");
  const [flashed, setFlashed] = useState<Set<string>>(new Set());
  const [sync, setSync] = useState<SyncResponse | null>(null);
  const [resyncing, setResyncing] = useState(false);

  function flashClass(key: string, base: string) {
    return flashed.has(key) ? `${base} flash` : base;
  }
  const [loading, setLoading] = useState(true);
  const suggestedTarget = Boolean(
    sync?.profileUpdates.some((item) => item.field === "targetRole" && item.kind === "suggested" && item.value === form.targetRole),
  );
  const savedSkillNames = new Set((data?.skills ?? []).map((skill) => skill.name));
  const detectedOnly = (data?.resumeSkills ?? []).filter((skill) => !savedSkillNames.has(skill.name));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verifyLink, setVerifyLink] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function hydrate(payload: ProfileResponse) {
    setData(payload);
    if (payload.profile) {
      setForm({
        fullName: payload.profile.fullName ?? "",
        contactEmail: payload.profile.contactEmail ?? "",
        currentTitle: payload.profile.currentTitle ?? "",
        yearsExperience: String(payload.profile.yearsExperience ?? 0),
        education: payload.profile.education ?? "",
        targetRole: payload.profile.targetRole ?? "",
        interests: payload.profile.interests ?? "",
        summary: payload.profile.summary ?? "",
      });
    }
  }

  async function load() {
    try {
      const payload = await api<ProfileResponse>("/api/profile");
      hydrate(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function update(key: keyof FormState, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function save(nextSkills?: string[], successMessage = "Profile saved.") {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const skillNames = nextSkills ?? (data?.skills ?? []).map((skill) => skill.name);
      await api<ProfileResponse>("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ ...form, yearsExperience: Number(form.yearsExperience) || 0, skills: skillNames }),
      });
      await load();
      setNotice(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function addSkill() {
    const name = skillInput.trim();
    if (!name || !data) return;
    const existing = data.skills.map((skill) => skill.name.toLowerCase());
    if (existing.includes(name.toLowerCase())) {
      setError("That skill is already in your profile.");
      return;
    }
    setSkillInput("");
    await save([...data.skills.map((skill) => skill.name), name], `Added ${name}.`);
  }

  async function removeSkill(name: string) {
    if (!data) return;
    await save(data.skills.filter((skill) => skill.name !== name).map((skill) => skill.name), `Removed ${name}.`);
  }

  async function uploadResume(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api<SyncResponse>("/api/resume", { method: "POST", body });
      await load();
      showSync(result);
      setNotice(`Resume processed. ${result.message}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resume upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function showSync(result: SyncResponse) {
    setSync(result);
    const fields = result.profileUpdates.map((item) => item.field);
    if (fields.length > 0) {
      setFlashed(new Set(fields));
      window.setTimeout(() => setFlashed(new Set()), 2800);
    }
  }

  async function resync() {
    setResyncing(true);
    setError("");
    setNotice("");
    try {
      const result = await api<SyncResponse>("/api/resume/sync", { method: "POST" });
      await load();
      showSync(result);
      setNotice(`Resume re-applied. ${result.message}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not re-apply the resume. Please try again.");
    } finally {
      setResyncing(false);
    }
  }

  async function resendVerification() {
    setError("");
    setNotice("");
    try {
      const result = await api<{ alreadyVerified: boolean; verificationUrl: string | null; message?: string }>("/api/auth/verify-email", { method: "POST" });
      if (result.alreadyVerified) {
        setNotice("Your email is already verified.");
        return;
      }
      setVerifyLink(result.verificationUrl);
      setNotice(result.message ?? "Verification link issued.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not issue a verification link.");
    }
  }

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 60 }} />
        <div className="skeleton" style={{ height: 420 }} />
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="My Profile"
        subtitle="Your profile powers every analysis, roadmap and project recommendation in EVOLNEX."
        actions={
          <>
            <Link href="/skills" className="btn btn-ghost"><Icon name="sparkles" size={15} /> Skill intelligence</Link>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? <span className="spinner" /> : <Icon name="check" size={15} />}
              {saving ? "Saving…" : "Save profile"}
            </button>
          </>
        }
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {sync ? (
        <div className="alert alert-info" role="status">
          <Icon name="sparkles" size={15} style={{ flex: "0 0 15px", marginTop: 2 }} />
          <div className="stack" style={{ gap: 10 }}>
            <div>
              <strong>{sync.profileUpdates.length > 0 ? "Your profile now reflects this resume." : "Your profile already matched this resume."}</strong>
              {sync.profileUpdates.length > 0 ? (
                <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                  {sync.profileUpdates.map((item) => (
                    <span
                      key={item.field}
                      className={`chip ${item.kind === "cleared" ? "chip-partial" : "chip-match"}`}
                      title={item.value || "Not stated on the resume"}
                    >
                      {item.label}
                      {item.kind === "cleared" ? " · reset" : item.kind === "suggested" ? " · suggested" : ""}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {sync.skillsAdded.length > 0 || sync.skillsRemoved.length > 0 ? (
              <div className="small">
                Skills now match the resume: {sync.skillsAdded.length} added
                {sync.skillsAdded.length > 0 ? ` (${sync.skillsAdded.slice(0, 8).join(", ")}${sync.skillsAdded.length > 8 ? "…" : ""})` : ""}
                , {sync.skillsRemoved.length} removed
                {sync.skillsRemoved.length > 0 ? ` (${sync.skillsRemoved.slice(0, 8).join(", ")}${sync.skillsRemoved.length > 8 ? "…" : ""})` : ""}.
                Skills you added by hand are kept.
              </div>
            ) : null}
            {sync.analysisRefresh ? (
              <div className="small">
                Job fit for <strong>{sync.analysisRefresh.jobTitle}</strong>{" "}
                {sync.analysisRefresh.changed
                  ? `re-scored: ${sync.analysisRefresh.previousScore} → ${sync.analysisRefresh.newScore}.`
                  : `re-checked: still ${sync.analysisRefresh.newScore}.`}{" "}
                <Link href="/skills" className="link">View analysis</Link>
              </div>
            ) : null}
            {sync.analysisRefreshFailed ? (
              <div className="small">Your saved job-fit analysis could not be re-scored automatically. Re-run it in Skill Intelligence.</div>
            ) : null}
            <div className="small muted">
              Roadmap and Project Lab are not regenerated automatically, so your progress is not lost — regenerate them when you want them rebuilt for this resume.
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid-cards">
        <div className="card card-pad">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="tiny">Profile completion</span>
            <span className={`badge ${(data?.completion.percent ?? 0) >= 100 ? "badge-green" : "badge-amber"}`}>{data?.completion.percent ?? 0}%</span>
          </div>
          <div className="progress"><span style={{ width: `${data?.completion.percent ?? 0}%` }} /></div>
          <p className="small muted" style={{ marginTop: 10 }}>
            {data?.completion.missing.length ? `To complete: ${data.completion.missing.join(", ")}` : "Everything is in place. Keep it current."}
          </p>
        </div>
        <div className="card card-pad">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="tiny">Skills recorded</span>
            <span className="badge badge-violet">{(data?.skills.length ?? 0) + detectedOnly.length}</span>
          </div>
          <p className="small muted">{data?.skills.length ?? 0} saved in profile · {detectedOnly.length} additional detected in resume</p>
        </div>
        <div className="card card-pad">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="tiny">Account email</span>
            <span className={`badge ${data?.account.emailVerified ? "badge-green" : "badge-amber"}`}>{data?.account.emailVerified ? "verified" : "unverified"}</span>
          </div>
          <p className="small soft" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{data?.account.email}</p>
          {!data?.account.emailVerified ? (
            <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={resendVerification}>Send verification link</button>
          ) : null}
          {verifyLink ? <Link href={verifyLink} className="link small" style={{ display: "block", marginTop: 6 }}>Open verification link</Link> : null}
        </div>
      </div>

      <div className="grid-2">
        <section className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">Professional details</div>
              <p className="small muted" style={{ marginTop: 4 }}>Used to calibrate difficulty, roles and recommendations.</p>
            </div>
          </div>
          <div className="stack" style={{ gap: 14 }}>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="fullName">Full name</label>
                <input id="fullName" className={flashClass("fullName", "input")} value={form.fullName} onChange={(event) => update("fullName", event.target.value)} placeholder="Your full name" />
              </div>
              <div className="field">
                <label className="label" htmlFor="contactEmail">Contact email</label>
                <input id="contactEmail" className={flashClass("contactEmail", "input")} type="email" value={form.contactEmail} onChange={(event) => update("contactEmail", event.target.value)} placeholder="you@example.com" />
              </div>
              <div className="field">
                <label className="label" htmlFor="currentTitle">Current job title</label>
                <input id="currentTitle" className={flashClass("currentTitle", "input")} value={form.currentTitle} onChange={(event) => update("currentTitle", event.target.value)} placeholder="Frontend Developer" />
              </div>
              <div className="field">
                <label className="label" htmlFor="yearsExperience">Years of experience</label>
                <input id="yearsExperience" className={flashClass("yearsExperience", "input")} type="number" min={0} max={60} value={form.yearsExperience} onChange={(event) => update("yearsExperience", event.target.value)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="targetRole">Target job role</label>
                <input id="targetRole" className={flashClass("targetRole", "input")} value={form.targetRole} onChange={(event) => update("targetRole", event.target.value)} placeholder="Senior Full Stack Engineer" />
                {suggestedTarget ? (
                  <span className="helper">Suggested from the skills on your resume — change it to the role you actually want.</span>
                ) : null}
              </div>
              <div className="field">
                <label className="label" htmlFor="education">Education</label>
                <input id="education" className={flashClass("education", "input")} value={form.education} onChange={(event) => update("education", event.target.value)} placeholder="BSc Computer Science" />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="interests">Career interests</label>
              <input id="interests" className={flashClass("interests", "input")} value={form.interests} onChange={(event) => update("interests", event.target.value)} placeholder="Design systems, applied AI, developer tooling" />
            </div>
            <div className="field">
              <label className="label" htmlFor="summary">Professional summary</label>
              <textarea id="summary" className={flashClass("summary", "textarea")} rows={5} value={form.summary} onChange={(event) => update("summary", event.target.value)} placeholder="Two or three sentences on what you do, your strengths and the direction you are moving in." />
              <span className="helper">This summary is included in AI prompts, so keep it specific and current.</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
                {saving ? <span className="spinner" /> : <Icon name="check" size={15} />} Save changes
              </button>
            </div>
          </div>
        </section>

        <div className="stack">
          <section className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">Resume</div>
                <p className="small muted" style={{ marginTop: 4 }}>PDF up to 8 MB. Text is extracted server-side.</p>
              </div>
              {data?.resume ? <span className="badge badge-green">{data.resume.status}</span> : <span className="badge badge-amber">not uploaded</span>}
            </div>

            <div className="stack" style={{ gap: 12 }}>
              <label
                htmlFor="resume-file"
                className="card"
                style={{
                  padding: 20,
                  borderStyle: "dashed",
                  cursor: uploading ? "wait" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "center",
                  background: "rgba(148,172,214,0.04)",
                }}
              >
                {uploading ? <span className="spinner" style={{ width: 18, height: 18, borderTopColor: "#5b8cff" }} /> : <Icon name="upload" size={20} style={{ color: "#9dbcff" }} />}
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{uploading ? "Extracting text and skills…" : "Click to upload your resume"}</div>
                <div className="small muted">PDF or plain text · updates your details, skills and job fit</div>
                <input
                  id="resume-file"
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain"
                  style={{ display: "none" }}
                  disabled={uploading}
                  onChange={(event) => void uploadResume(event.target.files?.[0])}
                />
              </label>

              {data?.resume ? (
                <div className="stack" style={{ gap: 10 }}>
                  <div className="row-between small">
                    <span className="row" style={{ gap: 7, minWidth: 0 }}>
                      <Icon name="file" size={14} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.resume.filename}</span>
                    </span>
                    <span className="muted">{timeAgo(data.resume.createdAt)}</span>
                  </div>
                  <p className="helper">{data.resume.processingNote}</p>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="badge badge-blue">{data.resume.skillsCount} skills</span>
                    <span className="badge">{(data.resume.sizeBytes / 1024).toFixed(0)} KB</span>
                    <span className="badge">uploaded {formatDate(data.resume.createdAt)}</span>
                  </div>
                  <button type="button" className="btn btn-sm" onClick={() => void resync()} disabled={resyncing || uploading}>
                    {resyncing ? <span className="spinner" /> : <Icon name="sparkles" size={13} />}
                    {resyncing ? "Re-applying…" : "Re-apply this resume to my profile"}
                  </button>
                </div>
              ) : (
                <EmptyState icon="file" title="No resume on file" description="Uploading a resume fills in your professional details and skills automatically." />
              )}
            </div>
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">Skills</div>
                <p className="small muted" style={{ marginTop: 4 }}>These are compared against every job description.</p>
              </div>
              <span className="badge">{data?.skills.length ?? 0} saved</span>
            </div>
            <div className="row" style={{ gap: 8, marginBottom: 12 }}>
              <input
                className="input"
                value={skillInput}
                onChange={(event) => setSkillInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addSkill();
                  }
                }}
                placeholder="Add a skill (e.g. Docker)"
                aria-label="Add skill"
              />
              <button type="button" className="btn" onClick={() => void addSkill()} disabled={saving || !skillInput.trim()}>
                <Icon name="plus" size={14} /> Add
              </button>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {(data?.skills ?? []).map((skill) => (
                <span key={skill.id} className="chip chip-match">
                  {skill.label}
                  <button
                    type="button"
                    onClick={() => void removeSkill(skill.name)}
                    aria-label={`Remove ${skill.label}`}
                    style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", padding: 0, display: "grid", placeItems: "center" }}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </span>
              ))}
              {(data?.skills.length ?? 0) === 0 ? <span className="small muted">No manual skills yet — add a few or upload a resume.</span> : null}
            </div>
            {detectedOnly.length > 0 ? (
              <>
                <hr className="divider" />
                <div className="tiny" style={{ marginBottom: 8 }}>Detected in resume (not yet added to profile)</div>
                <SkillChips skills={detectedOnly.map((skill) => skill.label)} tone="default" />
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ marginTop: 10 }}
                  disabled={saving}
                  onClick={() => void save([...(data?.skills ?? []).map((skill) => skill.name), ...detectedOnly.map((skill) => skill.name)], "Detected resume skills added to your profile.")}
                >
                  Add all detected skills
                </button>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
