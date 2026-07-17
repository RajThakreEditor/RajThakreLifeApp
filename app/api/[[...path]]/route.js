import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';

let client;
let db;

async function getDb() {
  if (db) return db;
  client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  db = client.db(process.env.DB_NAME || 'lifeos');
  return db;
}

function clean(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
}

// ---------- Finance & Health metric computation ----------
function currentMonthKey(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 7);
}

async function computeFinanceMetrics(database) {
  const txns = await database.collection('transactions').find({}).toArray();
  const months = Array.from({ length: 6 }, (_, i) => currentMonthKey(-5 + i));
  const byMonth = months.map((m) => {
    const inMonth = txns.filter((t) => (t.date || '').slice(0, 7) === m);
    const income = inMonth.filter((t) => t.type === 'Income').reduce((s, t) => s + Number(t.amount || 0), 0);
    const expense = inMonth.filter((t) => t.type === 'Expense').reduce((s, t) => s + Number(t.amount || 0), 0);
    const savings = inMonth.filter((t) => t.type === 'Savings').reduce((s, t) => s + Number(t.amount || 0), 0);
    const invest = inMonth.filter((t) => t.type === 'Investment').reduce((s, t) => s + Number(t.amount || 0), 0);
    const cashFlow = income - expense - savings - invest;
    const savingsRate = income > 0 ? Math.round(((savings + invest) / income) * 100) : 0;
    return { month: m, income, expense, savings, invest, cashFlow, savingsRate };
  });
  const current = byMonth[byMonth.length - 1];
  const netWorthProxy = txns
    .filter((t) => t.type === 'Savings' || t.type === 'Investment')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  // Finance score: savings rate target 30% -> 100
  const financeScore = current
    ? Math.max(0, Math.min(100, Math.round((current.savingsRate / 30) * 100)))
    : null;
  return { byMonth, current, netWorthProxy, financeScore };
}

async function computeHealthMetrics(database) {
  const rows = await database.collection('health_logs').find({}).sort({ date: 1 }).toArray();
  const last14 = rows.slice(-14);
  if (!last14.length) return { last14: [], averages: null, healthScore: null };
  const avg = (key) => Math.round((last14.reduce((s, r) => s + Number(r[key] || 0), 0) / last14.length) * 10) / 10;
  const averages = {
    sleep: avg('sleep'),
    water: avg('water'),
    steps: Math.round(avg('steps')),
    exercise: Math.round(avg('exercise')),
    mood: avg('mood'),
    energy: avg('energy'),
    weight: avg('weight'),
  };
  // score components (targets: sleep 7.5, water 3L, steps 8000, exercise 30min, mood 4)
  const sleepScore = Math.min(100, (averages.sleep / 7.5) * 100);
  const waterScore = Math.min(100, (averages.water / 3) * 100);
  const stepsScore = Math.min(100, (averages.steps / 8000) * 100);
  const exerciseScore = Math.min(100, (averages.exercise / 30) * 100);
  const moodScore = Math.min(100, (averages.mood / 5) * 100);
  const healthScore = Math.round((sleepScore + waterScore + stepsScore + exerciseScore + moodScore) / 5);
  return { last14, averages, healthScore, breakdown: { sleepScore, waterScore, stepsScore, exerciseScore, moodScore } };
}

