import React, { useMemo, useState } from 'react';
import type { RegionalStat } from '../types';
import { matchesPsgcRegion } from '../utils/regionMatch';
import phRegionsData from '../public/ph-regions.json';

// ── Mercator projection ──────────────────────────────────────────────────────
// SimpleMaps-style: coordinates are projected once at module initialisation,
// then SVG path strings are stored as simple strings — no external library needed.

const SVG_W = 480;
const SVG_H = 600;
const PAD = 8;

// Philippines geographic bounding box
const MIN_LON = 116.85;
const MAX_LON = 127.05;
const MIN_LAT = 4.50;
const MAX_LAT = 21.30;

function mercY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

const _yMin = mercY(MIN_LAT);
const _yMax = mercY(MAX_LAT);
const _drawW = SVG_W - PAD * 2;
const _drawH = SVG_H - PAD * 2;

/** Convert geographic [lon, lat] to SVG [x, y]. */
function project(lon: number, lat: number): [number, number] {
  const x = PAD + ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * _drawW;
  const y = PAD + ((_yMax - mercY(lat)) / (_yMax - _yMin)) * _drawH;
  return [x, y];
}

/** Convert one coordinate ring to an SVG path segment string. */
function ringToD(ring: number[][]): string {
  return (
    ring
      .map((c, i) => {
        const [x, y] = project(c[0], c[1]);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ') + ' Z'
  );
}

/** Convert a GeoJSON Polygon or MultiPolygon geometry to a single SVG `d` string. */
function geomToD(geom: { type: string; coordinates: any }): string {
  if (geom.type === 'Polygon') {
    return (geom.coordinates as number[][][]).map(ringToD).join(' ');
  }
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates as number[][][][])
      .flatMap((poly) => poly.map(ringToD))
      .join(' ');
  }
  return '';
}

// ── Heat colour: light-blue → dark-navy (SimpleMaps gradient style) ──────────
function heatColor(value: number, maxValue: number): string {
  const t = maxValue > 0 ? Math.min(value / maxValue, 1) : 0;
  const r = Math.round(219 + (30 - 219) * t);
  const g = Math.round(234 + (58 - 234) * t);
  const b = Math.round(254 + (138 - 254) * t);
  return `rgb(${r},${g},${b})`;
}

// ── Region matching (backend uses PSGC 10-digit codes) ───────────────────────
function matchStat(props: any, stats: RegionalStat[]): RegionalStat | undefined {
  const { psgc, code, aliases = [] } = props;
  return stats.find((s) => {
    const rc = s.regionCode;
    // 1. PSGC exact / prefix match
    if (psgc && matchesPsgcRegion(rc, psgc)) return true;
    // 2. Short-code match (e.g. "NCR", "CAR", "4A")
    if (code && matchesPsgcRegion(rc, code)) return true;
    // 3. Alias list match
    if (aliases.some((a: string) => matchesPsgcRegion(rc, a))) return true;
    return false;
  });
}

function formatPHP(v: number): string {
  if (v >= 1e9) return `₱${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `₱${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `₱${(v / 1e3).toFixed(1)}K`;
  return `₱${v.toFixed(0)}`;
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface PhilippineMapProps {
  stats: RegionalStat[];
  selectedRegionPsgc: string | null;
  onRegionClick: (psgc: string | null) => void;
}

interface TooltipState {
  x: number;
  y: number;
  stat: RegionalStat;
  label: string;
}

// Pre-process the GeoJSON features once at module load (same as SimpleMaps'
// pre-compiled SVG approach — no runtime projection library required).
interface MapFeature {
  psgc: string;
  props: any;
  d: string;
}

const MAP_FEATURES: MapFeature[] = (phRegionsData as any).features.map((f: any) => ({
  psgc: f.properties.psgc as string,
  props: f.properties,
  d: geomToD(f.geometry),
}));

// ── Component ────────────────────────────────────────────────────────────────
const PhilippineMap: React.FC<PhilippineMapProps> = ({ stats, selectedRegionPsgc, onRegionClick }) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredPsgc, setHoveredPsgc] = useState<string | null>(null);

  const maxValue = useMemo(() => Math.max(...stats.map((s) => s.productionValue), 1), [stats]);

  return (
    <div className="relative w-full select-none">
      {/* ── Inline SVG map (SimpleMaps HTML5 style) ───────────────────────── */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto"
        aria-label="Philippine Regions Interactive Map"
      >
        <defs>
          <filter id="rsm-shadow" x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodOpacity="0.18" />
          </filter>
        </defs>

        {MAP_FEATURES.map((f) => {
          const stat = matchStat(f.props, stats);
          const isSelected = selectedRegionPsgc === f.psgc;
          const isHovered = hoveredPsgc === f.psgc;
          const isOtherActive = selectedRegionPsgc !== null && !isSelected;

          let fill: string;
          if (isSelected) {
            fill = '#f59e0b'; // amber — selected region
          } else if (stat) {
            fill = heatColor(stat.productionValue, maxValue);
          } else {
            fill = '#e2e8f0'; // no-data grey
          }

          return (
            <path
              key={f.psgc}
              d={f.d}
              fill={fill}
              stroke="#ffffff"
              strokeWidth={isSelected || isHovered ? 1.5 : 0.7}
              opacity={isOtherActive ? 0.38 : 1}
              filter={isSelected ? 'url(#rsm-shadow)' : undefined}
              style={{
                cursor: stat ? 'pointer' : 'default',
                transition: 'opacity 0.18s ease, fill 0.12s ease',
              }}
              onMouseEnter={(e) => {
                setHoveredPsgc(f.psgc);
                if (stat) {
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    stat,
                    label: f.props.fullName || f.props.name,
                  });
                }
              }}
              onMouseMove={(e) => {
                if (tooltip) setTooltip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
              }}
              onMouseLeave={() => {
                setHoveredPsgc(null);
                setTooltip(null);
              }}
              onClick={() => {
                if (stat) onRegionClick(isSelected ? null : f.psgc);
              }}
            />
          );
        })}
      </svg>

      {/* ── Gradient legend ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-slate-500">No data</span>
        <div
          className="flex-1 h-2 rounded-full"
          style={{ background: 'linear-gradient(to right, #dbeafe, #1e3a8a)' }}
        />
        <span className="text-xs text-slate-500">High output</span>
      </div>

      {/* ── Clear filter button ─────────────────────────────────────────────── */}
      {selectedRegionPsgc && (
        <button
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
          onClick={() => onRegionClick(null)}
        >
          ✕ Clear region filter
        </button>
      )}

      {/* ── Tooltip ────────────────────────────────────────────────────────── */}
      {tooltip && (
        <div
          className="fixed z-50 bg-slate-900 text-white rounded-xl shadow-2xl p-4 w-64 text-sm pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 90 }}
        >
          <p className="font-bold text-base mb-2">{tooltip.label}</p>
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
                  {`${Math.round(
                    (tooltip.stat.verifiedCount / (tooltip.stat.verifiedCount + tooltip.stat.pendingCount)) * 100
                  )}%`}
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
