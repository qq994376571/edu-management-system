import { Settings, LogOut, ChevronRight, LayoutDashboard, Users, Calendar, AlignLeft } from 'lucide-react';
import GlitchText from './GlitchText';

interface EndfieldSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSettings: () => void;
  onExit: () => void;
}

const NAV_ITEMS = [
  { id: 'calendar', label: 'OPR.CALENDAR', icon: Calendar, title: '日程规划' },
  { id: 'dashboard', label: 'SYS.DASHBOARD', icon: LayoutDashboard, title: '综合看板' },
  { id: 'gantt', label: 'SYS.GANTT', icon: AlignLeft, title: '全局排期' },
  { id: 'students', label: 'DAT.STUDENTS', icon: Users, title: '申请档案' }
];

export default function EndfieldSidebar({ activeTab, setActiveTab, onOpenSettings, onExit }: EndfieldSidebarProps) {
  return (
    <aside className="w-72 flex-shrink-0 z-30 flex flex-col justify-between border-r border-[#C68A4C]/20 bg-[#0a0a0c]/90 backdrop-blur-md relative tech-bracket-container clip-corner-br shadow-2xl">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#C68A4C] to-transparent opacity-30"></div>
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#C68A4C] to-transparent opacity-30"></div>
      
      <div className="p-8">
        <div className="mb-12 flex flex-col">
          <div className="flex items-center gap-4">
            <div className="w-4 h-4 bg-[#C68A4C] animate-pulse"></div>
            <h1 className="text-2xl font-black tracking-[0.2em] text-[#C68A4C] font-sans">
              RHODES<br/>ISLAND
            </h1>
          </div>
          <div className="text-[10px] mt-3 text-cyan-500/70 tracking-widest font-mono">
            [ TERMINAL // ADMIN_MODE ]
          </div>
        </div>

        <nav className="space-y-6">
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
                <div className="flex items-center gap-2 mb-1.5">
                  <item.icon className={`w-4 h-4 ${isActive ? 'text-[#C68A4C]' : 'text-slate-500 group-hover:text-cyan-400'}`} />
                  <span className="text-[10px] tracking-wider text-slate-500 group-hover:text-cyan-400 font-mono">
                    {item.label}
                  </span>
                </div>
                <div className={`text-lg font-bold font-sans tracking-widest ${isActive ? 'text-white' : 'text-slate-300'} flex items-center`}>
                  {isActive && <ChevronRight className="w-5 h-5 mr-1 text-[#C68A4C]" />}
                  {isActive ? <GlitchText text={item.title} /> : item.title}
                </div>
                {isActive && (
                  <div className="absolute left-[-20px] top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#C68A4C]"></div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-6 space-y-4 font-mono">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between text-xs tracking-widest text-slate-400 hover:text-[#C68A4C] transition-colors p-3.5 border border-transparent hover:border-[#C68A4C]/30 bg-black/40 hover:bg-[#C68A4C]/10 clip-corner-br"
        >
          <span className="flex items-center gap-2"><Settings className="w-4 h-4" /> CONFIG</span>
          <span className="text-[9px] text-cyan-700">SYS_SET</span>
        </button>
        <button
          onClick={onExit}
          className="w-full flex items-center justify-between text-xs tracking-widest text-slate-400 hover:text-red-500 transition-colors p-3.5 border border-transparent hover:border-red-500/30 bg-black/40 hover:bg-red-500/10 clip-corner-br"
        >
          <span className="flex items-center gap-2"><LogOut className="w-4 h-4" /> LOGOUT</span>
          <span className="text-[9px] text-red-900/70">DISCONNECT</span>
        </button>
      </div>
    </aside>
  );
}
