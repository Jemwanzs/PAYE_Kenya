# Kenya PAYE & Tax Calculator V3

Files:
- `index.html` - structure and inputs
- `styles.css` - responsive UI/UX styling
- `script.js` - PAYE, deductions and net pay calculation logic
- `auth.js` - Firebase auth, trial and day-pass access gating
- `api/` - Vercel serverless functions (Paystack checkout/webhook, admin actions,
  approval workflows, email reports) using `firebase-admin` for every write a
  Firestore Security Rule can't safely allow from the client
- `firestore.rules` / `storage.rules` - Firestore and Storage security rules
- `firestore.indexes.json` - composite indexes required by the app's queries
- `supabase/` - kept only as historical reference; this project no longer uses
  Supabase (see "Firebase migration" below)

Defaults used:
- PAYE bands: 10%, 25%, 30%, 32.5%, 35%
- Monthly personal relief: KES 2,400
- SHIF: 2.75% with KES 300 minimum
- AHL: 1.5% employee and 1.5% employer
- NSSF: 6% employee/employer, configurable upper limit default KES 108,000

All statutory rates are configurable directly from the calculator UI.

## Access model

Signup is required to use the calculator. New accounts get a 1-day free
trial (`TRIAL_DAYS` in `auth.js`); after that, a paid day-pass is required. Access is prepaid, not a
recurring subscription — buying a pack extends a `profiles/{uid}` document's
`accessExpiresAt` field by that many days (stacking on top of any unused
time). This is enforced by `auth.js` reading that document from Firestore
(access restricted by `firestore.rules`, which only lets a user read their
own profile) and blurring the calculator behind a purchase modal once access
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

### 1. Firebase
1. Create a project at console.firebase.google.com (or use an existing one).
2. Under Authentication > Sign-in method, enable **Email/Password**.
3. Under Build > Firestore Database, create a database (production mode).
4. Under Build > Storage, enable Storage (used for business logo uploads).
5. Copy the web app config (Project Settings > General > Your apps > Web
   app > SDK setup and configuration) into the `FIREBASE_CONFIG` object at
   the top of `auth.js` — these values are public by design, Security
   Rules are what restrict access.
6. Generate a service account key (Project Settings > Service accounts >
   Generate new private key) — this is secret, only goes into the Vercel
   `FIREBASE_SERVICE_ACCOUNT` env var (step 3 below), never into a file or
   chat.
7. Install the Firebase CLI (`npm install -g firebase-tools`), run
   `firebase login`, then from this repo run
   `firebase deploy --only firestore:rules,firestore:indexes,storage:rules`
   to publish `firestore.rules`, `firestore.indexes.json`, and
   `storage.rules` to the project. Re-run this any time those files change.

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
   `.env.example`: `FIREBASE_SERVICE_ACCOUNT`, `PAYSTACK_SECRET_KEY`,
   `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL`.
3. Deploy. Redeploy any time an env var changes.

### Local development
Open `index.html` in VS Code Live Server or any static server for
UI-only work. The `/api` functions need `vercel dev` (with the same env
vars in a local `.env`) to run locally, and Stripe-style webhook testing
via the Paystack CLI/test dashboard against that local endpoint.

## Latest update
- Migrated the entire backend from Supabase (Postgres + RLS) to Firebase
  (Firestore + Security Rules + Firebase Auth), while keeping the same
  Vercel hosting and Resend email delivery. See `firestore.rules` and the
  `api/` folder for the new data-access layer.
- Each allowance and benefit now has NSSF, SHIF and AHL impact checkboxes.
- All earning/benefit statutory-impact checkboxes are on by default except one-off allowances and overtime.
- The allowable deductions display now separates `NSSF + pension allowable deductions` from the wider statutory deductions used in taxable pay.
- Added Supabase-backed accounts, a 7-day free trial, and Paystack billing to gate access to the calculator.
- Added password visibility toggles and a self-service "forgot password" reset flow.
- Added an employee classification selector (Primary, Secondary, Contractor, Person With Disability) with classification-specific PAYE rules.
- Replaced the recurring Paystack subscription with prepaid day-passes (1-365 days); the calculator blurs behind a purchase modal once access lapses, with a "Buy more time" option to top up early.
