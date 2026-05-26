# Fymo Marketing Kit

Paste-ready launch copy for the channels that matter most for an indie personal finance app. All copy is written to (a) sound human, (b) lead with the "shows its math" differentiator, and (c) avoid sounding promotional in a way that gets you banned from communities.

---

## Priority 1 — Fix the "fimo" autocorrect (biggest leverage)

The Google SERP currently shows "Including results for project fimo. Search only for project fymo." That's suppressing your organic traffic. The fix is **external brand signals**, and the highest-leverage one is a single good Reddit post.

### Reddit post — r/personalfinance, r/SideProject, r/IndieHackers

**Title:**
> I built Fymo — a personal finance app that shows its math

**Body:**
```
Like many of you I've been jumping between Mint (RIP), Monarch, Copilot, and YNAB for years. They're all fine but they share one frustration: when they show me a "net worth", a "tax estimate", or a "portfolio return", I can't see how they got there. It's all black-box.

So I built Fymo (https://projectfymo.com). Same category — bank sync via Plaid, investment tracking, budgeting, tax projection — but every number has a "Show Math" toggle that exposes the inputs, formulas, and any guards that kicked in to reject corrupt data.

A few things it does that I haven't seen elsewhere:

- 50-state tax projection engine with federal + state + FICA. Click "Show Math" and you see every bracket, every deduction, and what would change at the margin.
- Tax-loss harvesting suggestions — walks your Plaid 5-year transaction ledger via FIFO lot matching and identifies which exact open lots are underwater right now. ST vs LT classified.
- Daily AI morning brief (Claude Sonnet) that comments on YOUR actual data, not generic advice.
- Daily portfolio snapshots → real time-weighted returns instead of cost-basis approximations.
- Demo mode — full app with sample data, no signup. You can poke at it before deciding to connect anything.

Free demo, $9.99/mo for real-account features (Plaid sync, AI Analyst, daily emails).

I'm the only one working on it, so feedback hits my inbox directly. If you try it and something breaks or feels off, please tell me — I'd rather fix it than not know about it.

(Also, side note: Google's search algorithm currently autocorrects "fymo" to "fimo" because polymer clay has a lot more search volume than my indie app. If you happen to find this useful and link to it anywhere, you're helping me train the algorithm out of that mistake. Either way, thanks for reading.)
```

**Where to post:**
- r/personalfinance — most traffic, strict no-self-promo rules; this post threads the needle by leading with the problem and a personal story
- r/SideProject — explicitly welcomes "I built X" posts
- r/IndieHackers — same
- r/financialindependence — receptive to thoughtful tools
- r/Bogleheads — only if you can credibly speak to their value system (low-fee, evidence-based)

**Timing:** Tuesday or Wednesday, 9–11am ET. Worst times: Friday afternoon, Saturday night, Sunday morning.

**Don't:** Repost the same text to multiple subs in one day — Reddit's anti-spam picks that up. Stagger over a week, tailor the opening sentence per sub.

---

## Priority 2 — Twitter / X build-in-public

### Suggested handle
`@projectfymo` or `@fymohq` (check availability — `@fymo` may be taken).

### Bio (160 char limit)
> Personal finance that shows its math. Net worth, 50-state taxes, tax-loss harvesting, AI insights — all transparent. Free demo at projectfymo.com

### Pinned tweet
> I built a personal finance app where every number has a "Show Math" button.
>
> Net worth, tax projection, portfolio return — click the toggle and see exactly how it got there. No black box.
>
> Free demo, no signup: https://projectfymo.com
>
> [attach og-image.png]

### Daily build-in-public template

For each major commit/ship, post a screenshot + 1-2 sentence explanation:

> **Shipped today:** [feature name]
>
> [1-line what + why]
>
> [screenshot]

Example using v1.7.0:

> **Shipped today:** Tax-loss harvesting that shows its math.
>
> Walks your 5-yr Plaid ledger via FIFO lot matching, surfaces every open lot currently underwater, classifies ST vs LT. The exact opposite of "trust me, this is the answer."
>
> [screenshot of TaxLossHarvest panel]

Hashtags to rotate: #buildinpublic #indiehackers #personalfinance #fintech #SaaS

---

## Priority 3 — Product Hunt launch

