"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@frontend/components/icons";
import { EmptyState, EngineBadge, Notice, PageHeader } from "@frontend/components/ui";
import { api, timeAgo } from "@frontend/lib/client";
import type { RoadmapDTO, TaskDTO } from "@frontend/lib/types";

type RoadmapResponse = {
  roadmap: RoadmapDTO | null;
  tasks: TaskDTO[];
  history: Array<{ id: number; title: string; createdAt: string; engine: string }>;
  progress: { total: number; completed: number; percent: number; hours: number } | null;
};

export default function RoadmapPage() {
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pendingTask, setPendingTask] = useState<number | null>(null);
  const [targetRole, setTargetRole] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const payload = await api<RoadmapResponse>("/api/roadmap");
      setData(payload);
      if (payload.roadmap) setTargetRole(payload.roadmap.targetRole);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your roadmap.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function generate() {
    setGenerating(true);
    setError("");
    setWarning(null);
    setNotice("");
    try {
      const result = await api<{ engine: string; warning: string | null; message: string }>("/api/roadmap", {
        method: "POST",
        body: JSON.stringify({ targetRole }),
      });
      setWarning(result.warning);
      setNotice(result.message);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate a roadmap.");
    } finally {
      setGenerating(false);
    }
  }

  async function toggle(task: TaskDTO) {
    setPendingTask(task.id);
    setError("");
    try {
      const result = await api<{ task: TaskDTO; progress: { total: number; completed: number; percent: number }; message: string }>(
        `/api/roadmap/tasks/${task.id}`,
        { method: "PATCH", body: JSON.stringify({ completed: !task.completed }) },
      );
      setData((previous) =>
        previous
          ? {
              ...previous,
              tasks: previous.tasks.map((item) => (item.id === task.id ? result.task : item)),
              progress: previous.progress
                ? { ...previous.progress, total: result.progress.total, completed: result.progress.completed, percent: result.progress.percent }
                : previous.progress,
            }
          : previous,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the task.");
    } finally {
      setPendingTask(null);
    }
  }

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 58 }} />
        <div className="skeleton" style={{ height: 300 }} />
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    );
  }

  const weeks = Array.from(new Set((data?.tasks ?? []).map((task) => task.week))).sort((a, b) => a - b);
  const totalHours = (data?.tasks ?? []).reduce((total, task) => total + task.durationHours, 0);
  const completedHours = (data?.tasks ?? []).filter((task) => task.completed).reduce((total, task) => total + task.durationHours, 0);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Learning Roadmap"
        subtitle="A sequenced plan built from your recorded skill gaps. Progress is saved to your account instantly."
        actions={
          <>
            {data?.roadmap ? <EngineBadge engine={data.roadmap.engine} /> : null}
            <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={generating}>
              {generating ? <span className="spinner" /> : <Icon name="sparkles" size={15} />}
              {generating ? "Building plan…" : data?.roadmap ? "Generate new roadmap" : "Generate roadmap"}
            </button>
          </>
        }
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {warning ? <Notice tone="warn">{warning}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      {!data?.roadmap ? (
        <div className="grid-2" style={{ alignItems: "start" }}>
          <section className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">Build your first roadmap</div>
                <p className="small muted" style={{ marginTop: 4 }}>We use your latest job-fit gaps and target role to sequence the work.</p>
              </div>
            </div>
            <div className="stack" style={{ gap: 14 }}>
              <div className="field">
                <label className="label" htmlFor="targetRole">Target role</label>
                <input id="targetRole" className="input" value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="Senior Full Stack Engineer" />
                <span className="helper">Tip: run a job-fit analysis first so the plan targets the exact requirements you are missing.</span>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={generating}>
                {generating ? <span className="spinner" /> : <Icon name="map" size={15} />}
                {generating ? "Building plan…" : "Generate personalised roadmap"}
              </button>
              <Link href="/skills" className="small link">Run a job-fit analysis first <Icon name="arrow" size={12} /></Link>
            </div>
          </section>
          <EmptyState
            icon="map"
            title="No roadmap yet"
            description="Once generated, your roadmap appears here with weekly objectives, resources, exercises and completion tracking."
          />
        </div>
      ) : (
        <>
          <section className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">{data.roadmap.title}</div>
                <p className="small muted" style={{ marginTop: 4, maxWidth: 720 }}>{data.roadmap.summary}</p>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge badge-blue">{data.progress?.percent ?? 0}% complete</span>
                <span className="badge">Week {weeks.length} of {data.roadmap.estimatedWeeks}</span>
              </div>
            </div>
            <div className="progress"><span style={{ width: `${data.progress?.percent ?? 0}%` }} /></div>
            <div className="grid-cards" style={{ marginTop: 16 }}>
              <div><div className="tiny">Target role</div><div style={{ fontWeight: 600, marginTop: 4 }}>{data.roadmap.targetRole || "Not set"}</div></div>
              <div><div className="tiny">Tasks complete</div><div style={{ fontWeight: 600, marginTop: 4 }}>{data.progress?.completed ?? 0} / {data.progress?.total ?? 0}</div></div>
              <div><div className="tiny">Study time</div><div style={{ fontWeight: 600, marginTop: 4 }}>{completedHours}h of {totalHours}h</div></div>
              <div><div className="tiny">Focus skills</div><div className="row wrap" style={{ gap: 5, marginTop: 4 }}>{data.roadmap.focusSkills.slice(0, 4).map((skill) => <span key={skill} className="chip" style={{ fontSize: 11 }}>{skill}</span>)}</div></div>
            </div>
          </section>

          <div className="grid-2" style={{ alignItems: "start" }}>
            <div className="stack" style={{ gridColumn: "1 / -1" }}>
              {weeks.map((week) => {
                const tasks = (data.tasks ?? []).filter((task) => task.week === week);
                const done = tasks.filter((task) => task.completed).length;
                return (
                  <section key={week} className="card card-pad">
                    <div className="week-head">
                      <span className="week-num">W{week}</span>
                      <div className="grow">
                        <div style={{ fontSize: 13.5, fontWeight: 650 }}>Week {week}</div>
                        <div className="muted" style={{ fontSize: 11.5 }}>{done}/{tasks.length} tasks · {tasks.reduce((total, task) => total + task.durationHours, 0)}h planned</div>
                      </div>
                      {done === tasks.length && tasks.length > 0 ? <span className="badge badge-green">complete</span> : null}
                    </div>
                    {tasks.map((task) => (
                      <div key={task.id} className={`task ${task.completed ? "done" : ""}`}>
                        <button
                          type="button"
                          className={`task-check ${task.completed ? "done" : ""}`}
                          aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
                          aria-pressed={task.completed}
                          onClick={() => void toggle(task)}
                          disabled={pendingTask === task.id}
                        >
                          <Icon name="check" size={12} />
                        </button>
                        <div className="grow">
                          <div className="row-between wrap" style={{ gap: 8 }}>
                            <div className="task-title" style={{ fontWeight: 600, fontSize: 13.5 }}>{task.title}</div>
                            <div className="row" style={{ gap: 6 }}>
                              <span className="badge"><Icon name="clock" size={10} /> {task.durationHours}h</span>
                              <span className="badge badge-violet">{task.skill}</span>
                            </div>
                          </div>
                          <p className="small muted" style={{ marginTop: 5 }}>{task.description}</p>
                          {task.exercise ? <p className="small soft" style={{ marginTop: 5 }}><strong>Exercise:</strong> {task.exercise}</p> : null}
                          {task.resourceUrl ? (
                            task.resourceUrl.startsWith("/") ? (
                              <Link href={task.resourceUrl} className="small link" style={{ display: "inline-flex", gap: 4, marginTop: 7, alignItems: "center" }}>
                                {task.resourceLabel || "Open resource"} <Icon name="arrow" size={12} />
                              </Link>
                            ) : (
                              <a href={task.resourceUrl} target="_blank" rel="noreferrer noopener" className="small link" style={{ display: "inline-flex", gap: 4, marginTop: 7, alignItems: "center" }}>
                                {task.resourceLabel || "Open resource"} <Icon name="external" size={12} />
                              </a>
                            )
                          ) : null}
                          {task.completed && task.completedAt ? <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>Completed {timeAgo(task.completedAt)}</div> : null}
                        </div>
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>
          </div>

          {data.history.length > 1 ? (
            <section className="card card-pad">
              <div className="card-title" style={{ marginBottom: 10 }}>Previous roadmaps</div>
              <div className="stack" style={{ gap: 6 }}>
                {data.history.filter((item) => item.id !== data.roadmap?.id).map((item) => (
                  <div key={item.id} className="row-between small">
                    <span className="soft">{item.title}</span>
                    <span className="muted">{timeAgo(item.createdAt)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
