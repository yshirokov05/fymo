import React, { useEffect } from 'react';
import { ArrowRight, Clock, ChevronLeft } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Public "Learn" hub. Articles are PUBLIC (no login) — they're the SEO/acquisition
// surface. URL-routed via App.js (/learn, /learn/<slug>) so each has a crawlable URL.
// Add an entry to ARTICLES to publish a new piece.
// ─────────────────────────────────────────────────────────────────────────────

const go = (type, slug) =>
    window.dispatchEvent(new CustomEvent(type, slug ? { detail: { slug } } : undefined));

const H2 = ({ children }) => <h2 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white mt-10 mb-3">{children}</h2>;
const P = ({ children }) => <p className="text-[15px] leading-relaxed text-gray-700 dark:text-slate-300 mb-4">{children}</p>;
const Callout = ({ children }) => (
    <div className="my-6 rounded-xl border border-blue-100 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/20 p-4 text-[14px] leading-relaxed text-blue-900 dark:text-blue-200">
        {children}
    </div>
);
const Li = ({ children }) => <li className="text-[15px] leading-relaxed text-gray-700 dark:text-slate-300">{children}</li>;

const ARTICLES = [
    {
        slug: 'financial-independence-retire-early',
        title: 'FIRE Explained: How Financial Independence, Retire Early Actually Works',
        description: 'What FIRE really means, the one number that defines it, the 4% rule, the flavors (lean/coast/barista/fat), and how to find your own timeline — with the math shown.',
        read: '8 min read',
        date: '2026-06-18',
        body: (
            <>
                <P>FIRE — <strong>Financial Independence, Retire Early</strong> — sounds like a lifestyle for tech millionaires. It isn't. At its core it's a single, almost boring idea: build a pot of money big enough that the returns cover your living costs, so working becomes optional. Here's how it actually works, with the numbers shown — no hand-waving.</P>

                <H2>The one number that defines FIRE: your FI number</H2>
                <P>Your <strong>FI (financial independence) number</strong> is the size your investments need to reach so you can live off them indefinitely. The simplest, widely-used estimate:</P>
                <Callout><strong>FI number = your annual spending × 25.</strong> Spend $40,000/year? Your FI number is $1,000,000. Spend $80,000? It's $2,000,000.</Callout>
                <P>Why 25×? It's the inverse of the <strong>4% rule</strong> (1 ÷ 0.04 = 25). The 4% rule comes from research on historical market returns suggesting that if you withdraw about 4% of a diversified portfolio in year one and adjust for inflation after, the money has a high chance of lasting 30+ years. It's a guideline, not a guarantee — but it's the anchor most of the FIRE world uses.</P>

                <H2>The lever that matters most: your savings rate</H2>
                <P>Here's the counter-intuitive part. How fast you reach FIRE depends far less on your income and far more on the <strong>percentage of your income you save</strong> — because your savings rate sets both how fast the pot grows <em>and</em> how big it needs to be (lower spending = smaller FI number).</P>
                <P>Rough years-to-FI from zero, assuming ~5% real returns:</P>
                <ul className="list-disc pl-6 space-y-1.5 mb-4">
                    <Li><strong>10% savings rate</strong> → ~51 years</Li>
                    <Li><strong>25% savings rate</strong> → ~32 years</Li>
                    <Li><strong>50% savings rate</strong> → ~17 years</Li>
                    <Li><strong>65% savings rate</strong> → ~10.5 years</Li>
                </ul>
                <P>That's why the FIRE community obsesses over the gap between earning and spending. A raise you spend changes nothing. A raise you save moves the finish line twice.</P>

                <H2>The flavors of FIRE</H2>
                <ul className="list-disc pl-6 space-y-1.5 mb-4">
                    <Li><strong>Lean FIRE</strong> — a frugal FI number (often under ~$1M); retire early on modest spending.</Li>
                    <Li><strong>Fat FIRE</strong> — a larger number that funds a comfortable, no-compromises lifestyle.</Li>
                    <Li><strong>Coast FIRE</strong> — you've invested enough <em>early</em> that compounding alone will grow it to your FI number by traditional retirement age. You no longer need to invest; you just cover today's bills.</Li>
                    <Li><strong>Barista FIRE</strong> — a partial pot plus light/part-time work (often for healthcare or to bridge the gap).</Li>
                </ul>

                <H2>Find your own timeline</H2>
                <P>You only need three inputs: your annual spending, what you've already invested, and how much you add each month. From there: FI number = spending × 25, and the gap between that and your current net worth — divided by your monthly savings and growth — is your runway.</P>
                <Callout>This is exactly what PerfinLab tracks for you: your net worth, your real savings rate (from your actual transactions), and projections — with the math shown, so you can see <em>why</em> the number is what it is, not just a black-box estimate.</Callout>

                <H2>The honest caveats</H2>
                <P>The 4% rule is a historical guideline, not a law — sequence-of-returns risk, healthcare, and a 50-year (not 30-year) retirement all argue for a cushion (many use 3.25–3.5% withdrawal, i.e. 28–30× spending). FIRE also isn't all-or-nothing: even if you never "retire early," a high savings rate buys you options, resilience, and the freedom to walk away from a bad job. That alone is worth the math.</P>
            </>
        ),
    },
    {
        slug: 'how-much-emergency-fund',
        title: 'How Big Should Your Emergency Fund Be? (And Where to Keep It)',
        description: 'The simple rule, when 3 months is enough vs when you need 6–12, and why a high-yield savings account beats both checking and investing it.',
        read: '5 min read',
        date: '2026-06-18',
        body: (
            <>
                <P>An emergency fund is the cash that stops a bad week from becoming a financial disaster — a job loss, a medical bill, a car that dies. The question isn't <em>whether</em> to have one; it's <strong>how big</strong>, and <strong>where</strong> to keep it.</P>

                <H2>The rule of thumb</H2>
                <Callout><strong>3–6 months of essential expenses.</strong> "Essential" means rent/mortgage, utilities, food, insurance, minimum debt payments — not vacations or dining out.</Callout>
                <P>So if your bare-bones monthly cost of living is $3,000, your target is roughly <strong>$9,000–$18,000</strong>.</P>

                <H2>When to lean smaller (3 months) vs larger (6–12)</H2>
                <ul className="list-disc pl-6 space-y-1.5 mb-4">
                    <Li><strong>Lean toward 3 months</strong> if you have very stable income (e.g. a secure salaried job), dual incomes, or strong backup options.</Li>
                    <Li><strong>Lean toward 6–12 months</strong> if you're self-employed, on commission, a single income for a household, in a niche field where job searches are slow, or you have dependents.</Li>
                </ul>

                <H2>Where to keep it: a high-yield savings account</H2>
                <P>The emergency fund has one job: be there, in full, the day you need it. That rules out two tempting options:</P>
                <ul className="list-disc pl-6 space-y-1.5 mb-4">
                    <Li><strong>Not checking</strong> — it earns ~0% and it's too easy to spend.</Li>
                    <Li><strong>Not investments</strong> — the market can be down 20% exactly when you get laid off. Emergencies don't wait for a recovery.</Li>
                </ul>
                <P>A <strong>high-yield savings account (HYSA)</strong> is the sweet spot: FDIC-insured, instantly accessible, and currently paying meaningfully more than checking. Your safety net should be boring and liquid — not a bet.</P>

                <Callout>PerfinLab shows your emergency-fund coverage as a number of months (your liquid cash ÷ your real monthly spending), so you can see at a glance whether you're under-, on-, or over-target — and track HYSA balances and APY right alongside it.</Callout>

                <H2>Build it before you invest aggressively</H2>
                <P>The usual order: a small starter buffer ($1,000) → pay off high-interest debt → build the full 3–6 months → then pour into investing. A funded emergency fund is what lets you stay invested through a downturn instead of selling at the bottom to cover a surprise bill.</P>
            </>
        ),
    },
];

