import { Activity } from 'lucide-react';
import GlitchText from './GlitchText';

interface EndfieldHeaderProps {
  activeTab: string;
  selectedStudentForDocs: any;
  selectedStudentForGantt: any;
  setSelectedStudentForDocsId: (id: string | null) => void;
  setSelectedStudentForGanttId: (id: string | null) => void;
  seasons: any[];
  activeSeasonId: string;
  setActiveSeasonId: (id: string) => void;
  isRecycleBinMode: boolean;
  activeCompletedItemsCount: number;
  setShowCompletedModal: (show: boolean) => void;
  setShowSeasonModal: (show: boolean) => void;
  dataFolderPath: string | null;
  dataStatus: string;
  syncStatus?: string;
}

const NAV_TITLES: Record<string, string> = {
  dashboard: '综合看板',
  students: '申请档案',
  calendar: '日程规划',
  gantt: '全局排期'
};

export default function EndfieldHeader({
  activeTab,
  selectedStudentForDocs,
  selectedStudentForGantt,
  setSelectedStudentForDocsId,
  setSelectedStudentForGanttId,
  seasons,
  activeSeasonId,
  setActiveSeasonId,
  isRecycleBinMode,
  activeCompletedItemsCount,
  setShowCompletedModal,
  setShowSeasonModal,
  dataFolderPath,
  dataStatus,
  syncStatus
}: EndfieldHeaderProps) {
  
  return (
    <header className="h-20 flex items-center justify-between px-8 border-b border-cyan-900/40 bg-[#0a0a0c]/80 backdrop-blur-md sticky top-0 z-40">
      <div className="absolute bottom-[-1px] left-0 w-full h-[1px] bg-gradient-to-r from-[#C68A4C] via-transparent to-transparent opacity-50"></div>
      
      <div className="flex items-center gap-6">
        <div className="w-2.5 h-10 bg-cyan-600/50"></div>
        <div>
          <div className="text-[10px] text-cyan-500 tracking-[0.3em] font-mono mb-1">CURRENT_ZONE</div>
          <div className="text-2xl font-black text-white tracking-widest font-sans flex items-center gap-4">
            {selectedStudentForDocs ? (
              <>
                <span className="cursor-pointer hover:text-cyan-400 font-mono text-[#c8cbd0] text-sm" onClick={() => setSelectedStudentForDocsId(null)}>[ BACK ]</span>
                <span className="text-stone-600 text-xl">//</span>
                <GlitchText text={selectedStudentForDocs.name.toUpperCase() + ' // REGISTRY_CONTROL'} className="text-[#FF6A00] font-mono tracking-wider font-bold" trigger={selectedStudentForDocs.id} />
              </>
            ) : selectedStudentForGantt ? (
              <>
                <span className="cursor-pointer hover:text-cyan-400 font-mono text-[#c8cbd0] text-sm" onClick={() => setSelectedStudentForGanttId(null)}>[ BACK ]</span>
                <span className="text-stone-600 text-xl">//</span>
                <GlitchText text={selectedStudentForGantt.name.toUpperCase() + ' // TIMELINE_DRILL'} className="text-[#FF6A00] font-mono tracking-wider font-bold" trigger={selectedStudentForGantt.id} />
              </>
            ) : (
              <div className="flex items-center gap-6">
                <GlitchText text={NAV_TITLES[activeTab] || 'UNKNOWN_SECTOR'} />
                
                {activeTab !== 'calendar' && (
                <div className="flex items-center p-1.5 rounded bg-stone-900/80 border border-[#FF6A00]/30 ml-4 clip-corner-br">
                  <span className="text-[10px] text-[#FF6A00] ml-2 mr-2 font-mono tracking-wider">SEASON:</span>
                  <select value={activeSeasonId} onChange={(e) => { setActiveSeasonId(e.target.value); setSelectedStudentForDocsId(null); setSelectedStudentForGanttId(null); }}
                    className="bg-transparent border-none text-white font-bold text-sm focus:ring-0 cursor-pointer pr-2 font-mono focus:outline-none">
                    {seasons.filter(s => isRecycleBinMode ? s.isArchived : !s.isArchived).map(s => <option key={s.id} value={s.id} className="bg-stone-900 text-white">{s.name}</option>)}
                  </select>
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[10px] text-cyan-600 tracking-widest font-mono">
        {syncStatus && (
          <span className={`px-2 py-1 border rounded ${syncStatus === 'synced' ? 'border-green-500/30 text-green-400 bg-green-500/10' : syncStatus === 'syncing' ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' : syncStatus === 'offline' ? 'border-stone-500/30 text-stone-400 bg-stone-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}`}>
            {syncStatus === 'synced' ? 'CLOUD_SYNCED' : syncStatus === 'syncing' ? 'SYNCING...' : syncStatus === 'offline' ? 'OFFLINE_MODE' : 'SYNC_ERROR'}
          </span>
        )}
        {dataFolderPath && <span className="text-stone-500 uppercase tracking-widest">{dataStatus}</span>}
        <button onClick={() => setShowCompletedModal(true)} className="flex items-center gap-2 px-4 py-2 border border-[#C68A4C]/30 bg-black/40 hover:bg-[#C68A4C]/10 text-[#C68A4C] transition-colors clip-corner-br shadow-[0_0_8px_rgba(198,138,76,0.1)]">
          <Activity className="w-3.5 h-3.5" />
          <span>COMPLETED ({activeCompletedItemsCount})</span>
        </button>
        <button onClick={() => setShowSeasonModal(true)} className="flex items-center gap-2 px-4 py-2 border border-cyan-900/40 bg-black/40 hover:bg-cyan-900/20 text-cyan-500 transition-colors clip-corner-br">
          <span>SYS_CONFIG</span>
        </button>
      </div>
    </header>
  );
}
