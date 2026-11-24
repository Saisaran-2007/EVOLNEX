"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@frontend/components/icons";
import { BarMeter, EmptyState, LineChart, Notice, PageHeader, SkillChips, StatCard } from "@frontend/components/ui";
import { api, formatDate } from "@frontend/lib/client";
import type { AnalyticsData } from "@frontend/lib/types";

const STAGE_LABELS: Record<string, string> = {
  interested: "Interested",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  assessment: "Assessment",
  offer: "Offer",
  rejected: "Rejected",
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<AnalyticsData>("/api/analytics")
      .then(setData)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load analytics."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 58 }} />
        <div className="grid-cards">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 110 }} />)}</div>
        <div className="skeleton" style={{ height: 280 }} />
      </div>
    );
  }

  if (error || !data) return <Notice tone="error">{error || "Analytics unavailable."}</Notice>;

  const hasAnyData =
    data.skills.total > 0 ||
    data.learning.historicalTasks > 0 ||
    data.projects.total > 0 ||
    data.interviews.sessions > 0 ||
    data.applications.total > 0;

  const maxActivity = Math.max(1, ...data.learningActivity.map((point) => point.value));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Progress Analytics"
        subtitle="Every metric on this page is calculated from your saved EVOLNEX records — no placeholder numbers."
        actions={<Link href="/roadmap" className="btn"><Icon name="map" size={15} /> Continue roadmap</Link>}
      />

      {!hasAnyData ? (
        <EmptyState
          icon="chart"
          title="No measurable activity yet"
          description="Add skills, generate a roadmap, practice an interview or track an application. Analytics populate automatically once records exist."
          action={<Link href="/profile" className="btn btn-primary btn-sm">Complete your profile</Link>}
        />
      ) : null}

      <div className="grid-cards">
        <StatCard label="Skills acquired" value={data.skills.total} sub={`${data.skills.fromResume} detected in resume`} icon="sparkles" tone="violet" />
        <StatCard label="Learning tasks" value={`${data.learning.tasksCompleted}/${data.learning.tasksTotal}`} sub={`${data.learning.completionRate}% of current roadmap`} icon="map" />
        <StatCard label="Projects completed" value={data.projects.completed} sub={`${data.projects.total} saved · ${data.projects.inProgress} in progress`} icon="layers" tone="green" />
        <StatCard label="Interviews practiced" value={data.interviews.sessions} sub={`${data.interviews.answersEvaluated} answers scored`} icon="mic" tone="blue" />
        <StatCard label="Average interview score" value={data.interviews.averageScore ?? "—"} sub={data.interviews.averageScore ? "Across scored answers" : "No scored answers yet"} icon="target" tone="amber" />
        <StatCard label="Applications" value={data.applications.total} sub={`${data.applications.offers} offer${data.applications.offers === 1 ? "" : "s"} · ${data.applications.responseRate}% response rate`} icon="briefcase" />
      </div>

      <div className="grid-2">
        <section className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">Interview performance by dimension</div>
              <p className="small muted" style={{ marginTop: 4 }}>Average of every scored answer you have submitted.</p>
            </div>
            <span className="badge">{data.interviews.answersEvaluated} samples</span>
          </div>
          {data.interviews.answersEvaluated === 0 ? (
            <EmptyState icon="mic" title="No scored answers yet" description="Complete a mock interview answer to populate dimension scoring." action={<Link href="/interview" className="btn btn-sm btn-primary">Start interview</Link>} />
          ) : (
            <div className="stack" style={{ gap: 9 }}>
              {data.interviews.dimensions.map((dimension) => (
                <BarMeter key={dimension.key} label={dimension.label} value={dimension.value} tone={dimension.value >= 75 ? "green" : "blue"} />
              ))}
            </div>
          )}
        </section>

        <section className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">Interview score trend</div>
              <p className="small muted" style={{ marginTop: 4 }}>Session-level scores in chronological order.</p>
            </div>
          </div>
          {data.interviews.trend.length === 0 ? (
            <EmptyState icon="trend" title="No session scores yet" description="Finish an interview session to record your first score." />
          ) : (
            <LineChart points={data.interviews.trend.map((point) => ({ label: point.label, value: point.value }))} />
          )}
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="kv"><span>Completed sessions</span><span>{data.interviews.completed}</span></div>
            <div className="kv"><span>Average score</span><span>{data.interviews.averageScore ?? "—"}</span></div>
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">Learning execution</div>
              <p className="small muted" style={{ marginTop: 4 }}>{data.learning.roadmapTitle ?? "No active roadmap"}</p>
            </div>
            <span className={`badge ${data.learning.completionRate >= 100 ? "badge-green" : "badge-blue"}`}>{data.learning.completionRate}%</span>
          </div>
          {data.learning.tasksTotal === 0 ? (
            <EmptyState icon="map" title="No roadmap tasks yet" description="Generate a learning roadmap to start tracking execution." action={<Link href="/roadmap" className="btn btn-sm btn-primary">Build roadmap</Link>} />
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              <div className="progress"><span style={{ width: `${data.learning.completionRate}%` }} /></div>
              <div className="kv"><span>Tasks completed</span><span>{data.learning.tasksCompleted} / {data.learning.tasksTotal}</span></div>
              <div className="kv"><span>Study hours completed</span><span>{data.learning.hoursCompleted}h / {data.learning.hoursPlanned}h</span></div>
              <div className="kv"><span>Tasks in all roadmaps</span><span>{data.learning.historicalTasks}</span></div>
              <div>
                <div className="tiny" style={{ marginBottom: 8 }}>Task completions · last 14 days</div>
                <div className="barchart">
                  {data.learningActivity.map((point) => (
                    <div
                      key={point.label}
                      className="bar"
                      style={{ height: `${Math.max(4, (point.value / maxActivity) * 100)}%` }}
                      title={`${point.label}: ${point.value} completed`}
                    />
                  ))}
                </div>
                <div className="row-between" style={{ marginTop: 4 }}>
                  <span className="tiny">{data.learningActivity[0]?.label}</span>
                  <span className="tiny">{data.learningActivity[data.learningActivity.length - 1]?.label}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">Application funnel</div>
              <p className="small muted" style={{ marginTop: 4 }}>Stage distribution across every tracked opportunity.</p>
            </div>
            <span className="badge">{data.applications.responseRate}% response</span>
          </div>
          {data.applications.total === 0 ? (
            <EmptyState icon="briefcase" title="No applications tracked" description="Add opportunities to unlock conversion analytics." action={<Link href="/applications" className="btn btn-sm btn-primary">Add application</Link>} />
          ) : (
            <div className="stack" style={{ gap: 9 }}>
              {data.applications.byStage.map((stage) => (
                <BarMeter
                  key={stage.stage}
                  label={STAGE_LABELS[stage.stage] ?? stage.stage}
                  value={data.applications.total ? (stage.count / data.applications.total) * 100 : 0}
                  tone={stage.stage === "offer" ? "green" : "blue"}
                />
              ))}
              <hr className="divider" />
              <div className="grid-2">
                <div className="kv"><span>Submitted</span><span>{data.applications.submitted}</span></div>
                <div className="kv"><span>Responded</span><span>{data.applications.responded}</span></div>
                <div className="kv"><span>Offers</span><span>{data.applications.offers}</span></div>
                <div className="kv"><span>Offer rate</span><span>{data.applications.offerRate}%</span></div>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="grid-2">
        <section className="card card-pad">
          <div className="card-head">
            <div className="card-title">Skill inventory</div>
            <span className="badge">{data.skills.total} skills</span>
          </div>
          <SkillChips skills={data.skills.list.map((skill) => skill.label)} tone="match" empty="No skills recorded yet." />
        </section>

        <section className="card card-pad">
          <div className="card-head">
            <div className="card-title">Next follow-ups</div>
            <Link href="/applications" className="small link">Open tracker</Link>
          </div>
          {data.applications.upcomingFollowUps.length === 0 ? (
            <p className="small muted">No upcoming follow-ups scheduled.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {data.applications.upcomingFollowUps.map((item) => (
                <div key={item.id} className="row-between small">
                  <span style={{ minWidth: 0 }}>
                    <span className="soft" style={{ fontWeight: 600 }}>{item.company}</span>
                    <span className="muted"> · {item.jobTitle}</span>
                  </span>
                  <span className="badge">{formatDate(item.followUpAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
