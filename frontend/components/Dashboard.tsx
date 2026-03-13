import React, { useMemo, useState } from 'react';
import type { Contractor, DashboardSummary, RegionalStat } from '../types';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Area
} from 'recharts';
import {
  Users,
  FileCheck2,
  TrendingUp,
  Globe2,
  DollarSign,
  AlertTriangle,
  BarChart3,
  TrendingDown,
  Layers,
  Activity,
  MapPin,
  X
} from 'lucide-react';
import PhilippineMap from './PhilippineMap';

interface DashboardProps {
  contractors: Contractor[];
  summary: DashboardSummary | null;
  onNavigate?: (tab: string) => void;
}

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

// Placeholder multiplier for excise-tax target until a real annual target is stored in DB
const TAX_TARGET_MULTIPLIER = 1.5;

// Static LME mock prices (in USD/troy oz for gold, USD/t for others)
const LME_PRICES = [
  { name: 'Gold', symbol: 'Au', price: 2342.50, unit: 'USD/troy oz', change: +1.2 },
  { name: 'Nickel', symbol: 'Ni', price: 17850, unit: 'USD/t', change: -0.8 },
  { name: 'Copper', symbol: 'Cu', price: 9215, unit: 'USD/t', change: +0.3 },
  { name: 'Silver', symbol: 'Ag', price: 29.40, unit: 'USD/troy oz', change: +2.1 },
  { name: 'Chromite', symbol: 'Cr', price: 310, unit: 'USD/t', change: -0.4 }
];

