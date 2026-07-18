# Kenya PAYE & Tax Calculator V3

Files:
- `index.html` - structure and inputs
- `styles.css` - responsive UI/UX styling
- `script.js` - PAYE, deductions and net pay calculation logic
- `auth.js` - Supabase auth, trial and day-pass access gating
- `api/` - Vercel serverless functions (Paystack checkout, webhook, shared price list)
- `supabase/schema.sql` - database schema (run once in Supabase, fresh installs)
- `supabase/migrate_day_passes.sql` - run once against an existing project to
  move from the old recurring-subscription schema to day-pass access

Defaults used:
- PAYE bands: 10%, 25%, 30%, 32.5%, 35%
- Monthly personal relief: KES 2,400
- SHIF: 2.75% with KES 300 minimum
- AHL: 1.5% employee and 1.5% employer
- NSSF: 6% employee/employer, configurable upper limit default KES 108,000

All statutory rates are configurable directly from the calculator UI.

## Access model

Signup is required to use the calculator. New accounts get a 7-day free
trial; after that, a paid day-pass is required. Access is prepaid, not a
recurring subscription — buying a pack extends `profiles.access_expires_at`
by that many days (stacking on top of any unused time). This is enforced by
`auth.js` reading a `profiles` row from Supabase (protected by Row Level
Security) and blurring the calculator behind a purchase modal once access
has lapsed. Users can also open the same modal any time via "Buy more time"
to top up early.

Day-pass pricing (`api/_dayPackages.js` is the authoritative source; the
copy in `auth.js` must be kept in sync):

| Days | Price (KES) |
|------|-------------|
| 1    | 200         |
| 2    | 400         |
| 3    | 500         |
| 4    | 600         |
| 5    | 700         |
| 15   | 1,500       |
| 30   | 2,800       |
| 90   | 8,000       |
| 180 (6 months)  | 15,000 |
| 365 (12 months) | 28,000 |

## One-time setup

### 1. Supabase
1. Create a project at supabase.com.
2. In the SQL Editor, run `supabase/schema.sql`.
3. Copy **Project URL** and **anon public key** (Settings > API) into
   `auth.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) — these are public by
   design, RLS is what restricts access.
4. Copy the **service_role key** — this is secret, only goes into Vercel
   env vars (step 3 below), never into a file or chat.
5. Under Authentication > URL Configuration, set the Site URL to your
   Vercel deployment URL once you have it.

### 2. Paystack
1. Create a Paystack account (Kenya-eligible; supports card + M-Pesa) and
   make sure KES transactions are enabled — no Plan needs to be created,
   day-passes are one-time transactions with the amount set per purchase.
2. Copy the **Secret Key**.
3. After deploying, add a webhook endpoint pointing at
   `https://<your-domain>/api/paystack-webhook`, subscribed to at least the
   `charge.success` event.

### 3. Vercel
1. Connect this repo as a new Vercel project (it auto-detects the static
   files + `/api` functions, no build command needed).
2. In Project Settings > Environment Variables, set everything listed in
   `.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `PAYSTACK_SECRET_KEY`, `APP_URL`.
3. Deploy. Redeploy any time an env var changes.

### Local development
Open `index.html` in VS Code Live Server or any static server for
UI-only work. The `/api` functions need `vercel dev` (with the same env
vars in a local `.env`) to run locally, and Stripe-style webhook testing
via the Paystack CLI/test dashboard against that local endpoint.

## Latest update
- Each allowance and benefit now has NSSF, SHIF and AHL impact checkboxes.
- All earning/benefit statutory-impact checkboxes are on by default except one-off allowances and overtime.
- The allowable deductions display now separates `NSSF + pension allowable deductions` from the wider statutory deductions used in taxable pay.
- Added Supabase-backed accounts, a 7-day free trial, and Paystack billing to gate access to the calculator.
- Added password visibility toggles and a self-service "forgot password" reset flow.
- Added an employee classification selector (Primary, Secondary, Contractor, Person With Disability) with classification-specific PAYE rules.
- Replaced the recurring Paystack subscription with prepaid day-passes (1-365 days); the calculator blurs behind a purchase modal once access lapses, with a "Buy more time" option to top up early.
