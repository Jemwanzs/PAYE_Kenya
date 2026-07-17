# Kenya PAYE & Tax Calculator V3

Files:
- `index.html` - structure and inputs
- `styles.css` - responsive UI/UX styling
- `script.js` - PAYE, deductions and net pay calculation logic
- `auth.js` - Supabase auth, trial and subscription gating
- `api/` - Vercel serverless functions (Paystack checkout, billing management, webhook)
- `supabase/schema.sql` - database schema (run once in Supabase)

Defaults used:
- PAYE bands: 10%, 25%, 30%, 32.5%, 35%
- Monthly personal relief: KES 2,400
- SHIF: 2.75% with KES 300 minimum
- AHL: 1.5% employee and 1.5% employer
- NSSF: 6% employee/employer, configurable upper limit default KES 108,000

All statutory rates are configurable directly from the calculator UI.

## Access model

Signup is required to use the calculator. New accounts get a 7-day free
trial; after that, an active Paystack subscription is required. This is
enforced by `auth.js` reading a `profiles` row from Supabase (protected by
Row Level Security) and gating the calculator markup accordingly.

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
1. Create a Paystack account (Kenya-eligible; supports card + M-Pesa).
2. Create a recurring Plan (KES amount + interval) and copy its plan code.
3. Copy the **Secret Key**.
4. After deploying, add a webhook endpoint pointing at
   `https://<your-domain>/api/paystack-webhook`.

### 3. Vercel
1. Connect this repo as a new Vercel project (it auto-detects the static
   files + `/api` functions, no build command needed).
2. In Project Settings > Environment Variables, set everything listed in
   `.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `PAYSTACK_SECRET_KEY`, `PAYSTACK_PLAN_CODE`, `APP_URL`.
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
- Added Supabase-backed accounts, a 7-day free trial, and Paystack subscription billing to gate access to the calculator.
