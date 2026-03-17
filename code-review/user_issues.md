 Security & Functional Analysis: Multi-User Readiness

  This goes beyond the prior review (code-review/SECURITY_REVIEW.md) to focus specifically on issues that either only
  surface or dramatically worsen when new users are added.

  ---
  CRITICAL-1: FilingStatus and USState Not Imported in api.py — Tax Tab Is Broken For Everyone

  Location: api.py:6 (imports), api.py:350-351 (usage)

  The import line is:
  from models import User, Income, Asset, Debt, AssetType, RetirementAccount, AccountType,
                     Insurance, InsuranceFrequency, HourlyType, PlaidItem, Budget,
                     Transaction, Paystub, IncomeType
  FilingStatus and USState are not imported, but are used unconditionally in update_user_tax_info:
  if data.get('filing_status'): user.filing_status = safe_enum(FilingStatus, ...)  # NameError
  if data.get('state'): user.state = safe_enum(USState, ...)                        # NameError
  Any user who opens the Tax tab and saves their filing status or state will get a 500 crash. This is silent to existing
   owners because (a) the form may auto-populate values that match defaults and (b) the broad except Exception as e in
  other routes hides errors — but this route has no try/except at all, so it returns a full Python traceback to the
  client.

  Fix: Add FilingStatus, USState to the import on line 6.

  ---
  CRITICAL-2: No Path For New Users to Become Authorized — Premium Is Permanently Locked

  Location: api.py:112-127, Settings.js:204

  is_user_authorized() grants access via three channels: hardcoded email list, is_authorized flag in the user's
  Firestore doc, or presence in the whitelist collection. The Firestore rules (firestore.rules:14) only let
   [SCRUBBED]write to the whitelist. The "Upgrade Now" button in Settings alerts: "Subscription logic coming
  soon! You are currently being whitelisted for testing."

  Any new user who signs up:
  - Can log in and save manual data (PUT /api/portfolio has no auth check)
  - Gets 403 from every Plaid endpoint (/api/create_link_token, /api/set_access_token, /api/plaid_sync)
  - Gets 403 from /api/ask_advisor
  - Has no self-service upgrade path
  - Can only be unblocked by the owner manually writing to Firestore

  Before adding users, there needs to be an actual authorization-granting mechanism (payment processor webhook, admin
  panel, or invite code).

  ---
  HIGH-1: remove_institution Wipes ALL Transactions and ALL Plaid Assets, Not Just the Removed Institution

  Location: api.py:475-479

  assets = [a for a in assets if not a.plaid_account_id]  # removes ALL Plaid assets
  transactions = []  # wipes ALL transactions from ALL institutions

  If a user with 3 linked banks removes one, they lose every transaction ever synced and every Plaid-linked asset from
  all three banks. This is a silent, irreversible data loss bug that will affect the first multi-institution premium
  user.

  ---
  HIGH-2: plaid_account_id on Debts Is Never Persisted — Debt Duplication on Every Sync

  Location: firestore_db.py:59 (load), firestore_db.py:97 (save)

  The save path:
  'debts': [{'name': d.name, 'initial_amount': d.initial_amount,
             'amount_paid': d.amount_paid, 'monthly_payment': d.monthly_payment,
             'interest_rate': d.interest_rate}]  # ← no plaid_account_id
  And load path also omits plaid_account_id.

  The sync deduplication in plaid_sync (api.py:313) first tries to filter by plaid_account_id, then falls back to name
  matching. After the first sync-and-save cycle, all debts lose their plaid_account_id. On the second sync, the
  plaid_account_id filter finds nothing, so the name-based dedup is the only guard. If Plaid changes the debt name
  (e.g., "Visa" → "Visa Credit Card"), debts will duplicate on every sync.

  ---
  HIGH-3: remove_institution Has No Authorization Check

  Location: api.py:457-486

  POST /api/remove_institution is only decorated with @token_required — no is_user_authorized check. Any authenticated
  user (including free users who somehow have Plaid items from a prior premium period) can call this endpoint. The
  inconsistency with the other Plaid endpoints (create_link_token, set_access_token, plaid_sync all check authorization)
   means the access control model is porous.

  ---
  HIGH-4: Mutable Default Arguments in save_user_data — Latent Data Corruption

  Location: firestore_db.py:78

  def save_user_data(user, incomes, assets, debts, retirement_accounts, insurances,
                     plaid_items=[], budgets=[], transactions=[], paystubs=[], user_id="default_user"):

  Python evaluates default arguments once at function definition time, not per call. The same list objects are reused
  across all calls that omit those arguments. If any code path ever appends to one of these lists (e.g.,
  plaid_items.append(...)) without passing a fresh list, it will mutate the shared default and corrupt subsequent calls
  for other users. This hasn't triggered yet because callers always pass explicit lists, but it's a bug waiting to fire
  under future refactoring.

  ---
  HIGH-5: New User Sign-Up Creates a Firebase Account With No Whitelist Entry — Silent 403s

  Location: AuthContext.js:22, Login.js:30

  New users can successfully create a Firebase account and log in. The UI looks normal. But every time they click
  anything Plaid-related or the Advisor, they get a 403 with "Access restricted." and no actionable message. There's no
  onboarding flow that explains they need to be whitelisted, no "pending approval" state, and no indication in the UI
  that their account is incomplete. New users will think the app is broken.

  ---
  MEDIUM-1: demo_user Firestore Document Is Visible to Unauthenticated Guests

  Location: api.py:143

  When uid is "guest", GET /api/net_worth loads get_user_data(user_id="demo_user"). If a demo_user document exists in
  Firestore with any data (e.g., you once used this doc to test), all of it is served to anonymous visitors. The
  Firestore rules don't protect this because all requests to the demo_user doc go through the backend service account,
  which has full admin access.

  ---
  MEDIUM-2: App.js Hardcodes Owner Emails for isPremium State — Client-Side Bypass

  Location: App.js:103,144

  setIsPremium(response.data.is_authorized || response.data.is_subscribed ||
      currentUser?.email === 'yshirokov05@gmail.com' ||
      currentUser?.email === 'kirill.konoplianko@sjsu.edu' ||
      currentUser?.email === 'samanthagorvad@gmail.com' || false);

  The backend correctly gates Plaid endpoints via is_user_authorized. But the frontend isPremium flag also controls UI
  visibility (Plaid link button, advisor access). A user who modifies local state (or a future bug that sends
  is_authorized: true incorrectly) sees the premium UI. This is defense-in-depth missing — the backend is the real gate,
   but the client-side check is misleading and exposes all owner emails.

  ---
  MEDIUM-3: No Email Verification on Sign-Up

  Location: AuthContext.js:22

  createUserWithEmailAndPassword does not send a verification email. Users can:
  - Create accounts with email addresses they don't own
  - The owner has no way to verify whether a whitelisted user is who they say they are
  - Accounts can be created with password = "123456" (Firebase minimum is 6 characters, no complexity)

  ---
  MEDIUM-4: firestore.rules Admin Email Hardcoded in Deployed Security Rules

  Location: firestore.rules:14

  allow write: if request.auth != null && request.auth.token.email == 'yshirokov05@gmail.com';

  If this email is ever changed or compromised, the Firestore rules must be manually redeployed. More importantly, this
  email is already exposed in users.json (SEC-1 from prior review) and in the compiled JS bundle.

  ---
  Summary Table

  #: C-1
  Issue: FilingStatus/USState not imported → Tax tab 500s for everyone
  Severity: Critical
  Triggers On First New User?: Yes
  ────────────────────────────────────────
  #: C-2
  Issue: No authorization grant path — new users permanently locked from Plaid
  Severity: Critical
  Triggers On First New User?: Yes
  ────────────────────────────────────────
  #: H-1
  Issue: remove_institution wipes all transactions + all Plaid assets
  Severity: High
  Triggers On First New User?: Yes (first multi-institution user)
  ────────────────────────────────────────
  #: H-2
  Issue: Debt plaid_account_id not persisted → debt duplication on 2nd sync
  Severity: High
  Triggers On First New User?: Yes (first Plaid sync)
  ────────────────────────────────────────
  #: H-3
  Issue: remove_institution skips authorization check
  Severity: High
  Triggers On First New User?: Yes
  ────────────────────────────────────────
  #: H-4
  Issue: Mutable default args in save_user_data
  Severity: High
  Triggers On First New User?: Latent
  ────────────────────────────────────────
  #: H-5
  Issue: No onboarding for non-whitelisted users → silent 403 experience
  Severity: High
  Triggers On First New User?: Yes
  ────────────────────────────────────────
  #: M-1
  Issue: demo_user doc served to unauthenticated guests
  Severity: Medium
  Triggers On First New User?: If doc exists
  ────────────────────────────────────────
  #: M-2
  Issue: Owner emails hardcoded in client-side bundle
  Severity: Medium
  Triggers On First New User?: Already exists
  ────────────────────────────────────────
  #: M-3
  Issue: No email verification or password policy
  Severity: Medium
  Triggers On First New User?: Yes
  ────────────────────────────────────────
  #: M-4
  Issue: Admin email hardcoded in Firestore rules
  Severity: Medium
  Triggers On First New User?: Already exists

  The three that will break on the very first new user before they do anything interesting: C-1 (tax tab crashes), C-2
  (locked out of everything premium), and H-5 (no feedback that they're locked out). Those need to be fixed before any
  external user is invited.