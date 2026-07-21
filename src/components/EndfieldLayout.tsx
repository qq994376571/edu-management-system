import React from 'react';
import { Settings, LogOut, ChevronRight, LayoutDashboard, Users, CalendarDays, Activity } from 'lucide-react';
import GlitchText from './GlitchText';

interface EndfieldLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSettings: () => void;
  onExit: () => void;
  systemTime: number;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'SYS.DASHBOARD', icon: LayoutDashboard, title: '综合看板' },
  { id: 'students', label: 'DAT.STUDENTS', icon: Users, title: '申请档案' },
  { id: 'calendar', label: 'OPR.CALENDAR', icon: CalendarDays, title: '日程规划' }
];

export default function EndfieldLayout({ children, activeTab, setActiveTab, onOpenSettings, onExit, systemTime }: EndfieldLayoutProps) {
  const timeStr = new Date(systemTime).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return (
    <div className="flex h-screen w-full bg-[#0a0a0c] text-slate-300 font-mono overflow-hidden endfield-theme-root relative">
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#C68A4C] to-transparent opacity-30"></div>
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#C68A4C] to-transparent opacity-30"></div>
        <div className="absolute left-10 top-0 w-[1px] h-full bg-gradient-to-b from-transparent via-cyan-900 to-transparent opacity-20"></div>
        <div className="absolute right-10 top-0 w-[1px] h-full bg-gradient-to-b from-transparent via-cyan-900 to-transparent opacity-20"></div>
        <div className="absolute top-4 right-4 text-[10px] text-cyan-600/40 tracking-[0.2em]">{timeStr} // ARKNIGHTS: ENDFIELD_OS</div>
      </div>

      <aside className="w-64 flex-shrink-0 z-10 flex flex-col justify-between border-r border-[#C68A4C]/20 bg-[#121215]/80 backdrop-blur-md relative tech-bracket-container clip-corner-br shadow-2xl">
        <div className="p-6">
          <div className="mb-8 flex flex-col">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-[#C68A4C] animate-pulse"></div>
              <h1 className="text-xl font-black tracking-widest text-[#C68A4C] font-sans">
                RHODES<br/>ISLAND
              </h1>
            </div>
            <div className="text-[10px] mt-2 text-cyan-500/70 tracking-widest">
              [ TERMINAL // ADMIN_MODE ]
            </div>
          </div>

          <nav className="space-y-4">
            {NAV_ITEMS.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex flex-col text-left group relative transition-all duration-300 ${
                    isActive ? 'opacity-100 pl-4' : 'opacity-60 hover:opacity-100 hover:pl-2'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <item.icon className={`w-4 h-4 ${isActive ? 'text-[#C68A4C]' : 'text-slate-500 group-hover:text-cyan-400'}`} />
                    <span className="text-[10px] tracking-wider text-slate-500 group-hover:text-cyan-400">
                      {item.label}
                    </span>
                  </div>
                  <div className={`text-base font-bold font-sans tracking-widest ${isActive ? 'text-white' : 'text-slate-300'} flex items-center`}>
                    {isActive && <ChevronRight className="w-4 h-4 mr-1 text-[#C68A4C]" />}
                    {isActive ? <GlitchText text={item.title} /> : item.title}
                  </div>
                  {isActive && (
                    <div className="absolute left-[-16px] top-1/2 -translate-y-1/2 w-1 h-8 bg-[#C68A4C]"></div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6 space-y-3">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center justify-between text-xs tracking-widest text-slate-400 hover:text-[#C68A4C] transition-colors p-3 border border-transparent hover:border-[#C68A4C]/30 bg-black/20 hover:bg-[#C68A4C]/10 clip-corner-br"
          >
            <span className="flex items-center gap-2"><Settings className="w-4 h-4" /> CONFIG</span>
            <span className="text-[9px] text-cyan-700">SYS_SET</span>
          </button>
          <button
            onClick={onExit}
            className="w-full flex items-center justify-between text-xs tracking-widest text-slate-400 hover:text-red-500 transition-colors p-3 border border-transparent hover:border-red-500/30 bg-black/20 hover:bg-red-500/10 clip-corner-br"
          >
            <span className="flex items-center gap-2"><LogOut className="w-4 h-4" /> LOGOUT</span>
            <span className="text-[9px] text-red-900/70">DISCONNECT</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative z-10 overflow-hidden bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1a1a24]/20 via-[#0a0a0c]/80 to-[#050505]">
        
        <header className="h-16 flex items-center justify-between px-8 border-b border-cyan-900/30 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="w-2 h-8 bg-cyan-600/50"></div>
            <div>
              <div className="text-[10px] text-cyan-500 tracking-[0.3em]">CURRENT_ZONE</div>
              <div className="text-xl font-black text-white tracking-widest">
                {NAV_ITEMS.find(n => n.id === activeTab)?.title || 'UNKNOWN_SECTOR'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-[10px] text-cyan-600 tracking-widest">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#C68A4C]" />
              <span>SYSTEM_STABLE</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 relative endfield-content-area">
          <div className="absolute inset-0 pointer-events-none border-[1px] border-cyan-900/10 m-6">
            <div className="absolute top-[-1px] left-[-1px] w-4 h-4 border-t-2 border-l-2 border-cyan-700/50"></div>
            <div className="absolute top-[-1px] right-[-1px] w-4 h-4 border-t-2 border-r-2 border-cyan-700/50"></div>
            <div className="absolute bottom-[-1px] left-[-1px] w-4 h-4 border-b-2 border-l-2 border-cyan-700/50"></div>
            <div className="absolute bottom-[-1px] right-[-1px] w-4 h-4 border-b-2 border-r-2 border-[#C68A4C]/50"></div>
          </div>
          
          <div className="relative z-10 h-full w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
