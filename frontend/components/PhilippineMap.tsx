import React, { useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import type { RegionalStat } from '../types';

const PH_GEO_URL = '/ph-regions.json';

interface TooltipState {
  x: number;
  y: number;
  stat: RegionalStat;
}

interface PhilippineMapProps {
  stats: RegionalStat[];
  selectedRegionPsgc: string | null;
  onRegionClick: (psgc: string | null) => void;
}

// Smooth blue gradient: #dbeafe (light) → #1e3a8a (dark navy)
function getHeatColor(value: number, maxValue: number): string {
  const t = maxValue > 0 ? Math.min(value / maxValue, 1) : 0;
  const r = Math.round(219 + (30 - 219) * t);
  const g = Math.round(234 + (58 - 234) * t);
  const b = Math.round(254 + (138 - 254) * t);
  return `rgb(${r},${g},${b})`;
}

/**
 * Match a GeoJSON feature's properties to a RegionalStat from the backend.
 * The backend stores PSGC 10-digit region codes (e.g. "0100000000").
 * The GeoJSON stores the full PSGC code in `psgc` and short codes / aliases
 * so we do multi-key fuzzy matching.
 */
function matchRegionStat(geoProps: any, stats: RegionalStat[]): RegionalStat | undefined {
  const { psgc, code, aliases = [] } = geoProps;

  return stats.find((s) => {
    const rc = s.regionCode;

    // 1. Exact PSGC match
    if (psgc && rc === psgc) return true;

    // 2. Exact short-code match (e.g. "NCR", "CAR", "4A")
    if (code && rc.toUpperCase() === code.toUpperCase()) return true;

    // 3. Alias match
    if (aliases.some((a: string) => rc.toUpperCase() === a.toUpperCase())) return true;

    // 4. PSGC prefix match: 10-digit codes share first 2 digits per region
    if (psgc && rc.length === 10 && psgc.length === 10 && rc.substring(0, 2) === psgc.substring(0, 2)) return true;

    // 5. Numeric normalization ("01" === "1")
    const codeNum = parseInt(code, 10);
    const rcNum = parseInt(rc, 10);
    if (!isNaN(codeNum) && !isNaN(rcNum) && codeNum === rcNum) return true;

    return false;
  });
}

function formatPHP(value: number): string {
  if (value >= 1_000_000_000) return `₱${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `₱${(value / 1_000).toFixed(1)}K`;
  return `₱${value.toFixed(0)}`;
}

const PhilippineMap: React.FC<PhilippineMapProps> = ({ stats, selectedRegionPsgc, onRegionClick }) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const maxValue = Math.max(...stats.map((s) => s.productionValue), 1);

  return (
    <div className="relative w-full select-none">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [122.0, 12.0], scale: 1900 }}
        width={520}
        height={620}
        style={{ width: '100%', height: 'auto' }}
      >
        <Geographies geography={PH_GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const stat = matchRegionStat(geo.properties, stats);
              const geoCode = geo.properties.psgc as string;
              const isSelected = selectedRegionPsgc !== null && selectedRegionPsgc === geoCode;
              const isOtherSelected = selectedRegionPsgc !== null && !isSelected;

              let fillColor: string;
              if (isSelected) {
                fillColor = '#f59e0b'; // amber – selected
              } else if (stat) {
                fillColor = isOtherSelected
                  ? getHeatColor(stat.productionValue, maxValue) + '' // keep colour but dim below
                  : getHeatColor(stat.productionValue, maxValue);
              } else {
                fillColor = '#e2e8f0'; // no data
              }

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fillColor}
                  stroke="#ffffff"
                  strokeWidth={0.6}
                  opacity={isOtherSelected ? 0.45 : 1}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none', opacity: isOtherSelected ? 0.6 : 0.8, cursor: stat ? 'pointer' : 'default' },
                    pressed: { outline: 'none' }
                  }}
                  onMouseEnter={(e: React.MouseEvent) => {
                    if (stat) setTooltip({ x: e.clientX, y: e.clientY, stat });
                  }}
                  onMouseMove={(e: React.MouseEvent) => {
                    if (tooltip) setTooltip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => {
                    if (stat) onRegionClick(isSelected ? null : geoCode);
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {/* Gradient legend */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-slate-500">No data</span>
        <div className="flex-1 h-2 rounded-full" style={{ background: 'linear-gradient(to right, #dbeafe, #1e3a8a)' }} />
        <span className="text-xs text-slate-500">High output</span>
      </div>

      {/* Clear filter */}
      {selectedRegionPsgc && (
        <button
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
          onClick={() => onRegionClick(null)}
        >
          ✕ Clear region filter
        </button>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-slate-900 text-white rounded-xl shadow-2xl p-4 w-64 text-sm pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 90 }}
        >
          <p className="font-bold text-base mb-2">{tooltip.stat.regionName}</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Production Value</span>
              <span className="font-semibold text-white">{formatPHP(tooltip.stat.productionValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">F.O.B. Value</span>
              <span className="font-semibold text-white">{formatPHP(tooltip.stat.fobValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Top Commodity</span>
              <span className="font-semibold text-amber-400">{tooltip.stat.leadingCommodity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Contractors</span>
              <span className="font-semibold text-white">{tooltip.stat.contractorCount}</span>
            </div>
            {tooltip.stat.verifiedCount + tooltip.stat.pendingCount > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-400">Verified Reports</span>
                <span className="font-semibold text-emerald-400">
                  {tooltip.stat.verifiedCount + tooltip.stat.pendingCount > 0
                    ? `${Math.round((tooltip.stat.verifiedCount / (tooltip.stat.verifiedCount + tooltip.stat.pendingCount)) * 100)}%`
                    : 'N/A'}
                </span>
              </div>
            )}
          </div>
          {tooltip.stat.topContractors.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-700">
              <p className="text-slate-400 text-xs mb-1">Active Contractors</p>
              {tooltip.stat.topContractors.map((c) => (
                <p key={c.id} className="text-xs text-slate-300 truncate">• {c.name}</p>
              ))}
            </div>
          )}
          <div className="mt-2 pt-2 border-t border-slate-700 flex gap-3 text-xs">
            <span className="text-emerald-400">✓ {tooltip.stat.verifiedCount} Verified</span>
            <span className="text-amber-400">⏳ {tooltip.stat.pendingCount} Pending</span>
          </div>
          <p className="text-slate-500 text-xs mt-2 italic">Click to filter dashboard</p>
        </div>
      )}
    </div>
  );
};

export default PhilippineMap;
