# Realistic Shift Lifecycle

Build out the simulation day in two phases so it behaves like a real dispatch shift instead of a flat 9-hour reactive window.

EOD = 17:00, full freeze = 17:30 (30-min wind-down). Longest single job ~135 min, so anything queued after ~15:00 risks not finishing in-day.

---

## Phase A — Pre-shift Planning + Wind-down

### 1. Pre-shift planning pass (07:55, runs on `reset()`)
- Seed engineers and build a backlog from `seedJobs(10)`.
- Sort backlog by priority weight, then earliest `slaDeadlineTick`.
- Greedy assign via existing `pickBestEngineer` (SLA-aware) so every engineer starts the day with a visible route on the Gantt.
- Jobs that don't fit before EOD stay `queued` with `assignedEngineer = null` — picked up by in-day dispatch or rolled to tomorrow.
- Emit a synthetic "Pre-shift plan ready" event.

### 2. Wind-down window (16:00 → 17:00)
- Add `dayPhase` to `SimState`: `preshift | active | winddown | eod`.
- During wind-down, low/medium queued jobs only assign if `etaCompletionTick <= EOD_TICK`. Otherwise leave queued and mark `rollToTomorrow = true`, emit "Deferred to tomorrow — customer notified" event.
- Critical jobs still try to assign before EOD; if none fits, fall through to the OT path (Phase B).

### 3. EOD freeze (17:00+)
- `injectionChance = 0`, auto-dispatch disabled.
- In-progress jobs keep ticking to completion.
- Idle / finished engineers flip to new status `off_shift` (rendered grey in EngineerPanel).

---

## Phase B — Overtime opt-in + Overnight carry-over

### 4. Overtime opt-in
- Add `overtimeWilling: boolean` to `Engineer` (~50% true, seeded).
- During wind-down, critical/high queued jobs that can't fit pre-EOD get a second assignment pass restricted to `overtimeWilling === true` engineers. Each willing engineer takes at most one OT job.
- After EOD, OT-flagged engineers stay `working` / `en_route` until their OT job finishes, then flip to `off_shift`.
- UI: "OT" chip on engineer card and on the OT job's Gantt bar; small willingness dot on each engineer.

### 5. Overnight carry-over
- Add `SimState.carriedJobs` and `SimState.dayNumber`.
- At EOD, snapshot any still-open jobs (`queued | assigned | en_route | in_progress`) into `carriedJobs` with bumped priority and a `carriedFromDay` marker.
- New "Start Day N+1" button calls `reset({ keepCarry: true })`, which increments `dayNumber`, re-seeds engineers, and runs `planPreShift(seedJobs(10) + carriedJobs)`.
- JobRiskPanel shows a "Carry-over · Day N" badge on carried jobs.

---

## Files to touch

- `src/lib/simulation/types.ts` — `dayPhase`, `overtimeWilling`, `overtime`, `carriedFromDay`, `carriedJobs`, `dayNumber`, `off_shift` engineer status.
- `src/lib/simulation/store.ts` — `planPreShift()`, `dayPhase` computation, wind-down gating, EOD freeze, OT pass, carry-over snapshot, day counter.
- `src/lib/simulation/seed.ts` — `overtimeWilling` in `seedEngineers`.
- `src/components/layout/AppShell.tsx` — phase pill (PRE-SHIFT / ACTIVE / WIND-DOWN / EOD).
- `src/components/tower/EngineerPanel.tsx` — OT chip, willingness dot, grey `off_shift` styling.
- `src/components/tower/JobRiskPanel.tsx` — carry-over badge, "deferred" indicator.
- `src/routes/simulation.tsx` — "Start Day N+1" button.

---

## Order of work

1. Phase A (planning + wind-down + freeze) — makes the day feel like a real shift.
2. Phase B (OT + carry-over) — adds the human/operational realism on top.
