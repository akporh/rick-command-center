import type { Engineer, Job, Skill } from "./types";

// Deterministic PRNG (mulberry32)
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = ["Aria", "Beni", "Caleb", "Dara", "Esha", "Finn", "Greta", "Hugo", "Iyla", "Jonas", "Kira", "Leo"];
const LAST_NAMES = ["Okafor", "Vasquez", "Tanaka", "Holm", "Patel", "Reyes", "Singh", "Larsen", "Mori", "Khan"];
const SKILLS: Skill[] = ["electrical", "hvac", "plumbing", "network", "mechanical"];

const CUSTOMERS = [
  "Northgate Mall", "Helix Biotech", "Verde Plaza", "Ironworks Foundry", "Aurora Hospital",
  "Cinder Brewing", "Atlas Logistics", "Meridian Bank", "Vista Hotel", "Quartz Data Center",
  "Riverside Schools", "Sable Apartments", "Pioneer Stadium", "Cobalt Refinery", "Lumen Studios",
];

const JOB_TITLES: Record<Skill, string[]> = {
  electrical: ["Switchgear fault", "UPS battery swap", "Lighting circuit fix", "Panel breaker reset"],
  hvac: ["Chiller compressor", "AHU belt replace", "Thermostat calibration", "Cooling tower flush"],
  plumbing: ["Boiler relight", "Leak isolation", "Pump seal replace", "Drain unblock"],
  network: ["Switch failover", "Fibre re-term", "AP relocation", "Firewall hotfix"],
  mechanical: ["Conveyor jam", "Door actuator", "Pump bearing", "Gearbox check"],
};

export function seedEngineers(count = 8, rng = makeRng(42)): Engineer[] {
  const engineers: Engineer[] = [];
  for (let i = 0; i < count; i++) {
    const fn = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const ln = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
    const skillCount = 1 + Math.floor(rng() * 2);
    const skills: Skill[] = [];
    while (skills.length < skillCount) {
      const s = SKILLS[Math.floor(rng() * SKILLS.length)];
      if (!skills.includes(s)) skills.push(s);
    }
    engineers.push({
      id: `E${String(i + 1).padStart(2, "0")}`,
      name: `${fn} ${ln}`,
      initials: `${fn[0]}${ln[0]}`,
      location: { x: 100 + rng() * 800, y: 80 + rng() * 440 },
      destination: null,
      status: "idle",
      skills,
      speedFactor: 0.85 + rng() * 0.45,
      reliability: 0.7 + rng() * 0.28,
      fatigue: Math.floor(rng() * 25),
      efficiency: 70 + Math.floor(rng() * 28),
      currentJob: null,
      nextJobs: [],
      delayUntil: null,
    });
  }
  return engineers;
}

export function seedJobs(count = 14, rng = makeRng(99)): Job[] {
  const jobs: Job[] = [];
  const priorities: Job["priority"][] = ["low", "medium", "medium", "high", "high", "critical"];
  for (let i = 0; i < count; i++) {
    const skill = SKILLS[Math.floor(rng() * SKILLS.length)];
    const titles = JOB_TITLES[skill];
    const priority = priorities[Math.floor(rng() * priorities.length)];
    const durationBase = 25 + Math.floor(rng() * 110);
    const revenue = 200 + Math.floor(rng() * 1800);
    jobs.push({
      id: `J${String(i + 1).padStart(3, "0")}`,
      title: titles[Math.floor(rng() * titles.length)],
      customer: CUSTOMERS[Math.floor(rng() * CUSTOMERS.length)],
      location: { x: 120 + rng() * 760, y: 90 + rng() * 420 },
      priority,
      durationBase,
      progress: 0,
      slaDeadlineTick: 30 + Math.floor(rng() * 180),
      spawnTick: 0,
      revenue,
      penalty: Math.floor(revenue * (0.4 + rng() * 0.6)),
      riskScore: 5 + Math.floor(rng() * 20),
      firstTimeFix: 60 + Math.floor(rng() * 38),
      skill,
      status: "queued",
      assignedEngineer: null,
    });
  }
  return jobs;
}

export function newJob(id: number, tick: number, rng: () => number, emergency = false): Job {
  const skill = SKILLS[Math.floor(rng() * SKILLS.length)];
  const titles = JOB_TITLES[skill];
  const priority = emergency ? "critical" : (["low", "medium", "high"] as const)[Math.floor(rng() * 3)];
  const revenue = emergency ? 1200 + Math.floor(rng() * 1500) : 200 + Math.floor(rng() * 1500);
  return {
    id: `J${String(id).padStart(3, "0")}`,
    title: (emergency ? "EMERGENCY: " : "") + titles[Math.floor(rng() * titles.length)],
    customer: CUSTOMERS[Math.floor(rng() * CUSTOMERS.length)],
    location: { x: 120 + rng() * 760, y: 90 + rng() * 420 },
    priority,
    durationBase: 25 + Math.floor(rng() * 90),
    progress: 0,
    slaDeadlineTick: tick + (emergency ? 25 : 40 + Math.floor(rng() * 90)),
    spawnTick: tick,
    revenue,
    penalty: Math.floor(revenue * (0.5 + rng() * 0.5)),
    riskScore: emergency ? 60 : 10,
    firstTimeFix: 60 + Math.floor(rng() * 38),
    skill,
    status: "queued",
    assignedEngineer: null,
  };
}
