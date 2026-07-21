import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, BookOpen, Check, ChevronRight, LogOut, Plus, RefreshCw,
  Search, Trash2, UserRoundCheck, Users, X,
} from 'lucide-react';
import FontScalePicker from './FontScalePicker';
import type { FontScaleMode } from '../lib/fontScale';
import type { CloudSession, PlannerStudentSummary } from '../lib/cloudSync';
import {
  assignPlannerStudents,
  loadPlannerCandidates,
  loadPlannerDashboard,
  unassignPlannerStudent,
} from '../lib/cloudSync';

interface PlannerDashboardProps {
  session: CloudSession;
  onLogout: () => void | Promise<void>;
  onViewStudent: (student: PlannerStudentSummary) => void | Promise<void>;
  fontScaleMode?: FontScaleMode;
  onFontScaleChange?: (value: FontScaleMode) => void;
  exitLabel?: string;
}

const studentKey = (student: Pick<PlannerStudentSummary, 'teacher_username' | 'student_id'>) =>
  `${student.teacher_username}\u0000${student.student_id}`;

const plannerStagePath = (student: PlannerStudentSummary) => (
  student.stage_path
  || [student.source_stage, student.target_stage].filter(Boolean).join(' → ')
  || '阶段未填写'
);

export default function PlannerDashboard({
  session,
  onLogout,
  onViewStudent,
  fontScaleMode = 'auto',
  onFontScaleChange = () => {},
  exitLabel = '退出登录',
}: PlannerDashboardProps) {
  const [activeStudents, setActiveStudents] = useState<PlannerStudentSummary[]>([]);
  const [archivedStudents, setArchivedStudents] = useState<PlannerStudentSummary[]>([]);
  const [archiveMode, setArchiveMode] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [candidates, setCandidates] = useState<PlannerStudentSummary[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [viewingKey, setViewingKey] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await loadPlannerDashboard(session);
      setActiveStudents(result.active_students || []);
      setArchivedStudents(result.archived_students || []);
    } catch (err) {
      setError((err as Error).message || '无法读取规划老师学生名单');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void refresh(); }, [refresh]);

  const shownStudents = archiveMode ? archivedStudents : activeStudents;
  const filteredStudents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return shownStudents;
    return shownStudents.filter((student) =>
      [student.name, student.teacher_username, student.season_name, student.status, plannerStagePath(student)]
        .some((value) => String(value || '').toLowerCase().includes(needle)),
    );
  }, [search, shownStudents]);

  const candidateNameCounts = useMemo(() => candidates.reduce<Record<string, number>>((counts, student) => {
    const name = String(student.name || '').trim().toLocaleLowerCase();
    if (name) counts[name] = (counts[name] || 0) + 1;
    return counts;
  }, {}), [candidates]);

  const openAdd = async () => {
    setShowAdd(true);
    setCandidateLoading(true);
    setSelectedKeys(new Set());
    setCandidates([]);
    try {
      const result = await loadPlannerCandidates(session, archiveMode);
      setCandidates(result.students || []);
    } catch (err) {
      setError((err as Error).message || '无法读取未认领学生名单');
      setShowAdd(false);
    } finally {
      setCandidateLoading(false);
    }
  };

  const toggleCandidate = (student: PlannerStudentSummary) => {
    const key = studentKey(student);
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const assignSelected = async () => {
    const selected = candidates.filter((student) => selectedKeys.has(studentKey(student)));
    if (!selected.length) return;
    setSaving(true);
    try {
      await assignPlannerStudents(session, selected.map((student) => ({
        teacher_username: student.teacher_username,
        student_id: student.student_id,
      })));
      setShowAdd(false);
      setSelectedKeys(new Set());
      await refresh();
    } catch (err) {
      setError((err as Error).message || '添加学生失败');
    } finally {
      setSaving(false);
    }
  };

  const removeStudent = async (student: PlannerStudentSummary) => {
    if (!window.confirm(`确定将“${student.name}”从你的负责学生名单中移除吗？学生档案不会被删除。`)) return;
    try {
      await unassignPlannerStudent(session, student.teacher_username, student.student_id);
      await refresh();
    } catch (err) {
      setError((err as Error).message || '移除学生失败');
    }
  };

  const viewStudent = async (student: PlannerStudentSummary) => {
    const key = studentKey(student);
    setViewingKey(key);
    setError('');
    try {
      await onViewStudent(student);
    } catch (err) {
      setError((err as Error).message || '无法读取学生资料');
    } finally {
      setViewingKey('');
    }
  };

  return (
    <div className="admin-mobile-shell flex h-[100svh] min-h-0 flex-col overflow-hidden bg-[#F3EFE6] text-slate-800 [touch-action:pan-y_pinch-zoom]">
      <header className="shrink-0 border-b border-[#E5DEC9] bg-[#FAF8F5] px-4 py-3 shadow-sm [touch-action:pan-y_pinch-zoom] sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <UserRoundCheck className="h-6 w-6 shrink-0 text-[#C68A4C]" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold font-serif sm:text-xl">规划老师学生管理</h1>
            <p className="truncate text-xs text-slate-500">{session.username} · 仅可查看已分配学生</p>
          </div>
          <FontScalePicker value={fontScaleMode} onChange={onFontScaleChange} />
          <button onClick={() => void onLogout()} className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[#D8E0EA] bg-white px-2.5 text-sm text-slate-600 hover:bg-slate-50" title={exitLabel} aria-label={exitLabel}>
            <LogOut className="h-4 w-4" /><span className="hidden sm:inline">{exitLabel}</span>
          </button>
        </div>
      </header>

      <main data-testid="planner-scroll-container" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 [touch-action:pan-y_pinch-zoom] sm:px-8 sm:py-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <section className="rounded-2xl border border-[#E5DEC9] bg-[#FAF8F5] p-3 shadow-sm sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl bg-[#F3EFE6] p-1">
                <button onClick={() => setArchiveMode(false)} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium ${!archiveMode ? 'bg-white text-[#A97138] shadow-sm' : 'text-slate-500'}`}>
                  <Users className="h-4 w-4" />在读学生 <span className="text-xs">{activeStudents.length}</span>
                </button>
                <button onClick={() => setArchiveMode(true)} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium ${archiveMode ? 'bg-white text-[#A97138] shadow-sm' : 'text-slate-500'}`}>
                  <Archive className="h-4 w-4" />归档学生目录 <span className="text-xs">{archivedStudents.length}</span>
                </button>
              </div>
              <label className="relative min-w-[12rem] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索学生、教务或申请季" className="h-10 w-full rounded-xl border border-[#E5DEC9] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#C68A4C]" />
              </label>
              <button onClick={() => void refresh()} disabled={loading} className="flex h-10 items-center gap-1 rounded-xl border border-[#D8E0EA] bg-white px-3 text-sm text-slate-600 disabled:opacity-50" title="刷新名单">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">刷新</span>
              </button>
              <button onClick={() => void openAdd()} className="flex h-10 items-center gap-1 rounded-xl bg-[#C68A4C] px-3 text-sm font-semibold text-white hover:bg-[#A97138]">
                <Plus className="h-4 w-4" />{archiveMode ? '添加归档学生' : '添加学生'}
              </button>
            </div>
          </section>

          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <section className="overflow-hidden rounded-2xl border border-[#E5DEC9] bg-[#FAF8F5] shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#E5DEC9] px-4 py-3">
              {archiveMode ? <Archive className="h-5 w-5 text-[#C68A4C]" /> : <BookOpen className="h-5 w-5 text-[#C68A4C]" />}
              <h2 className="font-bold font-serif">{archiveMode ? '我的归档学生' : '我的在读学生'}</h2>
              {archiveMode && <span className="text-xs text-slate-400">仅目录；点击查看时才冷加载完整档案</span>}
            </div>
            {loading ? (
              <div className="py-16 text-center text-sm text-slate-400">正在读取学生名单…</div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">{archiveMode ? '暂无已添加的归档学生' : '暂无负责学生，请点击“添加学生”从未认领名单中选择'}</div>
            ) : (
              <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 sm:p-4">
                {filteredStudents.map((student) => (
                  <article key={studentKey(student)} className="min-w-0 rounded-xl border border-[#E5DEC9] bg-white p-3 shadow-sm">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-bold text-slate-800">{student.name}</h3>
                        <p className="mt-1 truncate text-xs text-slate-500">负责教务：{student.teacher_username}</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-[#A97138]">{student.status}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-[#F7F3EB] p-2 text-xs">
                      <div className="min-w-0"><span className="block text-[10px] text-slate-400">申请季</span><span className="block truncate">{student.season_name}</span></div>
                      <div><span className="block text-[10px] text-slate-400">专业</span>{student.application_count} 个</div>
                      <div className="col-span-2 min-w-0"><span className="block text-[10px] text-slate-400">申请阶段</span><span className="block truncate">{plannerStagePath(student)}</span></div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={() => void removeStudent(student)} className="flex h-9 shrink-0 items-center justify-center rounded-lg border border-red-100 px-2 text-red-500 hover:bg-red-50" title="从负责名单移除（不会删除档案）"><Trash2 className="h-4 w-4" /></button>
                      <button onClick={() => void viewStudent(student)} disabled={viewingKey === studentKey(student)} className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-[#C68A4C] px-3 text-sm font-semibold text-white disabled:opacity-60">
                        {viewingKey === studentKey(student) ? '正在冷加载…' : '查看资料库'}<ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {showAdd && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={archiveMode ? '添加归档学生' : '添加学生'}>
          <div className="flex max-h-[88svh] w-full max-w-3xl flex-col rounded-t-2xl border border-[#E5DEC9] bg-[#FAF8F5] shadow-2xl sm:rounded-2xl">
            <div className="flex items-center gap-2 border-b border-[#E5DEC9] px-4 py-3">
              <div className="min-w-0 flex-1"><h2 className="font-bold font-serif">{archiveMode ? '添加归档学生' : '添加未认领学生'}</h2><p className="text-xs text-slate-500">仅显示尚未分配给任何规划老师的学生，可多选后一键添加。</p></div>
              <button onClick={() => setShowAdd(false)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5DEC9] bg-white" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 [touch-action:pan-y_pinch-zoom] sm:p-4">
              {candidateLoading ? <div className="py-16 text-center text-sm text-slate-400">正在读取未认领学生…</div> : candidates.length === 0 ? <div className="py-16 text-center text-sm text-slate-400">当前没有未认领的{archiveMode ? '归档' : '在读'}学生</div> : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {candidates.map((student) => {
                    const key = studentKey(student);
                    const checked = selectedKeys.has(key);
                    const normalizedName = String(student.name || '').trim().toLocaleLowerCase();
                    const duplicateCount = candidateNameCounts[normalizedName] || 0;
                    return <button key={key} onClick={() => toggleCandidate(student)} className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left ${checked ? 'border-[#C68A4C] bg-amber-50' : 'border-[#E5DEC9] bg-white hover:border-[#C68A4C]/60'}`}>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-[#C68A4C] bg-[#C68A4C] text-white' : 'border-slate-300'}`}>{checked && <Check className="h-3.5 w-3.5" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5"><strong className="min-w-0 truncate text-sm">{student.name}</strong>{duplicateCount > 1 && <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700">同名 {duplicateCount} 条</span>}</span>
                        <span className="block truncate text-xs text-slate-500">负责教务：{student.teacher_username}</span>
                        <span className="block truncate text-xs text-slate-500">{student.season_name} · {plannerStagePath(student)}</span>
                        {duplicateCount > 1 && <span className="block truncate text-[10px] text-slate-400">档案号：{student.student_id}</span>}
                      </span>
                    </button>;
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#E5DEC9] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <span className="mr-auto text-xs text-slate-500">已选择 {selectedKeys.size} 人</span>
              <button onClick={() => setShowAdd(false)} className="h-10 rounded-lg border border-[#E5DEC9] bg-white px-4 text-sm">取消</button>
              <button onClick={() => void assignSelected()} disabled={!selectedKeys.size || saving} className="h-10 rounded-lg bg-[#C68A4C] px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? '正在添加…' : '一键添加'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
