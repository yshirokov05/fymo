// ─────────────────────────────────────────────────────────────────────────────
// SEO route table for the static prerender step (scripts/prerender.js).
//
// PerfinLab is a CRA single-page app: every URL serves the same empty
// `<div id="root"></div>` until the JS bundle runs, so crawlers and link
// unfurlers see no per-page content. This file is the single source of truth for
// the PUBLIC, crawlable routes — for each one the prerender script bakes a static
// HTML file (correct <title>, description, canonical, Open Graph, and real body
// copy) that Firebase Hosting serves directly. React then mounts over it
// (createRoot replaces the static content), so users still get the live SPA.
//
// Only marketing/content routes belong here — never authenticated app views.
// Keep titles/descriptions in sync with src/components/Learn.js when articles
// change. Body `blocks` only need to be representative (headline + section
// headings + a lead paragraph) — enough for search engines to index the topic.
// ─────────────────────────────────────────────────────────────────────────────

const SITE = 'https://perfinlab.com';

// Each route: url (canonical path), out (build-relative dir; '' = root),
// title, description, h1, lead (intro paragraph), and sections (H2 strings).
const routes = [
  {
    url: '/',
    out: '',
    title: 'PerfinLab — AI Personal Finance That Shows Its Math',
    description:
      'The personal finance app that shows its math. Net worth tracking, 50-state tax projection, tax-loss harvesting, and an AI analyst trained on YOUR real data. Free demo — no signup required.',
    h1: 'Your complete financial picture. Nothing hidden.',
    lead:
      'PerfinLab links all your accounts and tracks every dollar. For any number it shows you — net worth, taxes, savings rate, portfolio return — you can open the exact calculation behind it. See exactly where you stand, and exactly how the numbers got there.',
    sections: [
      'Net worth tracking with daily snapshots',
      'A 50-state tax projection engine',
      'Tax-loss harvesting suggestions',
      'An AI Analyst trained on your real data',
      'Plaid bank and brokerage sync',
      'Your money data, locked down',
    ],
  },
  {
    url: '/learn',
    out: 'learn',
    title: 'Learn — Money, Explained With the Math | PerfinLab',
    description:
      'Plain-English guides to personal finance — FIRE, emergency funds, tax-loss harvesting, how much house you can afford, and Roth vs Traditional — with the math shown, not hand-waved.',
    h1: 'Money, explained — with the math',
    lead:
      'Free, no-login guides to the personal-finance decisions that actually move the needle. Every article shows the numbers behind the rule of thumb, so you understand why, not just what.',
    sections: [
      'FIRE Explained: How Financial Independence, Retire Early Actually Works',
      'How Big Should Your Emergency Fund Be?',
      'Tax-Loss Harvesting Explained (Without the Jargon)',
      'How Much House Can You Actually Afford?',
      'Roth vs Traditional: Which Retirement Account Wins?',
    ],
  },
  {
    url: '/learn/financial-independence-retire-early',
    out: 'learn/financial-independence-retire-early',
    title: 'FIRE Explained: How Financial Independence, Retire Early Actually Works | PerfinLab',
    description:
      'What FIRE really means, the one number that defines it, the 4% rule, the flavors (lean/coast/barista/fat), and how to find your own timeline — with the math shown.',
    h1: 'FIRE Explained: How Financial Independence, Retire Early Actually Works',
    lead:
      "FIRE — Financial Independence, Retire Early — sounds like a lifestyle for tech millionaires. It isn't. At its core it's a single idea: build a pot of money big enough that the returns cover your living costs, so working becomes optional. Here's how it actually works, with the numbers shown.",
    sections: [
      'The one number that defines FIRE: your FI number',
      'The lever that matters most: your savings rate',
      'The flavors of FIRE',
      'Find your own timeline',
      'The honest caveats',
    ],
  },
  {
    url: '/learn/how-much-emergency-fund',
    out: 'learn/how-much-emergency-fund',
    title: 'How Big Should Your Emergency Fund Be? (And Where to Keep It) | PerfinLab',
    description:
      'The simple rule, when 3 months is enough vs when you need 6–12, and why a high-yield savings account beats both checking and investing it.',
    h1: 'How Big Should Your Emergency Fund Be? (And Where to Keep It)',
    lead:
      "An emergency fund is the cash that stops a bad week from becoming a financial disaster — a job loss, a medical bill, a car that dies. The question isn't whether to have one; it's how big, and where to keep it.",
    sections: [
      'The rule of thumb',
      'When to lean smaller (3 months) vs larger (6–12)',
      'Where to keep it: a high-yield savings account',
      'Build it before you invest aggressively',
    ],
  },
  {
    url: '/learn/tax-loss-harvesting-explained',
    out: 'learn/tax-loss-harvesting-explained',
    title: 'Tax-Loss Harvesting Explained (Without the Jargon) | PerfinLab',
    description:
      'How selling a loser can cut your tax bill while you stay invested, the wash-sale trap to avoid, and who actually benefits — with the math.',
    h1: 'Tax-Loss Harvesting Explained (Without the Jargon)',
    lead:
      'Tax-loss harvesting is one of the few ways to turn a losing investment into something useful: a smaller tax bill. The idea is simple, but one rule — the wash sale — trips up almost everyone. Here it is in plain English, with the math.',
    sections: [
      'How it works',
      'The wash-sale rule (the one trap)',
      'Who actually benefits',
      'The honest catch',
    ],
  },
  {
    url: '/learn/how-much-house-can-i-afford',
    out: 'learn/how-much-house-can-i-afford',
    title: 'How Much House Can You Actually Afford? | PerfinLab',
    description:
      'The 28/36 rule, the true cost beyond the mortgage (PITI + maintenance), and how to back into a real price from your income — with the math.',
    h1: 'How Much House Can You Actually Afford?',
    lead:
      'The bank will tell you the biggest loan you qualify for. That is not the same as what you can afford. The gap between those two numbers is where most house-poor stories begin. Here is how to find your real number, with the math.',
    sections: [
      'The 28/36 rule',
      '"Housing cost" is more than the mortgage',
      'Backing into a price',
      'Before you buy',
    ],
  },
  {
    url: '/learn/roth-vs-traditional',
    out: 'learn/roth-vs-traditional',
    title: 'Roth vs Traditional: Which Retirement Account Wins? | PerfinLab',
    description:
      'The single question that decides it, when each one wins, and why "tax diversification" might be the smartest answer — with the math.',
    h1: 'Roth vs Traditional: Which Retirement Account Wins?',
    lead:
      'Roth or Traditional is one of the most-argued questions in personal finance, and most answers overcomplicate it. It really comes down to one comparison — your tax rate now versus your tax rate in retirement. Here it is, with the math.',
    sections: [
      'The core difference',
      'The deciding question',
      'Beyond the tax bracket',
    ],
  },
  {
    url: '/privacy',
    out: 'privacy',
    title: 'Privacy Policy | PerfinLab',
    description:
      'How PerfinLab collects, uses, encrypts, and protects your financial data — including Plaid, AI processing, Stripe billing, data deletion, and your CCPA/GDPR rights.',
    h1: 'Privacy Policy',
    lead:
      'PerfinLab is a personal finance app built around transparency — including about your data. This policy explains what we collect, how it is encrypted and used, who it is shared with, and the rights you have to access or delete it.',
    sections: [],
  },
  {
    url: '/terms',
    out: 'terms',
    title: 'Terms of Service | PerfinLab',
    description:
      'The terms governing your use of PerfinLab — accounts, subscriptions and billing, acceptable use, disclaimers, and limitations of liability.',
    h1: 'Terms of Service',
    lead:
      'These terms govern your use of PerfinLab. They cover your account, subscriptions and billing, acceptable use, and the disclaimers that apply to the financial information the app provides.',
    sections: [],
  },
];

module.exports = { SITE, routes };
