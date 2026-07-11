# v0.8 Configuration

Configuration lives in `~/.pi/agent/hermes-memory-config.json`.

| Setting | Default | Purpose |
|---|---:|---|
| `autoRecallEnabled` | `false` | Master opt-in; false forces mode `off` |
| `autoRecallMode` | `off` | `off`, `suggest`, `auto`, or `debug` |
| `autoRecallTopK` | `6` | Maximum selected memories |
| `autoRecallBudgetChars` | `6000` | Hard character cap including envelope |
| `autoRecallMaxEntryChars` | `1500` | Per-memory truncation cap |
| `autoRecallMaxTokens` | `1500` | Hard estimated-token cap |

Recommended rollout: run `/memory-doctor`, use `suggest`, inspect `/memory-why`, then opt into `auto` only after results are safe and relevant.
