import React, { useState } from 'react';
import type { UserRole, User } from '../types';
import { ShieldCheck, Building2, Globe, Lock, AtSign, AlertCircle, User as UserIcon } from 'lucide-react';
import { login, setToken } from '../api';
import SuccessToast from './SuccessToast';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const handleFormLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(usernameOrEmail, password);
      setToken(result.token);
      setSuccess('Signed in successfully.');
      setTimeout(() => onLogin(result.user), 450);
    } catch (err: any) {
      setError(err?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (username: string) => {
    setError('');
    setLoading(true);
    try {
      const result = await login(username, 'password');
      setToken(result.token);
      setSuccess('Signed in successfully.');
      setTimeout(() => onLogin(result.user), 450);
    } catch (err: any) {
      setError(err?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const quickRoles: Array<{ label: string; user: string; role: UserRole | string; icon: any; color: string }> = [
    { role: 'ADMIN', label: 'Admin', user: 'admin', icon: ShieldCheck, color: 'bg-indigo-600' },
    { role: 'CENTRAL_OFFICE', label: 'Central', user: 'central', icon: Building2, color: 'bg-blue-600' },
    { role: 'REGIONAL_ECONOMIST', label: 'Regional', user: 'regional', icon: Globe, color: 'bg-emerald-600' },
    { role: 'GUEST', label: 'Guest', user: 'guest', icon: UserIcon, color: 'bg-slate-600' }
  ];

  return (
    <>
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden p-8">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-4">
            <ShieldCheck className="text-blue-600" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">eSRS Portal</h1>
          <p className="text-slate-500 text-sm mt-1 italic">Electronic Statistical Reporting System</p>
          <div className="h-px w-20 bg-blue-500 mx-auto mt-6"></div>
        </div>

        <form onSubmit={handleFormLogin} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-top-1">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Username or Email</label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                required
                type="text"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                placeholder="Enter your username"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                required
                type="password"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Sign In to Portal'}
          </button>
        </form>

        <div className="mt-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="h-px flex-1 bg-slate-100"></span>
            Demo Quick Access
            <span className="h-px flex-1 bg-slate-100"></span>
          </p>
          <div className="grid grid-cols-4 gap-2">
            {quickRoles.map((item) => (
              <button
                key={item.user}
                type="button"
                onClick={() => handleQuickLogin(item.user)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all group"
              >
                <div className={`w-8 h-8 rounded-lg ${item.color} flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform`}>
                  <item.icon size={16} />
                </div>
                <span className="text-[10px] font-bold text-slate-500 text-center leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-8 text-center text-[10px] text-slate-400 leading-relaxed uppercase tracking-tighter">
          Republic of the Philippines<br />
          Department of Environment and Natural Resources<br />
          <strong>MINES AND GEOSCIENCES BUREAU</strong>
        </p>
        </div>
      </div>
      <SuccessToast open={!!success} message={success} onClose={() => setSuccess('')} />
    </>
  );
};

export default Login;
