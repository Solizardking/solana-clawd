# Agent Coffee Shop

A coffee bean storefront that accepts machine payments via [MPP](https://mpp.dev) (Machine Payments Protocol). AI agents can browse products and buy coffee using Stripe Shared Payment Tokens.

## Setup

```bash
# Install dependencies (from repo root)
pnpm install

# Set up environment
cp .env.example .env
# Fill in DATABASE_URL and STRIPE_SECRET_KEY

# Push database schema
pnpm db:push

# Seed coffee products
pnpm db:seed

# Start dev server
pnpm dev
```

Runs on **[http://localhost:3300](http://localhost:3300)**.

## API Endpoints

| Method | Path                       | Description                                       |
| ------ | -------------------------- | ------------------------------------------------- |
| GET    | `/api/products`            | List all coffee products                          |
| POST   | `/api/products/[slug]/buy` | Buy a product (MPP-gated — returns 402 challenge) |
| GET    | `/api/orders`              | List all orders                                   |

## How MPP Works

1. Agent sends `POST /api/products/ethiopian-yirgacheffe/buy`
2. Server returns **402 Payment Required** with MPP challenge
3. Agent creates an SPT (Shared Payment Token) for the amount
4. Agent retries the request with the SPT as an MPP credential
5. Server processes payment via Stripe and returns order confirmation + receipt

## Products

| Name                  | Price  | Origin                | Roast  |
| --------------------- | ------ | --------------------- | ------ |
| Ethiopian Yirgacheffe | $18.00 | Yirgacheffe, Ethiopia | Light  |
| Colombian Supremo     | $15.00 | Huila, Colombia       | Medium |
| Sumatra Mandheling    | $20.00 | Mandheling, Sumatra   | Dark   |
| Guatemala Antigua     | $17.00 | Antigua, Guatemala    | Medium |
| Kenya AA              | $22.00 | Nyeri, Kenya          | Light  |
