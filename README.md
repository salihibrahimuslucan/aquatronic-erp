# Aquatronic ERP

A single-page ERP built from scratch for a small manufacturing workshop, in production
use at a real business: inventory, production orders, BOMs, a CRM sales pipeline,
purchasing and a partner ledger.

I designed the architecture, the data model and the security boundaries described
below, and verified every phase against real user workflows.

## A note about the data

This repository was the live system of a real business. Before it went public, all real
inventory, BOM, supplier and CRM data (customers, quotes, deals) was scrubbed (**git
history included**) and replaced with synthetic samples in the same schema
(`src/data/sample-data.js`, `items.json`, `bom-seed.json`, `outsource.json`). Real
product photos and BOM-extraction outputs were removed the same way, also from the git
history. The code and the architecture are real; the data is not.

## What it does

- **Inventory** — photo-first product catalog, critical-threshold tracking, stocktake mode.
- **Production** — planned → in production → pool test → finished; completing an order
  consumes the BOM and books the finished goods into stock as a single atomic operation
  (the `complete_production_order` RPC).
- **CRM** — sales pipeline (lead → quote → negotiation → won/lost). A won deal becomes a
  production order in one click (the `source_deal_id` bridge).
- **Purchasing** — supplier-grouped order suggestions generated from critical stock →
  purchase order → goods receipt.
- **Partner ledger** — customer/supplier cards, linked to purchasing and CRM deals.
- **Roles** — admin / sales / production. CRM data (prices, contacts) is visible only to
  authorized roles; the production role can see that an order originates from a deal,
  but not what is in it.

## Architecture

Vite + vanilla ES modules, bundled into a single self-contained HTML file. The app grew
in phases:

- **Phase 0 — static:** Vite + vanilla ES modules, localStorage persistence.
- **Phase 1 — Supabase:** cloud store, login, roles, Row-Level Security.
- **Phase 2 — bridges:** CRM deal → production order, serial-number tracking, file/photo
  management.
- **Phase 3 (current) — rounding out:** partner ledger, purchasing-lite, reports panel,
  mobile UX.

## Security (lessons learned)

- **Two build targets.** `npm run build` produces the full app; `npm run build:uretim`
  ("üretim" = production floor) produces a build in which the sales module
  (`src/views/crm.js`, `src/data/crm-store.js`) never enters the module graph: a
  mode-dependent alias swaps it out, and `tools/build-uretim.mjs` then runs a leak scan
  over the emitted bundle. The package deployed to the production role contains **no
  sales or pricing code at all**. Not hidden behind a flag, physically absent from the
  bundle.
- **Row-Level Security.** Every table is protected by Supabase RLS. Unauthorized access
  was tested with a real user account in the wrong role and confirmed to return zero
  rows.
- **Both of these were done wrong once and then fixed.** Neither the build-target split
  nor RLS existed in the first version. Both were added after a real data-leak risk
  surfaced during development.

## Run the demo locally

```bash
npm install
npx vite --mode demo
```

`--mode demo` loads `.env.demo`, which deliberately empties the Supabase variables. The
app detects this and falls back to localStorage mode: no login screen, synthetic sample
data.

Other targets:

```bash
npm run dev             # same localStorage fallback when no Supabase vars are set
npm run build           # full bundle
npm run build:uretim    # production-floor bundle, sales code excluded
```

More generally: whenever `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` are not defined, the
app automatically falls back to the local JSON seed + localStorage, so a fresh clone
runs out of the box.
