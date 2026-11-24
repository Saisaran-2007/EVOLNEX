"use client";

import { useEffect, useState } from "react";
import { Icon } from "@frontend/components/icons";
import { EmptyState, EngineBadge, Notice, PageHeader, SkillChips, StatCard } from "@frontend/components/ui";
import { api } from "@frontend/lib/client";
import type { ProjectDTO } from "@frontend/lib/types";

type ProjectsResponse = {
  projects: ProjectDTO[];
  stats: { total: number; notStarted: number; inProgress: number; completed: number };
};

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

const STATUS_TONE: Record<string, string> = {
  not_started: "badge",
  in_progress: "badge-amber",
  completed: "badge-green",
};

export default function ProjectsPage() {
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      setData(await api<ProjectsResponse>("/api/projects"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your projects.");
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
      const result = await api<{ warning: string | null; message: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setWarning(result.warning);
      setNotice(result.message);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate projects.");
    } finally {
      setGenerating(false);
    }
  }

  async function setStatus(project: ProjectDTO, status: string) {
    setBusyId(project.id);
    setError("");
    try {
      const result = await api<{ project: ProjectDTO }>(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setData((previous) =>
        previous
          ? { ...previous, projects: previous.projects.map((item) => (item.id === project.id ? result.project : item)) }
          : previous,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the project.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(project: ProjectDTO) {
    if (!window.confirm(`Remove "${project.title}" from your Project Lab?`)) return;
    setBusyId(project.id);
    setError("");
    try {
      await api(`/api/projects/${project.id}`, { method: "DELETE" });
      await load();
      setNotice("Project removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the project.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 58 }} />
        <div className="grid-cards">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 150 }} />)}</div>
      </div>
    );
  }

  const projects = data?.projects ?? [];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Project Lab"
        subtitle="Portfolio builds chosen to close your recorded gaps and give you interview-ready evidence."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={generating}>
            {generating ? <span className="spinner" /> : <Icon name="sparkles" size={15} />}
            {generating ? "Selecting projects…" : "Recommend projects"}
          </button>
        }
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {warning ? <Notice tone="warn">{warning}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <div className="grid-cards">
        <StatCard label="Projects saved" value={projects.length} icon="layers" />
        <StatCard label="In progress" value={data?.stats.inProgress ?? 0} icon="trend" tone="amber" />
        <StatCard label="Completed" value={data?.stats.completed ?? 0} icon="check" tone="green" />
        <StatCard label="Not started" value={data?.stats.notStarted ?? 0} icon="clock" tone="violet" />
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon="layers"
          title="No projects in your lab yet"
          description="Projects are matched to your target role and missing skills. Add a target role in your profile, then generate recommendations."
          action={<button type="button" className="btn btn-primary btn-sm" onClick={() => void generate()} disabled={generating}>Recommend my first projects</button>}
        />
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {projects.map((project) => {
            const isOpen = expanded === project.id;
            return (
              <section key={project.id} className="card card-pad">
                <div className="card-head" style={{ marginBottom: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <span className="card-title">{project.title}</span>
                      <span className={`badge ${STATUS_TONE[project.status] ?? "badge"}`}>{STATUS_OPTIONS.find((option) => option.value === project.status)?.label ?? project.status}</span>
                      <span className="badge badge-violet">{project.difficulty}</span>
                      <EngineBadge engine={project.engine} />
                    </div>
                    <p className="small muted" style={{ marginTop: 6 }}>{project.description}</p>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <select
                      className="select"
                      style={{ width: 150 }}
                      value={project.status}
                      aria-label={`Status for ${project.title}`}
                      disabled={busyId === project.id}
                      onChange={(event) => void setStatus(project, event.target.value)}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-sm btn-ghost btn-danger" aria-label={`Delete ${project.title}`} onClick={() => void remove(project)} disabled={busyId === project.id}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>

                <div className="grid-2" style={{ gap: 16 }}>
                  <div className="stack" style={{ gap: 10 }}>
                    <div>
                      <div className="tiny" style={{ marginBottom: 6 }}>Required skills</div>
                      <SkillChips skills={project.requiredSkills} tone="default" empty="No skill mapping recorded." />
                    </div>
                    <div>
                      <div className="tiny" style={{ marginBottom: 6 }}>Technologies</div>
                      <SkillChips skills={project.technologies} tone="match" empty="No stack recorded." />
                    </div>
                    <div>
                      <div className="tiny" style={{ marginBottom: 6 }}>Expected outcome</div>
                      <p className="small soft">{project.outcome || "—"}</p>
                    </div>
                  </div>
                  <div>
                    <button type="button" className="btn btn-sm" onClick={() => setExpanded(isOpen ? null : project.id)}>
                      <Icon name="map" size={13} /> {isOpen ? "Hide implementation steps" : `View ${project.steps.length} implementation steps`}
                    </button>
                    {isOpen ? (
                      <ol className="stack" style={{ gap: 8, marginTop: 12, paddingLeft: 0 }}>
                        {project.steps.map((step, index) => (
                          <li key={index} className="row" style={{ gap: 9, alignItems: "flex-start" }}>
                            <span className="week-num" style={{ width: 22, height: 22, flex: "0 0 22px", fontSize: 10.5 }}>{index + 1}</span>
                            <span className="small soft">{step}</span>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
