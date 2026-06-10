export type Skill = "electrical" | "hvac" | "plumbing" | "network" | "mechanical";

export type EngineerStatus = "en_route" | "working" | "idle" | "delayed" | "off_shift";
export type JobStatus = "queued" | "assigned" | "en_route" | "in_progress" | "completed" | "breached";
export type JobPriority = "low" | "medium" | "high" | "critical";
export type DayPhase = "preshift" | "active" | "winddown" | "eod";

export interface Engineer {
  id: string;
  name: string;
  initials: string;
  location: { x: number; y: number };
  destination: { x: number; y: number } | null;
  status: EngineerStatus;
  skills: Skill[];
  speedFactor: number;
  reliability: number;
  fatigue: number;
  efficiency: number;
  currentJob: string | null;
  nextJobs: string[];
  delayUntil: number | null;
  lastAutoActionTick?: number;
  overtimeWilling: boolean;
  overtime?: boolean;
}

export interface Job {
  id: string;
  title: string;
  customer: string;
  location: { x: number; y: number };
  priority: JobPriority;
  durationBase: number; // minutes
  progress: number; // 0-100
  slaDeadlineTick: number; // tick number
  spawnTick: number;
  revenue: number;
  penalty: number;
  riskScore: number;
  firstTimeFix: number; // %
  skill: Skill;
  status: JobStatus;
  assignedEngineer: string | null;
  lastReassignedTick?: number;
  rollToTomorrow?: boolean;
  carriedFromDay?: number;
}

export interface TrafficZone {
  id: string;
  cx: number;
  cy: number;
  r: number;
  multiplier: number;
  expiresAtTick: number;
}

export type AIActionType = "reassign" | "reroute" | "escalate" | "split";

export interface AIRecommendation {
  id: string;
  type: AIActionType;
  jobId: string;
  fromEngineer?: string;
  toEngineer?: string;
  reasoning: string;
  slaImprovement: number; // %
  travelReductionMin: number;
  revenueProtected: number;
  confidence: number; // 0-100
  createdAtTick: number;
}

export type EventKind =
  | "tick"
  | "job_injected"
  | "emergency_injected"
  | "job_completed"
  | "sla_breach"
  | "delay"
  | "traffic_shift"
  | "reassigned"
  | "ai_recommendation"
  | "catastrophic";

export interface SimEvent {
  id: string;
  tick: number;
  kind: EventKind;
  message: string;
  severity: "info" | "warn" | "risk" | "crit" | "ok";
  meta?: Record<string, unknown>;
}

export type SystemMode = "manual" | "copilot" | "autopilot";
export type SimMode = "scripted" | "live" | "stress";

export interface SimState {
  tick: number;
  simTimeMinutes: number; // minutes from 08:00
  running: boolean;
  speed: 1 | 2 | 4 | 8;
  systemMode: SystemMode;
  simMode: SimMode;
  frozen: boolean;
  engineers: Engineer[];
  jobs: Job[];
  traffic: TrafficZone[];
  recommendations: AIRecommendation[];
  dismissedRecs: string[];
  dayEnded: boolean;
  dayPhase: DayPhase;
  dayNumber: number;
  carriedJobs: Job[];
  events: SimEvent[];
  aiAssistedJobs: Record<string, { revenue: number; travel: number }>;
  metrics: {

    slaHealth: number;
    completed: number;
    breached: number;
    revenueProtected: number;
    travelSavedMin: number;
    aiAcceptedCount: number;
    manualBaselineSla: number;
  };
  selectedEngineer: string | null;
  selectedJob: string | null;
}
