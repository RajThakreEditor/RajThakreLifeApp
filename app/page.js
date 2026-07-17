'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Target,
  Repeat,
  Sparkles,
  Plus,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Flame,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const CATEGORIES = ['Career', 'Finance', 'Health', 'Learning', 'Relationships', 'Projects', 'Focus'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const LEVELS = ['Long-term', 'Annual', 'Quarterly', 'Monthly', 'Weekly'];
const STATUSES = ['In Progress', 'At Risk', 'Blocked', 'Completed'];

function scoreColor(score) {
  if (score >= 75) return 'text-emerald-400';
  if (score >= 55) return 'text-amber-400';
  return 'text-rose-400';
}
function scoreBg(score) {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 55) return 'bg-amber-500';
  return 'bg-rose-500';
}
function priorityBadge(p) {
  const map = {
    Critical: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    High: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    Medium: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    Low: 'bg-neutral-500/15 text-neutral-300 border-neutral-500/30',
  };
  return map[p] || map.Medium;
}
function statusBadge(s) {
  const map = {
    'In Progress': 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    'At Risk': 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    Blocked: 'bg-neutral-500/15 text-neutral-300 border-neutral-500/30',
    Completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  };
  return map[s] || map['In Progress'];
}

function Sidebar({ view, setView }) {
  const items = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'habits', label: 'Habits', icon: Repeat },
    { id: 'coach', label: 'AI Coach', icon: Sparkles },
  ];
  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-border/60 bg-card/30 backdrop-blur-sm h-screen sticky top-0">
      <div className="px-6 py-6 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center font-bold text-neutral-950 text-sm">L</div>
          <div>
            <div className="text-sm font-semibold tracking-tight">LifeOS</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Executive Suite</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          const active = view === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setView(it.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all ${
                active
                  ? 'bg-neutral-100 text-neutral-950 font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              <Icon className="h-4 w-4" />
              {it.label}
            </button>
          );
        })}
      </nav>
      <div className="px-6 py-4 border-t border-border/60 text-[10px] text-muted-foreground uppercase tracking-widest">
        Phase 1 · MVP
      </div>
    </aside>
  );
}

