"use client";

import { useEffect, useState } from "react";
import { Icon } from "@frontend/components/icons";
import { BarMeter, EmptyState, EngineBadge, Notice, PageHeader, ScoreRing, StatCard } from "@frontend/components/ui";
import { api, timeAgo } from "@frontend/lib/client";
import type { InterviewQuestionDTO, InterviewSessionDTO } from "@frontend/lib/types";

type SessionList = {
  sessions: InterviewSessionDTO[];
  stats: { sessions: number; completed: number; answered: number; averageScore: number | null };
};

type ActiveSession = { session: InterviewSessionDTO; questions: InterviewQuestionDTO[] };

const DIMENSIONS = [
  ["relevance", "Relevance"],
  ["technical", "Technical accuracy"],
  ["clarity", "Clarity"],
  ["communication", "Communication"],
  ["problemSolving", "Problem solving"],
  ["completeness", "Completeness"],
] as const;

export default function InterviewPage() {
  const [list, setList] = useState<SessionList | null>(null);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [role, setRole] = useState("");
  const [difficulty, setDifficulty] = useState("mid");
  const [count, setCount] = useState("5");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const payload = await api<SessionList>("/api/interviews");
      setList(payload);
      if (!role && payload.sessions[0]) setRole(payload.sessions[0].role);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load interview history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function startSession() {
    setStarting(true);
    setError("");
    setWarning(null);
    setNotice("");
    try {
      const result = await api<{ session: InterviewSessionDTO; questions: InterviewQuestionDTO[]; warning: string | null; message: string }>(
        "/api/interviews",
        { method: "POST", body: JSON.stringify({ role, difficulty, count: Number(count) }) },
      );
      setActive({ session: result.session, questions: result.questions });
      setDrafts(Object.fromEntries(result.questions.map((question) => [question.id, question.answer ?? ""])));
      setWarning(result.warning);
      setNotice(result.message);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the interview.");
    } finally {
      setStarting(false);
    }
  }

  async function openSession(id: number) {
    setBusyId(id);
    setError("");
    setWarning(null);
    setNotice("");
    try {
      const result = await api<ActiveSession>(`/api/interviews/${id}`);
      setActive(result);
      setDrafts(Object.fromEntries(result.questions.map((question) => [question.id, question.answer ?? ""])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the session.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitAnswer(question: InterviewQuestionDTO) {
    if (!active) return;
    const answer = (drafts[question.id] ?? "").trim();
    if (answer.length < 10) {
      setError("Write at least a sentence before submitting — feedback needs substance to evaluate.");
      return;
    }
    setBusyId(question.id);
    setError("");
    setWarning(null);
    try {
      const result = await api<{
        question: InterviewQuestionDTO;
        session: InterviewSessionDTO;
        warning: string | null;
        message: string;
      }>(`/api/interviews/${active.session.id}/answers`, {
        method: "POST",
        body: JSON.stringify({ questionId: question.id, answer }),
      });
      setActive((previous) =>
        previous
          ? {
              session: result.session,
              questions: previous.questions.map((item) => (item.id === question.id ? result.question : item)),
            }
          : previous,
      );
      setWarning(result.warning);
      setNotice(result.message);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not evaluate the answer.");
    } finally {
      setBusyId(null);
    }
  }

  async function finishSession() {
    if (!active) return;
    setFinishing(true);
    setError("");
    try {
      const result = await api<{ session: InterviewSessionDTO; aggregate: { overallScore: number; summary: string; strengths: string[]; improvements: string[] }; message: string }>(
        `/api/interviews/${active.session.id}`,
        { method: "PATCH" },
      );
      setActive({ session: result.session, questions: active.questions });
      setNotice(result.message);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not finalise the session.");
    } finally {
      setFinishing(false);
    }
  }

  async function removeSession(id: number) {
    if (!window.confirm("Delete this interview session and its feedback?")) return;
    setBusyId(id);
    try {
      await api(`/api/interviews/${id}`, { method: "DELETE" });
      if (active?.session.id === id) setActive(null);
      await load();
      setNotice("Interview session deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the session.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 58 }} />
        <div className="skeleton" style={{ height: 260 }} />
      </div>
    );
  }

  const answeredCount = active?.questions.filter((question) => question.score !== null).length ?? 0;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Mock Interview"
        subtitle="Role-specific questions, structured scoring across six dimensions and a saved performance report."
        actions={active ? <EngineBadge engine={active.session.engine} /> : null}
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {warning ? <Notice tone="warn">{warning}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <div className="grid-cards">
        <StatCard label="Sessions" value={list?.stats.sessions ?? 0} icon="mic" />
        <StatCard label="Answers evaluated" value={list?.stats.answered ?? 0} icon="check" tone="green" />
        <StatCard label="Average score" value={list?.stats.averageScore ?? "—"} sub="Weighted across six dimensions" icon="target" tone="violet" />
        <StatCard label="Completed" value={list?.stats.completed ?? 0} icon="shield" tone="blue" />
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <section className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">Start a new session</div>
              <p className="small muted" style={{ marginTop: 4 }}>Questions are generated for the role and difficulty you choose.</p>
            </div>
          </div>
          <div className="stack" style={{ gap: 14 }}>
            <div className="field">
              <label className="label" htmlFor="role">Interview role</label>
              <input id="role" className="input" value={role} onChange={(event) => setRole(event.target.value)} placeholder="Senior Full Stack Engineer" />
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="difficulty">Difficulty</label>
                <select id="difficulty" className="select" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                  <option value="junior">Junior</option>
                  <option value="mid">Mid-level</option>
                  <option value="senior">Senior</option>
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="count">Questions</label>
                <select id="count" className="select" value={count} onChange={(event) => setCount(event.target.value)}>
                  {[3, 4, 5, 6, 8].map((value) => <option key={value} value={value}>{value} questions</option>)}
                </select>
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => void startSession()} disabled={starting || role.trim().length < 2}>
              {starting ? <span className="spinner" /> : <Icon name="sparkles" size={15} />}
              {starting ? "Preparing questions…" : "Generate interview"}
            </button>
            <p className="helper">Answers are evaluated server-side. If the AI service is unavailable, the local rubric is used and clearly labelled.</p>
          </div>

          <hr className="divider" />
          <div className="tiny" style={{ marginBottom: 8 }}>Session history</div>
          {(list?.sessions.length ?? 0) === 0 ? (
            <p className="small muted">No interview sessions yet.</p>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {(list?.sessions ?? []).slice(0, 6).map((session) => (
                <div key={session.id} className="row-between" style={{ gap: 8, border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px" }}>
                  <button type="button" onClick={() => void openSession(session.id)} style={{ background: "none", border: 0, color: "inherit", textAlign: "left", cursor: "pointer", minWidth: 0, flex: 1 }} disabled={busyId === session.id}>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.role}</span>
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      {session.difficulty} · {session.answeredCount ?? 0}/{session.questionCount ?? 0} answered · {timeAgo(session.createdAt)}
                    </span>
                  </button>
                  <span className={`badge ${session.status === "completed" ? "badge-green" : "badge-amber"}`}>{session.overallScore ?? "—"}</span>
                  <button type="button" className="btn btn-ghost btn-sm btn-danger" aria-label="Delete session" onClick={() => void removeSession(session.id)} disabled={busyId === session.id}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card card-pad">
          {!active ? (
            <EmptyState icon="mic" title="No active session" description="Start a new interview or reopen a previous session to review its questions and feedback." />
          ) : (
            <div className="stack" style={{ gap: 16 }}>
              <div className="card-head" style={{ marginBottom: 0 }}>
                <div>
                  <div className="card-title">{active.session.role}</div>
                  <p className="small muted" style={{ marginTop: 4 }}>
                    {active.session.difficulty} difficulty · {answeredCount}/{active.questions.length} answered
                    {active.session.status === "completed" ? " · completed" : " · in progress"}
                  </p>
                </div>
                <ScoreRing value={active.session.overallScore ?? null} size={82} label="avg" />
              </div>

              {active.session.summary ? <Notice tone="info">{active.session.summary}</Notice> : null}

              <div className="stack" style={{ gap: 16 }}>
                {active.questions.map((question) => (
                  <div key={question.id} className="card" style={{ padding: 16, background: "rgba(148,172,214,0.035)" }}>
                    <div className="row-between wrap" style={{ gap: 8, marginBottom: 8 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="week-num">{question.position}</span>
                        <span className="badge">{question.focus}</span>
                      </div>
                      {question.score !== null ? (
                        <span className={`badge ${question.score >= 75 ? "badge-green" : question.score >= 55 ? "badge-amber" : "badge-red"}`}>{question.score}/100</span>
                      ) : null}
                    </div>
                    <p style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.55 }}>{question.question}</p>
                    <textarea
                      className="textarea"
                      rows={4}
                      style={{ marginTop: 10 }}
                      placeholder="Structure your answer: direct response → evidence → outcome."
                      value={drafts[question.id] ?? ""}
                      onChange={(event) => setDrafts((previous) => ({ ...previous, [question.id]: event.target.value }))}
                    />
                    <div className="row-between wrap" style={{ gap: 8, marginTop: 8 }}>
                      <span className="helper">{(drafts[question.id] ?? "").trim().split(/\s+/).filter(Boolean).length} words</span>
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => void submitAnswer(question)} disabled={busyId === question.id}>
                        {busyId === question.id ? <span className="spinner" /> : <Icon name="sparkles" size={13} />}
                        {question.score !== null ? "Re-evaluate answer" : "Submit answer"}
                      </button>
                    </div>
                    {question.score !== null ? (
                      <div className="stack" style={{ gap: 10, marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                        <div className="stack" style={{ gap: 6 }}>
                          {DIMENSIONS.map(([key, label]) => (
                            <BarMeter key={key} label={label} value={question.scores?.[key] ?? 0} tone={key === "technical" ? "green" : "blue"} />
                          ))}
                        </div>
                        <p className="small soft">{question.feedback}</p>
                        {question.improvements.length ? (
                          <ul className="stack" style={{ gap: 5 }}>
                            {question.improvements.map((improvement, index) => (
                              <li key={index} className="row" style={{ gap: 7, alignItems: "flex-start" }}>
                                <span style={{ color: "#f4b740", marginTop: 2 }}><Icon name="arrow" size={12} /></span>
                                <span className="small muted">{improvement}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {active.session.status !== "completed" ? (
                <button type="button" className="btn btn-primary" onClick={() => void finishSession()} disabled={finishing || answeredCount === 0}>
                  {finishing ? <span className="spinner" /> : <Icon name="check" size={15} />}
                  {finishing ? "Calculating report…" : "Finish session and save report"}
                </button>
              ) : (
                <div className="card" style={{ padding: 16, background: "rgba(62,207,142,0.06)", borderColor: "rgba(62,207,142,0.25)" }}>
                  <div className="row-between" style={{ marginBottom: 8 }}>
                    <div className="card-title">Performance report</div>
                    <span className="badge badge-green">{active.session.overallScore ?? 0}/100</span>
                  </div>
                  <p className="small soft">{active.session.summary}</p>
                  <div className="grid-2" style={{ marginTop: 12 }}>
                    <div>
                      <div className="tiny" style={{ marginBottom: 6 }}>Strengths</div>
                      <ul className="stack" style={{ gap: 5 }}>
                        {active.session.strengths.map((strength, index) => <li key={index} className="small soft">{strength}</li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="tiny" style={{ marginBottom: 6 }}>Improvement areas</div>
                      <ul className="stack" style={{ gap: 5 }}>
                        {active.session.improvements.slice(0, 5).map((improvement, index) => <li key={index} className="small soft">{improvement}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
