# Brex Agent

A financial proxy for AI agents. Connects to your Brex card and lets agents make purchases with human-in-the-loop approval, powered by [Agent Auth](https://github.com/better-auth/agent-auth) and [MPP](https://mpp.dev).

## How It Works

```
Agent needs to pay $18 for coffee
    → Agent executes brex.pay capability
    → Brex Agent creates pending payment
    → Human sees approval request in dashboard
    → Human approves
    → Brex Agent reads card details via Brex API
    → Creates Stripe Payment Method → SPT (capped to $18, 5min expiry)
    → Agent receives SPT and pays the shop via MPP
```

## Setup

```bash
# Install dependencies (from repo root)
pnpm install

# Set up environment
cp .env.example .env
# Fill in DATABASE_URL, BREX_API_TOKEN, STRIPE_SECRET_KEY

# Push database schema
pnpm db:push

# Start dev server
pnpm dev
```

Runs on **http://localhost:3400**.

## Agent Auth Capabilities

| Capability     | Description                                | Requires Approval   |
| -------------- | ------------------------------------------ | ------------------- |
| `brex.balance` | Check Brex account balance                 | No (auto-approved)  |
| `brex.pay`     | Request payment — creates pending approval | Yes (per execution) |
| `brex.history` | View past payment history                  | No (auto-approved)  |

## API Endpoints

### Agent-facing (Agent Auth bearer token)

| Method | Path                 | Description                                   |
| ------ | -------------------- | --------------------------------------------- |
| GET    | `/api/payments/[id]` | Poll payment status (pending/approved/denied) |

### Human-facing (session auth)

| Method | Path                         | Description                                           |
| ------ | ---------------------------- | ----------------------------------------------------- |
| GET    | `/api/payments`              | List all payments                                     |
| POST   | `/api/payments/[id]/approve` | Approve payment (creates Brex card → Stripe PM → SPT) |
| POST   | `/api/payments/[id]/deny`    | Deny payment                                          |
| POST   | `/api/brex/connect`          | Connect Brex account (API token)                      |
| GET    | `/api/brex/balance`          | Get Brex cash balance                                 |
| GET    | `/api/brex/cards`            | List synced cards                                     |
| PUT    | `/api/brex/cards`            | Set default card                                      |

## Demo Flow

1. **Human** signs up at http://localhost:3400 and connects Brex account in Settings
2. **Agent** registers with Brex Agent via Agent Auth protocol
3. **Human** approves the agent and grants `brex.pay` capability
4. **Agent** browses Coffee Shop at http://localhost:3300/api/products
5. **Agent** tries to buy → gets 402 MPP challenge
6. **Agent** executes `brex.pay` on Brex Agent with purchase details
7. **Human** sees approval request in dashboard → approves
8. **Brex Agent** creates SPT from Brex card → returns to agent
9. **Agent** retries shop purchase with SPT → gets coffee + receipt
