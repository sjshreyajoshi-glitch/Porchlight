# Porchlight

**A multi-agent system that notices when an elderly person goes quiet, and tells the right person before a small lapse becomes a crisis.**

Built for the Kaggle "AI Agents: Intensive Vibe Coding Capstone Project," Agents for Good track.

---

## The Problem

Loneliness in elderly populations rarely announces itself with a single dramatic event. It is usually a slow withdrawal: a missed call, a missed weekly visit, a person who quietly stops reaching out, and no one notices until it has gone on for weeks. The people best positioned to notice, adult children, distant relatives, or community volunteers, are often busy, far away, or simply do not know what "normal" looks like for that person day to day.

Porchlight exists to close that gap. It does not try to manufacture connection. It watches for changes in contact patterns and makes sure that when something changes, someone who cares finds out quickly, in a way they have already chosen.

## Why Agents

This problem requires judgment at multiple distinct stages: deciding whether a check-in is concerning, deciding how concerning, deciding who to notify, and following up. A single model call or chatbot cannot reliably do all of this at once. Porchlight splits these responsibilities across four cooperating agents, each with a narrow, well-defined job, coordinated through Google's ADK and a shared MCP server.

## Architecture

```
                    ┌─────────────────────┐
                    │   Porchlight UI      │
                    │  (Dashboard, Policy   │
                    │   Editor, Audit Log)  │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │      MCP Server        │
                    │  get_user_history       │
                    │  log_checkin            │
                    │  get_escalation_policy  │
                    │  update_escalation_policy│
                    │  trigger_escalation     │
                    │  notify_contact         │
                    └───┬───────┬───────┬─────┘
                        │       │       │
        ┌───────────────┘       │       └───────────────┐
        │                       │                        │
┌───────▼────────┐   ┌─────────▼─────────┐   ┌───────────▼──────────┐
│ Check-In Agent  │   │ Sentiment &        │   │ Escalation Agent      │
│                 │──▶│ Distress Detection │──▶│ (reads per-user       │
│ Daily check-ins │   │ Agent (mock/live)  │   │  escalation policy)   │
└─────────────────┘   └────────────────────┘   └───────────┬───────────┘
                                                             │
                                                  ┌──────────▼──────────┐
                                                  │ Care Coordinator     │
                                                  │ Agent (logging,      │
                                                  │ follow-up, history)  │
                                                  └──────────────────────┘
```

### Agents

| Agent | Responsibility |
|---|---|
| **Check-In Agent** | Initiates daily text/voice-style check-ins with each registered user and logs whether and when they responded. |
| **Sentiment & Distress Detection Agent** | Analyzes check-in responses for signs of withdrawal or distress, and tracks missed check-in streaks. Supports a configurable mock mode for reliable demoing without live model variance. |
| **Escalation Agent** | Reads each user's configurable escalation policy (who to contact, in what tier order, via what channel) and decides the correct response based on current risk. Never hardcoded to a single contact path. |
| **Care Coordinator Agent** | Logs every check-in, risk assessment, and escalation; schedules follow-ups; prevents duplicate alerts once a contact has been notified. |

### MCP Server

All agents communicate through a shared MCP server rather than calling each other directly. This scopes each agent to only the tools it needs, which doubles as a security boundary, not just an architectural convenience.

Exposed tools:
- `get_user_history`
- `log_checkin`
- `get_escalation_policy`
- `update_escalation_policy`
- `trigger_escalation`
- `notify_contact`

## Security

- Input validation on every check-in response before it reaches the Sentiment Agent.
- Access control on the MCP server so only authorized family/care-circle members can read or edit a user's escalation policy.
- Notifications can only be sent to contacts already present in that user's policy, preventing misuse to message arbitrary numbers or addresses.
- No API keys, credentials, or secrets are committed to this repository. See `.env.example` for required environment variables.

## Agent Skills / CLI

A CLI layer is included to make the system testable and explainable without waiting for a real daily check-in cycle:

```bash
# Simulate a check-in for a given user
porchlight-cli checkin --user mrs_sharma --response "I'm okay, just tired"

# Toggle sentiment analysis between mock and live mode
porchlight-cli sentiment-mode --set mock

# Manually trigger a test escalation
porchlight-cli escalate --user mrs_sharma --force

# Inspect the agent decision log
porchlight-cli logs --user mrs_sharma
```

## Setup & Local Deployment

### Prerequisites
- Node.js 18+
- npm or yarn
- A Google ADK-compatible API key (see `.env.example`)

### Installation

```bash
# Clone the repository
git clone https://github.com/<your-username>/porchlight.git
cd porchlight

# Install dependencies
npm install

# Copy environment template and fill in your own keys
cp .env.example .env
```

### Running locally

```bash
npm run dev
```

The dashboard will be available at **http://localhost:3000**.

### Running the MCP server

```bash
npm run mcp:start
```

## Project Structure

```
porchlight/
├── agents/
│   ├── checkin_agent/
│   ├── sentiment_agent/
│   ├── escalation_agent/
│   └── coordinator_agent/
├── mcp_server/
│   └── tools/
├── cli/
├── ui/
│   ├── dashboard/
│   ├── policy_editor/
│   └── audit_log/
├── .env.example
└── README.md
```

## Demo Scenarios

Two seeded users demonstrate that escalation policy is genuinely configurable, not hardcoded:

- **Mrs. Sharma**: Escalation policy set to notify a community volunteer first on missed check-ins, with family notified only if risk continues to rise.
- **Mr. Rao**: Escalation policy set to notify his daughter directly on the same risk threshold.

Both users hit the same risk score in the demo, and the Escalation Agent routes each one differently based solely on their individual policy.

## Assumptions Made

*(Update this section with any defaults Antigravity applied during generation, e.g., mock sentiment scoring thresholds, default notification channel, etc.)*

## License

MIT
