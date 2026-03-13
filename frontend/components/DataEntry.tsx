import React, { useEffect, useMemo, useState } from 'react';
import type { Commodity, Contractor, Submission, User } from '../types';
import { apiFetch, downloadFile } from '../api';
import SuccessToast from './SuccessToast';
import { MONTHS } from '../constants';
import { Download, Paperclip, Save, Send, Trash2, X } from 'lucide-react';
import Swal from 'sweetalert2';

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
  // Exchange rate and excise tax (auto-calculated; encoder can override)
  exchangeRate: number;
  exciseTaxRate: number;
  exciseTaxPayable: number;
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
  const [recentViewSubmission, setRecentViewSubmission] = useState<Submission | null>(null);

  // Exchange rate and excise tax state
  const [officialExchangeRate, setOfficialExchangeRate] = useState<number | null>(null);
  const [exchangeRateSource, setExchangeRateSource] = useState<string | null>(null);
  const [exchangeRateOverrideValue, setExchangeRateOverrideValue] = useState<string>('');
  const [isExchangeRateOverridden, setIsExchangeRateOverridden] = useState<boolean>(false);
  const [officialExciseTaxRate, setOfficialExciseTaxRate] = useState<number>(0.04);
  const [exciseTaxLegalBasis, setExciseTaxLegalBasis] = useState<string>('RA 12253');
  const [exciseTaxRateOverride, setExciseTaxRateOverride] = useState<string>('');
  const [isExciseTaxOverridden, setIsExciseTaxOverridden] = useState<boolean>(false);

  const popup = Swal.mixin({
    confirmButtonColor: '#6366F1',
    cancelButtonColor: '#94A3B8',
    confirmButtonText: 'OK',
    showClass: { popup: 'swal2-show' },
    hideClass: { popup: 'swal2-hide' }
  });

  // Fetch official exchange rate and excise tax rate when month/year changes
  useEffect(() => {
    let cancelled = false;

    const fetchRates = async () => {
      try {
        const [rateRes, taxRes] = await Promise.all([
          apiFetch<{ rate: number | null; source: string | null }>(`/exchange-rates?year=${year}&month=${month}&currencyPair=USD%2FPHP`),
          apiFetch<{ rate: number; legalBasis: string | null }>(`/exchange-rates/excise-tax?date=${year}-${String(month).padStart(2, '0')}-01`)
        ]);
        if (!cancelled) {
          setOfficialExchangeRate(rateRes.rate);
          setExchangeRateSource(rateRes.source);
          setExchangeRateOverrideValue('');
          setIsExchangeRateOverridden(false);
          setOfficialExciseTaxRate(taxRes.rate);
          setExciseTaxLegalBasis(taxRes.legalBasis ?? 'RA 12253');
          setExciseTaxRateOverride('');
          setIsExciseTaxOverridden(false);
        }
      } catch {
        // Non-critical; encoder can still manually enter values
      }
    };

    fetchRates();
    return () => { cancelled = true; };
  }, [year, month]);

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
        valueUsd: Number(r.fobValueUsd ?? r.valueUsd ?? 0),
        exchangeRate: Number(r.exchangeRate ?? 0),
        exciseTaxRate: Number(r.exciseTaxRate ?? 0),
        exciseTaxPayable: Number(r.exciseTaxPayable ?? 0)
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

  // Effective exchange rate: encoder override takes precedence over official rate
  const activeExchangeRate = isExchangeRateOverridden && exchangeRateOverrideValue !== ''
    ? Number(exchangeRateOverrideValue)
    : (officialExchangeRate ?? 0);

  // Effective excise tax rate: admin override takes precedence
  const activeExciseTaxRate = isExciseTaxOverridden && exciseTaxRateOverride !== ''
    ? Number(exciseTaxRateOverride) / 100
    : officialExciseTaxRate;

  // Handle encoder overriding exchange rate (captures reason for audit)
  const handleExchangeRateOverride = async () => {
    const result = await popup.fire({
      title: 'Override Exchange Rate',
      html: `<p class="text-sm text-slate-600 mb-3">Official rate: <strong>₱${officialExchangeRate?.toFixed(4) ?? 'N/A'}</strong></p>
             <input id="rate-val" class="swal2-input" placeholder="Enter override rate (e.g. 57.50)" type="number" step="0.0001">
             <input id="rate-reason" class="swal2-input" placeholder="Reason (e.g. contract locked-in rate)">`,
      showCancelButton: true,
      confirmButtonText: 'Apply Override',
      preConfirm: () => {
        const rateEl = (document.getElementById('rate-val') as HTMLInputElement);
        const reasonEl = (document.getElementById('rate-reason') as HTMLInputElement);
        if (!rateEl?.value || !reasonEl?.value) {
          Swal.showValidationMessage('Both rate and reason are required');
          return false;
        }
        return { rate: rateEl.value, reason: reasonEl.value };
      }
    });
    if (!result.isConfirmed || !result.value) return;
    setExchangeRateOverrideValue(String(result.value.rate));
    setIsExchangeRateOverridden(true);
    // If we have a saved submission, record the override for audit
    if (currentSubmissionId && officialExchangeRate != null) {
      try {
        await apiFetch('/exchange-rates/override', {
          method: 'POST',
          body: JSON.stringify({
            submissionId: currentSubmissionId,
            currencyPair: 'USD/PHP',
            officialRate: officialExchangeRate,
            overrideRate: Number(result.value.rate),
            reason: result.value.reason
          })
        });
      } catch {
        // Non-critical audit store failure
      }
    }
  };

  // Handle admin overriding excise tax rate (requires reason)
  const handleExciseTaxOverride = async () => {
    const result = await popup.fire({
      title: 'Edit Excise Tax Rate',
      html: `<p class="text-sm text-slate-600 mb-3">Official rate: <strong>${(activeExciseTaxRate * 100).toFixed(2)}%</strong> (${exciseTaxLegalBasis})</p>
             <input id="tax-val" class="swal2-input" placeholder="New rate % (e.g. 3.5)" type="number" step="0.01">
             <input id="tax-reason" class="swal2-input" placeholder="Reason for Change (e.g. Tax Credit Applied)">`,
      showCancelButton: true,
      confirmButtonText: 'Apply Override',
      preConfirm: () => {
        const rateEl = (document.getElementById('tax-val') as HTMLInputElement);
        const reasonEl = (document.getElementById('tax-reason') as HTMLInputElement);
        if (!rateEl?.value || !reasonEl?.value) {
          Swal.showValidationMessage('Both rate and reason are required');
          return false;
        }
        return { rate: rateEl.value, reason: reasonEl.value };
      }
    });
    if (!result.isConfirmed || !result.value) return;
    setExciseTaxRateOverride(String(result.value.rate));
    setIsExciseTaxOverridden(true);
    // Record audit trail if submission exists
    if (currentSubmissionId) {
      try {
        await apiFetch('/exchange-rates/excise-tax/override', {
          method: 'POST',
          body: JSON.stringify({
            submissionId: currentSubmissionId,
            officialRate: activeExciseTaxRate,
            overrideRate: Number(result.value.rate) / 100,
            reason: result.value.reason
          })
        });
      } catch {
        // Non-critical
      }
    }
  };

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
        exchangeRate: activeExchangeRate,
        exciseTaxRate: activeExciseTaxRate,
        records: sales.records.map((r) => ({
          buyerName: r.buyerName,
          destinationCountry: r.destinationCountry,
          isExport: r.isExport,
          quantity: r.quantity,
          unit: r.unit,
          // Backend report generator expects these keys
          fobValuePhp: r.valuePhp,
          fobValueUsd: r.valueUsd,
          exchangeRate: r.exchangeRate || activeExchangeRate,
          exciseTaxRate: r.exciseTaxRate || activeExciseTaxRate,
          exciseTaxPayable: r.exciseTaxPayable
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
    const result = await popup.fire({
      title: 'Delete this draft submission?',
      text: 'This will clear all encoded sections for this draft.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel'
    });
    if (!result.isConfirmed) return;
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
      await popup.fire({
        title: 'Operation failed',
        text: err?.message ?? 'Failed',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);

    setError('');
    setBusy(true);
    try {
      let targetSubmissionId = currentSubmissionId;
      if (!targetSubmissionId) {
        const created = await upsertSubmission();
        targetSubmissionId = created.id;
      }

      await apiFetch(`/submissions/${targetSubmissionId}/attachments`, {
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
    const result = await popup.fire({
      title: 'Remove this attachment?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      cancelButtonText: 'Cancel'
    });
    if (!result.isConfirmed) return;
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
    const result = await popup.fire({
      title: 'Delete this submission?',
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel'
    });
    if (!result.isConfirmed) return;
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
                onClick={() => {
                  const newRecord: typeof sales.records[0] = {
                    buyerName: '',
                    destinationCountry: countries[0]?.name ?? 'Philippines',
                    isExport: false,
                    quantity: 0,
                    unit: production.unit || selectedCommodity?.defaultUnit?.name || '',
                    valuePhp: 0,
                    valueUsd: 0,
                    exchangeRate: activeExchangeRate,
                    exciseTaxRate: activeExciseTaxRate,
                    exciseTaxPayable: 0
                  };
                  setSales({ records: [...sales.records, newRecord] });
                }}
              >
                + Add Sale
              </button>
            </div>

            {/* Exchange Rate & Excise Tax info panel */}
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-xs font-bold text-slate-600 mb-0.5">USD/PHP Exchange Rate</p>
                  {officialExchangeRate != null ? (
                    <p className="text-sm font-semibold text-slate-800">
                      ₱{officialExchangeRate.toFixed(4)}
                      <span className="ml-1 text-xs font-normal text-slate-500">({exchangeRateSource ?? 'DB'})</span>
                      {isExchangeRateOverridden && (
                        <span className="ml-2 text-xs text-amber-600 font-semibold">→ Override: ₱{Number(exchangeRateOverrideValue).toFixed(4)}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500 italic">No rate on record for this month — enter manually.</p>
                  )}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-xs font-bold text-slate-600 mb-0.5">Excise Tax Rate</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {(activeExciseTaxRate * 100).toFixed(2)}%
                    <span className="ml-1 text-xs font-normal text-slate-500">({exciseTaxLegalBasis})</span>
                    {isExciseTaxOverridden && (
                      <span className="ml-2 text-xs text-amber-600 font-semibold">Overridden</span>
                    )}
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold"
                      onClick={handleExchangeRateOverride}
                    >
                      Override Rate
                    </button>
                    {canAdminEdit && (
                      <button
                        type="button"
                        className="text-xs px-3 py-1.5 rounded-lg border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 font-semibold"
                        onClick={handleExciseTaxOverride}
                      >
                        Edit Tax
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-400">Rates auto-populate from the reporting month. Encoder may override with a locked-in contract rate.</p>
            </div>

            {sales.records.length === 0 && <div className="text-sm text-slate-500">No sales records yet.</div>}

            {sales.records.map((r, idx) => {
              const displayFobPhp = r.valuePhp > 0 ? r.valuePhp : (activeExchangeRate > 0 && r.valueUsd > 0 ? r.valueUsd * activeExchangeRate : 0);
              const computedExciseTax = displayFobPhp * activeExciseTaxRate;
              const displayFobPhpValue = r.valuePhp > 0 ? r.valuePhp : (displayFobPhp > 0 ? parseFloat(displayFobPhp.toFixed(2)) : 0);
              const displayExciseTax = parseFloat((r.exciseTaxPayable > 0 ? r.exciseTaxPayable : computedExciseTax).toFixed(2));

              return (
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
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">FOB Value (USD $)</label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-lg"
                        value={r.valueUsd}
                        onChange={(e) => {
                          const usd = Number(e.target.value);
                          const php = activeExchangeRate > 0 ? usd * activeExchangeRate : r.valuePhp;
                          const tax = php * activeExciseTaxRate;
                          const next = [...sales.records];
                          next[idx] = { ...next[idx], valueUsd: usd, valuePhp: php, exchangeRate: activeExchangeRate, exciseTaxRate: activeExciseTaxRate, exciseTaxPayable: tax };
                          setSales({ records: next });
                        }}
                        disabled={readOnly}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        FOB Value (PHP ₱)
                        {activeExchangeRate > 0 && r.valueUsd > 0 && (
                          <span className="ml-1 text-blue-500 font-normal">(auto-computed)</span>
                        )}
                      </label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-lg"
                        value={displayFobPhpValue}
                        onChange={(e) => {
                          const php = Number(e.target.value);
                          const tax = php * activeExciseTaxRate;
                          const next = [...sales.records];
                          next[idx] = { ...next[idx], valuePhp: php, exciseTaxRate: activeExciseTaxRate, exciseTaxPayable: tax };
                          setSales({ records: next });
                        }}
                        disabled={readOnly}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Excise Tax Payable (₱)
                        <span className="ml-1 text-[9px] font-normal text-slate-400">({(activeExciseTaxRate * 100).toFixed(0)}%)</span>
                      </label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-700"
                        value={displayExciseTax}
                        readOnly
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Estimated Excise Tax Payable Summary */}
            {sales.records.length > 0 && (
              <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-600">Estimated Excise Tax Payable</p>
                    <p className="text-[10px] text-slate-400">
                      Sum of all records × {(activeExciseTaxRate * 100).toFixed(2)}% excise tax ({exciseTaxLegalBasis})
                    </p>
                  </div>
                  <p className="text-xl font-bold text-emerald-700">
                    ₱{sales.records.reduce((sum, r) => {
                      const php = r.valuePhp > 0 ? r.valuePhp : (activeExchangeRate > 0 && r.valueUsd > 0 ? r.valueUsd * activeExchangeRate : 0);
                      return sum + (r.exciseTaxPayable > 0 ? r.exciseTaxPayable : php * activeExciseTaxRate);
                    }, 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            )}
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
              <span className="text-xs text-slate-500">(Draft auto-saves on first upload)</span>
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
                          onClick={() => setRecentViewSubmission(s)}
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

      {recentViewSubmission && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRecentViewSubmission(null)} />
          <div className="relative bg-white rounded-2xl shadow-lg max-w-3xl w-full p-6 z-50 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-bold text-lg text-slate-800">Submission Details</div>
                <div className="text-xs text-slate-500">{recentViewSubmission.contractor.name} — {recentViewSubmission.commodity.name}</div>
              </div>
              <div className="flex items-start gap-4">
                <div className="text-right text-xs text-slate-500">{recentViewSubmission.year}-{String(recentViewSubmission.month ?? '').padStart(2, '0')}</div>
                <button className="p-1 rounded hover:bg-slate-100" onClick={() => setRecentViewSubmission(null)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="font-semibold text-slate-700">Contractor</div>
                <div className="text-sm">{recentViewSubmission.contractor.contractorCode ?? '—'} {recentViewSubmission.contractor.name}</div>
                <div className="text-xs text-slate-500">{recentViewSubmission.contractor.municipalityName}, {recentViewSubmission.contractor.provinceName}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-700">Status</div>
                <div className="text-sm">{recentViewSubmission.status}</div>
                <div className="text-xs text-slate-500">Submitted: {recentViewSubmission.submittedAt ? new Date(recentViewSubmission.submittedAt).toLocaleString() : '—'}</div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="font-semibold text-slate-700">Attachments</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {recentViewSubmission.attachments.length === 0 && <div className="text-xs text-slate-500">No attachments</div>}
                  {recentViewSubmission.attachments.map((a) => (
                    <button
                      key={a.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-slate-100 rounded-md"
                      onClick={() => downloadFile(`/submissions/${recentViewSubmission.id}/attachments/${a.id}/download`, a.originalName)}
                    >
                      <Download size={14} /> {a.originalName}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-semibold text-slate-700">Administrative</div>
                <div className="mt-2 p-3 bg-slate-50 rounded-md text-sm text-slate-700">{(recentViewSubmission.administrative && (recentViewSubmission.administrative.notes || JSON.stringify(recentViewSubmission.administrative))) ?? <span className="text-xs text-slate-500">No notes</span>}</div>
              </div>

              <div>
                <div className="font-semibold text-slate-700">Production</div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Quantity</div>
                    <div className="font-semibold">{recentViewSubmission.production?.quantity ?? '—'}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Unit</div>
                    <div className="font-semibold">{recentViewSubmission.production?.unit ?? '—'}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Value (PHP)</div>
                    <div className="font-semibold">{recentViewSubmission.production?.value ?? '—'}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded md:col-span-2">
                    <div className="text-xs text-slate-500">Remarks</div>
                    <div className="text-sm mt-1">{recentViewSubmission.production?.remarks ?? <span className="text-xs text-slate-500">—</span>}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="font-semibold text-slate-700">Sales</div>
                <div className="mt-2 space-y-2">
                  {(recentViewSubmission.sales?.records ?? []).length === 0 ? (
                    <div className="text-xs text-slate-500">No sales records</div>
                  ) : (
                    (recentViewSubmission.sales?.records ?? []).map((r, idx) => (
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
                          <div className="font-semibold">{r.valuePhp ?? r.fobValuePhp ?? '—'}</div>
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
                    <div className="font-semibold">{recentViewSubmission.employment?.headOfficeMale ?? 0}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Head Office (Female)</div>
                    <div className="font-semibold">{recentViewSubmission.employment?.headOfficeFemale ?? 0}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Mine Site (Male)</div>
                    <div className="font-semibold">{recentViewSubmission.employment?.mineSiteMale ?? 0}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Mine Site (Female)</div>
                    <div className="font-semibold">{recentViewSubmission.employment?.mineSiteFemale ?? 0}</div>
                  </div>
                </div>
                <div className="mt-2 text-sm text-slate-700 font-semibold">Total: {(recentViewSubmission.employment?.headOfficeMale ?? 0) + (recentViewSubmission.employment?.headOfficeFemale ?? 0) + (recentViewSubmission.employment?.mineSiteMale ?? 0) + (recentViewSubmission.employment?.mineSiteFemale ?? 0)}</div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="px-4 py-2 text-sm bg-white border rounded-md" onClick={() => setRecentViewSubmission(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
      <SuccessToast open={!!success} message={success} onClose={() => setSuccess('')} />
    </>
  );
};

export default DataEntry;