// ---------- Life Score computation ----------
async function computeDashboard() {
  const database = await getDb();
  const goals = await database.collection('goals').find({}).toArray();
  const habits = await database.collection('habits').find({}).toArray();
  const logs = await database.collection('habit_logs').find({}).toArray();
  const finance = await computeFinanceMetrics(database);
  const health = await computeHealthMetrics(database);

  // Domain score from goals: avg (progress / max(expectedProgress,1)) * 100, capped 100
  const domainScore = (category) => {
    const g = goals.filter((x) => x.category === category);
    if (!g.length) return null;
    const scores = g.map((x) => {
      const exp = Math.max(x.expectedProgress || 1, 1);
      return Math.min(100, ((x.progress || 0) / exp) * 100);
    });
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  };

  // Habit score: 7-day consistency across all habits
  const habitScore = (() => {
    if (!habits.length) return null;
    const last7 = Array.from({ length: 7 }, (_, i) => todayStr(-i));
    let total = 0;
    let count = 0;
    for (const h of habits) {
      for (const d of last7) {
        const log = logs.find((l) => l.habitId === h.id && l.date === d);
        const pct = log ? Math.min(100, ((log.actual || 0) / Math.max(h.target || 1, 1)) * 100) : 0;
        total += pct;
        count += 1;
      }
    }
    return count ? Math.round(total / count) : 0;
  })();

  const components = [
    { key: 'career', label: 'Career', weight: 0.22, score: domainScore('Career') ?? 60 },
    { key: 'finance', label: 'Finance', weight: 0.22, score: finance.financeScore ?? domainScore('Finance') ?? 55 },
    { key: 'health', label: 'Health & Energy', weight: 0.18, score: health.healthScore ?? domainScore('Health') ?? 65 },
    { key: 'learning', label: 'Learning', weight: 0.13, score: domainScore('Learning') ?? 70 },
    { key: 'habits', label: 'Habits & Execution', weight: 0.15, score: habitScore ?? 50 },
    { key: 'relationships', label: 'Relationships', weight: 0.1, score: domainScore('Relationships') ?? 72 },
  ];

  const lifeScore = Math.round(
    components.reduce((s, c) => s + c.score * c.weight, 0)
  );

  // Decision Band — what deserves attention
  const decisions = [];
  const today = new Date();
  for (const g of goals) {
    if (g.status === 'Completed') continue;
    const exp = g.expectedProgress || 0;
    const gap = exp - (g.progress || 0);
    const daysLeft = g.targetDate ? daysBetween(today, g.targetDate) : null;
    let priority = 'Medium';
    if (gap > 25 || (daysLeft !== null && daysLeft < 14)) priority = 'High';
    if (gap > 40 || (daysLeft !== null && daysLeft < 5)) priority = 'Critical';
    if (gap > 10 || priority !== 'Medium') {
      decisions.push({
        type: 'Goal',
        item: g.title,
        category: g.category,
        due: g.targetDate,
        priority,
        gap: Math.round(gap),
      });
    }
  }
  // Habits missed today
  const t = todayStr();
  for (const h of habits) {
    const log = logs.find((l) => l.habitId === h.id && l.date === t);
    if (!log || (log.actual || 0) < (h.target || 1)) {
      decisions.push({
        type: 'Habit',
        item: h.title,
        category: h.category,
        due: t,
        priority: 'Medium',
        gap: null,
      });
    }
  }
  decisions.sort((a, b) => {
    const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return order[a.priority] - order[b.priority];
  });

  // Review band
  const wins = goals.filter((g) => (g.progress || 0) >= 100 || g.status === 'Completed').slice(0, 3).map((g) => g.title);
  // Weakest habit: lowest 7d consistency
  let weakestHabit = null;
  let worst = 101;
  for (const h of habits) {
    const last7 = Array.from({ length: 7 }, (_, i) => todayStr(-i));
    const pcts = last7.map((d) => {
      const l = logs.find((x) => x.habitId === h.id && x.date === d);
      return l ? Math.min(100, ((l.actual || 0) / Math.max(h.target || 1, 1)) * 100) : 0;
    });
    const avg = pcts.reduce((a, b) => a + b, 0) / 7;
    if (avg < worst) {
      worst = avg;
      weakestHabit = { title: h.title, consistency: Math.round(avg) };
    }
  }

  // Sparkline: last 14 days composite (approximated via habit score history)
  const sparkline = Array.from({ length: 14 }, (_, i) => {
    const d = todayStr(-13 + i);
    let s = 0;
    let c = 0;
    for (const h of habits) {
      const l = logs.find((x) => x.habitId === h.id && x.date === d);
      s += l ? Math.min(100, ((l.actual || 0) / Math.max(h.target || 1, 1)) * 100) : 0;
      c += 1;
    }
    const habitPart = c ? s / c : 50;
    // composite: blend habit part with static domain parts
    const compositeStatic = components.filter(x => x.key !== 'habits').reduce((sum, x) => sum + x.score * x.weight, 0);
    const habitWeight = 0.15;
    return { day: d.slice(5), score: Math.round(compositeStatic + habitPart * habitWeight) };
  });

  return {
    lifeScore,
    components,
    decisions: decisions.slice(0, 8),
    wins,
    weakestHabit,
    sparkline,
    finance,
    health,
    counts: {
      goals: goals.length,
      habits: habits.length,
      atRisk: decisions.filter((d) => d.priority === 'Critical' || d.priority === 'High').length,
    },
  };
}

