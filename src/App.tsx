import { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { 
  Brain, Send, History, AlertCircle, Database, RefreshCw, 
  Smile, User, Settings, ShieldCheck, ChevronRight, LayoutDashboard,
  Zap, Activity, Lock, Globe, Bell, Share2, Download, Trash2, Heart, Frown, Meh, BarChart3, X, Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MemoryGraph } from './components/MemoryGraph';
import { DocModal } from './components/DocModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
}

export default function App() {
  const [user, setUser] = useState<{ id: string; username: string } | null>(() => {
    const saved = localStorage.getItem('persona_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('persona_token'));
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(!localStorage.getItem('persona_token'));
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [personaTimeline, setPersonaTimeline] = useState<any[]>([]);
  const [memories, setMemories] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [driftStatus, setDriftStatus] = useState<any>(null);
  const [dbStats, setDbStats] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat' | 'persona' | 'memories' | 'graph' | 'analytics' | 'sync' | 'engine'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDocModal, setShowDocModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (token) {
      fetchPersonaHistory();
      fetchMemories();
      fetchInsights();
      fetchDrift();
      fetchDbStats();
    }
  }, [token]);

  useEffect(() => {
    if (!token || !user) {
      bootstrapDemoSession();
    } else {
      setIsBootstrapping(false);
      setBootstrapError(null);
    }
  }, []);

  const handleLogin = (newToken: string, userData: { id: string; username: string }) => {
    localStorage.setItem('persona_token', newToken);
    localStorage.setItem('persona_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    setIsBootstrapping(false);
    setBootstrapError(null);
  };

  const bootstrapDemoSession = async () => {
    try {
      setIsBootstrapping(true);
      const res = await fetch('/api/auth/bootstrap', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to bootstrap demo session');
      }

      handleLogin(data.token, data.user);
    } catch (error) {
      console.error(error);
      setBootstrapError(error instanceof Error ? error.message : 'Failed to prepare demo session');
      setIsBootstrapping(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('persona_token');
    localStorage.removeItem('persona_user');
    setToken(null);
    setUser(null);
    setMessages([]);
    setMemories([]);
    await bootstrapDemoSession();
  };

  const fetchDbStats = async () => {
    try {
      const res = await fetch('/api/admin/db-stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) return handleLogout();
      const data = await res.json();
      setDbStats(data);
    } catch (e) { console.error(e); }
  };

  const fetchDrift = async () => {
    try {
      const res = await fetch(`/api/persona/drift`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) return handleLogout();
      const data = await res.json();
      setDriftStatus(data);
    } catch (e) { console.error(e); }
  };

  const fetchInsights = async () => {
    try {
      const res = await fetch(`/api/insights`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setInsights(data.insights || []);
    } catch (e) { console.error(e); }
  };

  const fetchPersonaHistory = async () => {
    try {
      const res = await fetch(`/api/persona/seed`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setPersonaTimeline(data);
    } catch (e) { console.error(e); }
  };

  const fetchMemories = async (query: string = '') => {
    try {
      const res = await fetch(`/api/memories?query=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setMemories(data);
    } catch (e) { console.error(e); }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text: input })
      });
      
      if (res.status === 401 || res.status === 403) return handleLogout();

      const data = await res.json();
      
      // Handle server errors gracefully with a meaningful message
      if (!res.ok || data.error) {
        const errMsg: Message = {
          role: 'assistant',
          content: `System Notice: ${data.error || 'The cognitive engine encountered an error. Please try again in a moment.'}`,
          metadata: data
        };
        setMessages(prev => [...prev, errMsg]);
        return;
      }
      
      const assistantMsg: Message = { 
        role: 'assistant', 
        content: data.adaptiveResponse || `Processed. Intent: ${data.intent?.intent || 'unknown'} (${Math.round((data.intent?.confidence || 0) * 100)}% confidence)`,
        metadata: data
      };
      
      setMessages(prev => [...prev, assistantMsg]);
      fetchMemories();
      fetchPersonaHistory();
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
      fetchDrift();
    }
  };

  const handleMemoryFeedback = async (memoryId: string, feedback: 'relevant' | 'incorrect') => {
    await fetch('/api/memories/feedback', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ memoryId, feedback })
    });
    fetchMemories();
  };

  if (isBootstrapping) {
    return (
      <div className="min-h-screen w-full bg-[#08090d] text-slate-200 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
            <Brain className="w-7 h-7 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <p className="text-white font-bold text-lg">Loading Workspace</p>
            <p className="text-slate-400 text-sm">Preparing your local demo session...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <div className="min-h-screen w-full bg-[#08090d] text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-8 text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-rose-400" />
          </div>
          <div className="space-y-2">
            <p className="text-white font-bold text-xl">Workspace not ready</p>
            <p className="text-slate-400 text-sm">
              {bootstrapError || 'The demo session could not be created.'}
            </p>
          </div>
          <button
            onClick={bootstrapDemoSession}
            className="w-full py-3 rounded-xl bg-indigo-500 text-white font-bold hover:bg-indigo-600 transition-colors"
          >
            Retry demo session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-[#08090d] text-slate-200 font-sans flex flex-col md:flex-row relative overflow-hidden">
      {/* Cinematic Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[160px] rounded-full mesh-orb"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-blue-600/5 blur-[180px] rounded-full mesh-orb" style={{ animationDelay: '-5s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay"></div>
      </div>

      {/* Mobile Overlay Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Floating Sidebar */}
      <aside className={cn(
        "fixed md:relative z-50 md:z-30 w-72 h-full p-6 flex flex-col gap-8 border-r border-white/5 backdrop-blur-3xl bg-[#08090d]/95 md:bg-black/20 transition-transform duration-300 ease-in-out",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500 blur-lg opacity-40 animate-pulse"></div>
              <div className="relative w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-2xl">
                <Brain className="w-7 h-7" />
              </div>
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-white">Persona AI</h1>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                <p className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase">System Online</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-2 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1.5">
          {[
            { id: 'dashboard', label: 'Neural Desktop', icon: LayoutDashboard },
            { id: 'chat', label: 'Active Memory', icon: Zap },
            { id: 'persona', label: 'Persona Evolution', icon: Activity },
            { id: 'memories', label: 'Semantic Vault', icon: Database },
            { id: 'graph', label: 'Memory Map', icon: Share2 },
            { id: 'engine', label: 'Engine Storage', icon: LayoutDashboard },
            { id: 'analytics', label: 'Emotion Pulse', icon: BarChart3 },
            { id: 'sync', label: 'Cognitive Sync', icon: Globe },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); setSidebarOpen(false); }}
              className={cn(
                "group relative flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-500",
                activeTab === tab.id 
                  ? "bg-white/5 text-white shadow-[0_4px_20px_rgba(0,0,0,0.3)] border border-white/10" 
                  : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.02]"
              )}
            >
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="active-pill"
                  className="absolute left-0 w-1 h-6 bg-indigo-500 rounded-full"
                />
              )}
              <tab.icon className={cn("w-5 h-5 transition-transform duration-500 group-hover:scale-110", activeTab === tab.id ? "text-indigo-400" : "text-current")} />
              <span className="text-sm font-semibold tracking-wide">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/5 to-transparent border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-indigo-500/10 rounded-lg">
                <Lock className="w-4 h-4 text-indigo-400" />
              </div>
              <p className="text-xs font-bold text-white/80">Offline Security</p>
            </div>
            <div className="space-y-2">
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 w-[88%] rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
              </div>
              <p className="text-[10px] text-white/40 font-medium">Local-First Encryption Active</p>
            </div>
          </div>
          
          <button className="w-full flex items-center justify-between px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-white/60 hover:bg-white/10 hover:text-white transition-all group">
            <div className="flex items-center gap-3">
              <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
              <span className="text-xs font-bold uppercase tracking-widest">Settings</span>
            </div>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="relative z-10 flex-1 flex flex-col h-screen overflow-hidden">
        {/* Futuristic Header */}
        <header className="h-16 md:h-20 border-b border-white/5 flex items-center justify-between px-4 md:px-10 shrink-0 backdrop-blur-md bg-black/10">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 text-white/60 hover:text-white transition-colors mr-2"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-indigo-400/60">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Platform</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">{activeTab}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-white/40 hover:text-white transition-colors cursor-pointer relative">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full border-2 border-[#08090d]"></span>
            </div>
            
            <div className="h-8 w-px bg-white/5 mx-2"></div>
            
            <div className="flex items-center gap-3 group cursor-pointer" onClick={handleLogout}>
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-white group-hover:text-rose-400 transition-colors">{user.username}</p>
                <p className="text-[10px] font-mono text-white/40">Logout Session</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-rose-500/50 transition-all overflow-hidden relative">
                <User className="w-5 h-5 text-white/40 group-hover:text-rose-500" />
                <div className="absolute inset-0 bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto custom-scrollbar relative">
          <AnimatePresence mode="wait">
            {activeTab === 'engine' && (
              <motion.div
                key="engine"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="p-4 md:p-10 max-w-7xl mx-auto w-full space-y-6 md:space-y-8"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-white mb-2">Cognitive Storage Engine</h1>
                    <p className="text-slate-400 font-medium text-sm md:text-base">SQLite-based long-term memory optimization and state management.</p>
                  </div>
                  <button 
                    onClick={async () => {
                      await fetch(`/api/memories/seed`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      fetchMemories();
                      fetchDbStats();
                    }}
                    className="px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 font-bold hover:bg-emerald-500/20 transition-all flex items-center gap-2"
                  >
                    <Database className="w-4 h-4" />
                    Seed Dataset
                  </button>
                  <button 
                    onClick={async () => {
                      await fetch('/api/admin/db-cleanup', { 
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      fetchDbStats();
                    }}
                    className="px-6 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 font-bold hover:bg-indigo-500/20 transition-all flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Optimize Storage
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'Memories (SQLite)', val: dbStats?.memories || 0, icon: History, sub: 'Indexed vectors' },
                    { label: 'Persona History', val: dbStats?.persona || 0, icon: User, sub: 'Evolution logs' },
                    { label: 'Feedback Loop', val: dbStats?.feedback || 0, icon: Activity, sub: 'Relevance logs' },
                    { label: 'Intent Logs', val: dbStats?.intent || 0, icon: Zap, sub: 'Router telemetry' }
                  ].map((stat, i) => (
                    <div key={i} className="p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-white/20 transition-all">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-indigo-500/10 rounded-lg">
                          <stat.icon className="w-4 h-4 text-indigo-400" />
                        </div>
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{stat.label}</span>
                      </div>
                      <p className="text-3xl font-black text-white mb-1">{stat.val}</p>
                      <p className="text-[10px] font-medium text-white/30 uppercase tracking-widest leading-relaxed">{stat.sub}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="flex-1 p-8 rounded-3xl bg-white/5 border border-white/10 space-y-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                       <ShieldCheck className="w-5 h-5 text-indigo-400" />
                       Engine Integrity
                    </h2>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-4 rounded-2xl bg-white/5 border border-white/5">
                        <div>
                          <p className="text-sm font-bold text-white">Database Engine</p>
                          <p className="text-xs text-white/40 font-mono">better-sqlite3 @ 12.10.0</p>
                        </div>
                        <div className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-[10px] font-bold">STABLE</div>
                      </div>
                      <div className="flex justify-between items-center p-4 rounded-2xl bg-white/5 border border-white/5">
                        <div>
                          <p className="text-sm font-bold text-white">Filesystem Path</p>
                          <p className="text-xs text-white/40 font-mono">./adaptive_memory.db</p>
                        </div>
                        <div className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg text-[10px] font-bold tracking-widest uppercase">READ_WRITE</div>
                      </div>
                    </div>
                  </div>

                  <div className="w-full lg:w-80 p-6 md:p-8 rounded-3xl bg-white/5 border border-white/10 space-y-6">
                    <h2 className="text-xl font-bold text-white">Pruning Policy</h2>
                    <p className="text-xs text-white/40 leading-relaxed font-medium">Sensory memories with importance below 0.3 are automatically pruned after 24 hours to maintain cognitive efficiency.</p>
                    <div className="pt-4 border-t border-white/5">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
                           <span>Retention Rate</span>
                           <span className="text-indigo-400">88%</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                           <div className="h-full bg-indigo-500 w-[88%] rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                        </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="p-4 md:p-10 max-w-7xl mx-auto w-full space-y-6 md:space-y-10 pb-20"
              >
                {/* Hero Section */}
                <section className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-3xl blur opacity-10 group-hover:opacity-20 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative backdrop-blur-3xl bg-white/[0.03] border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] p-6 md:p-12 overflow-hidden">
                    <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-500/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    
                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                      <div>
                        <motion.div 
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-2 mb-6"
                        >
                          <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold tracking-[0.2em] uppercase rounded-full border border-indigo-500/20">Version 2.4.0 (Beta)</span>
                        </motion.div>
                        <h2 className="text-3xl md:text-5xl font-black text-white leading-tight mb-4 md:mb-6">
                          Neural Cognition <br />
                          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-300">Simplified.</span>
                        </h2>
                        <p className="text-slate-400 text-sm md:text-lg leading-relaxed max-w-md mb-6 md:mb-10 font-medium">
                          Experience the next generation of persona-aware memory management. Privacy-first, offline-indexed, and emotionally intelligent.
                        </p>
                        <div className="flex flex-wrap gap-4">
                          <button 
                            onClick={() => setActiveTab('chat')}
                            className="px-8 py-4 bg-indigo-500 text-white font-bold rounded-2xl hover:bg-indigo-600 shadow-xl shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-3"
                          >
                            <Zap className="w-5 h-5" />
                            <span>Initiate Protocol</span>
                          </button>
                          <button 
                            onClick={() => setShowDocModal(true)}
                            className="px-8 py-4 bg-white/5 text-white font-bold rounded-2xl hover:bg-white/10 border border-white/10 transition-all flex items-center gap-3"
                          >
                            <span className="text-indigo-400">View Documentation</span>
                          </button>
                        </div>
                      </div>

                      <div className="relative flex justify-center items-center hidden lg:flex">
                        <div className="w-64 h-64 relative">
                          <div className="absolute inset-0 bg-indigo-500 rounded-full blur-[60px] opacity-20 animate-pulse"></div>
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 border-2 border-dashed border-indigo-500/30 rounded-full"
                          />
                          <motion.div 
                            animate={{ rotate: -360 }}
                            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-4 border border-white/10 rounded-full"
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Brain className="w-20 h-20 text-indigo-400 drop-shadow-[0_0_15px_rgba(129,140,248,0.5)]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Grid Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'Semantic Nodes', val: memories.length, icon: Database, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
                    { label: 'Drift Index', val: driftStatus?.status || 'Stable', icon: Activity, color: driftStatus?.drift > 0.4 ? 'text-rose-400' : 'text-emerald-400', bg: driftStatus?.drift > 0.4 ? 'bg-rose-500/10' : 'bg-emerald-500/10' },
                    { label: 'Sync Latency', val: '12ms', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                    { label: 'Privacy Score', val: '99.9%', icon: ShieldCheck, color: 'text-purple-400', bg: 'bg-purple-500/10' }
                  ].map((stat, i) => (
                    <motion.div 
                      key={stat.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + (i * 0.1) }}
                      className="group p-6 rounded-3xl backdrop-blur-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all hover:-translate-y-1"
                    >
                      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-colors", stat.bg)}>
                        <stat.icon className={cn("w-6 h-6", stat.color)} />
                      </div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{stat.label}</p>
                      <p className="text-2xl font-black text-white">{stat.val}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Sub-grid for Real-time analysis */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-[2rem] p-8">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-xl font-bold text-white">Sentiment Trajectory</h3>
                        <p className="text-xs text-slate-500">Real-time mood extraction across sessions</p>
                      </div>
                      <div className="flex gap-2">
                        <button className="px-3 py-1 bg-white/5 rounded-lg text-[10px] font-bold text-white/60 hover:text-white transition-colors">DAILY</button>
                        <button className="px-3 py-1 bg-indigo-500/20 rounded-lg text-[10px] font-bold text-indigo-400 border border-indigo-500/20">WEEKLY</button>
                      </div>
                    </div>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={personaTimeline}>
                          <defs>
                            <linearGradient id="dashSent" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                          <XAxis dataKey="day" hide />
                          <YAxis hide />
                          <Tooltip 
                            contentStyle={{ background: 'rgba(15,15,20,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                            itemStyle={{ color: '#fff', fontSize: '10px' }}
                          />
                          <Area type="monotone" dataKey="sentiment" stroke="#6366f1" strokeWidth={3} fill="url(#dashSent)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-[2rem] p-8 flex flex-col items-center justify-center text-center">
                    <div className="w-24 h-24 mb-6 relative">
                      <svg className="w-full h-full -rotate-90">
                        <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                        <motion.circle 
                          cx="48" cy="48" r="40" fill="none" stroke="#6366f1" strokeWidth="8" 
                          strokeDasharray="251.2" 
                          initial={{ strokeDashoffset: 251.2 }}
                          animate={{ strokeDashoffset: 251.2 * (1 - 0.74) }}
                          transition={{ duration: 2, delay: 0.5 }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-black text-white">74%</span>
                      </div>
                    </div>
                    <h4 className="text-lg font-bold text-white mb-2">Neural Stability</h4>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-[180px]">
                      Your persona is currently 74% consistent with your core profile.
                    </p>
                    <button className="mt-8 text-[10px] font-bold text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-colors">
                      View Stability Report
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Active Memory (Chat) */}
            {activeTab === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="p-3 md:p-10 h-full flex flex-col gap-4 md:gap-8 max-w-5xl mx-auto w-full"
              >
                <div className="flex-1 backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden relative group">
                  <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none"></div>
                  
                  {/* Message Interface */}
                  <div className="flex-1 overflow-auto p-4 md:p-10 space-y-4 md:space-y-6 custom-scrollbar scroll-smooth">
                    {messages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-8 py-20">
                        <div className="relative">
                          <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20"></div>
                          <div className="w-24 h-24 bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border border-white/10 rounded-[2.5rem] flex items-center justify-center text-indigo-400 rotate-12">
                            <Brain className="w-12 h-12" />
                          </div>
                        </div>
                        <div className="space-y-3">
                           <h3 className="text-xl md:text-3xl font-black text-white tracking-tight">How shall we evolve today?</h3>
                           <p className="text-slate-400 max-w-lg mx-auto text-sm leading-relaxed font-medium">
                             Start by <span className="text-indigo-400 font-bold">storing a memory</span>, then <span className="text-emerald-400 font-bold">query the vault</span> to see the full RAG pipeline in action.
                           </p>
                         </div>
                         <div className="w-full max-w-xl space-y-3">
                           <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">Store memories first</p>
                           <div className="flex flex-wrap justify-center gap-2">
                             {[
                               'My sister lives in Hyderabad',
                               'My favorite language is Python',
                               'I work as an AI engineer',
                             ].map(s => (
                               <button key={s} onClick={() => setInput(s)} className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 transition-all">
                                 {s}
                               </button>
                             ))}
                           </div>
                           <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center pt-2">Then query the vault</p>
                           <div className="flex flex-wrap justify-center gap-2">
                             {[
                               'Did I mention my sister?',
                               'Do you remember my favorite language?',
                               'What do you know about my job?',
                             ].map(s => (
                               <button key={s} onClick={() => setInput(s)} className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all">
                                 {s}
                               </button>
                             ))}
                           </div>
                         </div>
                      </div>
                    )}

                    {messages.map((msg, idx) => (
                      <motion.div 
                        key={idx}
                        initial={{ opacity: 0, y: 10, x: msg.role === 'user' ? 20 : -20 }}
                        animate={{ opacity: 1, y: 0, x: 0 }}
                        className={cn(
                          "flex flex-col gap-3 max-w-[85%]",
                          msg.role === 'user' ? "self-end items-end" : "self-start items-start"
                        )}
                      >
                        <div className={cn(
                          "p-5 rounded-3xl text-sm leading-relaxed font-medium shadow-xl",
                          msg.role === 'user' 
                            ? "bg-gradient-to-br from-indigo-600 to-blue-600 text-white rounded-tr-none shadow-indigo-500/20" 
                            : "backdrop-blur-xl bg-white/10 text-slate-100 border border-white/10 rounded-tl-none"
                        )}>
                          {msg.content}
                        </div>
                        
                        {msg.metadata && msg.role === 'assistant' && (
                          <div className="flex flex-col gap-2 mt-2">
                             <div className="flex gap-2">
                               {msg.metadata.intent && (
                                 <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold text-emerald-400 uppercase tracking-widest">
                                   Confidence: {Math.round(msg.metadata.intent.confidence * 100)}%
                                 </div>
                               )}
                               {msg.metadata.intent && (
                                 <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                                   Intent: {msg.metadata.intent.intent}
                                 </div>
                               )}
                             </div>

                             {msg.metadata.intent?.intent === 'memory-store' && (
                               <motion.div 
                                 initial={{ opacity: 0, x: -10 }}
                                 animate={{ opacity: 1, x: 0 }}
                                 className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1"
                               >
                                 <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-tighter">
                                   <Database className="w-3 h-3" />
                                   Cognitive Ingestion Complete
                                 </div>
                                 <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] font-medium text-slate-400">
                                   <span>Type: Persistent Fact</span>
                                   <span className="text-right">Importance: High</span>
                                 </div>
                               </motion.div>
                             )}
                          </div>
                        )}

                        {msg.metadata?.contradiction?.contradiction && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-full p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 mt-2"
                          >
                            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1">Drift Alert: Logic Inconsistency</p>
                              <p className="text-xs text-rose-200/80 font-medium italic">
                                "{msg.metadata.contradiction.explanation}"
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                    
                    {isProcessing && (
                      <div className="flex gap-1.5 p-4 bg-white/5 rounded-2xl self-start">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                      </div>
                    )}
                  </div>
                  
                  {/* Intelligent Input */}
                  <div className="p-3 md:p-8 border-t border-white/5 bg-black/20">
                    <div className="relative group/input">
                      <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-2xl blur opacity-0 group-focus-within/input:opacity-20 transition duration-500"></div>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                          placeholder="Command your memory engine..."
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 md:py-5 pl-4 md:pl-8 pr-24 md:pr-32 text-sm md:text-base text-white shadow-2xl focus:bg-white/[0.08] focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-600"
                        />
                        <div className="absolute right-3 top-2.5 bottom-2.5 flex items-center gap-2">
                           <button className="p-3 text-slate-500 hover:text-white transition-colors">
                              <History className="w-5 h-5" />
                           </button>
                           <button 
                             onClick={handleSend}
                             disabled={isProcessing}
                             className="px-6 py-3 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 disabled:opacity-50 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all flex items-center gap-2"
                           >
                             <Send className="w-4 h-4" />
                             <span>Send</span>
                           </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Persona Evolution (Timeline) */}
            {activeTab === 'persona' && (
              <motion.div 
                key="persona"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="p-4 md:p-10 max-w-7xl mx-auto w-full space-y-6 md:space-y-10 pb-20"
              >
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                   <div>
                      <h2 className="text-4xl font-black text-white">Persona Evolution</h2>
                      <p className="text-slate-500 font-medium mt-2">Visualizing multi-modal behavioral drift over {personaTimeline.length} sessions.</p>
                   </div>
                   <div className="flex gap-4 p-2 bg-white/5 rounded-2xl border border-white/5">
                      <div className="px-6 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-3">
                         <Smile className="w-5 h-5 text-indigo-400" />
                         <div className="text-left">
                            <p className="text-[9px] font-bold text-indigo-400 uppercase">Avg Sentiment</p>
                            <p className="text-lg font-black text-white">72% Pos</p>
                         </div>
                      </div>
                      <div className="px-6 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
                         <Activity className="w-5 h-5 text-blue-400" />
                         <div className="text-left">
                            <p className="text-[9px] font-bold text-blue-400 uppercase">Volatility</p>
                            <p className="text-lg font-black text-white">Low Drift</p>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                   <div className="lg:col-span-2 space-y-8">
                     <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-10 min-h-[450px] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-indigo-500/5 blur-[80px] rounded-full"></div>
                        <h3 className="text-lg font-bold text-white mb-10 flex items-center gap-3">
                           <Activity className="w-5 h-5 text-indigo-400" />
                           Neural Pathway Drift
                        </h3>
                        <div className="h-[300px]">
                           <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={personaTimeline}>
                                 <defs>
                                    <linearGradient id="chartSent" x1="0" y1="0" x2="0" y2="1">
                                       <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                                       <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05}/>
                                    </linearGradient>
                                    <linearGradient id="chartForm" x1="0" y1="0" x2="0" y2="1">
                                       <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                       <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                                    </linearGradient>
                                    <linearGradient id="chartPunc" x1="0" y1="0" x2="0" y2="1">
                                       <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                                       <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05}/>
                                    </linearGradient>
                                 </defs>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                                 <XAxis 
                                    dataKey="day" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)', fontWeight: 'bold' }} 
                                 />
                                 <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)', fontWeight: 'bold' }} 
                                 />
                                 <Tooltip 
                                    contentStyle={{ background: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}
                                    itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: '800' }}
                                 />
                                 <Area type="monotone" dataKey="sentiment" stroke="#6366f1" strokeWidth={5} fill="url(#chartSent)" animationDuration={2000} />
                                 <Area type="monotone" dataKey="formality" stroke="#10b981" strokeWidth={5} fill="url(#chartForm)" animationDuration={2500} />
                                 <Area type="monotone" dataKey="emojiUsage" stroke="#3b82f6" strokeWidth={3} fill="none" animationDuration={3000} />
                                 <Area type="monotone" dataKey="punctuationIntensity" stroke="#a855f7" strokeWidth={3} fill="url(#chartPunc)" animationDuration={3500} />
                              </AreaChart>
                           </ResponsiveContainer>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {personaTimeline.slice(-2).map((day, i) => (
                           <div key={i} className="p-8 backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-[2rem] hover:bg-white/[0.05] transition-all">
                              <div className="flex items-center justify-between mb-4">
                                 <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest">{day.day}</h4>
                                 <span className="px-2 py-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold rounded-lg uppercase tracking-tighter">Event Trace</span>
                              </div>
                              <p className="text-lg font-bold text-white mb-4 line-clamp-2">"Drift triggered by: {day.trigger}"</p>
                              <div className="flex flex-wrap gap-2">
                                 {day.traits.map(trait => (
                                    <span key={trait} className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-slate-400 capitalize">{trait}</span>
                                 ))}
                              </div>
                           </div>
                        ))}
                     </div>
                   </div>

                   <div className="space-y-8">
                     <div className="p-8 backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-[2.5rem] relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                        <h3 className="text-lg font-bold text-white mb-6">Trait Distribution</h3>
                        <div className="space-y-6">
                           {[
                              { label: 'Analytical', val: 85, color: 'bg-indigo-500' },
                              { label: 'Empathetic', val: 62, color: 'bg-blue-500' },
                              { label: 'Emoji Density', val: Math.round((driftStatus?.current?.emojiUsage || 0) * 100), color: 'bg-emerald-500' },
                              { label: 'Punc Intensity', val: Math.round((driftStatus?.current?.punctuationIntensity || 0) * 100), color: 'bg-purple-500' }
                           ].map(trait => (
                              <div key={trait.label} className="space-y-2">
                                 <div className="flex justify-between text-[11px] font-bold">
                                    <span className="text-slate-400 uppercase tracking-widest">{trait.label}</span>
                                    <span className="text-white">{trait.val}%</span>
                                 </div>
                                 <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div 
                                       initial={{ width: 0 }}
                                       animate={{ width: `${trait.val}%` }}
                                       transition={{ duration: 1.5, ease: "easeOut" }}
                                       className={cn("h-full rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]", trait.color)} 
                                    />
                                 </div>
                              </div>
                           ))}
                        </div>
                        <button className="w-full mt-10 py-4 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold text-white hover:bg-white/10 transition-all uppercase tracking-widest">
                           Detailed Metrics
                        </button>
                     </div>

                     <div className="p-8 backdrop-blur-2xl bg-indigo-600/10 border border-indigo-500/20 rounded-[2.5rem] text-center">
                        <div className="relative w-20 h-20 mx-auto mb-6">
                           <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-40 animate-pulse"></div>
                           <div className="relative w-20 h-20 bg-indigo-500 rounded-full flex items-center justify-center text-white shadow-2xl">
                              <Smile className="w-10 h-10" />
                           </div>
                        </div>
                        <h4 className="text-xl font-black text-white mb-2">Stability High</h4>
                        <p className="text-xs text-indigo-200/60 leading-relaxed">System has maintained 94% consistency over the last 48 hours of interaction.</p>
                     </div>
                   </div>
                </div>
              </motion.div>
            )}

            {/* Semantic Vault (Memories) */}
            {activeTab === 'memories' && (
              <motion.div 
                key="memories"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-10 max-w-7xl mx-auto w-full space-y-10 pb-20"
              >
                <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                   <div className="text-center md:text-left">
                      <h2 className="text-4xl font-black text-white">Semantic Vault</h2>
                      <p className="text-slate-500 font-medium">Local-first RAG retrieval with vector embedding analysis.</p>
                   </div>
                    <div className="relative group w-full md:w-96">
                      <div className="absolute -inset-1 bg-indigo-500/20 rounded-2xl blur opacity-0 group-focus-within/input:opacity-100 transition duration-500"></div>
                      <input 
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          fetchMemories(e.target.value);
                        }}
                        placeholder="Search semantic memory space..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-sm text-white outline-none focus:bg-white/[0.08] focus:border-indigo-500/50 transition-all shadow-xl"
                      />
                      <Database className="absolute left-6 top-4.5 w-4 h-4 text-white/30" />
                      {searchTerm && (
                        <button 
                          onClick={() => {
                            setSearchTerm('');
                            fetchMemories('');
                          }}
                          className="absolute right-4 top-4 text-white/40 hover:text-white transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {memories.map((memory, idx) => (
                    <motion.div 
                      key={memory.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group p-8 backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-[2.5rem] hover:bg-white/[0.04] hover:border-white/20 transition-all hover:-translate-y-2 relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500/50 group-hover:h-full transition-all"></div>
                      
                      <div className="flex justify-between items-start mb-6">
                        <div className="space-y-1">
                           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{new Date(memory.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                           <div className="flex items-center gap-2">
                             <p className="text-[9px] font-mono text-indigo-400">UUID: {memory.id.slice(0, 8)}</p>
                             <span className={cn(
                               "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                               memory.layer === 'long-term' ? "bg-indigo-500/20 text-indigo-400" : 
                               memory.layer === 'short-term' ? "bg-blue-500/20 text-blue-400" : "bg-slate-500/20 text-slate-400"
                             )}>
                               {memory.layer}
                             </span>
                           </div>
                        </div>
                        <div className={cn(
                          "px-3 py-1 rounded-lg text-[9px] font-bold border",
                          memory.emotionalWeight > 0.5 ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        )}>
                           {Math.round(memory.emotionalWeight * 100)}% Intensity
                        </div>
                      </div>

                      <p className="text-slate-100 text-sm leading-relaxed mb-8 min-h-[80px] font-medium">
                        "{memory.content}"
                      </p>

                      <div className="flex flex-wrap gap-2 pt-6 border-t border-white/5">
                        {memory.tags.map(tag => (
                          <span key={tag} className="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[9px] font-bold text-slate-500 group-hover:text-indigo-300 group-hover:border-indigo-500/30 transition-colors uppercase tracking-widest">{tag}</span>
                        ))}
                      </div>

                      <div className="absolute bottom-4 right-8 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleMemoryFeedback(memory.id, 'relevant')}
                          className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20"
                          title="Relevant"
                        >
                          <Heart className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleMemoryFeedback(memory.id, 'incorrect')}
                          className="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20 hover:bg-rose-500/20"
                          title="Incorrect"
                        >
                          <Frown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {memories.length === 0 && (
                   <div className="flex flex-col items-center justify-center py-32 backdrop-blur-xl bg-white/[0.02] border border-dashed border-white/10 rounded-[3rem]">
                      <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center text-white/10 mb-6">
                        <Database className="w-10 h-10" />
                      </div>
                      <p className="text-xl font-bold text-white/20 tracking-tight">The vault is currently empty.</p>
                      <p className="text-sm text-white/10 mt-2">Initialize neural input to populate memory nodes.</p>
                   </div>
                )}
              </motion.div>
            )}

            {/* Neural Graph View */}
            {activeTab === 'graph' && (
              <motion.div 
                key="graph"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-10 max-w-7xl mx-auto w-full h-full"
              >
                <div className="flex items-center justify-between mb-8">
                   <div>
                      <h2 className="text-4xl font-black text-white">Neural Cognitive Map</h2>
                      <p className="text-slate-500 font-medium">Real-time relationship mapping of semantic vectors and emotion nodes.</p>
                   </div>
                   <div className="flex gap-4">
                      <button className="p-3 bg-white/5 border border-white/10 rounded-xl text-white/40 hover:text-white transition-all">
                        <Download className="w-5 h-5" />
                      </button>
                      <button className="px-6 py-3 bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all">
                        Re-Cluster Graph
                      </button>
                   </div>
                </div>
                <MemoryGraph memories={memories} />
              </motion.div>
            )}

            {/* Emotion Pulse (Analytics) */}
            {activeTab === 'analytics' && (
              <motion.div 
                key="analytics"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-10 max-w-7xl mx-auto w-full space-y-10 pb-20"
              >
                <div className="flex items-center justify-between">
                   <div>
                      <h2 className="text-4xl font-black text-white">Emotion Pulse</h2>
                      <p className="text-slate-500 font-medium">Multi-modal sentiment extraction and behavioral insights.</p>
                   </div>
                   <div className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                      Live Processing
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                   <div className="lg:col-span-2 backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-[2.5rem] p-10 h-[500px]">
                      <h3 className="text-lg font-bold text-white mb-10 flex items-center gap-3">
                         <Activity className="w-5 h-5 text-indigo-400" />
                         Emotional Heatmap (Weekly)
                      </h3>
                      <ResponsiveContainer width="100%" height="80%">
                        <BarChart data={personaTimeline}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                           <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'white', opacity: 0.3 }} />
                           <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'white', opacity: 0.3 }} />
                           <Tooltip 
                             cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                             contentStyle={{ background: '#0c0e14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                           />
                           <Bar dataKey="sentiment" radius={[6, 6, 0, 0]}>
                              {personaTimeline.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.sentiment > 0.5 ? '#10b981' : entry.sentiment < 0 ? '#f43f5e' : '#6366f1'} />
                              ))}
                           </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                   </div>

                   <div className="space-y-8">
                      <div className="p-8 backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-[2.5rem]">
                         <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest text-slate-500">Dominant Mood</h3>
                         <div className="flex flex-col items-center py-6">
                            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 mb-4 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                               <Smile className="w-10 h-10" />
                            </div>
                            <p className="text-2xl font-black text-white">Contentment</p>
                            <p className="text-xs text-slate-500 mt-1 font-medium">Confidence: 88%</p>
                         </div>
                      </div>

                      <div className="p-8 backdrop-blur-xl bg-indigo-500/5 border border-indigo-500/20 rounded-[2.5rem]">
                         <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest text-slate-500">Insights engine</h3>
                         <div className="space-y-4">
                            {insights.map(item => (
                              <div key={item.label} className="flex gap-4 p-4 hover:bg-white/5 rounded-2xl transition-colors group">
                                 <Zap className="w-5 h-5 text-indigo-400 shrink-0" />
                                 <div>
                                    <p className="text-[10px] font-bold text-indigo-400 uppercase">{item.label}</p>
                                    <p className="text-xs text-white/70 font-medium leading-relaxed group-hover:text-white transition-colors">{item.text}</p>
                                 </div>
                              </div>
                            ))}
                            {insights.length === 0 && <p className="text-xs text-slate-500 italic">Computing deeper analysis...</p>}
                         </div>
                      </div>
                   </div>
                </div>
              </motion.div>
            )}

            {/* Cognitive Sync (Sync Center) */}
            {activeTab === 'sync' && (
              <motion.div 
                key="sync"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="p-10 max-w-5xl mx-auto w-full space-y-12 pb-20"
              >
                 <div className="text-center space-y-4">
                    <div className="w-20 h-20 bg-indigo-500/10 rounded-[2rem] flex items-center justify-center text-indigo-400 mx-auto border border-indigo-500/20 relative">
                       <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 animate-pulse"></div>
                       <Globe className="w-10 h-10 relative" />
                    </div>
                    <h2 className="text-4xl font-black text-white">Cognitive Node Synchronization</h2>
                    <p className="text-slate-500 max-w-md mx-auto font-medium leading-relaxed">Securely synchronize your neural profile across devices while maintaining local-first privacy protocols.</p>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-10 backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-[3rem] hover:bg-white/[0.05] transition-all group">
                       <div className="flex items-center justify-between mb-8">
                          <h3 className="text-xl font-bold text-white">Local-First Index</h3>
                          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-lg uppercase tracking-widest border border-emerald-500/20">Optimized</span>
                       </div>
                       <div className="space-y-6">
                          <div className="space-y-2">
                             <div className="flex justify-between text-xs font-bold">
                                <span className="text-slate-500 uppercase tracking-widest font-mono">SQLite Health</span>
                                <span className="text-white">Active</span>
                             </div>
                             <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 w-[94%] shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                             </div>
                          </div>
                          <div className="space-y-2">
                             <div className="flex justify-between text-xs font-bold">
                                <span className="text-slate-500 uppercase tracking-widest font-mono">Vector Storage</span>
                                <span className="text-white">12.4 MB</span>
                             </div>
                             <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 w-[62%] shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                             </div>
                          </div>
                       </div>
                       <button className="w-full mt-10 p-4 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold text-white hover:bg-white/10 transition-all uppercase tracking-widest">
                          Repair Local Index
                       </button>
                    </div>

                    <div className="p-10 backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-[3rem] hover:bg-white/[0.05] transition-all group">
                       <div className="flex items-center justify-between mb-8">
                          <h3 className="text-xl font-bold text-white">Firebase Bridge</h3>
                          <span className="px-3 py-1 bg-rose-500/10 text-rose-400 text-[10px] font-bold rounded-lg uppercase tracking-widest border border-rose-500/20">Backup Active</span>
                       </div>
                       <div className="space-y-6">
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-slate-500">
                                <Lock className="w-6 h-6" />
                             </div>
                             <div>
                                <p className="text-sm font-bold text-white">E2E Encryption</p>
                                <p className="text-[10px] text-slate-500 font-medium">AES-256 Protocol Enabled</p>
                             </div>
                          </div>
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-slate-500">
                                <RefreshCw className="w-6 h-6" />
                             </div>
                             <div>
                                <p className="text-sm font-bold text-white">Drift Replication</p>
                                <p className="text-[10px] text-slate-500 font-medium">Last sync: 12 minutes ago</p>
                             </div>
                          </div>
                       </div>
                       <button className="w-full mt-10 p-4 bg-indigo-500 text-white font-black rounded-2xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 transition-all uppercase tracking-widest">
                          Cloud Backup Now
                       </button>
                    </div>
                 </div>
              </motion.div>
            )}
           </AnimatePresence>
        </div>

        <DocModal isOpen={showDocModal} onClose={() => setShowDocModal(false)} />
      </main>
    </div>
  );
}
