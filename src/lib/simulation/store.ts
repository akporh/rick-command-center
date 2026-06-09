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

// Average traffic multiplier sampled along a straight path between two points.
function pathTrafficMult(a: { x: number; y: number }, b: { x: number; y: number }, zones: TrafficZone[]) {
  if (zones.length === 0) return 1;
  const samples = 8;
  let sum = 0;
  for (let i = 1; i <= samples; i++) {
    const t = i / (samples + 1);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    sum += trafficMultAt(x, y, zones);
  }
  return sum / samples;
}

// Minutes until an engineer is free to start a brand-new job (current travel + work + queued backlog).
export function engineerAvailableMin(e: Engineer, jobs: Job[], traffic: TrafficZone[]): number {
  let mins = 0;
  if (e.status === "delayed") mins += 6; // assume short delay buffer
  if (e.status === "en_route" && e.destination) {
    const tm = pathTrafficMult(e.location, e.destination, traffic);
    const d = dist(e.location, e.destination);
    mins += (d / (32 * e.speedFactor)) * SIM_MINUTES_PER_TICK * tm;
  }
  if (e.currentJob) {
    const cj = jobs.find((j) => j.id === e.currentJob);
    if (cj) mins += (1 - cj.progress / 100) * cj.durationBase / Math.max(0.4, e.speedFactor);
  }
  for (const id of e.nextJobs) {
    const nj = jobs.find((j) => j.id === id);
    if (nj) mins += nj.durationBase / Math.max(0.4, e.speedFactor);
  }
  return mins;
}