// ---------- Seed ----------
async function seedIfEmpty() {
  const database = await getDb();
  const count = await database.collection('goals').countDocuments();
  if (count > 0) return { seeded: false };

  const goals = [
    { id: uuidv4(), title: 'Get promoted to Senior Engineer', category: 'Career', level: 'Annual', priority: 'Critical', progress: 62, expectedProgress: 70, status: 'In Progress', startDate: '2025-01-01', targetDate: '2025-12-31', parentId: null, description: 'Deliver 3 major projects and lead 1 initiative.' },
    { id: uuidv4(), title: 'Complete System Design certification', category: 'Learning', level: 'Quarterly', priority: 'High', progress: 45, expectedProgress: 60, status: 'In Progress', startDate: '2025-04-01', targetDate: '2025-08-30', parentId: null, description: 'Finish course + capstone project.' },
    { id: uuidv4(), title: 'Build emergency fund of 6 months expenses', category: 'Finance', level: 'Annual', priority: 'High', progress: 38, expectedProgress: 50, status: 'In Progress', startDate: '2025-01-01', targetDate: '2025-12-31', parentId: null, description: '' },
    { id: uuidv4(), title: 'Lose 8kg and reach target BMI', category: 'Health', level: 'Annual', priority: 'High', progress: 55, expectedProgress: 50, status: 'In Progress', startDate: '2025-01-01', targetDate: '2025-12-31', parentId: null, description: '' },
    { id: uuidv4(), title: 'Weekly date night with partner', category: 'Relationships', level: 'Quarterly', priority: 'Medium', progress: 72, expectedProgress: 75, status: 'In Progress', startDate: '2025-04-01', targetDate: '2025-06-30', parentId: null, description: '' },
    { id: uuidv4(), title: 'Ship personal SaaS side project MVP', category: 'Career', level: 'Quarterly', priority: 'High', progress: 30, expectedProgress: 65, status: 'At Risk', startDate: '2025-04-01', targetDate: '2025-07-15', parentId: null, description: '' },
  ];
  await database.collection('goals').insertMany(goals);

  const habits = [
    { id: uuidv4(), title: 'Deep work — 2 hours', category: 'Career', target: 120, unit: 'min' },
    { id: uuidv4(), title: 'Exercise', category: 'Health', target: 30, unit: 'min' },
    { id: uuidv4(), title: 'Read', category: 'Learning', target: 30, unit: 'min' },
    { id: uuidv4(), title: 'Water intake', category: 'Health', target: 3, unit: 'litres' },
    { id: uuidv4(), title: 'No social media before noon', category: 'Focus', target: 1, unit: 'yes/no' },
  ];
  await database.collection('habits').insertMany(habits);

  // Seed 14 days of habit logs with realistic completion patterns
  const logs = [];
  for (let i = 0; i < 14; i++) {
    const date = todayStr(-i);
    for (const h of habits) {
      const rand = Math.random();
      let actual;
      if (rand > 0.25) {
        actual = h.target * (0.6 + Math.random() * 0.6);
      } else {
        actual = h.target * Math.random() * 0.4;
      }
      logs.push({
        id: uuidv4(),
        habitId: h.id,
        date,
        actual: Math.round(actual * 10) / 10,
        target: h.target,
      });
    }
  }
  await database.collection('habit_logs').insertMany(logs);

  // ---- Finance seed: 6 months of transactions ----
  const txns = [];
  const catsIncome = ['Salary'];
  const catsExpense = ['Rent', 'Food', 'Transport', 'Entertainment', 'Utilities'];
  for (let m = 5; m >= 0; m--) {
    const monthDate = new Date();
    monthDate.setMonth(monthDate.getMonth() - m);
    const yyyymm = monthDate.toISOString().slice(0, 7);
    txns.push({ id: uuidv4(), date: `${yyyymm}-01`, type: 'Income', category: 'Salary', amount: 6500, account: 'Checking', notes: 'Monthly salary' });
    for (const c of catsExpense) {
      const amt = c === 'Rent' ? 1800 : c === 'Food' ? 550 + Math.random() * 150 : c === 'Utilities' ? 220 : 200 + Math.random() * 250;
      txns.push({ id: uuidv4(), date: `${yyyymm}-05`, type: 'Expense', category: c, amount: Math.round(amt), account: 'Checking', notes: '' });
    }
    txns.push({ id: uuidv4(), date: `${yyyymm}-28`, type: 'Savings', category: 'Emergency Fund', amount: 800, account: 'Savings', notes: '' });
    txns.push({ id: uuidv4(), date: `${yyyymm}-28`, type: 'Investment', category: 'Index ETF', amount: 1000, account: 'Brokerage', notes: '' });
  }
  await database.collection('transactions').insertMany(txns);

  // ---- Health seed: 30 days of logs ----
  const healthLogs = [];
  let weight = 78.5;
  for (let i = 29; i >= 0; i--) {
    weight -= 0.03 + Math.random() * 0.05;
    healthLogs.push({
      id: uuidv4(),
      date: todayStr(-i),
      weight: Math.round(weight * 10) / 10,
      sleep: Math.round((6.5 + Math.random() * 2) * 10) / 10,
      water: Math.round((2 + Math.random() * 2) * 10) / 10,
      steps: Math.round(5000 + Math.random() * 6000),
      exercise: Math.round(15 + Math.random() * 45),
      mood: Math.round(3 + Math.random() * 2),
      energy: Math.round(3 + Math.random() * 2),
      notes: '',
    });
  }
  await database.collection('health_logs').insertMany(healthLogs);

  return { seeded: true, goals: goals.length, habits: habits.length, transactions: txns.length, healthLogs: healthLogs.length };
}

