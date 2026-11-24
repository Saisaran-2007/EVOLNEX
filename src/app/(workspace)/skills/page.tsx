"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@frontend/components/icons";
import { EmptyState, EngineBadge, Notice, PageHeader, ScoreRing, SkillChips } from "@frontend/components/ui";
import { api, timeAgo } from "@frontend/lib/client";
import type { AnalysisDTO } from "@frontend/lib/types";

type RunResponse = { analysis: AnalysisDTO; engine: string; warning: string | null };

export default function SkillIntelligencePage() {
  const [history, setHistory] = useState<AnalysisDTO[]>([]);
  const [current, setCurrent] = useState<AnalysisDTO | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await api<{ analyses: AnalysisDTO[] }>("/api/analysis");
      setHistory(data.analyses);
      if (data.analyses[0]) {
        setCurrent(data.analyses[0]);
        setJobTitle(data.analyses[0].jobTitle);
        setCompany(data.analyses[0].company);
        setJobDescription(data.analyses[0].jobDescription);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load analyses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setRunning(true);
    setError("");
    setWarning(null);
    try {
      const data = await api<RunResponse>("/api/analysis", {
        method: "POST",
        body: JSON.stringify({ jobTitle, company, jobDescription }),
      });
      setCurrent(data.analysis);
      setWarning(data.warning);
      setHistory((previous) => [data.analysis, ...previous]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The analysis could not be completed.");
      // Inputs stay intact so the user can retry without retyping the job description.
    } finally {
      setRunning(false);
    }
  }

  function selectAnalysis(analysis: AnalysisDTO) {
    setCurrent(analysis);
    setWarning(null);
    setJobTitle(analysis.jobTitle);
    setCompany(analysis.company);
    setJobDescription(analysis.jobDescription);
  }

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 58 }} />
        <div className="skeleton" style={{ height: 360 }} />
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Skill Intelligence"
        subtitle="Compare the skills in your profile and resume against a real job description, then act on the gap."
        actions={
          current ? (
            <>
              <EngineBadge engine={current.engine} />
              <Link href="/roadmap" className="btn btn-primary"><Icon name="map" size={15} /> Build roadmap from gaps</Link>
            </>
          ) : null
        }
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {warning ? <Notice tone="warn">{warning}</Notice> : null}

      <div className="grid-2" style={{ alignItems: "start" }}>
        <section className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">New job-fit analysis</div>
              <p className="small muted" style={{ marginTop: 4 }}>Paste the responsibilities and required stack for an accurate comparison.</p>
            </div>
          </div>
          <form className="stack" onSubmit={run} style={{ gap: 14 }}>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="jobTitle">Target job title</label>
                <input id="jobTitle" className="input" required value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Senior Full Stack Engineer" />
              </div>
              <div className="field">
                <label className="label" htmlFor="company">Company (optional)</label>
                <input id="company" className="input" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Northwind Labs" />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="jobDescription">Job description</label>
              <textarea
                id="jobDescription"
                className="textarea"
                rows={10}
                required
                minLength={80}
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="Paste the full job description here — responsibilities, required skills, years of experience…"
              />
              <span className="helper">{jobDescription.trim().length} characters · minimum 80 required. Your input is preserved if generation fails.</span>
            </div>
            <button type="submit" className="btn btn-primary" disabled={running || jobTitle.trim().length < 2 || jobDescription.trim().length < 80}>
              {running ? <span className="spinner" /> : <Icon name="sparkles" size={15} />}
              {running ? "Analysing your fit…" : "Run job-fit analysis"}
            </button>
          </form>

          <hr className="divider" />
          <div className="tiny" style={{ marginBottom: 8 }}>Analysis history</div>
          {history.length === 0 ? (
            <p className="small muted">No saved analyses yet.</p>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {history.slice(0, 8).map((analysis) => (
                <button
                  key={analysis.id}
                  type="button"
                  onClick={() => selectAnalysis(analysis)}
                  className={`row-between ${current?.id === analysis.id ? "" : ""}`}
                  style={{
                    background: current?.id === analysis.id ? "rgba(91,140,255,0.1)" : "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "9px 11px",
                    cursor: "pointer",
                    color: "inherit",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {analysis.jobTitle}
                    </span>
                    <span className="muted" style={{ fontSize: 11.5 }}>{analysis.company || "No company"} · {timeAgo(analysis.createdAt)}</span>
                  </span>
                  <span className={`badge ${analysis.fitScore >= 78 ? "badge-green" : analysis.fitScore >= 52 ? "badge-amber" : "badge-red"}`}>{analysis.fitScore}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card card-pad">
          {current ? (
            <div className="stack" style={{ gap: 16 }}>
              <div className="card-head" style={{ marginBottom: 0 }}>
                <div>
                  <div className="card-title">{current.jobTitle}</div>
                  <p className="small muted" style={{ marginTop: 4 }}>
                    {current.company || "Company not specified"} · analysed {timeAgo(current.createdAt)}
                  </p>
                </div>
                <span className={`badge ${current.readiness === "ready" ? "badge-green" : current.readiness === "developing" ? "badge-amber" : "badge-red"}`}>
                  {current.readiness}
                </span>
              </div>

              <div className="row wrap" style={{ gap: 20 }}>
                <ScoreRing value={current.fitScore} label="job fit" size={128} />
                <p className="small soft grow" style={{ minWidth: 180 }}>{current.summary}</p>
              </div>

              <div className="stack" style={{ gap: 12 }}>
                <div>
                  <div className="tiny" style={{ marginBottom: 7 }}>Matched skills · {current.matchedSkills.length}</div>
                  <SkillChips skills={current.matchedSkills} tone="match" empty="No direct matches detected." />
                </div>
                <div>
                  <div className="tiny" style={{ marginBottom: 7 }}>Partially matching · {current.partialSkills.length}</div>
                  <SkillChips skills={current.partialSkills} tone="partial" empty="No adjacent skills detected." />
                </div>
                <div>
                  <div className="tiny" style={{ marginBottom: 7 }}>Missing skills · {current.missingSkills.length}</div>
                  <SkillChips skills={current.missingSkills} tone="missing" empty="No missing requirements detected." />
                </div>
                {current.recommendedSkills.length ? (
                  <div>
                    <div className="tiny" style={{ marginBottom: 7 }}>Recommended to learn</div>
                    <SkillChips skills={current.recommendedSkills} tone="default" />
                  </div>
                ) : null}
              </div>

              <div>
                <div className="tiny" style={{ marginBottom: 7 }}>Readiness recommendations</div>
                <ul className="stack" style={{ gap: 8 }}>
                  {current.recommendations.map((recommendation, index) => (
                    <li key={index} className="row" style={{ gap: 9, alignItems: "flex-start" }}>
                      <span style={{ color: "#7ea6ff", flex: "0 0 auto", marginTop: 2 }}><Icon name="check" size={13} /></span>
                      <span className="small soft">{recommendation}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="row wrap" style={{ gap: 8 }}>
                <Link href="/roadmap" className="btn btn-sm btn-primary">Turn gaps into a roadmap</Link>
                <Link href="/projects" className="btn btn-sm">Find a matching project</Link>
                <span className="badge">{current.engine === "gemini" ? `Model: ${current.model}` : "Deterministic engine"}</span>
              </div>
            </div>
          ) : (
            <EmptyState
              icon="target"
              title="No job-fit analysis yet"
              description="Fill in the form and run your first analysis. EVOLNEX will show matched, partial and missing skills against your saved profile."
            />
          )}
        </section>
      </div>
    </div>
  );
}
