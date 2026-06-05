
## What's actually going wrong

After reading `src/lib/simulation/store.ts` and `src/lib/simulation/seed.ts`, there are four compounding bugs that produce the 5pm chaos you saw:

1. **No end-of-day.** `tick` and `simTimeMinutes` increment forever. The shift clock never stops at 17:00, so jobs keep being injected at 22:00, 02:00, etc.
2. **Unbounded job injection.** Every tick has a 20% chance of a new booking and a 2.5% chance of an emergency — for the full uncapped runtime. Over a 9-hour shift that's ~36 extra jobs on top of the 14 starters, well above what 8 engineers can clear (≈1 job / 30 min each ≈ 9 jobs / day max).
3. **No backlog cap in dispatch.** `pickBestEngineer` always returns *some* engineer, even one already holding 8 queued jobs — the load penalty (-25 per job) is easily beaten by skill match (+100) or distance. So the same 2–3 best-matched engineers get stacked while others stay lighter.
4. **Queued jobs accrue SLA risk while they wait.** Engineers only work `currentJob`; everything in `nextJobs` sits with its SLA clock ticking. That's why the UI looks like "engineers aren't doing their assigned work" — they *are* working, just on one job at a time, while 5–8 others queued behind them turn red.

There's also no AI behaviour that *rebalances* an overloaded engineer's tail onto idle engineers — the optimiser only reassigns by skill/distance gain, so a 9-deep queue never triggers a redistribution.

## Plan

### 1. Operating day window (08:00 → 17:00)

- Define `DAY_START_MIN = 0` (08:00) and `DAY_END_MIN = 540` (17:00) constants.
- In `stepTick`, once `simTimeMinutes >= DAY_END_MIN`:
  - Stop all new job injection (regular + emergency + scripted).
  - Allow in-flight work to keep progressing for a wind-down window (≈30 sim-min) so engineers complete what they can.
  - Once `simTimeMinutes >= DAY_END_MIN + 30` (17:30), call `stop()` and push an `end_of_day` event summarising completed / breached / revenue protected / AI accepted. Set a new `dayEnded: true` flag in `SimState`.
- `reset()` clears `dayEnded` and returns to 08:00.
- Add a small "EOD" badge in the header/clock when `dayEnded` is true (single change in `GlobalActions` or wherever the sim clock lives — I'll locate it during implementation).

### 2. Cap engineer queues so overflow stays queued (visible pressure, not invisible pileup)

- In `pickBestEngineer`, treat any engineer with `currentJob + nextJobs.length >= MAX_QUEUE` (e.g. 3) as ineligible.
- If no engineer is eligible, the job stays `queued` — it shows up in the Job Risk panel as unassigned backlog instead of being silently buried in someone's `nextJobs`.
- Same cap applies in the autopilot auto-reassign path and in `computeRecommendations` so the AI doesn't pile onto an already-full engineer.

### 3. Adaptive job injection (back-pressure)

- Compute current load = open jobs / (engineers × MAX_QUEUE).
- Scale the 0.2 / 0.025 injection chances by `max(0, 1 - load)` so when the system is saturated, almost no new jobs spawn. Stress mode keeps a higher floor.
- Hard-stop injection past `DAY_END_MIN` (per #1).

### 4. AI rebalance recommendations for overloaded engineers

Add a second pass in `computeRecommendations`:

- Find engineers whose queue depth exceeds the fleet median by 2+.
- For each such engineer's *last* queued job, find the lightest-loaded eligible engineer and emit a `reassign` recommendation with reasoning like *"Rebalance: move J123 from Aria (queue 6) → Hugo (queue 1) to recover 38 min slack."*
- Cap total recommendations at 5 as today.

### 5. Small UX surfacing

- In `JobRiskPanel`, show queued-unassigned jobs with a distinct "UNASSIGNED — no capacity" tag so the dispatcher sees overflow rather than wondering why a job is high-risk with no engineer.
- In the sim clock area, show `HH:MM` (already there) plus an `EOD` pill once the day ends.

## Files I expect to touch

- `src/lib/simulation/store.ts` — day window, EOD stop, capped dispatcher, adaptive injection, rebalance recommendations.
- `src/lib/simulation/types.ts` — add `dayEnded: boolean`.
- `src/components/tower/JobRiskPanel.tsx` — small "unassigned" tag.
- Wherever the sim clock renders (likely `AppShell` / `GlobalActions`) — add EOD pill. I'll confirm the exact file when implementing.

## What you'll see after the fix

- The clock advances 08:00 → 17:00, then a single `End of Day` event fires and the simulation pauses on its own.
- No engineer holds more than ~3 jobs at once; surplus stays visibly queued in the Job Risk panel.
- New-job spawning slows when the queue is already full and stops entirely after 17:00.
- The AI starts proposing *rebalance* reassignments (not just skill/distance swaps), so overloaded engineers get drained automatically in copilot/autopilot.
- 5pm should look busy but coherent — high-risk jobs are either assigned to someone actively moving on them or flagged as unassigned-overflow, not silently stacked behind one engineer.