function formatPHP(value: number): string {
  if (value >= 1_000_000_000) return `₱${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `₱${(value / 1_000).toFixed(1)}K`;
  return `₱${value.toFixed(0)}`;
}

function formatQty(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M DMT`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K DMT`;
  return `${value.toFixed(0)} DMT`;
}

function getMineralTypeBucket(c: Contractor): 'Metallic' | 'Non-Metallic' | 'Both' {
  const types = new Set(c.contractorCommodities.map((cc) => cc.commodity.mineralType));
  if (types.has('METALLIC') && types.has('NON_METALLIC')) return 'Both';
  if (types.has('METALLIC')) return 'Metallic';
  return 'Non-Metallic';
}

// Custom tooltip for dual-axis trend chart
const TrendTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-bold text-slate-800 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {formatQty(p.value)}
        </p>
      ))}
      {payload.length === 2 && (
        <p className="text-slate-500 text-xs mt-1 border-t pt-1">
          Stockpile delta: {formatQty(Math.max(0, (payload[0]?.value ?? 0) - (payload[1]?.value ?? 0)))}
        </p>
      )}
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ contractors, summary, onNavigate }) => {
  // ── Map drill-down state ────────────────────────────────────────────────────
  const [selectedRegionPsgc, setSelectedRegionPsgc] = useState<string | null>(null);

  // When a PSGC code is selected, find the matching RegionalStat
  const selectedStat: RegionalStat | null = useMemo(() => {
    if (!selectedRegionPsgc || !summary?.regionalStats) return null;
    return (
      summary.regionalStats.find((s) => {
        const rc = s.regionCode;
        if (rc === selectedRegionPsgc) return true;
        if (rc.length === 10 && selectedRegionPsgc.length === 10 && rc.substring(0, 2) === selectedRegionPsgc.substring(0, 2)) return true;
        return false;
      }) ?? null
    );
  }, [selectedRegionPsgc, summary?.regionalStats]);

  // Filter contractors by selected region (for donut chart, etc.)
  const filteredContractors = useMemo(() => {
    if (!selectedRegionPsgc) return contractors;
    return contractors.filter((c) => {
      const rc = c.regionCode;
      if (rc === selectedRegionPsgc) return true;
      if (rc.length === 10 && selectedRegionPsgc.length === 10 && rc.substring(0, 2) === selectedRegionPsgc.substring(0, 2)) return true;
      return false;
    });
  }, [selectedRegionPsgc, contractors]);

  const regions = Array.from(new Set(contractors.map((c) => c.regionName)));

  const mineralData = [
    { name: 'Metallic', value: filteredContractors.filter((c) => getMineralTypeBucket(c) === 'Metallic').length },
    { name: 'Non-Metallic', value: filteredContractors.filter((c) => getMineralTypeBucket(c) === 'Non-Metallic').length },
    { name: 'Both', value: filteredContractors.filter((c) => getMineralTypeBucket(c) === 'Both').length }
  ].filter((d) => d.value > 0);

  // Detect stockpile rising: if production significantly exceeds sales in last 3 months
  const recentTrend = summary?.monthlyTrend?.slice(-3) ?? [];
  const isRisingStockpile = recentTrend.length === 3 &&
    recentTrend.every((m) => m.productionQty > m.salesQty * 1.3);

  // Report readiness segments (global)
  const byStatus = summary?.submissions?.byStatus ?? {};
  const readinessData = [
    { name: 'Verified', value: byStatus['VERIFIED'] ?? 0, color: '#10b981' },
    { name: 'Pending', value: byStatus['SUBMITTED'] ?? 0, color: '#f59e0b' },
    { name: 'Draft / Missing', value: (byStatus['DRAFT'] ?? 0) + (byStatus['REJECTED'] ?? 0), color: '#ef4444' }
  ].filter((d) => d.value > 0);

  // Top 5 regions by production value
  const topRegions = [...(summary?.regionalStats ?? [])]
    .sort((a, b) => b.productionValue - a.productionValue)
    .slice(0, 5);

  const maxRegionVal = topRegions[0]?.productionValue || 1;

  // KPI values – use region-specific numbers when a region is selected
  const displayFobValue = selectedStat ? selectedStat.fobValue : (summary?.totalFobValue ?? 0);
  const displayExciseTax = selectedStat ? selectedStat.exciseTax : (summary?.estimatedExciseTax ?? 0);
  const displayContractorCount = selectedStat ? selectedStat.contractorCount : (summary?.contractors.total ?? contractors.length);

  return (
    <div className="space-y-6">
      {/* ── Region filter banner ─────────────────────────────────────────────── */}
      {selectedStat && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin size={16} className="text-blue-600" />
            <span className="text-sm font-semibold text-blue-800">
              Filtered by: {selectedStat.regionName}
            </span>
            <span className="text-xs text-blue-500">
              · {selectedStat.leadingCommodity} · {selectedStat.contractorCount} contractors
            </span>
          </div>
          <button
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-900 font-medium"
            onClick={() => setSelectedRegionPsgc(null)}
          >
            <X size={14} /> Clear filter
          </button>
        </div>
      )}

      {/* ── Row 1: Smart Fiscal KPI Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Enrolled Contractors */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl bg-blue-500 text-white"><Users size={22} /></div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {selectedStat ? 'Region' : 'Live'}
            </span>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">
            {selectedStat ? `Contractors — ${selectedStat.regionName}` : 'Enrolled Contractors'}
          </h3>
          <p className="text-3xl font-bold text-slate-900 mt-1">
            {displayContractorCount}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {summary?.contractors.verified ?? 0} verified · {summary?.contractors.pending ?? 0} pending
          </p>
        </div>

        {/* Total F.O.B. Value */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl bg-emerald-500 text-white"><DollarSign size={22} /></div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
              {selectedStat ? 'Region' : 'Real-Time'}
            </span>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">
            {selectedStat ? `F.O.B. — ${selectedStat.regionName}` : `Total F.O.B. Value (${summary?.year ?? new Date().getFullYear()})`}
          </h3>
          <p className="text-3xl font-bold text-slate-900 mt-1">
            {formatPHP(displayFobValue)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {selectedStat ? `Top: ${selectedStat.leadingCommodity}` : 'Market value of reported sales'}
          </p>
        </div>

        {/* Excise Tax Revenue */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl bg-amber-500 text-white"><TrendingUp size={22} /></div>
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
              {selectedStat ? 'Region' : 'YTD'}
            </span>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">
            {selectedStat ? `Excise Tax — ${selectedStat.regionName}` : 'Excise Tax Revenue'}
          </h3>
          <p className="text-3xl font-bold text-slate-900 mt-1">
            {formatPHP(displayExciseTax)}
          </p>
          {/* Progress bar: placeholder target = collected × 1.5 until a DB target field is available */}
          {displayExciseTax > 0 && (() => {
            const target = (selectedStat ? selectedStat.exciseTax : (summary?.estimatedExciseTax ?? 0)) * TAX_TARGET_MULTIPLIER;
            const pct = Math.min(Math.round((displayExciseTax / target) * 100), 100);
            return (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>vs. Target</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full">
                  <div className="h-1.5 bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })()}
        </div>

        {/* Late Submissions Alert */}
        <div
          className={`p-6 rounded-2xl shadow-sm border cursor-pointer transition-colors ${
            (summary?.lateFilingCount ?? 0) > 0
              ? 'bg-red-50 border-red-200 hover:bg-red-100'
              : 'bg-white border-slate-200'
          }`}
          onClick={() => onNavigate?.('Contractors')}
          title="Click to view contractors"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-xl text-white ${(summary?.lateFilingCount ?? 0) > 0 ? 'bg-red-500' : 'bg-slate-400'}`}>
              <AlertTriangle size={22} />
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider ${(summary?.lateFilingCount ?? 0) > 0 ? 'text-red-500' : 'text-slate-400'}`}>
              {(summary?.lateFilingCount ?? 0) > 0 ? 'Action Needed' : 'All Clear'}
            </span>
          </div>
          <h3 className="text-slate-500 text-sm font-medium">Late Submissions ({'>'} 30 days overdue)</h3>
          <p className={`text-3xl font-bold mt-1 ${(summary?.lateFilingCount ?? 0) > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {summary?.lateFilingCount ?? 0}
          </p>
          <p className="text-xs text-slate-400 mt-1">Click to view delinquent contractors</p>
        </div>
      </div>

      {/* ── Row 2: Regional Command Center ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Philippine Regional Heatmap */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Philippine Interactive Map</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Hover for details · Click a region to filter the dashboard
              </p>
            </div>
            <Globe2 size={20} className="text-slate-400" />
          </div>
          <PhilippineMap
            stats={summary?.regionalStats ?? []}
            selectedRegionPsgc={selectedRegionPsgc}
            onRegionClick={setSelectedRegionPsgc}
          />
        </div>

        {/* Top 5 Regional Rankings */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">
              {selectedStat ? 'Selected Region' : 'Top Producers'}
            </h3>
            <BarChart3 size={18} className="text-slate-400" />
          </div>
          <p className="text-xs text-slate-500 mb-4">
            {selectedStat ? selectedStat.regionName : 'Ranked by production value'}
          </p>

          {/* When a region is selected, show its details */}
          {selectedStat ? (
            <div className="space-y-3">
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-xs text-blue-600 font-semibold mb-2">Production Value</p>
                <p className="text-2xl font-bold text-blue-900">{formatPHP(selectedStat.productionValue)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Top Commodity</p>
                  <p className="text-sm font-bold text-amber-600 truncate">{selectedStat.leadingCommodity}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Contractors</p>
                  <p className="text-sm font-bold text-slate-800">{selectedStat.contractorCount}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3">
                  <p className="text-xs text-emerald-600">Verified</p>
                  <p className="text-sm font-bold text-emerald-800">{selectedStat.verifiedCount}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-xs text-amber-600">Pending</p>
                  <p className="text-sm font-bold text-amber-800">{selectedStat.pendingCount}</p>
                </div>
              </div>
              {selectedStat.topContractors.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-slate-500 mb-2 font-semibold">Top Contractors</p>
                  {selectedStat.topContractors.map((c, i) => (
                    <p key={c.id} className="text-xs text-slate-700 py-1 border-b border-slate-100 last:border-0">
                      <span className="font-semibold text-slate-500">{i + 1}.</span> {c.name}
                    </p>
                  ))}
                </div>
              )}
              <button
                className="w-full mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium text-center py-1"
                onClick={() => setSelectedRegionPsgc(null)}
              >
                ← Back to all regions
              </button>
            </div>
          ) : topRegions.length > 0 ? (
            <div className="space-y-3">
              {topRegions.map((r, idx) => (
                <div
                  key={r.regionCode}
                  className="cursor-pointer group"
                  title={`Click to filter by ${r.regionName}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold ${idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-500' : idx === 2 ? 'bg-amber-700' : 'bg-slate-300'}`}>
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium text-slate-700 truncate max-w-[110px] group-hover:text-blue-600">
                        {r.regionName.length > 15 ? r.regionCode : r.regionName}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-slate-700">{formatPHP(r.productionValue)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${(r.productionValue / maxRegionVal) * 100}%`,
                        backgroundColor: COLORS[idx % COLORS.length]
                      }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{r.leadingCommodity}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">No data available</p>
          )}
        </div>
      </div>

      {/* ── Stockpile Alert ─────────────────────────────────────────────────── */}
      {isRisingStockpile && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500 text-white"><Layers size={18} /></div>
          <div>
            <p className="font-semibold text-orange-800">⚠ Rising Stockpile Alert</p>
            <p className="text-sm text-orange-600">
              Production has significantly exceeded sales for the last 3 months. MGB mineral economists should review inventory build-up.
            </p>
          </div>
        </div>
      )}

      {/* ── Row 3: Production vs Sales Trend + Commodity Donut ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Production vs Sales Monthly Trend */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-slate-800">Production vs. Sales Trend</h3>
            <Activity size={18} className="text-slate-400" />
          </div>
          <p className="text-xs text-slate-500 mb-4">Monthly DMT — {summary?.year ?? new Date().getFullYear()}</p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={summary?.monthlyTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="monthName" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                <Tooltip content={<TrendTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="productionQty"
                  name="Production (DMT)"
                  fill="#dbeafe"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="salesQty"
                  name="Sales/Exports (DMT)"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                  strokeDasharray="5 5"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Commodity Distribution Donut */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-1">Commodity Distribution</h3>
          <p className="text-xs text-slate-500 mb-4">By contractor mineral type</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={mineralData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={6}
                  dataKey="value"
                >
                  {mineralData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Report Readiness mini-donut */}
          {readinessData.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-600 mb-2">Report Readiness</p>
              <div className="flex gap-2 flex-wrap">
                {readinessData.map((d) => (
                  <span
                    key={d.name}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
                    style={{ backgroundColor: d.color + '20', color: d.color }}
                  >
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.color }} />
                    {d.name}: {d.value}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: LME Price Watch + Production by Commodity ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LME Commodity Price Watch */}
        <div className="bg-slate-900 text-white p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold">LME Price Watch</h3>
              <p className="text-slate-400 text-xs mt-0.5">London Metal Exchange · Indicative</p>
            </div>
            <TrendingUp size={18} className="text-slate-400" />
          </div>
          <div className="space-y-3">
            {LME_PRICES.map((p) => (
              <div key={p.name} className="flex items-center justify-between py-1 border-b border-slate-800 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-md bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                    {p.symbol}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.unit}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{p.price.toLocaleString()}</p>
                  <p className={`text-xs font-medium ${p.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {p.change >= 0 ? '▲' : '▼'} {Math.abs(p.change)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-slate-600 text-xs mt-3">* Sample prices for reference. Integrate a live LME data feed for live deployment.</p>
        </div>

        {/* Top Commodities by Production Value */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-bold text-slate-800">Top Commodities by Value</h3>
            <FileCheck2 size={18} className="text-slate-400" />
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Ranked by production value · {summary?.year ?? new Date().getFullYear()}
          </p>
          {(summary?.productionByCommodity?.length ?? 0) > 0 ? (
            <div className="space-y-3">
              {summary!.productionByCommodity.slice(0, 6).map((c, idx) => {
                const maxCVal = summary!.productionByCommodity[0]?.value || 1;
                return (
                  <div key={c.commodityName}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700 font-medium">{c.commodityName}</span>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{formatQty(c.quantity)}</span>
                        <span className="font-semibold text-slate-700">{formatPHP(c.value)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${(c.value / maxCVal) * 100}%`,
                          backgroundColor: COLORS[idx % COLORS.length]
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">No production data for {summary?.year ?? new Date().getFullYear()}</p>
          )}

          {/* Summary stats row */}
          <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-400">Total Reports</p>
              <p className="text-xl font-bold text-slate-800">{summary?.submissions.total ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">{selectedStat ? 'Filtered Region' : 'Regions Active'}</p>
              <p className="text-xl font-bold text-slate-800">{selectedStat ? 1 : regions.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Verified</p>
              <p className="text-xl font-bold text-emerald-600">
                {selectedStat ? selectedStat.verifiedCount : (byStatus['VERIFIED'] ?? 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Banner ───────────────────────────────────────────────────────────── */}
      <div className="bg-indigo-900 text-white p-8 rounded-3xl relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-2xl font-bold mb-2">eSRS Statistical Command Center</h2>
          <p className="text-indigo-200 max-w-xl text-sm">
            Real-time mineral production, sales, excise tax, and contractor compliance data — powered by the MGB e-Statistical Reporting System.
          </p>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Globe2 size={200} />
        </div>
        <div className="absolute bottom-4 right-8 opacity-20">
          <TrendingDown size={80} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
