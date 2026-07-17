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

// ---------- Life Score computation ----------
async function computeDashboard() {
  const database = await getDb();
  const goals = await database.collection('goals').find({}).toArray();
  const habits = await database.collection('habits').find({}).toArray();
  const logs = await database.collection('habit_logs').find({}).toArray();

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
    { key: 'finance', label: 'Finance', weight: 0.22, score: domainScore('Finance') ?? 55 },
    { key: 'health', label: 'Health & Energy', weight: 0.18, score: domainScore('Health') ?? 65 },
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

  return { seeded: true, goals: goals.length, habits: habits.length };
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
