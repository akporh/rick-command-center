# Plan: Mode behaviour, smarter dispatch, honest metrics, map clarity

## 1. Make the three modes actually different

Gate dispatch behaviour in `stepTick` on `systemMode`:

- **Manual** — no auto-dispatch. New `queued` jobs stay unassigned until the dispatcher accepts a recommendation or assigns by hand. AI still generates recommendations.
- **Copilot** — auto-dispatch *initial* assignment only (a `queued` job with no engineer gets routed to the best-scoring engineer). Any **reassignment** of an already-assigned job requires the dispatcher to accept a recommendation.
- **Autopilot** — Copilot behaviour + auto-accept top recommendations, subject to guardrails (below).

## 2. Autopilot guardrails (stop the reassignment thrash)

- Never reassign a job that is `in_progress` or already `en_route` with >50% travel done.
- Add `lastReassignedTick` to `Job`; cooldown of >=18 sim-min before the same job can be reassigned again.
- Per-engineer cooldown: an engineer can be the *source* or *target* of at most one auto-reassign every 3 ticks.
- Cap auto-accepts to **1 per tick**, and only if `slaImprovement >= 15` or `riskScore >= 70`.
- Rebalance recs skip any job that's already moving.

## 3. Smarter dispatch scoring (applies to all modes)

Replace raw-distance scoring in `pickBestEngineer` with a "soonest available" ETA:

```
engineerAvailableInMin =
    remainingTravelToCurrentDest
  + remainingWorkOnCurrentJob
  + sum(durationBase / speedFactor for j in nextJobs)

travelToNewJobMin = distance(engineer.lastKnownEnd, job.location)
                    / (32 * speedFactor)
                    * trafficMultiplierAlongPath   // NEW

jobDurationMin    = job.durationBase / speedFactor
                    * (1.0 if skillMatch else 1.25)

score = -(engineerAvailableInMin + travelToNewJobMin)
      + skillBonus
      - queuePenalty (existing MAX_QUEUE cap stays)
      - fatiguePenalty
```

`trafficMultiplierAlongPath` samples the existing `traffic` zones on the line between engineer and job — if the path passes through a zone, multiply that segment by the zone's `multiplier`. Same helper is reused by `computeRecommendations` so reasoning text can say things like:

> *"Hugo can start in 8 min (clear route) vs Aria in 34 min (×1.8 traffic on Central). Cuts SLA risk 42%."*

## 4. Honest metrics

- `revenueProtected` only increments when a job that was the target of an accepted AI action **actually completes on time**. Track via `aiAssistedJobs: string[]` on `SimState`.
- Rename header counter from "AI accepted" to "AI actions" so accepted-but-undone work doesn't read as a win.
- `travelSavedMin` only credits when the reassigned job completes (same rule).

## 5. UX surfacing

- **Header mode buttons** — tooltips:
  - Manual: *"You assign every job. AI suggests but never acts."*
  - Copilot: *"AI auto-assigns new jobs. Reassignments need your approval."*
  - Autopilot: *"AI auto-assigns and auto-accepts safe reassignments. Critical actions still queue for approval."*
- **OptimiserPanel** — show "Approval required" pill in Copilot/Manual, "Auto-executing" pill in Autopilot.
- **JobRiskPanel** — "Awaiting dispatch" tag for `queued` jobs with no engineer (Manual mode will produce many).
- **EngineerPanel** — show each engineer's "Next available in: Xm" so dispatchers can sanity-check why the AI picked who it picked.
- **LiveMap traffic zones** — add a tooltip / legend entry explaining the red circles:
  - Add a legend row: *"Red zone · live traffic · ×N = travel time multiplier"*
  - On hover over a zone, show `Traffic congestion · ×1.8 travel time · clears at 14:32`.
  - Engineer route lines that cross a zone render in a warmer colour so it's visible at a glance.

## Files to touch

- `src/lib/simulation/store.ts` — mode-gated dispatch, autopilot guardrails, cooldowns, ETA/traffic-aware scoring, deferred revenue credit.
- `src/lib/simulation/types.ts` — `lastReassignedTick` on `Job`, `aiAssistedJobs: string[]` on `SimState`.
- `src/components/layout/AppShell.tsx` — mode tooltips, rename "AI accepted" → "AI actions".
- `src/components/tower/OptimiserPanel.tsx` — Approval / Auto-executing pills.
- `src/components/tower/JobRiskPanel.tsx` — "Awaiting dispatch" tag.
- `src/components/tower/EngineerPanel.tsx` — "Next available in" line.
- `src/components/tower/LiveMap.tsx` — zone hover tooltip, expanded legend, warm-tint route lines through zones.

## What you should see after the changes

- Switching to **Manual** leaves new jobs visibly unassigned until you act — clear behavioural difference.
- **Copilot** auto-routes new jobs but never yanks one mid-flight; the recommendations queue is where reassignments live.
- **Autopilot** at 5pm looks busy but coherent — at most a handful of auto-reassigns per minute, no job ping-ponging between engineers, `revenueProtected` only ticks up when jobs actually land on time.
- Hovering a red circle on the map explains it's a traffic zone and what the multiplier means; the optimiser's reasoning text references those zones when they affect routing.