// Time from engineer's "end of current commitments" location to a new job, accounting for traffic.
function travelToJobMin(e: Engineer, job: Job, traffic: TrafficZone[], jobs: Job[]): number {
  // Approximate engineer's end-of-queue location: destination if en_route, last queued job loc, else current loc
  let from = e.location;
  if (e.destination) from = e.destination;
  if (e.nextJobs.length > 0) {
    const last = jobs.find((j) => j.id === e.nextJobs[e.nextJobs.length - 1]);
    if (last) from = last.location;
  } else if (e.currentJob) {
    const cj = jobs.find((j) => j.id === e.currentJob);
    if (cj) from = cj.location;
  }
  const tm = pathTrafficMult(from, job.location, traffic);
  const d = dist(from, job.location);
  return (d / (32 * e.speedFactor)) * SIM_MINUTES_PER_TICK * tm;
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
const initialJobs = seedJobs(10);

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
  aiAssistedJobs: {},

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
      jobs: seedJobs(10, makeRng(seed + 2)),
      traffic: [],
      recommendations: [],
      dismissedRecs: [],
      dayEnded: false,
      aiAssistedJobs: {},
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
    set((cur) => {
      const prior = cur.aiAssistedJobs[r.jobId] ?? { revenue: 0, travel: 0 };
      return {
        recommendations: cur.recommendations.filter((x) => x.id !== id),
        dismissedRecs: cur.dismissedRecs.includes(id) ? cur.dismissedRecs : [...cur.dismissedRecs, id],
        aiAssistedJobs: {
          ...cur.aiAssistedJobs,
          [r.jobId]: { revenue: prior.revenue + r.revenueProtected, travel: prior.travel + r.travelReductionMin },
        },
        metrics: {
          ...cur.metrics,
          aiAcceptedCount: cur.metrics.aiAcceptedCount + 1,
        },
        events: pushEvent(cur.events, {
          tick: cur.tick, kind: "reassigned", severity: "ok",
          message: `AI action accepted: ${r.reasoning}`,
        }),
      };
    });
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
          ? { ...j, assignedEngineer: toEngineerId, status: (to?.currentJob === jobId ? "en_route" : "assigned") as Job["status"], lastReassignedTick: s.tick }
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
  let aiAssistedJobs = { ...s.aiAssistedJobs };
  // running deltas to apply to metrics this tick
  let metricsDelta = { revenueProtected: 0, travelSavedMin: 0, aiAcceptedCount: 0 };


  // Auto-assign queued jobs to best idle engineer (Copilot/Autopilot only — Manual leaves them unassigned)
  // Process most-urgent first: critical priority, then earliest SLA deadline.
  if (s.systemMode !== "manual") {
    const priWeight = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    const queuedSorted = jobs
      .filter((j) => j.status === "queued")
      .sort((a, b) => {
        const pa = priWeight[a.priority], pb = priWeight[b.priority];
        if (pa !== pb) return pa - pb;
        return a.slaDeadlineTick - b.slaDeadlineTick;
      });
    for (const job of queuedSorted) {
      const candidate = pickBestEngineer(job, engineers, jobs, traffic, tick);
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
    const delayChance = s.simMode === "stress" ? 0.05 : 0.012;
    if (rng() < delayChance) {
      e.status = "delayed";
      const len = 2 + Math.floor(rng() * 3);
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
            // Credit AI metrics ONLY when an AI-assisted job actually completes on time
            const credit = aiAssistedJobs[job.id];
            let creditNote = "";
            if (credit) {
              metricsDelta.revenueProtected += credit.revenue;
              metricsDelta.travelSavedMin += credit.travel;
              delete aiAssistedJobs[job.id];
              creditNote = ` · AI-assisted: +£${credit.revenue} protected`;
            }
            events = pushEvent(events, {
              tick, kind: "job_completed", severity: "ok",
              message: `${job.id} completed at ${job.customer} — £${job.revenue} secured${creditNote}`,
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
        // drop any pending AI credit — the action didn't save it
        if (aiAssistedJobs[job.id]) delete aiAssistedJobs[job.id];
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

  // Day window — stop injection past EOD, and back-pressure during the day
  const pastEOD = simTimeMinutes >= DAY_END_MIN;
  const openCount = jobs.filter((j) => j.status !== "completed" && j.status !== "breached").length;
  const capacity = engineers.length * MAX_QUEUE;
  const loadRatio = Math.min(1, openCount / Math.max(1, capacity));
  const backPressure = Math.max(0, 1 - loadRatio);

  // Job injection
  if (!pastEOD) {
    const base = s.simMode === "stress" ? 0.4 : 0.12;
    const floor = s.simMode === "stress" ? 0.12 : 0;
    const injectionChance = Math.max(floor, base * backPressure);
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
    const emBase = s.simMode === "stress" ? 0.08 : 0.025;
    if (rng() < emBase * Math.max(0.3, backPressure)) {
      jobCounter++;
      const j = newJob(jobCounter, tick, rng, true);
      jobs.push(j);
      events = pushEvent(events, {
        tick, kind: "emergency_injected", severity: "crit",
        message: `🚨 Emergency: ${j.title} @ ${j.customer}`,
      });
    }
  }

  // Scripted demo waypoints
  if (s.simMode === "scripted" && !pastEOD) {
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
    revenueProtected: s.metrics.revenueProtected + metricsDelta.revenueProtected,
    travelSavedMin: s.metrics.travelSavedMin + metricsDelta.travelSavedMin,
    aiAcceptedCount: s.metrics.aiAcceptedCount + metricsDelta.aiAcceptedCount,
  };

  // Prune dismissed IDs for jobs that no longer exist / are closed
  const dismissedRecs = pruneDismissed(s.dismissedRecs, jobs);

  // Generate recommendations
  const state: SimState = { ...s, tick, simTimeMinutes, engineers, jobs, traffic, events, metrics, recommendations: s.recommendations, dismissedRecs, aiAssistedJobs };
  const fresh = computeRecommendations(state);

  // Autopilot auto-accept — with guardrails to stop reassignment thrash:
  //  - Skip jobs currently in_progress or recently reassigned (cooldown 18 sim-min = 6 ticks)
  //  - Skip engineers that took an auto action in last 3 ticks (source or target)
  //  - Cap to 1 auto-accept per tick
  //  - Only accept high-confidence: slaImprovement >= 15 OR riskScore >= 70
  const autoDismissed: string[] = [];
  let actionable = fresh;
  if (s.systemMode === "autopilot" && fresh.length > 0) {
    const JOB_COOLDOWN_TICKS = 6;
    const ENG_COOLDOWN_TICKS = 3;
    for (const r of fresh) {
      if (autoDismissed.length >= 1) break; // 1 per tick
      if (r.type !== "reassign" || !r.toEngineer) continue;
      const job = jobs.find((j) => j.id === r.jobId);
      const to = engineers.find((e) => e.id === r.toEngineer);
      const from = r.fromEngineer ? engineers.find((e) => e.id === r.fromEngineer) : undefined;
      if (!job || !to) continue;
      // Guardrails: only touch jobs not yet moving — never interrupt en_route or in_progress
      if (job.status !== "queued" && job.status !== "assigned") continue;
      if (job.lastReassignedTick !== undefined && tick - job.lastReassignedTick < JOB_COOLDOWN_TICKS) continue;
      if (to.lastAutoActionTick !== undefined && tick - to.lastAutoActionTick < ENG_COOLDOWN_TICKS) continue;
      if (from && from.lastAutoActionTick !== undefined && tick - from.lastAutoActionTick < ENG_COOLDOWN_TICKS) continue;
      if (!(r.slaImprovement >= 15 || job.riskScore >= 70)) continue;

      // Perform reassignment
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
      job.lastReassignedTick = tick;
      to.lastAutoActionTick = tick;
      if (from) from.lastAutoActionTick = tick;
      // Track for deferred revenue credit on actual completion
      const prior = aiAssistedJobs[job.id] ?? { revenue: 0, travel: 0 };
      aiAssistedJobs[job.id] = { revenue: prior.revenue + r.revenueProtected, travel: prior.travel + r.travelReductionMin };
      metrics.aiAcceptedCount += 1;
      autoDismissed.push(r.id);
      events = pushEvent(events, {
        tick, kind: "reassigned", severity: "ok",
        message: `[AUTOPILOT] ${r.reasoning}`,
      });
    }
    actionable = fresh.filter((r) => !autoDismissed.includes(r.id));
  }

  // Merge with existing so unchanged recs keep their identity (no re-animation)
  const mergedRecs = mergeRecs(s.recommendations, actionable);
  const nextDismissed = autoDismissed.length
    ? [...dismissedRecs, ...autoDismissed.filter((id) => !dismissedRecs.includes(id))]
    : dismissedRecs;

  // End-of-day handling
  let dayEnded = s.dayEnded;
  if (!dayEnded && simTimeMinutes >= DAY_END_MIN + WIND_DOWN_MIN) {
    dayEnded = true;
    const openLeft = jobs.filter((j) => j.status !== "completed" && j.status !== "breached").length;
    events = pushEvent(events, {
      tick, kind: "tick", severity: "info",
      message: `🛑 End of Day 17:30 — ${metrics.completed} completed · ${metrics.breached} breached · ${openLeft} carried over · £${metrics.revenueProtected} protected`,
    });
    // pause loop on next frame
    setTimeout(() => useSim.getState().stop(), 0);
  } else if (!dayEnded && simTimeMinutes === DAY_END_MIN) {
    events = pushEvent(events, {
      tick, kind: "tick", severity: "warn",
      message: `17:00 — End of shift. No new bookings; engineers winding down in-flight work.`,
    });
  }

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
    dayEnded,
    aiAssistedJobs,
  });
}



// "Soonest available" scoring: pick the engineer who can actually start (and finish) this job
// the earliest, accounting for queue depth, current trip, traffic on the route, and skill match.
export function pickBestEngineer(job: Job, engineers: Engineer[], jobs: Job[], traffic: TrafficZone[], currentTick = 0): Engineer | null {
  let best: Engineer | null = null;
  let bestScore = -Infinity;
  const slaMinRemaining = (job.slaDeadlineTick - currentTick) * SIM_MINUTES_PER_TICK;
  for (const e of engineers) {
    if (e.status === "delayed") continue;
    const load = (e.currentJob ? 1 : 0) + e.nextJobs.length;
    if (load >= MAX_QUEUE) continue;
    const skillMatch = e.skills.includes(job.skill) ? 1 : 0.4;
    const avail = engineerAvailableMin(e, jobs, traffic);
    const travel = travelToJobMin(e, job, traffic, jobs);
    const workMin = (job.durationBase / Math.max(0.4, e.speedFactor)) * (skillMatch === 1 ? 1 : 1.25);
    const totalMin = avail + travel + workMin;
    // Heavy penalty if this engineer cannot finish before SLA (or finishes very close)
    let slaPenalty = 0;
    if (slaMinRemaining > 0) {
      const overshoot = totalMin - slaMinRemaining;
      if (overshoot > 0) slaPenalty = overshoot * 3; // 3x weight for breach minutes
      else if (totalMin > slaMinRemaining * 0.85) slaPenalty = (totalMin - slaMinRemaining * 0.85) * 1.2;
    }
    // negate so lower minutes = higher score, plus quality bonuses
    const score = -totalMin - slaPenalty + (skillMatch === 1 ? 25 : 0) + e.efficiency * 0.15 - e.fatigue * 0.08;
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
    // Don't propose reassignments on jobs already in execution — too disruptive
    if (job.status === "in_progress") continue;
    const currentEng = s.engineers.find((e) => e.id === job.assignedEngineer);
    // Current engineer's ETA to finish this job
    const curEta = currentEng
      ? engineerAvailableMin(currentEng, s.jobs, s.traffic) +
        (currentEng.currentJob === job.id
          ? 0
          : travelToJobMin(currentEng, job, s.traffic, s.jobs))
      : 999;

    let bestCandidate: Engineer | null = null;
    let bestCandEta = curEta;
    let bestTrafficMult = 1;
    for (const e of s.engineers) {
      if (e.id === job.assignedEngineer) continue;
      if (e.status === "delayed") continue;
      const load = (e.currentJob ? 1 : 0) + e.nextJobs.length;
      if (load >= MAX_QUEUE) continue;
      const skillMatch = e.skills.includes(job.skill) ? 1 : 0.5;
      const avail = engineerAvailableMin(e, s.jobs, s.traffic);
      const travel = travelToJobMin(e, job, s.traffic, s.jobs);
      const eta = avail + travel + (skillMatch === 1 ? 0 : 8); // small off-skill penalty
      if (eta < bestCandEta - 6) { // must beat by at least 6 min
        bestCandEta = eta;
        bestCandidate = e;
        bestTrafficMult = pathTrafficMult(e.location, job.location, s.traffic);
      }
    }
    if (bestCandidate) {
      const id = `R-reassign-${job.id}-${bestCandidate.id}`;
      if (dismissed.has(id)) continue;
      const savedMin = Math.max(5, Math.round(curEta - bestCandEta));
      const slaImprovement = Math.min(70, Math.round(savedMin * 1.2 + job.riskScore * 0.15));
      const conf = Math.min(98, 60 + Math.round(savedMin));
      const startsIn = Math.round(bestCandEta - (bestCandidate.skills.includes(job.skill) ? 0 : 8) - (bestCandEta - engineerAvailableMin(bestCandidate, s.jobs, s.traffic) - travelToJobMin(bestCandidate, job, s.traffic, s.jobs)));
      const trafficNote = bestTrafficMult > 1.15 ? ` (×${bestTrafficMult.toFixed(1)} traffic en route)` : ` (clear route)`;
      recs.push({
        id,
        type: "reassign",
        jobId: job.id,
        fromEngineer: currentEng?.id,
        toEngineer: bestCandidate.id,
        reasoning: `${bestCandidate.name.split(" ")[0]} can start in ${Math.max(1, Math.round(bestCandEta))} min${trafficNote} vs ${currentEng ? currentEng.name.split(" ")[0] + " in " + Math.round(curEta) + " min" : "unassigned"}. Cuts SLA risk ${slaImprovement}%, saves ~${savedMin} min.`,
        slaImprovement,
        travelReductionMin: savedMin,
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

  // Rebalance pass: drain overloaded engineer tails onto lighter ones
  const loads = s.engineers.map((e) => ({ e, load: (e.currentJob ? 1 : 0) + e.nextJobs.length }));
  const sortedLoads = [...loads].sort((a, b) => a.load - b.load);
  const median = sortedLoads[Math.floor(sortedLoads.length / 2)].load;
  const overloaded = loads.filter((l) => l.load >= median + 2 && l.e.nextJobs.length > 0);
  for (const { e: heavy } of overloaded) {
    const tailJobId = heavy.nextJobs[heavy.nextJobs.length - 1];
    const tailJob = s.jobs.find((j) => j.id === tailJobId);
    if (!tailJob) continue;
    // Don't move jobs already moving or in execution
    if (tailJob.status === "in_progress" || tailJob.status === "en_route") continue;
    // pick lightest eligible
    const lightest = sortedLoads.find(
      (l) => l.e.id !== heavy.id && l.load < MAX_QUEUE && l.e.status !== "delayed" && l.load <= median,
    );
    if (!lightest) continue;
    const id = `R-reassign-${tailJob.id}-${lightest.e.id}`;
    if (new Set(s.dismissedRecs).has(id)) continue;
    if (recs.some((r) => r.id === id)) continue;
    const slack = (heavy.nextJobs.length - lightest.load) * 12;
    recs.push({
      id,
      type: "reassign",
      jobId: tailJob.id,
      fromEngineer: heavy.id,
      toEngineer: lightest.e.id,
      reasoning: `Rebalance: move ${tailJob.id} from ${heavy.name.split(" ")[0]} (queue ${heavy.nextJobs.length + (heavy.currentJob ? 1 : 0)}) → ${lightest.e.name.split(" ")[0]} (queue ${lightest.load}) to recover ~${slack} min slack`,
      slaImprovement: Math.min(45, 15 + slack),
      travelReductionMin: Math.max(8, slack),
      revenueProtected: Math.round(tailJob.revenue * 0.25),
      confidence: 72,
      createdAtTick: s.tick,
    });
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
