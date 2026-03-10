import React, { useEffect, useMemo, useState } from 'react';
import type { CityMunicipality, Commodity, Contractor, ContractorStatus, NamedCode, Permit, PermitType, User } from '../types';
import { apiFetch } from '../api';
import SuccessToast from './SuccessToast';
import { CheckCircle2, Eye, Pencil, Plus, Search, X } from 'lucide-react';
import Swal from 'sweetalert2';

interface ContractorsProps {
  user: User;
  contractors: Contractor[];
  permitTypes: PermitType[];
  statuses: ContractorStatus[];
  commodities: Commodity[];
  onChanged: () => Promise<void> | void;
}

const emptyPermit = (permitTypeId?: string): Permit => ({
  permitTypeId: permitTypeId ?? '',
  permitNumber: '',
  dateApproved: null,
  dateExpiration: null
});

const toUpper = (value: string) => value.toUpperCase();

const Contractors: React.FC<ContractorsProps> = ({ user, contractors, permitTypes, statuses, commodities, onChanged }) => {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit' | 'view'; contractor?: Contractor }>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Local copy of contractors so deleted items can be removed immediately
  const [localContractors, setLocalContractors] = useState<Contractor[]>(contractors);

  // Keep local list in sync whenever the parent refreshes the prop
  useEffect(() => {
    setLocalContractors(contractors);
  }, [contractors]);

  // Location dropdowns (from backend PSGC proxy)
  const [regions, setRegions] = useState<NamedCode[]>([]);
  const [provinces, setProvinces] = useState<NamedCode[]>([]);
  const [cities, setCities] = useState<CityMunicipality[]>([]);

  const [form, setForm] = useState({
    name: '',
    tin: '',
    operatorName: '',
    contactNo: '',
    email: '',

    regionCode: '',
    regionName: '',
    provinceCode: '',
    provinceName: '',
    municipalityCode: '',
    municipalityName: '',

    areaHectare: '',
    statusId: statuses[0]?.id ?? '',

    commodityIds: [] as string[],
    permits: [emptyPermit(permitTypes[0]?.id)]
  });
  const [histories, setHistories] = useState<any[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [files, setFiles] = useState<{
    requiredDocuments: File[];
  }>({ requiredDocuments: [] });

  const canCreate = user.role === 'ADMIN' || user.role === 'REGIONAL_ECONOMIST';
  const canVerify = user.role === 'ADMIN' || user.role === 'CENTRAL_OFFICE';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return localContractors;
    return localContractors.filter((c) => {
      const hay = [c.contractorCode, c.name, c.tin, c.regionName, c.provinceName, c.municipalityName, c.operatorName, c.email].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [localContractors, search]);

  // Load regions when the modal opens
  useEffect(() => {
    if (!modal) return;
    (async () => {
      try {
        const r = await apiFetch<NamedCode[]>('/locations/regions');
        setRegions(r);
      } catch (e) {
        // ignore
      }
    })();
  }, [modal]);

  const loadProvinces = async (regionCode: string) => {
    if (!regionCode) {
      setProvinces([]);
      setCities([]);
      return;
    }
    const p = await apiFetch<NamedCode[]>(`/locations/regions/${regionCode}/provinces`);
    setProvinces(p);
    setCities([]);
  };

  const loadCities = async (regionCode: string, provinceCode: string) => {
    if (!regionCode || !provinceCode) {
      setCities([]);
      return;
    }
    const m = await apiFetch<CityMunicipality[]>(`/locations/regions/${regionCode}/provinces/${provinceCode}/cities-municipalities`);
    setCities(m);
  };

  const resetForm = () => {
    setError('');
    setForm({
      name: '',
      tin: '',
      operatorName: '',
      contactNo: '',
      email: '',
      regionCode: '',
      regionName: '',
      provinceCode: '',
      provinceName: '',
      municipalityCode: '',
      municipalityName: '',
      areaHectare: '',
      statusId: statuses[0]?.id ?? '',
      commodityIds: [],
      permits: [emptyPermit(permitTypes[0]?.id)]
    });
    setProvinces([]);
    setCities([]);
    setFiles({ requiredDocuments: [] });
  };

  const openCreate = () => {
    resetForm();
    setModal({ mode: 'create' });
  };

  const openView = async (c: Contractor) => {
    // We can use the list item, but fetch fresh to ensure includes are complete.
    const full = await apiFetch<any>(`/contractors/${c.id}`);
    resetForm();
    setForm({
      name: full.name,
      tin: full.tin,
      operatorName: full.operatorName,
      contactNo: full.contactNo,
      email: full.email,
      regionCode: full.regionCode,
      regionName: full.regionName,
      provinceCode: full.provinceCode ?? '',
      provinceName: full.provinceName,
      municipalityCode: full.municipalityCode ?? '',
      municipalityName: full.municipalityName,
      areaHectare: String(full.areaHectare ?? ''),
      statusId: full.statusId,
      commodityIds: full.contractorCommodities.map((cc) => cc.commodityId),
      permits: full.permits.length
        ? full.permits.map((p) => ({
            permitTypeId: p.permitTypeId,
            permitNumber: p.permitNumber,
            dateApproved: p.dateApproved ?? null,
            dateExpiration: p.dateExpiration ?? null
          }))
        : [emptyPermit(permitTypes[0]?.id)]
    });

    if (full.regionCode) {
      await loadProvinces(full.regionCode);
    }
    if (full.regionCode && full.provinceCode) {
      await loadCities(full.regionCode, full.provinceCode);
    }

    setModal({ mode: 'view', contractor: full });
    // store histories separately (if returned)
    setHistories(full.histories ?? []);
  };

  const openEdit = async (c: Contractor) => {
    const full = await apiFetch<Contractor>(`/contractors/${c.id}`);
    if (full.isVerified) {
      await Swal.fire({
        icon: 'warning',
        title: 'Cannot Edit',
        text: 'Verified contractors cannot be edited. Unverify first (Central Office/Admin).',
        confirmButtonColor: '#6366F1'
      });
      return;
    }

    resetForm();
    setForm({
      name: full.name,
      tin: full.tin,
      operatorName: full.operatorName,
      contactNo: full.contactNo,
      email: full.email,
      regionCode: full.regionCode,
      regionName: full.regionName,
      provinceCode: full.provinceCode ?? '',
      provinceName: full.provinceName,
      municipalityCode: full.municipalityCode ?? '',
      municipalityName: full.municipalityName,
      areaHectare: String(full.areaHectare ?? ''),
      statusId: full.statusId,
      commodityIds: full.contractorCommodities.map((cc) => cc.commodityId),
      permits: full.permits.length
        ? full.permits.map((p) => ({
            permitTypeId: p.permitTypeId,
            permitNumber: p.permitNumber,
            dateApproved: p.dateApproved ?? null,
            dateExpiration: p.dateExpiration ?? null
          }))
        : [emptyPermit(permitTypes[0]?.id)]
    });

    if (full.regionCode) {
      await loadProvinces(full.regionCode);
    }
    if (full.regionCode && full.provinceCode) {
      await loadCities(full.regionCode, full.provinceCode);
    }

    setModal({ mode: 'edit', contractor: full });
  };

  const handleCreate = async () => {
    setError('');
    setSaving(true);
    try {
      // Validate corporate TIN (12 digits)
      const tinDigits = (form.tin || '').replace(/\D/g, '');
      if (tinDigits.length !== 12) {
        setError('TIN must be a 12-digit corporate TIN');
        setSaving(false);
        return;
      }
      const payload = {
        name: toUpper(form.name),
        tin: toUpper(form.tin),
        operatorName: toUpper(form.operatorName),
        contactNo: toUpper(form.contactNo),
        email: toUpper(form.email),

        regionCode: form.regionCode,
        regionName: form.regionName,
        provinceCode: form.provinceCode || null,
        provinceName: form.provinceName,
        municipalityCode: form.municipalityCode || null,
        municipalityName: form.municipalityName,

        areaHectare: Number(form.areaHectare || 0),
        statusId: form.statusId,

        commodityIds: form.commodityIds,
        permits: form.permits
          .filter((p) => p.permitTypeId && p.permitNumber)
          .map((p) => ({
            permitTypeId: p.permitTypeId,
            permitNumber: toUpper(p.permitNumber),
            dateApproved: p.dateApproved || null,
            dateExpiration: p.dateExpiration || null
          }))
      };

      const created = await apiFetch('/contractors', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      // upload any selected files
      const formData = new FormData();
      files.requiredDocuments.forEach((file) => formData.append('requiredDocuments', file));
      if (Array.from(formData.keys()).length > 0) {
        try {
          await apiFetch(`/contractors/${(created as any).id}/documents`, { method: 'POST', body: formData });
        } catch (e) {
          // ignore upload errors here, but could surface to user
        }
      }

      setSuccess('Contractor enrolled successfully.');
      setModal(null);
      resetForm();
      await onChanged();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create contractor');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!modal?.contractor) return;
    setError('');
    setSaving(true);
    try {
      // Validate corporate TIN (12 digits) when present
      const tinDigits = (form.tin || '').replace(/\D/g, '');
      if (tinDigits.length !== 12) {
        setError('TIN must be a 12-digit corporate TIN');
        setSaving(false);
        return;
      }
      const payload = {
        name: toUpper(form.name),
        tin: toUpper(form.tin),
        operatorName: toUpper(form.operatorName),
        contactNo: toUpper(form.contactNo),
        email: toUpper(form.email),

        regionCode: form.regionCode,
        regionName: form.regionName,
        provinceCode: form.provinceCode || null,
        provinceName: form.provinceName,
        municipalityCode: form.municipalityCode || null,
        municipalityName: form.municipalityName,

        areaHectare: Number(form.areaHectare || 0),
        statusId: form.statusId,

        commodityIds: form.commodityIds,
        permits: form.permits
          .filter((p) => p.permitTypeId && p.permitNumber)
          .map((p) => ({
            permitTypeId: p.permitTypeId,
            permitNumber: toUpper(p.permitNumber),
            dateApproved: p.dateApproved || null,
            dateExpiration: p.dateExpiration || null
          }))
      };

      await apiFetch(`/contractors/${modal.contractor.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      // upload files if any selected
      const formData = new FormData();
      files.requiredDocuments.forEach((file) => formData.append('requiredDocuments', file));
      if (Array.from(formData.keys()).length > 0) {
        try {
          await apiFetch(`/contractors/${modal.contractor.id}/documents`, { method: 'POST', body: formData });
        } catch (e) {
          // ignore
        }
      }

      setSuccess('Contractor updated successfully.');
      setModal(null);
      resetForm();
      await onChanged();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update contractor');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async (contractorId: string) => {
    if (!canVerify) return;
    const result = await Swal.fire({
      title: 'Verify Contractor?',
      text: 'This will assign a Contractor ID and mark the contractor as verified.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      cancelButtonColor: '#94A3B8',
      confirmButtonText: 'Verify'
    });
    if (!result.isConfirmed) return;
    try {
      await apiFetch(`/contractors/${contractorId}/verify`, { method: 'POST' });
      await onChanged();
      await Swal.fire({ icon: 'success', title: 'Verified', text: 'Contractor has been verified.', confirmButtonColor: '#6366F1' });
    } catch (err: any) {
      await Swal.fire({ icon: 'error', title: 'Error', text: err?.message ?? 'Failed to verify contractor', confirmButtonColor: '#6366F1' });
    }
  };

  const handleUnverify = async (contractorId: string) => {
    if (!canVerify) return;
    const result = await Swal.fire({
      title: 'Unverify Contractor?',
      text: 'This will remove the Contractor ID.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#F59E0B',
      cancelButtonColor: '#94A3B8',
      confirmButtonText: 'Unverify'
    });
    if (!result.isConfirmed) return;
    try {
      await apiFetch(`/contractors/${contractorId}/unverify`, { method: 'POST' });
      await onChanged();
    } catch (err: any) {
      await Swal.fire({ icon: 'error', title: 'Error', text: err?.message ?? 'Failed to unverify contractor', confirmButtonColor: '#6366F1' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="relative max-w-xl w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            placeholder="Search contractors (name, region, TIN, ID, …)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {canCreate && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            Enroll Contractor
          </button>
        )}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-semibold text-slate-600">Contractor ID</th>
                <th className="text-left p-3 font-semibold text-slate-600">Company Name</th>
                <th className="text-left p-3 font-semibold text-slate-600">Region</th>
                <th className="text-left p-3 font-semibold text-slate-600">Location</th>
                <th className="text-left p-3 font-semibold text-slate-600">Commodities</th>
                <th className="text-left p-3 font-semibold text-slate-600">Permits</th>
                <th className="text-left p-3 font-semibold text-slate-600">Status</th>
                <th className="text-left p-3 font-semibold text-slate-600">Verification</th>
                <th className="text-left p-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs text-slate-700">{c.contractorCode ?? '—'}</td>
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500">TIN: {c.tin}</div>
                  </td>
                  <td className="p-3">{c.regionName}</td>
                  <td className="p-3">
                    <div>{c.municipalityName}</div>
                    <div className="text-xs text-slate-500">{c.provinceName}</div>
                  </td>
                  <td className="p-3">
                    {c.contractorCommodities.map((cc) => cc.commodity.name).join(', ')}
                  </td>
                  <td className="p-3">
                    {c.permits.map((p) => `${p.permitType?.name ?? ''}-${p.permitNumber}`).join('; ')}
                  </td>
                  <td className="p-3">{c.status?.name}</td>
                  <td className="p-3">
                    {c.isVerified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold">
                        <CheckCircle2 size={14} /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold">Pending</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openView(c)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-800 rounded-lg hover:bg-slate-200"
                      >
                        <Eye size={14} /> View
                      </button>

                      {canCreate && !c.isVerified && (user.role === 'ADMIN' || user.role === 'REGIONAL_ECONOMIST') && (
                        <button
                          onClick={() => openEdit(c)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          <Pencil size={14} /> Edit
                        </button>
                      )}

                      {canVerify ? (
                        c.isVerified ? (
                          <button
                            onClick={() => handleUnverify(c.id)}
                            className="px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                          >
                            Unverify
                          </button>
                        ) : (
                          <button
                            onClick={() => handleVerify(c.id)}
                            className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                          >
                            Verify
                          </button>
                        )
                      ) : null}
                      {canCreate && !c.isVerified && (user.role === 'ADMIN' || user.role === 'REGIONAL_ECONOMIST') && (
                        <button
                          onClick={async () => {
                            const result = await Swal.fire({
                              title: 'Delete Contractor?',
                              text: 'This will permanently remove the contractor and all related data.',
                              icon: 'warning',
                              showCancelButton: true,
                              confirmButtonColor: '#EF4444',
                              cancelButtonColor: '#94A3B8',
                              confirmButtonText: 'Delete'
                            });
                            if (!result.isConfirmed) return;
                            try {
                              await apiFetch(`/contractors/${c.id}`, { method: 'DELETE' });
                              setLocalContractors((prev) => prev.filter((item) => item.id !== c.id));
                              await onChanged();
                              setSuccess('Contractor deleted.');
                            } catch (err: any) {
                              await Swal.fire({ icon: 'error', title: 'Error', text: err?.message ?? 'Failed to delete contractor', confirmButtonColor: '#6366F1' });
                            }
                          }}
                          className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-slate-500" colSpan={9}>
                    No contractors found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit/View Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {modal.mode === 'create' ? 'Enroll New Contractor' : modal.mode === 'edit' ? 'Edit Contractor' : 'View Contractor'}
                </h3>
                {modal.mode === 'create' && (
                  <p className="text-xs text-slate-500">
                    Contractor will be <strong>Pending</strong> until Central Office/Admin verification.
                  </p>
                )}
                {modal.mode === 'edit' && <p className="text-xs text-slate-500">Edits are allowed only while contractor is pending.</p>}
                {modal.contractor && (
                  <div className="mt-1 text-xs text-slate-500">
                    Created: {modal.contractor.createdAt ? new Date(modal.contractor.createdAt).toLocaleString() : '—'} ·
                    Updated: {modal.contractor.updatedAt ? new Date(modal.contractor.updatedAt).toLocaleString() : '—'} ·
                    Verified: {modal.contractor.verifiedAt ? new Date(modal.contractor.verifiedAt).toLocaleString() : '—'}
                  </div>
                )}
              </div>
              <button
                className="p-2 rounded-lg hover:bg-slate-100"
                onClick={() => {
                  setModal(null);
                  resetForm();
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
              {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Contractor/Company Name</label>
                  <input
                    disabled={modal.mode === 'view'}
                    className="w-full p-2.5 border border-slate-200 rounded-lg disabled:bg-slate-50 uppercase"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: toUpper(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Tax Identification Number (TIN)</label>
                  <input
                    disabled={modal.mode === 'view'}
                    className="w-full p-2.5 border border-slate-200 rounded-lg disabled:bg-slate-50 uppercase"
                    placeholder="12-digit corporate TIN"
                    pattern="[0-9\- ]{12,}"
                    value={form.tin}
                    onChange={(e) => setForm({ ...form, tin: toUpper(e.target.value) })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Operator Name</label>
                  <input
                    disabled={modal.mode === 'view'}
                    className="w-full p-2.5 border border-slate-200 rounded-lg disabled:bg-slate-50 uppercase"
                    value={form.operatorName}
                    onChange={(e) => setForm({ ...form, operatorName: toUpper(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Contact No.</label>
                  <input
                    disabled={modal.mode === 'view'}
                    className="w-full p-2.5 border border-slate-200 rounded-lg disabled:bg-slate-50 uppercase"
                    value={form.contactNo}
                    onChange={(e) => setForm({ ...form, contactNo: toUpper(e.target.value) })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    disabled={modal.mode === 'view'}
                    className="w-full p-2.5 border border-slate-200 rounded-lg disabled:bg-slate-50 uppercase"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: toUpper(e.target.value) })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Status</label>
                  <select className="w-full p-2.5 border border-slate-200 rounded-lg" value={form.statusId} onChange={(e) => setForm({ ...form, statusId: e.target.value })}>
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Area (Hectare)</label>
                  <input type="number" className="w-full p-2.5 border border-slate-200 rounded-lg" value={form.areaHectare} onChange={(e) => setForm({ ...form, areaHectare: e.target.value })} />
                </div>
              </div>

              {modal.mode === 'view' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-slate-800">Revision History</h3>
                  {histories.length === 0 ? (
                    <div className="text-sm text-slate-500">No revisions yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {histories.map((h) => (
                        <div key={h.id} className="p-3 border border-slate-200 rounded-xl bg-slate-50">
                          <div className="flex items-center justify-between gap-4">
                            <div className="text-sm text-slate-700">
                              <div className="font-semibold">{h.changedBy?.name ?? 'System'}</div>
                              <div className="text-xs text-slate-500">{new Date(h.createdAt).toLocaleString()}</div>
                            </div>
                            <div>
                              <button
                                className="text-xs px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200"
                                onClick={() => setExpandedHistory(expandedHistory === h.id ? null : h.id)}
                              >
                                {expandedHistory === h.id ? 'Hide' : 'View snapshot'}
                              </button>
                            </div>
                          </div>
                          {expandedHistory === h.id && (
                            <pre className="mt-3 max-h-40 overflow-auto text-xs bg-white p-3 rounded border border-slate-100">{JSON.stringify(h.data, null, 2)}</pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Region</label>
                  <select
                    className="w-full p-2.5 border border-slate-200 rounded-lg"
                    value={form.regionCode}
                    onChange={async (e) => {
                      const code = e.target.value;
                      const selected = regions.find((r) => r.code === code);
                      setForm({
                        ...form,
                        regionCode: code,
                        regionName: selected?.name ?? '',
                        provinceCode: '',
                        provinceName: '',
                        municipalityCode: '',
                        municipalityName: ''
                      });
                      await loadProvinces(code);
                    }}
                  >
                    <option value="">Select Region</option>
                    {regions.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {user.role === 'REGIONAL_ECONOMIST' && user.regionCode && (
                    <p className="text-[10px] text-slate-500 mt-1">Note: Regional Economist accounts are typically limited to their assigned region.</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Province</label>
                  <select
                    className="w-full p-2.5 border border-slate-200 rounded-lg"
                    value={form.provinceCode}
                    onChange={async (e) => {
                      const code = e.target.value;
                      const selected = provinces.find((p) => p.code === code);
                      setForm({ ...form, provinceCode: code, provinceName: selected?.name ?? '', municipalityCode: '', municipalityName: '' });
                      await loadCities(form.regionCode, code);
                    }}
                    disabled={!form.regionCode}
                  >
                    <option value="">Select Province</option>
                    {provinces.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Municipality</label>
                  <select
                    className="w-full p-2.5 border border-slate-200 rounded-lg"
                    value={form.municipalityCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const selected = cities.find((m) => m.code === code);
                      setForm({ ...form, municipalityCode: code, municipalityName: selected?.name ?? '' });
                    }}
                    disabled={!form.provinceCode}
                  >
                    <option value="">Select Municipality</option>
                    {cities.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Commodities */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">Commodities (multi-select)</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {commodities
                    .filter((c) => c.isActive)
                    .map((c) => {
                      const checked = form.commodityIds.includes(c.id);
                      return (
                        <label key={c.id} className={`flex items-center gap-2 p-2 rounded-lg border ${checked ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...form.commodityIds, c.id]
                                : form.commodityIds.filter((x) => x !== c.id);
                              setForm({ ...form, commodityIds: next });
                            }}
                          />
                          <span className="text-xs font-semibold text-slate-700">{c.name}</span>
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* Permits */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-600">Permits (multiple)</label>
                  <button
                    type="button"
                    className="text-xs font-semibold text-blue-600 hover:underline"
                    onClick={() => setForm({ ...form, permits: [...form.permits, emptyPermit(permitTypes[0]?.id)] })}
                  >
                    + Add Permit
                  </button>
                </div>

                {form.permits.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Permit Type</label>
                      <select
                        className="w-full p-2 border border-slate-200 rounded-lg"
                        value={p.permitTypeId}
                        onChange={(e) => {
                          const permits = [...form.permits];
                          permits[idx] = { ...permits[idx], permitTypeId: e.target.value };
                          setForm({ ...form, permits });
                        }}
                      >
                        <option value="">Select</option>
                        {permitTypes.filter((pt) => pt.isActive).map((pt) => (
                          <option key={pt.id} value={pt.id}>
                            {pt.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Permit Number</label>
                      <input
                        className="w-full p-2 border border-slate-200 rounded-lg uppercase"
                        value={p.permitNumber}
                        onChange={(e) => {
                          const permits = [...form.permits];
                          permits[idx] = { ...permits[idx], permitNumber: toUpper(e.target.value) };
                          setForm({ ...form, permits });
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Approved</label>
                      <input
                        type="date"
                        className="w-full p-2 border border-slate-200 rounded-lg"
                        value={p.dateApproved ?? ''}
                        onChange={(e) => {
                          const permits = [...form.permits];
                          permits[idx] = { ...permits[idx], dateApproved: e.target.value };
                          setForm({ ...form, permits });
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Expiry</label>
                      <input
                        type="date"
                        className="w-full p-2 border border-slate-200 rounded-lg"
                        value={p.dateExpiration ?? ''}
                        onChange={(e) => {
                          const permits = [...form.permits];
                          permits[idx] = { ...permits[idx], dateExpiration: e.target.value };
                          setForm({ ...form, permits });
                        }}
                      />
                    </div>

                    <div className="md:col-span-5 flex justify-end">
                      {form.permits.length > 1 && (
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-600 hover:underline"
                          onClick={() => setForm({ ...form, permits: form.permits.filter((_, i) => i !== idx) })}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

                {/* Required Documents */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">Required Documents</label>
                  <input
                    disabled={modal.mode === 'view'}
                    type="file"
                    multiple
                    accept=".pdf,image/*,.doc,.docx"
                    onChange={(e) => setFiles({ ...files, requiredDocuments: Array.from(e.target.files ?? []) })}
                  />
                  <div className="text-xs text-slate-500 mt-2">Accepted formats: PDF, JPG/PNG, DOC/DOCX</div>
                </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
                onClick={() => {
                  setModal(null);
                  resetForm();
                }}
              >
                Cancel
              </button>
              {modal.mode !== 'view' ? (
                <button
                  type="button"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                  onClick={modal.mode === 'create' ? handleCreate : handleUpdate}
                >
                  {saving ? 'Saving…' : modal.mode === 'create' ? 'Save Contractor' : 'Update Contractor'}
                </button>
              ) : (
                <button
                  type="button"
                  className="px-5 py-2 rounded-lg bg-slate-100 text-slate-800 font-semibold hover:bg-slate-200"
                  onClick={() => {
                    setModal(null);
                    resetForm();
                  }}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
        <SuccessToast open={!!success} message={success} onClose={() => setSuccess('')} />
    </div>
  );
};

export default Contractors;
