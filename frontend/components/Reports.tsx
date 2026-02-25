import React, { useMemo, useState, useEffect } from 'react';
import type { Commodity, Contractor, MineralType, ReportPermission, ReportType, Submission, User } from '../types';
import { apiFetch, downloadFile } from '../api';
import { MONTHS, REPORT_TITLES } from '../constants';
import { CheckCircle2, Download, Filter, XCircle, X } from 'lucide-react';

interface ReportsProps {
  user: User;
  reportPermissions: ReportPermission[];
  contractors: Contractor[];
  commodities: Commodity[];
  submissions: Submission[];
  onChanged: () => Promise<void> | void;
}

const REPORTS: Array<{ type: ReportType; endpoint: string }> = [
  { type: 'OPERATING_MINES', endpoint: '/reports/operating-mines' },
  { type: 'DIRECTORY', endpoint: '/reports/directory' },
  { type: 'PRODUCTION', endpoint: '/reports/production' },
  { type: 'SALES', endpoint: '/reports/sales' },
  { type: 'EXPORT_BY_COUNTRY', endpoint: '/reports/export-by-country' },
  { type: 'EMPLOYMENT', endpoint: '/reports/employment' }
];

const Reports: React.FC<ReportsProps> = ({ user, reportPermissions, contractors, commodities, submissions, onChanged }) => {
  const now = new Date();
  const [periodType, setPeriodType] = useState<'MONTHLY' | 'QUARTERLY' | 'YEARLY'>('MONTHLY');
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [quarter, setQuarter] = useState<number>(Math.floor(now.getMonth() / 3) + 1);

  const [mineralType, setMineralType] = useState<MineralType | ''>('');
  const [commodityId, setCommodityId] = useState<string>('');
  const [regionCode, setRegionCode] = useState<string>('');
  const [asOf, setAsOf] = useState<string>(now.toISOString().slice(0, 10));

  const canReview = user.role === 'ADMIN' || user.role === 'CENTRAL_OFFICE';

  const regionOptions = useMemo(() => {
    const map = new Map<string, string>();
    contractors.forEach((c) => {
      if (c.regionCode) map.set(c.regionCode, c.regionName);
    });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [contractors]);

  const pendingSubmissions = useMemo(() => {
    if (!canReview) return [];
    return submissions.filter((s) => s.status === 'SUBMITTED').slice().sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
  }, [submissions, canReview]);

  // Server-side paginated verified submissions
  const [verifiedItems, setVerifiedItems] = useState<any[]>([]);
  const [verifiedTotal, setVerifiedTotal] = useState(0);
  const [verifiedPage, setVerifiedPage] = useState(1);
  const verifiedLimit = 10;

  const fetchVerified = async (page = 1) => {
    try {
      const params = buildParams();
      params.set('page', String(page));
      params.set('limit', String(verifiedLimit));
      const payload = await apiFetch<any>(`/submissions/verified?${params.toString()}`);
      setVerifiedItems(payload.items ?? []);
      setVerifiedTotal(payload.total ?? 0);
      setVerifiedPage(payload.page ?? page);
    } catch (e: any) {
      console.error('Failed to fetch verified submissions', e);
      setVerifiedItems([]);
      setVerifiedTotal(0);
    }
  };

  React.useEffect(() => {
    if (!canReview) return;
    fetchVerified(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, quarter, commodityId, regionCode, mineralType, canReview]);

  const canViewReport = (type: ReportType) => {
    if (user.role === 'ADMIN') return true;
    const perm = reportPermissions.find((p) => p.reportType === type);
    return perm ? perm.canView : false;
  };

  const buildParams = () => {
    const p = new URLSearchParams();
    p.set('year', String(year));

    if (periodType === 'MONTHLY') p.set('month', String(month));
    if (periodType === 'QUARTERLY') p.set('quarter', String(quarter));

    if (mineralType) p.set('mineralType', mineralType);
    if (commodityId) p.set('commodityId', commodityId);

    // Regional accounts are already filtered by backend; region filter is mainly for central/admin/guest.
    if (regionCode) p.set('regionCode', regionCode);

    return p;
  };

  const downloadReport = async (type: ReportType, endpoint: string) => {
    if (!canViewReport(type)) {
      alert('You do not have permission to generate this report.');
      return;
    }

    const params = buildParams();
    if (type === 'DIRECTORY') {
      params.set('asOf', asOf);
    }

    const fileName = `${REPORT_TITLES[type].replace(/\s+/g, '_')}_${year}.xlsx`;
    await downloadFile(`${endpoint}?${params.toString()}`, fileName);
  };

  const verifySubmission = async (id: string) => {
    await apiFetch(`/submissions/${id}/verify`, { method: 'POST' });
    await onChanged();
  };

  const rejectSubmission = async (id: string) => {
    const reason = prompt('Rejection reason (optional):') ?? '';
    await apiFetch(`/submissions/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
    await onChanged();
  };

  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isEditingSubmission, setIsEditingSubmission] = useState(false);
  const [editingPayload, setEditingPayload] = useState<{ administrative?: string; production?: string; sales?: string; employment?: string }>({ administrative: '', production: '', sales: '', employment: '' });

  const openSubmission = (s: Submission) => setSelectedSubmission(s);
  const closeSubmission = () => setSelectedSubmission(null);

  const handleEditFromRow = (s: any) => {
    setSelectedSubmission(s);
    setIsEditingSubmission(true);
    setEditingPayload({
      administrative: JSON.stringify(s.administrative ?? {}, null, 2),
      production: JSON.stringify(s.production ?? {}, null, 2),
      sales: JSON.stringify(s.sales ?? {}, null, 2),
      employment: JSON.stringify(s.employment ?? {}, null, 2)
    });
  };

  const handleDeleteFromRow = async (s: any) => {
    if (!confirm('Delete this submission?')) return;
    await apiFetch(`/submissions/${s.id}`, { method: 'DELETE' });
    await onChanged();
    if (selectedSubmission?.id === s.id) closeSubmission();
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 text-slate-800 font-bold mb-4">
          <Filter size={18} /> Report Filters
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Period</label>
            <select className="w-full p-2.5 border border-slate-200 rounded-lg" value={periodType} onChange={(e) => setPeriodType(e.target.value as any)}>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Year</label>
            <input type="number" className="w-full p-2.5 border border-slate-200 rounded-lg" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>

          {periodType === 'MONTHLY' && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Month</label>
              <select className="w-full p-2.5 border border-slate-200 rounded-lg" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          {periodType === 'QUARTERLY' && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Quarter</label>
              <select className="w-full p-2.5 border border-slate-200 rounded-lg" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
                <option value={1}>Q1</option>
                <option value={2}>Q2</option>
                <option value={3}>Q3</option>
                <option value={4}>Q4</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Mineral Type</label>
            <select className="w-full p-2.5 border border-slate-200 rounded-lg" value={mineralType} onChange={(e) => setMineralType(e.target.value as any)}>
              <option value="">All</option>
              <option value="METALLIC">Metallic</option>
              <option value="NON_METALLIC">Non-Metallic</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Commodity</label>
            <select className="w-full p-2.5 border border-slate-200 rounded-lg" value={commodityId} onChange={(e) => setCommodityId(e.target.value)}>
              <option value="">All</option>
              {commodities.filter((c) => c.isActive).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {(user.role === 'ADMIN' || user.role === 'CENTRAL_OFFICE' || user.role === 'GUEST') && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Region</label>
              <select className="w-full p-2.5 border border-slate-200 rounded-lg" value={regionCode} onChange={(e) => setRegionCode(e.target.value)}>
                <option value="">All</option>
                {regionOptions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="md:col-span-6 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Note: Region filter is enforced for Regional Economist accounts on the server.
            </div>
            <button
              className="text-xs font-semibold text-slate-600 hover:underline"
              onClick={() => {
                setMineralType('');
                setCommodityId('');
                setRegionCode('');
              }}
            >
              Reset filters
            </button>
          </div>

          <div className="md:col-span-6">
            <label className="block text-xs font-bold text-slate-600 mb-1">Directory As-Of Date (Directory report only)</label>
            <input type="date" className="p-2.5 border border-slate-200 rounded-lg" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Report Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((r) => (
          <div key={r.type} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-800">{REPORT_TITLES[r.type]}</div>
              <div className="text-xs text-slate-500">Excel report (.xlsx)</div>
            </div>

            <button
              disabled={!canViewReport(r.type)}
              onClick={() => downloadReport(r.type, r.endpoint)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600"
            >
              <Download size={16} /> Download
            </button>
          </div>
        ))}
      </div>

      {/* Review queue */}
      {canReview && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 font-bold text-slate-800">Pending Submissions for Verification</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-3 font-semibold text-slate-600">Period</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Region</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Contractor</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Commodity</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Submitted At</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingSubmissions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3">{s.year}-{String(s.month ?? '').padStart(2, '0')}</td>
                    <td className="p-3">{s.contractor.regionName}</td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-800">{s.contractor.contractorCode ?? '—'} {s.contractor.name}</div>
                      <div className="text-xs text-slate-500">{s.contractor.municipalityName}, {s.contractor.provinceName}</div>
                    </td>
                    <td className="p-3">{s.commodity.name}</td>
                    <td className="p-3 text-xs text-slate-600">{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-slate-600 text-white rounded-lg hover:bg-slate-700"
                          onClick={() => openSubmission(s)}
                        >
                          View
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                          onClick={() => verifySubmission(s.id)}
                        >
                          <CheckCircle2 size={14} /> Verify
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700"
                          onClick={() => rejectSubmission(s.id)}
                        >
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {pendingSubmissions.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-slate-500" colSpan={6}>
                      No pending submissions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
            <div className="p-4 flex items-center justify-between">
              <div className="text-sm text-slate-600">Total: {verifiedTotal}</div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1 rounded bg-slate-100" disabled={verifiedPage <= 1} onClick={() => fetchVerified(verifiedPage - 1)}>
                  Prev
                </button>
                <div className="text-sm">Page {verifiedPage}</div>
                <button className="px-3 py-1 rounded bg-slate-100" disabled={verifiedPage * 10 >= verifiedTotal} onClick={() => fetchVerified(verifiedPage + 1)}>
                  Next
                </button>
              </div>
            </div>
        </div>
      )}
      {/* Verified submissions (read-only view) */}
      {canReview && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
          <div className="p-4 border-b border-slate-200 font-bold text-slate-800">Recently Verified Submissions</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-3 font-semibold text-slate-600">Period</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Region</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Contractor</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Commodity</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Verified At</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {verifiedItems.map((s: any) => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3">{s.year}-{String(s.month ?? '').padStart(2, '0')}</td>
                    <td className="p-3">{s.contractor.regionName}</td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-800">{s.contractor.contractorCode ?? '—'} {s.contractor.name}</div>
                      <div className="text-xs text-slate-500">{s.contractor.municipalityName}, {s.contractor.provinceName}</div>
                    </td>
                    <td className="p-3">{s.commodity.name}</td>
                    <td className="p-3 text-xs text-slate-600">{s.verifiedAt ? new Date(s.verifiedAt).toLocaleString() : '—'}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-800 rounded-lg hover:bg-slate-200"
                          onClick={() => openSubmission(s)}
                        >
                          View
                        </button>
                        {(user.role === 'ADMIN' || user.role === 'CENTRAL_OFFICE') && (
                          <>
                            <button
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                              onClick={() => handleEditFromRow(s)}
                            >
                              Edit
                            </button>
                            <button
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700"
                              onClick={() => handleDeleteFromRow(s)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {verifiedItems.length === 0 && verifiedTotal === 0 && (
                  <tr>
                    <td className="p-6 text-center text-slate-500" colSpan={6}>
                      No verified submissions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {selectedSubmission && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeSubmission} />
          <div className="relative bg-white rounded-2xl shadow-lg max-w-3xl w-full p-6 z-50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-bold text-lg text-slate-800">Submission Details</div>
                <div className="text-xs text-slate-500">{selectedSubmission.contractor.name} — {selectedSubmission.commodity.name}</div>
              </div>
              <div className="flex items-start gap-4">
                <div className="text-right text-xs text-slate-500">{selectedSubmission.year}-{String(selectedSubmission.month ?? '').padStart(2, '0')}</div>
                <button
                  className="p-1 rounded hover:bg-slate-100"
                  onClick={closeSubmission}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="font-semibold text-slate-700">Contractor</div>
                <div className="text-sm">{selectedSubmission.contractor.contractorCode ?? '—'} {selectedSubmission.contractor.name}</div>
                <div className="text-xs text-slate-500">{selectedSubmission.contractor.municipalityName}, {selectedSubmission.contractor.provinceName}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-700">Submitted At</div>
                <div className="text-sm">{selectedSubmission.submittedAt ? new Date(selectedSubmission.submittedAt).toLocaleString() : '—'}</div>
                <div className="text-xs text-slate-500">Status: {selectedSubmission.status}</div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {isEditingSubmission && (
                <div className="space-y-3">
                  <div>
                    <div className="font-semibold text-slate-700">Administrative (JSON)</div>
                    <textarea className="w-full p-2 border rounded" rows={4} value={editingPayload.administrative} onChange={(e) => setEditingPayload({ ...editingPayload, administrative: e.target.value })} />
                  </div>

                  <div>
                    <div className="font-semibold text-slate-700">Production (JSON)</div>
                    <textarea className="w-full p-2 border rounded" rows={4} value={editingPayload.production} onChange={(e) => setEditingPayload({ ...editingPayload, production: e.target.value })} />
                  </div>

                  <div>
                    <div className="font-semibold text-slate-700">Sales (JSON)</div>
                    <textarea className="w-full p-2 border rounded" rows={4} value={editingPayload.sales} onChange={(e) => setEditingPayload({ ...editingPayload, sales: e.target.value })} />
                  </div>

                  <div>
                    <div className="font-semibold text-slate-700">Employment (JSON)</div>
                    <textarea className="w-full p-2 border rounded" rows={4} value={editingPayload.employment} onChange={(e) => setEditingPayload({ ...editingPayload, employment: e.target.value })} />
                  </div>
                </div>
              )}
              <div>
                <div className="font-semibold text-slate-700">Attachments</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedSubmission.attachments.length === 0 && <div className="text-xs text-slate-500">No attachments</div>}
                  {selectedSubmission.attachments.map((a) => (
                    <button
                      key={a.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-slate-100 rounded-md"
                      onClick={() => downloadFile(`/submissions/${selectedSubmission.id}/attachments/${a.id}/download`, a.originalName)}
                    >
                      <Download size={14} /> {a.originalName}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-semibold text-slate-700">Administrative</div>
                <div className="mt-2 p-3 bg-slate-50 rounded-md text-sm text-slate-700">{(selectedSubmission.administrative && (selectedSubmission.administrative.notes || JSON.stringify(selectedSubmission.administrative))) ?? <span className="text-xs text-slate-500">No notes</span>}</div>
              </div>

              <div>
                <div className="font-semibold text-slate-700">Production</div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Quantity</div>
                    <div className="font-semibold">{selectedSubmission.production?.quantity ?? '—'}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Unit</div>
                    <div className="font-semibold">{selectedSubmission.production?.unit ?? '—'}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Value (PHP)</div>
                    <div className="font-semibold">{selectedSubmission.production?.value ?? '—'}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded md:col-span-2">
                    <div className="text-xs text-slate-500">Remarks</div>
                    <div className="text-sm mt-1">{selectedSubmission.production?.remarks ?? <span className="text-xs text-slate-500">—</span>}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="font-semibold text-slate-700">Sales</div>
                <div className="mt-2 space-y-2">
                  {(selectedSubmission.sales?.records ?? []).length === 0 ? (
                    <div className="text-xs text-slate-500">No sales records</div>
                  ) : (
                    (selectedSubmission.sales?.records ?? []).map((r, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div>
                          <div className="text-xs text-slate-500">Buyer</div>
                          <div className="font-semibold">{r.buyerName || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Country</div>
                          <div className="font-semibold">{r.destinationCountry || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Quantity</div>
                          <div className="font-semibold">{r.quantity ?? '—'} {r.unit ?? ''}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Value (PHP)</div>
                          <div className="font-semibold">{r.valuePhp ?? '—'}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="font-semibold text-slate-700">Employment</div>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Head Office (Male)</div>
                    <div className="font-semibold">{selectedSubmission.employment?.headOfficeMale ?? 0}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Head Office (Female)</div>
                    <div className="font-semibold">{selectedSubmission.employment?.headOfficeFemale ?? 0}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Mine Site (Male)</div>
                    <div className="font-semibold">{selectedSubmission.employment?.mineSiteMale ?? 0}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Mine Site (Female)</div>
                    <div className="font-semibold">{selectedSubmission.employment?.mineSiteFemale ?? 0}</div>
                  </div>
                </div>
                <div className="mt-2 text-sm text-slate-700 font-semibold">Total: {(selectedSubmission.employment?.headOfficeMale ?? 0) + (selectedSubmission.employment?.headOfficeFemale ?? 0) + (selectedSubmission.employment?.mineSiteMale ?? 0) + (selectedSubmission.employment?.mineSiteFemale ?? 0)}</div>
              </div>
            </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  className="px-4 py-2 text-sm bg-white border rounded-md"
                  onClick={closeSubmission}
                >
                  Close
                </button>

                {selectedSubmission && selectedSubmission.status === 'VERIFIED' && (user.role === 'ADMIN' || user.role === 'CENTRAL_OFFICE') && (
                  <>
                    <button
                      className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-md"
                      onClick={() => {
                        // Enter edit mode: preload JSON strings
                        setIsEditingSubmission(true);
                        setEditingPayload({
                          administrative: JSON.stringify(selectedSubmission.administrative ?? {}, null, 2),
                          production: JSON.stringify(selectedSubmission.production ?? {}, null, 2),
                          sales: JSON.stringify(selectedSubmission.sales ?? {}, null, 2),
                          employment: JSON.stringify(selectedSubmission.employment ?? {}, null, 2)
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded-md"
                      onClick={async () => {
                        if (!confirm('Delete this submission?')) return;
                        await apiFetch(`/submissions/${selectedSubmission.id}`, { method: 'DELETE' });
                        await onChanged();
                        closeSubmission();
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}

                {!isEditingSubmission && selectedSubmission && selectedSubmission.status === 'SUBMITTED' && (
                  <>
                    <button
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded-md"
                      onClick={async () => {
                        if (!confirm('Reject this submission?')) return;
                        await rejectSubmission(selectedSubmission.id);
                        closeSubmission();
                      }}
                    >
                      Reject
                    </button>
                    <button
                      className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md"
                      onClick={async () => {
                        if (!confirm('Verify this submission?')) return;
                        await verifySubmission(selectedSubmission.id);
                        closeSubmission();
                      }}
                    >
                      Verify
                    </button>
                  </>
                )}

                {isEditingSubmission && (
                  <button
                    className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md"
                    onClick={async () => {
                      if (!selectedSubmission) return;
                      try {
                        const payload: any = {};
                        if (editingPayload.administrative) payload.administrative = JSON.parse(editingPayload.administrative);
                        if (editingPayload.production) payload.production = JSON.parse(editingPayload.production);
                        if (editingPayload.sales) payload.sales = JSON.parse(editingPayload.sales);
                        if (editingPayload.employment) payload.employment = JSON.parse(editingPayload.employment);
                        await apiFetch(`/submissions/${selectedSubmission.id}`, { method: 'PUT', body: JSON.stringify(payload) });
                        await onChanged();
                        setIsEditingSubmission(false);
                        closeSubmission();
                      } catch (e: any) {
                        alert(e?.message ?? 'Save failed (check JSON)');
                      }
                    }}
                  >
                    Save
                  </button>
                )}
                {isEditingSubmission && (
                  <button
                    className="px-4 py-2 text-sm bg-white border rounded-md"
                    onClick={() => setIsEditingSubmission(false)}
                  >
                    Cancel
                  </button>
                )}
              </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