Save this for a major version drop (v2.0, or whenever you have one big feature you're proud of). Submit on a **Tuesday or Wednesday**, midnight Pacific time. Avoid Mondays (busy) and weekends (low traffic).

### Tagline (60 char)
> Personal finance that shows its math, not just the answer

### Description
```
Fymo is the personal finance app for people who want to understand the numbers, not just see them.

Every figure has a "Show Math" toggle that exposes the inputs, formulas, and guards. Net worth? Tax projection? Portfolio return? Tax-loss harvest opportunities? Click and see exactly how it was calculated.

What you get on the free demo:
• Full app with sample data, no signup
• Net worth dashboard, asset breakdown, debt tracking
• 50-state federal + state + FICA tax projection
• FIFO realized-gains computation
• AI Analyst chat (Claude Sonnet, demo mode)

What unlocks at $9.99/mo:
• Plaid bank sync (12,000+ institutions)
• Tax-loss harvesting opportunities (per-lot specificity)
• Daily AI morning brief, emailed to you
• Financial Health Score (0-100, snapshotted daily)
• Dividend + earnings calendar for your holdings
• Two-factor authentication
• 1MB+ document extraction (paystubs, insurance, bank statements via Claude vision)

Built solo. Feedback goes straight to me.
```

### Launch-day tweet
> Fymo is live on @ProductHunt today 🚀
>
> A personal finance app where every number has a "Show Math" button. Net worth, taxes, portfolio returns — all transparent, no black box.
>
> If you've ever wondered how Mint got that number, this is for you.
>
> [PH link]

---

## Priority 4 — Indie Hackers post

Indie Hackers community is full of fellow founders. Lead with the story, not the product.

**Title:** Lessons from building Fymo: when "transparent UX" was harder than the AI

**Outline:**
1. Brief origin story — what frustrated me about Mint/Monarch/Copilot
2. The "Show Math" insight: people don't trust black-box numbers
3. Hardest technical challenge: making the math views actually clear (cost basis sanity guards, partial-coverage messaging, when to show "approx" vs N/A)
4. What's working: demo mode (no signup) means people actually try it
5. Stuck on: marketing (the "fymo" → "fimo" autocorrect — explain it, ask for advice)
6. Tech stack tldr: React 19 + Flask on Cloud Functions + Plaid + Claude Sonnet
7. Live at projectfymo.com — feedback welcome

---

## Priority 5 — Hacker News (use sparingly)

HN post if and only if you have something they care about (technical, opinionated, or controversial in a smart way). For Fymo, the right post would be a write-up of the **realized gains FIFO matching** logic — that's the kind of "I built this and learned something" that HN upvotes.

**Title options:**
- "I built a personal finance app that shows its math (and what that took)"
- "FIFO lot matching for cost basis when your data provider gives you neither"
- "What I learned building a 50-state tax engine from scratch"

Post: Show HN, Tuesday or Wednesday 9am ET. Reply to every comment within the first 4 hours — engagement velocity matters.

---

## Priority 6 — SEO content / blog posts (long-term traffic)

Personal finance is the highest-CPC niche in advertising → highest-traffic search niche. Long-form blog posts on commodity topics drive evergreen traffic.

### High-value post ideas (each 1500–2500 words)

1. **"How to track your net worth (the right way, with examples)"**
   - Math: Assets − Liabilities, including what to count as which
   - Tools comparison: spreadsheet vs Mint-style vs Fymo
   - Templates / downloadable
   - Mentions Fymo as one option

2. **"50 states, 50 tax bills: a guide to state income tax in 2026"**
   - Table comparing top marginal rate per state
   - Worked examples (W-2 worker in CA vs NY vs TX vs FL)
   - SEO gold — people search "[state] income tax 2026" all year

3. **"Tax-loss harvesting explained: when it works, when it doesn't, wash sale rules"**
   - The math
   - Wash sale rule (§1091)
   - Whose problem this is (high-bracket, taxable accounts only)
   - Mention Fymo's TLH feature in the context of "tools that surface candidate lots"

4. **"What Plaid actually gives you (and what it doesn't)"**
   - 12k+ institutions, 5-year transaction history, holdings without basis
   - The cost-basis problem
   - How Fymo reconstructs it
   - Trust signal for security-conscious users

5. **"Portfolio return: why the number Mint shows you is wrong"**
   - Time-weighted vs money-weighted return
   - Why cost-basis return is a lie when you've been DCA'ing
   - The right calculation
   - How Fymo does it

**Where to publish:** Your own /blog route (best for SEO), or a Substack/Beehiiv with cross-posts to Medium/dev.to. Owning the domain is better long-term.

**Claude can ghostwrite these.** Feed me one of the topics and your tax engine logic and I'll produce a 2,000-word draft. Repeat for each.

---

## Priority 7 — Get listed in directories

Each of these is one form submission, 5–10 min each, all give you a backlink with "Fymo" anchor text:

- [ ] **AlternativeTo.com** — list Fymo as alternative to Mint, Monarch, Copilot, YNAB
- [ ] **SaaSHub** — free SaaS directory
- [ ] **GetApp / Capterra** — bigger business but free listing helps
- [ ] **G2** — review platform, helps with trust signals
- [ ] **TheBigSampleBox / FintechCanvas / etc.** — fintech-specific directories
- [ ] **BetaList** (if you have an early-access offer)
- [ ] **Startup Stash**
- [ ] **Failory** (story-focused)

---

## Suggested first-week launch sequence

| Day | Action | Time |
|---|---|---|
| Mon | Verify Search Console, request indexing | 10 min |
| Tue | Reddit post on r/SideProject (smaller, safer first test) | 20 min |
| Wed | Twitter pinned tweet + first build-in-public update | 15 min |
| Thu | If Reddit went well, repost to r/personalfinance | 20 min |
| Fri | Indie Hackers post | 30 min |
| Sat | Submit to 5 directories | 1 hr |
| Sun | Rest, watch metrics |

**Total time: ~3 hours over a week.** No paid ads, no money out of pocket.

---

## What to track

- **Google Search Console** — daily impressions for "fymo" (watch the autocorrect-to-fimo notice go away)
- **GA4** — sessions / signups / Plaid-link rate
- **Stripe** — paid conversion (the only number that ultimately matters)

If after 30 days the Google autocorrect is still happening, the next move is to **pay for a few backlinks via Ahrefs-style guest posts on smaller personal-finance blogs**. Budget: $200–500. But try the free channels first.

---

## What I (Claude) can write for you next session

Tell me which one and I'll produce a finished draft:
- A 2,000-word SEO blog post on any of the topics in §6
- A press release announcement
- A welcome email drip (3 emails over 7 days for new signups)
- A landing-page conversion audit with specific A/B test variants
- Cold-email outreach copy for fintech newsletters (Money Stuff, Net Interest, etc.)
- Twitter thread breaking down one of your features
