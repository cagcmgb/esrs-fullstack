import React, { useEffect, useMemo, useState } from 'react';
import type { Commodity, ContractorStatus, PermitType, ReportPermission, Unit, User, UserRole, ReportType } from '../types';
import { apiFetch, downloadFile } from '../api';
import { USER_ROLES } from '../types';
import { Plus, Trash2, UserCog } from 'lucide-react';
import { REPORT_TITLES } from '../constants';

interface AdminProps {
  user: User;
  permitTypes: PermitType[];
  statuses: ContractorStatus[];
  commodities: Commodity[];
  units: Unit[];
  countries: { id: string; name: string }[];
  reportPermissions: ReportPermission[];
  onChanged: () => Promise<void> | void;
}

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: UserRole;
  regionCode?: string | null;
  isActive: boolean;
};

type RegionConfig = {
  regionCode: string;
  name: string;
  idPrefix: string;
  nextSequence: number;
};

const Admin: React.FC<AdminProps> = ({ user, permitTypes, statuses, commodities, units, countries, onChanged }) => {
  const [section, setSection] = useState<'USERS' | 'LISTS' | 'PERMISSIONS' | 'REGIONS'>('USERS');

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [permissions, setPermissions] = useState<ReportPermission[]>([]);
  const [regions, setRegions] = useState<RegionConfig[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadAdminData = async () => {
    setError('');
    try {
      const [u, p, r] = await Promise.all([
        apiFetch<AdminUserRow[]>('/admin/users'),
        apiFetch<ReportPermission[]>('/admin/report-permissions'),
        apiFetch<RegionConfig[]>('/admin/regions')
      ]);
      setUsers(u);
      setPermissions(p);
      setRegions(r);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load admin data');
    }
  };

  useEffect(() => {
    if (user.role === 'ADMIN') {
      loadAdminData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------- USERS --------------------
  const [newUser, setNewUser] = useState<{ name: string; email: string; username: string; role: UserRole; regionCode: string; password: string }>(
    () => ({ name: '', email: '', username: '', role: 'GUEST', regionCode: '', password: '' })
  );

  const createUser = async () => {
    setBusy(true);
    try {
      await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: newUser.name,
          email: newUser.email,
          username: newUser.username,
          role: newUser.role,
          regionCode: newUser.role === 'REGIONAL_ECONOMIST' ? (newUser.regionCode || null) : null,
          password: newUser.password || undefined
        })
      });
      setNewUser({ name: '', email: '', username: '', role: 'GUEST', regionCode: '', password: '' });
      await loadAdminData();
      alert('User created.');
    } catch (e: any) {
      alert(e?.message ?? 'Failed to create user');
    } finally {
      setBusy(false);
    }
  };

  const updateUser = async (id: string, patch: Partial<AdminUserRow>) => {
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(patch)
      });
      await loadAdminData();
    } catch (e: any) {
      alert(e?.message ?? 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const deactivateUser = async (id: string) => {
    if (!confirm('Deactivate this user?')) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
      await loadAdminData();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  // -------------------- LISTS --------------------
  const [newPermitType, setNewPermitType] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newUnit, setNewUnit] = useState<{ name: string; symbol: string }>({ name: '', symbol: '' });
  const [newCommodity, setNewCommodity] = useState<{ name: string; mineralType: 'METALLIC' | 'NON_METALLIC'; defaultUnitId: string; formTemplateCode: string; category?: string }>(() => ({
    name: '',
    mineralType: 'METALLIC',
    defaultUnitId: units[0]?.id ?? '',
    formTemplateCode: '',
    category: ''
  }));
  const [newCountry, setNewCountry] = useState('');
  const [bulkFile, setBulkFile] = useState<File | null>(null);

  const downloadBulkTemplate = async (format: 'csv' | 'xlsx', sample = false) => {
    try {
      await downloadFile(
        `/admin/contractors/import-template?format=${format}&sample=${sample ? 'true' : 'false'}`,
        `contractor_bulk_template${sample ? '_sample' : ''}.${format}`
      );
    } catch (e: any) {
      alert(e?.message ?? `Failed to download ${format.toUpperCase()} template`);
    }
  };

  const uploadBulkContractors = async () => {
    if (!bulkFile) {
      alert('Please choose a CSV or XLSX file first.');
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', bulkFile);

      const result = await apiFetch<{ totalRows: number; createdCount: number; failedCount: number; failures: { rowNumber: number; message: string }[] }>(
        '/admin/contractors/import',
        {
          method: 'POST',
          body: form
        }
      );

      await onChanged();
      setBulkFile(null);

      const firstErrors = result.failures.slice(0, 5).map((f) => `Row ${f.rowNumber}: ${f.message}`).join('\n');
      alert(
        [
          `Import complete.`,
          `Total rows: ${result.totalRows}`,
          `Created: ${result.createdCount}`,
          `Failed: ${result.failedCount}`,
          firstErrors ? `\nFirst errors:\n${firstErrors}` : ''
        ].join('\n')
      );
    } catch (e: any) {
      alert(e?.message ?? 'Bulk upload failed');
    } finally {
      setBusy(false);
    }
  };

  const addPermitType = async () => {
    if (!newPermitType.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/admin/permit-types', { method: 'POST', body: JSON.stringify({ name: newPermitType.trim() }) });
      setNewPermitType('');
      await onChanged();
      alert('Permit type added.');
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const addStatus = async () => {
    if (!newStatus.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/admin/statuses', { method: 'POST', body: JSON.stringify({ name: newStatus.trim() }) });
      setNewStatus('');
      await onChanged();
      alert('Status added.');
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const addUnit = async () => {
    if (!newUnit.name.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/admin/units', { method: 'POST', body: JSON.stringify({ name: newUnit.name.trim(), symbol: newUnit.symbol.trim() || null }) });
      setNewUnit({ name: '', symbol: '' });
      await onChanged();
      alert('Unit added.');
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const addCommodity = async () => {
    if (!newCommodity.name.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/admin/commodities', {
        method: 'POST',
        body: JSON.stringify({
          name: newCommodity.name.trim(),
          mineralType: newCommodity.mineralType,
          defaultUnitId: newCommodity.defaultUnitId || null,
          formTemplateCode: newCommodity.formTemplateCode.trim() || null,
          category: newCommodity.category?.trim() || null
        })
      });
      setNewCommodity({ name: '', mineralType: 'METALLIC', defaultUnitId: units[0]?.id ?? '', formTemplateCode: '', category: '' });
      await onChanged();
      alert('Commodity added.');
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const addCountry = async () => {
    if (!newCountry.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/admin/countries', { method: 'POST', body: JSON.stringify({ name: newCountry.trim() }) });
      setNewCountry('');
      await onChanged();
      alert('Country added.');
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  // ---- Edit / Delete pre-select list helpers ----
  const editPermitType = async (id: string, current: string) => {
    const name = prompt('Edit permit type name', current);
    if (!name) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/permit-types/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
      await onChanged();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const deletePermitType = async (id: string) => {
    if (!confirm('Delete this permit type?')) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/permit-types/${id}`, { method: 'DELETE' });
      await onChanged();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const editStatus = async (id: string, current: string) => {
    const name = prompt('Edit status name', current);
    if (!name) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/statuses/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
      await onChanged();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteStatus = async (id: string) => {
    if (!confirm('Delete this status?')) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/statuses/${id}`, { method: 'DELETE' });
      await onChanged();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const editUnit = async (id: string, currentName: string, currentSymbol?: string | null) => {
    const name = prompt('Edit unit name', currentName);
    if (!name) return;
    const symbol = prompt('Edit unit symbol', currentSymbol ?? '') ?? '';
    setBusy(true);
    try {
      await apiFetch(`/admin/units/${id}`, { method: 'PUT', body: JSON.stringify({ name, symbol: symbol || null }) });
      await onChanged();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteUnit = async (id: string) => {
    if (!confirm('Delete this unit?')) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/units/${id}`, { method: 'DELETE' });
      await onChanged();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const editCommodity = async (id: string, currentName: string) => {
    const name = prompt('Edit commodity name', currentName);
    if (!name) return;
    const category = prompt('Edit commodity category (optional)', '') ?? '';
    setBusy(true);
    try {
      await apiFetch(`/admin/commodities/${id}`, { method: 'PUT', body: JSON.stringify({ name, category: category.trim() || null }) });
      await onChanged();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteCommodity = async (id: string) => {
    if (!confirm('Delete this commodity?')) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/commodities/${id}`, { method: 'DELETE' });
      await onChanged();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const editCountry = async (id: string, currentName: string) => {
    const name = prompt('Edit country name', currentName);
    if (!name) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/countries/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
      await onChanged();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteCountry = async (id: string) => {
    if (!confirm('Delete this country?')) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/countries/${id}`, { method: 'DELETE' });
      await onChanged();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  // -------------------- PERMISSIONS --------------------
  const groupedPerms = useMemo(() => {
    const map = new Map<string, ReportPermission[]>();
    permissions.forEach((p) => {
      const key = p.role;
      map.set(key, [...(map.get(key) ?? []), p]);
    });
    map.forEach((arr, key) => arr.sort((a, b) => a.reportType.localeCompare(b.reportType)));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  // Permission add/remove UI state
  const reportTypes = Object.keys(REPORT_TITLES) as ReportType[];
  const [newPermRole, setNewPermRole] = useState<UserRole>(USER_ROLES[0]);
  const [newPermType, setNewPermType] = useState<ReportType>(reportTypes[0]);
  const [newPermCanView, setNewPermCanView] = useState(true);

  const addPerm = async () => {
    setBusy(true);
    try {
      await apiFetch('/admin/report-permissions', {
        method: 'PUT',
        body: JSON.stringify({ role: newPermRole, reportType: newPermType, canView: newPermCanView })
      });
      await loadAdminData();
      alert('Permission saved.');
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const deletePerm = async (role: string, reportType: string) => {
    if (!confirm('Delete this permission entry?')) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/report-permissions/${role}/${reportType}`, { method: 'DELETE' });
      await loadAdminData();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const togglePerm = async (perm: ReportPermission) => {
    setBusy(true);
    try {
      await apiFetch('/admin/report-permissions', {
        method: 'PUT',
        body: JSON.stringify({ role: perm.role, reportType: perm.reportType, canView: !perm.canView })
      });
      await loadAdminData();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  // -------------------- REGIONS --------------------
  const saveRegion = async (r: RegionConfig) => {
    setBusy(true);
    try {
      await apiFetch(`/admin/regions/${r.regionCode}`, {
        method: 'PUT',
        body: JSON.stringify({ idPrefix: r.idPrefix, nextSequence: r.nextSequence, name: r.name })
      });
      await loadAdminData();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-xl">
          <UserCog size={18} />
          <span className="font-bold">Admin Panel</span>
        </div>
        <div className="text-sm text-slate-600">Manage users, pre-selected lists, permissions, and region ID prefixes.</div>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-50 text-red-700 border border-red-200">{error}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap gap-2">
        {([
          { key: 'USERS', label: 'Users' },
          { key: 'LISTS', label: 'Pre-select Lists' },
          { key: 'PERMISSIONS', label: 'Report Permissions' },
          { key: 'REGIONS', label: 'Region ID Prefixes' }
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setSection(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border ${section === t.key ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* USERS */}
      {section === 'USERS' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="font-bold text-slate-800 mb-4">Create User</div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <input className="p-2.5 border border-slate-200 rounded-lg" placeholder="Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              <input className="p-2.5 border border-slate-200 rounded-lg" placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              <input className="p-2.5 border border-slate-200 rounded-lg" placeholder="Username" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
              <select className="p-2.5 border border-slate-200 rounded-lg" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}>
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <input
                className="p-2.5 border border-slate-200 rounded-lg"
                placeholder="Region Code (for Regional Economist)"
                value={newUser.regionCode}
                onChange={(e) => setNewUser({ ...newUser, regionCode: e.target.value })}
                disabled={newUser.role !== 'REGIONAL_ECONOMIST'}
              />
              <input
                className="p-2.5 border border-slate-200 rounded-lg"
                placeholder="Password (optional)"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </div>
            <div className="mt-4">
              <button
                disabled={busy}
                onClick={createUser}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus size={16} /> Add User
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 font-bold text-slate-800">Users</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-600">Name</th>
                    <th className="text-left p-3 font-semibold text-slate-600">Username</th>
                    <th className="text-left p-3 font-semibold text-slate-600">Role</th>
                    <th className="text-left p-3 font-semibold text-slate-600">Region Code</th>
                    <th className="text-left p-3 font-semibold text-slate-600">Status</th>
                    <th className="text-left p-3 font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100">
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{u.name}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td className="p-3 font-mono text-xs">{u.username}</td>
                      <td className="p-3">
                        <select
                          className="p-2 border border-slate-200 rounded-lg"
                          value={u.role}
                          onChange={(e) => updateUser(u.id, { role: e.target.value as UserRole })}
                        >
                          {USER_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        <input
                          className="p-2 border border-slate-200 rounded-lg"
                          value={u.regionCode ?? ''}
                          onChange={(e) => updateUser(u.id, { regionCode: e.target.value })}
                          disabled={u.role !== 'REGIONAL_ECONOMIST'}
                        />
                      </td>
                      <td className="p-3">{u.isActive ? 'Active' : 'Inactive'}</td>
                      <td className="p-3">
                        {u.isActive ? (
                          <button
                            disabled={busy}
                            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            onClick={() => deactivateUser(u.id)}
                          >
                            <Trash2 size={14} /> Deactivate
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {users.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-slate-500" colSpan={6}>
                        No users.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* LISTS */}
      {section === 'LISTS' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 lg:col-span-2">
            <div className="font-bold text-slate-800">Bulk Enroll Contractors</div>
            <div className="text-sm text-slate-600">
              Upload a CSV or XLSX file to create multiple contractors in one go. Use the template headers exactly.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="px-4 py-2 bg-slate-700 text-white font-semibold rounded-xl" disabled={busy} onClick={() => downloadBulkTemplate('csv')}>
                Download CSV Template
              </button>
              <button className="px-4 py-2 bg-slate-700 text-white font-semibold rounded-xl" disabled={busy} onClick={() => downloadBulkTemplate('xlsx')}>
                Download Excel Template
              </button>
              <button className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-xl" disabled={busy} onClick={() => downloadBulkTemplate('csv', true)}>
                Download CSV Sample
              </button>
              <button className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-xl" disabled={busy} onClick={() => downloadBulkTemplate('xlsx', true)}>
                Download Excel Sample
              </button>
              <input
                type="file"
                accept=".csv,.xlsx"
                className="p-2.5 border border-slate-200 rounded-lg"
                onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
              />
              <button className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl disabled:opacity-50" disabled={busy || !bulkFile} onClick={uploadBulkContractors}>
                Upload & Enroll
              </button>
            </div>
            <div className="text-xs text-slate-500">
              Required headers: name, tin, operatorName, contactNo, email, regionCode, regionName, provinceCode, provinceName, municipalityCode,
              municipalityName, areaHectare, status, commodities.
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="font-bold text-slate-800">Permit Types</div>
            <div className="flex gap-2">
              <input className="flex-1 p-2.5 border border-slate-200 rounded-lg" placeholder="New permit type" value={newPermitType} onChange={(e) => setNewPermitType(e.target.value)} />
              <button className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl" disabled={busy} onClick={addPermitType}>
                Add
              </button>
            </div>
            <div className="text-sm text-slate-700">
              {permitTypes.map((p) => (
                <div key={p.id} className="flex items-center gap-2 py-1">
                  <span className="flex-1">{p.name}</span>
                  <button className="text-sm text-blue-600" onClick={() => editPermitType(p.id, p.name)} disabled={busy}>
                    Edit
                  </button>
                  <button className="text-sm text-red-600 ml-2" onClick={() => deletePermitType(p.id)} disabled={busy}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="font-bold text-slate-800">Contractor Status</div>
            <div className="flex gap-2">
              <input className="flex-1 p-2.5 border border-slate-200 rounded-lg" placeholder="New status" value={newStatus} onChange={(e) => setNewStatus(e.target.value)} />
              <button className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl" disabled={busy} onClick={addStatus}>
                Add
              </button>
            </div>
            <div className="text-sm text-slate-700">
              {statuses.map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-1">
                  <span className="flex-1">{s.name}</span>
                  <button className="text-sm text-blue-600" onClick={() => editStatus(s.id, s.name)} disabled={busy}>
                    Edit
                  </button>
                  <button className="text-sm text-red-600 ml-2" onClick={() => deleteStatus(s.id)} disabled={busy}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="font-bold text-slate-800">Units</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input className="p-2.5 border border-slate-200 rounded-lg" placeholder="Name" value={newUnit.name} onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })} />
              <input className="p-2.5 border border-slate-200 rounded-lg" placeholder="Symbol" value={newUnit.symbol} onChange={(e) => setNewUnit({ ...newUnit, symbol: e.target.value })} />
              <button className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl" disabled={busy} onClick={addUnit}>
                Add
              </button>
            </div>
            <div className="text-sm text-slate-700">
              {units.map((u) => (
                <div key={u.id} className="flex items-center gap-2 py-1">
                  <span className="flex-1">{u.name} {u.symbol ? `(${u.symbol})` : ''}</span>
                  <button className="text-sm text-blue-600" onClick={() => editUnit(u.id, u.name, u.symbol)} disabled={busy}>
                    Edit
                  </button>
                  <button className="text-sm text-red-600 ml-2" onClick={() => deleteUnit(u.id)} disabled={busy}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="font-bold text-slate-800">Commodities</div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <input className="p-2.5 border border-slate-200 rounded-lg md:col-span-2" placeholder="Name" value={newCommodity.name} onChange={(e) => setNewCommodity({ ...newCommodity, name: e.target.value })} />
              <select className="p-2.5 border border-slate-200 rounded-lg" value={newCommodity.mineralType} onChange={(e) => setNewCommodity({ ...newCommodity, mineralType: e.target.value as any })}>
                <option value="METALLIC">METALLIC</option>
                <option value="NON_METALLIC">NON_METALLIC</option>
              </select>
              <select className="p-2.5 border border-slate-200 rounded-lg" value={newCommodity.defaultUnitId} onChange={(e) => setNewCommodity({ ...newCommodity, defaultUnitId: e.target.value })}>
                <option value="">(no unit)</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <input className="p-2.5 border border-slate-200 rounded-lg" placeholder="Form code (e.g. MGB29-01)" value={newCommodity.formTemplateCode} onChange={(e) => setNewCommodity({ ...newCommodity, formTemplateCode: e.target.value })} />
              <input className="p-2.5 border border-slate-200 rounded-lg" placeholder="Category (e.g. Cement, Metallic)" value={newCommodity.category} onChange={(e) => setNewCommodity({ ...newCommodity, category: e.target.value })} />
            </div>
            <div className="mt-3">
              <button className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl" disabled={busy} onClick={addCommodity}>
                Add Commodity
              </button>
            </div>
            <div className="text-sm text-slate-700">
              {commodities.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1">
                  <span className="flex-1">{c.name} ({c.mineralType}) {c.category ? <span className="text-xs text-slate-500">· {c.category}</span> : null}</span>
                  <button className="text-sm text-blue-600" onClick={() => editCommodity(c.id, c.name)} disabled={busy}>
                    Edit
                  </button>
                  <button className="text-sm text-red-600 ml-2" onClick={() => deleteCommodity(c.id)} disabled={busy}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="font-bold text-slate-800">Countries</div>
            <div className="flex gap-2">
              <input className="flex-1 p-2.5 border border-slate-200 rounded-lg" placeholder="New country" value={newCountry} onChange={(e) => setNewCountry(e.target.value)} />
              <button className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl" disabled={busy} onClick={addCountry}>
                Add
              </button>
            </div>
            <div className="text-sm text-slate-700">
              {countries.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1">
                  <span className="flex-1">{c.name}</span>
                  <button className="text-sm text-blue-600" onClick={() => editCountry(c.id, c.name)} disabled={busy}>
                    Edit
                  </button>
                  <button className="text-sm text-red-600 ml-2" onClick={() => deleteCountry(c.id)} disabled={busy}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PERMISSIONS */}
      {section === 'PERMISSIONS' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 font-bold text-slate-800">Role → Report Permissions</div>
          <div className="p-4 text-xs text-slate-500">Tip: use this to control what a Guest can generate.</div>
          <div className="divide-y divide-slate-200">
            {groupedPerms.map(([role, perms]) => (
              <div key={role} className="p-4">
                <div className="font-bold text-slate-800 mb-2">{role}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {perms.map((p) => (
                    <div key={p.id} className="relative">
                      <button
                        disabled={busy}
                        onClick={() => togglePerm(p)}
                        className={`w-full p-3 rounded-xl border text-left ${p.canView ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'} disabled:opacity-50`}
                      >
                        <div className="text-sm font-semibold text-slate-800">{p.reportType}</div>
                        <div className="text-xs text-slate-500">{p.canView ? 'Allowed' : 'Blocked'}</div>
                      </button>
                      <button
                        title="Delete permission"
                        className="absolute top-1 right-1 p-1 rounded-md text-red-600 hover:bg-red-50"
                        onClick={() => deletePerm(p.role, p.reportType)}
                        disabled={busy}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add permission form */}
      {section === 'PERMISSIONS' && (
        <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-4">
          <div className="font-bold mb-2">Add / Update Permission</div>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="p-2 border border-slate-200 rounded-lg" value={newPermRole} onChange={(e) => setNewPermRole(e.target.value as UserRole)}>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select className="p-2 border border-slate-200 rounded-lg" value={newPermType} onChange={(e) => setNewPermType(e.target.value as ReportType)}>
              {reportTypes.map((rt) => (
                <option key={rt} value={rt}>
                  {REPORT_TITLES[rt]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={newPermCanView} onChange={(e) => setNewPermCanView(e.target.checked)} /> Can View
            </label>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-xl" disabled={busy} onClick={addPerm}>
              Save Permission
            </button>
          </div>
        </div>
      )}

      {/* REGIONS */}
      {section === 'REGIONS' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 font-bold text-slate-800">Region Contractor ID Prefix</div>
          <div className="p-4 text-xs text-slate-500">
            Used when Central Office verifies a contractor. Example: <span className="font-mono">R2-001</span>.
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-3 font-semibold text-slate-600">Region Code</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Name</th>
                  <th className="text-left p-3 font-semibold text-slate-600">ID Prefix</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Next Seq</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <tr key={r.regionCode} className="border-b border-slate-100">
                    <td className="p-3 font-mono text-xs">{r.regionCode}</td>
                    <td className="p-3">
                      <input
                        className="p-2 border border-slate-200 rounded-lg w-full"
                        value={r.name}
                        onChange={(e) => {
                          setRegions((prev) => prev.map((x) => (x.regionCode === r.regionCode ? { ...x, name: e.target.value } : x)));
                        }}
                      />
                    </td>
                    <td className="p-3">
                      <input
                        className="p-2 border border-slate-200 rounded-lg w-28"
                        value={r.idPrefix}
                        onChange={(e) => {
                          setRegions((prev) => prev.map((x) => (x.regionCode === r.regionCode ? { ...x, idPrefix: e.target.value } : x)));
                        }}
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        className="p-2 border border-slate-200 rounded-lg w-28"
                        value={r.nextSequence}
                        onChange={(e) => {
                          setRegions((prev) => prev.map((x) => (x.regionCode === r.regionCode ? { ...x, nextSequence: Number(e.target.value) } : x)));
                        }}
                      />
                    </td>
                    <td className="p-3">
                      <button
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
                        disabled={busy}
                        onClick={() => saveRegion(r)}
                      >
                        Save
                      </button>
                      <button
                        className="ml-2 px-3 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700"
                        disabled={busy}
                        onClick={async () => {
                          if (!confirm('Delete this region config?')) return;
                          setBusy(true);
                          try {
                            await apiFetch(`/admin/regions/${r.regionCode}`, { method: 'DELETE' });
                            await loadAdminData();
                          } catch (e: any) {
                            alert(e?.message ?? 'Failed');
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {regions.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-slate-500" colSpan={5}>
                      No region configs yet. A config is created automatically the first time a contractor from that region is verified.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
