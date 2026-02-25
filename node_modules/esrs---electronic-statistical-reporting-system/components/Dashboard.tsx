import React from 'react';
import type { Contractor, DashboardSummary } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { Users, FileCheck2, TrendingUp, Globe2 } from 'lucide-react';

interface DashboardProps {
  contractors: Contractor[];
  summary: DashboardSummary | null;
}

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function getMineralTypeBucket(c: Contractor): 'Metallic' | 'Non-Metallic' | 'Both' {
  const types = new Set(c.contractorCommodities.map((cc) => cc.commodity.mineralType));
  if (types.has('METALLIC') && types.has('NON_METALLIC')) return 'Both';
  if (types.has('METALLIC')) return 'Metallic';
  return 'Non-Metallic';
}

const Dashboard: React.FC<DashboardProps> = ({ contractors, summary }) => {
  const regions = Array.from(new Set(contractors.map((c) => c.regionName)));

  const regionData = regions.map((reg) => ({
    name: reg,
    count: contractors.filter((c) => c.regionName === reg).length
  }));

  const mineralData = [
    { name: 'Metallic', value: contractors.filter((c) => getMineralTypeBucket(c) === 'Metallic').length },
    { name: 'Non-Metallic', value: contractors.filter((c) => getMineralTypeBucket(c) === 'Non-Metallic').length },
    { name: 'Both', value: contractors.filter((c) => getMineralTypeBucket(c) === 'Both').length }
  ];

  const stats = [
    { label: 'Total Contractors', value: summary?.contractors.total ?? contractors.length, icon: Users, color: 'bg-blue-500' },
    { label: 'Verified', value: summary?.contractors.verified ?? contractors.filter((c) => c.isVerified).length, icon: FileCheck2, color: 'bg-emerald-500' },
    { label: 'Reports (This Year)', value: summary?.submissions.total ?? 0, icon: TrendingUp, color: 'bg-amber-500' },
    { label: 'Regions Active', value: regions.length, icon: Globe2, color: 'bg-indigo-500' }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${stat.color} text-white`}>
                <stat.icon size={24} />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Live</span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium">{stat.label}</h3>
            <p className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Contractors per Region</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Mineral Distribution</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={mineralData} cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={8} dataKey="value">
                  {mineralData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-indigo-900 text-white p-8 rounded-3xl relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-2xl font-bold mb-2">Digitization Progress</h2>
          <p className="text-indigo-200 max-w-xl">
            The eSRS system is designed to support monthly statistical reporting (MGB Form 29 series) through digital submission, validation, and centralized storage.
          </p>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Globe2 size={200} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