// ---------- Shared LLM caller ----------
async function callClaude(systemPrompt, userPrompt, maxTokens = 900) {
  const key = process.env.EMERGENT_LLM_KEY;
  const endpoints = [
    'https://integrations.emergentagent.com/llm/chat/completions',
    'https://llm.emergentagent.com/v1/chat/completions',
  ];
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.4,
        }),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content || '';
      return text;
    } catch (e) {}
  }
  return null;
}

function extractJSON(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ---------- AI Brief ----------
async function generateBrief() {
  const dashboard = await computeDashboard();
  const key = process.env.EMERGENT_LLM_KEY;

  const context = {
    lifeScore: dashboard.lifeScore,
    components: dashboard.components,
    topDecisions: dashboard.decisions.slice(0, 5),
    weakestHabit: dashboard.weakestHabit,
    wins: dashboard.wins,
    finance: dashboard.finance ? {
      currentMonth: dashboard.finance.current,
      savingsRate: dashboard.finance.current?.savingsRate,
      netWorthProxy: dashboard.finance.netWorthProxy,
    } : null,
    health: dashboard.health ? {
      averages: dashboard.health.averages,
      healthScore: dashboard.health.healthScore,
    } : null,
  };

  const prompt = `You are the Chief of Staff for a high-performing executive. Below is today's snapshot of their Personal Life Operating System. Generate a concise, executive-grade Morning Brief.

Data:
${JSON.stringify(context, null, 2)}

Deliver the brief as JSON with exactly this shape:
{
  "headline": "one-sentence assessment of today's posture",
  "top_priorities": ["three concrete actions for today, ordered by impact"],
  "deserves_attention": "the single item most at risk and why",
  "improving": "what is trending up",
  "declining": "what is trending down",
  "executive_summary": "a two to three sentence paragraph in the tone of a chief of staff"
}

Rules: be specific, reference names from the data, no filler, no emojis, no markdown. Only return JSON.`;

  // Try Emergent gateway (OpenAI-compatible chat completions)
  const endpoints = [
    'https://integrations.emergentagent.com/llm/chat/completions',
    'https://llm.emergentagent.com/v1/chat/completions',
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          messages: [
            { role: 'system', content: 'You are a precise executive chief of staff. Return only valid JSON.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 800,
          temperature: 0.4,
        }),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content || '';
      // Extract JSON
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const brief = JSON.parse(match[0]);
      brief._model = 'claude-sonnet-4-5';
      brief._generatedAt = new Date().toISOString();
      return brief;
    } catch (e) {
      // try next
    }
  }

  // Deterministic fallback so UX never breaks
  const worstDomain = [...dashboard.components].sort((a, b) => a.score - b.score)[0];
  const bestDomain = [...dashboard.components].sort((a, b) => b.score - a.score)[0];
  const top = dashboard.decisions.slice(0, 3);
  return {
    headline: `Life score at ${dashboard.lifeScore}/100 — ${dashboard.lifeScore >= 70 ? 'on track' : dashboard.lifeScore >= 50 ? 'watch mode' : 'action required'}.`,
    top_priorities: top.length ? top.map((d) => `${d.type}: ${d.item}${d.gap ? ` (${d.gap}% behind plan)` : ''}`) : ['Log today\'s habits', 'Review your goal progress', 'Complete one deep-work block'],
    deserves_attention: top[0] ? `${top[0].item} — ${top[0].priority.toLowerCase()} priority, ${top[0].gap || 0}% behind expected pace.` : 'No critical items — maintain execution cadence.',
    improving: `${bestDomain.label} at ${bestDomain.score}/100 is your strongest domain.`,
    declining: `${worstDomain.label} at ${worstDomain.score}/100 needs deliberate attention this week.`,
    executive_summary: `You are operating at ${dashboard.lifeScore}/100 today. ${bestDomain.label} continues to compound in your favor while ${worstDomain.label} is dragging your composite score. Focus the next 24 hours on ${top[0]?.item || 'closing high-priority goal gaps'} to shift momentum.`,
    _model: 'fallback-heuristic',
    _generatedAt: new Date().toISOString(),
  };
}