export const LEARN_ARTICLES = ARTICLES;

const Shell = ({ children }) => (
    <div className="min-h-screen bg-white dark:bg-slate-900">
        <header className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-gray-100 dark:border-slate-800">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
                <button onClick={() => go('nav-home')} className="flex items-center gap-2">
                    <span className="text-xl font-black tracking-tight text-blue-600 dark:text-blue-400">Perfin<span className="text-gray-900 dark:text-white">Lab</span></span>
                </button>
                <div className="flex items-center gap-4 text-sm">
                    <button onClick={() => go('nav-learn')} className="font-semibold text-gray-600 dark:text-slate-300 hover:text-blue-600">Learn</button>
                    <button onClick={() => go('nav-app')} className="font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-1.5">Open the app</button>
                </div>
            </div>
        </header>
        {children}
        <footer className="border-t border-gray-100 dark:border-slate-800 mt-16">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400 dark:text-slate-500">
                <span>© {new Date().getFullYear()} PerfinLab</span>
                <div className="flex gap-4">
                    <button onClick={() => go('nav-learn')} className="hover:text-gray-600">Learn</button>
                    <button onClick={() => go('nav-privacy')} className="hover:text-gray-600">Privacy</button>
                    <button onClick={() => go('nav-terms')} className="hover:text-gray-600">Terms</button>
                </div>
            </div>
        </footer>
    </div>
);

