'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { hasProductsFeature } from '@/lib/categoryConfig';
import Sidebar from '../../components/Sidebar';
import styles from './Analytics.module.css';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  ScatterChart, Scatter, ComposedChart,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import {
  getWeeklyAnalytics, getHourlyAnalytics, getPeakHoursAnalytics,
  getServiceTimeDistribution, getTopProducts, getDailyServiceBreakdown,
  getOverallStats, getTrafficOverTime, getConversionRate, getSalesTrend,
  getCustomerDemographics, getProductPerformance, getDrillDownHeatmap,
  generateInsights,
} from '@/lib/api/analytics';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  ink:     '#0D0D0D',
  paper:   '#F8F6F1',
  cream:   '#EDE9E1',
  blue:    '#1A56DB',
  blueL:   '#3B82F6',
  teal:    '#0D9488',
  amber:   '#D97706',
  rose:    '#E11D48',
  green:   '#059669',
  purple:  '#7C3AED',
  orange:  '#EA580C',
  indigo:  '#4F46E5',
  muted:   '#6B7280',
  border:  '#E2DDD5',
};

const PIES = [C.blue, C.teal, C.amber, C.rose, C.green, C.purple];

// ─── Calendar Picker ──────────────────────────────────────────────────────────
function CalendarPicker({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : label;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.5rem 1rem', background: value ? C.blue : '#fff',
        color: value ? '#fff' : C.ink, border: `1.5px solid ${value ? C.blue : C.border}`,
        borderRadius: 10, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
        fontFamily: 'inherit', transition: 'all 0.2s', whiteSpace: 'nowrap',
      }}>
        <span style={{ fontSize: '0.9rem' }}>📅</span>
        {fmt(value)}
        {value && <span onClick={(e) => { e.stopPropagation(); onChange(null); }} style={{ marginLeft: 4, opacity: 0.7 }}>✕</span>}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 200,
          background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 14,
          padding: '1rem', boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
          minWidth: 260,
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: C.muted, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</div>
          <input type="date" value={value || ''} onChange={e => { onChange(e.target.value); setOpen(false); }}
            style={{
              width: '100%', padding: '0.6rem 0.75rem', border: `1.5px solid ${C.border}`,
              borderRadius: 8, fontSize: '0.9rem', fontFamily: 'inherit', color: C.ink,
              background: C.paper, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Today', days: 0 },
              { label: '7 days ago', days: 7 },
              { label: '30 days ago', days: 30 },
            ].map(q => (
              <button key={q.label} onClick={() => {
                const d = new Date(); d.setDate(d.getDate() - q.days);
                onChange(d.toISOString().split('T')[0]); setOpen(false);
              }} style={{
                padding: '0.3rem 0.65rem', background: C.paper, border: `1px solid ${C.border}`,
                borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', color: C.muted, fontWeight: 600,
              }}>{q.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label, pre = '', suf = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', fontSize: 12.5,
    }}>
      {label && <div style={{ fontWeight: 800, marginBottom: 6, color: C.ink, fontFamily: "'DM Serif Display', serif" }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ color: C.muted }}>{p.name}:</span>
          <span style={{ fontWeight: 700, color: C.ink }}>{pre}{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}{suf}</span>
        </div>
      ))}
    </div>
  );
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPI({ icon, label, value, change, sub, accent = C.blue }) {
  const up = change >= 0;
  return (
    <div style={{
      background: '#fff', border: `1px solid ${C.border}`, borderRadius: 18,
      padding: '1.4rem 1.5rem', position: 'relative', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      transition: 'transform 0.18s, box-shadow 0.18s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${accent}20`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}
    >
      {/* accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: '18px 18px 0 0' }} />
      {/* bg circle */}
      <div style={{ position: 'absolute', bottom: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: `${accent}09` }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
        <span style={{ fontSize: '1.4rem' }}>{icon}</span>
        {change !== undefined && (
          <span style={{
            fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.3px',
            color: up ? C.green : C.rose,
            background: up ? '#ECFDF5' : '#FFF1F2',
            padding: '0.2rem 0.55rem', borderRadius: 99,
          }}>
            {up ? '↑' : '↓'} {Math.abs(change)}%
          </span>
        )}
      </div>

      <div style={{
        fontFamily: "'DM Serif Display', serif", fontSize: '1.9rem',
        fontWeight: 400, color: C.ink, lineHeight: 1, marginBottom: '0.3rem',
        letterSpacing: '-0.5px',
      }}>{value}</div>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted }}>{label}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}

// ─── Chart Card ───────────────────────────────────────────────────────────────
function Card({ title, sub, children, h = 300, right }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${C.border}`, borderRadius: 18,
      padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: '1.2rem', fontWeight: 400, color: C.ink, letterSpacing: '-0.3px' }}>{title}</h3>
          {sub && <p style={{ margin: '0.15rem 0 0', fontSize: '0.77rem', color: C.muted }}>{sub}</p>}
        </div>
        {right}
      </div>
      <div style={{ minHeight: h }}>{children}</div>
    </div>
  );
}

// ─── Empty ────────────────────────────────────────────────────────────────────
function Empty({ msg = 'No data for this period' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 180, color: '#ccc', gap: '0.4rem' }}>
      <span style={{ fontSize: '2rem' }}>📭</span>
      <span style={{ fontSize: '0.8rem', color: C.muted }}>{msg}</span>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SH({ title, sub, icon }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontSize: '1.2rem' }}>{icon}</span>
        <h2 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: '1.65rem', fontWeight: 400, color: C.ink, letterSpacing: '-0.5px' }}>{title}</h2>
      </div>
      {sub && <p style={{ margin: '0.3rem 0 0', color: C.muted, fontSize: '0.82rem', paddingLeft: '1.8rem' }}>{sub}</p>}
    </div>
  );
}

// ─── Heatmap Cell ─────────────────────────────────────────────────────────────
function HCell({ value, max, day, hour }) {
  const pct = max > 0 ? value / max : 0;
  const bg = pct === 0 ? '#F5F3EF' : `rgba(26,86,219,${0.1 + pct * 0.9})`;
  const tc = pct > 0.55 ? '#fff' : pct > 0.2 ? '#1e3a7a' : '#bbb';
  return (
    <div title={`${day} ${hour}:00 — ${value}`} style={{
      background: bg, color: tc, borderRadius: 6,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10.5, fontWeight: value > 0 ? 700 : 400,
      border: '1px solid rgba(255,255,255,0.7)',
      transition: 'transform 0.15s',
      cursor: 'default',
    }}
      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
      onMouseLeave={e => e.currentTarget.style.transform = ''}
    >
      {value > 0 ? value : ''}
    </div>
  );
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
function InsightCard({ ins }) {
  const map = {
    positive: { bg: '#F0FDF4', left: C.green,  text: '#14532D' },
    warning:  { bg: '#FFFBEB', left: C.amber,  text: '#78350F' },
    neutral:  { bg: '#EFF6FF', left: C.blue,   text: '#1E3A5F' },
  };
  const s = map[ins.type] || map.neutral;
  return (
    <div style={{
      background: s.bg, borderLeft: `3px solid ${s.left}`,
      borderRadius: 14, padding: '1rem 1.125rem',
      transition: 'transform 0.18s, box-shadow 0.18s',
      border: `1px solid ${s.left}20`,
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.07)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ display: 'flex', gap: '0.65rem' }}>
        <span style={{ fontSize: '1.25rem', lineHeight: 1.2 }}>{ins.icon}</span>
        <div>
          <div style={{ fontWeight: 700, color: s.text, fontSize: '0.85rem', marginBottom: 3 }}>{ins.title}</div>
          <div style={{ color: s.text, opacity: 0.8, fontSize: '0.79rem', lineHeight: 1.55 }}>{ins.body}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',   label: 'Overview',   icon: '◈' },
  { id: 'traffic',    label: 'Traffic',    icon: '⟡' },
  { id: 'conversion', label: 'Conversion', icon: '◎' },
  { id: 'sales',      label: 'Sales',      icon: '◇' },
  { id: 'customers',  label: 'Customers',  icon: '◉' },
  { id: 'products',   label: 'Products',   icon: '▣' },
  { id: 'drilldown',  label: 'Drill Down', icon: '⊕' },
  { id: 'insights',   label: 'Insights',   icon: '✦' },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function Analytics() {
  const router = useRouter();

  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [storeId, setStoreId]     = useState(null);
  const [storeName, setStoreName] = useState('');
  const [hasProducts, setHasProducts] = useState(true);
  const isQueueOnly = !hasProducts;

  // Period / Calendar
  const [period, setPeriod]       = useState('week');
  const [dateFrom, setDateFrom]   = useState(null);
  const [dateTo, setDateTo]       = useState(null);
  const [useCustomRange, setUseCustomRange] = useState(false);

  // Clock
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // ── Data ─────────────────────────────────────────────────────────────────
  const [stats, setStats]           = useState({ totalCustomers: 0, customersServed: 0, totalRevenue: 0, avgServiceTime: 0, peakHour: 'N/A', customerGrowth: 0, revenueGrowth: 0, efficiencyScore: 0, averageRating: 0, totalReviews: 0, ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, totalVisits: 0, visitGrowth: 0 });
  const [weeklyData, setWeekly]     = useState([]);
  const [hourlyData, setHourly]     = useState([]);
  const [peakData, setPeak]         = useState([]);
  const [serviceTimeData, setST]    = useState([]);
  const [topProducts, setTopProd]   = useState([]);
  const [dailyBreakdown, setDB]     = useState([]);
  const [trafficData, setTraffic]   = useState([]);
  const [convData, setConv]         = useState({ conversionRate: 0, conversionGrowth: 0, totalVisits: 0, conversions: 0, funnelData: [] });
  const [salesTrend, setSales]      = useState([]);
  const [demographics, setDemo]     = useState({ newCustomers: 0, returningCustomers: 0, avgSpendPerCustomer: 0, spendDistribution: [], scatterData: [], retentionRate: 0 });
  const [productPerf, setProdPerf]  = useState({ products: [], categories: [], scatterData: [] });
  const [heatmap, setHeatmap]       = useState({ heatmapData: [], days: [], hours: [], maxValue: 1 });
  const [insights, setInsights]     = useState([]);

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: { user }, error: ue } = await supabase.auth.getUser();
        if (ue || !user) { router.push('/auth/signin'); return; }

        const { data: store, error: se } = await supabase
          .from('stores').select('id, store_name, store_type').eq('owner_id', user.id).single();

        if (se || !store) { router.push('/seller/register'); return; }

        const hp = hasProductsFeature(store.store_type || 'retail');
        setHasProducts(hp);
        setStoreId(store.id);
        setStoreName(store.store_name || 'Your Store');
        await fetchAll(store.id, period, !hp);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (storeId) {
      setRefreshing(true);
      fetchAll(storeId, period, isQueueOnly).finally(() => setRefreshing(false));
    }
  }, [period, storeId]);

  const fetchAll = useCallback(async (id, p, qOnly) => {
    try {
      const [wk, hr, pk, st, ov, ex, tr, cv, sl, dm, pp, hm] = await Promise.all([
        getWeeklyAnalytics(id, qOnly),
        getHourlyAnalytics(id, qOnly),
        getPeakHoursAnalytics(id, p, qOnly),
        getServiceTimeDistribution(id, p),
        getOverallStats(id, p, qOnly),
        qOnly ? getDailyServiceBreakdown(id, p) : getTopProducts(id, p, 5),
        getTrafficOverTime(id, p),
        getConversionRate(id, p, qOnly),
        getSalesTrend(id, p),
        getCustomerDemographics(id, p),
        getProductPerformance(id, p),
        getDrillDownHeatmap(id, p, qOnly),
      ]);

      if (wk.data?.length)  setWeekly(wk.data);
      if (hr.data?.length)  setHourly(hr.data);
      if (pk.data?.length)  setPeak(pk.data);
      if (st.data?.length)  setST(st.data);
      if (tr.data?.length)  setTraffic(tr.data);
      if (sl.data?.length)  setSales(sl.data);

      if (ov.data) {
        const s = { ...ov.data, peakHour: pk.peakTime || 'N/A' };
        setStats(s);
        if (cv.data)  setConv(cv.data);
        if (dm.data)  setDemo(dm.data);
        if (pp.data)  setProdPerf(pp.data);
        if (hm.data)  setHeatmap(hm.data);
        setInsights(generateInsights({ stats: s, conversionData: cv.data, demographics: dm.data, productPerf: pp.data }));
      }
      qOnly ? setDB(ex.data || []) : setTopProd(ex.data || []);
    } catch (err) {
      console.error('Analytics load error:', err);
    }
  }, []);

  // ── Period toggle ─────────────────────────────────────────────────────────
  const handlePeriod = (p) => {
    setPeriod(p);
    setUseCustomRange(false);
    setDateFrom(null);
    setDateTo(null);
  };

  const applyCustomRange = () => {
    if (dateFrom || dateTo) {
      setUseCustomRange(true);
      if (storeId) {
        setRefreshing(true);
        fetchAll(storeId, period, isQueueOnly).finally(() => setRefreshing(false));
      }
    }
  };

  // ── Render guard ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: C.paper }}>
        <Sidebar />
        <main style={{ flex: 1, marginLeft: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ width: 48, height: 48, border: `3px solid ${C.cream}`, borderTop: `3px solid ${C.blue}`, borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
          <p style={{ color: C.muted, fontFamily: "'DM Serif Display', serif", fontSize: '1.1rem' }}>Loading analytics…</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar />

      <main className={styles.mainContent}>

        {/* ══ HEADER ══════════════════════════════════════════════════════ */}
        <header style={{
          background: '#fff', borderRadius: 20, border: `1px solid ${C.border}`,
          padding: '1.25rem 1.75rem', marginBottom: '1.25rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: '0.75rem',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <h1 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: '2rem', fontWeight: 400, color: C.ink, letterSpacing: '-1px' }}>Analytics</h1>
              {refreshing && (
                <span style={{ fontSize: '0.75rem', color: C.blue, fontWeight: 600, background: '#EFF6FF', padding: '0.15rem 0.5rem', borderRadius: 99 }}>
                  ⟳ Refreshing…
                </span>
              )}
            </div>
            <p style={{ margin: '0.15rem 0 0', color: C.muted, fontSize: '0.8rem' }}>
              {storeName} · {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{
              fontFamily: 'ui-monospace, monospace', fontSize: '1rem', fontWeight: 700,
              color: C.blue, background: '#EFF6FF', padding: '0.4rem 0.9rem',
              borderRadius: 10, letterSpacing: '0.05em',
            }}>
              {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <button
              onClick={() => { setRefreshing(true); fetchAll(storeId, period, isQueueOnly).finally(() => setRefreshing(false)); }}
              style={{
                padding: '0.5rem 1rem', background: C.paper, border: `1.5px solid ${C.border}`,
                borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
                color: C.ink, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.35rem',
              }}
            >⟳ Refresh</button>
            <button
              onClick={() => alert('Export coming soon!')}
              style={{
                padding: '0.5rem 1.2rem', background: C.ink, border: 'none',
                borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
                color: '#fff', fontFamily: 'inherit',
              }}
            >↓ Export</button>
          </div>
        </header>

        {/* ══ FILTER ROW ═════════════════════════════════════════════════ */}
        <div style={{
          background: '#fff', borderRadius: 16, border: `1px solid ${C.border}`,
          padding: '0.875rem 1.25rem', marginBottom: '1.25rem',
          display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap',
        }}>
          {/* Period presets */}
          <div style={{ display: 'flex', gap: '0.3rem', background: C.paper, padding: '0.3rem', borderRadius: 10 }}>
            {['today', 'week', 'month', 'year'].map(p => (
              <button key={p}
                onClick={() => handlePeriod(p)}
                style={{
                  padding: '0.4rem 0.9rem', border: 'none', borderRadius: 8,
                  fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                  background: period === p && !useCustomRange ? C.ink : 'transparent',
                  color: period === p && !useCustomRange ? '#fff' : C.muted,
                  transition: 'all 0.18s',
                }}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: C.border }} />

          {/* Calendar pickers */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <CalendarPicker value={dateFrom} onChange={setDateFrom} label="From date" />
            <span style={{ color: C.muted, fontSize: '0.8rem' }}>→</span>
            <CalendarPicker value={dateTo} onChange={setDateTo} label="To date" />
            {(dateFrom || dateTo) && (
              <button onClick={applyCustomRange} style={{
                padding: '0.45rem 1rem', background: C.blue, color: '#fff', border: 'none',
                borderRadius: 9, cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit',
              }}>Apply</button>
            )}
          </div>

          {useCustomRange && (
            <span style={{ fontSize: '0.75rem', color: C.blue, fontWeight: 700, background: '#EFF6FF', padding: '0.2rem 0.6rem', borderRadius: 99, marginLeft: 'auto' }}>
              📅 Custom range active
            </span>
          )}
        </div>

        {/* ══ TABS ════════════════════════════════════════════════════════ */}
        <div style={{
          background: '#fff', borderRadius: 14, border: `1px solid ${C.border}`,
          padding: '0.5rem', marginBottom: '1.75rem',
          display: 'flex', gap: '0.2rem', overflowX: 'auto',
        }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.5rem 1rem', border: 'none', borderRadius: 9,
              fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
              fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.18s',
              background: activeTab === t.id ? C.ink : 'transparent',
              color: activeTab === t.id ? '#fff' : C.muted,
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            TAB: OVERVIEW
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div>
            {/* KPI Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <KPI icon="👥" label="Total Customers"  value={stats.totalCustomers.toLocaleString()} change={stats.customerGrowth} accent={C.blue} sub={`vs last ${period}`} />
              <KPI icon="👁️" label="Store Visits"     value={stats.totalVisits.toLocaleString()} change={stats.visitGrowth} accent={C.indigo} />
              <KPI icon="◎"  label="Conversion Rate"  value={`${convData.conversionRate}%`} change={convData.conversionGrowth} accent={C.teal} />
              {hasProducts
                ? <KPI icon="₹" label="Total Revenue" value={`₹${stats.totalRevenue.toLocaleString()}`} change={stats.revenueGrowth} accent={C.green} />
                : <KPI icon="✅" label="Served" value={stats.customersServed.toLocaleString()} accent={C.green}
                    sub={stats.totalCustomers > 0 ? `${Math.round((stats.customersServed / stats.totalCustomers) * 100)}% done` : '—'} />
              }
              <KPI icon="⏱️" label="Avg Service Time" value={`${stats.avgServiceTime}m`} accent={C.amber}
                sub={stats.avgServiceTime <= 10 ? 'Excellent' : stats.avgServiceTime <= 15 ? 'Good' : 'Slow'} />
              <KPI icon="⭐" label="Avg Rating"       value={stats.averageRating > 0 ? `${parseFloat(stats.averageRating).toFixed(1)}/5` : '—'} accent={C.orange} sub={`${stats.totalReviews} reviews`} />
              <KPI icon="🔄" label="Retention"        value={`${demographics.retentionRate}%`} accent={C.purple} sub="Returning buyers" />
            </div>

            {/* Charts row 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <Card title="Weekly Activity" sub={isQueueOnly ? 'Queue entries per day' : 'Orders & revenue per day'}>
                {weeklyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={weeklyData}>
                      <defs>
                        <linearGradient id="gCust" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.blue} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                      <XAxis dataKey="day" stroke="#ccc" fontSize={11} />
                      <YAxis stroke="#ccc" fontSize={11} yAxisId="l" />
                      {!isQueueOnly && <YAxis stroke="#ccc" fontSize={11} yAxisId="r" orientation="right" />}
                      <Tooltip content={<ChartTip />} />
                      <Area yAxisId="l" type="monotone" dataKey="customers" stroke={C.blue} strokeWidth={2} fill="url(#gCust)" name="Customers" />
                      {!isQueueOnly && <Line yAxisId="r" type="monotone" dataKey="revenue" stroke={C.green} strokeWidth={2} dot={false} name="Revenue (₹)" />}
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Card>

              <Card title="Hourly Distribution" sub="Today's customer flow by hour">
                {hourlyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                      <XAxis dataKey="hour" stroke="#ccc" fontSize={11} />
                      <YAxis stroke="#ccc" fontSize={11} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="customers" name="Customers" radius={[5, 5, 0, 0]}>
                        {hourlyData.map((_, i) => <Cell key={i} fill={`hsl(${215 + i * 4}, 75%, ${50 + i * 1.5}%)`} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Card>
            </div>

            {/* Charts row 2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <Card title="Peak Hours" sub="Busiest time slots this period">
                {peakData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={210}>
                      <PieChart>
                        <Pie data={peakData} cx="50%" cy="50%" outerRadius={80} dataKey="count" nameKey="time"
                          label={({ percentage }) => `${percentage}%`} labelLine={false}>
                          {peakData.map((_, i) => <Cell key={i} fill={PIES[i % PIES.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ padding: '0.75rem 1rem', background: C.paper, borderRadius: 10, fontSize: '0.82rem', color: C.muted, borderLeft: `3px solid ${C.blue}` }}>
                      <strong style={{ color: C.ink }}>Peak:</strong> {stats.peakHour}
                    </div>
                  </>
                ) : <Empty />}
              </Card>

              <Card title="Rating Distribution" sub="Customer satisfaction breakdown">
                {stats.totalReviews > 0 ? (
                  <div style={{ paddingTop: '0.25rem' }}>
                    {[5, 4, 3, 2, 1].map(star => {
                      const cnt = stats.ratingDistribution[star] || 0;
                      const pct = stats.totalReviews > 0 ? Math.round((cnt / stats.totalReviews) * 100) : 0;
                      const cols = { 5: C.green, 4: C.teal, 3: C.amber, 2: C.orange, 1: C.rose };
                      return (
                        <div key={star} style={{ display: 'grid', gridTemplateColumns: '38px 1fr 64px', gap: '0.65rem', alignItems: 'center', marginBottom: '0.65rem' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: C.ink }}>{star} ★</span>
                          <div style={{ height: 18, background: C.cream, borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: cols[star], borderRadius: 99, transition: 'width 0.5s ease' }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: C.muted, textAlign: 'right' }}>{cnt} ({pct}%)</span>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: C.paper, borderRadius: 10, fontSize: '0.8rem', borderLeft: `3px solid ${C.amber}` }}>
                      <strong>{stats.averageRating}/5.0</strong> · {stats.totalReviews} reviews
                    </div>
                  </div>
                ) : <Empty msg="No reviews yet" />}
              </Card>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: TRAFFIC
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'traffic' && (
          <div>
            <SH title="Website Traffic" sub="Store page visits and unique visitor patterns" icon="⟡" />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <KPI icon="👁️" label="Total Visits" value={stats.totalVisits.toLocaleString()} change={stats.visitGrowth} accent={C.indigo} />
              <KPI icon="👤" label="Unique Visitors" value={trafficData.reduce((s, d) => s + (d.uniqueVisitors || 0), 0).toLocaleString()} accent={C.blue} sub="Distinct buyers" />
              <KPI icon="🔁" label="Repeat Visits" value={Math.max(0, stats.totalVisits - trafficData.reduce((s, d) => s + (d.uniqueVisitors || 0), 0)).toLocaleString()} accent={C.purple} />
            </div>

            <Card title="Traffic Over Time" sub="Daily visits vs unique visitors" h={320}>
              {trafficData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={trafficData}>
                    <defs>
                      <linearGradient id="gVis" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.indigo} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={C.indigo} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                    <XAxis dataKey="date" stroke="#ccc" fontSize={11} />
                    <YAxis stroke="#ccc" fontSize={11} />
                    <Tooltip content={<ChartTip />} />
                    <Legend />
                    <Area type="monotone" dataKey="visits" stroke={C.indigo} strokeWidth={2.5} fill="url(#gVis)" name="Total Visits" />
                    <Line type="monotone" dataKey="uniqueVisitors" stroke={C.teal} strokeWidth={2} dot={{ r: 3, fill: C.teal }} name="Unique Visitors" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginTop: '1.25rem' }}>
              <Card title="Hourly Traffic" sub="When visitors browse your store">
                {hourlyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={hourlyData}>
                      <defs>
                        <linearGradient id="gHr" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.blue} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                      <XAxis dataKey="hour" stroke="#ccc" fontSize={11} />
                      <YAxis stroke="#ccc" fontSize={11} />
                      <Tooltip content={<ChartTip />} />
                      <Area type="monotone" dataKey="customers" stroke={C.blue} strokeWidth={2} fill="url(#gHr)" name="Visitors" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Card>

              <Card title="Peak Hours Breakdown" sub="Top traffic windows">
                {peakData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={peakData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" horizontal={false} />
                      <XAxis type="number" stroke="#ccc" fontSize={11} />
                      <YAxis type="category" dataKey="time" stroke="#ccc" fontSize={10} width={95} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="count" name="Visits" radius={[0, 5, 5, 0]}>
                        {peakData.map((_, i) => <Cell key={i} fill={PIES[i % PIES.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Card>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: CONVERSION
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'conversion' && (
          <div>
            <SH title="Conversion Rate" sub="How many visitors turn into customers" icon="◎" />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <KPI icon="◎"  label="Conversion Rate" value={`${convData.conversionRate}%`} change={convData.conversionGrowth} accent={C.teal} />
              <KPI icon="👁️" label="Total Visits"    value={convData.totalVisits.toLocaleString()} accent={C.blue} />
              <KPI icon="✅" label="Conversions"     value={convData.conversions.toLocaleString()} accent={C.green} sub={isQueueOnly ? 'Queue joins' : 'Orders'} />
              <KPI icon="🚪" label="Bounce (est.)"   value={`${Math.max(0, 100 - convData.conversionRate)}%`} accent={C.rose} />
            </div>

            {/* Funnel visual */}
            <Card title="Funnel Steps" sub="Visitor journey in numbers" h={120}>
              <div style={{ display: 'flex', gap: 2, height: 120 }}>
                {[
                  { label: 'Store Visits', value: convData.totalVisits, color: C.blue, pct: 100 },
                  { label: 'Conversions', value: convData.conversions, color: C.teal, pct: convData.conversionRate },
                  { label: 'Drop-off', value: convData.totalVisits - convData.conversions, color: C.rose, pct: Math.max(0, 100 - convData.conversionRate) },
                ].map((s, i) => (
                  <div key={i} style={{
                    flex: Math.max(s.pct / 100, 0.05), background: `${s.color}12`,
                    border: `1px solid ${s.color}30`, borderRadius: 12,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '0.75rem', minWidth: 70, transition: 'flex 0.5s ease',
                  }}>
                    <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.4rem', fontWeight: 400, color: s.color }}>{s.value.toLocaleString()}</div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.6px', textAlign: 'center' }}>{s.label}</div>
                    <div style={{ fontSize: '0.78rem', color: s.color, fontWeight: 700 }}>{s.pct}%</div>
                  </div>
                ))}
              </div>
            </Card>

            <div style={{ marginTop: '1.25rem' }}>
              <Card title="Conversion Funnel Over Time" sub="Visits vs conversions with rate" h={320}>
                {convData.funnelData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={convData.funnelData}>
                      <defs>
                        <linearGradient id="gV3" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.blue} stopOpacity={0.2} /><stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gC3" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.teal} stopOpacity={0.3} /><stop offset="95%" stopColor={C.teal} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                      <XAxis dataKey="date" stroke="#ccc" fontSize={11} />
                      <YAxis yAxisId="l" stroke="#ccc" fontSize={11} />
                      <YAxis yAxisId="r" orientation="right" stroke="#ccc" fontSize={11} tickFormatter={v => `${v}%`} />
                      <Tooltip content={<ChartTip />} />
                      <Legend />
                      <Area yAxisId="l" type="monotone" dataKey="visits"      stroke={C.blue}  strokeWidth={2} fill="url(#gV3)" name="Visits" />
                      <Area yAxisId="l" type="monotone" dataKey="conversions" stroke={C.teal}  strokeWidth={2} fill="url(#gC3)" name="Conversions" />
                      <Line  yAxisId="r" type="monotone" dataKey="rate"        stroke={C.amber} strokeWidth={2.5} dot={false} name="Rate %" />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Card>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: SALES
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'sales' && (
          <div>
            <SH title="Sales & Revenue" sub="Revenue trends, order values, and sales patterns" icon="◇" />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <KPI icon="₹"  label="Total Revenue"  value={`₹${stats.totalRevenue.toLocaleString()}`} change={stats.revenueGrowth} accent={C.green} />
              <KPI icon="🛒" label="Total Orders"   value={salesTrend.reduce((s, d) => s + d.orders, 0).toLocaleString()} accent={C.blue} />
              <KPI icon="📊" label="Avg Order Value" value={`₹${(() => { const ords = salesTrend.reduce((s, d) => s + d.orders, 0); const rev = salesTrend.reduce((s, d) => s + d.revenue, 0); return ords > 0 ? Math.round(rev / ords).toLocaleString() : 0; })()}`} accent={C.amber} />
              <KPI icon="📦" label="Items Sold"     value={salesTrend.reduce((s, d) => s + (d.itemsSold || 0), 0).toLocaleString()} accent={C.teal} />
            </div>

            <Card title="Revenue Trend" sub="Daily revenue and order count" h={320}>
              {salesTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={salesTrend}>
                    <defs>
                      <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.green} stopOpacity={0.25} /><stop offset="95%" stopColor={C.green} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                    <XAxis dataKey="date" stroke="#ccc" fontSize={11} />
                    <YAxis yAxisId="l" stroke="#ccc" fontSize={11} />
                    <YAxis yAxisId="r" orientation="right" stroke="#ccc" fontSize={11} />
                    <Tooltip content={<ChartTip pre="₹" />} />
                    <Legend />
                    <Area yAxisId="l" type="monotone" dataKey="revenue" stroke={C.green} strokeWidth={2.5} fill="url(#gRev)" name="Revenue (₹)" />
                    <Bar  yAxisId="r" dataKey="orders" fill={`${C.blue}60`} radius={[4, 4, 0, 0]} name="Orders" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginTop: '1.25rem' }}>
              <Card title="Avg Order Value Trend" sub="Basket size changes over time">
                {salesTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={salesTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                      <XAxis dataKey="date" stroke="#ccc" fontSize={11} />
                      <YAxis stroke="#ccc" fontSize={11} tickFormatter={v => `₹${v}`} />
                      <Tooltip content={<ChartTip pre="₹" />} />
                      <Line type="monotone" dataKey="avgOrderValue" stroke={C.amber} strokeWidth={2.5} dot={{ r: 3, fill: C.amber }} name="Avg Order Value" />
                      <ReferenceLine y={salesTrend.reduce((s, d) => s + d.avgOrderValue, 0) / (salesTrend.length || 1)} stroke={C.amber} strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Card>

              <Card title="Top Products" sub="By revenue this period">
                {topProducts.length > 0 ? (
                  <div style={{ paddingTop: '0.15rem' }}>
                    {topProducts.map((p, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: i < topProducts.length - 1 ? `1px solid ${C.cream}` : 'none' }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: PIES[i % PIES.length], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.78rem', flexShrink: 0 }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ fontSize: '0.72rem', color: C.muted }}>{p.sold} sold</div>
                        </div>
                        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.1rem', color: C.green }}>₹{(p.revenue || 0).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                ) : <Empty msg="No product data" />}
              </Card>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: CUSTOMERS
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'customers' && (
          <div>
            <SH title="Customer Demographics" sub="Who your customers are and how they spend" icon="◉" />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <KPI icon="🆕" label="New Customers"      value={demographics.newCustomers.toLocaleString()} accent={C.blue} />
              <KPI icon="🔄" label="Returning"          value={demographics.returningCustomers.toLocaleString()} accent={C.green} />
              <KPI icon="💎" label="Retention Rate"     value={`${demographics.retentionRate}%`} accent={C.purple} />
              <KPI icon="💳" label="Avg Spend/Customer" value={`₹${demographics.avgSpendPerCustomer.toLocaleString()}`} accent={C.amber} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <Card title="New vs Returning" sub="Customer loyalty breakdown">
                {(demographics.newCustomers + demographics.returningCustomers) > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={210}>
                      <PieChart>
                        <Pie
                          data={[{ name: 'New', value: demographics.newCustomers }, { name: 'Returning', value: demographics.returningCustomers }]}
                          cx="50%" cy="50%" outerRadius={80} innerRadius={45} dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}
                        >
                          <Cell fill={C.blue} /><Cell fill={C.green} />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '0.25rem' }}>
                      {[{ l: 'New', c: C.blue, v: demographics.newCustomers }, { l: 'Returning', c: C.green, v: demographics.returningCustomers }].map(x => (
                        <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700, color: C.muted }}>
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: x.c, display: 'inline-block' }} />
                          {x.l}: {x.v}
                        </div>
                      ))}
                    </div>
                  </>
                ) : <Empty />}
              </Card>

              <Card title="Spend Distribution" sub="How much customers spend per session">
                {demographics.spendDistribution.some(d => d.count > 0) ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={demographics.spendDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                      <XAxis dataKey="range" stroke="#ccc" fontSize={10} />
                      <YAxis stroke="#ccc" fontSize={11} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="count" name="Customers" radius={[5, 5, 0, 0]}>
                        {demographics.spendDistribution.map((_, i) => <Cell key={i} fill={PIES[i % PIES.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Card>
            </div>

            <Card title="Purchase Frequency vs Total Spend" sub="Each dot = one customer. X = orders, Y = total spend" h={300}>
              {demographics.scatterData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                    <XAxis type="number" dataKey="x" name="Orders" stroke="#ccc" fontSize={11} label={{ value: 'Orders', position: 'insideBottom', offset: -3, fontSize: 11, fill: C.muted }} />
                    <YAxis type="number" dataKey="y" name="Spend" stroke="#ccc" fontSize={11} tickFormatter={v => `₹${v}`} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.09)' }}>
                          <div style={{ fontWeight: 700 }}>{d?.x} orders</div>
                          <div style={{ color: C.muted }}>Spend: <strong>₹{d?.y?.toLocaleString()}</strong></div>
                        </div>
                      );
                    }} />
                    <Scatter data={demographics.scatterData} fill={C.purple} fillOpacity={0.65} />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </Card>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: PRODUCTS
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'products' && (
          <div>
            <SH title="Product Performance" sub="Revenue, units sold, and category breakdown" icon="▣" />

            {isQueueOnly ? (
              <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 18, padding: '3rem', textAlign: 'center', color: C.muted }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🏪</div>
                <p style={{ fontWeight: 600 }}>Queue-only stores don't have product data.</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}>See the <strong>Sales</strong> tab for service data.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <KPI icon="📦" label="Products"   value={productPerf.products.length} accent={C.blue} />
                  <KPI icon="🏷️" label="Categories" value={productPerf.categories.length} accent={C.purple} />
                  <KPI icon="👑" label="Top Product" value={(productPerf.products[0]?.name || '—').slice(0, 14)} accent={C.amber}
                    sub={productPerf.products[0] ? `₹${productPerf.products[0].revenue.toLocaleString()}` : ''} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  <Card title="Revenue by Category" sub="Category contribution">
                    {productPerf.categories.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={productPerf.categories} cx="50%" cy="50%" outerRadius={90} dataKey="revenue" nameKey="category"
                            label={({ category, percent }) => `${category.slice(0, 8)} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                            {productPerf.categories.map((_, i) => <Cell key={i} fill={PIES[i % PIES.length]} />)}
                          </Pie>
                          <Tooltip formatter={v => [`₹${v.toLocaleString()}`, 'Revenue']} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <Empty />}
                  </Card>

                  <Card title="Top Products by Units Sold" sub="Best sellers by volume">
                    {productPerf.products.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={productPerf.products.slice(0, 7)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" horizontal={false} />
                          <XAxis type="number" stroke="#ccc" fontSize={11} />
                          <YAxis type="category" dataKey="name" stroke="#ccc" fontSize={10} width={100} tickFormatter={v => v.length > 12 ? v.slice(0, 12) + '…' : v} />
                          <Tooltip content={<ChartTip />} />
                          <Bar dataKey="sold" name="Units Sold" radius={[0, 5, 5, 0]}>
                            {productPerf.products.slice(0, 7).map((_, i) => <Cell key={i} fill={PIES[i % PIES.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <Empty />}
                  </Card>
                </div>

                <Card title="Price vs Volume — Correlation" sub="Does higher price mean fewer sales? Each dot = one product" h={300}>
                  {productPerf.scatterData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                        <XAxis type="number" dataKey="x" name="Avg Price" stroke="#ccc" fontSize={11} tickFormatter={v => `₹${v}`} label={{ value: 'Avg Unit Price (₹)', position: 'insideBottom', offset: -3, fontSize: 11, fill: C.muted }} />
                        <YAxis type="number" dataKey="y" name="Units Sold" stroke="#ccc" fontSize={11} />
                        <ZAxis type="number" dataKey="revenue" range={[40, 400]} />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0]?.payload;
                          return (
                            <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.09)' }}>
                              <div style={{ fontWeight: 700, marginBottom: 3 }}>{d?.name}</div>
                              <div>Price: <strong>₹{d?.x?.toLocaleString()}</strong></div>
                              <div>Sold: <strong>{d?.y} units</strong></div>
                              <div>Revenue: <strong>₹{d?.revenue?.toLocaleString()}</strong></div>
                            </div>
                          );
                        }} />
                        <Scatter data={productPerf.scatterData} fill={C.teal} fillOpacity={0.7} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  ) : <Empty />}
                </Card>
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: DRILL DOWN
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'drilldown' && (
          <div>
            <SH title="Drill Down Analysis" sub="Day × Hour heatmap and segment breakdowns" icon="⊕" />

            <Card title="Activity Heatmap — Day × Hour" sub="Darker = more activity. Find your true peak windows." h={280}>
              {heatmap.heatmapData.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${heatmap.hours.length}, 1fr)`, gap: 3, marginBottom: 4 }}>
                    <div />
                    {heatmap.hours.map(h => (
                      <div key={h} style={{ textAlign: 'center', fontSize: 9.5, color: C.muted, fontWeight: 700 }}>{h}h</div>
                    ))}
                  </div>
                  {heatmap.days.map(day => (
                    <div key={day} style={{ display: 'grid', gridTemplateColumns: `56px repeat(${heatmap.hours.length}, 1fr)`, gap: 3, marginBottom: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', fontSize: 10.5, fontWeight: 700, color: C.muted }}>{day}</div>
                      {heatmap.hours.map(hr => {
                        const cell = heatmap.heatmapData.find(d => d.day === day && d.hour === hr);
                        return <div key={hr} style={{ height: 32 }}><HCell value={cell?.value || 0} max={heatmap.maxValue} day={day} hour={hr} /></div>;
                      })}
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.875rem', fontSize: 10, color: C.muted }}>
                    <span>Less</span>
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => (
                      <div key={v} style={{ width: 16, height: 16, borderRadius: 4, background: `rgba(26,86,219,${0.1 + v * 0.9})` }} />
                    ))}
                    <span>More</span>
                  </div>
                </div>
              ) : <Empty />}
            </Card>

            {!isQueueOnly && productPerf.categories.length > 0 && (
              <div style={{ marginTop: '1.25rem' }}>
                <Card title="Drill Down — By Category" sub="Revenue and volume per category">
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={productPerf.categories}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                      <XAxis dataKey="category" stroke="#ccc" fontSize={11} tickFormatter={v => v.length > 10 ? v.slice(0, 10) + '…' : v} />
                      <YAxis yAxisId="l" stroke="#ccc" fontSize={11} />
                      <YAxis yAxisId="r" orientation="right" stroke="#ccc" fontSize={11} />
                      <Tooltip content={<ChartTip />} />
                      <Legend />
                      <Bar yAxisId="l" dataKey="revenue" name="Revenue (₹)" radius={[5, 5, 0, 0]}>
                        {productPerf.categories.map((_, i) => <Cell key={i} fill={PIES[i % PIES.length]} />)}
                      </Bar>
                      <Line yAxisId="r" type="monotone" dataKey="sold" stroke={C.amber} strokeWidth={2.5} dot={{ r: 4 }} name="Units Sold" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            )}

            {serviceTimeData.length > 0 && (
              <div style={{ marginTop: '1.25rem' }}>
                <Card title="Drill Down — Service Time Distribution" sub="How long customers spend being served">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={serviceTimeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                      <XAxis dataKey="range" stroke="#ccc" fontSize={11} />
                      <YAxis stroke="#ccc" fontSize={11} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="count" name="Customers" radius={[5, 5, 0, 0]}>
                        {serviceTimeData.map((_, i) => <Cell key={i} fill={[C.green, C.teal, C.amber, C.orange, C.rose][i % 5]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            )}

            {demographics.spendDistribution.some(d => d.count > 0) && (
              <div style={{ marginTop: '1.25rem' }}>
                <Card title="Drill Down — Customer Spend Segments" sub="Segment your buyers by purchase value">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={demographics.spendDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
                      <XAxis dataKey="range" stroke="#ccc" fontSize={11} />
                      <YAxis stroke="#ccc" fontSize={11} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="count" name="Customers" radius={[5, 5, 0, 0]}>
                        {demographics.spendDistribution.map((_, i) => <Cell key={i} fill={[C.rose, C.amber, C.green, C.teal, C.blue][i % 5]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: INSIGHTS
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'insights' && (
          <div>
            <SH title="Smart Insights" sub="Auto-generated observations from your data patterns" icon="✦" />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
              {insights.map((ins, i) => <InsightCard key={i} ins={ins} />)}
            </div>

            {/* Snapshot grid */}
            <Card title="Period Snapshot" sub={`Key metrics at a glance — ${period}`} h="auto">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.875rem' }}>
                {[
                  { l: 'Store Visits',     v: stats.totalVisits,           icon: '👁️', c: C.indigo },
                  { l: 'Conversion Rate',  v: `${convData.conversionRate}%`, icon: '◎',  c: C.teal   },
                  { l: 'Revenue',          v: `₹${stats.totalRevenue.toLocaleString()}`, icon: '₹', c: C.green },
                  { l: 'Avg Service Time', v: `${stats.avgServiceTime}m`,   icon: '⏱️', c: C.amber  },
                  { l: 'Rating',           v: stats.averageRating > 0 ? `${stats.averageRating}/5` : 'N/A', icon: '⭐', c: C.orange },
                  { l: 'Retention',        v: `${demographics.retentionRate}%`, icon: '🔄', c: C.purple },
                ].map((m, i) => (
                  <div key={i} style={{
                    background: `${m.c}09`, border: `1px solid ${m.c}25`,
                    borderRadius: 14, padding: '1.1rem',
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                  }}>
                    <span style={{ fontSize: '1.4rem' }}>{m.icon}</span>
                    <div>
                      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.4rem', fontWeight: 400, color: m.c, lineHeight: 1 }}>{m.v}</div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: m.c, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.7px' }}>{m.l}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

      </main>
    </div>
  );
}