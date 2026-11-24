"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@frontend/components/icons";
import { EmptyState, Notice, PageHeader, StatCard } from "@frontend/components/ui";
import { STAGE_LABELS, STAGE_ORDER, api, formatDate, stageTone, timeAgo, toDateInput } from "@frontend/lib/client";
import type { ApplicationDTO } from "@frontend/lib/types";

type ApplicationsResponse = {
  applications: ApplicationDTO[];
  stats: {
    total: number;
    submitted: number;
    active: number;
    offers: number;
    rejected: number;
    interviews: number;
    byStage: Array<{ stage: string; count: number }>;
    offerRate: number;
  };
};

type FormState = {
  company: string;
  jobTitle: string;
  jobUrl: string;
  stage: string;
  notes: string;
  appliedAt: string;
  followUpAt: string;
  followUpNote: string;
};

const EMPTY_FORM: FormState = {
  company: "",
  jobTitle: "",
  jobUrl: "",
  stage: "applied",
  notes: "",
  appliedAt: toDateInput(new Date()),
  followUpAt: "",
  followUpNote: "",
};

export default function ApplicationsPage() {
  const [data, setData] = useState<ApplicationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load() {
    try {
      setData(await api<ApplicationsResponse>("/api/applications"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load applications.");
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

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError("");
    setNotice("");
  }

  function startEdit(application: ApplicationDTO) {
    setEditingId(application.id);
    setForm({
      company: application.company,
      jobTitle: application.jobTitle,
      jobUrl: application.jobUrl,
      stage: application.stage,
      notes: application.notes,
      appliedAt: toDateInput(application.appliedAt),
      followUpAt: toDateInput(application.followUpAt),
      followUpNote: application.followUpNote,
    });
    setShowForm(true);
    setError("");
    setNotice("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...form,
        appliedAt: form.appliedAt || null,
        followUpAt: form.followUpAt || null,
      };
      if (editingId) {
        await api(`/api/applications/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setNotice("Application updated.");
      } else {
        await api("/api/applications", { method: "POST", body: JSON.stringify(payload) });
        setNotice("Application added to your tracker.");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the application.");
    } finally {
      setSaving(false);
    }
  }

  async function moveStage(application: ApplicationDTO, stage: string) {
    setBusyId(application.id);
    setError("");
    try {
      await api(`/api/applications/${application.id}`, { method: "PATCH", body: JSON.stringify({ stage }) });
      await load();
      setNotice(`Moved ${application.company} to ${STAGE_LABELS[stage]}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the stage.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(application: ApplicationDTO) {
    if (!window.confirm(`Delete the application for ${application.company}? This removes its stage history.`)) return;
    setBusyId(application.id);
    setError("");
    try {
      await api(`/api/applications/${application.id}`, { method: "DELETE" });
      await load();
      setNotice("Application deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the application.");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const applications = data?.applications ?? [];
    return filter === "all" ? applications : applications.filter((application) => application.stage === filter);
  }, [data, filter]);

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 58 }} />
        <div className="grid-cards">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 110 }} />)}</div>
        <div className="skeleton" style={{ height: 280 }} />
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Applications"
        subtitle="Track every opportunity from interest to offer, with stage history and follow-up reminders."
        actions={<button type="button" className="btn btn-primary" onClick={startCreate}><Icon name="plus" size={15} /> Add application</button>}
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <div className="grid-cards">
        <StatCard label="Tracked" value={data?.stats.total ?? 0} icon="briefcase" />
        <StatCard label="Active pipeline" value={data?.stats.active ?? 0} sub="Applied, screening, interview, assessment" icon="trend" tone="blue" />
        <StatCard label="Interviews / assessments" value={data?.stats.interviews ?? 0} icon="mic" tone="violet" />
        <StatCard label="Offers" value={data?.stats.offers ?? 0} sub={`${data?.stats.offerRate ?? 0}% of submitted`} icon="check" tone="green" />
        <StatCard label="Rejected" value={data?.stats.rejected ?? 0} icon="alert" tone="red" />
      </div>

      {showForm ? (
        <section className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">{editingId ? "Edit application" : "New application"}</div>
              <p className="small muted" style={{ marginTop: 4 }}>Stage changes are recorded in the application history.</p>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); setError(""); }}>
              <Icon name="close" size={14} /> Close
            </button>
          </div>
          <form className="stack" onSubmit={submit} style={{ gap: 14 }}>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="company">Company</label>
                <input id="company" className="input" required value={form.company} onChange={(event) => update("company", event.target.value)} placeholder="Northwind Labs" />
              </div>
              <div className="field">
                <label className="label" htmlFor="jobTitle">Job title</label>
                <input id="jobTitle" className="input" required value={form.jobTitle} onChange={(event) => update("jobTitle", event.target.value)} placeholder="Senior Full Stack Engineer" />
              </div>
              <div className="field">
                <label className="label" htmlFor="jobUrl">Job URL</label>
                <input id="jobUrl" className="input" type="url" value={form.jobUrl} onChange={(event) => update("jobUrl", event.target.value)} placeholder="https://…" />
              </div>
              <div className="field">
                <label className="label" htmlFor="stage">Stage</label>
                <select id="stage" className="select" value={form.stage} onChange={(event) => update("stage", event.target.value)}>
                  {STAGE_ORDER.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="appliedAt">Application date</label>
                <input id="appliedAt" className="input" type="date" value={form.appliedAt} onChange={(event) => update("appliedAt", event.target.value)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="followUpAt">Follow-up reminder</label>
                <input id="followUpAt" className="input" type="date" value={form.followUpAt} onChange={(event) => update("followUpAt", event.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="followUpNote">Follow-up note</label>
              <input id="followUpNote" className="input" value={form.followUpNote} onChange={(event) => update("followUpNote", event.target.value)} placeholder="Send the portfolio link before the panel" />
            </div>
            <div className="field">
              <label className="label" htmlFor="notes">Notes</label>
              <textarea id="notes" className="textarea" rows={4} value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Contacts, interview prep, salary expectations…" />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : <Icon name="check" size={15} />}
                {saving ? "Saving…" : editingId ? "Save changes" : "Add application"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card card-pad">
        <div className="card-head wrap">
          <div>
            <div className="card-title">Pipeline</div>
            <p className="small muted" style={{ marginTop: 4 }}>{filtered.length} of {data?.applications.length ?? 0} applications</p>
          </div>
          <div className="scroll-x">
            {["all", ...STAGE_ORDER].map((stage) => (
              <button
                key={stage}
                type="button"
                className={`chip chip-btn ${filter === stage ? "chip-match" : ""}`}
                onClick={() => setFilter(stage)}
              >
                {stage === "all" ? "All" : STAGE_LABELS[stage]}
              </button>
            ))}
          </div>
        </div>

        {(data?.applications.length ?? 0) === 0 ? (
          <EmptyState icon="briefcase" title="No applications recorded" description="Add your first opportunity to track its stage, history and follow-ups." action={<button type="button" className="btn btn-sm btn-primary" onClick={startCreate}>Add application</button>} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="briefcase" title={`No applications at ${STAGE_LABELS[filter]}`} description="Try another stage filter or add a new application." />
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {filtered.map((application) => {
              const isOpen = expanded === application.id;
              return (
                <div key={application.id} className="card" style={{ padding: 16, background: "rgba(148,172,214,0.035)" }}>
                  <div className="row-between wrap" style={{ gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="row wrap" style={{ gap: 8 }}>
                        <span style={{ fontWeight: 650, fontSize: 14 }}>{application.company}</span>
                        <span className={`badge ${stageTone(application.stage)}`}>{STAGE_LABELS[application.stage] ?? application.stage}</span>
                      </div>
                      <div className="small muted" style={{ marginTop: 4 }}>
                        {application.jobTitle}
                        {application.appliedAt ? ` · applied ${formatDate(application.appliedAt)}` : ""}
                        {application.followUpAt ? ` · follow-up ${formatDate(application.followUpAt)}` : ""}
                      </div>
                    </div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <select
                        className="select"
                        style={{ width: 138 }}
                        value={application.stage}
                        aria-label={`Stage for ${application.company}`}
                        disabled={busyId === application.id}
                        onChange={(event) => void moveStage(application, event.target.value)}
                      >
                        {STAGE_ORDER.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
                      </select>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setExpanded(isOpen ? null : application.id)} aria-expanded={isOpen}>
                        <Icon name="file" size={13} /> {isOpen ? "Hide" : "Details"}
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => startEdit(application)} aria-label={`Edit ${application.company}`}>
                        <Icon name="settings" size={13} />
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => void remove(application)} disabled={busyId === application.id} aria-label={`Delete ${application.company}`}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </div>

                  {application.jobUrl ? (
                    <a href={application.jobUrl} target="_blank" rel="noreferrer noopener" className="small link row" style={{ gap: 4, marginTop: 8, display: "inline-flex" }}>
                      View job posting <Icon name="external" size={12} />
                    </a>
                  ) : null}

                  {isOpen ? (
                    <div className="grid-2" style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      <div>
                        <div className="tiny" style={{ marginBottom: 6 }}>Stage history</div>
                        <div className="stack" style={{ gap: 6 }}>
                          {application.history.length === 0 ? <span className="small muted">No history recorded.</span> : null}
                          {[...application.history].reverse().map((event) => (
                            <div key={event.id} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                              <span className="dot" style={{ marginTop: 6, color: "#7ea6ff" }} />
                              <div>
                                <div className="small soft">
                                  {event.fromStage ? `${STAGE_LABELS[event.fromStage] ?? event.fromStage} → ` : "Created · "}
                                  <strong>{STAGE_LABELS[event.toStage] ?? event.toStage}</strong>
                                </div>
                                <div className="muted" style={{ fontSize: 11.5 }}>{timeAgo(event.createdAt)}{event.note ? ` · ${event.note}` : ""}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {application.reminders.length ? (
                          <>
                            <div className="tiny" style={{ margin: "10px 0 6px" }}>Reminders</div>
                            {application.reminders.map((reminder) => (
                              <div key={reminder.id} className="small muted row" style={{ gap: 6 }}>
                                <Icon name="bell" size={12} /> {reminder.title} · {formatDate(reminder.dueAt)}
                              </div>
                            ))}
                          </>
                        ) : null}
                      </div>
                      <div>
                        <div className="tiny" style={{ marginBottom: 6 }}>Notes</div>
                        <p className="small soft">{application.notes || "No notes added."}</p>
                        {application.followUpNote ? (
                          <>
                            <div className="tiny" style={{ margin: "10px 0 6px" }}>Follow-up note</div>
                            <p className="small soft">{application.followUpNote}</p>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