function MobileNav({ view, setView }) {
  const items = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'habits', label: 'Habits', icon: Repeat },
    { id: 'coach', label: 'Coach', icon: Sparkles },
  ];
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur">
      <div className="grid grid-cols-4">
        {items.map((it) => {
          const Icon = it.icon;
          const active = view === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setView(it.id)}
              className={`flex flex-col items-center py-2.5 gap-1 ${active ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[10px]">{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScoreRing({ score }) {
  const pct = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (pct / 100) * circumference;
  const stroke = pct >= 75 ? '#34d399' : pct >= 55 ? '#fbbf24' : '#fb7185';
  return (
    <div className="relative h-40 w-40">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" stroke="rgba(255,255,255,0.06)" strokeWidth="8" fill="none" />
        <circle
          cx="60"
          cy="60"
          r="54"
          stroke={stroke}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`text-4xl font-bold tabular-nums ${scoreColor(score)}`}>{score}</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Life Score</div>
      </div>
    </div>
  );
}

function Dashboard({ data, brief, briefLoading, onRefreshBrief, onNav }) {
  if (!data) return <div className="p-8 text-muted-foreground">Loading executive dashboard…</div>;
  const label = data.lifeScore >= 75 ? 'On Track' : data.lifeScore >= 55 ? 'Watch' : 'Action Required';
  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="p-6 lg:p-8 bg-gradient-to-br from-card via-card to-neutral-900/40 border-border/60">
        <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-stretch">
          <div className="flex-shrink-0 flex flex-col items-center gap-4">
            <ScoreRing score={data.lifeScore} />
            <Badge variant="outline" className={`${scoreColor(data.lifeScore)} border-current`}>{label}</Badge>
          </div>
          <div className="flex-1 w-full">
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">14-Day Composite Trend</div>
                <div className="text-lg font-semibold mt-0.5">Life Momentum</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {data.counts.goals} goals · {data.counts.habits} habits · {data.counts.atRisk} at-risk
              </div>
            </div>
            <div className="h-40 -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.sparkline}>
                  <defs>
                    <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} width={28} />
                  <Tooltip
                    contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Area type="monotone" dataKey="score" stroke="#34d399" strokeWidth={2} fill="url(#g1)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Card>

      {/* Component grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {data.components.map((c) => (
          <Card key={c.key} className="p-4 border-border/60 hover:border-border transition">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className={`text-2xl font-bold tabular-nums mt-0.5 ${scoreColor(c.score)}`}>{c.score}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Weight</div>
                <div className="text-xs font-medium">{Math.round(c.weight * 100)}%</div>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className={`h-full ${scoreBg(c.score)}`} style={{ width: `${c.score}%` }} />
            </div>
          </Card>
        ))}
      </div>

      {/* Decision + Review Band */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 border-border/60">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Decision Band</div>
              <div className="text-lg font-semibold">What deserves attention</div>
            </div>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </div>
          <div className="space-y-2">
            {data.decisions.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center">Nothing critical. Maintain cadence.</div>
            )}
            {data.decisions.slice(0, 6).map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-white/[0.02] hover:bg-white/[0.04] border border-border/40">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{d.item}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {d.type} · {d.category}{d.due ? ` · due ${d.due}` : ''}{d.gap !== null && d.gap !== undefined ? ` · ${d.gap}% behind` : ''}
                  </div>
                </div>
                <Badge variant="outline" className={priorityBadge(d.priority)}>{d.priority}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 border-border/60">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Review Band</div>
              <div className="text-lg font-semibold">Signal from the last 7 days</div>
            </div>
            <Sparkles className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Recent Wins
              </div>
              {data.wins.length ? (
                <ul className="space-y-1.5">
                  {data.wins.map((w, i) => (
                    <li key={i} className="text-sm">{w}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted-foreground">No completions yet. Ship one this week.</div>
              )}
            </div>
            <Separator className="bg-border/40" />
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3 text-rose-400" /> Weakest Habit
              </div>
              {data.weakestHabit ? (
                <div className="flex items-center justify-between">
                  <div className="text-sm">{data.weakestHabit.title}</div>
                  <div className="text-sm tabular-nums text-rose-400">{data.weakestHabit.consistency}% / 7d</div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No habits configured.</div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* AI Brief teaser */}
      <Card className="p-6 border-border/60 bg-gradient-to-br from-neutral-900/60 to-card">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> AI Chief of Staff · Morning Brief
            </div>
            <div className="text-lg font-semibold mt-1">
              {brief?.headline || 'Generate today\u2019s executive brief'}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={onRefreshBrief} disabled={briefLoading}>
            {briefLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Refresh</span>
          </Button>
        </div>
        {brief ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground leading-relaxed">{brief.executive_summary}</p>
            {brief.top_priorities?.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Top priorities today</div>
                <ol className="space-y-1">
                  {brief.top_priorities.map((p, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums mt-0.5">{i + 1}.</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => onNav('coach')} className="text-xs h-7 -ml-2">
              View full brief <ArrowUpRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Click refresh to synthesize your data into a brief.</div>
        )}
      </Card>
    </div>
  );
}

function GoalDialog({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: 'Career',
    level: 'Quarterly',
    priority: 'High',
    progress: 0,
    expectedProgress: 0,
    status: 'In Progress',
    targetDate: '',
    description: '',
  });
  const submit = async () => {
    if (!form.title.trim()) return toast.error('Title required');
    const res = await fetch('/api/goals', { method: 'POST', body: JSON.stringify(form) });
    if (res.ok) {
      toast.success('Goal created');
      setOpen(false);
      setForm({ ...form, title: '', description: '' });
      onCreated?.();
    } else toast.error('Failed');
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" />New Goal</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create Goal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Ship product v2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Level</Label>
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEVELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Target date</Label>
              <Input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Progress %</Label>
              <Input type="number" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expected %</Label>
              <Input type="number" min="0" max="100" value={form.expectedProgress} onChange={(e) => setForm({ ...form, expectedProgress: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>Create Goal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoalsView({ goals, onRefresh }) {
  const [filter, setFilter] = useState('All');
  const filtered = filter === 'All' ? goals : goals.filter((g) => g.category === filter);

  const updateGoal = async (id, patch) => {
    const res = await fetch(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (res.ok) { onRefresh(); toast.success('Updated'); }
  };
  const deleteGoal = async (id) => {
    const res = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
    if (res.ok) { onRefresh(); toast.success('Deleted'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Goal Management</div>
          <div className="text-2xl font-semibold">Portfolio of {goals.length} goals</div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <GoalDialog onCreated={onRefresh} />
        </div>
      </div>
      <Card className="border-border/60 overflow-hidden">
        <div className="divide-y divide-border/40">
          {filtered.map((g) => {
            const gap = (g.expectedProgress || 0) - (g.progress || 0);
            const risk = gap > 25 ? 'High' : gap > 10 ? 'Medium' : 'Low';
            return (
              <div key={g.id} className="p-4 hover:bg-white/[0.02] transition group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium">{g.title}</div>
                      <Badge variant="outline" className={statusBadge(g.status)}>{g.status}</Badge>
                      <Badge variant="outline" className={priorityBadge(g.priority)}>{g.priority}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {g.category} · {g.level} · due {g.targetDate || '—'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">Risk</div>
                    <div className={`text-sm font-medium ${risk === 'High' ? 'text-rose-400' : risk === 'Medium' ? 'text-amber-400' : 'text-emerald-400'}`}>{risk}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="tabular-nums"><span className="font-medium">{g.progress}%</span> <span className="text-muted-foreground">/ exp {g.expectedProgress}%</span></span>
                    </div>
                    <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="absolute h-full bg-neutral-500/40" style={{ width: `${g.expectedProgress}%` }} />
                      <div className={`absolute h-full ${gap > 10 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${g.progress}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 justify-end">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateGoal(g.id, { progress: Math.min(100, (g.progress || 0) + 5) })}>+5%</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateGoal(g.id, { status: g.status === 'Completed' ? 'In Progress' : 'Completed', progress: 100 })}>
                      {g.status === 'Completed' ? 'Reopen' : 'Complete'}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-rose-400" onClick={() => deleteGoal(g.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No goals in this category yet.</div>}
        </div>
      </Card>
    </div>
  );
}

function HabitDialog({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'Health', target: 1, unit: 'yes/no' });
  const submit = async () => {
    if (!form.title.trim()) return toast.error('Title required');
    const res = await fetch('/api/habits', { method: 'POST', body: JSON.stringify(form) });
    if (res.ok) { toast.success('Habit added'); setOpen(false); setForm({ ...form, title: '' }); onCreated?.(); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" />New Habit</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create Habit</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Meditate" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes/no">yes/no</SelectItem>
                  <SelectItem value="min">minutes</SelectItem>
                  <SelectItem value="litres">litres</SelectItem>
                  <SelectItem value="pages">pages</SelectItem>
                  <SelectItem value="reps">reps</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Daily target</Label>
              <Input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: Number(e.target.value) })} />
            </div>
          </div>
        </div>
        <DialogFooter><Button onClick={submit}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HabitsView({ habits, onRefresh }) {
  const [logging, setLogging] = useState({});
  const logHabit = async (h, actual) => {
    setLogging((s) => ({ ...s, [h.id]: true }));
    const res = await fetch('/api/habit-logs', {
      method: 'POST',
      body: JSON.stringify({ habitId: h.id, actual, target: h.target }),
    });
    setLogging((s) => ({ ...s, [h.id]: false }));
    if (res.ok) { toast.success('Logged'); onRefresh(); }
  };
  const del = async (id) => {
    const res = await fetch(`/api/habits/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Removed'); onRefresh(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Habit System</div>
          <div className="text-2xl font-semibold">{habits.length} active habits</div>
        </div>
        <HabitDialog onCreated={onRefresh} />
      </div>
      <div className="grid gap-3">
        {habits.map((h) => {
          const complete = (h.todayActual || 0) >= h.target;
          return (
            <Card key={h.id} className="p-4 border-border/60">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium">{h.title}</div>
                    <Badge variant="outline" className="text-[10px]">{h.category}</Badge>
                    {complete && <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">Done today</Badge>}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">Target: {h.target} {h.unit} · today logged {h.todayActual} {h.unit}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">7d</div>
                    <div className={`text-sm font-semibold tabular-nums ${scoreColor(h.weekly)}`}>{h.weekly}%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">30d</div>
                    <div className={`text-sm font-semibold tabular-nums ${scoreColor(h.monthly)}`}>{h.monthly}%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1 justify-center"><Flame className="h-3 w-3 text-amber-400" /> Streak</div>
                    <div className="text-sm font-semibold tabular-nums">{h.streak}d</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {h.unit === 'yes/no' ? (
                  <Button size="sm" disabled={logging[h.id]} onClick={() => logHabit(h, complete ? 0 : 1)} variant={complete ? 'outline' : 'default'}>
                    {complete ? 'Un-log' : 'Mark done'}
                  </Button>
                ) : (
                  <>
                    <Input
                      type="number"
                      step="0.1"
                      defaultValue={h.todayActual}
                      className="w-24 h-8"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') logHabit(h, Number(e.target.value));
                      }}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== h.todayActual) logHabit(h, Number(e.target.value));
                      }}
                    />
                    <span className="text-xs text-muted-foreground">{h.unit}</span>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => logHabit(h, h.target)}>Log target</Button>
                  </>
                )}
                <div className="ml-auto">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-rose-400" onClick={() => del(h.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        {habits.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground border-border/60">No habits yet. Add your first one.</Card>}
      </div>
    </div>
  );
}

function CoachView({ brief, loading, onRefresh }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">AI Chief of Staff</div>
          <div className="text-2xl font-semibold">Morning Brief</div>
        </div>
        <Button onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          <span className="ml-2">Regenerate</span>
        </Button>
      </div>
      {!brief ? (
        <Card className="p-12 border-border/60 text-center text-muted-foreground">Click regenerate to synthesize your data into a brief.</Card>
      ) : (
        <div className="grid gap-4">
          <Card className="p-6 border-border/60 bg-gradient-to-br from-emerald-500/5 to-transparent">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Headline</div>
            <div className="text-xl font-semibold leading-snug">{brief.headline}</div>
          </Card>
          <Card className="p-6 border-border/60">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Executive summary</div>
            <p className="text-sm leading-relaxed text-foreground/90">{brief.executive_summary}</p>
          </Card>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-6 border-border/60">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5"><Target className="h-3 w-3" /> Top priorities today</div>
              <ol className="space-y-2">
                {(brief.top_priorities || []).map((p, i) => (
                  <li key={i} className="flex gap-3 items-start text-sm">
                    <div className="h-5 w-5 rounded-full bg-white/5 border border-border/60 flex items-center justify-center text-[10px] tabular-nums shrink-0">{i + 1}</div>
                    <span>{p}</span>
                  </li>
                ))}
              </ol>
            </Card>
            <Card className="p-6 border-border/60">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-400" /> Deserves attention</div>
              <p className="text-sm">{brief.deserves_attention}</p>
            </Card>
            <Card className="p-6 border-border/60">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5"><TrendingUp className="h-3 w-3 text-emerald-400" /> Improving</div>
              <p className="text-sm">{brief.improving}</p>
            </Card>
            <Card className="p-6 border-border/60">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5"><TrendingDown className="h-3 w-3 text-rose-400" /> Declining</div>
              <p className="text-sm">{brief.declining}</p>
            </Card>
          </div>
          <div className="text-[10px] text-muted-foreground text-right">Generated by {brief._model} · {new Date(brief._generatedAt).toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [view, setView] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [goals, setGoals] = useState([]);
  const [habits, setHabits] = useState([]);
  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);

  const refreshAll = async () => {
    const [dRes, gRes, hRes] = await Promise.all([
      fetch('/api/dashboard'),
      fetch('/api/goals'),
      fetch('/api/habits'),
    ]);
    if (dRes.ok) setDashboard(await dRes.json());
    if (gRes.ok) setGoals(await gRes.json());
    if (hRes.ok) setHabits(await hRes.json());
  };

  const refreshBrief = async () => {
    setBriefLoading(true);
    try {
      const res = await fetch('/api/brief', { method: 'POST' });
      if (res.ok) setBrief(await res.json());
    } finally { setBriefLoading(false); }
  };

  useEffect(() => {
    (async () => {
      await fetch('/api/seed');
      await refreshAll();
      // auto-load today's brief in background
      refreshBrief();
    })();
  }, []);

  const today = useMemo(() => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), []);

  return (
    <div className="min-h-screen flex">
      <Sidebar view={view} setView={setView} />
      <main className="flex-1 min-w-0 pb-24 lg:pb-8">
        {/* Top bar */}
        <div className="border-b border-border/60 bg-background/60 backdrop-blur sticky top-0 z-30">
          <div className="px-4 lg:px-8 py-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{today}</div>
              <div className="text-base lg:text-lg font-semibold">
                {view === 'dashboard' && 'Executive Dashboard'}
                {view === 'goals' && 'Goal Management'}
                {view === 'habits' && 'Habit Tracker'}
                {view === 'coach' && 'AI Coach'}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={refreshBrief} disabled={briefLoading}>
              {briefLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Morning Brief</span>
            </Button>
          </div>
        </div>

        <div className="px-4 lg:px-8 py-6 max-w-[1400px]">
          {view === 'dashboard' && <Dashboard data={dashboard} brief={brief} briefLoading={briefLoading} onRefreshBrief={refreshBrief} onNav={setView} />}
          {view === 'goals' && <GoalsView goals={goals} onRefresh={refreshAll} />}
          {view === 'habits' && <HabitsView habits={habits} onRefresh={refreshAll} />}
          {view === 'coach' && <CoachView brief={brief} loading={briefLoading} onRefresh={refreshBrief} />}
        </div>
      </main>
      <MobileNav view={view} setView={setView} />
    </div>
  );
}

export default App;
