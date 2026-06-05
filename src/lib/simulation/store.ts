import { create } from "zustand";
import type {
  SimState,
  Engineer,
  Job,
  SimEvent,
  AIRecommendation,
  TrafficZone,
  SystemMode,
  SimMode,
} from "./types";
import { makeRng, seedEngineers, seedJobs, newJob } from "./seed";

const TICK_MS = 1500; // base tick ~1.5s real-time = "5-15s operational moment"
const SIM_MINUTES_PER_TICK = 3;
const DAY_END_MIN = 540; // 17:00 (08:00 + 9h)
const WIND_DOWN_MIN = 30; // allow 30 sim-min of completion after EOD
const MAX_QUEUE = 3; // max jobs (current + queued) per engineer

let rng = makeRng(7);
let eventCounter = 0;
let recCounter = 0;
let jobCounter = 100;
let tickHandle: ReturnType<typeof setTimeout> | null = null;

function uid(p: string) {
  eventCounter++;
  return `${p}-${eventCounter}-${Date.now().toString(36)}`;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function trafficMultAt(x: number, y: number, zones: TrafficZone[]) {
  let m = 1;
  for (const z of zones) {
    const d = Math.sqrt((x - z.cx) ** 2 + (y - z.cy) ** 2);
    if (d < z.r) m *= z.multiplier;
  }
  return m;
}

function pushEvent(events: SimEvent[], e: Omit<SimEvent, "id">): SimEvent[] {
  const next = [{ ...e, id: uid("ev") }, ...events];
  return next.slice(0, 80);
}

interface Actions {
  start: () => void;
  stop: () => void;
  toggle: () => void;
  setSpeed: (s: SimState["speed"]) => void;
  setSystemMode: (m: SystemMode) => void;
  setSimMode: (m: SimMode) => void;
  freeze: () => void;
  reset: (seed?: number) => void;
  injectEmergency: () => void;
  recomputeAll: () => void;
  resolveSlaRisks: () => void;
  acceptRecommendation: (id: string) => void;
  rejectRecommendation: (id: string) => void;
  reassign: (jobId: string, toEngineerId: string) => void;
  selectEngineer: (id: string | null) => void;
  selectJob: (id: string | null) => void;
  tickOnce: () => void;
}

const initialEngineers = seedEngineers(8);
const initialJobs = seedJobs(14);

export const useSim = create<SimState & Actions>((set, get) => ({
  tick: 0,
  simTimeMinutes: 0,
  running: false,
  speed: 1,
  systemMode: "copilot",
  simMode: "scripted",
  frozen: false,
  engineers: initialEngineers,
  jobs: initialJobs,
  traffic: [],
  recommendations: [],
  dismissedRecs: [],
  dayEnded: false,

  events: [{
    id: uid("ev"),
    tick: 0,
    kind: "tick",
    message: "Control tower online. Optimal plan generated for 08:00 shift.",
    severity: "info",
  }],
  metrics: {
    slaHealth: 100,
    completed: 0,
    breached: 0,
    revenueProtected: 0,
    travelSavedMin: 0,
    aiAcceptedCount: 0,
    manualBaselineSla: 84,
  },
  selectedEngineer: null,
  selectedJob: null,

  start: () => {
    if (get().running) return;
    set({ running: true });
    schedule();
  },
  stop: () => {
    set({ running: false });
    if (tickHandle) clearTimeout(tickHandle);
    tickHandle = null;
  },
  toggle: () => (get().running ? get().stop() : get().start()),
  setSpeed: (s) => set({ speed: s }),
  setSystemMode: (m) => set({ systemMode: m }),
  setSimMode: (m) => {
    if (m === "scripted") rng = makeRng(7);
    if (m === "live") rng = makeRng(Date.now() & 0xffff);
    if (m === "stress") rng = makeRng(31);
    set({ simMode: m });
  },
  freeze: () => set((s) => ({ frozen: !s.frozen })),
  reset: (seed = 7) => {
    rng = makeRng(seed);
    jobCounter = 100;
    get().stop();
    set({
      tick: 0,
      simTimeMinutes: 0,
      engineers: seedEngineers(8, makeRng(seed + 1)),
      jobs: seedJobs(14, makeRng(seed + 2)),
      traffic: [],
      recommendations: [],
      dismissedRecs: [],
      dayEnded: false,
      events: [{ id: uid("ev"), tick: 0, kind: "tick", message: "Simulation reset.", severity: "info" }],

      metrics: {
        slaHealth: 100, completed: 0, breached: 0, revenueProtected: 0,
        travelSavedMin: 0, aiAcceptedCount: 0, manualBaselineSla: 84,
      },
      frozen: false,
      selectedEngineer: null,
      selectedJob: null,
    });
  },
  injectEmergency: () => {
    set((s) => {
      jobCounter++;
      const j = newJob(jobCounter, s.tick, rng, true);
      return {
        jobs: [...s.jobs, j],
        events: pushEvent(s.events, {
          tick: s.tick, kind: "emergency_injected", severity: "crit",
          message: `Emergency dispatched: ${j.title} @ ${j.customer} — SLA in ${j.slaDeadlineTick - s.tick} ticks`,
        }),
      };
    });
    get().recomputeAll();
  },
  recomputeAll: () => {
    const s = get();
    const fresh = computeRecommendations(s);
    const merged = mergeRecs(s.recommendations, fresh);
    set({
      recommendations: merged,
      events: pushEvent(s.events, {
        tick: s.tick, kind: "ai_recommendation", severity: "info",
        message: `Optimiser pass: ${merged.length} recommendation${merged.length === 1 ? "" : "s"} active.`,
      }),
    });
  },

  resolveSlaRisks: () => {
    const s = get();
    // accept all reassign recs targeting high-risk jobs
    const high = s.recommendations.filter((r) => {
      const j = s.jobs.find((x) => x.id === r.jobId);
      return j && j.riskScore > 55 && r.type === "reassign";
    });
    high.forEach((r) => get().acceptRecommendation(r.id));
    if (high.length === 0) {
      set({
        events: pushEvent(s.events, {
          tick: s.tick, kind: "ai_recommendation", severity: "ok",
          message: "No critical SLA actions needed — system within tolerance.",
        }),
      });
    }
  },
  acceptRecommendation: (id) => {
    const s = get();
    const r = s.recommendations.find((x) => x.id === id);
    if (!r) return;
    if (r.type === "reassign" && r.toEngineer) {
      get().reassign(r.jobId, r.toEngineer);
    }
    set((cur) => ({
      recommendations: cur.recommendations.filter((x) => x.id !== id),
      dismissedRecs: cur.dismissedRecs.includes(id) ? cur.dismissedRecs : [...cur.dismissedRecs, id],
      metrics: {
        ...cur.metrics,
        aiAcceptedCount: cur.metrics.aiAcceptedCount + 1,
        revenueProtected: cur.metrics.revenueProtected + r.revenueProtected,
        travelSavedMin: cur.metrics.travelSavedMin + r.travelReductionMin,
      },
      events: pushEvent(cur.events, {
        tick: cur.tick, kind: "reassigned", severity: "ok",
        message: `AI action accepted: ${r.reasoning}`,
      }),
    }));
  },
  rejectRecommendation: (id) => {
    set((s) => ({
      recommendations: s.recommendations.filter((x) => x.id !== id),
      dismissedRecs: s.dismissedRecs.includes(id) ? s.dismissedRecs : [...s.dismissedRecs, id],
      events: pushEvent(s.events, {
        tick: s.tick, kind: "ai_recommendation", severity: "warn",
        message: `Recommendation rejected by dispatcher.`,
      }),
    }));
  },

  reassign: (jobId, toEngineerId) => {
    set((s) => {
      const engineers = s.engineers.map((e) => ({
        ...e,
        currentJob: e.currentJob === jobId ? null : e.currentJob,
        nextJobs: e.nextJobs.filter((j) => j !== jobId),
      }));
      const to = engineers.find((e) => e.id === toEngineerId);
      if (to) {
        if (!to.currentJob) {
          to.currentJob = jobId;
          to.status = "en_route";
        } else {
          to.nextJobs = [...to.nextJobs, jobId];
        }
      }
      const jobs: Job[] = s.jobs.map((j) =>
        j.id === jobId
          ? { ...j, assignedEngineer: toEngineerId, status: (to?.currentJob === jobId ? "en_route" : "assigned") as Job["status"] }
          : j
      );
      return { engineers, jobs };
    });
  },
  selectEngineer: (id) => set({ selectedEngineer: id, selectedJob: null }),
  selectJob: (id) => set({ selectedJob: id, selectedEngineer: null }),

  tickOnce: () => stepTick(),
}));

function schedule() {
  if (tickHandle) clearTimeout(tickHandle);
  const s = useSim.getState();
  if (!s.running) return;
  const interval = TICK_MS / s.speed;
  tickHandle = setTimeout(() => {
    if (!useSim.getState().frozen) stepTick();
    schedule();
  }, interval);
}

function stepTick() {
  const s = useSim.getState();
  const tick = s.tick + 1;
  const simTimeMinutes = s.simTimeMinutes + SIM_MINUTES_PER_TICK;

  let engineers = s.engineers.map((e) => ({ ...e }));
  let jobs = s.jobs.map((j) => ({ ...j }));
  let traffic = s.traffic.filter((z) => z.expiresAtTick > tick);
  let events = s.events;

  // Auto-assign queued jobs to best idle engineer
  for (const job of jobs) {
    if (job.status === "queued") {
      const candidate = pickBestEngineer(job, engineers);
      if (candidate) {
        job.assignedEngineer = candidate.id;
        if (!candidate.currentJob) {
          candidate.currentJob = job.id;
          candidate.destination = job.location;
          candidate.status = "en_route";
          job.status = "en_route";
        } else {
          candidate.nextJobs.push(job.id);
          job.status = "assigned";
        }
      }
    }
  }

  // Engineer movement + delays
  const stressFactor = s.simMode === "stress" ? 2.2 : 1;
  for (const e of engineers) {
    if (e.delayUntil && tick >= e.delayUntil) {
      e.delayUntil = null;
      if (e.currentJob) e.status = "en_route";
      else e.status = "idle";
    }
    if (e.delayUntil) continue;
    if (rng() < 0.04 * stressFactor) {
      e.status = "delayed";
      const len = 2 + Math.floor(rng() * 4);
      e.delayUntil = tick + len;
      events = pushEvent(events, {
        tick, kind: "delay", severity: "warn",
        message: `${e.name} delayed (${len * SIM_MINUTES_PER_TICK} min) — traffic/site access`,
      });
      continue;
    }
    if (e.status === "en_route" && e.destination) {
      const tm = trafficMultAt(e.location.x, e.location.y, traffic);
      const baseStep = 32 * e.speedFactor / tm;
      const d = dist(e.location, e.destination);
      if (d <= baseStep) {
        e.location = { ...e.destination };
        e.destination = null;
        e.status = "working";
      } else {
        const t = baseStep / d;
        e.location = {
          x: e.location.x + (e.destination.x - e.location.x) * t,
          y: e.location.y + (e.destination.y - e.location.y) * t,
        };
      }
    }
  }

  // Job progression
  for (const job of jobs) {
    if (job.status === "in_progress" || job.status === "en_route") {
      const eng = engineers.find((e) => e.id === job.assignedEngineer);
      if (eng) {
        if (eng.status === "working" && eng.currentJob === job.id) {
          job.status = "in_progress";
          const stepProgress = (SIM_MINUTES_PER_TICK / job.durationBase) * 100 * eng.speedFactor * (0.85 + rng() * 0.4);
          job.progress = Math.min(100, job.progress + stepProgress);
          if (job.progress >= 100) {
            job.status = "completed";
            eng.currentJob = null;
            eng.fatigue = Math.min(100, eng.fatigue + 6);
            const next = eng.nextJobs.shift();
            if (next) {
              const nj = jobs.find((x) => x.id === next);
              if (nj) {
                eng.currentJob = nj.id;
                eng.destination = nj.location;
                eng.status = "en_route";
                nj.status = "en_route";
              }
            } else {
              eng.status = "idle";
            }
            events = pushEvent(events, {
              tick, kind: "job_completed", severity: "ok",
              message: `${job.id} completed at ${job.customer} — £${job.revenue} secured`,
            });
          }
        }
      }
    }

    // SLA risk recalc
    if (job.status !== "completed" && job.status !== "breached") {
      const remaining = job.slaDeadlineTick - tick;
      const eng = engineers.find((e) => e.id === job.assignedEngineer);
      const travelEta = eng && eng.destination
        ? dist(eng.location, eng.destination) / (32 * eng.speedFactor)
        : 0;
      const workRemaining = (1 - job.progress / 100) * (job.durationBase / SIM_MINUTES_PER_TICK);
      const eta = travelEta + workRemaining;
      let risk = 0;
      if (remaining <= 0) risk = 100;
      else {
        const ratio = eta / remaining;
        if (ratio < 0.5) risk = 10 + ratio * 40;
        else if (ratio < 0.9) risk = 30 + (ratio - 0.5) * 100;
        else risk = Math.min(100, 70 + (ratio - 0.9) * 300);
      }
      if (job.priority === "critical") risk = Math.min(100, risk + 8);
      if (job.priority === "high") risk = Math.min(100, risk + 4);
      job.riskScore = Math.round(risk);

      if (remaining <= 0 && job.progress < 100) {
        job.status = "breached";
        events = pushEvent(events, {
          tick, kind: "sla_breach", severity: "crit",
          message: `SLA BREACH on ${job.id} (${job.customer}) — £${job.penalty} exposure`,
        });
      }
    }
  }

  // Traffic shift event
  if (tick % 4 === 0 && rng() < 0.6) {
    traffic.push({
      id: uid("tz"),
      cx: 100 + rng() * 800,
      cy: 80 + rng() * 440,
      r: 80 + rng() * 120,
      multiplier: 1.4 + rng() * (s.simMode === "stress" ? 1.1 : 0.5),
      expiresAtTick: tick + 4 + Math.floor(rng() * 6),
    });
    events = pushEvent(events, {
      tick, kind: "traffic_shift", severity: "warn",
      message: `Traffic congestion building — travel times +${Math.round((traffic[traffic.length - 1].multiplier - 1) * 100)}%`,
    });
  }

  // Job injection
  const injectionChance = s.simMode === "stress" ? 0.45 : 0.2;
  if (rng() < injectionChance) {
    jobCounter++;
    const j = newJob(jobCounter, tick, rng, false);
    jobs.push(j);
    events = pushEvent(events, {
      tick, kind: "job_injected", severity: "info",
      message: `New job booked: ${j.title} @ ${j.customer}`,
    });
  }
  // Emergency
  if (rng() < (s.simMode === "stress" ? 0.08 : 0.025)) {
    jobCounter++;
    const j = newJob(jobCounter, tick, rng, true);
    jobs.push(j);
    events = pushEvent(events, {
      tick, kind: "emergency_injected", severity: "crit",
      message: `🚨 Emergency: ${j.title} @ ${j.customer}`,
    });
  }

  // Scripted demo waypoints
  if (s.simMode === "scripted") {
    if (tick === 6) {
      // first disruption — force a delay
      const e = engineers.find((x) => x.status === "en_route");
      if (e) {
        e.status = "delayed";
        e.delayUntil = tick + 3;
        events = pushEvent(events, {
          tick, kind: "delay", severity: "warn",
          message: `Scripted disruption: ${e.name} caught in traffic on ring road`,
        });
      }
    }
    if (tick === 14) {
      jobCounter++;
      const j = newJob(jobCounter, tick, rng, true);
      jobs.push(j);
      events = pushEvent(events, {
        tick, kind: "emergency_injected", severity: "crit",
        message: `🚨 Scripted: Aurora Hospital chiller down — critical patient ward`,
      });
    }
    if (tick === 22) {
      events = pushEvent(events, {
        tick, kind: "catastrophic", severity: "crit",
        message: `Cascade risk detected: 3 SLAs trending to breach within 40 min`,
      });
    }
  }

  // Metrics
  const total = jobs.length;
  const breached = jobs.filter((j) => j.status === "breached").length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const open = total - completed - breached;
  const atRisk = jobs.filter((j) => j.status !== "completed" && j.status !== "breached" && j.riskScore > 60).length;
  const slaHealth = total === 0 ? 100 : Math.max(0, Math.round(100 - (breached / total) * 100 - (atRisk / Math.max(1, open)) * 18));

  const metrics = {
    ...s.metrics,
    slaHealth,
    completed,
    breached,
  };

  // Prune dismissed IDs for jobs that no longer exist / are closed
  const dismissedRecs = pruneDismissed(s.dismissedRecs, jobs);

  // Generate recommendations
  const state: SimState = { ...s, tick, simTimeMinutes, engineers, jobs, traffic, events, metrics, recommendations: s.recommendations, dismissedRecs };
  const fresh = computeRecommendations(state);

  // Autopilot auto-accept top recs (and dismiss them so they don't reappear)
  const autoDismissed: string[] = [];
  let actionable = fresh;
  if (s.systemMode === "autopilot" && fresh.length > 0) {
    const top = fresh.slice(0, 2);
    for (const r of top) {
      if (r.type === "reassign" && r.toEngineer) {
        // perform reassignment immediately
        const to = engineers.find((e) => e.id === r.toEngineer);
        const job = jobs.find((j) => j.id === r.jobId);
        if (to && job) {
          // unassign from previous
          for (const e of engineers) {
            if (e.currentJob === job.id) { e.currentJob = null; e.status = "idle"; }
            e.nextJobs = e.nextJobs.filter((x) => x !== job.id);
          }
          if (!to.currentJob) {
            to.currentJob = job.id;
            to.destination = job.location;
            to.status = "en_route";
            job.status = "en_route";
          } else {
            to.nextJobs.push(job.id);
            job.status = "assigned";
          }
          job.assignedEngineer = to.id;
          metrics.aiAcceptedCount += 1;
          metrics.revenueProtected += r.revenueProtected;
          metrics.travelSavedMin += r.travelReductionMin;
          autoDismissed.push(r.id);
          events = pushEvent(events, {
            tick, kind: "reassigned", severity: "ok",
            message: `[AUTOPILOT] ${r.reasoning}`,
          });
        }
      }
    }
    actionable = fresh.filter((r) => !autoDismissed.includes(r.id));
  }

  // Merge with existing so unchanged recs keep their identity (no re-animation)
  const mergedRecs = mergeRecs(s.recommendations, actionable);
  const nextDismissed = autoDismissed.length
    ? [...dismissedRecs, ...autoDismissed.filter((id) => !dismissedRecs.includes(id))]
    : dismissedRecs;

  useSim.setState({
    tick,
    simTimeMinutes,
    engineers,
    jobs,
    traffic,
    events,
    metrics,
    recommendations: mergedRecs,
    dismissedRecs: nextDismissed,
  });
}


function pickBestEngineer(job: Job, engineers: Engineer[]): Engineer | null {
  // score by skill match + distance + load
  let best: Engineer | null = null;
  let bestScore = -Infinity;
  for (const e of engineers) {
    if (e.status === "delayed") continue;
    const skillMatch = e.skills.includes(job.skill) ? 1 : 0.4;
    const d = dist(e.location, job.location);
    const load = (e.currentJob ? 1 : 0) + e.nextJobs.length;
    const score = skillMatch * 100 - d * 0.1 - load * 25 + e.efficiency * 0.2 - e.fatigue * 0.1;
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function computeRecommendations(s: SimState): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const dismissed = new Set(s.dismissedRecs);
  const sorted = [...s.jobs]
    .filter((j) => j.status !== "completed" && j.status !== "breached")
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 6);

  for (const job of sorted) {
    if (job.riskScore < 40) continue;
    const currentEng = s.engineers.find((e) => e.id === job.assignedEngineer);
    let bestCandidate: Engineer | null = null;
    let bestGain = 0;
    for (const e of s.engineers) {
      if (e.id === job.assignedEngineer) continue;
      if (e.status === "delayed") continue;
      const skillMatch = e.skills.includes(job.skill) ? 1 : 0.5;
      const d = dist(e.location, job.location);
      const curD = currentEng ? dist(currentEng.location, job.location) : 1000;
      const load = (e.currentJob ? 1 : 0) + e.nextJobs.length;
      const gain = (curD - d) * 0.5 + (skillMatch - 0.7) * 80 - load * 15;
      if (gain > bestGain) { bestGain = gain; bestCandidate = e; }
    }
    if (bestCandidate && bestGain > 10) {
      const id = `R-reassign-${job.id}-${bestCandidate.id}`;
      if (dismissed.has(id)) continue;
      const slaImprovement = Math.min(70, Math.round(bestGain * 0.6 + job.riskScore * 0.2));
      const travelReductionMin = Math.max(5, Math.round(bestGain * 0.4));
      const conf = Math.min(98, 55 + Math.round(bestGain / 2));
      recs.push({
        id,
        type: "reassign",
        jobId: job.id,
        fromEngineer: currentEng?.id,
        toEngineer: bestCandidate.id,
        reasoning: `Reassign ${job.id} → ${bestCandidate.name.split(" ")[0]} cuts SLA breach risk ${slaImprovement}% and saves ${travelReductionMin} min travel`,
        slaImprovement,
        travelReductionMin,
        revenueProtected: Math.round(job.revenue * (slaImprovement / 100)),
        confidence: conf,
        createdAtTick: s.tick,
      });
    } else if (job.riskScore > 80) {
      const id = `R-escalate-${job.id}`;
      if (dismissed.has(id)) continue;
      recs.push({
        id,
        type: "escalate",
        jobId: job.id,
        reasoning: `Escalate ${job.id} — no viable rescue, notify ${job.customer} and pre-empt penalty`,
        slaImprovement: 0,
        travelReductionMin: 0,
        revenueProtected: Math.round(job.penalty * 0.4),
        confidence: 80,
        createdAtTick: s.tick,
      });
    }
  }
  return recs.slice(0, 5);
}

// Merge fresh recommendations with existing ones, preserving identity of
// already-shown cards so they don't re-animate every tick. Drops existing
// recs that are no longer relevant (job resolved / no longer suggested).
function mergeRecs(existing: AIRecommendation[], fresh: AIRecommendation[]): AIRecommendation[] {
  const freshById = new Map(fresh.map((r) => [r.id, r]));
  const kept = existing.filter((r) => freshById.has(r.id));
  const keptIds = new Set(kept.map((r) => r.id));
  const added = fresh.filter((r) => !keptIds.has(r.id));
  return [...kept, ...added].slice(0, 5);
}

// Prune dismissed IDs whose underlying job no longer exists or is closed,
// so the set doesn't grow forever and identical situations can resurface
// after a job completes/breaches.
function pruneDismissed(dismissed: string[], jobs: Job[]): string[] {
  const liveJobIds = new Set(
    jobs.filter((j) => j.status !== "completed" && j.status !== "breached").map((j) => j.id),
  );
  return dismissed.filter((id) => {
    // id format: R-<type>-<jobId>[-<engId>]
    const parts = id.split("-");
    const jobId = parts[2];
    return liveJobIds.has(jobId);
  });
}


// Auto-boot
if (typeof window !== "undefined") {
  setTimeout(() => useSim.getState().start(), 400);
}
