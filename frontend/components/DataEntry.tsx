import React, { useEffect, useMemo, useState } from 'react';
import type { Commodity, Contractor, Submission, User } from '../types';
import { apiFetch } from '../api';
import SuccessToast from './SuccessToast';
import { MONTHS } from '../constants';
import { Paperclip, Save, Send, Trash2 } from 'lucide-react';

interface DataEntryProps {
  user: User;
  contractors: Contractor[];
  commodities: Commodity[];
  submissions: Submission[];
  countries: { id: string; name: string }[];
  onChanged: () => Promise<void> | void;
}

type SalesRecord = {
  buyerName: string;
  destinationCountry: string;
  isExport: boolean;
  quantity: number;
  unit: string;
  // UI-friendly field names; backend expects fobValuePhp/fobValueUsd.
  valuePhp: number;
  valueUsd: number;
};

const DataEntry: React.FC<DataEntryProps> = ({ user, contractors, commodities, submissions, countries, onChanged }) => {
  const now = new Date();
  const [contractorId, setContractorId] = useState<string>(contractors[0]?.id ?? '');
  const [commodityId, setCommodityId] = useState<string>('');
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);

  const [activeStep, setActiveStep] = useState<number>(0);
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null);

  const [admin, setAdmin] = useState<{ notes: string }>({ notes: '' });
  const [production, setProduction] = useState<{ quantity: number; unit: string; value: number; inventoryQuantity: number; inventoryValue: number; remarks: string }>({
    quantity: 0,
    unit: '',
    value: 0,
    inventoryQuantity: 0,
    inventoryValue: 0,
    remarks: ''
  });
  const [sales, setSales] = useState<{ records: SalesRecord[] }>({ records: [] });
  const [employment, setEmployment] = useState<{ headOfficeMale: number; headOfficeFemale: number; mineSiteMale: number; mineSiteFemale: number }>({
    headOfficeMale: 0,
    headOfficeFemale: 0,
    mineSiteMale: 0,
    mineSiteFemale: 0
  });

  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [success, setSuccess] = useState<string>('');

  const selectedContractor = useMemo(() => contractors.find((c) => c.id === contractorId) ?? null, [contractorId, contractors]);
  const contractorCommodityOptions = useMemo(() => {
    if (!selectedContractor) return [];
    return selectedContractor.contractorCommodities.map((cc) => cc.commodity);
  }, [selectedContractor]);

  // Set default commodity when contractor changes
  useEffect(() => {
    if (!selectedContractor) return;
    const first = contractorCommodityOptions[0]?.id;
    if (first && !contractorCommodityOptions.find((c) => c.id === commodityId)) {
      setCommodityId(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractorId]);

  const selectedCommodity = useMemo(() => commodities.find((c) => c.id === commodityId) ?? null, [commodities, commodityId]);

  const existingSubmission = useMemo(() => {
    return submissions.find((s) => s.contractorId === contractorId && s.commodityId === commodityId && s.year === year && (s.month ?? 0) === month) ?? null;
  }, [submissions, contractorId, commodityId, year, month]);

  // Load existing submission into form
  useEffect(() => {
    setError('');
    if (!existingSubmission) {
      setCurrentSubmissionId(null);
      setAdmin({ notes: '' });
      setProduction({
        quantity: 0,
        unit: selectedCommodity?.defaultUnit?.name ?? '',
        value: 0,
        inventoryQuantity: 0,
        inventoryValue: 0,
        remarks: ''
      });
      setSales({ records: [] });
      setEmployment({ headOfficeMale: 0, headOfficeFemale: 0, mineSiteMale: 0, mineSiteFemale: 0 });
      return;
    }

    setCurrentSubmissionId(existingSubmission.id);
    setAdmin(existingSubmission.administrative ?? { notes: '' });

    const p = existingSubmission.production ?? {};
    setProduction({
      quantity: Number(p.quantity ?? 0),
      unit: String(p.unit ?? selectedCommodity?.defaultUnit?.name ?? ''),
      value: Number(p.value ?? 0),
      inventoryQuantity: Number(p.inventoryQuantity ?? 0),
      inventoryValue: Number(p.inventoryValue ?? 0),
      remarks: String(p.remarks ?? '')
    });

    const s = existingSubmission.sales ?? {};
    // Backwards/forwards compatible mapping of record keys
    const records: any[] = Array.isArray(s.records) ? s.records : [];
    setSales({
      records: records.map((r) => ({
        buyerName: String(r.buyerName ?? ''),
        destinationCountry: String(r.destinationCountry ?? ''),
        isExport: Boolean(r.isExport ?? false),
        quantity: Number(r.quantity ?? 0),
        unit: String(r.unit ?? selectedCommodity?.defaultUnit?.name ?? ''),
        valuePhp: Number(r.fobValuePhp ?? r.valuePhp ?? 0),
        valueUsd: Number(r.fobValueUsd ?? r.valueUsd ?? 0)
      }))
    });

    const e = existingSubmission.employment ?? {};
    setEmployment({
      headOfficeMale: Number(e.headOfficeMale ?? 0),
      headOfficeFemale: Number(e.headOfficeFemale ?? 0),
      mineSiteMale: Number(e.mineSiteMale ?? 0),
      mineSiteFemale: Number(e.mineSiteFemale ?? 0)
    });
  }, [existingSubmission?.id, selectedCommodity?.id]);

  const canAdminEdit = user.role === 'ADMIN' || user.role === 'CENTRAL_OFFICE';
  const canEditThisSubmission =
    user.role === 'ADMIN'
      ? true
      : user.role === 'CENTRAL_OFFICE'
        ? existingSubmission?.status === 'VERIFIED'
        : existingSubmission?.status !== 'SUBMITTED' && existingSubmission?.status !== 'VERIFIED';

  const readOnly = existingSubmission ? !canEditThisSubmission : false;

  const upsertSubmission = async () => {
    if (!contractorId || !commodityId) throw new Error('Select a contractor and commodity');

    const productionPayload = {
      quantity: production.quantity,
      unit: production.unit,
      value: production.value,
      inventoryQuantity: production.inventoryQuantity,
      inventoryValue: production.inventoryValue,
      remarks: production.remarks,
      // This `items` array is used by the backend report aggregation.
      items: [
        {
          materialName: selectedCommodity?.name ?? 'Commodity',
          quantity: production.quantity,
          unit: production.unit,
          value: production.value
        }
      ]
    };

    const payload = {
      contractorId,
      commodityId,
      year,
      month,
      administrative: { ...admin, encodedBy: user.name },
      production: productionPayload,
      sales: {
        records: sales.records.map((r) => ({
          buyerName: r.buyerName,
          destinationCountry: r.destinationCountry,
          isExport: r.isExport,
          quantity: r.quantity,
          unit: r.unit,
          // Backend report generator expects these keys
          fobValuePhp: r.valuePhp,
          fobValueUsd: r.valueUsd
        }))
      },
      employment
    };

    if (currentSubmissionId) {
      const updated = await apiFetch<Submission>(`/submissions/${currentSubmissionId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      setCurrentSubmissionId(updated.id);
      return updated;
    }

    const created = await apiFetch<Submission>('/submissions', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    setCurrentSubmissionId(created.id);
    return created;
  };

  const handleSaveDraft = async () => {
    setError('');
    setBusy(true);
    try {
      await upsertSubmission();
      await onChanged();
      setSuccess('Saved (Draft).');
    } catch (err: any) {
      setError(err?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    setBusy(true);
    try {
      const sub = await upsertSubmission();
      await apiFetch(`/submissions/${sub.id}/submit`, { method: 'POST' });
      await onChanged();
      setSuccess('Submitted to Central Office for verification.');
    } catch (err: any) {
      setError(err?.message ?? 'Submit failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!currentSubmissionId) return;
    if (!confirm('Delete this draft submission?')) return;
    setBusy(true);
    try {
      // Soft-delete not implemented; easiest is to set blank and keep record.
      // You can add a DELETE endpoint in the backend if you want hard deletes.
      await apiFetch<Submission>(`/submissions/${currentSubmissionId}`, {
        method: 'PUT',
        body: JSON.stringify({ administrative: null, production: null, sales: null, employment: null })
      });
      await onChanged();
    } catch (err: any) {
      alert(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!currentSubmissionId) {
      alert('Please save the draft first, then upload the attachment.');
      return;
    }

    const fd = new FormData();
    fd.append('file', file);

    setBusy(true);
    try {
      await apiFetch(`/submissions/${currentSubmissionId}/attachments`, {
        method: 'POST',
        body: fd
      });
      await onChanged();
      setSuccess('File uploaded.');
    } catch (err: any) {
      setError(err?.message ?? 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    if (!currentSubmissionId) return;
    if (!confirm('Remove this attachment?')) return;
    setError('');
    setBusy(true);
    try {
      await apiFetch(`/submissions/${currentSubmissionId}/attachments/${attachmentId}`, { method: 'DELETE' });
      await onChanged();
      setSuccess('Attachment removed.');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to remove attachment');
    } finally {
      setBusy(false);
    }
  };

  const jumpToSubmission = (s: Submission) => {
    setContractorId(s.contractorId);
    setCommodityId(s.commodityId);
    setYear(s.year);
    setMonth(Number(s.month ?? 1));
    setActiveStep(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const canManageSubmission = (s: Submission) => {
    if (user.role === 'ADMIN') return true;
    if (user.role === 'CENTRAL_OFFICE') return s.status === 'VERIFIED';
    return false;
  };

  const deleteSubmission = async (s: Submission) => {
    if (!confirm('Delete this submission?')) return;
    setError('');
    setBusy(true);
    try {
      await apiFetch(`/submissions/${s.id}`, { method: 'DELETE' });
      await onChanged();
      setSuccess('Submission deleted.');
      if (currentSubmissionId === s.id) {
        setCurrentSubmissionId(null);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const steps = ['Administrative', 'Production', 'Sales & Marketing', 'Employment', 'Attachments'];

  return (
    <>
      <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Contractor</label>
            <select
              className="w-full p-2.5 border border-slate-200 rounded-lg"
              value={contractorId}
              onChange={(e) => setContractorId(e.target.value)}
            >
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contractorCode ? `${c.contractorCode} - ` : ''}{c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Commodity</label>
            <select className="w-full p-2.5 border border-slate-200 rounded-lg" value={commodityId} onChange={(e) => setCommodityId(e.target.value)}>
              {contractorCommodityOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Year</label>
            <input
              type="number"
              className="w-full p-2.5 border border-slate-200 rounded-lg"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>

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
        </div>

        {existingSubmission && (
          <div className="mt-4 text-xs text-slate-600">
            <span className="font-bold">Status:</span> {existingSubmission.status}
            {existingSubmission.rejectedReason ? <span className="ml-2 text-red-600">({existingSubmission.rejectedReason})</span> : null}
          </div>
        )}

        {error && <div className="mt-4 text-sm text-red-600 font-semibold">{error}</div>}

        <div className="mt-5 flex flex-wrap gap-2 justify-end">
          <button
            disabled={busy || readOnly}
            onClick={handleSaveDraft}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            <Save size={16} /> Save Draft
          </button>
          <button
            disabled={busy || readOnly}
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Send size={16} /> Submit
          </button>
          <button
            disabled={busy || !currentSubmissionId || readOnly}
            onClick={handleDeleteDraft}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <Trash2 size={16} /> Clear
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex flex-wrap gap-2">
        {steps.map((s, idx) => (
          <button
            key={s}
            className={`px-4 py-2 rounded-full text-xs font-bold border ${activeStep === idx ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            onClick={() => setActiveStep(idx)}
          >
            {idx + 1}. {s}
          </button>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        {activeStep === 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800">I. Administrative</h3>
            <textarea
              className="w-full min-h-[120px] p-3 border border-slate-200 rounded-xl"
              placeholder="Notes / administrative remarks"
              value={admin.notes}
              onChange={(e) => setAdmin({ ...admin, notes: e.target.value })}
              disabled={readOnly}
            />
          </div>
        )}

        {activeStep === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800">II. Production</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Production Quantity</label>
                <input
                  type="number"
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                  value={production.quantity}
                  onChange={(e) => setProduction({ ...production, quantity: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Unit</label>
                <input
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                  value={production.unit}
                  onChange={(e) => setProduction({ ...production, unit: e.target.value })}
                  placeholder={selectedCommodity?.defaultUnit?.name ?? ''}
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Production Value (PHP)</label>
                <input
                  type="number"
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                  value={production.value}
                  onChange={(e) => setProduction({ ...production, value: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Inventory Quantity</label>
                <input
                  type="number"
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                  value={production.inventoryQuantity}
                  onChange={(e) => setProduction({ ...production, inventoryQuantity: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Inventory Value (PHP)</label>
                <input
                  type="number"
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                  value={production.inventoryValue}
                  onChange={(e) => setProduction({ ...production, inventoryValue: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Remarks</label>
              <textarea
                className="w-full min-h-[100px] p-3 border border-slate-200 rounded-xl"
                value={production.remarks}
                onChange={(e) => setProduction({ ...production, remarks: e.target.value })}
                disabled={readOnly}
              />
            </div>
          </div>
        )}

        {activeStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">III. Sales & Marketing</h3>
              <button
                type="button"
                disabled={readOnly}
                className="text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50"
                onClick={() =>
                  setSales({
                    records: [
                      ...sales.records,
                      {
                        buyerName: '',
                        destinationCountry: countries[0]?.name ?? 'Philippines',
                        isExport: false,
                        quantity: 0,
                        unit: production.unit || selectedCommodity?.defaultUnit?.name || '',
                        valuePhp: 0,
                        valueUsd: 0
                      }
                    ]
                  })
                }
              >
                + Add Sale
              </button>
            </div>

            {sales.records.length === 0 && <div className="text-sm text-slate-500">No sales records yet.</div>}

            {sales.records.map((r, idx) => (
              <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={readOnly}
                    className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                    onClick={() => setSales({ records: sales.records.filter((_, i) => i !== idx) })}
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Buyer Name</label>
                    <input
                      className="w-full p-2 border border-slate-200 rounded-lg"
                      value={r.buyerName}
                      onChange={(e) => {
                        const next = [...sales.records];
                        next[idx] = { ...next[idx], buyerName: e.target.value };
                        setSales({ records: next });
                      }}
                      disabled={readOnly}
                    />
                  </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Country</label>
                      <select
                        className="w-full p-2 border border-slate-200 rounded-lg"
                        value={r.destinationCountry}
                        onChange={(e) => {
                          const next = [...sales.records];
                          next[idx] = { ...next[idx], destinationCountry: e.target.value };
                          setSales({ records: next });
                        }}
                        disabled={readOnly}
                      >
                        <option value="">Select country</option>
                        {countries.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  <div className="flex items-end gap-2">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={r.isExport}
                        onChange={(e) => {
                          const next = [...sales.records];
                          next[idx] = { ...next[idx], isExport: e.target.checked };
                          setSales({ records: next });
                        }}
                        disabled={readOnly}
                      />
                      Export
                    </label>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Quantity</label>
                    <input
                      type="number"
                      className="w-full p-2 border border-slate-200 rounded-lg"
                      value={r.quantity}
                      onChange={(e) => {
                        const next = [...sales.records];
                        next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                        setSales({ records: next });
                      }}
                      disabled={readOnly}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Unit</label>
                    <input
                      className="w-full p-2 border border-slate-200 rounded-lg"
                      value={r.unit}
                      onChange={(e) => {
                        const next = [...sales.records];
                        next[idx] = { ...next[idx], unit: e.target.value };
                        setSales({ records: next });
                      }}
                      disabled={readOnly}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">FOB Value (PHP)</label>
                    <input
                      type="number"
                      className="w-full p-2 border border-slate-200 rounded-lg"
                      value={r.valuePhp}
                      onChange={(e) => {
                        const next = [...sales.records];
                        next[idx] = { ...next[idx], valuePhp: Number(e.target.value) };
                        setSales({ records: next });
                      }}
                      disabled={readOnly}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">FOB Value (USD)</label>
                    <input
                      type="number"
                      className="w-full p-2 border border-slate-200 rounded-lg"
                      value={r.valueUsd}
                      onChange={(e) => {
                        const next = [...sales.records];
                        next[idx] = { ...next[idx], valueUsd: Number(e.target.value) };
                        setSales({ records: next });
                      }}
                      disabled={readOnly}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeStep === 3 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800">IV. Employment</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Head Office (Male)</label>
                <input
                  type="number"
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                  value={employment.headOfficeMale}
                  onChange={(e) => setEmployment({ ...employment, headOfficeMale: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Head Office (Female)</label>
                <input
                  type="number"
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                  value={employment.headOfficeFemale}
                  onChange={(e) => setEmployment({ ...employment, headOfficeFemale: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Mine Site (Male)</label>
                <input
                  type="number"
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                  value={employment.mineSiteMale}
                  onChange={(e) => setEmployment({ ...employment, mineSiteMale: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Mine Site (Female)</label>
                <input
                  type="number"
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                  value={employment.mineSiteFemale}
                  onChange={(e) => setEmployment({ ...employment, mineSiteFemale: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="text-sm text-slate-700 font-semibold">
              Total: {employment.headOfficeMale + employment.mineSiteMale + employment.headOfficeFemale + employment.mineSiteFemale}
            </div>
          </div>
        )}

        {activeStep === 4 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Attachments</h3>

            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
                <Paperclip size={16} />
                <span className="text-sm font-semibold">Upload file</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.currentTarget.value = '';
                  }}
                  disabled={readOnly}
                />
              </label>
              <span className="text-xs text-slate-500">(Save draft first before uploading)</span>
            </div>

            {existingSubmission?.attachments?.length ? (
              <div className="space-y-2">
                {existingSubmission.attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{a.originalName}</div>
                      <div className="text-xs text-slate-500">{Math.round(a.sizeBytes / 1024)} KB</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <a
                        className="text-xs text-blue-600 hover:underline"
                        href={`/api/submissions/${existingSubmission.id}/attachments/${a.id}/download`}
                      >
                        Download
                      </a>
                      {!readOnly && (
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-600 hover:underline"
                          onClick={() => handleRemoveAttachment(a.id)}
                          disabled={busy}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">No attachments.</div>
            )}

            
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-between">
        <button
          type="button"
          className="px-4 py-2 border rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
          disabled={activeStep === 0}
        >
          &larr; Previous
        </button>
        <button
          type="button"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          onClick={() => setActiveStep((s) => Math.min(steps.length - 1, s + 1))}
          disabled={activeStep >= steps.length - 1}
        >
          Next &rarr;
        </button>
      </div>

      {/* Recent submissions list (quick view) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 font-bold text-slate-800">Recent Submissions</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-semibold text-slate-600">Period</th>
                <th className="text-left p-3 font-semibold text-slate-600">Contractor</th>
                <th className="text-left p-3 font-semibold text-slate-600">Commodity</th>
                <th className="text-left p-3 font-semibold text-slate-600">Status</th>
                <th className="text-left p-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions
                .slice()
                .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
                .slice(0, 10)
                .map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3">{s.year}-{String(s.month ?? '').padStart(2, '0')}</td>
                    <td className="p-3">{s.contractor.contractorCode ?? ''} {s.contractor.name}</td>
                    <td className="p-3">{s.commodity.name}</td>
                    <td className="p-3">{s.status}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-800 rounded-lg hover:bg-slate-200"
                          onClick={() => jumpToSubmission(s)}
                        >
                          View
                        </button>
                        {canManageSubmission(s) && (
                          <>
                            <button
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                              onClick={() => jumpToSubmission(s)}
                            >
                              Edit
                            </button>
                            <button
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                              onClick={() => deleteSubmission(s)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              {submissions.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-slate-500" colSpan={5}>
                    No submissions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
      <SuccessToast open={!!success} message={success} onClose={() => setSuccess('')} />
    </>
  );
};

export default DataEntry;
