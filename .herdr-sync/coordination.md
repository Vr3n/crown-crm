# Feature Implementation Coordination

## Agents

| Agent | Workspace | Tab | Pane | Branch | Worktree |
|-------|-----------|-----|------|--------|----------|
| coordinator | wG | wG:t2 | wG:p2 | master | C:\Users\Viren\codes\gym-crm |
| dnd-agent | wH | wH:t1 | wH:p1 | feat/dnd-not-interested | C:\Users\Viren\codes\gym-crm-dnd |
| plan-agent | wJ | wJ:t1 | wJ:p1 | feat/plan-availability | C:\Users\Viren\codes\gym-crm-plan-availability |
| blacklist-agent | wK | wK:t1 | wK:p1 | feat/blacklist | C:\Users\Viren\codes\gym-crm-blacklist |
| photo-agent | wM | wM:t1 | wM:p1 | feat/person-photo | C:\Users\Viren\codes\gym-crm-photo |

## Dependency Graph

```
Phase 1 (parallel):
  dnd-agent ──────────────┐
  plan-agent ─────────────┤
                          ▼
Phase 2:           blacklist-agent
                          │
                          ▼
Phase 3:             photo-agent
                          │
                          ▼
Phase 4:           coordinator merges
```

## Status Files

- `dnd-agent.status` — written by dnd-agent
- `plan-agent.status` — written by plan-agent
- `blacklist-agent.status` — written by blacklist-agent
- `photo-agent.status` — written by photo-agent
- `coordination.md` — this file (read-only by coordinator)

## Protocol

1. Each agent writes STATUS=working when it starts
2. Each agent writes STATUS=done when complete
3. Coordinator reads status files to determine next phase
4. Blacklist agent waits for dnd-agent and plan-agent to be STATUS=done
5. Photo agent waits for blacklist-agent to be STATUS=done