// ---------- Weekly Review Generator ----------
async function generateWeeklyReview() {
  const database = await getDb();
  const dashboard = await computeDashboard();

  // Gather last 7 days context
  const habits = await database.collection('habits').find({}).toArray();
  const habitLogs = await database.collection('habit_logs').find({}).toArray();
  const goals = await database.collection('goals').find({}).toArray();
  const txns = await database.collection('transactions').find({}).toArray();
  const healthLogs = await database.collection('health_logs').find({}).sort({ date: 1 }).toArray();

  const last7 = Array.from({ length: 7 }, (_, i) => todayStr(-i));
  const weekStart = last7[6];
  const weekEnd = last7[0];

  const habitSummary = habits.map((h) => {
    const week = last7.map((d) => {
      const l = habitLogs.find((x) => x.habitId === h.id && x.date === d);
      return l ? Math.min(100, ((l.actual || 0) / Math.max(h.target || 1, 1)) * 100) : 0;
    });
    const avg = Math.round(week.reduce((a, b) => a + b, 0) / 7);
    return { habit: h.title, category: h.category, weekly_pct: avg };
  });

  const financeWeek = txns.filter((t) => t.date >= weekStart && t.date <= weekEnd);
  const incomeWk = financeWeek.filter((t) => t.type === 'Income').reduce((s, t) => s + Number(t.amount || 0), 0);
  const expenseWk = financeWeek.filter((t) => t.type === 'Expense').reduce((s, t) => s + Number(t.amount || 0), 0);
  const savingsWk = financeWeek.filter((t) => t.type === 'Savings' || t.type === 'Investment').reduce((s, t) => s + Number(t.amount || 0), 0);

  const healthWeek = healthLogs.filter((r) => r.date >= weekStart && r.date <= weekEnd);
  const avgSleep = healthWeek.length ? healthWeek.reduce((s, r) => s + Number(r.sleep || 0), 0) / healthWeek.length : null;
  const avgMood = healthWeek.length ? healthWeek.reduce((s, r) => s + Number(r.mood || 0), 0) / healthWeek.length : null;

  const context = {
    period: { start: weekStart, end: weekEnd },
    lifeScore: dashboard.lifeScore,
    components: dashboard.components,
    habits_this_week: habitSummary,
    weakest_habit: dashboard.weakestHabit,
    goals_status: goals.map((g) => ({
      title: g.title,
      category: g.category,
      priority: g.priority,
      progress: g.progress,
      expected: g.expectedProgress,
      status: g.status,
    })),
    finance_this_week: { income: incomeWk, expense: expenseWk, savings_and_invest: savingsWk },
    health_this_week: { avg_sleep_hrs: avgSleep, avg_mood_1to5: avgMood, days_logged: healthWeek.length },
  };

  const systemPrompt = 'You are an executive performance coach conducting a rigorous weekly review. Be direct, specific, and reference actual numbers and names from the data. Return only valid JSON.';
  const userPrompt = `Conduct a weekly review for the period ${weekStart} to ${weekEnd} using the data below.\n\nDATA:\n${JSON.stringify(context, null, 2)}\n\nReturn JSON exactly like this:\n{\n  "week_start": "${weekStart}",\n  "week_end": "${weekEnd}",\n  "score": 0-100 integer overall week score,\n  "wins": ["3-5 specific wins with names/numbers"],\n  "failures": ["3-5 specific failures or misses"],\n  "lessons": ["2-4 concrete lessons learned"],\n  "next_week_focus": ["3 concrete priorities for next week, ranked by impact"],\n  "narrative": "one paragraph executive narrative"\n}`;

  const text = await callClaude(systemPrompt, userPrompt, 1200);
  const parsed = extractJSON(text);
  if (parsed) {
    parsed._model = 'claude-sonnet-4-5';
    parsed._generatedAt = new Date().toISOString();
    return parsed;
  }

  // Fallback
  const bestHabit = [...habitSummary].sort((a, b) => b.weekly_pct - a.weekly_pct)[0];
  const worstHabit = [...habitSummary].sort((a, b) => a.weekly_pct - b.weekly_pct)[0];
  return {
    week_start: weekStart,
    week_end: weekEnd,
    score: dashboard.lifeScore,
    wins: [
      bestHabit ? `${bestHabit.habit} sustained at ${bestHabit.weekly_pct}% consistency` : 'Logged consistently',
      `Life Score held at ${dashboard.lifeScore}/100`,
    ],
    failures: [
      worstHabit ? `${worstHabit.habit} slipped to ${worstHabit.weekly_pct}%` : 'Some habits missed',
    ],
    lessons: ['Consistency compounds. Small daily execution beats sporadic effort.'],
    next_week_focus: dashboard.decisions.slice(0, 3).map((d) => `${d.type}: ${d.item}`),
    narrative: `This week closed at Life Score ${dashboard.lifeScore}. Focus next week on the top-priority items to compound gains.`,
    _model: 'fallback-heuristic',
    _generatedAt: new Date().toISOString(),
  };
}

