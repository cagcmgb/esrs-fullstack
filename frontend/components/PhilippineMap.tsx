/**
 * PhilippineMap – SimpleMaps-style interactive HTML5 SVG map
 *
 * Renders the 82 Philippine provinces (accurate coastal shapes from amcharts4-geodata)
 * coloured by their parent region's production value heat gradient.  Province borders
 * act as the thin "separator lines" between regions — identical to the SimpleMaps
 * ready-to-use HTML5 embed.
 *
 * Interactive features (matching SimpleMaps interactive edition):
 *   • Mouse-wheel / trackpad zoom
 *   • Click-and-drag pan
 *   • Pinch-to-zoom + two-finger swipe-pan on mobile/tablet
 *   • Tap a region to filter the dashboard
 *   • Zoom-in / zoom-out / reset buttons
 *   • Hover tooltip with production stats
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { RegionalStat } from '../types';
import { matchesPsgcRegion } from '../utils/regionMatch';
import phProvincesData from '../public/ph-provinces.json';

// ── Mercator projection ──────────────────────────────────────────────────────

const SVG_W = 500;
const SVG_H = 640;
const PAD = 6;

// Philippines geographic bounding box (longitude / latitude)
const MIN_LON = 116.85;
const MAX_LON = 127.10;
const MIN_LAT = 4.50;
const MAX_LAT = 21.35;

function mercY(lat: number): number {
  const r = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + r / 2));
}

const _yMin = mercY(MIN_LAT);
const _yMax = mercY(MAX_LAT);
const _dw = SVG_W - PAD * 2;
const _dh = SVG_H - PAD * 2;

function project(lon: number, lat: number): [number, number] {
  const x = PAD + ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * _dw;
  const y = PAD + ((_yMax - mercY(lat)) / (_yMax - _yMin)) * _dh;
  return [x, y];
}

function ringToD(ring: number[][]): string {
  return (
    ring.map((c, i) => {
      const [x, y] = project(c[0], c[1]);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join('') + 'Z'
  );
}

function geomToD(geom: { type: string; coordinates: any }): string {
  if (geom.type === 'Polygon') {
    return (geom.coordinates as number[][][]).map(ringToD).join('');
  }
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates as number[][][][])
      .flatMap((poly) => poly.map(ringToD))
      .join('');
  }
  return '';
}

// ── Heat colour: light-blue → dark-navy ──────────────────────────────────────
function heatColor(value: number, maxValue: number): string {
  const t = maxValue > 0 ? Math.min(value / maxValue, 1) : 0;
  const r = Math.round(219 + (30 - 219) * t);
  const g = Math.round(234 + (58 - 234) * t);
  const b = Math.round(254 + (138 - 254) * t);
  return `rgb(${r},${g},${b})`;
}

function formatPHP(v: number): string {
  if (v >= 1e9) return `₱${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `₱${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `₱${(v / 1e3).toFixed(1)}K`;
  return `₱${v.toFixed(0)}`;
}

// ── Pre-compile SVG path strings once at module load ─────────────────────────
interface ProvinceFeature {
  id: string;
  provinceName: string;
  psgc: string;            // 10-digit region PSGC
  regionName: string;
  regionFullName: string;
  d: string;
}

const PROVINCE_FEATURES: ProvinceFeature[] = (phProvincesData as any).features.map((f: any) => ({
  id: f.id as string,
  provinceName: f.properties.name as string,
  psgc: f.properties.psgc as string,
  regionName: f.properties.regionName as string,
  regionFullName: f.properties.regionFullName as string,
  d: geomToD(f.geometry),
}));

// ── Zoom / pan constants ──────────────────────────────────────────────────────
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.35;

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

const INITIAL_TRANSFORM: Transform = { scale: 1, tx: 0, ty: 0 };

function clampTransform(t: Transform): Transform {
  const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale));
  // Keep the map centred when zoomed out; allow panning only when zoomed in
  const maxTx = ((s - 1) * SVG_W) / 2;
  const maxTy = ((s - 1) * SVG_H) / 2;
  return {
    scale: s,
    tx: Math.max(-maxTx, Math.min(maxTx, t.tx)),
    ty: Math.max(-maxTy, Math.min(maxTy, t.ty)),
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PhilippineMapProps {
  stats: RegionalStat[];
  selectedRegionPsgc: string | null;
  onRegionClick: (psgc: string | null) => void;
}

interface TooltipState {
  x: number;
  y: number;
  stat: RegionalStat;
  regionLabel: string;
  provinceName: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
const PhilippineMap: React.FC<PhilippineMapProps> = ({ stats, selectedRegionPsgc, onRegionClick }) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredPsgc, setHoveredPsgc] = useState<string | null>(null);
  const [transform, setTransform] = useState<Transform>(INITIAL_TRANSFORM);

  // Drag state (ref to avoid stale closures)
  const drag = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);
  // Pinch state
  const pinch = useRef<{ dist: number; scale: number; tx: number; ty: number } | null>(null);
  // "Did we drag?" – used to suppress click after a drag
  const didDrag = useRef(false);

  const maxValue = useMemo(() => Math.max(...stats.map((s) => s.productionValue), 1), [stats]);

  // Build a PSGC → RegionalStat lookup for O(1) access
  const statByPsgc = useMemo(() => {
    const map = new Map<string, RegionalStat>();
    for (const s of stats) {
      // Index by exact regionCode
      map.set(s.regionCode, s);
    }
    return map;
  }, [stats]);

  // Resolve RegionalStat for a province feature
  const getStat = useCallback(
    (pf: ProvinceFeature): RegionalStat | undefined => {
      // Fast exact lookup first
      const fast = statByPsgc.get(pf.psgc);
      if (fast) return fast;
      // Fallback: iterate with matchesPsgcRegion
      return stats.find((s) => matchesPsgcRegion(s.regionCode, pf.psgc));
    },
    [statByPsgc, stats],
  );

  // ── Zoom / pan helpers ──────────────────────────────────────────────────────
  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setTransform((prev) => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
      const ratio = newScale / prev.scale;
      // Zoom towards pointer: adjust translation so cx/cy stays fixed
      const tx = cx - ratio * (cx - prev.tx);
      const ty = cy - ratio * (cy - prev.ty);
      return clampTransform({ scale: newScale, tx, ty });
    });
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const cx = ((e.clientX - rect.left) / rect.width) * SVG_W;
      const cy = ((e.clientY - rect.top) / rect.height) * SVG_H;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomAt(factor, cx, cy);
    },
    [zoomAt],
  );

  // ── Mouse drag pan ──────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    didDrag.current = false;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTx: 0,
      startTy: 0,
    };
    // Capture current transform
    setTransform((prev) => {
      if (drag.current) {
        drag.current.startTx = prev.tx;
        drag.current.startTy = prev.ty;
      }
      return prev;
    });
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
    setTransform((prev) =>
      clampTransform({ scale: prev.scale, tx: drag.current!.startTx + dx, ty: drag.current!.startTy + dy }),
    );
    // Hide tooltip while panning
    setTooltip(null);
  }, []);

  const onMouseUp = useCallback(() => {
    drag.current = null;
  }, []);

  // ── Touch events ────────────────────────────────────────────────────────────
  function getTouchDist(t: React.TouchList): number {
    if (t.length < 2) return 0;
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }

  const onTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      didDrag.current = false;
      drag.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, startTx: 0, startTy: 0 };
      setTransform((prev) => {
        if (drag.current) {
          drag.current.startTx = prev.tx;
          drag.current.startTy = prev.ty;
        }
        return prev;
      });
    } else if (e.touches.length === 2) {
      drag.current = null;
      setTransform((prev) => {
        pinch.current = { dist: getTouchDist(e.touches), scale: prev.scale, tx: prev.tx, ty: prev.ty };
        return prev;
      });
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (e.touches.length === 1 && drag.current) {
      const dx = e.touches[0].clientX - drag.current.startX;
      const dy = e.touches[0].clientY - drag.current.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDrag.current = true;
      setTransform((prev) =>
        clampTransform({ scale: prev.scale, tx: drag.current!.startTx + dx, ty: drag.current!.startTy + dy }),
      );
      setTooltip(null);
    } else if (e.touches.length === 2 && pinch.current) {
      const newDist = getTouchDist(e.touches);
      const factor = newDist / pinch.current.dist;
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinch.current.scale * factor));
      const ratio = newScale / pinch.current.scale;
      setTransform(clampTransform({
        scale: newScale,
        tx: cx - ratio * (cx - pinch.current.tx),
        ty: cy - ratio * (cy - pinch.current.ty),
      }));
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    drag.current = null;
    pinch.current = null;
  }, []);

  // ── SVG transform string ────────────────────────────────────────────────────
  const svgTransform = `translate(${transform.tx.toFixed(1)},${transform.ty.toFixed(1)}) scale(${transform.scale.toFixed(4)})`;
  const strokeWidth = Math.max(0.15, 0.6 / transform.scale);   // thin borders even when zoomed in

  return (
    <div className="relative w-full select-none">
      {/* ── Zoom controls (SimpleMaps style) ─────────────────────────────── */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button
          aria-label="Zoom in"
          className="w-7 h-7 bg-white border border-slate-200 rounded shadow-sm text-slate-600 hover:bg-slate-50 flex items-center justify-center text-base font-bold leading-none"
          onClick={() => setTransform((p) => clampTransform({ scale: p.scale * ZOOM_STEP, tx: p.tx, ty: p.ty }))}
        >+</button>
        <button
          aria-label="Zoom out"
          className="w-7 h-7 bg-white border border-slate-200 rounded shadow-sm text-slate-600 hover:bg-slate-50 flex items-center justify-center text-base font-bold leading-none"
          onClick={() => setTransform((p) => clampTransform({ scale: p.scale / ZOOM_STEP, tx: p.tx, ty: p.ty }))}
        >−</button>
        <button
          aria-label="Reset zoom"
          className="w-7 h-7 bg-white border border-slate-200 rounded shadow-sm text-slate-500 hover:bg-slate-50 flex items-center justify-center text-xs font-semibold"
          onClick={() => setTransform(INITIAL_TRANSFORM)}
          title="Reset"
        >⌂</button>
      </div>

      {/* ── SVG map ──────────────────────────────────────────────────────── */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto touch-none"
        aria-label="Philippine Regions Interactive Map"
        style={{ cursor: drag.current ? 'grabbing' : 'grab', display: 'block' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <defs>
          <filter id="ph-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#f59e0b" floodOpacity="0.55" />
          </filter>
        </defs>

        {/* Sea background */}
        <rect width={SVG_W} height={SVG_H} fill="#e8f4fd" />

        <g transform={svgTransform}>
          {PROVINCE_FEATURES.map((pf) => {
            const stat = getStat(pf);
            const isRegionSelected = selectedRegionPsgc !== null && matchesPsgcRegion(selectedRegionPsgc, pf.psgc);
            const isOtherActive = selectedRegionPsgc !== null && !isRegionSelected;
            const isHovered = hoveredPsgc === pf.psgc;

            let fill: string;
            if (isRegionSelected) {
              fill = '#f59e0b';      // amber – selected region
            } else if (stat) {
              fill = heatColor(stat.productionValue, maxValue);
            } else {
              fill = '#cbd5e1';      // no-data slate
            }

            return (
              <path
                key={pf.id}
                d={pf.d}
                fill={fill}
                stroke="#ffffff"
                strokeWidth={isHovered || isRegionSelected ? strokeWidth * 2.5 : strokeWidth}
                strokeLinejoin="round"
                opacity={isOtherActive ? 0.35 : 1}
                filter={isRegionSelected ? 'url(#ph-glow)' : undefined}
                style={{
                  cursor: stat ? 'pointer' : 'default',
                  transition: 'opacity 0.15s, fill 0.1s',
                  paintOrder: 'stroke fill',
                }}
                onMouseEnter={(e) => {
                  if (drag.current) return;
                  setHoveredPsgc(pf.psgc);
                  if (stat) {
                    setTooltip({ x: e.clientX, y: e.clientY, stat, regionLabel: pf.regionFullName, provinceName: pf.provinceName });
                  }
                }}
                onMouseMove={(e) => {
                  if (tooltip && !drag.current) {
                    setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                  }
                }}
                onMouseLeave={() => {
                  setHoveredPsgc(null);
                  setTooltip(null);
                }}
                onClick={() => {
                  if (didDrag.current) return;
                  if (stat) onRegionClick(isRegionSelected ? null : pf.psgc);
                }}
              />
            );
          })}
        </g>
      </svg>

      {/* ── Zoom hint ─────────────────────────────────────────────────────── */}
      <p className="text-xs text-slate-400 text-center mt-0.5 mb-1">
        Scroll to zoom · Drag to pan · Tap region to filter
      </p>

      {/* ── Gradient legend ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Low</span>
        <div
          className="flex-1 h-2 rounded-full"
          style={{ background: 'linear-gradient(to right, #dbeafe, #1e3a8a)' }}
        />
        <span className="text-xs text-slate-500">High output</span>
      </div>

      {/* ── Clear filter ──────────────────────────────────────────────────── */}
      {selectedRegionPsgc && (
        <button
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
          onClick={() => onRegionClick(null)}
        >
          ✕ Clear region filter
        </button>
      )}

      {/* ── Tooltip ───────────────────────────────────────────────────────── */}
      {tooltip && (
        <div
          className="fixed z-50 bg-slate-900 text-white rounded-xl shadow-2xl p-4 w-64 text-sm pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 90 }}
        >
          <p className="font-bold text-base mb-0.5">{tooltip.regionLabel}</p>
          <p className="text-slate-400 text-xs mb-2 italic">{tooltip.provinceName}</p>
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
                    (tooltip.stat.verifiedCount /
                      (tooltip.stat.verifiedCount + tooltip.stat.pendingCount)) * 100,
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
