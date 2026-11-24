"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@frontend/components/icons";
import { BarMeter, CountUp, EmptyState, Notice, PageHeader, ScoreRing, StatCard } from "@frontend/components/ui";
import { api, formatDate, timeAgo } from "@frontend/lib/client";
import type { OverviewData } from "@frontend/lib/types";

const QUICK_LINKS: Array<{ href: string; title: string; body: string; icon: IconName }> = [
  { href: "/profile", title: "Complete your profile", body: "Keep resume, skills and target role current.", icon: "user" },
  { href: "/skills", title: "Run a job-fit analysis", body: "Compare your skills with a live job description.", icon: "sparkles" },
  { href: "/roadmap", title: "Work your roadmap", body: "Complete this week's learning tasks.", icon: "map" },
  { href: "/interview", title: "Practice an interview", body: "Generate questions and get scored feedback.", icon: "mic" },
];

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<OverviewData>("/api/overview")
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load your dashboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 64 }} />
        <div className="grid-cards">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton" style={{ height: 110 }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }

  if (error || !data) {
    return <Notice tone="error">{error || "Dashboard unavailable."}</Notice>;
  }

  const profileName = data.profile?.fullName?.trim() || "there";
  const targetRole = data.profile?.targetRole?.trim() || data.analysis?.jobTitle || "your target role";
  const currentRole = data.profile?.currentTitle?.trim() || "Add your current role in My Profile";
  const readiness = data.analysis?.readiness ?? null;
  const readinessTone = readiness === "ready" ? "green" : readiness === "developing" ? "amber" : "red";

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title={`Welcome back, ${profileName.split(" ")[0]}`}
        subtitle={`${currentRole} · targeting ${targetRole}. Here is the current state of your career intelligence workspace.`}
        actions={
          <>
            <Link href="/skills" className="btn btn-primary">
              <Icon name="sparkles" size={15} /> Run job-fit analysis
            </Link>
            <Link href="/roadmap" className="btn">
              <Icon name="map" size={15} /> Open roadmap
            </Link>
          </>
        }
      />

      <div className="grid-cards">
        <div className="card card-pad" style={{ gridColumn: "span 1" }}>
          <div className="stat-top" style={{ marginBottom: 10 }}>
            <span className="tiny">Profile saved</span>
            <span className={`badge ${data.profileCompletion.percent >= 100 ? "badge-green" : "badge-amber"}`}>
              {data.profileCompletion.percent}%
            </span>
          </div>
          <div className="progress"><span style={{ width: `${data.profileCompletion.percent}%` }} /></div>
          <p className="small muted" style={{ marginTop: 10 }}>
            {data.profileCompletion.missing.length === 0
              ? "All profile fields, skills and resume are in place."
              : `Missing: ${data.profileCompletion.missing.slice(0, 3).join(", ")}${data.profileCompletion.missing.length > 3 ? "…" : ""}`}
          </p>
        </div>

        <div className="card card-pad">
          <div className="stat-top" style={{ marginBottom: 10 }}>
            <span className="tiny">Resume</span>
            <span className={`badge ${data.resume ? "badge-green" : "badge-amber"}`}>
              {data.resume ? data.resume.status : "not uploaded"}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data.resume?.filename ?? "No resume uploaded yet"}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            {data.resume
              ? `${data.resume.skillsCount} skills extracted · ${timeAgo(data.resume.createdAt)}`
              : "Upload a PDF in My Profile to extract your skills automatically."}
          </p>
        </div>

        <div className="card card-pad">
          <div className="stat-top" style={{ marginBottom: 10 }}>
            <span className="tiny">Job-fit analysis</span>
            <span className={`badge ${data.analysis ? "badge-blue" : "badge-amber"}`}>
              {data.analysis ? "completed" : "not started"}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 650 }}>
            {data.analysis ? `${data.analysis.jobTitle} · ${data.analysis.fitScore}/100` : "No analysis yet"}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            {data.analysis ? `Last run ${timeAgo(data.analysis.createdAt)} · ${data.analysisCount} total` : "Paste a job description to measure your gap."}
          </p>
        </div>

        <div className="card card-pad">
          <div className="stat-top" style={{ marginBottom: 10 }}>
            <span className="tiny">Analysis engine</span>
            <span className={`badge ${data.ai.configured ? "badge-blue" : "badge-violet"}`}>
              {data.ai.configured ? "Gemini" : "Local engine"}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 650 }}>{data.ai.configured ? "AI generation enabled" : "Deterministic engine"}</div>
          <p className="small muted" style={{ marginTop: 8 }}>
            {data.ai.configured
              ? "All generation runs server-side with model fallback."
              : "Results are computed from your saved records and labelled as local."}
          </p>
        </div>
      </div>

      <div className="grid-cards">
        <StatCard label="Detected skills" value={<CountUp value={data.skills.length} />} sub={`${data.resume?.skillsCount ?? 0} from resume`} icon="sparkles" tone="violet" />
        <StatCard
          label="Career readiness"
          value={readiness ? readiness.replace(/^./, (char) => char.toUpperCase()) : "Not measured"}
          sub={data.analysis ? `${data.analysis.fitScore}/100 latest fit` : "Run a job-fit analysis"}
          icon="target"
          tone={readinessTone as "green" | "amber" | "red"}
        />
        <StatCard label="Roadmap progress" value={data.roadmap ? <CountUp value={data.roadmap.percent} suffix="%" /> : "—"} sub={data.roadmap ? `${data.roadmap.completed}/${data.roadmap.total} tasks` : "No roadmap yet"} icon="map" />
        <StatCard label="Portfolio projects" value={<CountUp value={data.projects.completed} />} sub={`${data.projects.active} in progress · ${data.projects.total} total`} icon="layers" tone="green" />
        <StatCard label="Interview practice" value={<CountUp value={data.interviews.answered} />} sub={`${data.interviews.sessions} sessions · ${data.interviews.averageScore ?? "—"} avg score`} icon="mic" tone="violet" />
        <StatCard label="Applications" value={<CountUp value={data.applications.total} />} sub={`${data.applications.active} active · ${data.applications.offers} offer${data.applications.offers === 1 ? "" : "s"}`} icon="briefcase" tone="amber" />
      </div>

      <div className="grid-2">
        <section className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">Career readiness</div>
              <p className="small muted" style={{ marginTop: 4 }}>
                {data.analysis ? `Measured against ${data.analysis.jobTitle}${data.analysis.company ? ` at ${data.analysis.company}` : ""}` : "No job-fit analysis saved yet"}
              </p>
            </div>
            {data.analysis ? <span className={`badge badge-${readinessTone}`}>{data.analysis.engine === "gemini" ? "Gemini" : "Local engine"}</span> : null}
          </div>
          {data.analysis ? (
            <div className="stack" style={{ gap: 16 }}>
              <div className="row wrap" style={{ gap: 22 }}>
                <ScoreRing value={data.analysis.fitScore} label="fit score" size={124} />
                <div className="grow" style={{ minWidth: 180 }}>
                  <p className="small soft">{data.analysis.summary}</p>
                  <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                    <span className="badge badge-green">{data.analysis.matchedSkills.length} matched</span>
                    <span className="badge badge-amber">{data.analysis.partialSkills.length} partial</span>
                    <span className="badge badge-red">{data.analysis.missingSkills.length} missing</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="tiny" style={{ marginBottom: 7 }}>Highest-priority gaps</div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {(data.analysis.missingSkills.length ? data.analysis.missingSkills : data.analysis.recommendedSkills).slice(0, 6).map((skill) => (
                    <span key={skill} className="chip chip-missing">{skill}</span>
                  ))}
                  {data.analysis.missingSkills.length === 0 ? <span className="small muted">No missing skills detected.</span> : null}
                </div>
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                <Link href="/skills" className="btn btn-sm">View full analysis <Icon name="arrow" size={13} /></Link>
                <Link href="/roadmap" className="btn btn-sm btn-ghost">Generate roadmap</Link>
              </div>
            </div>
          ) : (
            <EmptyState
              icon="target"
              title="No job-fit analysis yet"
              description="Paste a job description in Skill Intelligence to see matched, partial and missing requirements for your target role."
              action={<Link href="/skills" className="btn btn-primary btn-sm">Run first analysis</Link>}
            />
          )}
        </section>

        <div className="stack">
          <section className="card card-pad">
            <div className="card-head">
              <div className="card-title">Next learning task</div>
              {data.roadmap ? <span className="badge badge-blue">{data.roadmap.percent}% complete</span> : null}
            </div>
            {data.roadmap?.nextTask ? (
              <div className="stack" style={{ gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 650 }}>{data.roadmap.nextTask.title}</div>
                  <p className="small muted" style={{ marginTop: 5 }}>{data.roadmap.nextTask.description}</p>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="badge">Week {data.roadmap.nextTask.week}</span>
                  <span className="badge"><Icon name="clock" size={11} /> {data.roadmap.nextTask.durationHours}h</span>
                  <span className="badge badge-violet">{data.roadmap.nextTask.skill}</span>
                </div>
                <Link href="/roadmap" className="btn btn-sm">Open roadmap <Icon name="arrow" size={13} /></Link>
              </div>
            ) : data.roadmap ? (
              <Notice tone="success">Every task in this roadmap is complete. Generate the next roadmap to keep momentum.</Notice>
            ) : (
              <EmptyState
                icon="map"
                title="No roadmap yet"
                description="Generate a week-by-week plan from your latest skill-gap analysis."
                action={<Link href="/roadmap" className="btn btn-sm btn-primary">Build roadmap</Link>}
              />
            )}
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <div className="card-title">Application pipeline</div>
              <Link href="/applications" className="small link">Manage</Link>
            </div>
            {data.applications.total === 0 ? (
              <EmptyState icon="briefcase" title="No applications recorded" description="Add your first opportunity to start tracking stages and follow-ups." action={<Link href="/applications" className="btn btn-sm">Add application</Link>} />
            ) : (
              <div className="stack" style={{ gap: 9 }}>
                {["interested", "applied", "screening", "interview", "offer"].map((stage) => {
                  const count = data.applications.byStage.find((entry) => entry.key === stage)?.count ?? 0;
                  return <BarMeter key={stage} label={stage.replace(/^./, (char) => char.toUpperCase())} value={data.applications.total ? (count / data.applications.total) * 100 : 0} />;
                })}
                {data.reminders.length ? (
                  <>
                    <hr className="divider" />
                    <div className="tiny">Upcoming follow-ups</div>
                    {data.reminders.map((reminder) => (
                      <div key={reminder.id} className="row-between small">
                        <span className="soft">{reminder.title}</span>
                        <span className="muted">{formatDate(reminder.dueAt)}</span>
                      </div>
                    ))}
                  </>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="card card-pad">
        <div className="card-head">
          <div>
            <div className="card-title">Continue where you left off</div>
            <p className="small muted" style={{ marginTop: 4 }}>Quick access to every module in your workspace.</p>
          </div>
        </div>
        <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          {QUICK_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="quick-card">
              <Icon name={link.icon} />
              <div style={{ fontWeight: 650, fontSize: 13.5 }}>{link.title}</div>
              <p className="small muted">{link.body}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