// ---------- Router ----------
function pathOf(req) {
  const url = new URL(req.url);
  return url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
}

export async function GET(req) {
  try {
    const database = await getDb();
    const segs = pathOf(req);
    const root = segs[0];

    if (!root || root === 'health') {
      return NextResponse.json({ ok: true, service: 'LifeOS API' });
    }
    if (root === 'seed') {
      const r = await seedIfEmpty();
      return NextResponse.json(r);
    }
    if (root === 'dashboard') {
      const r = await computeDashboard();
      return NextResponse.json(r);
    }
    if (root === 'goals') {
      const list = await database.collection('goals').find({}).toArray();
      return NextResponse.json(list.map(clean));
    }
    if (root === 'habits') {
      const habits = await database.collection('habits').find({}).toArray();
      const logs = await database.collection('habit_logs').find({}).toArray();
      // enrich with analytics
      const enriched = habits.map((h) => {
        const last7 = Array.from({ length: 7 }, (_, i) => todayStr(-i));
        const last30 = Array.from({ length: 30 }, (_, i) => todayStr(-i));
        const pctFor = (days) => {
          const arr = days.map((d) => {
            const l = logs.find((x) => x.habitId === h.id && x.date === d);
            return l ? Math.min(100, ((l.actual || 0) / Math.max(h.target || 1, 1)) * 100) : 0;
          });
          return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
        };
        // streak: consecutive days meeting target ending today
        let streak = 0;
        for (let i = 0; i < 60; i++) {
          const d = todayStr(-i);
          const l = logs.find((x) => x.habitId === h.id && x.date === d);
          if (l && (l.actual || 0) >= (h.target || 1)) streak += 1;
          else break;
        }
        const todayLog = logs.find((x) => x.habitId === h.id && x.date === todayStr());
        return {
          ...clean(h),
          weekly: pctFor(last7),
          monthly: pctFor(last30),
          streak,
          todayActual: todayLog?.actual || 0,
        };
      });
      return NextResponse.json(enriched);
    }
    if (root === 'brief') {
      const brief = await generateBrief();
      // cache today's brief
      await database.collection('briefs').replaceOne(
        { date: todayStr() },
        { date: todayStr(), ...brief },
        { upsert: true }
      );
      return NextResponse.json(brief);
    }
    if (root === 'transactions') {
      const list = await database.collection('transactions').find({}).sort({ date: -1 }).toArray();
      return NextResponse.json(list.map(clean));
    }
    if (root === 'health-logs') {
      const list = await database.collection('health_logs').find({}).sort({ date: -1 }).toArray();
      return NextResponse.json(list.map(clean));
    }
    if (root === 'reseed') {
      await database.collection('goals').deleteMany({});
      await database.collection('habits').deleteMany({});
      await database.collection('habit_logs').deleteMany({});
      await database.collection('transactions').deleteMany({});
      await database.collection('health_logs').deleteMany({});
      const r = await seedIfEmpty();
      return NextResponse.json(r);
    }
    if (root === 'reviews') {
      const list = await database.collection('reviews').find({}).sort({ week_start: -1 }).toArray();
      return NextResponse.json(list.map(clean));
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const database = await getDb();
    const segs = pathOf(req);
    const root = segs[0];
    const body = await req.json().catch(() => ({}));

    if (root === 'goals') {
      const doc = {
        id: uuidv4(),
        title: body.title || 'Untitled goal',
        category: body.category || 'Career',
        level: body.level || 'Quarterly',
        priority: body.priority || 'Medium',
        progress: Number(body.progress || 0),
        expectedProgress: Number(body.expectedProgress || 0),
        status: body.status || 'In Progress',
        startDate: body.startDate || todayStr(),
        targetDate: body.targetDate || todayStr(90),
        parentId: body.parentId || null,
        description: body.description || '',
        createdAt: new Date().toISOString(),
      };
      await database.collection('goals').insertOne(doc);
      return NextResponse.json(clean(doc));
    }
    if (root === 'habits') {
      const doc = {
        id: uuidv4(),
        title: body.title || 'Untitled habit',
        category: body.category || 'General',
        target: Number(body.target || 1),
        unit: body.unit || 'yes/no',
        createdAt: new Date().toISOString(),
      };
      await database.collection('habits').insertOne(doc);
      return NextResponse.json(clean(doc));
    }
    if (root === 'habit-logs') {
      const date = body.date || todayStr();
      const existing = await database.collection('habit_logs').findOne({ habitId: body.habitId, date });
      if (existing) {
        await database.collection('habit_logs').updateOne(
          { habitId: body.habitId, date },
          { $set: { actual: Number(body.actual || 0) } }
        );
        return NextResponse.json({ ok: true, updated: true });
      }
      const doc = {
        id: uuidv4(),
        habitId: body.habitId,
        date,
        actual: Number(body.actual || 0),
        target: Number(body.target || 1),
      };
      await database.collection('habit_logs').insertOne(doc);
      return NextResponse.json({ ok: true, created: true });
    }
    if (root === 'brief') {
      const brief = await generateBrief();
      await database.collection('briefs').replaceOne(
        { date: todayStr() },
        { date: todayStr(), ...brief },
        { upsert: true }
      );
      return NextResponse.json(brief);
    }
    if (root === 'transactions') {
      const doc = {
        id: uuidv4(),
        date: body.date || todayStr(),
        type: body.type || 'Expense',
        category: body.category || 'Other',
        amount: Number(body.amount || 0),
        account: body.account || 'Checking',
        notes: body.notes || '',
      };
      await database.collection('transactions').insertOne(doc);
      return NextResponse.json(clean(doc));
    }
    if (root === 'health-logs') {
      const date = body.date || todayStr();
      const existing = await database.collection('health_logs').findOne({ date });
      const payload = {
        weight: Number(body.weight || existing?.weight || 0),
        sleep: Number(body.sleep || existing?.sleep || 0),
        water: Number(body.water || existing?.water || 0),
        steps: Number(body.steps || existing?.steps || 0),
        exercise: Number(body.exercise || existing?.exercise || 0),
        mood: Number(body.mood || existing?.mood || 3),
        energy: Number(body.energy || existing?.energy || 3),
        notes: body.notes || existing?.notes || '',
      };
      if (existing) {
        await database.collection('health_logs').updateOne({ date }, { $set: payload });
        return NextResponse.json({ ok: true, updated: true });
      }
      await database.collection('health_logs').insertOne({ id: uuidv4(), date, ...payload });
      return NextResponse.json({ ok: true, created: true });
    }
    if (root === 'reviews' && segs[1] === 'generate') {
      const review = await generateWeeklyReview();
      return NextResponse.json(review);
    }
    if (root === 'reviews') {
      const doc = {
        id: uuidv4(),
        week_start: body.week_start,
        week_end: body.week_end,
        score: Number(body.score || 0),
        wins: body.wins || [],
        failures: body.failures || [],
        lessons: body.lessons || [],
        next_week_focus: body.next_week_focus || [],
        narrative: body.narrative || '',
        createdAt: new Date().toISOString(),
      };
      // Upsert by week_start
      await database.collection('reviews').replaceOne(
        { week_start: doc.week_start },
        doc,
        { upsert: true }
      );
      return NextResponse.json(clean(doc));
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const database = await getDb();
    const segs = pathOf(req);
    const root = segs[0];
    const id = segs[1];
    const body = await req.json().catch(() => ({}));

    if (root === 'goals' && id) {
      const allowed = ['title', 'category', 'level', 'priority', 'progress', 'expectedProgress', 'status', 'startDate', 'targetDate', 'description'];
      const $set = {};
      for (const k of allowed) if (k in body) $set[k] = body[k];
      await database.collection('goals').updateOne({ id }, { $set });
      const updated = await database.collection('goals').findOne({ id });
      return NextResponse.json(clean(updated));
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const database = await getDb();
    const segs = pathOf(req);
    const root = segs[0];
    const id = segs[1];

    if (root === 'goals' && id) {
      await database.collection('goals').deleteOne({ id });
      return NextResponse.json({ ok: true });
    }
    if (root === 'habits' && id) {
      await database.collection('habits').deleteOne({ id });
      await database.collection('habit_logs').deleteMany({ habitId: id });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
