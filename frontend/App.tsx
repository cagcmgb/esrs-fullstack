import React, { useEffect, useState } from 'react';

import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Contractors from './components/Contractors';
import DataEntry from './components/DataEntry';
import Reports from './components/Reports';
import Admin from './components/Admin';

import { apiFetch, getMe, setToken } from './api';
import type {
  User,
  PermitType,
  ContractorStatus,
  Commodity,
  Unit,
  Contractor,
  Submission,
  ReportPermission,
  DashboardSummary
} from './types';

type SettingsPayload = {
  permitTypes: PermitType[];
  statuses: ContractorStatus[];
  commodities: Commodity[];
  units: Unit[];
  reportPermissions: ReportPermission[];
  countries?: { id: string; name: string }[];
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState<SettingsPayload>({
    permitTypes: [],
    statuses: [],
    commodities: [],
    units: [],
    reportPermissions: []
  });

  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  const refreshSettings = async () => {
    const s = await apiFetch<SettingsPayload>('/settings');
    setSettings(s);
  };

  const refreshContractors = async () => {
    const list = await apiFetch<Contractor[]>('/contractors');
    setContractors(list);
  };

  const refreshSubmissions = async () => {
    const list = await apiFetch<Submission[]>('/submissions');
    setSubmissions(list);
  };

  const refreshDashboard = async () => {
    const y = new Date().getFullYear();
    const s = await apiFetch<DashboardSummary>(`/dashboard/summary?year=${y}`);
    setSummary(s);
  };

  const bootstrap = async () => {
    setLoading(true);
    try {
      const me = await getMe();
      setUser(me);
      await Promise.all([refreshSettings(), refreshContractors(), refreshSubmissions(), refreshDashboard()]);
    } catch (e) {
      // No valid session
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (me: User) => {
    setUser(me);
    await Promise.all([refreshSettings(), refreshContractors(), refreshSubmissions(), refreshDashboard()]);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setActiveTab('Dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Layout user={user} activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout}>
      {activeTab === 'Dashboard' && <Dashboard contractors={contractors} summary={summary} />}

      {activeTab === 'Contractors' && (
        <Contractors
          user={user}
          contractors={contractors}
          permitTypes={settings.permitTypes}
          statuses={settings.statuses}
          commodities={settings.commodities}
          onChanged={async () => {
            await refreshContractors();
            await refreshDashboard();
          }}
        />
      )}

      {activeTab === 'Data Entry' && (
        <DataEntry
          user={user}
          contractors={contractors.filter((c) => c.isVerified)}
          commodities={settings.commodities}
          submissions={submissions}
          countries={settings.countries ?? []}
          onChanged={async () => {
            await refreshSubmissions();
            await refreshDashboard();
          }}
        />
      )}

      {activeTab === 'Reports' && (
        <Reports
          user={user}
          reportPermissions={settings.reportPermissions}
          contractors={contractors}
          commodities={settings.commodities}
          submissions={submissions}
          onChanged={async () => {
            await refreshSubmissions();
            await refreshContractors();
            await refreshDashboard();
          }}
        />
      )}

      {activeTab === 'Admin' && (
        <Admin
          user={user}
          permitTypes={settings.permitTypes}
          statuses={settings.statuses}
          commodities={settings.commodities}
          units={settings.units}
          countries={settings.countries ?? []}
          reportPermissions={settings.reportPermissions}
          onChanged={async () => {
            await refreshSettings();
          }}
        />
      )}
    </Layout>
  );
};

export default App;