const Hub = () => {
    useEffect(() => { document.title = 'Learn — Personal Finance, Explained | PerfinLab'; }, []);
    return (
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
            <h1 className="text-4xl font-black tracking-tight text-gray-900 dark:text-white">Learn</h1>
            <p className="mt-3 text-gray-500 dark:text-slate-400 max-w-xl">Plain-English guides to the money decisions that actually move the needle — with the math shown, never a black box.</p>
            <div className="mt-10 space-y-4">
                {ARTICLES.map(a => (
                    <button key={a.slug} onClick={() => go('nav-article', a.slug)}
                        className="block w-full text-left bg-white dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/60 rounded-2xl p-5 hover:border-blue-200 dark:hover:border-blue-500/40 hover:shadow-sm transition-all group">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">{a.title}</h2>
                        <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400 leading-relaxed">{a.description}</p>
                        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
                            <Clock size={12} /> {a.read}
                            <span className="ml-auto inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400">Read <ArrowRight size={13} /></span>
                        </div>
                    </button>
                ))}
            </div>
        </main>
    );
};

const Article = ({ a }) => {
    useEffect(() => {
        document.title = `${a.title} | PerfinLab`;
        const m = document.querySelector('meta[name="description"]');
        const prev = m ? m.getAttribute('content') : null;
        if (m) m.setAttribute('content', a.description);
        return () => { if (m && prev) m.setAttribute('content', prev); };
    }, [a]);
    return (
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <button onClick={() => go('nav-learn')} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline mb-6">
                <ChevronLeft size={16} /> All articles
            </button>
            <article>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-gray-900 dark:text-white leading-tight">{a.title}</h1>
                <div className="mt-3 flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
                    <Clock size={12} /> {a.read} · {new Date(a.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <div className="mt-8">{a.body}</div>
            </article>
            <div className="mt-12 rounded-2xl bg-blue-600 p-6 text-center">
                <p className="text-white font-bold text-lg">See your own numbers — with the math shown.</p>
                <p className="text-blue-100 text-sm mt-1">Net worth, savings rate, and projections from your real accounts.</p>
                <button onClick={() => go('nav-app')} className="mt-4 inline-flex items-center gap-1.5 bg-white text-blue-600 font-bold rounded-xl px-6 py-2.5 hover:bg-blue-50">
                    Try PerfinLab free <ArrowRight size={16} />
                </button>
            </div>
        </main>
    );
};

const Learn = ({ slug }) => {
    const article = slug ? ARTICLES.find(a => a.slug === slug) : null;
    return <Shell>{article ? <Article a={article} /> : <Hub />}</Shell>;
};

export default Learn;
