// @ts-nocheck
import CursorTrail from './components/CursorTrail';
import EndfieldSidebar from './components/EndfieldSidebar';
import EndfieldHeader from './components/EndfieldHeader';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import PlannerDashboard from './components/PlannerDashboard';
import FontScalePicker from './components/FontScalePicker';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  AlertCircle, Clock, CheckCircle2, CalendarDays, Users, 
  LayoutDashboard, FileText, ChevronRight, X, LogOut,
  Plus, Edit, Trash2, Archive, RotateCcw, Check,
  BellOff, Settings, AlertTriangle, Info as InfoIcon, Calendar, Lock, KeyRound, Target, MapPin, Mail, ShieldAlert, AlignLeft,
  FolderOpen, Save, Database, Activity, ChevronUp, ChevronDown, Eye, EyeOff, Paintbrush,
  CloudUpload, CloudDownload
} from 'lucide-react';
import {
  loadSession, saveSession, clearSession, logoutSession, verifySession, initLoad, syncDelta,
  loadArchive as cloudLoadArchive, migrateLocalData, migrateLocalDataForce,
  getLastSyncAt, setLastSyncAt, checkServerReachable, adminLockUser, adminUnlockUser, adminInitLoad,
  listPlannerAccounts, loadPlannerStudent
} from './lib/cloudSync';
import type { CloudSession, PlannerAccount, PlannerStudentSummary } from './lib/cloudSync';
import { cloudHasAnyData, shouldRestoreLocalStudents, studentCount, validateImportData } from './lib/dataSafety';
import { loadFontScaleMode, saveFontScaleMode } from './lib/fontScale';
import type { FontScaleMode } from './lib/fontScale';
import { formatStudentStagePath, inferStudentType, studentStageParts } from './lib/studentIdentity';
import {
  buildDerivedCalendarEvents,
  isArchivedStudent,
  isCalendarEventDismissed,
  isTerminalApplication,
  isTerminalStudent,
  movePresetDocument,
  shiftDays,
  smartMergePresetDocs,
} from './lib/workflowRules';

const fmt = (d) => {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
};
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return fmt(r); };
const getTodayStr = () => fmt(new Date());
const PRIMARY_TABS = ['calendar', 'dashboard', 'gantt', 'students'] as const;

// Server-side JSON serializers are free to reorder object keys.  Comparing
// canonical JSON avoids treating an unchanged cloud snapshot as a new edit.
const stableJsonStringify = (value: unknown) => JSON.stringify(value, (_key, item) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  return Object.keys(item).sort().reduce((result, key) => {
    result[key] = item[key];
    return result;
  }, {} as Record<string, unknown>);
});

export const MobileLongPressDraggable = ({ children, label, onDropDate, onLongPress, onDropTarget, dropSelector = '[data-mobile-drop-date], [data-mobile-drop-shift]', sourceDate, crossWeekShift = 0, className = '' }) => {
  const timerRef = useRef(null);
  const startRef = useRef({ x: 0, y: 0 });
  const armedRef = useRef(false);
  const draggingRef = useRef(false);
  const movedBeforeArmRef = useRef(false);
  const activePointerTypeRef = useRef('touch');
  const containerRef = useRef(null);
  const sourceRef = useRef(null);
  const activePointerIdRef = useRef(null);
  const [armed, setArmed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [point, setPoint] = useState({ x: 0, y: 0 });

  const cancelTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const preventArmedTouchScroll = (event) => {
      // Block only a one-finger long-press drag. Two-finger gestures must stay
      // available for Safari page zoom even when they start over a bubble.
      if (armedRef.current && event.touches?.length === 1) event.preventDefault();
    };
    node.addEventListener('touchmove', preventArmedTouchScroll, { passive: false });
    return () => {
      cancelTimer();
      node.removeEventListener('touchmove', preventArmedTouchScroll);
    };
  }, []);

  const resetGesture = () => {
    cancelTimer();
    const source = sourceRef.current;
    const pointerId = activePointerIdRef.current;
    if (source && pointerId != null) {
      try {
        if (source.hasPointerCapture?.(pointerId)) source.releasePointerCapture?.(pointerId);
      } catch {}
    }
    sourceRef.current = null;
    activePointerIdRef.current = null;
    armedRef.current = false;
    draggingRef.current = false;
    movedBeforeArmRef.current = false;
    activePointerTypeRef.current = 'touch';
    setArmed(false);
    setDragging(false);
  };

  const handlePointerDown = (event) => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || event.target.closest('button,input,select,textarea,a')) return;
    if (activePointerIdRef.current != null && activePointerIdRef.current !== event.pointerId) {
      resetGesture();
      return;
    }
    cancelTimer();
    armedRef.current = false;
    draggingRef.current = false;
    movedBeforeArmRef.current = false;
    setArmed(false);
    startRef.current = { x: event.clientX, y: event.clientY };
    activePointerTypeRef.current = event.pointerType || 'mouse';
    setPoint({ x: event.clientX, y: event.clientY });
    const pointerId = event.pointerId;
    const source = event.currentTarget;
    sourceRef.current = source;
    activePointerIdRef.current = pointerId;
    if (event.pointerType === 'mouse') {
      try { source.setPointerCapture?.(pointerId); } catch {}
    }
    timerRef.current = setTimeout(() => {
      armedRef.current = true;
      setArmed(true);
      setPoint({ x: event.clientX, y: event.clientY });
      try { source.setPointerCapture?.(pointerId); } catch {}
      try { navigator.vibrate?.(35); } catch {}
    }, 500);
  };

  const handlePointerMove = (event) => {
    const distance = Math.hypot(event.clientX - startRef.current.x, event.clientY - startRef.current.y);
    if (!armedRef.current) {
      // A mouse has no page-pan gesture to protect.  Let a normal held mouse
      // drag represent the mobile long-press drag, while a stationary hold
      // still waits half a second before opening details.
      if (activePointerTypeRef.current === 'mouse' && distance > 8) {
        cancelTimer();
        armedRef.current = true;
        draggingRef.current = true;
        setArmed(true);
        setDragging(true);
        if (event.pointerType === 'mouse') event.preventDefault();
        setPoint({ x: event.clientX, y: event.clientY });
        return;
      }
      if (distance > 10) {
        movedBeforeArmRef.current = true;
        cancelTimer();
      }
      return;
    }
    if (!draggingRef.current && distance > 8) {
      draggingRef.current = true;
      setDragging(true);
    }
    if (!draggingRef.current) return;
    if (event.pointerType === 'mouse') event.preventDefault();
    setPoint({ x: event.clientX, y: event.clientY });
  };

  const finishDrag = (event) => {
    cancelTimer();
    if (draggingRef.current) {
      event.preventDefault();
      const isCrossWeekEdge = crossWeekShift !== 0 && event.clientX >= Math.max(0, window.innerWidth - 64);
      const target = isCrossWeekEdge ? null : document.elementFromPoint(event.clientX, event.clientY)?.closest?.(dropSelector);
      const date = target?.getAttribute?.('data-mobile-drop-date');
      const shift = Number(target?.getAttribute?.('data-mobile-drop-shift'));
      if (isCrossWeekEdge && sourceDate) onDropDate?.(addDays(new Date(`${sourceDate}T12:00:00`), crossWeekShift));
      else if (target && onDropTarget) onDropTarget(target);
      else if (date) onDropDate?.(date);
      else if (sourceDate && Number.isFinite(shift) && shift !== 0) onDropDate?.(addDays(new Date(`${sourceDate}T12:00:00`), shift));
    } else if (armedRef.current) {
      event.preventDefault();
      onLongPress?.();
    }
    resetGesture();
  };

  const cancelGesture = () => {
    resetGesture();
  };

  return (
    <div
      ref={containerRef}
      data-page-swipe-ignore="true"
      className={`${className} ${armed ? 'mobile-longpress-source-active' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={cancelGesture}
      onContextMenu={event => event.preventDefault()}
      style={{ touchAction: 'pan-y pinch-zoom', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      {children}
      {dragging && <div className="mobile-longpress-ghost" style={{ left: point.x, top: point.y }}><span className="text-[10px] opacity-70">松手移动到目标日期</span><strong>{label}</strong></div>}
      {dragging && crossWeekShift !== 0 && (
        <div data-mobile-drop-shift={crossWeekShift} className="mobile-crossweek-drop-target">
          <span>{crossWeekShift > 0 ? '移到下周' : '移回本周'}</span>
          <ChevronRight className="h-5 w-5"/>
        </div>
      )}
    </div>
  );
};

export const HelpButton = ({ onClick, label, className = '' }) => (
  <button
    type="button"
    data-readonly-allow="true"
    onClick={onClick}
    className={`relative flex h-9 w-9 shrink-0 items-center justify-center after:absolute after:-inset-1 after:content-[''] ${className}`}
    aria-label={label}
  >
    <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full border border-[#C68A4C]/50 bg-amber-50 text-xs font-black text-[#A97138] shadow-sm transition-colors hover:bg-amber-100">?</span>
  </button>
);

export const HelpDialog = ({ open, onClose, title, label, children }) => {
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    previousFocusRef.current = document.activeElement;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-label={label || title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="relative max-h-[calc(100dvh-2rem)] w-full max-w-xs overflow-y-auto rounded-2xl border border-[#E5DEC9] bg-white p-4 shadow-2xl">
        <button data-readonly-allow="true" ref={closeButtonRef} type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full border border-slate-200 p-2 text-slate-500" aria-label={`关闭${label || title}`}>
          <X className="h-4 w-4"/>
        </button>
        <h3 className="pr-10 text-base font-bold text-slate-800">{title}</h3>
        <div className="mt-3 text-sm leading-relaxed text-slate-600">{children}</div>
      </section>
    </div>,
    document.body,
  );
};

export const InlineDateInput = ({ initialValue, onSave, className, optional = false, emptyLabel = '设置提醒时间', ariaLabel = '提醒时间' }) => {
  const [val, setVal] = useState(initialValue || '');
  const [optionalDialogOpen, setOptionalDialogOpen] = useState(false);
  const [draftDate, setDraftDate] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const optionalTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    setVal(initialValue || '');
  }, [initialValue]);

  useEffect(() => {
    if (!optionalDialogOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOptionalDialogOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [optionalDialogOpen]);

  if (optional) {
    const displayValue = val
      ? `${val.slice(0, 10).replace(/-/g, '/')} ${val.slice(11, 16) || '00:00'}`
      : '';
    const openPicker = () => {
      setDraftDate(val ? val.slice(0, 10) : '');
      setDraftTime(val?.includes('T') ? (val.slice(11, 16) || '09:00') : '');
      setOptionalDialogOpen(true);
    };
    const closePicker = () => {
      setOptionalDialogOpen(false);
      window.requestAnimationFrame(() => optionalTriggerRef.current?.focus());
    };
    const saveDraft = () => {
      if (!draftDate) return;
      const next = `${draftDate}T${draftTime || '09:00'}`;
      setVal(next);
      if (next !== (initialValue || '')) onSave(next);
      closePicker();
    };
    return (
      <>
        <span className="inline-flex min-w-0 max-w-full items-center gap-1">
          <button
            ref={optionalTriggerRef}
            type="button"
            onClick={openPicker}
            aria-label={val ? `${ariaLabel}：${displayValue}` : emptyLabel}
            className={`inline-flex h-8 min-w-0 max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-white/80 px-2.5 text-[11px] ${val ? 'border-[#E5DEC9] text-slate-600' : 'border-dashed border-[#E5DEC9] text-slate-500'} ${className || ''}`}
          >
            <Clock className="h-3.5 w-3.5 shrink-0"/><span className="truncate">{val ? displayValue : emptyLabel}</span>
          </button>
          {val && (
            <button
              type="button"
              aria-label={`清除${ariaLabel}`}
              title="清除时间"
              onClick={() => { setVal(''); onSave(''); }}
              className="shrink-0 rounded-md border border-[#E5DEC9] bg-white p-1.5 text-slate-400 hover:text-red-500"
            >
              <X className="h-3.5 w-3.5"/>
            </button>
          )}
        </span>
        {optionalDialogOpen && typeof document !== 'undefined' && createPortal(
          <div
            className="fixed inset-0 z-[520] flex items-center justify-center bg-slate-950/40 p-4"
            role="presentation"
            onMouseDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}
          >
            <section role="dialog" aria-modal="true" aria-label={`设置${ariaLabel}`} className="w-full max-w-xs rounded-2xl border border-[#E5DEC9] bg-[#FAF8F5] p-4 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-slate-800">设置提醒时间</h3>
                <button type="button" onClick={closePicker} aria-label={`关闭设置${ariaLabel}`} className="rounded-full border border-slate-200 bg-white p-2 text-slate-500"><X className="h-4 w-4"/></button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">只有点击“确定”才会保存；取消或点击窗口外仍保持原值。</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <label className="min-w-0 text-xs text-slate-600">日期
                  <input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} aria-label={`${ariaLabel}日期`} className="mt-1 w-full min-w-0 rounded-lg border border-[#E5DEC9] bg-white px-2 py-2 text-base text-slate-700"/>
                </label>
                <label className="min-w-0 text-xs text-slate-600">时间
                  <input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} aria-label={`${ariaLabel}时刻`} className="mt-1 w-full min-w-0 rounded-lg border border-[#E5DEC9] bg-white px-2 py-2 text-base text-slate-700"/>
                </label>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={closePicker} className="rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-sm text-slate-600">取消</button>
                <button type="button" onClick={saveDraft} disabled={!draftDate} className="rounded-lg bg-[#C68A4C] px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">确定</button>
              </div>
            </section>
          </div>,
          document.body,
        )}
      </>
    );
  }

  const input = (
    <input
      type="datetime-local"
      value={val?.includes('T') ? val.slice(0,16) : (val ? val+'T00:00' : '')}
      onChange={e => setVal(e.target.value)}
      onBlur={() => {
        if (val !== (initialValue || '')) onSave(val);
      }}
      className={className}
    />
  );

  return input;
};

const CustomSelect = ({ value, onChange, options, className, isEndfieldTheme, icon: Icon, name, customButtonClass, customDropdownClass, direction = 'down' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => (o.value !== undefined ? o.value : o) === value) || options[0];
  const selectedLabel = selectedOption?.label !== undefined ? selectedOption.label : (selectedOption?.value !== undefined ? selectedOption.value : (selectedOption || value));

  return (
    <div className={`relative w-fit ${className || ''}`} ref={dropdownRef}>
      <select role="combobox" aria-label={name || "select"} name={name} value={value} onChange={onChange} style={{ opacity: 0, position: "absolute", width: 1, height: 1, zIndex: -1 }}>
        {options.map((o, idx) => {
          const val = o.value !== undefined ? o.value : o;
          const lbl = o.label !== undefined ? o.label : val;
          return <option key={idx} value={val}>{lbl}</option>;
        })}
      </select>
      <button 
        type="button"
        onClick={(e) => { e.preventDefault(); setIsOpen(!isOpen); }}
        className={customButtonClass ? customButtonClass : `w-full flex items-center justify-between h-full px-3 py-2 text-left transition-colors outline-none ${
          isEndfieldTheme 
            ? 'bg-[#0a0a0c] border border-[#FF6A00]/50 text-[#FF6A00] font-mono hover:bg-[#FF6A00]/10 shadow-[inset_0_0_10px_rgba(255,106,0,0.1)]' 
            : 'animate-pop-in bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md'
        }`}
      >
        <span className="truncate flex items-center gap-2 text-sm">
          {Icon && <Icon className="w-4 h-4" />}
          {selectedLabel}
        </span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-slate-400'}`} />
      </button>
      
      {isOpen && (
        <div className={customDropdownClass ? customDropdownClass : `absolute z-[100] min-w-full w-max flex flex-col ${direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} max-h-60 overflow-y-auto shadow-lg ${
          isEndfieldTheme 
            ? 'bg-[#0a0a0c] border border-[#FF6A00]/50 text-[#FF6A00] font-mono shadow-[0_4px_20px_rgba(255,106,0,0.3)] clip-corner-br' 
            : 'animate-pop-in bg-white border border-slate-200 py-1 rounded-md'
        }`}>
          {options.map((opt, i) => {
            const optVal = opt.value !== undefined ? opt.value : opt;
            const optLabel = opt.label !== undefined ? opt.label : optVal;
            const isSelected = optVal === value;
            return (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onChange({ target: { value: optVal } });
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors whitespace-nowrap ${
                  isEndfieldTheme 
                    ? `hover:bg-[#FF6A00]/20 ${isSelected ? 'bg-[#FF6A00]/20 text-orange-300 font-bold border-l-2 border-[#FF6A00] pl-2' : 'text-stone-400'}`
                    : `hover:bg-blue-50 ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`
                }`}
              >
                {optLabel}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// datetime helpers
// fmtDT logic was removed as it is no longer used
// parseForCalc: parse any date/datetime string to Date object for calculations
const parseForCalc = (v) => {
  if (!v) return new Date(0);
  if (v instanceof Date) return v;
  const s = String(v);
  if (s.includes('T')) return new Date(s);
  // date-only: treat as start of day
  return new Date(s + 'T00:00:00');
};

/** 手机时间轴只保留申请季的首、尾月份，并给“今天”一个稳定位置。 */
export const getMobileGanttScale = (startValue, endValue, todayValue = getTodayStr()) => {
  const start = parseForCalc(startValue);
  const end = parseForCalc(endValue);
  const today = parseForCalc(todayValue);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const todayMs = today.getTime();
  const duration = Number.isFinite(endMs - startMs) && endMs > startMs ? endMs - startMs : 1;
  const rawPosition = ((todayMs - startMs) / duration) * 100;
  const todayInRange = Number.isFinite(rawPosition) && rawPosition >= 0 && rawPosition <= 100;
  const monthLabel = (date) => Number.isFinite(date.getTime()) ? `${date.getFullYear()}年${date.getMonth() + 1}月` : '—';
  return {
    startLabel: monthLabel(start),
    endLabel: monthLabel(end),
    todayLabel: Number.isFinite(today.getTime()) ? `${today.getMonth() + 1}/${today.getDate()}` : '—',
    todayPosition: Math.max(0, Math.min(100, Number.isFinite(rawPosition) ? rawPosition : 0)),
    todayInRange,
    todayRelation: todayInRange ? '申请季内' : (rawPosition < 0 ? '申请季前' : '申请季后'),
  };
};

// 终态只改变截止节点的形状；申请窗口仍是实际业务时间，不能整条置灰。
export const getMobileGanttApplicationBarClass = (_isTerminal = false) => 'rounded-full bg-[#C68A4C]';

export const isMobileGanttMilestoneCompleted = (completedAlerts, alertId, terminal = false, noteCompleted = false) =>
  Boolean(terminal || noteCompleted || completedAlerts?.[alertId]);

export const MobileGanttMilestone = ({ completedAlerts, alertId, terminal = false, noteCompleted = false, label = '备注', className = '', style = undefined }) => {
  const completed = isMobileGanttMilestoneCompleted(completedAlerts, alertId, terminal, noteCompleted);
  return <span
    data-mobile-gantt-milestone={completed ? 'completed' : 'pending'}
    aria-label={`${label}：${completed ? '已完成' : '未完成'}`}
    className={`${className} border-2 border-white shadow ${completed ? 'rounded-sm bg-slate-500' : 'rounded-full bg-red-500'}`}
    style={style}
  />;
};

export const createCalendarNoteDeleteConfirmation = (event, onConfirm) => ({
  title: '删除这条备注？',
  message: `确定删除备注“${event?.text || '空白备注'}”吗？删除后无法撤销。`,
  dangerous: true,
  confirmLabel: '删除备注',
  onConfirm,
});




// === Modal overlay style (inline rgba to fix software-rendering black frame bug) ===
const OVERLAY_STYLE = { backgroundColor: 'rgba(15, 23, 42, 0.55)' };

// === 申请季配置 ===
const CURRENT_DATE = new Date();
export const INITIAL_SEASONS = [
  { id: 'season_25_26', name: '2025-2026 申请季', start: '2025-09-01', end: '2026-09-30' },
  { id: 'season_26_27', name: '2026-2027 申请季', start: '2026-09-01', end: '2027-09-30' }
];
const INITIAL_ACTIVE_SEASON_ID = INITIAL_SEASONS[0].id;

// A student must always belong to a real season.  Older backups can contain an
// empty/stale activeSeasonId, so resolve it against the loaded season list
// instead of leaving the UI pointed at a season that no longer exists.
const resolveActiveSeasonId = (seasonList: any[], requestedId: unknown) => {
  const list = Array.isArray(seasonList) ? seasonList.filter(s => s && s.id) : [];
  const requested = typeof requestedId === 'string' ? requestedId : '';
  const requestedSeason = list.find(s => s.id === requested);
  if (requestedSeason) return requestedSeason.id;
  return list.find(s => !s.isArchived)?.id || list[0]?.id || null;
};
const DEFAULT_ALERT_CONFIG = {
  deadlineCritical: 7,
  deadlineWarning: 14,
  preOpenCritical: 7,
  preOpenWarning: 21,
  visaOpenCritical: 7,
  visaOpenWarning: 30,
  visaCloseCritical: 7,
  visaCloseWarning: 21,
  alertOpenMissing: true,
  alertPreOpen: true,
  alertVisaBeforeOpen: true,
  alertNoteDDL: true,
  rlCritical: 7,
  rlWarning: 14,
  alertRL: true,
};
const DEFAULT_SOURCE_REGIONS = ['中国大陆', '香港/澳门', '海外'];
const DEFAULT_TARGET_REGIONS = ['香港', '澳门', '英国', '美国', '澳大利亚', '加拿大', '新加坡', '日本', '内地', '欧洲'];
const DEFAULT_SOURCE_STAGES = ['高中', '专科', '本科', '硕士', '博士'];
const DEFAULT_TARGET_STAGES = ['高中', '本科', '硕士', '博士'];

export const DEMO_STUDENTS = [
  {
    id: 'STU001', seasonId: 'season_25_26', name: '张伟（测试）', region: '香港', type: '本升硕', status: '已获录取',
    recommenders: [{ id: 'R1', name: '张教授', email: '' }, { id: 'R2', name: '李总', email: '' }],
    visaWindow: [addDays(CURRENT_DATE, 14), addDays(CURRENT_DATE, 105)],
    applications: [
      {
        id: 'APP1', school: '香港大学', program: '金融学 MSc', tier: '冲刺档',
        recommendations: { 'R1': { status: 'sent', deadline: '2025-10-10' }, 'R2': { status: 'pending', deadline: '2025-10-10' } },
        openDate: '2025-10-06', deadline: addDays(CURRENT_DATE, 5),
        status: '收集中',
        portal: { email: 'zhangwei@163.com', emailPwd: 'EmailPwd123', account: 'zhangwei@163.com', password: 'HKU2026!', appId: 'HKU261099', securityQA: '高中所在城市-北京' },
        refereeInfo: '推荐人A(张教授)已网推；推荐人B(李总)未点链接',
        notes: [{ id: 'n1', text: '7月初可能安排面试，需提前准备', deadline: addDays(CURRENT_DATE, 6) }],
        specificDocs: [{ id: 'sd1', label: 'Writing Sample (金融市场分析)', checked: false }]
      },
      {
        id: 'APP2', school: '香港中文大学', program: '工商管理 MBA', tier: '稳妥档',
        recommendations: { 'R1': { status: 'completed', deadline: '2025-11-05' }, 'R2': { status: 'none', deadline: '2025-11-05' } },
        openDate: '2025-10-06', deadline: addDays(CURRENT_DATE, 32),
        status: '收集中',
        portal: { account: 'zhangwei@163.com', password: 'CUHK456!', appId: '26004523' },
        refereeInfo: '无需推荐信',
        notes: [{ id: 'n2', text: '补交最终成绩单（必须Stamp）', deadline: addDays(CURRENT_DATE, 10) }],
        specificDocs: []
      }
    ],
    docs: {
      info: [],
      basic: [{ id: 'b1', label: '身份证正反面扫描件', checked: true }, { id: 'b2', label: '护照首页扫描件', checked: true }, { id: 'b3', label: '白底证件照 (45x55mm)', checked: false }],
      academic: [{ id: 'a1', label: '本科中英文完整成绩单', checked: true }, { id: 'a2', label: '本科毕业证/学位证', checked: false }, { id: 'a3', label: '学信网学历验证', checked: false }, { id: 'a4', label: '雅思/托福语言单', checked: true }, { id: 'a5', label: '个人简历 (CV) & PS', checked: false }],
      writing: [],
      visa: [{ id: 'v1', label: 'ID 995A 签证申请表格', checked: false }, { id: 'v2', label: '经济证明 (25-30万存款)', checked: false }]
    }
  },
  {
    id: 'STU002', seasonId: 'season_25_26', name: '李娜（测试）', region: '英国', type: '本升硕', status: '申请中',
    recommenders: [{ id: 'R3', name: '王教授', email: '' }],
    visaWindow: [addDays(CURRENT_DATE, 36), addDays(CURRENT_DATE, 130)],
    applications: [
      {
        id: 'APP3', school: '曼彻斯特大学', program: '建筑设计 MA', tier: '冲刺档',
        recommendations: { 'R3': { status: 'pending', deadline: '2025-11-20' } },
        openDate: '2025-10-01', deadline: addDays(CURRENT_DATE, 10),
        status: '申请中',
        portal: { email: 'lina_uk@gmail.com', emailPwd: 'GmailPwd2', account: 'lina_uk@gmail.com', password: 'ManUni2026', appId: 'M26090' },
        refereeInfo: '推荐信已上传，等待确认',
        notes: [
          { id: 'n3', text: '补交第8学期成绩单 (Unconditional要求)', deadline: addDays(CURRENT_DATE, 4) },
          { id: 'n4', text: '交占位费 2000英镑', deadline: addDays(CURRENT_DATE, 5) }
        ],
        specificDocs: [{ id: 'sd2', label: '课程设计作品集 (Portfolio, Max 20MB)', checked: false }]
      }
    ],
    docs: {
      info: [],
      basic: [{ id: 'b1', label: '身份证正反面扫描件', checked: true }, { id: 'b2', label: '护照首页扫描件', checked: true }, { id: 'b3', label: '白底证件照 (45x55mm)', checked: false }],
      academic: [{ id: 'a1', label: '本科中英文完整成绩单', checked: true }, { id: 'a2', label: '本科毕业证/学位证', checked: false }, { id: 'a3', label: '学信网学历验证', checked: false }, { id: 'a4', label: '雅思/托福语言单', checked: true }, { id: 'a5', label: '个人简历 (CV) & PS', checked: false }],
      writing: [],
      visa: [{ id: 'v1', label: 'CAS (录取确认函)', checked: false }, { id: 'v2', label: '存单证明 (存满28天)', checked: false }]
    }
  }
];

// === 材料模板生成器 ===
const generateDefaultDocs = (type, region) => {
  // 区域一：信息收集表类
  const info = [
    { id: 'i1', label: '客户基本信息表', checked: false },
    { id: 'i2', label: '个人陈述 (PS) 素材表', checked: false },
    { id: 'i3', label: '推荐人信息表', checked: false },
  ];
  // 区域二：个人基础材料类
  const basic = [
    { id: 'b1', label: '身份证正反面扫描件（正面+背面，无水印）', checked: false },
    { id: 'b2', label: '户口本扫描件', checked: false },
    { id: 'b3', label: '护照首页扫描件（如有，无水印）', checked: false },
    { id: 'b4', label: '电子照片（白底高清原片 45×55mm，眉毛双耳不遮挡，无反光镜片）', checked: false },
  ];
  // 区域三：学术公证类
  const academic = [
    { id: 'a1', label: '中文成绩单（教务处/档案馆红色鲜章）', checked: false },
    { id: 'a2', label: '英文成绩单（教务处/档案馆红色鲜章）', checked: false },
    { id: 'a3', label: '中文成绩评分标准（教务处/档案馆红色鲜章）', checked: false },
    { id: 'a4', label: '英文成绩评分标准（教务处/档案馆红色鲜章）', checked: false },
    { id: 'a5', label: 'GPA/均分证明（适用于成绩单无显示GPA时，教务处红色鲜章）', checked: false },
    { id: 'a6', label: '在读证明（教务处/档案馆红色鲜章）', checked: false },
    { id: 'a7', label: '排名证明（如有，教务处/档案馆红色鲜章）', checked: false },
    { id: 'a8', label: '本科毕业证（中文版）', checked: false },
    { id: 'a9', label: '本科毕业证（英文版）', checked: false },
    { id: 'a10', label: '本科学位证（中文版）', checked: false },
    { id: 'a11', label: '本科学位证（英文版）', checked: false },
    { id: 'a12', label: '中国高等教育学位在线验证报告（中文版）[学信网，已毕业]', checked: false },
    { id: 'a13', label: '中国高等教育学位在线验证报告（英文版）[学信网，已毕业]', checked: false },
    { id: 'a14', label: '教育部学历证书电子注册备案表（中文版）[学信网，已毕业，有效期6个月]', checked: false },
    { id: 'a15', label: '教育部学历证书电子注册备案表（英文版）[学信网，已毕业]', checked: false },
    { id: 'a16', label: '教育部学籍在线验证报告 [学信网，在读学生]', checked: false },
    { id: 'a17', label: '英文授课证明 [港澳/海外就读学生]', checked: false },
    { id: 'a18', label: '留服认证报告 [港澳/海外毕业学生，替代学信网]', checked: false },
    { id: 'a19', label: '雅思/托福成绩单（如适用）', checked: false },
    { id: 'a20', label: 'GRE/GMAT成绩单（如适用）', checked: false },
    { id: 'a21', label: 'CET-4/CET-6证书（如适用）', checked: false },
    { id: 'a22', label: '在职证明/工作证明（中英文，公司章，如适用）', checked: false },
    { id: 'a23', label: '实习证明（中英文，公司章，如适用）', checked: false },
    { id: 'a24', label: '奖项/资格/荣誉证书（建议提供中英文对照或英文翻译认证版本，如有）', checked: false },
  ];
  // 区域四：教务文书类
  const writing = [
    { id: 'w1', label: '个人简历 (CV)', checked: false },
    { id: 'w2', label: '个人陈述 (PS)', checked: false },
    { id: 'w3', label: '推荐信 (RL) 第1封', checked: false },
    { id: 'w4', label: '推荐信 (RL) 第2封', checked: false },
    { id: 'w5', label: '推荐信 (RL) 第3封', checked: false },
    { id: 'w6', label: '研究计划 (RP)（如需）', checked: false },
    { id: 'w7', label: '英文写作样本 (Writing Sample)（如需）', checked: false },
  ];
  let visa = [];
  const r = (region || '').toLowerCase();
  if (r.includes('香港') || r.includes('hk')) {
    visa = [{ id: 'v1', label: '港澳通行证（有效期应覆盖在港就读时间）', checked: false }, { id: 'v2', label: 'ID 995A 签证申请表格', checked: false }, { id: 'v3', label: '经济证明 (25-30万存款)', checked: false }];
  } else if (r.includes('澳门') || r.includes('macau')) {
    visa = [{ id: 'v1', label: '港澳通行证', checked: false }, { id: 'v2', label: '逗留D签注 (内地办理)', checked: false }, { id: 'v3', label: '逗留特别许可 (澳门北安拍卡)', checked: false }];
  } else if (r.includes('英国') || r.includes('uk')) {
    visa = [{ id: 'v1', label: 'CAS (录取确认函)', checked: false }, { id: 'v2', label: '银行存款证明 (满28天)', checked: false }];
  } else {
    visa = [{ id: 'v1', label: '签证申请表', checked: false }, { id: 'v2', label: '资金担保证明', checked: false }];
  }
  return { info, basic, academic, writing, visa };
};

// === 智能预警材料模板生成器 ===
const getMatchingPresetId = (student, customPresets) => {
  const r = (student.region || student.applicationRegion || '').toLowerCase();
  
  if (customPresets && customPresets.length > 0 && r) {
    const matchedCustom = customPresets.find(p => {
      if (!p) return false;
      if (typeof p.id !== 'string' || typeof p.name !== 'string') return false;
      return p.id.startsWith('custom_') && p.name.toLowerCase().includes(r);
    });
    if (matchedCustom) return matchedCustom.id;
  }

  const isOverseasSchool = ['香港/澳门', '海外'].includes(student.precedingSchoolLocation);
  if (isOverseasSchool) {
    return 'overseas_any';
  }
  if (r.includes('香港') || r.includes('hk')) {
    return 'china_hk';
  }
  if (r.includes('澳门') || r.includes('macau')) {
    return 'china_macau';
  }
  if (r.includes('英国') || r.includes('uk') || r.includes('海外') || r.includes('美') || r.includes('加') || r.includes('澳') || r.includes('新') || r.includes('欧')) {
    return 'china_overseas';
  }
  if (r.includes('内地') || r.includes('大陆') || r.includes('中')) {
    return 'china_mainland';
  }
  return null;
};

const getDefaultPresets = () => [
  { id: 'china_hk', name: '中国大陆 → 香港', docs: generateDefaultDocs('本升硕', '香港') },
  { id: 'china_macau', name: '中国大陆 → 澳门', docs: generateDefaultDocs('本升硕', '澳门') },
  { id: 'china_overseas', name: '中国大陆 → 英国/欧美海外', docs: generateDefaultDocs('本升硕', '英国') },
  { id: 'china_mainland', name: '中国大陆 → 内地', docs: generateDefaultDocs('本升硕', '') },
  { id: 'overseas_any', name: '港澳/海外 → 任意地区', docs: generateDefaultDocs('本升硕', '海外') },
];

const determineMaterialPreset = (student, customPresets) => {
  if (!student) return { info: [], basic: [], academic: [], writing: [], visa: [], unclassified: [] };
  const isOverseasSchool = ['香港/澳门', '海外'].includes(student.precedingSchoolLocation);
  const isOverseasRegion = student.region === '海外' || student.applicationRegion === '海外';
  const isGraduated = student.graduationStatus === '已毕业';
  const stageParts = studentStageParts(student);
  const isUndergradToMaster = stageParts.source === '本科' && stageParts.target === '硕士';

  let presetDocs = null;
  const presetsToUse = (customPresets && customPresets.length > 0) ? customPresets : getDefaultPresets();
  const matchedId = getMatchingPresetId(student, customPresets);
  const matched = presetsToUse.find(p => p.id === matchedId);
  if (matched && matched.docs) {
    presetDocs = JSON.parse(JSON.stringify(matched.docs));
  }

  if (!presetDocs) {
    presetDocs = { info: [], basic: [], academic: [], writing: [], visa: [], unclassified: [] };
  }

  const { info, basic, academic, writing, visa } = presetDocs;

  // Filter Academic docs
  const filteredAcademic = (academic || []).filter(doc => {
    const label = doc.label;

    // Check school location / region criteria
    if (isOverseasSchool || isOverseasRegion) {
      // Hide the 4 (or 5)学信网 items
      if (label.includes('学信网') || label.includes('教育部学历') || label.includes('学位在线验证')) {
        return false;
      }
    } else {
      // Hide 留服 and 英文授课
      if (label.includes('留服认证') || label.includes('英文授课证明')) {
        return false;
      }
    }

    // Check graduation criteria
    if (student.graduationStatus === '在读') {
      // Hide graduation cert, degree cert, and graduated学信网
      if (label.includes('毕业证') || label.includes('学位证') || (label.includes('学信网') && label.includes('已毕业'))) {
        return false;
      }
    } else if (isGraduated) {
      // Hide 在读证明 and 学籍报告
      if (label.includes('在读证明') || (label.includes('学信网') && label.includes('在读学生'))) {
        return false;
      }
    }

    return true;
  });

  // Filter Writing docs
  const filteredWriting = (writing || []).filter(doc => {
    const label = doc.label;
    if (isUndergradToMaster) {
      if (label.includes('研究计划') || label.includes('RP')) {
        return false;
      }
    }
    return true;
  });

  return {
    info: info || [],
    basic: basic || [],
    academic: filteredAcademic,
    writing: filteredWriting,
    visa: visa || [],
    unclassified: []
  };
};

// === 模拟测试学生（供演示，无存档文件时加载）===


const formatTimeLeft = (targetMs, currentMs) => {
  const diff = targetMs - currentMs;
  if (diff <= 0) return '已超时';
  const mins = Math.floor(diff / 60000);
  const d = Math.floor(mins / (24 * 60));
  const h = Math.floor((mins - d * 24 * 60) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}天${h}小时${m}分`;
  if (h > 0) return `${h}小时${m}分`;
  return `${m}分`;
};

// ============================================================

const addEventToStudent = (stu, category, action, title, detail) => {
  const newEvt = {
    id: 'evt-' + Date.now() + '-' + Math.random().toString(36).substr(2,5),
    timestamp: Date.now(),
    category, action, title, detail
  };
  return { ...stu, events: [newEvt, ...(stu.events || [])] };
};

const migrateStudents = (students) => {
  if (!Array.isArray(students)) return [];
  return students.map(s => {
    const newS = { ...s };
    if (!Array.isArray(newS.recommenders)) newS.recommenders = [];
    if (!Array.isArray(newS.applications)) newS.applications = [];
    if (!newS.docs || typeof newS.docs !== 'object' || Array.isArray(newS.docs)) {
      newS.docs = { info: [], basic: [], academic: [], writing: [], visa: [], unclassified: [] };
    } else {
      newS.docs = { ...newS.docs };
    }
    if (!newS.docs.info) newS.docs.info = [];
    if (!newS.docs.basic) newS.docs.basic = [];
    if (!newS.docs.academic) newS.docs.academic = [];
    if (!newS.docs.writing) newS.docs.writing = [];
    if (!newS.docs.visa) newS.docs.visa = [];
    if (!newS.docs.unclassified) newS.docs.unclassified = [];

    // Deduplicate document IDs across all categories to fix corrupted state
    const seenDocIds = new Set();
    Object.keys(newS.docs).forEach(cat => {
      if (Array.isArray(newS.docs[cat])) {
        newS.docs[cat] = newS.docs[cat].map(doc => {
          let idToUse = doc.id;
          while (!idToUse || seenDocIds.has(idToUse)) {
            idToUse = 'D_MIG_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          }
          seenDocIds.add(idToUse);
          return { ...doc, id: idToUse };
        });
      } else {
        newS.docs[cat] = [];
      }
    });
    newS.applications = newS.applications.map(a => {
      const newA = { ...a };
      if (!newA.recommendations) newA.recommendations = {};
      if (!newA.notes) newA.notes = [];
      if (!newA.specificDocs) newA.specificDocs = [];
      if (newA.refereeInfo) {
        newA.notes.push({ id: 'n_migrated_rl_' + Date.now() + Math.random(), text: '【旧版推荐信记录】' + newA.refereeInfo, deadline: newA.deadline });
        delete newA.refereeInfo;
      }
      return newA;
    });

    // Generate system default document labels for this student's profile to recognize standard items
    const defaultDocs = generateDefaultDocs(newS.type || '本升硕', newS.region || newS.applicationRegion || '');
    const standardCategories = ['info', 'basic', 'academic', 'writing', 'visa'];
    const standardLabelsMap = {};
    standardCategories.forEach(cat => {
      standardLabelsMap[cat] = new Set((defaultDocs[cat] || []).map(d => d.label));
    });

    const legacyLabels = ["学信网学历验证", "个人简历 (CV) & PS", "本科中英文完整成绩单"];
    const unclassifiedItems = [];

    // 1. Move any documents with legacy labels to unclassified (since they were replaced by newer standard labels in previous versions)
    standardCategories.forEach(cat => {
      const items = Array.isArray(newS.docs[cat]) ? newS.docs[cat] : [];
      const kept = [];
      items.forEach(item => {
        if (item && item.label) {
          const isLegacy = legacyLabels.includes(item.label);
          if (isLegacy) {
            unclassifiedItems.push(item);
          } else {
            kept.push(item);
          }
        }
      });
      newS.docs[cat] = kept;
    });

    // 2. Scan and extract legacy document properties directly on the student object
    const legacyDocProps = ['resume', 'cv', 'transcript', 'personalStatement', 'ps', 'recommendationLetter', 'recommendation', 'studyPlan', 'ielts', 'toefl', 'gre', 'gmat'];
    legacyDocProps.forEach(prop => {
      if (newS[prop] !== undefined && newS[prop] !== null) {
        const valStr = String(newS[prop]).trim();
        if (valStr) {
          unclassifiedItems.push({
            id: `migrated-${prop}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            label: `【迁移自属性:${prop}】${valStr}`,
            checked: false
          });
        }
        delete newS[prop];
      }
    });

    // 3. Move other unrecognized keys in newS.docs to unclassified
    const allKeys = Object.keys(newS.docs);
    allKeys.forEach(k => {
      if (!['info', 'basic', 'academic', 'writing', 'visa', 'unclassified'].includes(k)) {
        const items = newS.docs[k];
        if (Array.isArray(items)) {
          unclassifiedItems.push(...items.filter(Boolean));
        }
        delete newS.docs[k];
      }
    });

    // Prevent duplicates and ensure all items have valid unique IDs
    const uniqueUnclassified = [];
    const seenIds = new Set();
    const uncArray = Array.isArray(newS.docs.unclassified) ? newS.docs.unclassified : [];
    [...uncArray, ...unclassifiedItems].forEach(item => {
      if (item && item.id) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          uniqueUnclassified.push(item);
        }
      } else if (item && item.label) {
        const generatedId = 'unc-' + Math.random().toString(36).substr(2, 5);
        item.id = generatedId;
        uniqueUnclassified.push(item);
      }
    });
    newS.docs.unclassified = uniqueUnclassified;

    const isBackgroundValid = newS.background && typeof newS.background === 'object' && !Array.isArray(newS.background);
    if (isBackgroundValid) {
      if (newS.precedingSchoolName === undefined || newS.precedingSchoolName === null) {
        newS.precedingSchoolName = newS.background.precedingSchoolName || newS.background.schoolName || null;
      }
      if (newS.precedingSchoolLocation === undefined || newS.precedingSchoolLocation === null) {
        newS.precedingSchoolLocation = newS.background.precedingSchoolLocation || newS.background.schoolLocation || null;
      }
      if (newS.precedingSchoolLevel === undefined || newS.precedingSchoolLevel === null) {
        newS.precedingSchoolLevel = newS.background.precedingSchoolLevel || newS.background.schoolLevel || null;
      }
      if (newS.precedingSchoolCountry === undefined || newS.precedingSchoolCountry === null) {
        newS.precedingSchoolCountry = newS.background.precedingSchoolCountry || newS.background.schoolCountry || null;
      }
      if (newS.precedingSchoolRankingSource === undefined || newS.precedingSchoolRankingSource === null) {
        newS.precedingSchoolRankingSource = newS.background.precedingSchoolRankingSource || newS.background.schoolRankingSource || null;
      }
      if (newS.precedingSchoolRankingValue === undefined || newS.precedingSchoolRankingValue === null) {
        newS.precedingSchoolRankingValue = newS.background.precedingSchoolRankingValue || newS.background.schoolRankingValue || null;
      }
      const remainingFields = ['major', 'programLength', 'gpa', 'gpaScale', 'graduationStatus', 'applicationStage', 'applicationRegion', 'address', 'experience', 'awards'];
      remainingFields.forEach(f => {
        if (newS[f] === undefined || newS[f] === null) {
          newS[f] = newS.background[f] || null;
        }
      });
    }

    const backgroundFields = [
      'precedingSchoolLocation', 'precedingSchoolName', 'precedingSchoolLevel', 'precedingSchoolCountry',
      'precedingSchoolRankingSource', 'precedingSchoolRankingValue', 'major', 'programLength',
      'gpa', 'gpaScale', 'graduationStatus', 'applicationStage',
      'applicationRegion', 'address', 'experience', 'awards'
    ];
    backgroundFields.forEach(f => {
      if (newS[f] === undefined) {
        newS[f] = null;
      }
    });

    newS.background = {
      precedingSchoolLocation: newS.precedingSchoolLocation,
      precedingSchoolName: newS.precedingSchoolName,
      precedingSchoolLevel: newS.precedingSchoolLevel,
      precedingSchoolCountry: newS.precedingSchoolCountry,
      precedingSchoolRankingSource: newS.precedingSchoolRankingSource,
      precedingSchoolRankingValue: newS.precedingSchoolRankingValue,
      major: newS.major,
      programLength: newS.programLength,
      gpa: newS.gpa,
      gpaScale: newS.gpaScale,
      graduationStatus: newS.graduationStatus,
      applicationStage: newS.applicationStage,
      applicationRegion: newS.applicationRegion,
      address: newS.address,
      experience: newS.experience,
      awards: newS.awards,
      
      schoolLocation: newS.precedingSchoolLocation,
      schoolName: newS.precedingSchoolName,
      schoolLevel: newS.precedingSchoolLevel,
      schoolCountry: newS.precedingSchoolCountry,
      schoolRankingSource: newS.precedingSchoolRankingSource,
      schoolRankingValue: newS.precedingSchoolRankingValue
    };

    return newS;
  });
};

const InlineTextarea = ({ initialValue, onSave, className, placeholder, rows }) => {
  const [val, setVal] = useState(initialValue || '');
  useEffect(() => { setVal(initialValue || ''); }, [initialValue]);
  return (
    <textarea
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { if (val !== (initialValue || '')) onSave(val); }}
      className={className}
      placeholder={placeholder}
      rows={rows}
    />
  );
};

const InlineInput = ({ initialValue, onSave, className, placeholder, readOnly, type = "text", wrapText = false }) => {
  const [val, setVal] = useState(initialValue || '');
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isEscaping = useRef(false);
  const inputRef = useRef(null);
  
  useEffect(() => { 
    setVal(initialValue || ''); 
  }, [initialValue]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);
  
  const isPasswordType = type === 'password';
  const inputType = isPasswordType ? (showPassword ? 'text' : 'password') : type;
  
  const handleBlur = () => {
    if (isEscaping.current) {
      setTimeout(() => { 
        isEscaping.current = false; 
      }, 100);
      setIsEditing(false);
      return;
    }
    if (val !== (initialValue || '')) {
      onSave(val);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (val !== (initialValue || '')) {
        onSave(val);
      }
      setIsEditing(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      isEscaping.current = true;
      setVal(initialValue || '');
      setIsEditing(false);
    }
  };

  const handleEyeClick = (e) => {
    e.preventDefault(); // Prevent focus loss on input
    e.stopPropagation();
    setShowPassword(!showPassword);
  };

  if (readOnly || !isEditing) {
    const displayValue = isPasswordType 
      ? (val ? (showPassword ? val : '••••••') : (placeholder || '—'))
      : (val || placeholder || '—');
    return (
      <span className={`flex flex-1 min-w-0 group ${wrapText ? 'items-start pt-1' : 'items-center'}`}>
        <span
          onClick={() => { if (!readOnly) setIsEditing(true); }}
          className={`cursor-pointer ${wrapText ? 'whitespace-pre-wrap break-all min-w-0' : 'truncate'} ${className}`}
          style={{ display: wrapText ? 'block' : 'inline-block', minWidth: '40px' }}
        >
          {displayValue}
        </span>
        {isPasswordType && val && (
          <button
            type="button"
            data-readonly-allow={readOnly ? 'true' : undefined}
            onClick={handleEyeClick}
            className="text-slate-400 hover:text-slate-600 focus:outline-none p-1 ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            title={showPassword ? "隐藏" : "显示"}
          >
            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="flex items-center flex-1 min-w-0 relative">
      <input
        ref={inputRef}
        type={inputType}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={className}
        placeholder={placeholder}
      />
      {isPasswordType && (
        <button
          type="button"
          onMouseDown={handleEyeClick}
          onClick={(e) => e.stopPropagation()}
          className="text-slate-400 hover:text-slate-600 focus:outline-none p-1 ml-1 shrink-0"
          title={showPassword ? "隐藏" : "显示"}
        >
          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      )}
    </span>
  );
};

interface GlitchTextProps {
  text: string;
  className?: string;
  trigger?: any;
}

const GlitchText: React.FC<GlitchTextProps> = ({ text, className, trigger }) => {
  const [displayText, setDisplayText] = useState(text);

  useEffect(() => {
    let iteration = 0;
    let interval: any = null;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789//--++**';
    
    interval = setInterval(() => {
      setDisplayText(prev => {
        return text
          .split('')
          .map((char, index) => {
            if (char === ' ') return ' ';
            if (index < iteration) {
              return text[index];
            }
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join('');
      });

      if (iteration >= text.length) {
        clearInterval(interval);
      }
      iteration += 1 / 3;
    }, 25);

    return () => clearInterval(interval);
  }, [text, trigger]);

  return <span className={className}>{displayText}</span>;
};

const saveLocalStorageHelper = (key, value) => {
  if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') return;
  try {
    const session = loadSession();
    if (session && (session.role === 'admin' || session.role === 'planner' || (session.role === 'sub_admin' && !(window as any).subAdminSelfMode))) {
      return;
    }
  } catch (e) {}
  localStorage.setItem(key, value);
};

const saveDataHelper = async (path, payload) => {
  if (!path || !window.electronAPI) return false;
  let session = null;
  try {
    session = loadSession();
    if (session && (session.role === 'admin' || session.role === 'planner' || (session.role === 'sub_admin' && !(window as any).subAdminSelfMode))) {
      return true;
    }
  } catch (e) {
    console.error('Error checking session in saveDataHelper:', e);
  }
  const ownerUsername = session?.username;
  const storedPayload = ownerUsername ? { ...payload, ownerUsername } : payload;
  const ok = await window.electronAPI.saveData(path, storedPayload, ownerUsername);
  if (path === 'C:\\test-1.25') {
    await window.electronAPI.saveData('C:\\test-save-1.25', storedPayload, ownerUsername);
  }
  return ok;
};

export default function App() {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [fontScaleMode, setFontScaleMode] = useState<FontScaleMode>(() => loadFontScaleMode());
  useEffect(() => {
    saveFontScaleMode(fontScaleMode);
  }, [fontScaleMode]);
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const lastBlurTimeRef = useRef(0);
  const [editingOptionItem, setEditingOptionItem] = useState<string | null>(null);
  const [editingOptionValue, setEditingOptionValue] = useState<string>('');
  const [deletingOptionConfirm, setDeletingOptionConfirm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('calendar');
  const [showStudentTimeline, setShowStudentTimeline] = useState(false);
  const [weekTodos, setWeekTodos] = useState<{[day: string]: {[hour: number]: {id: string; text: string; done: boolean}[]}}>({});
  const [addingTodo, setAddingTodo] = useState<{day: string; hour: number} | null>(null);
  const [newTodoText, setNewTodoText] = useState('');
  
  // React-based inline delete confirm & modal states to prevent Electron window.confirm focus hijacking
  const [deletingStudentConfirmId, setDeletingStudentConfirmId] = useState<string | null>(null);
  const [deletingAppConfirmId, setDeletingAppConfirmId] = useState<string | null>(null);
  const [deletingRecommenderConfirmId, setDeletingRecommenderConfirmId] = useState<string | null>(null);
  const [deletingPresetConfirmId, setDeletingPresetConfirmId] = useState<string | null>(null);
  const [deletingEventConfirmId, setDeletingEventConfirmId] = useState<string | null>(null);
  const [hidingAlertConfirmId, setHidingAlertConfirmId] = useState<string | null>(null);
  const [deletingDashboardAlertConfirmId, setDeletingDashboardAlertConfirmId] = useState<string | null>(null);
  const [inlineConfirmModal, setInlineConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    dangerous?: boolean;
    confirmLabel?: string;
  } | null>(null);
  // Demo students must never become a new account's starting data.  Keep the
  // generic application-season templates below, but begin every account with
  // zero students.
  const [students, setStudents] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [showEffectsModal, setShowEffectsModal] = useState(false);
  const [effectsConfig, setEffectsConfig] = useState(() => {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      const saved = localStorage.getItem('edu_progress_effects_config');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return {
      enabled: true,
      type: 'constellation',
      count: 70,
      sizeScale: 1.0,
      speedScale: 1.0,
      attraction: 1.0,
      lineDist: 130,
      linesEnabled: true,
      theme: 'gold',
      cursorStyle: 'default',
      particleShape: 'circle',
      glowEnabled: false,
      scanlineSpeed: 1.0
    };
  });
  const [isMobileBrowser, setIsMobileBrowser] = useState(() =>
    typeof window !== 'undefined' && !(window as any).electronAPI && window.matchMedia('(max-width: 767px)').matches
  );

  useEffect(() => {
    if ((window as any).electronAPI) return;
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobileBrowser(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  const renderedEffectsConfig = isMobileBrowser ? { ...effectsConfig, enabled: false, cursorStyle: 'default' } : effectsConfig;

  useEffect(() => {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem('edu_progress_effects_config', JSON.stringify(effectsConfig));
    }
  }, [effectsConfig]);

  const [calendarMemoDialog, setCalendarMemoDialog] = useState({ isOpen: false, date: '', time: '', text: '' });
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0); // 0 = this week, 1 = next week
  const [mobileCalendarDetail, setMobileCalendarDetail] = useState<any>(null);
  const [showMobileCalendarHelp, setShowMobileCalendarHelp] = useState(false);
  const [showMobileGanttHelp, setShowMobileGanttHelp] = useState(false);
  const [showMobileSystemMenu, setShowMobileSystemMenu] = useState(false);
  const [dragOverBlockKey, setDragOverBlockKey] = useState<string | null>(null);
  const [dragOverDocId, setDragOverDocId] = useState<string | null>(null);
  const [expandedCells, setExpandedCells] = useState<{[key: string]: boolean}>({});
  const [systemWarningsTimeOverrides, setSystemWarningsTimeOverrides] = useState({});

  const [sourceRegions, setSourceRegions] = useState(DEFAULT_SOURCE_REGIONS);
  const [targetRegions, setTargetRegions] = useState(DEFAULT_TARGET_REGIONS);
  const [sourceStages, setSourceStages] = useState(DEFAULT_SOURCE_STAGES);
  const [targetStages, setTargetStages] = useState(DEFAULT_TARGET_STAGES);
  const [addingScene, setAddingScene] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [newSceneSource, setNewSceneSource] = useState('');
  const [newSceneTarget, setNewSceneTarget] = useState('');
  const [showOptionManager, setShowOptionManager] = useState(false);
  const [editingOptionType, setEditingOptionType] = useState<'sourceRegion' | 'targetRegion' | 'sourceStage' | 'targetStage'>('sourceRegion');
  const [newRegionInput, setNewRegionInput] = useState('');

  const [selectedStudentForDocsId, setSelectedStudentForDocsId] = useState(null);
  const [selectedStudentForGanttId, setSelectedStudentForGanttId] = useState(null);
  const [showPresetManagerModal, setShowPresetManagerModal] = useState(false);
  const [showMobilePresetHelp, setShowMobilePresetHelp] = useState(false);
  const [showVisaWindowHelp, setShowVisaWindowHelp] = useState(false);
  const [showAlertRulesHelp, setShowAlertRulesHelp] = useState(false);
  const [showCompletedTasksHelp, setShowCompletedTasksHelp] = useState(false);
  const [showDataPathHelp, setShowDataPathHelp] = useState(false);
  const [showPortalCredentialsHelp, setShowPortalCredentialsHelp] = useState(false);
  const [showDocumentLibraryHelp, setShowDocumentLibraryHelp] = useState(false);
  const [showActivityLogHelp, setShowActivityLogHelp] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null);
  const [customPresets, setCustomPresets] = useState<any[]>([]);
  const [deletingSeasonId, setDeletingSeasonId] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  // Fixed-position calendar bubble tooltip (escapes overflow clipping)
  const [calendarTooltip, setCalendarTooltip] = useState<null | {x: number; y: number; title: string; message: string | null}>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  // Scroll position preservation for 教务资料库 — saves list position on enter, restores on exit.
  const studentListScrollPositionRef = useRef<number | null>(null);
  const openStudentDocs = useCallback((studentId: string | null) => {
    const scroller = mainScrollRef.current;
    if (studentId && scroller && studentListScrollPositionRef.current === null) {
      studentListScrollPositionRef.current = scroller.scrollTop;
    }
    setSelectedStudentForDocsId(studentId);
    window.requestAnimationFrame(() => {
      const next = mainScrollRef.current;
      if (!next) return;
      if (typeof next.scrollTo === 'function') next.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      else { next.scrollTop = 0; next.scrollLeft = 0; }
    });
  }, []);
  const closeStudentDocs = useCallback(() => {
    const savedTop = studentListScrollPositionRef.current;
    studentListScrollPositionRef.current = null;
    setSelectedStudentForDocsId(null);
    window.requestAnimationFrame(() => {
      const scroller = mainScrollRef.current;
      if (!scroller || savedTop === null) return;
      if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: savedTop, left: 0, behavior: 'auto' });
      else { scroller.scrollTop = savedTop; scroller.scrollLeft = 0; }
    });
  }, []);
  const mobilePageSwipeRef = useRef<{ pointerId: number | null; startX: number; startY: number; ignored: boolean }>({ pointerId: null, startX: 0, startY: 0, ignored: false });
  const navigatePrimaryTab = useCallback((tab: string) => {
    if (!PRIMARY_TABS.includes(tab as typeof PRIMARY_TABS[number])) return;
    setActiveTab(tab);
    setSelectedStudentForDocsId(null);
    setSelectedStudentForGanttId(null);
    setCalendarTooltip(null);
    window.requestAnimationFrame(() => {
      const scroller = mainScrollRef.current;
      if (!scroller) return;
      if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      else {
        scroller.scrollTop = 0;
        scroller.scrollLeft = 0;
      }
    });
  }, []);

  const handleMobilePagePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!isMobileBrowser || selectedStudentForDocsId || selectedStudentForGanttId) return;
    const target = event.target as HTMLElement;
    mobilePageSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      ignored: !!target.closest('[data-page-swipe-ignore="true"], [data-calendar-event-id], [role="dialog"], input, textarea, select, button, a'),
    };
  }, [isMobileBrowser, selectedStudentForDocsId, selectedStudentForGanttId]);

  const handleMobilePagePointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const gesture = mobilePageSwipeRef.current;
    mobilePageSwipeRef.current = { pointerId: null, startX: 0, startY: 0, ignored: false };
    if (!isMobileBrowser || gesture.ignored || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (Math.abs(deltaX) < 64 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    const currentIndex = PRIMARY_TABS.indexOf(activeTab as typeof PRIMARY_TABS[number]);
    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    if (currentIndex >= 0 && nextIndex >= 0 && nextIndex < PRIMARY_TABS.length) navigatePrimaryTab(PRIMARY_TABS[nextIndex]);
  }, [activeTab, isMobileBrowser, navigatePrimaryTab]);
  // Multi-select target region dropdown state
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);


  const selectedStudentForDocs = useMemo(() => students.find(s => s.id === selectedStudentForDocsId) || null, [students, selectedStudentForDocsId]);
  const selectedStudentForGantt = useMemo(() => students.find(s => s.id === selectedStudentForGanttId) || null, [students, selectedStudentForGanttId]);

  const [showArchived, setShowArchived] = useState(false);
  const [hideCompletedApps, setHideCompletedApps] = useState(false);
  const [highlightTargetId, setHighlightTargetId] = useState(null);

  const [seasons, setSeasons] = useState(INITIAL_SEASONS);
  const [activeSeasonId, setActiveSeasonId] = useState(INITIAL_ACTIVE_SEASON_ID);
  const [isRecycleBinMode, setIsRecycleBinMode] = useState(false);
  const [showSeasonModal, setShowSeasonModal] = useState(false);

  const [alertConfig, setAlertConfig] = useState(DEFAULT_ALERT_CONFIG);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [overrideStudentId, setOverrideStudentId] = useState('');

  const [ignoredAlerts, setIgnoredAlerts] = useState(new Set());
  const [completedAlerts, setCompletedAlerts] = useState({});
  // A calendar deletion is a reversible view decision.  We remember the
  // database signature that was hidden instead of erasing the source field;
  // changing that source makes the bubble visible again automatically.
  const [dismissedCalendarEvents, setDismissedCalendarEvents] = useState({});
  // Exact pre-click snapshots make calendar completion truly reversible (in
  // particular the "check every material" operation).
  const [calendarCompletionBackups, setCalendarCompletionBackups] = useState({});
  const [showCompletedModal, setShowCompletedModal] = useState(false);

  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [showAppModal, setShowAppModal] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [appFormNotes, setAppFormNotes] = useState([]);
  
  const [editingAppStudentId, setEditingAppStudentId] = useState(null);
  const [settingsForm, setSettingsForm] = useState(null);
  const [studentForm, setStudentForm] = useState(null);
  const [appForm, setAppForm] = useState(null);
  
  const [addingDocCategory, setAddingDocCategory] = useState(null);
  const [newDocLabel, setNewDocLabel] = useState('');
  const [addingDocInPreset, setAddingDocInPreset] = useState(null);
  const [newDocInPreset, setNewDocInPreset] = useState('');

  const [addingSpecificDocToApp, setAddingSpecificDocToApp] = useState(null);
  const [newSpecificDocLabel, setNewSpecificDocLabel] = useState('');

  const [dataFolderPath, setDataFolderPath] = useState(null);
  const [showDataModal, setShowDataModal] = useState(false);
  const [dataStatus, setDataStatus] = useState('演示模式（未配置存档）');
  const [dataLoaded, setDataLoaded] = useState(false);
  const saveTimerRef = useRef(null);

  // ─── 云端同步状态 ────────────────────────────────────────────────────────
  const [cloudSession, setCloudSession] = useState<CloudSession | null>(null);
  const [impersonatedSession, setImpersonatedSession] = useState<CloudSession | null>(null);
  // True when sub_admin is viewing their OWN teaching panel (not impersonation, not admin panel)
  const [subAdminSelfMode, setSubAdminSelfMode] = useState(false);
  const [readOnlyViewer, setReadOnlyViewer] = useState(false);
  const appRootRef = useRef<HTMLDivElement | null>(null);
  const [plannerStudentContext, setPlannerStudentContext] = useState<PlannerStudentSummary | null>(null);
  const [plannerAccounts, setPlannerAccounts] = useState<PlannerAccount[]>([]);
  const [plannerAccountsError, setPlannerAccountsError] = useState('');
  const [showLoginScreen, setShowLoginScreen] = useState(false);
  const [isKickedOut, setIsKickedOut] = useState(false);
  const [isLockedByAdmin, setIsLockedByAdmin] = useState(false);
  // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  const [syncStatus, setSyncStatus] = useState<string>('idle');

  // Ref snapshots used for delta sync comparison
  const lastSyncedStudentsRef = useRef<unknown[]>([]);
  const lastSyncedSeasonsRef = useRef<unknown[]>([]);
  const lastSyncedSettingsRef = useRef<string>('');
  const lastSyncedCalendarRef = useRef<string>('');
  const cloudSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudRequestRef = useRef<Promise<any> | null>(null);
  // Every login, impersonation and planner-student view owns a distinct epoch.
  // Late responses from the previous identity must never be applied to the new
  // screen, even when the old network request cannot be cancelled.
  const accountEpochRef = useRef(0);
  // No cloud write is allowed until init_load (or the equivalent admin load)
  // has successfully established this account's deletion baseline.  This is
  // the key guard against a slow/failed network load turning temporary empty
  // React state into a destructive upload.
  const cloudSnapshotReadyRef = useRef(false);
  const lastSyncAtRef = useRef<string>(getLastSyncAt());
  // Track archive seasons already loaded from cloud (to avoid re-fetching)
  const loadedArchiveSeasonIds = useRef<Set<string>>(new Set());

  // Serialize explicit saves, automatic saves and refreshes.  Without this,
  // a quick tap on "save" while the debounced sync is starting can send two
  // competing last-write-wins requests from the same screen.
  const runCloudSync = useCallback(async (session: CloudSession, payload: any) => {
    if (cloudRequestRef.current) {
      try { await cloudRequestRef.current; } catch {}
    }
    const request = syncDelta(session, payload);
    cloudRequestRef.current = request;
    try {
      return await request;
    } finally {
      if (cloudRequestRef.current === request) cloudRequestRef.current = null;
    }
  }, []);

  // A planner must not merely be prevented from saving: native controls must
  // also remain genuinely non-editable in the browser.  Event cancellation
  // alone is insufficient because Safari/Chromium can still mutate the DOM
  // value before React observes the event.  Apply native read-only/disabled
  // state to current and lazily rendered controls while keeping navigation,
  // help, font and logout buttons usable through the existing click guard.
  useEffect(() => {
    if (!readOnlyViewer || !appRootRef.current) return;
    const root = appRootRef.current;
    const includingScope = <T extends Element,>(scope: ParentNode, selector: string): T[] => {
      const matches = scope instanceof Element && scope.matches(selector) ? [scope as T] : [];
      return [...matches, ...Array.from(scope.querySelectorAll<T>(selector))];
    };
    const lockControls = (scope: ParentNode) => {
      includingScope<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(scope, 'input, textarea, select').forEach((control) => {
        if (control.closest('[data-readonly-allow="true"]')) return;
        if (control instanceof HTMLSelectElement || ['checkbox', 'radio', 'file', 'range', 'color', 'date', 'datetime-local', 'time', 'month', 'week'].includes((control as HTMLInputElement).type)) {
          control.disabled = true;
          control.dataset.plannerReadonlyDisabled = 'true';
        } else {
          control.readOnly = true;
          control.dataset.plannerReadonlyInput = 'true';
        }
      });
      includingScope<HTMLElement>(scope, '[contenteditable="true"]').forEach((control) => {
        if (control.closest('[data-readonly-allow="true"]')) return;
        control.setAttribute('contenteditable', 'false');
        control.dataset.plannerReadonlyContent = 'true';
      });
      includingScope<HTMLButtonElement>(scope, 'button').forEach((button) => {
        if (button.closest('[data-readonly-allow="true"]') || button.disabled) return;
        button.disabled = true;
        button.dataset.plannerReadonlyDisabled = 'true';
      });
    };
    lockControls(root);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) lockControls(node);
      }));
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      root.querySelectorAll<HTMLElement>('[data-planner-readonly-disabled="true"]').forEach((control) => {
        (control as HTMLInputElement | HTMLSelectElement).disabled = false;
        delete control.dataset.plannerReadonlyDisabled;
      });
      root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-planner-readonly-input="true"]').forEach((control) => {
        control.readOnly = false;
        delete control.dataset.plannerReadonlyInput;
      });
      root.querySelectorAll<HTMLElement>('[data-planner-readonly-content="true"]').forEach((control) => {
        control.setAttribute('contenteditable', 'true');
        delete control.dataset.plannerReadonlyContent;
      });
    };
  }, [readOnlyViewer]);

  // only students is not enough: a stale active season or settings can make a
  // newly created student invisible after the next server load.
  const resetAccountScopedData = useCallback(() => {
    accountEpochRef.current += 1;
    cloudSnapshotReadyRef.current = false;
    lastSyncedStudentsRef.current = [];
    lastSyncedSeasonsRef.current = [];
    lastSyncedSettingsRef.current = '';
    lastSyncedCalendarRef.current = '';
    lastSyncAtRef.current = '1970-01-01T00:00:00';
    setStudents([]);
    // An account boundary must be genuinely empty.  Default/template seasons
    // used to make a newly registered teacher look as if it already owned
    // data, and could also be written back before the first real season was
    // created.  Existing accounts receive their exact season list from their
    // own cloud/local snapshot below; a new account must create one explicitly.
    setSeasons([]);
    setActiveSeasonId('');
    setIsRecycleBinMode(false);
    setCalendarEvents([]);
    setAlertConfig({ ...DEFAULT_ALERT_CONFIG });
    setIgnoredAlerts(new Set());
    setCompletedAlerts({});
    setDismissedCalendarEvents({});
    setCalendarCompletionBackups({});
    setSystemWarningsTimeOverrides({});
    setCustomPresets([]);
    setSourceRegions([...DEFAULT_SOURCE_REGIONS]);
    setTargetRegions([...DEFAULT_TARGET_REGIONS]);
    setSourceStages([...DEFAULT_SOURCE_STAGES]);
    setTargetStages([...DEFAULT_TARGET_STAGES]);
    setSelectedStudentForDocsId(null);
    setSelectedStudentForGanttId(null);
    setPlannerAccounts([]);
    setPlannerAccountsError('');
    loadedArchiveSeasonIds.current = new Set();
  }, []);

  // Logging into a different account must be a full data boundary.  Resetting
  // only students is not enough: a stale active season or settings can make a
  // ─── 辅助函数：将本地 JSON 数据应用到 state ────────────────────────────────
  const applyLocalData = useCallback((data: Record<string, unknown>) => {
    if (!data) return;
    if (data.students) setStudents(migrateStudents(data.students as unknown[]));
    if (Array.isArray(data.seasons)) {
      const localSeasons = data.seasons as Array<{ id?: string; isArchived?: boolean }>;
      const restoredSeasonId = resolveActiveSeasonId(localSeasons, data.activeSeasonId);
      setSeasons(localSeasons);
      setActiveSeasonId(restoredSeasonId);
      setIsRecycleBinMode(!!localSeasons.find(s => s.id === restoredSeasonId)?.isArchived);
    }
    if (data.alertConfig) setAlertConfig((prev) => ({ ...prev, ...(data.alertConfig as object) }));
    if (data.ignoredAlerts) setIgnoredAlerts(new Set(data.ignoredAlerts as string[]));
    if (data.completedAlerts) {
      if (Array.isArray(data.completedAlerts)) {
        const migrated: Record<string, unknown> = {};
        (data.completedAlerts as string[]).forEach((id) => {
          if (typeof id === 'string') migrated[id] = { timestamp: Date.now(), alert: { id, title: '历史已完成项目', type: 'info', message: '已标记为完成状态' } };
        });
        setCompletedAlerts(migrated);
      } else {
        setCompletedAlerts(data.completedAlerts as Record<string, unknown>);
      }
    }
    if (data.calendarEvents) setCalendarEvents(data.calendarEvents as unknown[]);
    if (data.dismissedCalendarEvents) setDismissedCalendarEvents(data.dismissedCalendarEvents as Record<string, string>);
    if (data.calendarCompletionBackups) setCalendarCompletionBackups(data.calendarCompletionBackups as Record<string, unknown>);
    if (data.systemWarningsTimeOverrides) setSystemWarningsTimeOverrides(data.systemWarningsTimeOverrides as Record<string, unknown>);
    if (data.customPresets) setCustomPresets(data.customPresets as unknown[]);
    if (data.sourceRegions) setSourceRegions(data.sourceRegions as string[]);
    if (data.targetRegions) setTargetRegions(data.targetRegions as string[]);
    if (data.sourceStages) setSourceStages(data.sourceStages as string[]);
    if (data.targetStages) setTargetStages(data.targetStages as string[]);
  }, []);

  // ─── 辅助函数：将云端 initLoad 结果应用到 state ─────────────────────────
  const applyCloudData = useCallback((cloudData: {
    students?: Array<{ student_id: string; data_json: string }>;
    seasons?: Array<{ season_id: string; data_json: string; is_archived?: boolean }>;
    settings?: string | null;
    calendar?: string | null;
  }) => {
    if (!cloudData) return;
    // A full cloud load intentionally excludes archived students.  Forget the
    // per-season cold-load cache so that an archived season selected after a
    // refresh is fetched again instead of remaining falsely empty.
    if (Array.isArray(cloudData.students) || Array.isArray(cloudData.seasons)) {
      loadedArchiveSeasonIds.current = new Set();
    }
    let parsedSettings: any = null;
    if (cloudData.settings) {
      try { parsedSettings = typeof cloudData.settings === 'string' ? JSON.parse(cloudData.settings) : cloudData.settings; } catch {}
    }
    if (Array.isArray(cloudData.students)) {
      const studentObjs = cloudData.students.map((r) => {
        try { return JSON.parse(r.data_json); } catch { return null; }
      }).filter(Boolean);
      const migrated = migrateStudents(studentObjs);
      setStudents(migrated);
      lastSyncedStudentsRef.current = JSON.parse(JSON.stringify(migrated));
    }
    if (Array.isArray(cloudData.seasons)) {
      const seasonObjs = cloudData.seasons.map((r) => {
        try {
          const d = JSON.parse(r.data_json);
          // Ensure isArchived is synced from the DB flag
          return { ...d, isArchived: r.is_archived ?? d.isArchived };
        } catch { return null; }
      }).filter(Boolean);
      setSeasons(seasonObjs);
      const restoredSeasonId = resolveActiveSeasonId(seasonObjs, parsedSettings?.activeSeasonId);
      setActiveSeasonId(restoredSeasonId);
      setIsRecycleBinMode(!!seasonObjs.find((s: any) => s.id === restoredSeasonId)?.isArchived);
      lastSyncedSeasonsRef.current = JSON.parse(JSON.stringify(seasonObjs));
    }
    if (cloudData.settings) {
      try {
        const settings = parsedSettings;
        if (settings && typeof settings === 'object') {
          if (settings.alertConfig) setAlertConfig((prev) => ({ ...prev, ...settings.alertConfig }));
          if (settings.ignoredAlerts) setIgnoredAlerts(new Set(settings.ignoredAlerts));
          if (settings.completedAlerts) {
            if (Array.isArray(settings.completedAlerts)) {
              const migrated: Record<string, unknown> = {};
              (settings.completedAlerts as string[]).forEach((id) => {
                if (typeof id === 'string') migrated[id] = { timestamp: Date.now(), alert: { id, title: '历史已完成项目', type: 'info', message: '已标记为完成状态' } };
              });
              setCompletedAlerts(migrated);
            } else {
              setCompletedAlerts(settings.completedAlerts);
            }
          }
          // The season list above owns the fallback decision.  Do not restore a
          // stale/non-existent id from an old settings snapshot.
          if (!Array.isArray(cloudData.seasons) && settings.activeSeasonId) setActiveSeasonId(settings.activeSeasonId);
          if (settings.customPresets) setCustomPresets(settings.customPresets);
          if (settings.sourceRegions) setSourceRegions(settings.sourceRegions);
          if (settings.targetRegions) setTargetRegions(settings.targetRegions);
          if (settings.sourceStages) setSourceStages(settings.sourceStages);
          if (settings.targetStages) setTargetStages(settings.targetStages);
          if (settings.systemWarningsTimeOverrides) setSystemWarningsTimeOverrides(settings.systemWarningsTimeOverrides);
          if (settings.dismissedCalendarEvents) setDismissedCalendarEvents(settings.dismissedCalendarEvents);
          if (settings.calendarCompletionBackups) setCalendarCompletionBackups(settings.calendarCompletionBackups);
        }
        lastSyncedSettingsRef.current = typeof cloudData.settings === 'string' ? cloudData.settings : JSON.stringify(cloudData.settings);
      } catch (e) { console.warn('Failed to parse cloud settings:', e); }
    } else if ('settings' in cloudData) {
      // A full init-load is authoritative. An account with no settings must
      // not inherit presets, alert state, or season selection from whichever
      // account was displayed immediately before it.
      setAlertConfig({ ...DEFAULT_ALERT_CONFIG });
      setIgnoredAlerts(new Set());
      setCompletedAlerts({});
      setDismissedCalendarEvents({});
      setCalendarCompletionBackups({});
      setSystemWarningsTimeOverrides({});
      setCustomPresets([]);
      setSourceRegions([...DEFAULT_SOURCE_REGIONS]);
      setTargetRegions([...DEFAULT_TARGET_REGIONS]);
      setSourceStages([...DEFAULT_SOURCE_STAGES]);
      setTargetStages([...DEFAULT_TARGET_STAGES]);
      lastSyncedSettingsRef.current = '';
    }
    if (cloudData.calendar) {
      try {
        const cal = typeof cloudData.calendar === 'string' ? JSON.parse(cloudData.calendar) : cloudData.calendar;
        if (Array.isArray(cal)) setCalendarEvents(cal);
        lastSyncedCalendarRef.current = typeof cloudData.calendar === 'string' ? cloudData.calendar : JSON.stringify(cal);
      } catch {}
    } else if ('calendar' in cloudData) {
      // null is the server's explicit representation of an empty calendar.
      // Treating it as "do nothing" was the direct cause of another teacher's
      // calendar remaining visible after opening a newly-created account.
      setCalendarEvents([]);
      lastSyncedCalendarRef.current = '';
    }
  }, []);

  // ─── 辅助函数：将云端增量数据（syncDelta）合并到 state ─────────────────────
  const mergeCloudData = useCallback((cloudData: {
    students?: Array<{ student_id: string; data_json: string; is_deleted?: boolean }>;
    seasons?: Array<{ season_id: string; data_json: string; is_archived?: boolean; is_deleted?: boolean }>;
    settings?: string | null;
    calendar?: string | null;
  }, oldSyncedStudentsSnapshot?: any[], oldSyncedSeasonsSnapshot?: any[], oldSyncedSettingsSnapshot?: string | null, oldSyncedCalendarSnapshot?: string | null) => {
    if (!cloudData) return;
    if (Array.isArray(cloudData.students) && cloudData.students.length > 0) {
      setStudents(prev => {
        let next = [...prev];
        let syncedStudentsList = [...(lastSyncedStudentsRef.current || [])];
        const compareStudentsList = oldSyncedStudentsSnapshot || syncedStudentsList;
        cloudData.students!.forEach(ds => {
          const localStudent = next.find(s => s.id === ds.student_id);
          const syncedStudent = compareStudentsList.find(s => s.id === ds.student_id);
          const isModified = JSON.stringify(localStudent) !== JSON.stringify(syncedStudent);

          if (ds.is_deleted) {
            if (!isModified) {
              next = next.filter(s => s.id !== ds.student_id);
              syncedStudentsList = syncedStudentsList.filter(s => s.id !== ds.student_id);
            }
          } else {
            try {
              const parsed = JSON.parse(ds.data_json);
              const migrated = migrateStudents([parsed])[0];
              if (migrated) {
                if (!isModified) {
                  const idx = next.findIndex(s => s.id === ds.student_id);
                  if (idx >= 0) next[idx] = migrated;
                  else next.push(migrated);
                }

                const syncedIdx = syncedStudentsList.findIndex(s => s.id === ds.student_id);
                if (syncedIdx >= 0) syncedStudentsList[syncedIdx] = migrated;
                else syncedStudentsList.push(migrated);
              }
            } catch {}
          }
        });
        lastSyncedStudentsRef.current = syncedStudentsList;
        return next;
      });
    }

    if (Array.isArray(cloudData.seasons) && cloudData.seasons.length > 0) {
      setSeasons(prev => {
        let next = [...prev];
        let syncedSeasonsList = [...(lastSyncedSeasonsRef.current || [])];
        const compareSeasonsList = oldSyncedSeasonsSnapshot || syncedSeasonsList;
        cloudData.seasons!.forEach(ds => {
          const localSeason = next.find(s => s.id === ds.season_id);
          const syncedSeason = compareSeasonsList.find(s => s.id === ds.season_id);
          const isModified = JSON.stringify(localSeason) !== JSON.stringify(syncedSeason);

          if (ds.is_deleted) {
            if (!isModified) {
              next = next.filter(s => s.id !== ds.season_id);
              syncedSeasonsList = syncedSeasonsList.filter(s => s.id !== ds.season_id);
            }
          } else {
            try {
              const parsed = JSON.parse(ds.data_json);
              const migrated = { ...parsed, isArchived: ds.is_archived ?? parsed.isArchived };
              if (!isModified) {
                const idx = next.findIndex(s => s.id === ds.season_id);
                if (idx >= 0) next[idx] = migrated;
                else next.push(migrated);
              }

              const syncedIdx = syncedSeasonsList.findIndex(s => s.id === ds.season_id);
              if (syncedIdx >= 0) syncedSeasonsList[syncedIdx] = migrated;
              else syncedSeasonsList.push(migrated);
            } catch {}
          }
        });
        lastSyncedSeasonsRef.current = syncedSeasonsList;
        return next;
      });
    }

    if (cloudData.settings) {
      try {
        const settings = typeof cloudData.settings === 'string' ? JSON.parse(cloudData.settings) : cloudData.settings;
        if (settings && typeof settings === 'object') {
          const currentSettings = { alertConfig, ignoredAlerts: [...ignoredAlerts], completedAlerts, dismissedCalendarEvents, calendarCompletionBackups, activeSeasonId, customPresets, sourceRegions, targetRegions, sourceStages, targetStages, systemWarningsTimeOverrides };
          const settingsJson = JSON.stringify(currentSettings);
          const compareSettings = oldSyncedSettingsSnapshot !== undefined ? oldSyncedSettingsSnapshot : lastSyncedSettingsRef.current;
          const isSettingsModified = settingsJson !== compareSettings;

          if (!isSettingsModified) {
            if (settings.alertConfig) setAlertConfig((prev) => ({ ...prev, ...settings.alertConfig }));
            if (settings.ignoredAlerts) setIgnoredAlerts(new Set(settings.ignoredAlerts));
            if (settings.completedAlerts) {
              if (Array.isArray(settings.completedAlerts)) {
                const migrated: Record<string, unknown> = {};
                (settings.completedAlerts as string[]).forEach((id) => {
                  if (typeof id === 'string') migrated[id] = { timestamp: Date.now(), alert: { id, title: '历史已完成项目', type: 'info', message: '已标记为完成状态' } };
                });
                setCompletedAlerts(migrated);
              } else {
                setCompletedAlerts(settings.completedAlerts);
              }
            }
            if (settings.activeSeasonId) setActiveSeasonId(settings.activeSeasonId);
            if (settings.customPresets) setCustomPresets(settings.customPresets);
            if (settings.sourceRegions) setSourceRegions(settings.sourceRegions);
            if (settings.targetRegions) setTargetRegions(settings.targetRegions);
            if (settings.sourceStages) setSourceStages(settings.sourceStages);
            if (settings.targetStages) setTargetStages(settings.targetStages);
            if (settings.systemWarningsTimeOverrides) setSystemWarningsTimeOverrides(settings.systemWarningsTimeOverrides);
            if (settings.dismissedCalendarEvents) setDismissedCalendarEvents(settings.dismissedCalendarEvents);
            if (settings.calendarCompletionBackups) setCalendarCompletionBackups(settings.calendarCompletionBackups);
          }

          lastSyncedSettingsRef.current = typeof cloudData.settings === 'string' ? cloudData.settings : JSON.stringify(cloudData.settings);
        }
      } catch {}
    }

    if (cloudData.calendar) {
      try {
        const cal = typeof cloudData.calendar === 'string' ? JSON.parse(cloudData.calendar) : cloudData.calendar;
        if (Array.isArray(cal)) {
          const compareCalendar = oldSyncedCalendarSnapshot !== undefined ? oldSyncedCalendarSnapshot : lastSyncedCalendarRef.current;
          const isCalendarModified = JSON.stringify(calendarEvents) !== compareCalendar;
          if (!isCalendarModified) {
            setCalendarEvents(cal);
          }
          lastSyncedCalendarRef.current = typeof cloudData.calendar === 'string' ? cloudData.calendar : JSON.stringify(cal);
        }
      } catch {}
    }
  }, [
    alertConfig,
    ignoredAlerts,
    completedAlerts,
    dismissedCalendarEvents,
    calendarCompletionBackups,
    activeSeasonId,
    customPresets,
    sourceRegions,
    targetRegions,
    sourceStages,
    targetStages,
    systemWarningsTimeOverrides,
    calendarEvents
  ]);

  // init_load intentionally omits archived-season students for speed.  Load
  // them exactly once when an archived season is opened, otherwise a restart
  // makes historical records look as if they disappeared.
  useEffect(() => {
    const selectedSeason = seasons.find(s => s.id === activeSeasonId);
    const archiveSession = impersonatedSession || cloudSession;
    if (plannerStudentContext || !selectedSeason?.isArchived || !activeSeasonId || !archiveSession || archiveSession.role === 'admin' || archiveSession.role === 'planner') return;
    if (loadedArchiveSeasonIds.current.has(activeSeasonId)) return;

    let cancelled = false;
    let finished = false;
    loadedArchiveSeasonIds.current.add(activeSeasonId);
    cloudLoadArchive(archiveSession, activeSeasonId)
      .then((result) => {
        if (cancelled) return;
        const restored = migrateStudents((result.students || []).map(record => {
          try { return JSON.parse(record.data_json); } catch { return null; }
        }).filter(Boolean));
        finished = true;
        if (!restored.length) return;
        setStudents(prev => {
          const existingIds = new Set(prev.map(student => student.id));
          return [...prev, ...restored.filter(student => !existingIds.has(student.id))];
        });
        const synced = lastSyncedStudentsRef.current as any[];
        const syncedIds = new Set(synced.map(student => student.id));
        lastSyncedStudentsRef.current = [...synced, ...restored.filter(student => !syncedIds.has(student.id))];
      })
      .catch((error) => {
        loadedArchiveSeasonIds.current.delete(activeSeasonId);
        console.warn('Failed to load archived season:', error);
      });

    return () => {
      cancelled = true;
      // If dependencies changed while the request was still in flight, allow
      // the replacement effect to retry.  Keeping the marker here would turn
      // a harmless race into a permanently empty archive view.
      if (!finished) loadedArchiveSeasonIds.current.delete(activeSeasonId);
    };
  }, [activeSeasonId, seasons, cloudSession, impersonatedSession, plannerStudentContext]);

  useEffect(() => {
    if (!impersonatedSession || impersonatedSession.role === 'planner') return;
    const loadEpoch = accountEpochRef.current;
    const loadImpersonatedData = async () => {
      // Never allow the normal auto-sync effect to see the previous account's
      // state while changing identity.  Otherwise a failed/slow load can turn
      // the temporarily empty UI into deletions for the target teacher.
      setDataLoaded(false);
      setSyncStatus('syncing');
      try {
        // The server requires the lock that was acquired before this session
        // was created, so only load data for the locked target account.
        const adminToken = cloudSession?.token || impersonatedSession.token;
        let cloudData;
        try {
          cloudData = await adminInitLoad(adminToken, impersonatedSession.username);
        } catch (adminErr: any) {
          throw new Error(adminErr?.response?.data?.detail || adminErr?.message || String(adminErr));
        }
        if (loadEpoch !== accountEpochRef.current) return;
        applyCloudData(cloudData);
        setCalendarEvents(prev => prev.filter(event => !event?.isAlert));
        lastSyncAtRef.current = cloudData.server_sync_time;
        setLastSyncAt(cloudData.server_sync_time);
        setSyncStatus('synced');
        setDataStatus(`已从云端加载 (${impersonatedSession.username})`);
        cloudSnapshotReadyRef.current = true;
        setDataLoaded(true);
        } catch (e: unknown) {
          if (loadEpoch !== accountEpochRef.current) return;
          console.error('Failed to load impersonated user data:', e);
        setSyncStatus('error');
        setDataStatus('无法加载该用户的云端数据');
        // Return safely to the dashboard.  Staying in impersonation mode after
        // a failed load would leave an empty editor associated with this user.
        try {
          if (cloudSession && (cloudSession.role === 'admin' || cloudSession.role === 'sub_admin')) await adminUnlockUser(cloudSession.token, impersonatedSession.username);
        } catch (unlockError) {
          console.error('Failed to unlock user after load failure:', unlockError);
        }
        setImpersonatedSession(null);
        cloudSnapshotReadyRef.current = false;
        setDataLoaded(true);
        alert('无法加载该用户数据: ' + ((e as Error).message || String(e)));
      }
    };
    loadImpersonatedData();
  }, [impersonatedSession, applyCloudData, cloudSession]);

  useEffect(() => {
    const init = async () => {
      const session = cloudSession || loadSession();

      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        if (session && session.username !== 'test_user') {
          setCloudSession(session);
          // Unit tests inject an already-established session and bypass the
          // production login/init_load screen.  Treat that fixture as having
          // an established baseline; production never enters this branch.
          cloudSnapshotReadyRef.current = true;
        }
        setShowLoginScreen(false);
        let hasLocalData = false;

        if (window.electronAPI) {
          try {
            const storedPath = await window.electronAPI.getStoredPath();
            if (storedPath) {
              setDataFolderPath(storedPath);
              const data = await window.electronAPI.loadData(storedPath);
              if (data) { applyLocalData(data); hasLocalData = true; setDataStatus("已加载"); }
            }
          } catch (e) { console.error("Electron load error:", e); }
        }

        if (!hasLocalData) {
          try {
            const localDataStr = localStorage.getItem("教务数据");
            if (localDataStr) {
              const data = JSON.parse(localDataStr);
              if (data) { applyLocalData(data); hasLocalData = true; setDataStatus("已从本地缓存加载"); }
            }
          } catch (e) { console.error("Local Storage load error:", e); }
        }
        
        setDataLoaded(true);
        return;
      } else {
        if (window.electronAPI) {
          try {
            const storedPath = await window.electronAPI.getStoredPath();
            if (storedPath) {
              setDataFolderPath(storedPath);
            }
          } catch (e) { console.error("Electron stored path error:", e); }
        }
        setShowLoginScreen(true);
        setDataLoaded(true);
        return;
      }

    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps


  }, []);

  // Periodic lockout heartbeat (Milestone 4)
  useEffect(() => {
    if (!cloudSession) return;

    const interval = setInterval(async () => {
      try {
        const verifyResult = await verifySession(cloudSession);
        if ((cloudSession.role === 'admin' || cloudSession.role === 'sub_admin' || cloudSession.role === 'planner')) {
          if (verifyResult === 'expired' || verifyResult === 'error') {
            setDataLoaded(false);
            clearSession();
            setCloudSession(null);
            setImpersonatedSession(null);
            resetAccountScopedData();
            setShowLoginScreen(true);
            setSyncStatus('idle');
          }
        } else {
          if (verifyResult === 'locked_by_admin') {
            setDataLoaded(false);
            clearSession();
            setCloudSession(null);
            resetAccountScopedData();
            setIsKickedOut(true);
            setIsLockedByAdmin(true);
            setShowLoginScreen(true);
            setSyncStatus('idle');
          } else if (verifyResult === 'kicked_out') {
            setDataLoaded(false);
            clearSession();
            setCloudSession(null);
            resetAccountScopedData();
            setIsKickedOut(true);
            setIsLockedByAdmin(false);
            setShowLoginScreen(true);
            setSyncStatus('idle');
          }
        }
      } catch (e) {
        console.error('Periodic heartbeat verifySession failed:', e);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [cloudSession]);

  const doSave = useCallback(async (path, payload) => {
    if (!path || !window.electronAPI) return;
    const ok = await saveDataHelper(path, payload);
    setDataStatus(ok ? `已自动保存` : '保存失败');
  }, []);

  useEffect(() => {
    if (syncStatus === 'syncing') return;
    if (!dataLoaded) return;
    if (syncStatus === 'offline') return;
    if (readOnlyViewer) return;
    // Browser sessions are cloud-only.  Account data is intentionally never
    // written to or restored from localStorage; the normal cloud delta path
    // below is the sole persistence mechanism.
    
    // ======== AUTO-SAVE TO LOCAL DESKTOP FOLDER ========
    if (window.electronAPI && dataFolderPath) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        doSave(dataFolderPath, {
          version: 1,
          students,
          seasons,
          alertConfig,
          ignoredAlerts: [...ignoredAlerts],
          completedAlerts,
          dismissedCalendarEvents,
          calendarCompletionBackups,
          activeSeasonId,
          calendarEvents,
          systemWarningsTimeOverrides,
          customPresets,
          sourceRegions,
          targetRegions,
          sourceStages,
          targetStages
        });
      }, 1200);
    }

    // ─── 触发云端增量同步 ───
    // A sub-admin is an administrator while on the dashboard.  Do not let
    // that mode auto-save/auto-sync its temporary dashboard state as teacher
    // data.  It becomes a sync session only after its own cloud data loaded.
    const activeSyncSession = (impersonatedSession?.role === 'user' ? impersonatedSession : null) || (
      cloudSession && (
        cloudSession.role === 'user' ||
        (cloudSession.role === 'sub_admin' && subAdminSelfMode)
      ) ? cloudSession : null
    );
    if (activeSyncSession) {
      if (!cloudSnapshotReadyRef.current) return;
      if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
      cloudSyncTimerRef.current = setTimeout(async () => {
        const syncEpoch = accountEpochRef.current;
        try {
          // 找出变化的 students
          const changedStudents: StudentSyncRecord[] = [];
          const oldStudents = lastSyncedStudentsRef.current as any[];
          students.forEach(stu => {
            const old = oldStudents.find(s => s.id === stu.id);
            const dataJson = JSON.stringify(stu);
            if (!old || JSON.stringify(old) !== dataJson) {
              changedStudents.push({ student_id: stu.id, data_json: dataJson, updated_at: new Date().toISOString() });
            }
          });
          // 检查是否有被删除的 students
          oldStudents.forEach(old => {
            if (!students.find(s => s.id === old.id)) {
              changedStudents.push({ student_id: old.id, data_json: '{}', updated_at: new Date().toISOString(), is_deleted: true });
            }
          });

          // 找出变化的 seasons
          const changedSeasons: SeasonSyncRecord[] = [];
          const oldSeasons = lastSyncedSeasonsRef.current as any[];
          seasons.forEach(season => {
            const old = oldSeasons.find(s => s.id === season.id);
            const dataJson = JSON.stringify(season);
            if (!old || JSON.stringify(old) !== dataJson) {
              changedSeasons.push({ season_id: season.id, data_json: dataJson, is_archived: !!season.isArchived, updated_at: new Date().toISOString() });
            }
          });
          oldSeasons.forEach(old => {
            if (!seasons.find(s => s.id === old.id)) {
              changedSeasons.push({ season_id: old.id, data_json: '{}', is_archived: !!old.isArchived, updated_at: new Date().toISOString(), is_deleted: true });
            }
          });

          // 找出变化的 settings / calendar
          const currentSettings = { alertConfig, ignoredAlerts: [...ignoredAlerts], completedAlerts, dismissedCalendarEvents, calendarCompletionBackups, activeSeasonId, customPresets, sourceRegions, targetRegions, sourceStages, targetStages, systemWarningsTimeOverrides };
          const settingsJson = JSON.stringify(currentSettings);
          const calendarJson = JSON.stringify(calendarEvents);
          const sendSettings = settingsJson !== lastSyncedSettingsRef.current ? currentSettings : null;
          const sendCalendar = calendarJson !== lastSyncedCalendarRef.current ? calendarEvents : null;

          if (changedStudents.length === 0 && changedSeasons.length === 0 && !sendSettings && !sendCalendar) {
            return; // 无需同步
          }

          setSyncStatus('syncing');
          const res = await runCloudSync(activeSyncSession, {
            changedStudents,
            changedSeasons,
            settings: sendSettings,
            calendar: sendCalendar,
            lastSyncAt: lastSyncAtRef.current
          });
          if (syncEpoch !== accountEpochRef.current) return;

          // 更新快照
          const oldSyncedStudents = [...(lastSyncedStudentsRef.current || [])];
          const oldSyncedSeasons = [...(lastSyncedSeasonsRef.current || [])];
          const oldSyncedSettings = lastSyncedSettingsRef.current;
          const oldSyncedCalendar = lastSyncedCalendarRef.current;

          lastSyncedStudentsRef.current = JSON.parse(JSON.stringify(students));
          lastSyncedSeasonsRef.current = JSON.parse(JSON.stringify(seasons));
          lastSyncedSettingsRef.current = settingsJson;
          lastSyncedCalendarRef.current = calendarJson;
          if (res) {
            lastSyncAtRef.current = res.server_sync_time;
            setLastSyncAt(res.server_sync_time);

            if (res.downloaded && ((res.downloaded.students && res.downloaded.students.length > 0) || (res.downloaded.seasons && res.downloaded.seasons.length > 0) || res.downloaded.settings || res.downloaded.calendar)) {
              mergeCloudData(res.downloaded, oldSyncedStudents, oldSyncedSeasons, oldSyncedSettings, oldSyncedCalendar);
            }
          }

          setSyncStatus('synced');
        } catch (e: unknown) {
          if (syncEpoch !== accountEpochRef.current) return;
          const msg = (e as Error).message || '';
          if (msg.includes('LOCKED_BY_ADMIN')) {
            setDataLoaded(false);
            clearSession();
            setCloudSession(null);
            setImpersonatedSession(null);
            resetAccountScopedData();
            setIsKickedOut(true);
            setIsLockedByAdmin(true);
            setShowLoginScreen(true);
            setSyncStatus('idle');
          } else if (msg.includes('KICKED_OUT')) {
            setDataLoaded(false);
            clearSession();
            setCloudSession(null);
            setImpersonatedSession(null);
            resetAccountScopedData();
            setIsKickedOut(true);
            setIsLockedByAdmin(false);
            setShowLoginScreen(true);
            setSyncStatus('idle');
          } else {
            console.error('Delta sync failed:', e);
            setSyncStatus('error');
          }
        }
      }, 3000); // 延迟 3 秒防抖云端同步
    }

    const currentSession = cloudSession || loadSession();
    if ((currentSession?.role === 'admin' || (currentSession?.role === 'sub_admin' && !subAdminSelfMode))) return;
    if (!dataFolderPath) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      doSave(dataFolderPath, { version: 1, students, seasons, alertConfig, ignoredAlerts: [...ignoredAlerts], completedAlerts, dismissedCalendarEvents, calendarCompletionBackups, activeSeasonId, calendarEvents, systemWarningsTimeOverrides, customPresets, sourceRegions, targetRegions, sourceStages, targetStages });
    }, 1200);
    
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
    };
  }, [students, seasons, alertConfig, ignoredAlerts, completedAlerts, dismissedCalendarEvents, calendarCompletionBackups, activeSeasonId, dataLoaded, dataFolderPath, doSave, calendarEvents, systemWarningsTimeOverrides, customPresets, sourceRegions, targetRegions, sourceStages, targetStages, cloudSession, impersonatedSession, mergeCloudData, runCloudSync, syncStatus, subAdminSelfMode, readOnlyViewer]);


  useEffect(() => {
    if (selectedStudentForDocsId) {
      const stu = students.find(s => s.id === selectedStudentForDocsId);
      if (!stu || stu.seasonId !== activeSeasonId) setSelectedStudentForDocsId(null);
    }
    if (selectedStudentForGanttId) {
      const stu = students.find(s => s.id === selectedStudentForGanttId);
      if (!stu || stu.seasonId !== activeSeasonId) setSelectedStudentForGanttId(null);
    }
  }, [activeSeasonId, students, selectedStudentForDocsId, selectedStudentForGanttId]);

  useEffect(() => {
    if (showSettingsModal) {
      setSettingsForm({ ...alertConfig });
    }
  }, [showSettingsModal, alertConfig]);

  useEffect(() => {
    if (showStudentModal) {
      const editingStage = studentStageParts(editingStudent);
      setStudentForm({
        name: editingStudent?.name || '',
        seasonId: editingStudent?.seasonId || activeSeasonId,
        region: editingStudent?.region || '',
        nationality: editingStudent?.nationality ?? '中国',
        plannerUsername: editingStudent?.plannerUsername ?? '',
        status: editingStudent?.status || '材料收集',
        visaStart: editingStudent?.visaWindow?.[0] || '',
        visaEnd: editingStudent?.visaWindow?.[1] || '',
        precedingSchoolLocation: editingStudent?.precedingSchoolLocation ?? '',
        precedingSchoolName: editingStudent?.precedingSchoolName ?? '',
        precedingSchoolLevel: editingStudent?.precedingSchoolLevel ?? '',
        precedingSchoolCountry: editingStudent?.precedingSchoolCountry ?? '',
        precedingSchoolRankingSource: editingStudent?.precedingSchoolRankingSource ?? '',
        precedingSchoolRankingValue: editingStudent?.precedingSchoolRankingValue ?? '',
        precedingStage: editingStage.source,
        major: editingStudent?.major ?? '',
        programLength: editingStudent?.programLength ?? '',
        gpa: editingStudent?.gpa ?? '',
        gpaScale: editingStudent?.gpaScale ?? '',
        graduationStatus: editingStudent?.graduationStatus ?? '',
        currentYear: editingStudent?.background?.currentYear ?? '',
        yearsAfterGrad: editingStudent?.background?.yearsAfterGrad ?? '',
        applicationStage: editingStage.target,
        applicationRegion: editingStudent?.applicationRegion ?? '',
        address: editingStudent?.address ?? '',
        experience: editingStudent?.experience ?? '',
        awards: editingStudent?.awards ?? '',
        professionalCerts: editingStudent?.professionalCerts ?? ''
      });
      setShowRegionDropdown(false);
    }
  }, [showStudentModal, editingStudent, activeSeasonId]);

  useEffect(() => {
    if (!showStudentModal || readOnlyViewer) return;
    const plannerListSession = impersonatedSession || (
      cloudSession && (cloudSession.role === 'user' || (cloudSession.role === 'sub_admin' && subAdminSelfMode))
        ? cloudSession
        : null
    );
    if (!plannerListSession) return;
    let cancelled = false;
    setPlannerAccountsError('');
    listPlannerAccounts(plannerListSession)
      .then((result) => {
        if (!cancelled) setPlannerAccounts(result.planners || []);
      })
      .catch((error) => {
        if (cancelled) return;
        setPlannerAccounts([]);
        setPlannerAccountsError((error as Error).message || '规划老师名单读取失败');
      });
    return () => { cancelled = true; };
  }, [showStudentModal, readOnlyViewer, impersonatedSession, cloudSession, subAdminSelfMode]);

  // Close multi-select region dropdown when clicking outside
  useEffect(() => {
    if (!showRegionDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      // Close if clicked element is not inside a dropdown container
      if (!target.closest('[data-region-dropdown]')) {
        setShowRegionDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showRegionDropdown]);

  // Global click-away: cancel any active inline delete confirmation when clicking outside
  useEffect(() => {
    const hasAnyConfirm = deletingStudentConfirmId || deletingAppConfirmId || deletingRecommenderConfirmId || deletingPresetConfirmId || deletingEventConfirmId || hidingAlertConfirmId || deletingOptionConfirm || deletingDashboardAlertConfirmId;
    if (!hasAnyConfirm) return;
    const handleClickAway = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-confirm-zone]')) {
        setDeletingStudentConfirmId(null);
        setDeletingAppConfirmId(null);
        setDeletingRecommenderConfirmId(null);
        setDeletingPresetConfirmId(null);
        setDeletingEventConfirmId(null);
        setHidingAlertConfirmId(null);
        setDeletingOptionConfirm(null);
        setDeletingDashboardAlertConfirmId(null);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [deletingStudentConfirmId, deletingAppConfirmId, deletingRecommenderConfirmId, deletingPresetConfirmId, deletingEventConfirmId, hidingAlertConfirmId, deletingOptionConfirm, deletingDashboardAlertConfirmId]);

  useEffect(() => {
    if (showAppModal) {
      setAppForm({
        school: editingApp?.school || '',
        program: editingApp?.program || '',
        tier: editingApp?.tier || '稳妥档',
        openDate: editingApp?.openDate || '',
        deadline: editingApp?.deadline || '',
        status: editingApp?.status || '收集中',
        portalEmail: editingApp?.portal?.email || '',
        portalEmailPwd: editingApp?.portal?.emailPwd || '',
        portalAccount: editingApp?.portal?.account || '',
        portalPassword: editingApp?.portal?.password || '',
        portalAppId: editingApp?.portal?.appId || '',
        portalSecurityQA: editingApp?.portal?.securityQA || ''
      });
    }
  }, [showAppModal, editingApp]);

  const currentSeasonStudents = useMemo(() => students.filter(s => s.seasonId === activeSeasonId), [students, activeSeasonId]);
  // “已结单/已结案”只停止提醒，不自动归档；只有手动归档的学生进入归档区。
  const activeStudents = useMemo(() => currentSeasonStudents.filter(s => !isArchivedStudent(s)), [currentSeasonStudents]);
  const displayStudents = showArchived ? currentSeasonStudents.filter(isArchivedStudent) : activeStudents;
  const allActiveStudents = useMemo(() => {
    const activeSeasonIds = new Set(seasons.filter(se => !se.isArchived).map(se => se.id));
    return students.filter(s => activeSeasonIds.has(s.seasonId) && !isArchivedStudent(s));
  }, [students, seasons]);
  const activeSeasonConfig = useMemo(() => {
    const selected = seasons.find(s => s.id === activeSeasonId);
    if (selected) return selected;
    // In recycle-bin mode an empty archived-season list must never fall back
    // to an active season, otherwise the archive screen leaks live content.
    if (isRecycleBinMode) {
      return { id: '__empty_archive__', name: '暂无已归档申请季', start: '2026-01-01', end: '2026-12-31', isArchived: true };
    }
    return seasons.find(s => !s.isArchived) || { id: 'default', name: '默认', start: '2026-09-01', end: '2027-09-30' };
  }, [seasons, activeSeasonId, isRecycleBinMode]);
  const ganttStart = parseForCalc(activeSeasonConfig.start).getTime();
  const ganttEnd = parseForCalc(activeSeasonConfig.end).getTime();
  const totalDura = (ganttEnd - ganttStart) === 0 ? 1 : (ganttEnd - ganttStart);
  const mobileGanttScale = getMobileGanttScale(activeSeasonConfig.start, activeSeasonConfig.end);

  useEffect(() => {
    if (activeTab === 'students' && selectedStudentForDocs && highlightTargetId) {
      const el = document.getElementById(highlightTargetId);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const t = setTimeout(() => setHighlightTargetId(null), 3000); return () => clearTimeout(t); }
    }
  }, [activeTab, selectedStudentForDocs, highlightTargetId]);

  const generateAlertsForStudents = useCallback((targetStudents) => {
    const generated = [];
    targetStudents.forEach(stu => {
      if (isArchivedStudent(stu) || isTerminalStudent(stu)) return;
      const studentOverrides = systemWarningsTimeOverrides[stu.id] || {};
      const getParam = (key) => studentOverrides[key] !== undefined && studentOverrides[key] !== null ? studentOverrides[key] : alertConfig[key];

      const deadlineCritical = getParam('deadlineCritical');
      const deadlineWarning = getParam('deadlineWarning');
      const rlCritical = getParam('rlCritical');
      const rlWarning = getParam('rlWarning');
      const preOpenCritical = getParam('preOpenCritical');
      const preOpenWarning = getParam('preOpenWarning');
      const visaOpenCritical = getParam('visaOpenCritical');
      const visaOpenWarning = getParam('visaOpenWarning');
      const visaCloseCritical = getParam('visaCloseCritical');
      const visaCloseWarning = getParam('visaCloseWarning');

      const basicMissing = stu.docs.basic.filter(d => !d.checked).map(d => d.label);
      const academicMissing = stu.docs.academic.filter(d => !d.checked).map(d => d.label);
      const allGenericDocsMissing = [...basicMissing, ...academicMissing];
      const isGenericMissing = allGenericDocsMissing.length > 0;

      let minGenericDaysToDDL = Infinity;
      let mostCriticalGenericApp = null;
      let activeAppCount = 0;

      stu.applications.forEach(app => {
        if (isTerminalApplication(app)) return;
        activeAppCount++;
        
        const deadline = parseForCalc(app.deadline);
        const openDate = parseForCalc(app.openDate);
        const deadlineMs = deadline.getTime();
        const openDateMs = openDate.getTime();
        const daysToDeadline = Math.ceil((deadlineMs - currentTime) / 86400000);
        const daysToOpen = Math.ceil((openDateMs - currentTime) / 86400000);
        const timeLeftStr = formatTimeLeft(deadlineMs, currentTime);
        const isOpen = daysToOpen <= 0;
        const ab = `${stu.id}-${app.id}`;

        if (app.deadline && app.openDate && isGenericMissing && app.status === '收集中') {
           if (daysToDeadline < minGenericDaysToDDL) {
               minGenericDaysToDDL = daysToDeadline;
               mostCriticalGenericApp = app;
           }
        }

        const specificMissing = (app.specificDocs || []).filter(d => !d.checked).map(d => d.label);
        const isSpecificMissing = specificMissing.length > 0;
        
        if (app.deadline && app.openDate && isSpecificMissing && app.status === '收集中') {
          if (isOpen && alertConfig.alertOpenMissing) {
            const type = (daysToDeadline >= 0 && daysToDeadline <= deadlineCritical) ? 'critical' : 'warning';
            generated.push({
              targetTimeMs: deadlineMs,
              id: `${ab}-specific-missing`, type, autoResolveOnly: true, studentId: stu.id, student: stu.name, appId: app.id, targetId: `app-card-${app.id}`,
              title: `【${app.school} - ${app.program}】专属材料未齐`,
              message: type === 'critical'
                ? `距离截止还有 ${timeLeftStr}！专属材料缺 ${specificMissing.length} 项：${specificMissing.join('、')}，请紧急处理！`
                : `该专业需专属材料，尚缺：${specificMissing.join('、')}。距离截止还有 ${timeLeftStr}。`
            });
          } else if (!isOpen && alertConfig.alertPreOpen) {
            if (daysToOpen <= preOpenCritical) {
              generated.push({
                id: `${ab}-specific-preopen`, type: 'critical', autoResolveOnly: true, studentId: stu.id, student: stu.name, appId: app.id, targetId: `app-card-${app.id}`,
                title: `【${app.school} - ${app.program}】专属材料紧急催收`,
                message: `网申将于 ${daysToOpen} 天后开放，专属材料缺失：${specificMissing.join('、')}，请立即催办！`
              });
            } else if (daysToOpen <= preOpenWarning) {
              generated.push({
                id: `${ab}-specific-preopen`, type: 'warning', autoResolveOnly: true, studentId: stu.id, student: stu.name, appId: app.id, targetId: `app-card-${app.id}`,
                title: `【${app.school} - ${app.program}】提前准备专属材料`,
                message: `网申将于 ${daysToOpen} 天后开放，需提前准备专属材料：${specificMissing.join('、')}。`
              });
            }
          }
        }

        if (app.deadline && app.openDate && !isGenericMissing && !isSpecificMissing && isOpen && daysToDeadline >= 0 && app.status === '收集中') {
          if (daysToDeadline <= deadlineCritical) {
            generated.push({
              targetTimeMs: deadlineMs,
              id: `${ab}-deadline-urgent`, type: 'critical', studentId: stu.id, student: stu.name, appId: app.id, targetId: `app-card-${app.id}`,
              title: `【${app.school} - ${app.program}】截止日紧急提醒`,
              message: `材料均已备齐，但距离截止还有 ${timeLeftStr}，请立即确认已递交！`
            });
          } else if (daysToDeadline <= deadlineWarning) {
            generated.push({
              targetTimeMs: deadlineMs,
              id: `${ab}-deadline-warn`, type: 'warning', studentId: stu.id, student: stu.name, appId: app.id, targetId: `app-card-${app.id}`,
              title: `【${app.school} - ${app.program}】截止日提醒`,
              message: `材料均已备齐，距离截止还有 ${timeLeftStr}，可安排递交。`
            });
          }
        }

        if (alertConfig.alertNoteDDL) {
          app.notes?.forEach(note => {
            if (!note.deadline) return;
            const noteDeadlineMs = parseForCalc(note.deadline).getTime();
            const daysToNote = Math.ceil((noteDeadlineMs - currentTime) / 86400000);
            const noteTimeLeftStr = formatTimeLeft(noteDeadlineMs, currentTime);
            if (daysToNote <= deadlineWarning) {
              generated.push({
                targetTimeMs: noteDeadlineMs,
                id: `${ab}-note-${note.id}`,
                type: daysToNote <= deadlineCritical ? 'critical' : 'warning',
                studentId: stu.id, student: stu.name,
                noteId: note.id, appId: app.id, targetId: `app-card-${app.id}`,
                title: `备注提醒`,
                message: `[${note.text}] 距离截止还有 ${noteTimeLeftStr}。所属：${app.school} - ${app.program}。`
              });
            }
          });
        }

        if (alertConfig.alertRL && app.recommendations) {
          Object.keys(app.recommendations).forEach(recId => {
            const recData = app.recommendations[recId];
            if (recData.status === 'pending' || recData.status === 'sent' || recData.status === 'completed') {
              const recInfo = stu.recommenders?.find(r => r.id === recId);
              if (!recInfo) return;
              const ddlDateVal = recData.deadline || app.deadline;
              if (!ddlDateVal) return;
              const ddlDate = parseForCalc(ddlDateVal);
              const ddlDateMs = ddlDate.getTime();
              const daysToRL = Math.ceil((ddlDateMs - currentTime) / 86400000);
              const rlTimeLeftStr = formatTimeLeft(ddlDateMs, currentTime);
              
              if (daysToRL <= rlWarning || recData.status === 'completed') {
                const type = daysToRL <= rlCritical ? 'critical' : 'warning';
                generated.push({
                  targetTimeMs: ddlDateMs,
                  id: `${ab}-rl-${recId}`,
                  type,
                  studentId: stu.id, student: stu.name, appId: app.id, targetId: `recommender-matrix-section`,
                  title: `【${app.school}】推荐信催促: ${recInfo.name}`,
                  message: `该教授网推状态为“${recData.status === 'pending' ? '待发链接' : (recData.status === 'sent' ? '已发链接等待中' : '已完成网推')}”，距离截止还有 ${rlTimeLeftStr}，请及时跟进！`,
                  rlStatus: recData.status
                });
              }
            }
          });
        }
      });

      if (isGenericMissing && mostCriticalGenericApp) {
        const daysToDeadline = minGenericDaysToDDL;
        const app = mostCriticalGenericApp;
        const openDate = parseForCalc(app.openDate);
        const openDateMs = openDate.getTime();
        const daysToOpen = Math.ceil((openDateMs - currentTime) / 86400000);
        const isOpen = daysToOpen <= 0;

        if (isOpen && alertConfig.alertOpenMissing) {
          const type = (daysToDeadline >= 0 && daysToDeadline <= deadlineCritical) ? 'critical' : 'warning';
          const deadlineMs = parseForCalc(app.deadline).getTime();
          const timeLeftStr = formatTimeLeft(deadlineMs, currentTime);
          generated.push({
            targetTimeMs: shiftDays(deadlineMs, -deadlineCritical),
            id: `${stu.id}-generic-missing`, type, autoResolveOnly: true, studentId: stu.id, student: stu.name, appId: app.id, targetId: `generic-docs-section`,
            isGenericMissing: true, missingDocLabels: allGenericDocsMissing,
            title: `【合并预警】通用申请材料缺漏`,
            message: type === 'critical'
              ? `缺 ${allGenericDocsMissing.length} 项通用材料（影响 ${activeAppCount} 个进行中项目）。最紧迫项目距离截止还有 ${timeLeftStr}！`
              : `尚缺 ${allGenericDocsMissing.length} 项通用材料（影响 ${activeAppCount} 个进行中项目）。最紧迫项目距离截止还有 ${timeLeftStr}。`
          });
        } else if (!isOpen && alertConfig.alertPreOpen) {
           if (daysToOpen <= preOpenCritical) {
             generated.push({
               id: `${stu.id}-generic-preopen`, type: 'critical', autoResolveOnly: true, studentId: stu.id, student: stu.name, appId: app.id, targetId: `generic-docs-section`,
               title: `【合并预警】通用材料紧急催收`,
               message: `首个网申将于 ${daysToOpen} 天后开放，通用材料仍缺 ${allGenericDocsMissing.length} 项，请立即催办！`
             });
           } else if (daysToOpen <= preOpenWarning) {
             generated.push({
               id: `${stu.id}-generic-preopen`, type: 'warning', autoResolveOnly: true, studentId: stu.id, student: stu.name, appId: app.id, targetId: `generic-docs-section`,
               title: `【合并预警】提前准备通用材料`,
               message: `首个网申将于 ${daysToOpen} 天后开放，建议提前备齐 ${allGenericDocsMissing.length} 项通用材料。`
             });
           }
        }
      }

      const hasVisaWindow = stu.visaWindow && stu.visaWindow[0] && stu.visaWindow[1];
      if (hasVisaWindow && (['已确认录取','有录取·选校中','签证准备','签证审批中'].includes(stu.status)) && alertConfig.alertVisaBeforeOpen) {
        const visaStart = parseForCalc(stu.visaWindow[0]);
        const visaEnd = parseForCalc(stu.visaWindow[1]);
        const visaStartMs = visaStart.getTime();
        const visaEndMs = visaEnd.getTime();
        const daysToStart = Math.ceil((visaStartMs - currentTime) / 86400000);
        const daysToEnd = Math.ceil((visaEndMs - currentTime) / 86400000);
        const visaEndTimeLeftStr = formatTimeLeft(visaEndMs, currentTime);
        const visaStartTimeLeftStr = formatTimeLeft(visaStartMs, currentTime);
        const visaMissing = stu.docs.visa.filter(d => !d.checked).map(d => d.label);
        const isInWindow = daysToStart <= 0 && daysToEnd >= 0;

        if (daysToEnd < 0) return;

        if (isInWindow) {
          if (visaMissing.length > 0) {
            const type = daysToEnd <= visaCloseCritical ? 'critical' : (daysToEnd <= visaCloseWarning ? 'warning' : 'info');
            generated.push({
              targetTimeMs: visaEndMs,
              id: `${stu.id}-visa-in-window`, type, autoResolveOnly: true, studentId: stu.id, student: stu.name, targetId: `visa-docs-section`,
              title: `签证窗口进行中 - 材料未备齐`,
              message: `当前处于签证办理窗口期（距离关闭还有 ${visaEndTimeLeftStr}），仍缺：${visaMissing.join('、')}，请立即跟进！`
            });
          }
          if (visaMissing.length === 0 && daysToEnd <= visaCloseWarning) {
            generated.push({
              targetTimeMs: visaEndMs,
              id: `${stu.id}-visa-closing`, type: daysToEnd <= visaCloseCritical ? 'critical' : 'warning', targetId: `visa-docs-section`,
              studentId: stu.id, student: stu.name,
              title: `签证窗口即将关闭`,
              message: `材料已备齐，签证窗口还有 ${visaEndTimeLeftStr}关闭，请确认已完成签证办理！`
            });
          }
        } else {
          if (daysToStart <= visaOpenCritical) {
            generated.push({
              targetTimeMs: visaStartMs,
              id: `${stu.id}-visa-start`, type: 'critical', autoResolveOnly: true, studentId: stu.id, student: stu.name, targetId: `visa-docs-section`,
              title: `签证窗口即将开启`,
              message: `签证窗口还有 ${visaStartTimeLeftStr}开启。${visaMissing.length > 0 ? `仍缺：${visaMissing.join('、')}，请立即准备！` : '材料已备齐，可以开始办理。'}`
            });
          } else if (daysToStart <= visaOpenWarning) {
            generated.push({
              targetTimeMs: visaStartMs,
              id: `${stu.id}-visa-start`, type: visaMissing.length > 0 ? 'warning' : 'info', autoResolveOnly: true, targetId: `visa-docs-section`,
              studentId: stu.id, student: stu.name,
              title: `签证准备提醒`,
              message: `签证窗口将于 ${stu.visaWindow[0]} 开启（还有 ${visaStartTimeLeftStr}）。${visaMissing.length > 0 ? `请提前备好：${visaMissing.join('、')}` : '材料已备齐，请留意开启日期。'}`
            });
          }
        }
      }
    });

    return generated.sort((a, b) => {
      const s = { critical: 1, warning: 2, info: 3 };
      const aS = s[a.type] || 99;
      const bS = s[b.type] || 99;
      if (aS !== bS) return aS - bS;
      return (a.targetTimeMs || Infinity) - (b.targetTimeMs || Infinity);
    });
  }, [alertConfig, currentTime, systemWarningsTimeOverrides]);

  const allAlerts = useMemo(
    () => activeSeasonConfig.isArchived ? [] : generateAlertsForStudents(activeStudents),
    [activeStudents, activeSeasonConfig.isArchived, generateAlertsForStudents]
  );
  
  const allSeasonsAlerts = useMemo(() => {
     const activeSeasonIds = new Set(seasons.filter(se => !se.isArchived).map(se => se.id));
     const allTargetStudents = students.filter(s => activeSeasonIds.has(s.seasonId));
     const alerts = generateAlertsForStudents(allTargetStudents);
     alerts.forEach(a => {
        if (a.studentId) {
            const stu = students.find(s => s.id === a.studentId);
            if (stu) {
                const season = seasons.find(se => se.id === stu.seasonId);
                if (season) a.seasonName = season.name;
            }
        }
     });
     return alerts;
  }, [students, seasons, generateAlertsForStudents]);


  const rawDerivedCalendarEvents = useMemo(() =>
    buildDerivedCalendarEvents(
      students,
      seasons,
      alertConfig,
      systemWarningsTimeOverrides,
      completedAlerts,
      calendarCompletionBackups,
    ),
    [students, seasons, alertConfig, systemWarningsTimeOverrides, completedAlerts, calendarCompletionBackups]
  );

  const isDismissedInCalendar = useCallback((alertId) => {
    const event = rawDerivedCalendarEvents.find(item => item.id === alertId);
    return !!event && isCalendarEventDismissed(event, dismissedCalendarEvents);
  }, [rawDerivedCalendarEvents, dismissedCalendarEvents]);

  const activeAlerts = useMemo(() =>
    allAlerts.filter(a => !ignoredAlerts.has(a.id) && !isDismissedInCalendar(a.id) && !(a.id.includes('-rl-') ? (a.rlStatus === 'completed' || !!completedAlerts[a.id]) : !!completedAlerts[a.id])),
    [allAlerts, ignoredAlerts, completedAlerts, isDismissedInCalendar]
  );

  // Calendar is a global operational view: its badge must reflect every
  // non-archived season, not only the season selected in the main workspace.
  const activeAllSeasonsAlerts = useMemo(() =>
    allSeasonsAlerts.filter(a => !ignoredAlerts.has(a.id) && !isDismissedInCalendar(a.id) && !(a.id.includes('-rl-') ? (a.rlStatus === 'completed' || !!completedAlerts[a.id]) : !!completedAlerts[a.id])),
    [allSeasonsAlerts, ignoredAlerts, completedAlerts, isDismissedInCalendar]
  );

  const derivedCalendarEvents = useMemo(() =>
    isRecycleBinMode ? [] : rawDerivedCalendarEvents.filter(event =>
      !ignoredAlerts.has(event.id) && !isCalendarEventDismissed(event, dismissedCalendarEvents)
    ),
    [rawDerivedCalendarEvents, ignoredAlerts, dismissedCalendarEvents, isRecycleBinMode]
  );

  const completedAlertItems = useMemo(() => {
    return Object.values(completedAlerts).sort((a, b) => b.timestamp - a.timestamp);
  }, [completedAlerts]);

  const activeCompletedItems = useMemo(() => {
    const closedStudentIds = new Set(students.filter(s => isTerminalStudent(s) || isArchivedStudent(s)).map(s => s.id));
    return completedAlertItems.filter(item => {
      if (!item || typeof item !== 'object' || !item.alert) return false;
      const stuId = item.alert?.studentId;
      if (!stuId) return true;
      return !closedStudentIds.has(stuId);
    });
  }, [completedAlertItems, students]);

  useEffect(() => {
    let isDragActive = false;
    let scrollInterval: any = null;
    let scrollSpeed = 0;
    let activeContainer: HTMLElement | null = null;

    const findScrollableAncestor = (el: HTMLElement | null): HTMLElement | null => {
      while (el) {
        if (el.tagName === 'MAIN') return el;
        const style = window.getComputedStyle(el);
        if (
          (style.overflowY === 'auto' || style.overflowY === 'scroll' || el.classList.contains('overflow-y-auto') || el.classList.contains('overflow-auto')) &&
          el.scrollHeight > el.clientHeight
        ) {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    };

    const handleDragStart = () => {
      isDragActive = true;
    };

    const handleDragEnd = () => {
      isDragActive = false;
      stopAutoScroll();
    };

    const handleWheel = (e: WheelEvent) => {
      if (isDragActive) {
        const hoveredEl = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
        const scrollContainer = findScrollableAncestor(hoveredEl) || document.querySelector('main');
        if (scrollContainer) {
          scrollContainer.scrollTop += e.deltaY;
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (!isDragActive) isDragActive = true;
      const hoveredEl = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
      const scrollContainer = findScrollableAncestor(hoveredEl) || document.querySelector('main');
      
      if (!scrollContainer) {
        stopAutoScroll();
        return;
      }

      activeContainer = scrollContainer;
      const rect = scrollContainer.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const edgeSize = 80;

      if (relativeY < edgeSize && relativeY > 0) {
        scrollSpeed = -((edgeSize - relativeY) / edgeSize) * 16;
        startAutoScroll();
      } else if (relativeY > rect.height - edgeSize && relativeY < rect.height) {
        scrollSpeed = ((relativeY - (rect.height - edgeSize)) / edgeSize) * 16;
        startAutoScroll();
      } else {
        stopAutoScroll();
      }
    };

    const startAutoScroll = () => {
      if (scrollInterval) return;
      scrollInterval = setInterval(() => {
        if (activeContainer) {
          activeContainer.scrollTop += scrollSpeed;
        }
      }, 16);
    };

    const stopAutoScroll = () => {
      if (scrollInterval) {
        clearInterval(scrollInterval);
        scrollInterval = null;
      }
    };

    window.addEventListener('dragstart', handleDragStart, { capture: true });
    window.addEventListener('dragend', handleDragEnd, { capture: true });
    window.addEventListener('dragover', handleDragOver, { capture: true });
    window.addEventListener('drop', handleDragEnd, { capture: true });
    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });

    return () => {
      window.removeEventListener('dragstart', handleDragStart, { capture: true });
      window.removeEventListener('dragend', handleDragEnd, { capture: true });
      window.removeEventListener('dragover', handleDragOver, { capture: true });
      window.removeEventListener('drop', handleDragEnd, { capture: true });
      window.removeEventListener('wheel', handleWheel, { capture: true });
      stopAutoScroll();
    };
  }, []);

  const handleDragStartWithGhost = (e: React.DragEvent, text: string, type: string) => {
    const ghost = document.getElementById('drag-ghost');
    if (ghost) {
      let colorClasses = 'bg-sky-100 border-sky-200 text-sky-700';
      if (type === 'critical') {
        colorClasses = 'bg-red-100 border-red-300 text-red-700';
      } else if (type === 'warning') {
        colorClasses = 'bg-orange-100 border-orange-300 text-orange-700';
      } else if (type === 'milestone') {
        colorClasses = 'bg-violet-100 border-violet-300 text-violet-700';
      } else if (type === 'completed' || type === 'green') {
        colorClasses = 'bg-green-50 border-green-200 text-green-600';
      }
      ghost.className = `fixed top-[-1000px] left-[-1000px] pointer-events-none rounded px-2.5 py-1 text-[10px] font-semibold font-serif leading-snug border z-[9999] ${colorClasses}`;
      ghost.innerText = text;
      e.dataTransfer.setDragImage(ghost, 40, 10);
    }
  };  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    const tiltX = -(y - yc) / yc * 4;
    const tiltY = (x - xc) / xc * 4;
    card.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.015, 1.015, 1.015)`;
    card.style.boxShadow = '0 10px 20px rgba(198, 138, 76, 0.12)';
  };

  const handleCardMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    card.style.transform = 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    card.style.boxShadow = '';
  };

  const handleCompleteAlert = (alertObj) => {
    const isCompleted = alertObj.id.includes('-rl-')
      ? (alertObj.rlStatus === 'completed' || !!completedAlerts[alertObj.id])
      : !!completedAlerts[alertObj.id];
    const willBeCompleted = !isCompleted;
    setCompletedAlerts(prev => { 
      const next = { ...prev };
      if (willBeCompleted) {
        next[alertObj.id] = { timestamp: Date.now(), alert: alertObj };
      } else {
        delete next[alertObj.id];
      }
      return next; 
    });
    if (alertObj.studentId) {
      setStudents(prev => prev.map(stu => {
        if (stu.id !== alertObj.studentId) return stu;
        let updated = { ...stu };
        const savedBackup = calendarCompletionBackups[alertObj.id];

        const remember = (snapshot) => {
          if (!willBeCompleted) return;
          setCalendarCompletionBackups(previous => ({ ...previous, [alertObj.id]: snapshot }));
        };

        if (alertObj.kind === 'application_open' || alertObj.kind === 'application_deadline') {
          updated.applications = (updated.applications || []).map(app => {
            if (app.id !== alertObj.appId) return app;
            remember({ kind: alertObj.kind, status: app.status });
            return { ...app, status: willBeCompleted ? '已递交' : (savedBackup?.status || '准备中') };
          });
        }
        
        else if (alertObj.appId && (alertObj.kind === 'recommendation' || alertObj.id.includes('-rl-'))) {
          const recId = alertObj.recId || alertObj.id.replace(alertObj.studentId + '-' + alertObj.appId + '-rl-', '');
          updated.applications = updated.applications.map(app => {
            if (app.id !== alertObj.appId) return app;
            const current = app.recommendations?.[recId] || {};
            remember({ kind: 'recommendation', status: current.status });
            return { ...app, recommendations: { ...app.recommendations, [recId]: { ...current, status: willBeCompleted ? 'completed' : (savedBackup?.status || 'sent') } } };
          });
        }
        else if (alertObj.appId && alertObj.noteId) {
          updated.applications = updated.applications.map(app => {
            if (app.id !== alertObj.appId) return app;
            return { ...app, notes: (app.notes || []).map(n => {
              if (n.id !== alertObj.noteId) return n;
              remember({ kind: 'note', isCompleted: !!n.isCompleted });
              return { ...n, isCompleted: willBeCompleted ? true : !!savedBackup?.isCompleted };
            }) };
          });
        }
        else if (alertObj.kind === 'specific_missing' && alertObj.appId) {
          updated.applications = (updated.applications || []).map(app => {
            if (app.id !== alertObj.appId) return app;
            remember({ kind: 'specific_missing', specificDocs: JSON.parse(JSON.stringify(app.specificDocs || [])) });
            return {
              ...app,
              specificDocs: willBeCompleted
                ? (app.specificDocs || []).map(doc => ({ ...doc, checked: true }))
                : JSON.parse(JSON.stringify(savedBackup?.specificDocs || app.specificDocs || [])),
            };
          });
        }
        else if (alertObj.isGenericMissing || alertObj.kind === 'generic_missing') {
          remember({ kind: 'generic_missing', docs: JSON.parse(JSON.stringify(updated.docs || {})) });
          if (willBeCompleted) {
            updated.docs = { ...updated.docs };
            Object.keys(updated.docs).forEach(cat => {
              updated.docs[cat] = (updated.docs[cat] || []).map(doc => ({ ...doc, checked: true }));
            });
          } else if (savedBackup?.docs) {
            updated.docs = JSON.parse(JSON.stringify(savedBackup.docs));
          }
        }
        return updated;
      }));
    }
    if (!willBeCompleted) {
      setCalendarCompletionBackups(previous => {
        const next = { ...previous };
        delete next[alertObj.id];
        return next;
      });
    }
  };
  
  const handleIgnoreAlert = (id) => setIgnoredAlerts(prev => new Set(prev).add(id));
  const handleDeleteAlertDashboard = (a) => {
    setIgnoredAlerts(prev => new Set(prev).add(a.id));
    setCalendarEvents(prev => prev.filter(e => e.alertId !== a.id && e.id !== a.id));
  };
  const handleRestoreAlerts = () => { setIgnoredAlerts(new Set()); setCompletedAlerts({}); };

  const handleJumpToApp = (stu, appId) => {
    setActiveTab('students'); setSelectedStudentForGanttId(null); setSelectedStudentForDocsId(stu?.id || null); 
    setCalendarTooltip(null);
    if (appId) setHighlightTargetId(appId);
  };

  const getPos = (dateStr) => {
    if (!dateStr) return -100;
    let d = parseForCalc(dateStr).getTime();
    if (isNaN(d)) return -100;
    d = Math.max(ganttStart, Math.min(ganttEnd, d));
    const safeTotalDura = totalDura === 0 ? 1 : totalDura;
    return ((d - ganttStart) / safeTotalDura) * 100;
  };

  const getStudentAppWindow = (stu) => {
    if (!stu.applications?.length) return [null, null];
    const opens = stu.applications.map(a => parseForCalc(a.openDate).getTime()).filter(t => !isNaN(t));
    const ends = stu.applications.map(a => parseForCalc(a.deadline).getTime()).filter(t => !isNaN(t));
    if (!opens.length || !ends.length) return [null, null];
    return [fmt(new Date(Math.min(...opens))), fmt(new Date(Math.max(...ends)))];
  };

  const handleSaveStudent = (e) => {
    e.preventDefault();
    const form = studentForm || {
      name: editingStudent?.name || '',
      seasonId: editingStudent?.seasonId || activeSeasonId,
      plannerUsername: editingStudent?.plannerUsername || '',
      region: editingStudent?.region || '',
      status: editingStudent?.status || '材料收集',
      visaStart: editingStudent?.visaWindow?.[0] || '',
      visaEnd: editingStudent?.visaWindow?.[1] || '',
      precedingSchoolLocation: '',
      precedingSchoolName: '',
      precedingSchoolLevel: '',
      precedingSchoolCountry: '',
      precedingSchoolRankingSource: '',
      precedingSchoolRankingValue: '',
      precedingStage: '',
      major: '',
      programLength: '',
      gpa: '',
      gpaScale: '',
      graduationStatus: '',
      currentYear: '',
      yearsAfterGrad: '',
      applicationStage: '',
      applicationRegion: '',
      address: '',
      experience: '',
      awards: '',
      professionalCerts: ''
    };

    // Saving an unassigned student makes the record disappear after a reload,
    // because every main view is scoped by season.  Reject it at the boundary
    // and require a currently existing season instead.
    if (!form.seasonId || !seasons.some(s => s.id === form.seasonId)) {
      alert('请先选择一个有效的申请季，再保存学生档案。若当前没有申请季，请先新建申请季。');
      return;
    }

    const cleanString = (val) => {
      if (val === '' || val === null || val === undefined) return null;
      return String(val).trim();
    };
    const cleanNumber = (val) => {
      if (val === '' || val === null || val === undefined) return null;
      const num = Number(val);
      return isNaN(num) ? null : num;
    };

    const normalizedStage = studentStageParts({
      precedingStage: form.precedingStage,
      applicationStage: form.applicationStage,
      type: editingStudent?.type,
    });
    const normalizedType = inferStudentType(
      normalizedStage.source,
      normalizedStage.target,
      editingStudent?.type || '其他',
    );

    const backgroundObj = {
      precedingSchoolLocation: cleanString(form.precedingSchoolLocation),
      precedingSchoolName: cleanString(form.precedingSchoolName),
      precedingSchoolLevel: cleanString(form.precedingSchoolLevel),
      precedingSchoolCountry: cleanString(form.precedingSchoolCountry),
      precedingSchoolRankingSource: cleanString(form.precedingSchoolRankingSource),
      precedingSchoolRankingValue: cleanNumber(form.precedingSchoolRankingValue),
      precedingStage: cleanString(normalizedStage.source),
      major: cleanString(form.major),
      programLength: cleanString(form.programLength),
      gpa: cleanNumber(form.gpa),
      gpaScale: cleanString(form.gpaScale),
      graduationStatus: cleanString(form.graduationStatus),
      currentYear: cleanString(form.currentYear),
      yearsAfterGrad: cleanString(form.yearsAfterGrad),
      applicationStage: cleanString(normalizedStage.target),
      applicationRegion: cleanString(form.applicationRegion),
      address: cleanString(form.address),
      experience: cleanString(form.experience),
      awards: cleanString(form.awards),
      professionalCerts: cleanString(form.professionalCerts),
      schoolLocation: cleanString(form.precedingSchoolLocation),
      schoolName: cleanString(form.precedingSchoolName),
      schoolLevel: cleanString(form.precedingSchoolLevel),
      schoolCountry: cleanString(form.precedingSchoolCountry),
      schoolRankingSource: cleanString(form.precedingSchoolRankingSource),
      schoolRankingValue: cleanNumber(form.precedingSchoolRankingValue),
    };

    const stuData = {
      name: form.name,
      region: form.region,
      nationality: form.nationality,
      type: normalizedType,
      status: form.status,
      seasonId: form.seasonId,
      plannerUsername: cleanString(form.plannerUsername) || '',
      visaWindow: [form.visaStart, form.visaEnd],
      precedingSchoolLocation: cleanString(form.precedingSchoolLocation),
      precedingSchoolName: cleanString(form.precedingSchoolName),
      precedingSchoolLevel: cleanString(form.precedingSchoolLevel),
      precedingSchoolCountry: cleanString(form.precedingSchoolCountry),
      precedingSchoolRankingSource: cleanString(form.precedingSchoolRankingSource),
      precedingSchoolRankingValue: cleanNumber(form.precedingSchoolRankingValue),
      precedingStage: cleanString(normalizedStage.source),
      major: cleanString(form.major),
      programLength: cleanString(form.programLength),
      gpa: cleanNumber(form.gpa),
      gpaScale: cleanString(form.gpaScale),
      graduationStatus: cleanString(form.graduationStatus),
      applicationStage: cleanString(normalizedStage.target),
      applicationRegion: cleanString(form.applicationRegion),
      address: cleanString(form.address),
      experience: cleanString(form.experience),
      awards: cleanString(form.awards),
      professionalCerts: cleanString(form.professionalCerts),
      background: backgroundObj
    };

    if (editingStudent?.id) {
      setStudents(prev => prev.map(s => {
        if (s.id !== editingStudent.id) return s;
        return { ...s, ...stuData };
      }));
    } else {
      const newStu = {
        id: 'STU' + Date.now().toString().slice(-6),
        ...stuData,
        applications: [],
        recommenders: [],
        events: [],
        docs: { info: [], basic: [], academic: [], writing: [], visa: [], unclassified: [] }
      };
      newStu.docs = determineMaterialPreset(newStu, customPresets);
      setStudents(prev => [...prev, addEventToStudent(newStu, 'student', 'add', '创建学生档案', `新建档案`)]);
    }
    setShowStudentModal(false);
  };

  const handleDeleteStudent = (id) => {
    const targetStu = students.find(s => s.id === id);
    if (targetStu) {
      const deleteLogId = `system-delete-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      setCompletedAlerts(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          if (key === id || key.startsWith(`${id}-`)) {
            delete next[key];
          }
        });
        next[deleteLogId] = {
          timestamp: Date.now(),
          alert: {
            id: deleteLogId,
            title: '系统审计日志',
            type: 'info',
            message: `删除了学生档案: [${targetStu.name}] (地区: ${targetStu.region || ''}, 阶段: ${targetStu.type || ''})`
          }
        };
        return next;
      });
      setIgnoredAlerts(prev => {
        const next = new Set(prev);
        prev.forEach(key => {
          if (key === id || key.startsWith(`${id}-`)) {
            next.delete(key);
          }
        });
        return next;
      });
    }
    setStudents(prev => prev.filter(s => s.id !== id));
    if (selectedStudentForDocsId === id) setSelectedStudentForDocsId(null);
    if (selectedStudentForGanttId === id) setSelectedStudentForGanttId(null);
  };

  const handleArchiveToggle = (id, currentStatus) => {
    const newStatus = currentStatus === '已归档' ? '材料收集' : '已归档';
    setStudents(prev => prev.map(s => {
      if (s.id !== id) return s;
      const updated = addEventToStudent({ ...s, status: newStatus }, 'student', 'status_change', '档案状态变更', `将进度状态更改为: ${newStatus}`);
      return updated;
    }));
  };

  const handleSaveApp = (e) => {
    e.preventDefault();
    if (!appForm) return;
    const appData = {
      school: appForm.school, program: appForm.program, tier: appForm.tier,
      openDate: appForm.openDate, deadline: appForm.deadline, status: appForm.status,
      recommendations: editingApp?.recommendations || {},
      portal: {
        email: appForm.portalEmail,
        emailPwd: appForm.portalEmailPwd,
        account: appForm.portalAccount,
        password: appForm.portalPassword,
        appId: appForm.portalAppId,
        securityQA: appForm.portalSecurityQA
      },
      notes: appFormNotes,
      specificDocs: editingApp?.specificDocs || []
    };
    setStudents(prev => prev.map(stu => {
      const tid = editingAppStudentId || selectedStudentForDocsId;
      if (stu.id !== tid) return stu;
      const isNew = !stu.applications.some(a => a.id === editingApp?.id);
      const newApps = isNew ? [...stu.applications, { id: editingApp.id, ...appData }] : stu.applications.map(a => a.id === editingApp.id ? { ...a, ...appData } : a);
      let updated = { ...stu, applications: newApps };
      if (isNew) {
        updated = addEventToStudent(updated, 'application', 'add', '新增申请专业', `新增了: ${appData.school} - ${appData.program}`);
      } else {
        updated = addEventToStudent(updated, 'application', 'edit', '修改专业信息', `修改了: ${appData.school} - ${appData.program} 的详细信息`);
      }
      return updated;
    }));
    setShowAppModal(false);
  };

  const handleDeleteApp = (studentId, appId) => {
    setCompletedAlerts(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (key.includes(`-${appId}-`) || key.endsWith(`-${appId}`)) {
          delete next[key];
        }
      });
      return next;
    });
    setIgnoredAlerts(prev => {
      const next = new Set(prev);
      prev.forEach(key => {
        if (key.includes(`-${appId}-`) || key.endsWith(`-${appId}`)) {
          next.delete(key);
        }
      });
      return next;
    });

    setStudents(prev => prev.map(stu => {
      const tid = studentId || selectedStudentForDocsId;
      if (stu.id !== tid) return stu;
      const appToDelete = stu.applications.find(a => a.id === appId);
      let updated = { ...stu, applications: stu.applications.filter(a => a.id !== appId) };
      if (appToDelete) {
        updated = addEventToStudent(updated, 'application', 'delete', '删除申请专业', `删除了: ${appToDelete.school} - ${appToDelete.program}`);
      }
      return updated;
    }));
  };

  const toggleDoc = (category, docId) => setStudents(prev => prev.map(stu => {
    if (stu.id !== selectedStudentForDocsId) return stu;
    const doc = (stu.docs[category] || []).find(d => d.id === docId);
    const wasChecked = doc?.checked;
    let updated = { ...stu, docs: { ...stu.docs, [category]: (stu.docs[category] || []).map(d => d.id === docId ? { ...d, checked: !d.checked } : d) } };
    if (doc) {
      updated = addEventToStudent(updated, 'doc', wasChecked ? 'uncomplete' : 'complete', wasChecked ? '取消选通用材料' : '选通用材料', `${wasChecked ? '取消选' : '选'}: ${doc.label}`);
    }
    return updated;
  }));

    const removeDoc = (category, docId) => setStudents(prev => prev.map(stu => {
    if (stu.id !== selectedStudentForDocsId) return stu;
    const doc = (stu.docs[category] || []).find(d => d.id === docId);
    let updated = { ...stu, docs: { ...stu.docs, [category]: (stu.docs[category] || []).filter(d => d.id !== docId) } };
    if (doc) updated = addEventToStudent(updated, 'doc', 'delete', '删除通用材料', `删除通用材料: ${doc.label}`);
    return updated;
  }));

  const confirmAddDoc = (category) => {
    if (!newDocLabel.trim()) { setAddingDocCategory(null); return; }
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      let updated = { ...stu, docs: { ...stu.docs, [category]: [...(stu.docs[category] || []), { id: 'D' + Date.now(), label: newDocLabel, checked: false }] } };
      updated = addEventToStudent(updated, 'doc', 'add', '新增通用材料', `新增了通用材料: ${newDocLabel}`);
      return updated;
    }));
    setNewDocLabel(''); setAddingDocCategory(null);
  };

  const handleDropDoc = (docId, fromCategory, toCategory) => {
    if (fromCategory === toCategory) return;
    const validCats = ['info', 'basic', 'academic', 'writing', 'visa', 'unclassified'];
    if (!validCats.includes(fromCategory) || !validCats.includes(toCategory)) return;

    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const targetDoc = (stu?.docs?.[fromCategory] || []).find(d => d.id === docId);
      if (!targetDoc) return stu;
      const updatedFrom = (stu.docs[fromCategory] || []).filter(d => d.id !== docId);
      const updatedTo = [...(stu.docs[toCategory] || []), targetDoc];
      let updated = {
        ...stu,
        docs: {
          ...stu.docs,
          [fromCategory]: updatedFrom,
          [toCategory]: updatedTo
        }
      };
      updated = addEventToStudent(updated, 'doc', 'move', '移动材料', `将材料 [${targetDoc.label}] 从 [${fromCategory}] 移动到 [${toCategory}]`);
      return updated;
    }));
  };

  const handleReorderStudentDoc = (category, sourceDocId, targetDocId) => {
    if (sourceDocId === targetDocId) return;
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const catDocs = [...(stu.docs?.[category] || [])];
      const sourceIndex = catDocs.findIndex(d => d.id === sourceDocId);
      const targetIndex = catDocs.findIndex(d => d.id === targetDocId);
      if (sourceIndex === -1 || targetIndex === -1) return stu;
      
      const [movedDoc] = catDocs.splice(sourceIndex, 1);
      catDocs.splice(targetIndex, 0, movedDoc);
      
      let updated = {
        ...stu,
        docs: {
          ...stu.docs,
          [category]: catDocs
        }
      };
      return updated;
    }));
  };

  const handleReorderPresetDoc = (presetId, fromCategory, toCategory, sourceDocId, targetDocId = null) => {
    if (fromCategory === toCategory && sourceDocId === targetDocId) return;
    const presetList = (customPresets && customPresets.length > 0) ? customPresets : getDefaultPresets();
    setCustomPresets(movePresetDocument(presetList, presetId, fromCategory, toCategory, sourceDocId, targetDocId || undefined));
  };

  const handleApplyPreset = (mode, specificPreset = null) => {
    if (!selectedStudentForDocsId) return false;
    if (mode === 'safe' && !confirm('警告：此操作会将原有材料移至未分类，并用预设填充其他分类。是否继续？')) {
      return false;
    }
    
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const presetsToUse = (customPresets && customPresets.length > 0) ? customPresets : getDefaultPresets();
      let preset = determineMaterialPreset(stu, presetsToUse);
      if (specificPreset) {
        const matched = presetsToUse.find(p => p.id === specificPreset);
        if (matched && matched.docs) preset = matched.docs;
      }
      let updatedDocs = { ...stu.docs };
      
      if (mode === 'smart') {
        updatedDocs = smartMergePresetDocs(stu.docs, preset);
      } else {
        const allCurrentDocs = [];
        Object.keys(stu.docs).forEach(cat => {
          if (cat === 'unclassified') return;
          allCurrentDocs.push(...(stu.docs[cat] || []));
        });
        
        let newUnclassified = [...(stu.docs.unclassified || [])];
        allCurrentDocs.forEach(doc => {
           if (!newUnclassified.some(u => u.label === doc.label)) {
              newUnclassified.push(doc);
           }
        });
        updatedDocs['unclassified'] = newUnclassified;

        Object.keys(preset).forEach(cat => {
          if (cat === 'unclassified') return;
          updatedDocs[cat] = preset[cat].map(d => ({ ...d, id: 'D' + Date.now() + Math.random().toString(36).substr(2, 9), checked: false }));
        });
      }
      
      let updated = { ...stu, docs: updatedDocs };
      updated = addEventToStudent(
        updated, 
        'doc', 
        'preset_apply', 
        mode === 'smart' ? '智能追加材料预设' : '安全应用材料预设', 
        mode === 'smart' ? '智能追加了当前不存在的预设材料' : '将所有已有材料转入未分类，并重新应用了预设'
      );
      return updated;
    }));
    return true;
  };

  const mapDayHourToDateTimeStr = (day, hour) => {
    const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const dayIndex = WEEK_DAYS.indexOf(day);
    if (dayIndex === -1) return '';
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    
    const targetDate = new Date(monday);
    targetDate.setDate(monday.getDate() + dayIndex);
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const hh = String(hour).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:00`;
  };

  const syncWarningDeadline = (day, hour, studentId, appId, noteId, alertId) => {
    if (!alertId) return;
    const dateTimeStr = mapDayHourToDateTimeStr(day, hour);
    
    setStudents(prev => prev.map(stu => {
      if (stu.id !== studentId) return stu;
      
      let updatedStu = { ...stu };
      
      if (noteId && appId) {
        updatedStu.applications = stu.applications.map(app => {
          if (app.id !== appId) return app;
          return {
            ...app,
            notes: (app.notes || []).map(n => n.id === noteId ? { ...n, deadline: dateTimeStr } : n)
          };
        });
      } else if (alertId.includes('-rl-') && appId) {
        const recId = alertId.split('-rl-')[1];
        updatedStu.applications = stu.applications.map(app => {
          if (app.id !== appId) return app;
          return {
            ...app,
            recommendations: {
              ...app.recommendations,
              [recId]: { ...(app.recommendations?.[recId] || {}), deadline: dateTimeStr }
            }
          };
        });
      } else if (alertId.includes('-visa-start')) {
        updatedStu.visaWindow = [dateTimeStr, stu.visaWindow?.[1] || ''];
      } else if (alertId.includes('-visa-in-window') || alertId.includes('-visa-closing')) {
        updatedStu.visaWindow = [stu.visaWindow?.[0] || '', dateTimeStr];
      } else if (alertId.includes('-preopen') && appId) {
        updatedStu.applications = stu.applications.map(app => {
          if (app.id !== appId) return app;
          return { ...app, openDate: dateTimeStr };
        });
      } else if (appId) {
        updatedStu.applications = stu.applications.map(app => {
          if (app.id !== appId) return app;
          return { ...app, deadline: dateTimeStr };
        });
      }
      
      return updatedStu;
    }));
  };

  const toggleSpecificDoc = (appId, docId) => setStudents(prev => prev.map(stu => {
    if (stu.id !== selectedStudentForDocsId) return stu;
    const targetApp = stu.applications.find(a => a.id === appId);
    const doc = targetApp?.specificDocs?.find(d => d.id === docId);
    const wasChecked = doc?.checked;
    const newApps = stu.applications.map(app => app.id === appId ? { ...app, specificDocs: (app.specificDocs || []).map(d => d.id === docId ? { ...d, checked: !d.checked } : d) } : app);
    let updated = { ...stu, applications: newApps };
    if (doc && targetApp) {
      updated = addEventToStudent(updated, 'doc', wasChecked ? 'uncomplete' : 'complete', wasChecked ? '取消专属材料' : '完成专属材料', `${wasChecked ? '取消勾选' : '已完成'}【${targetApp.school} - ${targetApp.program}】专属材料: ${doc.label}`);
    }
    return updated;
  }));

  const removeSpecificDoc = (appId, docId) => setStudents(prev => prev.map(stu => {
    if (stu.id !== selectedStudentForDocsId) return stu;
    const targetApp = stu.applications.find(a => a.id === appId);
    const doc = targetApp?.specificDocs?.find(d => d.id === docId);
    const newApps = stu.applications.map(app => app.id === appId ? { ...app, specificDocs: (app.specificDocs || []).filter(d => d.id !== docId) } : app);
    let updated = { ...stu, applications: newApps };
    if (doc && targetApp) updated = addEventToStudent(updated, 'doc', 'delete', '删除专属材料', `删除了【${targetApp.school} - ${targetApp.program}】的专属材料: ${doc.label}`);
    return updated;
  }));

  const confirmAddSpecificDoc = (appId) => {
    if (!newSpecificDocLabel.trim()) { setAddingSpecificDocToApp(null); return; }
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const targetApp = stu.applications.find(a => a.id === appId);
      const newApps = stu.applications.map(app => app.id === appId ? { ...app, specificDocs: [...(app.specificDocs||[]), { id: 'SD' + Date.now(), label: newSpecificDocLabel, checked: false }] } : app);
      let updated = { ...stu, applications: newApps };
      if (targetApp) updated = addEventToStudent(updated, 'doc', 'add', '新增专属材料', `【${targetApp.school} - ${targetApp.program}】新增了专属材料: ${newSpecificDocLabel}`);
      return updated;
    }));
    setNewSpecificDocLabel(''); setAddingSpecificDocToApp(null);
  };

  const handleInlineUpdateSpecificDoc = (appId, docId, newLabel) => {
    if (!newLabel || !newLabel.trim()) return;
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const targetApp = stu.applications.find(a => a.id === appId);
      const doc = targetApp?.specificDocs?.find(d => d.id === docId);
      if (!doc || doc.label === newLabel.trim()) return stu;
      const newApps = stu.applications.map(app => app.id === appId ? {
        ...app,
        specificDocs: (app.specificDocs || []).map(d => d.id === docId ? { ...d, label: newLabel.trim() } : d)
      } : app);
      return { ...stu, applications: newApps };
    }));
  };

  const handleAddProgramToSchool = (app) => {
    setEditingApp({
      id: 'APP' + Date.now(),
      school: app.school,
      program: '',
      tier: app.tier,
      portal: { ...app.portal },
      specificDocs: [],
      notes: []
    });
    setAppFormNotes([]);
    setEditingAppStudentId(selectedStudentForDocsId);
    setShowAppModal(true);
  };

  const addAppFormNote = () => setAppFormNotes(p => [...p, { id: 'n' + Date.now(), text: '', deadline: '' }]);
  const updateAppFormNote = (id, field, value) => setAppFormNotes(p => p.map(n => n.id === id ? { ...n, [field]: value } : n));
  const removeAppFormNote = (id) => setAppFormNotes(p => p.filter(n => n.id !== id));

  const handleCloseAppModal = () => {
    const originalNotes = editingApp?.notes || [];
    const notesDirty = JSON.stringify(appFormNotes) !== JSON.stringify(originalNotes);
    const fieldsDirty = !appForm ? false : (
      appForm.school !== (editingApp?.school || '') ||
      appForm.program !== (editingApp?.program || '') ||
      appForm.tier !== (editingApp?.tier || '稳妥档') ||
      appForm.openDate !== (editingApp?.openDate || '') ||
      appForm.deadline !== (editingApp?.deadline || '') ||
      appForm.status !== (editingApp?.status || '收集中') ||
      appForm.portalEmail !== (editingApp?.portal?.email || '') ||
      appForm.portalEmailPwd !== (editingApp?.portal?.emailPwd || '') ||
      appForm.portalAccount !== (editingApp?.portal?.account || '') ||
      appForm.portalPassword !== (editingApp?.portal?.password || '') ||
      appForm.portalAppId !== (editingApp?.portal?.appId || '') ||
      appForm.portalSecurityQA !== (editingApp?.portal?.securityQA || '')
    );
    if (notesDirty || fieldsDirty) {
      setInlineConfirmModal({
        title: '放弃保存吗？',
        message: '您修改了专业或备注信息，确定放弃保存吗？',
        onConfirm: () => setShowAppModal(false)
      });
      return;
    }
    setShowAppModal(false);
  };

  const [addingRecommender, setAddingRecommender] = useState(false);
  const handleAddRecommender = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const recName = fd.get('recName');
    const recEmail = fd.get('recEmail');
    const recNotes = fd.get('recNotes');
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      let updated = { ...stu, recommenders: [...(stu.recommenders || []), { id: 'R' + Date.now(), name: recName, email: recEmail, notes: recNotes || '' }] };
      updated = addEventToStudent(updated, 'recommender', 'add', '添加推荐人', `新增了推荐人: ${recName}`);
      return updated;
    }));
    setAddingRecommender(false);
  };

  const handleInlineLogRecommenderNotes = (recId, oldValue, newValue) => {
    if (oldValue === newValue) return;
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const rec = stu.recommenders?.find(r => r.id === recId);
      if (!rec) return stu;
      let updatedRecommenders = stu.recommenders.map(r => r.id === recId ? { ...r, notes: newValue } : r);
      let updatedStu = { ...stu, recommenders: updatedRecommenders };
      return addEventToStudent(updatedStu, 'recommender', 'edit', '修改推荐人备注', `修改了推荐人 [${rec.name}] 的备注为: "${newValue}"`);
    }));
  };

  const handleDeleteRecommender = (recId) => {
    
    setCompletedAlerts(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (key.includes(`-rl-${recId}`)) {
          delete next[key];
        }
      });
      return next;
    });
    setIgnoredAlerts(prev => {
      const next = new Set(prev);
      prev.forEach(key => {
        if (key.includes(`-rl-${recId}`)) {
          next.delete(key);
        }
      });
      return next;
    });

    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const recommenders = stu.recommenders || [];
      let updated = { ...stu, recommenders: recommenders.filter(r => r.id !== recId) };
      const recToDelete = recommenders.find(r => r.id === recId);
      updated = addEventToStudent(updated, 'recommender', 'delete', '删除推荐人', `移除了推荐人: ${recToDelete?.name}`);
      updated.applications = updated.applications.map(app => {
        if (app.recommendations && app.recommendations[recId]) {
            const newR = { ...app.recommendations };
            delete newR[recId];
            return { ...app, recommendations: newR };
        }
        return app;
      });
      return updated;
    }));
  };

  const handleUpdateRLStatus = (appId, recId, newStatus) => {
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const targetApp = stu.applications.find(a => a.id === appId);
      let updated = {
        ...stu,
        applications: stu.applications.map(app => {
          if (app.id !== appId) return app;
          return {
            ...app,
            recommendations: {
              ...app.recommendations,
              [recId]: { ...(app.recommendations?.[recId] || {}), status: newStatus, deadline: app.recommendations?.[recId]?.deadline || app.deadline }
            }
          };
        })
      };
      const recInfo = stu.recommenders?.find(r => r.id === recId);
      const statusMap = { pending: '待发链接', sent: '已发链接等待中', completed: '已完成网推', none: '不需要' };
      updated = addEventToStudent(updated, 'recommender', 'status_change', '网推进度更新', `将 [${targetApp?.school}] 下的 [${recInfo?.name || '未知推荐人'}] 网推状态改为: ${statusMap[newStatus]}`);
      return updated;
    }));
  };

  const handleUpdateRLDeadline = (appId, recId, newDate) => {
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const recInfo = stu.recommenders?.find(r => r.id === recId);
      const targetApp = stu.applications.find(a => a.id === appId);
      let updated = {
        ...stu,
        applications: stu.applications.map(app => {
          if (app.id !== appId) return app;
          return {
            ...app,
            recommendations: {
              ...app.recommendations,
              [recId]: { ...(app.recommendations?.[recId] || {}), status: app.recommendations?.[recId]?.status || 'pending', deadline: newDate }
            }
          }
        })
      };
      updated = addEventToStudent(updated, 'recommender', 'edit', '网推截止日变更', `将 [${targetApp?.school} - ${targetApp?.program}] 下 [${recInfo?.name}] 的网推截止日设为: ${newDate}`);
      return updated;
    }));
  };


  const handleInlineUpdateApp = (appId, field, value) => {
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const targetApp = stu.applications.find(a => a.id === appId);
      if (!targetApp) return stu;
      let updated = { ...stu, applications: stu.applications.map(app =>
        app.id === appId ? { ...app, [field]: value } : app
      )};
      if (field === 'status') {
        updated = addEventToStudent(updated, 'application', 'status_change', '专业进度更新', `将 ${targetApp.school} - ${targetApp.program} 的状态更改为: ${value}`);
      } else if (field === 'openDate') {
        updated = addEventToStudent(updated, 'application', 'edit', '修改开放日期', `【${targetApp.school} - ${targetApp.program}】开放日期设为: ${value}`);
      } else if (field === 'deadline') {
        updated = addEventToStudent(updated, 'application', 'edit', '修改截止日期', `【${targetApp.school} - ${targetApp.program}】DDL设为: ${value}`);
      }
      return updated;
    }));
  };


  const handleInlineAddNote = (appId) => {
    const newNote = { id: 'n' + Date.now(), text: '', deadline: '' };
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const targetApp = stu.applications.find(a => a.id === appId);
      let updated = { ...stu, applications: stu.applications.map(app =>
        app.id === appId ? { ...app, notes: [...(app.notes||[]), newNote] } : app
      )};
      updated = addEventToStudent(updated, 'note', 'add', '新增备注', `在【${targetApp?.school} - ${targetApp?.program}】新增了一条备注`);
      return updated;
    }));
  };



  const handleCommitUpdateNote = (appId, noteId, newText, newDeadline) => {
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const app = stu.applications.find(a => a.id === appId);
      if (!app) return stu;
      const note = app.notes?.find(n => n.id === noteId);
      if (!note) return stu;
      
      const textChanged = newText !== undefined && newText !== note.text;
      const deadlineChanged = newDeadline !== undefined && newDeadline !== note.deadline;
      if (!textChanged && !deadlineChanged) return stu;
      
      let updatedApp = { ...app };
      let logMsg = '';
      if (textChanged && deadlineChanged) {
        updatedApp.notes = app.notes.map(n => n.id === noteId ? { ...n, text: newText, deadline: newDeadline } : n);
        logMsg = `修改了备注内容为 "${newText}" 且截止日设为 ${newDeadline}`;
      } else if (textChanged) {
        updatedApp.notes = app.notes.map(n => n.id === noteId ? { ...n, text: newText } : n);
        logMsg = `修改了备注内容为 "${newText}"`;
      } else if (deadlineChanged) {
        updatedApp.notes = app.notes.map(n => n.id === noteId ? { ...n, deadline: newDeadline } : n);
        logMsg = `修改了备注截止日为 ${newDeadline}`;
      }
      
      let updatedStu = { ...stu, applications: stu.applications.map(a => a.id === appId ? updatedApp : a) };
      return addEventToStudent(updatedStu, 'note', 'edit', '更新备注', `${logMsg} (所属: ${app.school} - ${app.program})`);
    }));
  };

  const handleInlineUpdatePortal = (appId, field, value) => {
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const targetApp = stu.applications.find(a => a.id === appId);
      if (!targetApp) return stu;
      
      const oldValue = (targetApp.portal && targetApp.portal[field]) || '';
      if (value === oldValue) return stu;

      let updatedApp = { ...targetApp, portal: { ...(targetApp.portal || {}), [field]: value } };
      let updatedStu = { ...stu, applications: stu.applications.map(app => app.id === appId ? updatedApp : app) };
      
      const isSensitive = field === 'password' || field === 'emailPwd';
      const displayValue = isSensitive ? '******' : value;
      return addEventToStudent(updatedStu, 'application', 'edit', '更新网申Portal信息', `【${targetApp.school} - ${targetApp.program}】更新了Portal信息: ${field} = ${displayValue}`);
    }));
  };

  const handleInlineRemoveNote = (appId, noteId) => {
    const alertId = `${selectedStudentForDocsId}-${appId}-note-${noteId}`;
    setCompletedAlerts(prev => { const next = { ...prev }; delete next[alertId]; return next; });
    setIgnoredAlerts(prev => { const next = new Set(prev); next.delete(alertId); return next; });

    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const targetApp = stu.applications.find(a => a.id === appId);
      const note = targetApp?.notes?.find(n => n.id === noteId);
      let updated = { ...stu, applications: stu.applications.map(app =>
        app.id === appId ? { ...app, notes: (app.notes||[]).filter(n => n.id !== noteId) } : app
      )};
      if (note && targetApp) updated = addEventToStudent(updated, 'note', 'delete', '删除备注', `删除了【${targetApp.school} - ${targetApp.program}】的备注: ${note.text || '(空白备注)'}`);
      return updated;
    }));
  };

  const handleInlineUpdateStudentStatus = (stuId, newStatus) => {
    setStudents(prev => prev.map(s => {
      if (s.id !== stuId) return s;
      const updated = addEventToStudent({ ...s, status: newStatus }, 'student', 'status_change', '档案状态变更', `将进度状态更改为: ${newStatus}`);
      return updated;
    }));
  };

  const handleDeleteEvent = (evtId) => {
    setStudents(prev => prev.map(stu => {
      if (stu.id !== selectedStudentForDocsId) return stu;
      const updated = { ...stu, events: (stu.events || []).filter(e => e.id !== evtId) };
      return updated;
    }));
  };

  const handleChooseDataFolder = async () => {
    if (impersonatedSession) return;
    if (!window.electronAPI) return alert('此功能需要在桌面应用中使用');
    const account = cloudSession || loadSession();
    if (!account || account.role === 'admin') return alert('请先以教务账号登录后再选择存储文件夹');
    const folder = await window.electronAPI.chooseFolder();
    if (!folder) return;
    const saveSuccess = await window.electronAPI.setStoredPath(folder, account.username);
    if (!saveSuccess) return alert('无法保存存储文件夹路径，请检查文件夹权限');
    const verifyPath = await window.electronAPI.getStoredPath(account.username);
    if (!verifyPath || verifyPath !== folder) return alert('存储路径回读验证失败，请重试');
    setDataFolderPath(folder);
    
    // Account-specific filenames make this safe even when multiple people use
    // the same parent folder.  Loading remains an explicit user choice.
    const existingData = await window.electronAPI.loadData(folder, account.username);
    if (existingData && confirm('该文件夹中存在当前账号的本地数据，是否恢复？')) {
      setDataLoaded(false);
      applyLocalData(existingData);
      lastSyncedStudentsRef.current = [];
      lastSyncedSeasonsRef.current = [];
      lastSyncedSettingsRef.current = '';
      lastSyncedCalendarRef.current = '';
      setDataLoaded(true);
      setDataStatus(`已恢复本地数据 (${account.username})`);
    }
  };

  const getActiveTeacherSyncSession = () => (impersonatedSession?.role === 'user' ? impersonatedSession : null) || (
    cloudSession && (
      cloudSession.role === 'user' ||
      (cloudSession.role === 'sub_admin' && subAdminSelfMode)
    ) ? cloudSession : null
  );

  const getCurrentCloudSettings = () => ({
    alertConfig,
    ignoredAlerts: [...ignoredAlerts],
    completedAlerts,
    dismissedCalendarEvents,
    calendarCompletionBackups,
    activeSeasonId,
    systemWarningsTimeOverrides,
    customPresets,
    sourceRegions,
    targetRegions,
    sourceStages,
    targetStages
  });

  const getCurrentDataPayload = () => ({
    version: 1,
    students,
    seasons,
    ...getCurrentCloudSettings(),
    calendarEvents
  });

  const hasUnsyncedCloudChanges = () => {
    let lastSettings: unknown = lastSyncedSettingsRef.current;
    let lastCalendar: unknown = lastSyncedCalendarRef.current;
    try { lastSettings = lastSyncedSettingsRef.current ? JSON.parse(lastSyncedSettingsRef.current) : null; } catch {}
    try { lastCalendar = lastSyncedCalendarRef.current ? JSON.parse(lastSyncedCalendarRef.current) : null; } catch {}
    return stableJsonStringify(students) !== stableJsonStringify(lastSyncedStudentsRef.current || []) ||
      stableJsonStringify(seasons) !== stableJsonStringify(lastSyncedSeasonsRef.current || []) ||
      stableJsonStringify(getCurrentCloudSettings()) !== stableJsonStringify(lastSettings) ||
      stableJsonStringify(calendarEvents) !== stableJsonStringify(lastCalendar);
  };

  /** Save the current editor state to cloud without touching local files. */
  const handleCloudSaveOnly = async ({ silentSuccess = false } = {}) => {
    if (readOnlyViewer) {
      setDataStatus('规划老师为只读模式，无需保存');
      return false;
    }
    const syncSession = getActiveTeacherSyncSession();
    if (!syncSession) {
      setDataStatus('当前没有可保存的教务云端会话');
      return false;
    }
    if (!cloudSnapshotReadyRef.current) {
      setDataStatus('云端数据尚未成功加载，已阻止保存以保护原有数据');
      return false;
    }

    if (cloudSyncTimerRef.current) {
      clearTimeout(cloudSyncTimerRef.current);
      cloudSyncTimerRef.current = null;
    }
    const oldStudents = JSON.parse(JSON.stringify(lastSyncedStudentsRef.current || []));
    const oldSeasons = JSON.parse(JSON.stringify(lastSyncedSeasonsRef.current || []));
    const oldSettings = lastSyncedSettingsRef.current;
    const oldCalendar = lastSyncedCalendarRef.current;
    const now = new Date().toISOString();
    const currentSettings = getCurrentCloudSettings();
    const changedStudents: StudentSyncRecord[] = students.map(student => ({
      student_id: student.id,
      data_json: JSON.stringify(student),
      updated_at: now
    }));
    oldStudents.forEach(old => {
      if (!students.some(student => student.id === old.id)) {
        changedStudents.push({ student_id: old.id, data_json: '{}', updated_at: now, is_deleted: true });
      }
    });
    const changedSeasons: SeasonSyncRecord[] = seasons.map(season => ({
      season_id: season.id,
      data_json: JSON.stringify(season),
      is_archived: !!season.isArchived,
      updated_at: now
    }));
    oldSeasons.forEach(old => {
      if (!seasons.some(season => season.id === old.id)) {
        changedSeasons.push({ season_id: old.id, data_json: '{}', is_archived: !!old.isArchived, updated_at: now, is_deleted: true });
      }
    });

    setSyncStatus('syncing');
    setDataStatus('正在保存到云端…');
    const saveEpoch = accountEpochRef.current;
    try {
      const result = await runCloudSync(syncSession, {
        changedStudents,
        changedSeasons,
        settings: currentSettings,
        calendar: calendarEvents,
        lastSyncAt: lastSyncAtRef.current
      });
      if (saveEpoch !== accountEpochRef.current) return false;
      lastSyncedStudentsRef.current = JSON.parse(JSON.stringify(students));
      lastSyncedSeasonsRef.current = JSON.parse(JSON.stringify(seasons));
      lastSyncedSettingsRef.current = JSON.stringify(currentSettings);
      lastSyncedCalendarRef.current = JSON.stringify(calendarEvents);
      if (result?.server_sync_time) {
        lastSyncAtRef.current = result.server_sync_time;
        setLastSyncAt(result.server_sync_time);
      }
      if (result?.downloaded && (
        result.downloaded.students?.length || result.downloaded.seasons?.length ||
        result.downloaded.settings || result.downloaded.calendar
      )) {
        mergeCloudData(result.downloaded, oldStudents, oldSeasons, oldSettings, oldCalendar);
      }
      setSyncStatus('synced');
      if (!silentSuccess) setDataStatus('云端保存成功');
      return true;
    } catch (error: any) {
      if (saveEpoch !== accountEpochRef.current) return false;
      const message = error?.message || String(error);
      setSyncStatus('error');
      setDataStatus(`云端保存失败：${message}`);
      return false;
    }
  };

  /** Replace the editor snapshot with the latest cloud snapshot. */
  const handleCloudRefresh = async () => {
    const syncSession = getActiveTeacherSyncSession();
    if (!syncSession) {
      setDataStatus('当前没有可读取的教务云端会话');
      return false;
    }
    if (!readOnlyViewer && hasUnsyncedCloudChanges()) {
      const shouldSave = window.confirm('当前有尚未保存的修改。是否先保存到云端，再重新读取？');
      if (!shouldSave) return false;
      const saved = await handleCloudSaveOnly({ silentSuccess: true });
      if (!saved) return false;
    }
    if (cloudRequestRef.current) {
      try { await cloudRequestRef.current; } catch {}
    }
    setDataLoaded(false);
    setSyncStatus('syncing');
    setDataStatus('正在从云端读取…');
    const refreshEpoch = accountEpochRef.current;
    try {
      const cloudData = impersonatedSession && cloudSession
        ? await adminInitLoad(cloudSession.token, impersonatedSession.username)
        : await initLoad(syncSession);
      if (refreshEpoch !== accountEpochRef.current) return false;
      resetAccountScopedData();
      applyCloudData(cloudData);
      loadedArchiveSeasonIds.current = new Set();
      cloudSnapshotReadyRef.current = true;
      lastSyncAtRef.current = cloudData.server_sync_time;
      setLastSyncAt(cloudData.server_sync_time);
      setDataLoaded(true);
      setSyncStatus('synced');
      setDataStatus(`已从云端刷新 (${syncSession.username})`);
      return true;
    } catch (error: any) {
      if (refreshEpoch !== accountEpochRef.current) return false;
      setDataLoaded(true);
      setSyncStatus('error');
      setDataStatus(`云端读取失败：${error?.message || String(error)}`);
      return false;
    }
  };

  const handleManualSaveTeacher = async () => {
    if (readOnlyViewer) return alert('规划老师为只读查看模式，不能保存或修改教务数据');
    // Web/mobile browser is deliberately cloud-only.  The desktop app keeps
    // its original dual-save contract (account-local file + cloud).
    if (!window.electronAPI) return handleCloudSaveOnly();
    if (!dataFolderPath) {
      alert('请先配置数据存储文件夹');
      return false;
    }
    let localOk = false;
    try { localOk = await saveDataHelper(dataFolderPath, getCurrentDataPayload()); } catch {}
    const cloudSessionForSave = getActiveTeacherSyncSession();
    const cloudOk = cloudSessionForSave ? await handleCloudSaveOnly({ silentSuccess: true }) : true;
    if (localOk && cloudOk) setDataStatus(cloudSessionForSave ? '双端保存成功' : '本地保存成功（未连接云端）');
    else if (!localOk && cloudOk) setDataStatus('本地保存失败，云端已保存');
    else if (localOk && !cloudOk) setDataStatus('本地已保存，但云端保存失败');
    return localOk && cloudOk;
  };

  const handleManualSaveAdmin = async () => {
    if (readOnlyViewer) return alert('规划老师为只读查看模式，不能保存或修改教务数据');
    if (!impersonatedSession) {
      alert('当前管理员模式下无法直接保存（请使用"模拟登录"后操作）');
      return false;
    }
    return handleCloudSaveOnly();
  };

  const enterRecycleBinMode = () => {
    setIsRecycleBinMode(true);
    const firstArchived = seasons.find(s => s.isArchived);
    setActiveSeasonId(firstArchived?.id || '');
    // The archive is a historical record browser, so enter the only view that
    // can meaningfully display it.  Keeping the calendar/dashboard selected
    // would leave active-season operational content on screen.
    setActiveTab('students');
    setSelectedStudentForDocsId(null);
    setSelectedStudentForGanttId(null);
  };

  const exitRecycleBinMode = () => {
    setIsRecycleBinMode(false);
    const firstActive = seasons.find(s => !s.isArchived);
    setActiveSeasonId(firstActive?.id || '');
    setSelectedStudentForDocsId(null);
    setSelectedStudentForGanttId(null);
  };

  const handleRestoreSeason = async (seasonId) => {
    const updatedSeasons = seasons.map(s => s.id === seasonId ? { ...s, isArchived: false } : s);
    setSeasons(updatedSeasons);
    setActiveSeasonId(seasonId);
    setIsRecycleBinMode(false);

    if (dataFolderPath && window.electronAPI) {
      await saveDataHelper(dataFolderPath, {
        version: 1,
        students,
        seasons: updatedSeasons,
        alertConfig,
        ignoredAlerts: [...ignoredAlerts],
        completedAlerts,
        dismissedCalendarEvents,
        calendarCompletionBackups,
        activeSeasonId: seasonId,
        calendarEvents,
        systemWarningsTimeOverrides,
        customPresets,
        sourceRegions,
        targetRegions,
        sourceStages,
        targetStages
      });
      setDataStatus('已自动保存');
    } else if (window.electronAPI) {
      saveLocalStorageHelper('教务数据', JSON.stringify({
        version: 1,
        students,
        seasons: updatedSeasons,
        alertConfig,
        ignoredAlerts: [...ignoredAlerts],
        completedAlerts,
        dismissedCalendarEvents,
        calendarCompletionBackups,
        activeSeasonId: seasonId,
        calendarEvents,
        systemWarningsTimeOverrides,
        customPresets,
        sourceRegions,
        targetRegions,
        sourceStages,
        targetStages
      }));
    }
  };

  const handlePermanentDeleteSeason = async (seasonId) => {
    const seasonToDelete = seasons.find(s => s.id === seasonId);
    if (!seasonToDelete) return;
    const updatedStudents = students.filter(stu => stu.seasonId !== seasonId);
    setStudents(updatedStudents);
    const updatedSeasons = seasons.filter(s => s.id !== seasonId);
    setSeasons(updatedSeasons);
    let nextActiveId = activeSeasonId;
    if (activeSeasonId === seasonId) {
      const firstArchived = updatedSeasons.find(s => s.isArchived);
      if (firstArchived) {
        nextActiveId = firstArchived.id;
        setActiveSeasonId(nextActiveId);
      } else {
        setIsRecycleBinMode(false);
        const firstActive = updatedSeasons.find(s => !s.isArchived);
        if (firstActive) {
          nextActiveId = firstActive.id;
          setActiveSeasonId(nextActiveId);
        } else {
          nextActiveId = null;
          setActiveSeasonId(null);
        }
      }
    }

    if (dataFolderPath && window.electronAPI) {
      await saveDataHelper(dataFolderPath, {
        version: 1,
        students: updatedStudents,
        seasons: updatedSeasons,
        alertConfig,
        ignoredAlerts: [...ignoredAlerts],
        completedAlerts,
        dismissedCalendarEvents,
        calendarCompletionBackups,
        activeSeasonId: nextActiveId,
        calendarEvents,
        systemWarningsTimeOverrides,
        customPresets,
        sourceRegions,
        targetRegions,
        sourceStages,
        targetStages
      });
      setDataStatus('已自动保存');
    } else if (window.electronAPI) {
      saveLocalStorageHelper('教务数据', JSON.stringify({
        version: 1,
        students: updatedStudents,
        seasons: updatedSeasons,
        alertConfig,
        ignoredAlerts: [...ignoredAlerts],
        completedAlerts,
        dismissedCalendarEvents,
        calendarCompletionBackups,
        activeSeasonId: nextActiveId,
        calendarEvents,
        systemWarningsTimeOverrides,
        customPresets,
        sourceRegions,
        targetRegions,
        sourceStages,
        targetStages
      }));
    }
  };

  const unassignedStudents = useMemo(() => {
    const validSeasonIds = new Set(seasons.map(s => s.id));
    return students.filter(s => !s.seasonId || !validSeasonIds.has(s.seasonId));
  }, [students, seasons]);

  const recoverUnassignedStudents = () => {
    const targetSeasonId = resolveActiveSeasonId(seasons, activeSeasonId);
    if (!targetSeasonId) {
      alert('请先新建一个申请季，再处理未归属的学生档案。');
      return;
    }
    setStudents(prev => prev.map(student => (
      !student.seasonId || !seasons.some(season => season.id === student.seasonId)
        ? { ...student, seasonId: targetSeasonId }
        : student
    )));
    setActiveSeasonId(targetSeasonId);
    setIsRecycleBinMode(false);
  };

  const handleToggleArchiveSeason = async (targetSeason) => {
    const updatedSeasons = seasons.map(s => s.id === targetSeason.id ? { ...s, isArchived: !s.isArchived } : s);
    let nextActiveId = activeSeasonId;

    if (!targetSeason.isArchived && activeSeasonId === targetSeason.id) {
      const firstActive = updatedSeasons.find(s => !s.isArchived);
      if (firstActive) {
        nextActiveId = firstActive.id;
        setActiveSeasonId(nextActiveId);
      }
    }

    setSeasons(updatedSeasons);

    if (dataFolderPath && window.electronAPI) {
      await saveDataHelper(dataFolderPath, {
        version: 1,
        students,
        seasons: updatedSeasons,
        alertConfig,
        ignoredAlerts: [...ignoredAlerts],
        completedAlerts,
        dismissedCalendarEvents,
        calendarCompletionBackups,
        activeSeasonId: nextActiveId,
        calendarEvents,
        systemWarningsTimeOverrides,
        customPresets,
        sourceRegions,
        targetRegions,
        sourceStages,
        targetStages
      });
      setDataStatus('已自动保存');
    } else if (window.electronAPI) {
      saveLocalStorageHelper('教务数据', JSON.stringify({
        version: 1,
        students,
        seasons: updatedSeasons,
        alertConfig,
        ignoredAlerts: [...ignoredAlerts],
        completedAlerts,
        dismissedCalendarEvents,
        calendarCompletionBackups,
        activeSeasonId: nextActiveId,
        calendarEvents,
        systemWarningsTimeOverrides,
        customPresets,
        sourceRegions,
        targetRegions,
        sourceStages,
        targetStages
      }));
    }
  };

  const handleAdminBackup = async () => {
    if (!window.electronAPI) return alert("仅在桌面版可用");
    const destFolder = await window.electronAPI.chooseFolder();
    if (!destFolder) return;
    const payload = { version: 1, students, seasons, alertConfig, ignoredAlerts: [...ignoredAlerts], completedAlerts, dismissedCalendarEvents, calendarCompletionBackups, activeSeasonId, calendarEvents, systemWarningsTimeOverrides, customPresets, sourceRegions, targetRegions, sourceStages, targetStages };
    try {
      await window.electronAPI.saveData(destFolder, payload);
      alert(`备份成功！\n路径：${destFolder}\\教务数据.json`);
    } catch (e: any) {
      alert("备份失败: " + e.message);
    }
  };

  const handleBackup = async () => {
    if (impersonatedSession) return;
    if (!dataFolderPath || !window.electronAPI) return alert('请先配置数据存储文件夹');
    const account = cloudSession || loadSession();
    if (!account) return alert('未找到当前账号，无法创建备份');
    const destFolder = await window.electronAPI.chooseFolder();
    if (!destFolder) return;
    const payload = { version: 1, students, seasons, alertConfig, ignoredAlerts: [...ignoredAlerts], completedAlerts, dismissedCalendarEvents, calendarCompletionBackups, activeSeasonId, calendarEvents, systemWarningsTimeOverrides, customPresets, sourceRegions, targetRegions, sourceStages, targetStages };
    const saved = await saveDataHelper(dataFolderPath, payload);
    if (!saved) return alert('备份前的本地保存失败，已停止创建备份以保护现有数据。');

    // Confirm that Electron wrote the same student count before copying it.
    // This catches a wrong-account path or a failed/old IPC implementation
    // instead of producing a misleading, empty "successful" backup.
    const written = await window.electronAPI.loadData(dataFolderPath, account.username);
    if (!written || studentCount(written) !== studentCount(payload)) {
      return alert('备份校验失败：本地文件与当前数据不一致，已停止创建备份。');
    }
    const dest = await window.electronAPI.backupData(dataFolderPath, destFolder, account?.username);
    if (dest) alert(`备份成功！\n路径：${dest}`);
    else alert('备份失败，请检查目标文件夹权限。');
  };

  const renderGanttHeader = (isDetailed = false) => {
    const nameColClass = isDetailed ? 'w-64' : 'w-48';
    const months = [];
    let cur = new Date(activeSeasonConfig.start + 'T00:00:00');
    const end = new Date(activeSeasonConfig.end + 'T00:00:00');
    while (cur <= end) {
      const pos = getPos(fmt(cur));
      months.push({ label: `${cur.getFullYear().toString().slice(2)}/${cur.getMonth() + 1}`, pos });
      cur.setMonth(cur.getMonth() + 2);
    }
    return (
      <div className="flex border-b border-slate-200 text-xs font-semibold text-slate-400 pb-2 mb-4">
        <div className={`${nameColClass} flex-shrink-0`}>{isDetailed ? '院校专业' : '学生'}</div>
        <div className="flex-1 relative h-5 px-2">
          {months.map(({ label, pos }, i) => (
            <span key={i} className="absolute whitespace-nowrap" style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}>{label}</span>
          ))}
        </div>
      </div>
    );
  };

  const renderTodayLine = (nameColWidth = '12rem') => {
    const todayStr = getTodayStr();
    const pos = getPos(todayStr);
    if (pos < 0 || pos > 100) return null;
    const frac = pos / 100;
    const leftCalc = `calc(${nameColWidth} + ${frac} * (100% - ${nameColWidth}))`;
    const now = new Date();
    return (
      <div className="absolute top-0 bottom-0 w-[2px] bg-red-500/70 z-40 pointer-events-none" style={{ left: leftCalc }}>
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full border-[3px] border-white shadow-md"/>
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap">今日 {now.getMonth()+1}.{now.getDate()}</div>
      </div>
    );
  };

  const renderDot = (dateStr, colorClass, tooltipText, keyProp, alertId, onClickAction, forceSquare = false) => {
    const pos = getPos(dateStr);
    if (pos < 0 || pos > 100) return null;
    const isDone = alertId && (completedAlerts[alertId] || allAlerts.find(a => a.id === alertId)?.rlStatus === 'completed');
    return (
      <div key={keyProp} onClick={(e) => { if (onClickAction) { e.stopPropagation(); onClickAction(); } }}
        className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center group/dot z-30 hover:z-50"
        style={{ left: `${pos}%` }}>
        {isDone || forceSquare ? (
          <div className={`w-3.5 h-3.5 ${colorClass.replace('bg-', 'bg-')} border-2 border-white shadow-md cursor-pointer hover:scale-125 transition-transform opacity-60`}
               style={{ borderRadius: '2px', background: isDone ? '#94a3b8' : undefined }}/>
        ) : (
          <div className={`w-3.5 h-3.5 rounded-full ${colorClass} border-2 border-white shadow-md cursor-pointer hover:scale-125 transition-transform`}/>
        )}
        <div className="hidden group-hover/dot:block absolute bottom-full mb-1.5 w-max bg-gray-800 text-white text-[17px] px-2.5 py-1.5 rounded shadow-lg pointer-events-none max-w-48">
          {isDone ? '已完成：' : forceSquare ? '通知已暂停：' : ''}{tooltipText} ({dateStr})
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"/>
        </div>
      </div>
    );
  };

  const renderAlertCard = (a, isCompleted = false) => {
    const styles = { critical: 'border-l-red-500 bg-red-50', warning: 'border-l-amber-400 bg-amber-50', info: 'border-l-blue-400 bg-blue-50' };
    const icons = {
      critical: <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0"/>,
      warning: <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 mr-3 flex-shrink-0"/>,
      info: <InfoIcon className="w-5 h-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0"/>
    };
    if (isEndfieldTheme) {
      return (
        <div 
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', a.title);
            e.dataTransfer.setData('alertId', a.id);
            e.dataTransfer.setData('alertType', a.type);
            e.dataTransfer.setData('sourceType', 'alert');
            if (a.studentId) e.dataTransfer.setData('studentId', a.studentId);
            if (a.appId) e.dataTransfer.setData('appId', a.appId);
            if (a.noteId) e.dataTransfer.setData('noteId', a.noteId);
            
            const displayText = `${a.student ? `[${a.student}] ` : ''}${a.title}`;
            handleDragStartWithGhost(e, displayText, isCompleted ? 'completed' : a.type);
          }}
          className={`px-8 py-4 flex items-center border-b border-[#FF6A00]/10 hover:bg-[#FF6A00]/5 transition-colors group/alert ${isCompleted ? 'opacity-40' : ''}`}
        >
          <div className="mr-6 flex-shrink-0 relative">
            <div className={`absolute -left-2 top-1/2 -translate-y-1/2 w-[2px] h-0 group-hover/alert:h-full transition-all duration-300 ${a.type === 'critical' ? 'bg-red-500' : 'bg-[#FF6A00]'}`}></div>
            {isCompleted ? <CheckCircle2 className="w-5 h-5 text-slate-600"/> : icons[a.type]}
          </div>
          <div className="flex-1 font-mono min-w-0">
            <p className={`text-[15px] font-bold tracking-wider leading-snug ${isCompleted ? 'text-slate-600 line-through' : 'text-white'}`}>
              <span className={`mr-2 inline-block ${a.type === 'critical' ? 'text-red-500' : 'text-[#FF6A00]'}`}>{a.student ? `[ ${a.student} ]` : ''}</span>
              {a.title}
            </p>
            <p className={`text-xs mt-1.5 tracking-widest leading-relaxed ${isCompleted ? 'text-slate-600' : 'text-[#c8cbd0]'}`}>{a.message}</p>
          </div>
          <div className="flex items-center space-x-3 opacity-0 group-hover/alert:opacity-100 transition-opacity flex-shrink-0">
             {!isCompleted && a.studentId && (
               <button onClick={() => handleJumpToApp(students.find(s => s.id === a.studentId), a.targetId)}
                 className="px-4 py-1.5 bg-stone-900 border border-[#FF6A00]/30 text-[#FF6A00] text-[10px] hover:bg-[#FF6A00]/20 font-mono tracking-widest clip-corner-br">
                 [ 处理_EXEC ]
               </button>
             )}
             {a.autoResolveOnly && !isCompleted ? (
                <div className="px-4 py-1.5 text-[10px] text-red-500/70 border border-transparent flex items-center justify-center font-mono">
                  / MAT_REQ /
                </div>
             ) : (
                <button onClick={() => handleCompleteAlert(a)}
                  className={`px-4 py-1.5 border text-[10px] flex items-center gap-1 font-mono tracking-widest clip-corner-br ${isCompleted ? 'border-cyan-900/50 text-cyan-700 bg-black/40 hover:bg-cyan-900/20' : 'border-[#FF6A00]/40 text-[#FF6A00] bg-black/40 hover:bg-[#FF6A00]/20'}`}>
                  {isCompleted ? '[ 恢复_RST ]' : '[ 完成_FIN ]'}
                </button>
             )}
             {!isCompleted && (
                <>
                  <button onClick={() => handleIgnoreAlert(a.id)} className="px-3 py-1.5 text-[10px] border border-slate-700 text-slate-500 hover:text-white bg-black/40 hover:bg-slate-700 clip-corner-br font-mono tracking-widest">
                    / 忽略
                  </button>
                  {deletingDashboardAlertConfirmId === a.id ? (
                     <button onClick={() => { handleDeleteAlertDashboard(a); setDeletingDashboardAlertConfirmId(null); }} className="px-3 py-1.5 text-[10px] border border-red-500 text-red-500 bg-red-950 clip-corner-br font-mono font-bold tracking-widest">/ 确认</button>
                  ) : (
                     <button onClick={() => setDeletingDashboardAlertConfirmId(a.id)} className="px-3 py-1.5 text-[10px] border border-red-900/40 text-red-700 hover:text-red-500 hover:border-red-500 bg-black/40 clip-corner-br font-mono tracking-widest">/ 删除</button>
                  )}
                </>
             )}
          </div>
        </div>
      );
    }

    return (
      <div 
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', a.title);
          e.dataTransfer.setData('alertId', a.id);
          e.dataTransfer.setData('alertType', a.type);
          e.dataTransfer.setData('sourceType', 'alert');
          if (a.studentId) e.dataTransfer.setData('studentId', a.studentId);
          if (a.appId) e.dataTransfer.setData('appId', a.appId);
          if (a.noteId) e.dataTransfer.setData('noteId', a.noteId);
          
          const displayText = `${a.student ? `[${a.student}] ` : ''}${a.title}`;
          handleDragStartWithGhost(e, displayText, isCompleted ? 'completed' : a.type);
        }}
        className={`${isMobileBrowser ? 'p-3 flex-wrap gap-y-3' : 'p-5'} flex items-start border-l-4 ${isMobileBrowser ? '' : 'cursor-grab active:cursor-grabbing'} ${isCompleted ? 'border-l-slate-300 bg-slate-50 opacity-70' : styles[a.type]}`}
      >
        {isCompleted ? <CheckCircle2 className="w-5 h-5 text-slate-400 mt-0.5 mr-3 flex-shrink-0"/> : icons[a.type]}
        <div className="min-w-0 flex-1">
          <p className={`font-bold ${isMobileBrowser ? 'leading-snug' : 'flex items-center'} ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
            {a.student}{a.student && <span className="mx-2 font-normal text-slate-400">|</span>} {a.title}
          </p>
          <p className={`text-sm mt-2 leading-relaxed ${isCompleted ? 'text-slate-400' : 'text-slate-700'}`}>{a.message}</p>
        </div>
        <div className={`${isMobileBrowser ? 'mobile-alert-actions w-full grid grid-cols-2 gap-2 ml-8' : 'flex flex-col space-y-1.5 ml-3 flex-shrink-0'}`}>
          {!isCompleted && a.studentId && (
            <button onClick={() => handleJumpToApp(students.find(s => s.id === a.studentId), a.targetId)}
              className="px-3 py-1.5 bg-white text-xs font-medium border border-slate-300 rounded hover:bg-slate-50 shadow-sm">
              去档案库处理
            </button>
          )}
          {a.autoResolveOnly && !isCompleted ? (
            <div className="px-3 py-1.5 text-xs text-slate-400 border border-transparent flex items-center justify-center text-center cursor-help" title="此类警告必须去档案库手动勾选对应的缺失材料后才能自动消除">
              请勾选材料以消除
            </div>
          ) : (
            <button onClick={() => handleCompleteAlert(a)}
              className={`px-3 py-1.5 text-xs font-medium border rounded flex items-center justify-center gap-1 transition-colors ${isCompleted ? 'border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100' : 'border-green-400 text-green-700 bg-white hover:bg-green-50'}`}>
              {isCompleted ? <><RotateCcw className="w-3 h-3"/> 取消完成</> : <><Check className="w-3 h-3"/> 标记完成</>}
            </button>
          )}
          {!isCompleted && (
            <div className={`${isMobileBrowser ? 'mobile-alert-actions col-span-2 grid grid-cols-2 gap-2' : 'flex gap-1.5 mt-1.5'}`}>
              <button onClick={() => handleIgnoreAlert(a.id)} className="flex-1 px-2 py-1.5 text-xs text-slate-500 hover:text-orange-500 border border-slate-200 hover:border-orange-200 hover:bg-orange-50 rounded flex items-center justify-center gap-1 transition-colors shadow-sm bg-white" title="忽略本次预警（仅隐藏）">
                <BellOff className="w-3.5 h-3.5"/> 忽略
              </button>
              
              {deletingDashboardAlertConfirmId === a.id ? (
                <button
                  data-confirm-zone="true"
                  onClick={() => {
                    handleDeleteAlertDashboard(a);
                    setDeletingDashboardAlertConfirmId(null);
                  }}
                  className="flex-1 px-2 py-1.5 text-xs text-red-600 font-bold border border-red-300 bg-red-50 rounded flex items-center justify-center transition-colors shadow-sm animate-fade-in"
                  title="确认彻底删除"
                >
                  确认？
                </button>
              ) : (
                <button
                  data-confirm-zone="true"
                  onClick={() => setDeletingDashboardAlertConfirmId(a.id)}
                  className="flex-1 px-2 py-1.5 text-xs text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 hover:bg-red-50 rounded flex items-center justify-center gap-1 transition-colors shadow-sm bg-white"
                  title="彻底删除该预警（同步删除日历事项）"
                >
                  <Trash2 className="w-3.5 h-3.5"/> 删除
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const isEndfieldTheme = renderedEffectsConfig.enabled && renderedEffectsConfig.type === 'endfield';
  const isCustomCursorActive = renderedEffectsConfig.enabled && renderedEffectsConfig.cursorStyle !== 'default';

  useEffect(() => {
    if (isCustomCursorActive) {
      document.documentElement.classList.add('custom-cursor-active');
      document.body.classList.add('custom-cursor-active');
    } else {
      document.documentElement.classList.remove('custom-cursor-active');
      document.body.classList.remove('custom-cursor-active');
    }
  }, [isCustomCursorActive]);


  const handleSafeExit = async () => {
    // A browser edit can still be inside the debounce window when the user
    // taps logout.  Flush the current snapshot first; never cancel a pending
    // save merely because the screen is being closed.
    const activeTeacherSession = getActiveTeacherSyncSession();
    if (dataLoaded && !readOnlyViewer && activeTeacherSession) {
      const cloudSaved = await handleCloudSaveOnly({ silentSuccess: true });
      if (!cloudSaved) {
        const discard = window.confirm('云端保存失败。继续退出会丢失尚未同步的修改，仍要退出吗？');
        if (!discard) return;
      }
    }
    if (dataLoaded && !readOnlyViewer && !impersonatedSession && window.electronAPI && dataFolderPath) {
      let localSaved = false;
      try { localSaved = await saveDataHelper(dataFolderPath, getCurrentDataPayload()); } catch {}
      if (!localSaved && !activeTeacherSession) {
        const discard = window.confirm('本地保存失败。继续退出会丢失尚未保存的修改，仍要退出吗？');
        if (!discard) return;
      }
    }
    setDataLoaded(false);
    setShowMobileSystemMenu(false);
    if (cloudSyncTimerRef.current) {
      clearTimeout(cloudSyncTimerRef.current);
      cloudSyncTimerRef.current = null;
    }
    if (cloudSession) {
      if (impersonatedSession && (cloudSession.role === 'admin' || cloudSession.role === 'sub_admin')) {
        try {
          await adminUnlockUser(cloudSession.token, impersonatedSession.username);
        } catch (e) {
          console.error('Failed to unlock user on safe exit:', e);
        }
      }
      try {
        await logoutSession(cloudSession);
      } catch (error) {
        // Exiting must remain available during a network interruption; the
        // server will expire an unreachable session normally.
        console.warn('Failed to record cloud logout:', error);
      }
      clearSession();
    }
    setCloudSession(null);
    setImpersonatedSession(null);
    setPlannerStudentContext(null);
           setSubAdminSelfMode(false);
    setReadOnlyViewer(false);
    setPlannerStudentContext(null);
    (window as any).subAdminSelfMode = false;
    resetAccountScopedData();
    setShowLoginScreen(true);
  };

  const handleExitPlannerStudentView = () => {
    setPlannerStudentContext(null);
    setReadOnlyViewer(false);
    resetAccountScopedData();
    setActiveTab('students');
    setDataStatus('规划老师学生管理');
    setSyncStatus('idle');
    setDataLoaded(true);
  };

  const handleExitAdminImpersonation = async (saveTeacherChanges = true) => {
    const targetSession = impersonatedSession;
    if (!targetSession) return;
    if (saveTeacherChanges && targetSession.role === 'user' && !readOnlyViewer && dataLoaded) {
      const saved = await handleCloudSaveOnly({ silentSuccess: true });
      if (!saved && !window.confirm('云端保存失败。仍要退出模拟登录并放弃未同步修改吗？')) return;
    }
    if ((cloudSession?.role === 'admin' || cloudSession?.role === 'sub_admin')) {
      try {
        await adminUnlockUser(cloudSession.token, targetSession.username);
      } catch (error) {
        console.error('Failed to unlock user on exit impersonation:', error);
      }
    }
    setPlannerStudentContext(null);
    setImpersonatedSession(null);
    setReadOnlyViewer(false);
    resetAccountScopedData();
    setDataStatus('管理员模式');
    setSyncStatus('idle');
    setDataLoaded(true);
  };

  const handleViewPlannerStudent = async (plannerSession: CloudSession, student: PlannerStudentSummary) => {
    setDataLoaded(false);
    setSyncStatus('syncing');
    resetAccountScopedData();
    const viewEpoch = accountEpochRef.current;
    try {
      const result = await loadPlannerStudent(plannerSession, student.teacher_username, student.student_id);
      if (viewEpoch !== accountEpochRef.current) return;
      applyCloudData({
        students: result.student ? [result.student] : [],
        seasons: result.seasons || [],
        settings: null,
        calendar: null,
      });
      setPlannerStudentContext(student);
      setReadOnlyViewer(true);
      setActiveTab('students');
      setSelectedStudentForDocsId(student.student_id);
      setSelectedStudentForGanttId(null);
      setDataStatus(`只读查看 ${student.name}（负责教务：${student.teacher_username}）`);
      setSyncStatus('synced');
      setDataLoaded(true);
    } catch (error: any) {
      if (viewEpoch !== accountEpochRef.current) return;
      setSyncStatus('error');
      setDataLoaded(true);
      alert('无法读取该学生资料：' + (error?.message || String(error)));
    }
  };

  if (showLoginScreen) {
    return (
      <>
      <CursorTrail config={renderedEffectsConfig} />
      <LoginScreen
        isKickedOut={isKickedOut}
        isLockedByAdmin={isLockedByAdmin}
        fontScaleMode={fontScaleMode}
        onFontScaleChange={setFontScaleMode}
        onLoginSuccess={async (session) => {
          // A login is an account boundary.  Clear the previous account before
          // any network/local load so stale students can never be displayed or
          // synchronized under the new account.
          setDataLoaded(false);
          if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
          lastSyncedStudentsRef.current = [];
          lastSyncedSeasonsRef.current = [];
          lastSyncedSettingsRef.current = '';
          lastSyncedCalendarRef.current = '';
          resetAccountScopedData();
          const loginEpoch = accountEpochRef.current;
          setShowLoginScreen(false);
          setIsKickedOut(false);
          setIsLockedByAdmin(false);
          setSubAdminSelfMode(false);
          setReadOnlyViewer(false);
          (window as any).subAdminSelfMode = false;
          setCloudSession(session);
          // Main admin has no edu data - go directly to AdminDashboard, no initLoad needed
          if (session.role === 'admin' || session.role === 'planner') {
            setSyncStatus('idle');
            setDataLoaded(true);
            setDataStatus(session.role === 'planner' ? '规划老师只读模式' : '管理员模式');
            return;
          }
          setSyncStatus('syncing');
          let localData: any = null;
          let storedPath: string | null = null;
          if (window.electronAPI) {
            try {
              storedPath = await window.electronAPI.getStoredPath(session.username);
              if (storedPath) {
                setDataFolderPath(storedPath);
                localData = await window.electronAPI.loadData(storedPath, session.username);
              }
            } catch (e) {
              console.error('Failed to load account-local data:', e);
            }
          }
          try {
             const cloudData = await initLoad(session);
             if (loginEpoch !== accountEpochRef.current) return;
             const hasCloudData = cloudHasAnyData(cloudData);
             const restoreLocalStudents = shouldRestoreLocalStudents(localData, cloudData);
             // A new account's initial sync often writes default seasons and
             // settings before its first student reaches the server.  That is
             // metadata, not a usable cloud snapshot; never let it overwrite
             // a non-empty account-local file.
              if (restoreLocalStudents) {
                  applyLocalData(localData);
                  setCalendarEvents(prev => prev.filter(event => !event?.isAlert));
              } else if (hasCloudData) {
                  applyCloudData(cloudData);
                  setCalendarEvents(prev => prev.filter(event => !event?.isAlert));
              } else if (localData) {
                 // Cloud is empty but this account has its own saved local
                 // file.  Restore it; the normal delta sync will upload it.
                  applyLocalData(localData);
                  setCalendarEvents(prev => prev.filter(event => !event?.isAlert));
             }
             lastSyncAtRef.current = cloudData.server_sync_time;
             setLastSyncAt(cloudData.server_sync_time);
             cloudSnapshotReadyRef.current = true;
             setSyncStatus('synced');
             setDataLoaded(true);
             setDataStatus(restoreLocalStudents || !hasCloudData && localData
               ? `已从本地恢复 (${session.username})`
               : hasCloudData
                 ? `已从云端加载 (${session.username})`
                 : `已创建空白教务档案 (${session.username})`);
          } catch(e) {
             if (loginEpoch !== accountEpochRef.current) return;
             cloudSnapshotReadyRef.current = false;
             setSyncStatus('error');
             const errMsg = (e as any)?.message || String(e);
             if (localData) {
               applyLocalData(localData);
               setCalendarEvents(prev => prev.filter(event => !event?.isAlert));
               setDataStatus(`云端加载失败，已从本地恢复 (${session.username})`);
             } else {
               setDataStatus(`云端加载失败，已保留空白档案 (${session.username})`);
             }
             alert('加载云端数据失败: ' + errMsg);
             setDataLoaded(true);
          }
        }}
      />
      </>
    );
  }

  if (cloudSession?.role === 'planner' && !plannerStudentContext) {
    return (
      <>
        <CursorTrail config={renderedEffectsConfig} />
        <PlannerDashboard
          session={cloudSession}
          fontScaleMode={fontScaleMode}
          onFontScaleChange={setFontScaleMode}
          onLogout={handleSafeExit}
          onViewStudent={(student) => handleViewPlannerStudent(cloudSession, student)}
        />
      </>
    );
  }

  if (impersonatedSession?.role === 'planner' && !plannerStudentContext) {
    return (
      <>
        <CursorTrail config={renderedEffectsConfig} />
        <PlannerDashboard
          session={impersonatedSession}
          fontScaleMode={fontScaleMode}
          onFontScaleChange={setFontScaleMode}
          exitLabel="返回管理后台"
          onLogout={() => handleExitAdminImpersonation(false)}
          onViewStudent={(student) => handleViewPlannerStudent(impersonatedSession, student)}
        />
      </>
    );
  }

  if ((cloudSession?.role === 'admin' || cloudSession?.role === 'sub_admin') && !impersonatedSession && !subAdminSelfMode) {
    return (
      <>
      <CursorTrail config={renderedEffectsConfig} />
      <AdminDashboard
        session={cloudSession}
        fontScaleMode={fontScaleMode}
        onFontScaleChange={setFontScaleMode}
        onLogout={handleSafeExit}
        onImpersonate={async (impSession) => {
          // Sub-admin accessing their OWN account: normal login (no lock/impersonation)
          if (cloudSession.role === 'sub_admin' && impSession.username === cloudSession.username) {
            // Suspend every persistence path while the fresh cloud snapshot
            // is being fetched.  A failed request must leave the user in the
            // dashboard, never in an empty editable teacher panel.
            setDataLoaded(false);
            setSyncStatus('syncing');
            if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
            const entryEpoch = accountEpochRef.current;
            const pendingOwnData = getCurrentDataPayload();
            try {
              // Use own user token via normal initLoad
              const ownSession = { ...cloudSession, role: 'user' as const };
              const cloudData = await initLoad(ownSession);
              if (entryEpoch !== accountEpochRef.current) return;
              const restorePendingLocalStudents = shouldRestoreLocalStudents({ students }, cloudData);
              resetAccountScopedData();
              if (window.electronAPI) {
                try {
                  const stored = await window.electronAPI.getStoredPath(ownSession.username);
                  if (stored) setDataFolderPath(stored);
                } catch (e) {}
              }
              if (cloudHasAnyData(cloudData) && !restorePendingLocalStudents) {
                applyCloudData(cloudData);
                setCalendarEvents(prev => prev.filter(event => !event?.isAlert));
              } else if (restorePendingLocalStudents) {
                applyLocalData(pendingOwnData);
                setCalendarEvents(prev => prev.filter(event => !event?.isAlert));
              }
              // If the server only has default seasons/settings, keep the
              // local snapshot loaded at login.  Once self mode is enabled,
              // the normal delta sync uploads those students instead of
              // silently replacing them with the server's empty list.
              lastSyncAtRef.current = cloudData.server_sync_time;
              setLastSyncAt(cloudData.server_sync_time);
              cloudSnapshotReadyRef.current = true;
              setSyncStatus('synced');
              setSubAdminSelfMode(true);
              (window as any).subAdminSelfMode = true;
              setDataLoaded(true);
            } catch (e: any) {
                if (entryEpoch !== accountEpochRef.current) return;
                cloudSnapshotReadyRef.current = false;
                setSyncStatus('error');
                setDataLoaded(true);
                alert('进入我的教务失败，已保留在管理后台，未对云端数据进行任何写入：' + (e?.message || String(e)));
            }
            return;
          }
          // All other cases: acquire the server lock *before* changing the
          // editor state.  A failed lock must not open an empty teacher panel.
          if (!cloudSession) return;
          setDataLoaded(false);
          setSyncStatus('syncing');
          if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
          try {
            await adminLockUser(cloudSession.token, impSession.username);
          } catch (e: any) {
            console.error('Failed to lock user on impersonation:', e);
            setDataLoaded(true);
            setSyncStatus('error');
            alert('无法进入该教务账号：' + (e?.message || String(e)));
            return;
          }
          // Clear both the screen and delta baselines only after the lock is
          // confirmed; the subsequent init-load establishes fresh baselines.
          lastSyncedStudentsRef.current = [];
          lastSyncedSeasonsRef.current = [];
          lastSyncedSettingsRef.current = '';
          lastSyncedCalendarRef.current = '';
          resetAccountScopedData();
          setImpersonatedSession(impSession);
        }}
        isEndfieldTheme={isEndfieldTheme}
      />
      </>
    );
  }

  return (
    <div 
      ref={appRootRef}
      className={`flex h-screen bg-[#F3EFE6] text-slate-800 font-sans transition-colors duration-500 ${isEndfieldTheme ? 'endfield-theme bg-[#111215] text-[#c8cbd0]' : ''} ${isCustomCursorActive ? 'custom-cursor-active' : ''} ${readOnlyViewer ? 'planner-readonly' : ''} ${isMobileBrowser ? 'browser-mobile' : 'browser-desktop'}`}

      style={isCustomCursorActive ? { cursor: 'none' } : undefined}
      onBeforeInputCapture={(event) => { if (readOnlyViewer) event.preventDefault(); }}
      onChangeCapture={(event) => {
        if (!readOnlyViewer) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onSubmitCapture={(event) => {
        if (!readOnlyViewer) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onDragStartCapture={(event) => { if (readOnlyViewer) event.preventDefault(); }}
      onClickCapture={(event) => {
        if (!readOnlyViewer) return;
        const target = event.target as HTMLElement;
        if (target.closest('[data-readonly-allow="true"]')) return;
        // Planner detail is a strict view surface.  Blocking every unapproved
        // click also covers custom div-based checkboxes and dropdown triggers,
        // which cannot be secured by setting native input.readOnly alone.
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <CursorTrail config={renderedEffectsConfig} />
      {isMobileBrowser && showMobileSystemMenu && (
        <div
          className="fixed inset-0 z-[120] flex items-end bg-slate-950/45 p-2"
          role="presentation"
          onClick={() => setShowMobileSystemMenu(false)}
        >
          <section
            className="w-full rounded-2xl border border-[#E5DEC9] bg-[#FAF8F5] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="系统与云端"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#E5DEC9] px-1 pb-2.5">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-800">系统与云端</h3>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {cloudSession?.username || impersonatedSession?.username || '未连接账号'} · {dataStatus}
                </p>
              </div>
              <button data-readonly-allow="true" onClick={() => setShowMobileSystemMenu(false)} className="shrink-0 rounded-full border border-[#E5DEC9] bg-white p-2 text-slate-500" aria-label="关闭系统菜单"><X className="h-4 w-4"/></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {!readOnlyViewer && !!getActiveTeacherSyncSession() && (
                <button
                  data-readonly-allow="true"
                  disabled={syncStatus === 'syncing'}
                  onClick={() => void handleCloudSaveOnly()}
                  className="flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#C68A4C] px-2 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                >
                  <CloudUpload className="h-4 w-4"/>{syncStatus === 'syncing' ? '正在保存…' : '保存到云端'}
                </button>
              )}
              {!!getActiveTeacherSyncSession() && (
                <button
                  data-readonly-allow="true"
                  disabled={syncStatus === 'syncing'}
                  onClick={() => void handleCloudRefresh()}
                  className="flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#C68A4C] bg-white px-2 py-2 text-[13px] font-bold text-[#A97138] disabled:opacity-50"
                >
                  <CloudDownload className="h-4 w-4"/>从云端刷新
                </button>
              )}
              <button data-readonly-allow="true" onClick={() => { setShowMobileSystemMenu(false); setShowSeasonModal(true); }} className="flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#E5DEC9] bg-white px-2 py-2 text-[13px] font-semibold text-slate-700"><Settings className="h-4 w-4"/>申请季与显示</button>
              <button data-readonly-allow="true" onClick={() => { setShowMobileSystemMenu(false); setShowCompletedModal(true); }} className="flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#E5DEC9] bg-white px-2 py-2 text-[13px] font-semibold text-slate-700"><CheckCircle2 className="h-4 w-4"/>已完成 ({activeCompletedItems.length})</button>
              {plannerStudentContext ? (
                <button data-readonly-allow="true" onClick={handleExitPlannerStudentView} className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700"><Users className="h-4 w-4"/>返回我的学生</button>
              ) : (!impersonatedSession || readOnlyViewer) && (
                <button data-readonly-allow="true" onClick={() => void handleSafeExit()} className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-600"><LogOut className="h-4 w-4"/>退出系统</button>
              )}
            </div>
            {readOnlyViewer && <p className="mt-2 text-center text-[11px] text-slate-500">规划老师为只读查看模式，不会显示保存操作。</p>}
            {impersonatedSession && !readOnlyViewer && <p className="mt-2 text-center text-[11px] text-slate-500">管理员请使用页面顶部的“退出模拟”返回管理后台。</p>}
          </section>
        </div>
      )}
      {/* 预警规则全局配置 */}
      {showSettingsModal && settingsForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={OVERLAY_STYLE}>
          <div className={`relative ${isEndfieldTheme ? 'animate-endfield-summon cyber-modal clip-corner-tl' : 'animate-pop-in bg-white elegant-modal'} w-[calc(100%-16px)] max-w-[560px] max-h-[90vh] overflow-y-auto relative`}>
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <div className="flex min-w-0 items-center gap-2"><h3 className={`min-w-0 text-lg flex items-center ${isEndfieldTheme ? 'font-mono text-[#FF6A00] font-bold tracking-widest' : 'font-bold font-serif text-slate-800'}`}>{isEndfieldTheme ? <Settings className="w-5 h-5 mr-3"/> : <Settings className="w-5 h-5 mr-2 text-blue-600"/>}{isEndfieldTheme ? '[ ALERT_RULES_CONF ]' : '预警规则全局配置'}</h3><HelpButton onClick={() => setShowAlertRulesHelp(true)} label="查看预警规则说明"/></div>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (settingsForm) {
                setAlertConfig(settingsForm);
              }
              setShowSettingsModal(false);
            }} className="p-6 space-y-6">
              <div className={`rounded-lg p-4 space-y-3 ${isEndfieldTheme ? 'bg-[#17181c] border-red-900/50' : 'bg-red-50 border-red-200'}`}>
                <h4 className={`text-sm font-bold ${isEndfieldTheme ? 'text-red-500 font-mono tracking-widest' : 'text-red-700'}`}>截止日预警</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-red-600 block mb-1">紧急预警：截止前 ___ 天</label><input type="number" name="deadlineCritical" value={settingsForm?.deadlineCritical ?? ''} onChange={e => setSettingsForm(p => ({ ...p, deadlineCritical: +e.target.value }))} min="1" className={`w-full p-2 rounded text-sm outline-none ${isEndfieldTheme ? 'bg-stone-900 border border-red-900/50 text-stone-300 focus:border-red-500' : 'border border-red-200'}`} /></div>
                  <div><label className="text-xs text-amber-600 block mb-1">注意预警：截止前 ___ 天</label><input type="number" name="deadlineWarning" value={settingsForm?.deadlineWarning ?? ''} onChange={e => setSettingsForm(p => ({ ...p, deadlineWarning: +e.target.value }))} min="1" className={`w-full p-2 rounded text-sm outline-none ${isEndfieldTheme ? 'bg-stone-900 border border-amber-900/50 text-stone-300 focus:border-amber-500' : 'border border-amber-200'}`} /></div>
                </div>
              </div>
              
              <div className="bg-[#FAF7F0] border border-[#E5DEC9] rounded-lg p-4 space-y-3 mt-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-[#A26D2B]">网推/推荐信预警</h4>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="alertRL" checked={!!settingsForm?.alertRL} onChange={e => setSettingsForm(p => ({ ...p, alertRL: e.target.checked }))} className="w-4 h-4"/> 启用</label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-red-600 block mb-1">紧急：专属截止前 ___ 天</label><input type="number" name="rlCritical" value={settingsForm?.rlCritical ?? ''} onChange={e => setSettingsForm(p => ({ ...p, rlCritical: +e.target.value }))} min="1" className={`w-full p-2 rounded text-sm outline-none ${isEndfieldTheme ? 'bg-stone-900 border border-red-900/50 text-stone-300 focus:border-red-500' : 'border border-red-200'}`} /></div>
                  <div><label className="text-xs text-amber-600 block mb-1">注意：专属截止前 ___ 天</label><input type="number" name="rlWarning" value={settingsForm?.rlWarning ?? ''} onChange={e => setSettingsForm(p => ({ ...p, rlWarning: +e.target.value }))} min="1" className={`w-full p-2 rounded text-sm outline-none ${isEndfieldTheme ? 'bg-stone-900 border border-amber-900/50 text-stone-300 focus:border-amber-500' : 'border border-amber-200'}`} /></div>
                </div>
              </div>

              <div className={`rounded-lg p-4 space-y-3 ${isEndfieldTheme ? 'bg-[#17181c] border-orange-900/50' : 'bg-orange-50 border-orange-200'}`}>
                <div className="flex justify-between items-center">
                  <h4 className={`text-sm font-bold ${isEndfieldTheme ? 'text-[#FF6A00] font-mono tracking-widest' : 'text-orange-700'}`}>申请开放前材料催收预警</h4>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="alertPreOpen" checked={!!settingsForm?.alertPreOpen} onChange={e => setSettingsForm(p => ({ ...p, alertPreOpen: e.target.checked }))} className="w-4 h-4"/> 启用</label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-red-600 block mb-1">紧急：开放前 ___ 天缺材料</label><input type="number" name="preOpenCritical" value={settingsForm?.preOpenCritical ?? ''} onChange={e => setSettingsForm(p => ({ ...p, preOpenCritical: +e.target.value }))} min="1" className={`w-full p-2 rounded text-sm outline-none ${isEndfieldTheme ? 'bg-stone-900 border border-red-900/50 text-stone-300 focus:border-red-500' : 'border border-red-200'}`} /></div>
                  <div><label className="text-xs text-amber-600 block mb-1">注意：开放前 ___ 天缺材料</label><input type="number" name="preOpenWarning" value={settingsForm?.preOpenWarning ?? ''} onChange={e => setSettingsForm(p => ({ ...p, preOpenWarning: +e.target.value }))} min="1" className={`w-full p-2 rounded text-sm outline-none ${isEndfieldTheme ? 'bg-stone-900 border border-amber-900/50 text-stone-300 focus:border-amber-500' : 'border border-red-200'}`} /></div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-amber-700">申请开放中 - 缺材料持续提醒</h4>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="alertOpenMissing" checked={!!settingsForm?.alertOpenMissing} onChange={e => setSettingsForm(p => ({ ...p, alertOpenMissing: e.target.checked }))} className="w-4 h-4"/> 启用</label>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-blue-200 pb-2">
                  <h4 className="text-sm font-bold text-blue-700">签证办理预警配置</h4>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="alertVisaBeforeOpen" checked={!!settingsForm?.alertVisaBeforeOpen} onChange={e => setSettingsForm(p => ({ ...p, alertVisaBeforeOpen: e.target.checked }))} className="w-4 h-4"/> 启用全流程</label>
                </div>
                <p className="text-xs text-blue-700 font-semibold mt-2">【阶段一】窗口开启前预警</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-red-600 block mb-1">紧急：窗口开启前 ___ 天</label><input type="number" name="visaOpenCritical" value={settingsForm?.visaOpenCritical ?? ''} onChange={e => setSettingsForm(p => ({ ...p, visaOpenCritical: +e.target.value }))} min="1" className={`w-full p-2 rounded text-sm outline-none ${isEndfieldTheme ? 'bg-stone-900 border border-red-900/50 text-stone-300 focus:border-red-500' : 'border border-red-200'}`} /></div>
                  <div><label className="text-xs text-amber-600 block mb-1">注意：窗口开启前 ___ 天</label><input type="number" name="visaOpenWarning" value={settingsForm?.visaOpenWarning ?? ''} onChange={e => setSettingsForm(p => ({ ...p, visaOpenWarning: +e.target.value }))} min="1" className={`w-full p-2 rounded text-sm outline-none ${isEndfieldTheme ? 'bg-stone-900 border border-amber-900/50 text-stone-300 focus:border-amber-500' : 'border border-amber-200'}`} /></div>
                </div>
                <p className="text-xs text-blue-700 font-semibold mt-4">【阶段二】窗口进行中（关闭前）预警</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-red-600 block mb-1">紧急：窗口关闭前 ___ 天</label><input type="number" name="visaCloseCritical" value={settingsForm?.visaCloseCritical ?? ''} onChange={e => setSettingsForm(p => ({ ...p, visaCloseCritical: +e.target.value }))} min="1" className={`w-full p-2 rounded text-sm outline-none ${isEndfieldTheme ? 'bg-stone-900 border border-red-900/50 text-stone-300 focus:border-red-500' : 'border border-red-200'}`} /></div>
                  <div><label className="text-xs text-amber-600 block mb-1">注意：窗口关闭前 ___ 天</label><input type="number" name="visaCloseWarning" value={settingsForm?.visaCloseWarning ?? ''} onChange={e => setSettingsForm(p => ({ ...p, visaCloseWarning: +e.target.value }))} min="1" className={`w-full p-2 rounded text-sm outline-none ${isEndfieldTheme ? 'bg-stone-900 border border-amber-900/50 text-stone-300 focus:border-amber-500' : 'border border-amber-200'}`} /></div>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-slate-700">备注 截止日预警</h4>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="alertNoteDDL" checked={!!settingsForm?.alertNoteDDL} onChange={e => setSettingsForm(p => ({ ...p, alertNoteDDL: e.target.checked }))} className="w-4 h-4"/> 启用</label>
                </div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-4">
                <h4 className="text-sm font-bold text-purple-800">特定学生个性化预警天数定制</h4>
                <div>
                  <label className="text-xs text-purple-700 block mb-1">选择定制学生</label>
                  <CustomSelect
                    value={overrideStudentId}
                    onChange={(e) => setOverrideStudentId(e.target.value)}
                    options={[
                      { value: '', label: '-- 选择学生以单独配置 --' },
                      ...students.filter(s => !isArchivedStudent(s) && !isTerminalStudent(s)).map(stu => ({
                        value: stu.id,
                        label: `${stu.name} (${stu.id})`
                      }))
                    ]}
                    className="w-full h-[38px] text-sm bg-white rounded"
                    isEndfieldTheme={isEndfieldTheme}
                  />
                </div>

                {overrideStudentId && (() => {
                  const sOverrides = systemWarningsTimeOverrides[overrideStudentId] || {};
                  const updateOverride = (key, value) => {
                    const parsedVal = value === '' ? null : Number(value);
                    setSystemWarningsTimeOverrides(prev => ({
                      ...prev,
                      [overrideStudentId]: {
                        ...prev[overrideStudentId],
                        [key]: parsedVal
                      }
                    }));
                  };
                  return (
                    <div className="space-y-3 pt-2 border-t border-purple-200">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">截止日紧急 (天)</label>
                          <input
                            type="number"
                            value={sOverrides.deadlineCritical ?? ''}
                            placeholder={`全局: ${settingsForm?.deadlineCritical}`}
                            onChange={(e) => updateOverride('deadlineCritical', e.target.value)}
                            className="w-full border p-1 rounded text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">截止日注意 (天)</label>
                          <input
                            type="number"
                            value={sOverrides.deadlineWarning ?? ''}
                            placeholder={`全局: ${settingsForm?.deadlineWarning}`}
                            onChange={(e) => updateOverride('deadlineWarning', e.target.value)}
                            className="w-full border p-1 rounded text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">网推紧急 (天)</label>
                          <input
                            type="number"
                            value={sOverrides.rlCritical ?? ''}
                            placeholder={`全局: ${settingsForm?.rlCritical}`}
                            onChange={(e) => updateOverride('rlCritical', e.target.value)}
                            className="w-full border p-1 rounded text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">网推注意 (天)</label>
                          <input
                            type="number"
                            value={sOverrides.rlWarning ?? ''}
                            placeholder={`全局: ${settingsForm?.rlWarning}`}
                            onChange={(e) => updateOverride('rlWarning', e.target.value)}
                            className="w-full border p-1 rounded text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">开放前材料紧急 (天)</label>
                          <input
                            type="number"
                            value={sOverrides.preOpenCritical ?? ''}
                            placeholder={`全局: ${settingsForm?.preOpenCritical}`}
                            onChange={(e) => updateOverride('preOpenCritical', e.target.value)}
                            className="w-full border p-1 rounded text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">开放前材料注意 (天)</label>
                          <input
                            type="number"
                            value={sOverrides.preOpenWarning ?? ''}
                            placeholder={`全局: ${settingsForm?.preOpenWarning}`}
                            onChange={(e) => updateOverride('preOpenWarning', e.target.value)}
                            className="w-full border p-1 rounded text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">签证开启前紧急 (天)</label>
                          <input
                            type="number"
                            value={sOverrides.visaOpenCritical ?? ''}
                            placeholder={`全局: ${settingsForm?.visaOpenCritical}`}
                            onChange={(e) => updateOverride('visaOpenCritical', e.target.value)}
                            className="w-full border p-1 rounded text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">签证开启前注意 (天)</label>
                          <input
                            type="number"
                            value={sOverrides.visaOpenWarning ?? ''}
                            placeholder={`全局: ${settingsForm?.visaOpenWarning}`}
                            onChange={(e) => updateOverride('visaOpenWarning', e.target.value)}
                            className="w-full border p-1 rounded text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">签证关闭前紧急 (天)</label>
                          <input
                            type="number"
                            value={sOverrides.visaCloseCritical ?? ''}
                            placeholder={`全局: ${settingsForm?.visaCloseCritical}`}
                            onChange={(e) => updateOverride('visaCloseCritical', e.target.value)}
                            className="w-full border p-1 rounded text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">签证关闭前注意 (天)</label>
                          <input
                            type="number"
                            value={sOverrides.visaCloseWarning ?? ''}
                            placeholder={`全局: ${settingsForm?.visaCloseWarning}`}
                            onChange={(e) => updateOverride('visaCloseWarning', e.target.value)}
                            className="w-full border p-1 rounded text-xs bg-white"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end items-center pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSystemWarningsTimeOverrides(prev => {
                              const next = { ...prev };
                              delete next[overrideStudentId];
                              return next;
                            });
                          }}
                          className={`text-[11px] text-red-500 hover:underline font-serif ${isEndfieldTheme ? 'hover:text-red-500 font-mono tracking-widest' : 'hover:text-red-700'}`}
                        >
                          清除该生自定义配置
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowSettingsModal(false)} className={`px-4 py-2 rounded-lg text-sm transition-colors ${isEndfieldTheme ? 'border border-stone-700 text-stone-400 hover:text-white hover:border-stone-500 font-mono' : 'border'}`}>取消</button>
                <button type="submit" className={`px-4 py-2 text-white rounded-lg text-sm shadow-md transition-colors ${isEndfieldTheme ? 'bg-red-900/60 hover:bg-red-800 border border-red-800 clip-corner-br font-mono' : 'bg-blue-600'}`}>保存所有预警配置</button>
              </div>
            </form>
            <HelpDialog open={showAlertRulesHelp} onClose={() => setShowAlertRulesHelp(false)} title="预警规则说明" label="预警规则说明"><ul className="space-y-2"><li>• 截止日预警即使材料已经齐全也会触发。</li><li>• “申请开放中－缺材料持续提醒”启用后，只要申请已开放且材料未备齐，就持续显示橙色警告；进入截止前紧急天数后升级为红色。</li><li>• 学生个性化预警留空时，自动继承全局规则的天数。</li></ul></HelpDialog>
          </div>
        </div>
      )}

      {showCompletedModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={OVERLAY_STYLE}>
          <div className={`${isEndfieldTheme ? 'bg-[#0a0a0c]   clip-corner-tl cyber-modal animate-endfield-summon' : 'animate-pop-in bg-[#FAF8F5] elegant-modal   '} w-[calc(100%-16px)] max-w-[700px] max-h-[90vh] flex flex-col relative`}>
            {isEndfieldTheme && <div className="absolute top-0 left-0 w-[40%] h-[2px] bg-[#FF6A00]/80"></div>}
            <div className={`flex justify-between items-center px-6 py-4 border-b ${isEndfieldTheme ? 'bg-[#17181c] border-[#FF6A00]/20' : 'bg-slate-50 rounded-t-xl border-[#E5DEC9]'}`}>
              <div className="flex min-w-0 items-center gap-2"><h3 className={`min-w-0 text-lg font-bold flex items-center ${isEndfieldTheme ? 'text-[#FF6A00] tracking-widest font-mono' : 'text-slate-800'}`}>
                {isEndfieldTheme ? <CheckCircle2 className="w-5 h-5 mr-3"/> : <CheckCircle2 className="w-5 h-5 mr-2 text-green-600"/>}
                {isEndfieldTheme ? '[ RESOLVED_TASKS_LOG ]' : '已完成任务'}
              </h3><HelpButton onClick={() => setShowCompletedTasksHelp(true)} label="查看已完成任务说明"/></div>
              <button onClick={() => setShowCompletedModal(false)} className={`transition-colors ${isEndfieldTheme ? 'text-[#FF6A00]/50 hover:text-[#FF6A00]' : 'text-slate-400 hover:text-slate-700'}`}><X className="w-5 h-5"/></button>
            </div>
            <div className={`p-4 flex-1 overflow-y-auto ${isEndfieldTheme ? 'bg-[#0a0a0c]' : 'bg-[#F3EFE6]/50'}`}>
              {activeCompletedItems.length === 0 ? (
                <p className={`text-center py-10 ${isEndfieldTheme ? 'text-stone-500 font-mono tracking-widest' : 'text-slate-400'}`}>暂无已完成任务</p>
              ) : (
                <div className="space-y-3">
                  {activeCompletedItems.map(item => (
                    <div key={item.alert.id} className={`p-4 flex items-start gap-4 transition-colors ${isEndfieldTheme ? 'bg-stone-900/50 border border-stone-800/80 hover:border-[#FF6A00]/30' : 'animate-pop-in bg-white rounded-lg shadow-sm border border-slate-200'}`}>
                      <div className={`p-2 flex-shrink-0 ${isEndfieldTheme ? 'text-stone-500' : 'bg-green-100 text-green-700 rounded-lg'}`}>
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <p className={`font-bold text-sm ${isEndfieldTheme ? 'text-stone-300 font-mono' : 'text-slate-800'}`}>
                            {item.alert.student && <span className={`mr-2 ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-blue-600'}`}>[{item.alert.student}]</span>}
                            {item.alert.title}
                          </p>
                          <span className={`text-xs whitespace-nowrap ml-4 ${isEndfieldTheme ? 'text-stone-500 font-mono' : 'text-slate-400'}`}>
                            完成于 {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className={`text-sm mt-1 ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-600'}`}>{item.alert.message}</p>
                      </div>
                      <button onClick={() => handleCompleteAlert(item.alert)} className={`px-3 py-1.5 text-xs transition-colors whitespace-nowrap border ${isEndfieldTheme ? 'text-stone-400 bg-stone-900 border-stone-700 hover:border-stone-500 hover:text-white clip-corner-br font-mono' : 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200 rounded'}`}>
                        <RotateCcw className="w-3 h-3 inline mr-1"/> 取消完成
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <HelpDialog open={showCompletedTasksHelp} onClose={() => setShowCompletedTasksHelp(false)} title="已完成任务说明" label="已完成任务说明"><p>这里显示活跃学生已经完成的任务。已结单或已结案学生的完成记录会归入该学生的个人档案时间线。</p></HelpDialog>
          </div>
        </div>
      )}

      {showDataModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={OVERLAY_STYLE}>
          <div className={`${isEndfieldTheme ? 'bg-[#0a0a0c] border border-[#FF6A00]/50 shadow-[0_0_30px_rgba(255,106,0,0.15)] clip-corner-tl animate-endfield-summon' : 'bg-[#FAF8F5] rounded-xl shadow-2xl  border border-[#E5DEC9] font-serif'} w-[calc(100%-16px)] max-w-[520px] relative`}>
            {isEndfieldTheme && <div className="absolute top-0 left-0 w-[40%] h-[2px] bg-[#FF6A00]/80"></div>}
            <div className={`flex justify-between items-center px-6 py-4 border-b ${isEndfieldTheme ? 'border-[#FF6A00]/20' : 'border-[#E5DEC9]'}`}>
              <h3 className={`text-lg font-bold flex items-center ${isEndfieldTheme ? 'text-[#FF6A00] font-mono tracking-widest' : 'text-[#C68A4C]'}`}>
                {isEndfieldTheme ? <Database className="w-5 h-5 mr-3"/> : <Database className="w-5 h-5 mr-2 text-[#C68A4C]"/>}
                {isEndfieldTheme ? 'SYS_DATA_MANAGEMENT' : '数据存储管理'}
              </h3>
              <button onClick={() => setShowDataModal(false)} className={`transition-colors ${isEndfieldTheme ? 'text-[#FF6A00]/50 hover:text-[#FF6A00]' : 'text-slate-400 hover:text-[#C68A4C]'}`}><X className="w-5 h-5"/></button>
            </div>
            <div className={`p-6 space-y-4 ${isEndfieldTheme ? 'bg-transparent' : 'bg-[#F3EFE6]/30'}`}>
                <div className={`rounded-lg border p-3 ${isEndfieldTheme ? 'bg-stone-900 border-stone-800' : 'bg-[#FAF8F5] border-[#E5DEC9]'}`}>
                  <p className={`text-xs ${isEndfieldTheme ? 'text-stone-500 font-mono tracking-widest' : 'text-slate-500'}`}>当前状态</p>
                  <p className={`text-sm font-bold ${isEndfieldTheme ? 'font-mono tracking-widest mt-1' : ''} ${(dataStatus.includes('成功') || dataStatus.includes('已自动保存')) ? (isEndfieldTheme ? 'text-cyan-500' : 'text-green-600') : dataStatus.includes('失败') ? 'text-red-500' : (isEndfieldTheme ? 'text-stone-300' : 'text-slate-700')}`}>{dataStatus}</p>
                </div>

                {((cloudSession?.role === 'admin' || cloudSession?.role === 'sub_admin') && !subAdminSelfMode) ? (
                   <>
                     <div className="grid grid-cols-2 gap-3 mt-4">
                       <button onClick={handleManualSaveAdmin} className={`flex items-center justify-center text-sm px-3 py-2 rounded-lg transition-colors ${isEndfieldTheme ? 'bg-cyan-900/60 text-cyan-400 hover:bg-cyan-900/80 border border-cyan-800 font-mono tracking-widest clip-corner-br' : 'bg-[#C68A4C] text-white hover:bg-[#A97138] shadow-sm font-serif'} w-full`}><Save className="w-4 h-4 mr-1.5"/> {isEndfieldTheme ? 'SAVE_CLOUD' : '立即保存到云端'}</button>
                       <button onClick={handleAdminBackup} className={`flex items-center justify-center text-sm px-3 py-2 rounded-lg transition-colors ${isEndfieldTheme ? 'bg-[#FF6A00]/20 text-[#FF6A00] hover:bg-[#FF6A00]/30 border border-[#FF6A00]/30 font-mono tracking-widest clip-corner-br' : 'bg-white border border-[#C68A4C] text-[#C68A4C] hover:bg-[#FAF8F5] shadow-sm font-serif'} w-full`}><Archive className="w-4 h-4 mr-1.5"/> {isEndfieldTheme ? 'BACKUP_SYS' : '另存为备份...'}</button>
                     </div>
                   </>
                ) : (
                   <>
                      <div className={`border rounded-lg p-4 ${isEndfieldTheme ? 'bg-[#17181c] border-[#FF6A00]/20' : 'bg-amber-50/50 border-amber-200/50'}`}>
                        <div className="mb-1 flex items-center gap-2"><p className={`text-xs font-semibold ${isEndfieldTheme ? 'text-[#FF6A00] font-mono tracking-widest' : 'text-[#C68A4C]'}`}>数据存储文件夹</p><HelpButton onClick={() => setShowDataPathHelp(true)} label="查看数据文件说明"/></div>
                        <p className={`text-sm font-mono break-all mb-3 ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-700'}`}>{dataFolderPath || '尚未配置（当前为演示模式，关闭后数据丢失）'}</p>
                        <button onClick={handleChooseDataFolder} className={`flex items-center text-sm px-3 py-1.5 transition-colors ${isEndfieldTheme ? 'bg-[#FF6A00]/10 text-[#FF6A00] hover:bg-[#FF6A00]/20 border border-[#FF6A00]/50 clip-corner-br font-mono tracking-widest' : 'bg-[#C68A4C] text-white rounded hover:bg-[#A97138]'}`}>
                          <FolderOpen className="w-4 h-4 mr-2"/> {dataFolderPath ? (isEndfieldTheme ? 'CHANGE_DIR' : '更改文件夹') : (isEndfieldTheme ? 'SELECT_DIR' : '选择存储文件夹')}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <button onClick={handleManualSaveTeacher} className={`flex items-center justify-center text-sm px-3 py-2 rounded-lg transition-colors ${isEndfieldTheme ? 'bg-cyan-900/60 text-cyan-400 hover:bg-cyan-900/80 border border-cyan-800 font-mono tracking-widest clip-corner-br' : 'bg-[#C68A4C] text-white hover:bg-[#A97138] shadow-sm font-serif'} w-full`}><Save className="w-4 h-4 mr-1.5"/> {isEndfieldTheme ? 'SAVE_LOCAL' : '立即双端保存'}</button>
                        <button onClick={handleBackup} className={`flex items-center justify-center text-sm px-3 py-2 rounded-lg transition-colors ${isEndfieldTheme ? 'bg-[#FF6A00]/20 text-[#FF6A00] hover:bg-[#FF6A00]/30 border border-[#FF6A00]/30 font-mono tracking-widest clip-corner-br' : 'bg-white border border-[#C68A4C] text-[#C68A4C] hover:bg-[#FAF8F5] shadow-sm font-serif'} w-full`}><Archive className="w-4 h-4 mr-1.5"/> {isEndfieldTheme ? 'BACKUP_SYS' : '另存为备份...'}</button>
                      </div>
                      <button onClick={async () => { 
                          if (!window.electronAPI) return alert("此功能仅在桌面版可用");
                          // 弹出文件选择对话框，让用户选择要上传的JSON文件
                          const filePath = await window.electronAPI.pickJsonFile?.();
                          if (!filePath) return; // 用户取消了选择
                          const existingData = await window.electronAPI.loadDataFromFile?.(filePath);
                          if (!existingData) return alert("所选文件不是有效的教务数据文件，请重新选择。");
                          const importCheck = validateImportData(existingData);
                          if (!importCheck.valid) return alert("所选文件缺少 students 或 seasons 数组，不是有效的教务数据备份。");
                          // This action calls migrate_force and therefore
                          // deletes the current cloud data first.  Refuse an
                          // empty file so a failed/empty backup cannot erase
                          // a healthy account.
                          if (importCheck.studentCount === 0) {
                            return alert("所选备份中没有学生记录。为保护当前云端数据，系统已拒绝用空文件覆盖。");
                          }
                          if (!confirm(`将用所选文件的数据（${importCheck.studentCount} 名学生，${importCheck.seasonCount} 个申请季）强制覆盖云端数据？\n此操作不可逆！`)) return;
                          setSyncStatus('syncing');
                          try {
                              const targetSession = impersonatedSession || cloudSession;
                              if (!targetSession) throw new Error("未登录，无法上传");
                              const migratePayload = {
                                  students: existingData.students || [],
                                  seasons: existingData.seasons || [],
                                  alertConfig: existingData.alertConfig,
                                  ignoredAlerts: existingData.ignoredAlerts || [],
                                  completedAlerts: existingData.completedAlerts,
                                  dismissedCalendarEvents: existingData.dismissedCalendarEvents || {},
                                  calendarCompletionBackups: existingData.calendarCompletionBackups || {},
                                  activeSeasonId: existingData.activeSeasonId,
                                  calendarEvents: existingData.calendarEvents || [],
                                  customPresets: existingData.customPresets || [],
                                  sourceRegions: existingData.sourceRegions || [],
                                  targetRegions: existingData.targetRegions || [],
                                  sourceStages: existingData.sourceStages || [],
                                  targetStages: existingData.targetStages || [],
                                  systemWarningsTimeOverrides: existingData.systemWarningsTimeOverrides || {},
                              };
                              const res = await migrateLocalDataForce(targetSession, migratePayload as any);
                              if (!res || res.migrated_students !== importCheck.studentCount) {
                                throw new Error(`云端仅写入 ${res?.migrated_students ?? 0}/${importCheck.studentCount} 名学生，已停止继续操作。`);
                              }
                              if (res && res.server_sync_time) {
                                  lastSyncAtRef.current = res.server_sync_time;
                                  setLastSyncAt(res.server_sync_time);
                              }
                              const mappedCloudData = {
                                  students: (existingData.students || []).map((s: any) => ({ student_id: s.id, data_json: JSON.stringify(s) })),
                                  seasons: (existingData.seasons || []).map((s: any) => ({ season_id: s.id, data_json: JSON.stringify(s), is_archived: s.isArchived })),
                                  settings: JSON.stringify({
                                      alertConfig: existingData.alertConfig,
                                      ignoredAlerts: existingData.ignoredAlerts,
                                      completedAlerts: existingData.completedAlerts,
                                      dismissedCalendarEvents: existingData.dismissedCalendarEvents || {},
                                      calendarCompletionBackups: existingData.calendarCompletionBackups || {},
                                      activeSeasonId: existingData.activeSeasonId,
                                      customPresets: existingData.customPresets,
                                      sourceRegions: existingData.sourceRegions,
                                      targetRegions: existingData.targetRegions,
                                      sourceStages: existingData.sourceStages,
                                      targetStages: existingData.targetStages,
                                      systemWarningsTimeOverrides: existingData.systemWarningsTimeOverrides,
                                  }),
                                  calendar: JSON.stringify(existingData.calendarEvents || []),
                              };
                              // 上传成功后立刻把数据渲染到 UI，不刷新页面
                              applyCloudData(mappedCloudData);
                              // Keep the verified import as this account's
                              // local recovery copy as well.  Cloud success
                              // alone must not make a later network failure
                              // look like data loss.
                              if (dataFolderPath && !impersonatedSession) {
                                const localSaved = await saveDataHelper(dataFolderPath, existingData);
                                if (!localSaved) throw new Error('云端已覆盖，但本地恢复副本保存失败');
                              }
                              setSyncStatus('synced');
                              setDataStatus('云端覆盖成功！');
                              alert("上传并覆盖成功！云端数据已更新。");
                          } catch (e: any) {
                              alert("覆盖失败: " + e.message);
                              setSyncStatus('error');
                          }
                      }} className={`mt-2 flex items-center justify-center text-sm px-3 py-2 transition-colors rounded-lg w-full ${isEndfieldTheme ? 'bg-[#FF6A00]/10 text-[#FF6A00] hover:bg-[#FF6A00]/20 border border-[#FF6A00]/50 font-mono tracking-widest clip-corner-br' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}>
                        <Archive className="w-4 h-4 mr-2"/> {isEndfieldTheme ? 'UPLOAD_LOCAL_DATA' : '上传本地JSON文件覆盖云端'}
                      </button>
                   </>
                )}
              </div>
            </div>
            <HelpDialog open={showDataPathHelp} onClose={() => setShowDataPathHelp(false)} title="数据文件说明" label="数据文件说明"><p>桌面端数据文件固定保存为“所选文件夹/教务数据.json”。更改文件夹后，软件会使用新位置读写该文件。</p></HelpDialog>
          </div>
        )}

      {showEffectsModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]" style={OVERLAY_STYLE}>
          <div className={`${isEndfieldTheme ? 'animate-endfield-summon bg-[#0a0a0c] text-stone-200 border-[#FF6A00]/45 tech-bracket-container font-mono clip-corner-tl cyber-modal ' : 'animate-pop-in bg-[#FAF8F5] text-slate-800 border-[#E5DEC9] font-serif elegant-modal'} border w-[500px] max-h-[90vh] flex flex-col relative  `}>
            {isEndfieldTheme && <div className="absolute top-0 left-0 w-[40%] h-[2px] bg-[#FF6A00]/80"></div>}
            <div className={`flex justify-between items-center px-6 py-4 border-b ${isEndfieldTheme ? 'border-[#FF6A00]/25 bg-[#17181c]' : 'border-[#E5DEC9] bg-[#FAF8F5]'}`}>
              <div>
                <h3 className={`text-sm font-bold flex items-center tracking-widest uppercase ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-slate-800'}`}>
                  {isEndfieldTheme ? '[ CONFIG // VISUAL_DYNAMICS_SYSTEM ]' : '视觉动态系统配置'}
                </h3>
                <p className={`text-[9px] mt-0.5 ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-400'}`}>STATUS: OPERATIONAL // ENGINE: PARALLAX_CANVAS_V3</p>
              </div>
              <button onClick={() => setShowEffectsModal(false)} className={`transition-colors ${isEndfieldTheme ? 'text-stone-400 hover:text-[#FF6A00]' : 'text-slate-400 hover:text-slate-700'}`}><X className="w-5 h-5"/></button>
            </div>
            <div className={`p-6 space-y-5 overflow-y-auto flex-1 ${isEndfieldTheme ? 'bg-[#0a0a0c]' : 'bg-[#F3EFE6]'}`}>
              <div className={`rounded-xl border p-3 ${isEndfieldTheme ? 'border-stone-800 bg-[#17181c]' : 'border-[#E5DEC9] bg-[#FAF8F5]'}`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-xs font-bold uppercase ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-[#A97138]'}`}>&gt; 字体大小</p>
                    <p className="mt-1 text-[10px] opacity-55">显示偏好仅保存在当前设备</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {([['auto', '自动'], ['small', '小'], ['standard', '标准'], ['large', '大']] as Array<[FontScaleMode, string]>).map(([mode, label]) => (
                    <button key={mode} type="button" aria-pressed={fontScaleMode === mode} onClick={() => setFontScaleMode(mode)} className={`rounded-lg border px-2 py-2 text-xs font-bold transition-colors ${fontScaleMode === mode ? (isEndfieldTheme ? 'border-[#FF6A00] bg-[#FF6A00]/10 text-[#FF6A00]' : 'border-[#C68A4C] bg-amber-50 text-[#A97138]') : (isEndfieldTheme ? 'border-stone-800 text-stone-400' : 'border-[#E5DEC9] bg-white text-slate-500')}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className={`flex justify-between items-center p-3 rounded-lg border ${isEndfieldTheme ? 'bg-[#17181c] border-stone-800' : 'bg-[#FAF8F5] border-[#E5DEC9]'}`}>
                <span className={`font-semibold text-xs tracking-wider uppercase ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-[#C68A4C]'}`}>&gt; 启用粒子背景特效</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={effectsConfig.enabled} onChange={(e) => setEffectsConfig(prev => ({ ...prev, enabled: e.target.checked }))} className="sr-only peer" />
                  <div className={`w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-stone-500 after:border-stone-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${isEndfieldTheme ? 'bg-stone-800 peer-checked:bg-[#FF6A00] peer-checked:after:bg-stone-950' : 'bg-slate-200 peer-checked:bg-[#C68A4C] peer-checked:after:bg-white after:border-slate-300 after:bg-white'}`}></div>
                </label>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-xs font-bold uppercase ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-500'}`}>{isEndfieldTheme ? '> 视觉特效模式' : '视觉特效模式'}</label>
                <CustomSelect
                  value={effectsConfig.type}
                  onChange={(e) => {
                    const val = e.target.value;
                    let newTheme = 'gold';
                    if (val === 'nebula') newTheme = 'blue';
                    if (val === 'matrix') newTheme = 'green';
                    if (val === 'vortex') newTheme = 'purple';
                    if (val === 'endfield') newTheme = 'orange';
                    setEffectsConfig(prev => ({ ...prev, type: val, theme: newTheme }));
                  }}
                  options={[
                    { value: 'constellation', label: '🌌 星空网络 (Constellation Grid)' },
                    { value: 'nebula', label: '☁️ 浮光星云 (Floating Nebula)' },
                    { value: 'matrix', label: '💻 未来矩阵 (Cyber Matrix)' },
                    { value: 'vortex', label: '🌀 重力漩涡 (Gravity Vortex)' },
                    { value: 'endfield', label: '📐 终末网格 (Endfield Warp Grid)' }
                  ]}
                  className="w-full h-[38px] text-xs"
                  isEndfieldTheme={isEndfieldTheme}
                />
              </div>

              <div className="space-y-1.5">
                <div className={`flex justify-between text-xs font-bold uppercase ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-500'}`}>
                  <span>粒子密度 (数量)</span>
                  <span className="text-[#C68A4C]">{effectsConfig.count}</span>
                </div>
                <input type="range" min="10" max="150" value={effectsConfig.count} onChange={(e) => setEffectsConfig(prev => ({ ...prev, count: +e.target.value }))} className={`w-full h-1 rounded-lg ${isEndfieldTheme ? 'accent-[#FF6A00] bg-stone-800' : 'accent-[#C68A4C] bg-[#E5DEC9]'}`} />
              </div>

              <div className="space-y-1.5">
                <div className={`flex justify-between text-xs font-bold uppercase ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-500'}`}>
                  <span>大小比例</span>
                  <span className="text-[#C68A4C]">{effectsConfig.sizeScale}x</span>
                </div>
                <input type="range" min="0.5" max="3.0" step="0.1" value={effectsConfig.sizeScale} onChange={(e) => setEffectsConfig(prev => ({ ...prev, sizeScale: +e.target.value }))} className={`w-full h-1 rounded-lg ${isEndfieldTheme ? 'accent-[#FF6A00] bg-stone-800' : 'accent-[#C68A4C] bg-[#E5DEC9]'}`} />
              </div>

              <div className="space-y-1.5">
                <div className={`flex justify-between text-xs font-bold uppercase ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-500'}`}>
                  <span>运动速度</span>
                  <span className="text-[#C68A4C]">{effectsConfig.speedScale}x</span>
                </div>
                <input type="range" min="0.1" max="3.0" step="0.1" value={effectsConfig.speedScale} onChange={(e) => setEffectsConfig(prev => ({ ...prev, speedScale: +e.target.value }))} className={`w-full h-1 rounded-lg ${isEndfieldTheme ? 'accent-[#FF6A00] bg-stone-800' : 'accent-[#C68A4C] bg-[#E5DEC9]'}`} />
              </div>

              <div className="space-y-1.5">
                <div className={`flex justify-between text-xs font-bold uppercase ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-500'}`}>
                  <span>鼠标互动强度</span>
                  <span className="text-[#C68A4C]">{effectsConfig.attraction}x</span>
                </div>
                <input type="range" min="0.0" max="2.5" step="0.1" value={effectsConfig.attraction} onChange={(e) => setEffectsConfig(prev => ({ ...prev, attraction: +e.target.value }))} className={`w-full h-1 rounded-lg ${isEndfieldTheme ? 'accent-[#FF6A00] bg-stone-800' : 'accent-[#C68A4C] bg-[#E5DEC9]'}`} />
              </div>

              {effectsConfig.type === 'constellation' && (
                <>
                  <div className={`flex justify-between items-center ${isEndfieldTheme ? 'bg-[#17181c] border-stone-800' : 'bg-[#FAF8F5] border-[#E5DEC9]'} p-3 rounded-lg border mt-2`}>
                    <span className="text-xs font-semibold text-[#C68A4C] uppercase">&gt; 启用节点连线</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={effectsConfig.linesEnabled} onChange={(e) => setEffectsConfig(prev => ({ ...prev, linesEnabled: e.target.checked }))} className="sr-only peer" />
                      <div className={`w-11 h-6 ${isEndfieldTheme ? 'bg-stone-800' : 'bg-slate-200'} peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-stone-500 after:border-stone-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#C68A4C] peer-checked:after:bg-stone-950`}></div>
                    </label>
                  </div>
                  {effectsConfig.linesEnabled && (
                    <div className="space-y-1.5">
                      <div className={`flex justify-between text-xs font-bold ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-500'} uppercase`}>
                        <span>连线敏感距离</span>
                        <span className="text-[#C68A4C]">{effectsConfig.lineDist}px</span>
                      </div>
                      <input type="range" min="50" max="250" value={effectsConfig.lineDist} onChange={(e) => setEffectsConfig(prev => ({ ...prev, lineDist: +e.target.value }))} className={`w-full h-1 rounded-lg ${isEndfieldTheme ? 'accent-[#FF6A00] bg-stone-800' : 'accent-[#C68A4C] bg-[#E5DEC9]'}`} />
                    </div>
                  )}
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={`block text-xs font-bold ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-500'} uppercase`}>&gt; 鼠标指针样式</label>
                  <select value={effectsConfig.cursorStyle} onChange={(e) => setEffectsConfig(prev => ({ ...prev, cursorStyle: e.target.value }))} className={`w-full p-2 rounded text-xs focus:outline-none ${isEndfieldTheme ? 'border border-stone-800 bg-[#17181c] text-stone-200 focus:border-[#FF6A00]' : 'border border-[#E5DEC9] bg-[#FAF8F5] text-slate-800 focus:border-[#C68A4C]'}`}>
                    <option value="default">默认系统光标</option>
                    <option value="reticle">旋转战术瞄准圈</option>
                    <option value="crosshair">数字准星坐标</option>
                    <option value="arrow">方舟科技光标</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={`block text-xs font-bold ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-500'} uppercase`}>&gt; 点击反馈特效</label>
                  <select value={effectsConfig.clickEffect || 'ripple'} onChange={(e) => setEffectsConfig(prev => ({ ...prev, clickEffect: e.target.value }))} className={`w-full p-2 rounded text-xs focus:outline-none ${isEndfieldTheme ? 'border border-stone-800 bg-[#17181c] text-stone-200 focus:border-[#FF6A00]' : 'border border-[#E5DEC9] bg-[#FAF8F5] text-slate-800 focus:border-[#C68A4C]'}`}>
                    <option value="ripple">全息涟漪 (Ripple)</option>
                    <option value="crosshair">战术准星 (Crosshair)</option>
                    <option value="scan">雷达声波 (Scan)</option>
                    <option value="none">关闭特效</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 items-center">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-500'} uppercase">&gt; 粒子形状</label>
                  <select value={effectsConfig.particleShape} onChange={(e) => setEffectsConfig(prev => ({ ...prev, particleShape: e.target.value }))} className={`w-full p-2 rounded text-xs focus:outline-none ${isEndfieldTheme ? 'border border-stone-800 bg-[#17181c] text-stone-200 focus:border-[#FF6A00]' : 'border border-[#E5DEC9] bg-[#FAF8F5] text-slate-800 focus:border-[#C68A4C]'}`}>
                    <option value="circle">圆形粒子</option>
                    <option value="square">正方像素</option>
                    <option value="triangle">三角脉冲</option>
                  </select>
                </div>
                <div className={`flex justify-between items-center p-2.5 rounded-lg border h-[38px] mt-[18px] ${isEndfieldTheme ? 'bg-stone-950 border-stone-800' : 'bg-[#FAF8F5] border-[#E5DEC9]'}`}>
                  <span className={`text-xs font-bold ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-500'} uppercase`}>&gt; 启用外发光</span>
                  <input type="checkbox" checked={effectsConfig.glowEnabled} onChange={(e) => setEffectsConfig(prev => ({ ...prev, glowEnabled: e.target.checked }))} className={`w-4 h-4 rounded text-[#C68A4C] ${isEndfieldTheme ? 'border-stone-800 accent-[#FF6A00] bg-stone-950' : 'border-slate-300 accent-[#C68A4C] bg-white'}`} />
                </div>
                <div className="space-y-1">
                  <div className={`flex justify-between text-xs font-bold ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-500'} uppercase`}>
                    <span>背景扫频速度</span>
                    <span className="text-[#C68A4C]">{effectsConfig.scanlineSpeed}x</span>
                  </div>
                  <input type="range" min="0" max="3" step="0.5" value={effectsConfig.scanlineSpeed} onChange={(e) => setEffectsConfig(prev => ({ ...prev, scanlineSpeed: +e.target.value }))} className={`w-full h-1 rounded-lg ${isEndfieldTheme ? 'accent-[#FF6A00] bg-stone-800' : 'accent-[#C68A4C] bg-[#E5DEC9]'}`} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-600'} uppercase`}>&gt; 色彩主题</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'gold', name: '温暖金', color: 'bg-[#C68A4C]' },
                    { key: 'blue', name: '深海蓝', color: 'bg-sky-500' },
                    { key: 'green', name: '翡翠绿', color: 'bg-emerald-500' },
                    { key: 'purple', name: '霓虹粉', color: 'bg-pink-500' },
                    { key: 'orange', name: '战术橙', color: 'bg-[#FF6A00]' },
                    { key: 'cyan', name: '数字青', color: 'bg-[#00F2FE]' },
                  ].map(t => (
                    <button key={t.key} onClick={() => setEffectsConfig(prev => ({ ...prev, theme: t.key }))} className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border text-xs font-bold transition-all ${effectsConfig.theme === t.key ? (isEndfieldTheme ? 'border-[#FF6A00] bg-stone-950 shadow-[0_0_10px_rgba(255,106,0,0.3)]' : 'border-[#C68A4C] bg-[#FAF8F5] shadow-sm') : (isEndfieldTheme ? 'border-stone-800 bg-[#17181c] hover:bg-stone-800' : 'border-[#E5DEC9] bg-white hover:bg-slate-50')}`}>
                      <span className={`w-3.5 h-3.5 rounded-full ${t.color}`} />
                      <span className={effectsConfig.theme === t.key ? (isEndfieldTheme ? 'text-[#FF6A00]' : 'text-[#C68A4C]') : (isEndfieldTheme ? 'text-stone-500' : 'text-slate-500')}>{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className={`p-4 flex justify-end ${isEndfieldTheme ? 'border-t border-stone-800 bg-[#17181c]' : 'border-t border-[#E5DEC9] bg-[#FAF8F5]'}`}>
              <button onClick={() => setShowEffectsModal(false)} className={`px-5 py-2 rounded-lg text-xs font-bold shadow-md transition-colors uppercase tracking-wider ${isEndfieldTheme ? 'bg-[#FF6A00] hover:bg-[#CC5500] text-white clip-corner-br font-mono' : 'bg-[#C68A4C] hover:bg-[#A97138] text-white font-serif'}`}>
                {isEndfieldTheme ? 'CONFIRM & SAVE' : '确认保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSeasonModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={OVERLAY_STYLE}>
          <div className={`${isEndfieldTheme ? 'animate-endfield-summon bg-[#0a0a0c]   clip-corner-tl cyber-modal relative' : 'animate-pop-in bg-[#FAF8F5] elegant-modal  '} w-[500px] max-h-[90vh] overflow-y-auto`}>
            {isEndfieldTheme && <div className="absolute top-0 left-0 w-[40%] h-[2px] bg-[#FF6A00]/80"></div>}
            <div className={`flex justify-between items-center px-6 py-4 border-b ${isEndfieldTheme ? 'border-[#FF6A00]/20' : 'border-[#E5DEC9]'}`}>
              <h3 className={`text-lg flex items-center ${isEndfieldTheme ? 'font-mono text-white font-bold tracking-widest' : 'font-bold font-serif'}`}>
                {isEndfieldTheme ? <span className="text-[#FF6A00] mr-3">// SYS_SEASON_CONFIG</span> : <CalendarDays className="w-5 h-5 mr-2 text-[#C68A4C]"/>}
                {isRecycleBinMode ? (isEndfieldTheme ? '[ ARCHIVED_SEASONS ]' : '已归档申请季 (回收站)') : (isEndfieldTheme ? '申请季轴线管理' : '申请季轴线管理')}
              </h3>
              <button onClick={() => setShowSeasonModal(false)} className={isEndfieldTheme ? 'text-[#FF6A00]/50 hover:text-[#FF6A00]' : 'text-slate-400 hover:text-slate-700'}><X className="w-5 h-5"/></button>
            </div>
            <div className={`p-6 space-y-3 ${isEndfieldTheme ? 'font-mono' : 'font-serif'}`}>
              {isMobileBrowser && (
                <div className={`rounded-lg border p-2.5 ${isEndfieldTheme ? 'border-stone-800 bg-[#17181c]' : 'border-[#E5DEC9] bg-white'}`}>
                  <div className="mb-2 text-xs font-bold text-slate-500">显示字体</div>
                  <div className="mobile-font-scale-grid grid grid-cols-4 gap-1.5" role="group" aria-label="显示字体大小">
                    {([['auto', '自动'], ['small', '小'], ['standard', '标准'], ['large', '大']] as Array<[FontScaleMode, string]>).map(([mode, label]) => (
                      <button key={mode} type="button" aria-pressed={fontScaleMode === mode} onClick={() => setFontScaleMode(mode)} className={`rounded-md border px-1 py-2 text-xs font-bold ${fontScaleMode === mode ? (isEndfieldTheme ? 'border-[#FF6A00] bg-[#FF6A00]/10 text-[#FF6A00]' : 'border-[#C68A4C] bg-amber-50 text-[#A97138]') : (isEndfieldTheme ? 'border-stone-800 text-stone-400' : 'border-[#E5DEC9] text-slate-500')}`}>{label}</button>
                    ))}
                  </div>
                </div>
              )}
              {seasons.filter(s => isRecycleBinMode ? s.isArchived : !s.isArchived).map(s => (
                <div key={s.id} className={`flex ${isMobileBrowser ? 'flex-col gap-2 items-stretch' : 'space-x-2 items-center'} p-2 ${isEndfieldTheme ? 'border border-stone-800 bg-[#17181c] relative' : 'rounded border border-[#E5DEC9] bg-[#FAF8F5]'}`}>
                  {isEndfieldTheme && <div className="absolute left-0 top-0 w-1 h-full bg-[#FF6A00]/30"></div>}
                  <input type="text" value={s.name} onChange={(e) => setSeasons(seasons.map(ss => ss.id === s.id ? { ...ss, name: e.target.value } : ss))} className={`${isMobileBrowser ? 'w-full min-w-0' : 'flex-1'} p-1.5 text-sm bg-transparent ${isEndfieldTheme ? 'border-b border-[#FF6A00]/30 text-white font-mono focus:border-[#FF6A00] outline-none' : 'border border-stone-200/50 rounded font-serif'}`}/>
                  <input type="date" value={s.start} onChange={(e) => setSeasons(seasons.map(ss => ss.id === s.id ? { ...ss, start: e.target.value } : ss))} className={`${isMobileBrowser ? 'w-full min-w-0' : 'w-32'} p-1.5 text-sm bg-transparent ${isEndfieldTheme ? 'border-b border-[#FF6A00]/30 text-[#FF6A00] font-mono focus:border-[#FF6A00] outline-none custom-date-input' : 'border border-stone-200/50 rounded font-serif'}`}/>
                  {!isMobileBrowser && <span className={isEndfieldTheme ? "text-stone-600" : "text-slate-400"}>-</span>}
                  <input type="date" value={s.end} onChange={(e) => setSeasons(seasons.map(ss => ss.id === s.id ? { ...ss, end: e.target.value } : ss))} className={`${isMobileBrowser ? 'w-full min-w-0' : 'w-32'} p-1.5 text-sm bg-transparent ${isEndfieldTheme ? 'border-b border-[#FF6A00]/30 text-[#FF6A00] font-mono focus:border-[#FF6A00] outline-none custom-date-input' : 'border border-stone-200/50 rounded font-serif'}`}/>
                  {isRecycleBinMode ? (
                    <>
                      <button onClick={() => handleRestoreSeason(s.id)} className={`p-1 ${isEndfieldTheme ? 'text-[#FF6A00] hover:text-white' : 'text-[#C68A4C] hover:text-[#A97138]'}`} title={isEndfieldTheme ? 'RESTORE_DATA' : '恢复申请季'}><RotateCcw className="w-4 h-4"/></button>
                      <button onClick={() => { setDeletingSeasonId(s.id); setDeleteConfirmText(''); }} className="text-slate-400 hover:text-red-500 p-1" title={isEndfieldTheme ? 'PURGE_DATA' : '永久删除'}><Trash2 className="w-4 h-4"/></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleToggleArchiveSeason(s)} className={`p-1 ${isEndfieldTheme ? 'text-stone-500 hover:text-[#FF6A00]' : 'text-slate-500 hover:text-[#C68A4C]'}`} title={isEndfieldTheme ? 'ARCHIVE_DATA' : '归档申请季'}><Archive className="w-4 h-4"/></button>
                    </>
                  )}
                </div>
              ))}
              {!isRecycleBinMode && (
                <button onClick={() => {
                  const newSeason = { id: 's' + Date.now(), name: '新申请季', start: '2027-09-01', end: '2028-09-30' };
                  setSeasons([...seasons, newSeason]);
                  setActiveSeasonId(newSeason.id);
                  setIsRecycleBinMode(false);
                }} className={`text-sm flex items-center ${isEndfieldTheme ? 'text-[#FF6A00] hover:text-white mt-2 p-2 border border-[#FF6A00]/20 clip-corner-br hover:bg-[#FF6A00]/10 transition-colors' : 'text-[#C68A4C] hover:text-[#A97138]'}`}><Plus className="w-4 h-4 mr-1"/> {isEndfieldTheme ? 'ADD_NEW_SEASON' : '新增申请季'}</button>
              )}
              <div className={`flex ${isMobileBrowser ? 'flex-col items-stretch gap-3' : 'justify-between items-center'} mt-4 pt-4 border-t ${isEndfieldTheme ? 'border-[#FF6A00]/20' : 'border-[#E5DEC9]'}`}>
                {isRecycleBinMode ? (
                  <button onClick={exitRecycleBinMode} className={`text-xs font-bold underline ${isEndfieldTheme ? 'text-cyan-500 hover:text-cyan-400 font-mono tracking-widest' : 'text-[#C68A4C] hover:text-[#A97138]'}`}>{isEndfieldTheme ? 'RETURN_TO_ACTIVE' : '返回进行中申请季'}</button>
                ) : (
                  <button onClick={enterRecycleBinMode} className={`text-xs font-bold underline ${isEndfieldTheme ? 'text-stone-500 hover:text-stone-400 font-mono tracking-widest' : 'text-[#C68A4C] hover:text-[#A97138]'}`}>{isEndfieldTheme ? 'ENTER_RECYCLE_BIN' : '进入已归档申请季 (回收站)'}</button>
                )}
                <button onClick={() => setShowSeasonModal(false)} className={isEndfieldTheme ? "px-6 py-2 bg-[#FF6A00] hover:bg-orange-500 text-black font-bold font-mono tracking-widest clip-corner-br shadow-[0_0_15px_rgba(255,106,0,0.5)] transition-all" : "px-4 py-2 bg-[#C68A4C] hover:bg-[#A97138] text-white rounded-lg text-sm shadow-md font-serif"}>{isEndfieldTheme ? 'COMMIT' : '完成'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deletingSeasonId && (() => {
        const seasonToDelete = seasons.find(s => s.id === deletingSeasonId);
        if (!seasonToDelete) return null;
        const studentCount = students.filter(stu => stu.seasonId === deletingSeasonId).length;
        return (
          <div className="fixed inset-0 flex items-center justify-center z-[100]" style={OVERLAY_STYLE}>
            <div className={`${isEndfieldTheme ? 'animate-endfield-summon bg-[#0a0a0c] border border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.15)] clip-corner-tl' : 'animate-pop-in bg-white rounded-xl shadow-2xl  border border-red-200'} w-[450px] p-6 space-y-4 relative`}>
              <div className="flex items-center gap-3 text-red-600 border-b pb-3">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="text-lg font-bold">确认永久删除申请季</h3>
              </div>
              <div className="space-y-3 text-sm text-slate-600 leading-relaxed font-serif">
                <p className="font-bold text-red-700">
                  警告：此操作将永久删除申请季【{seasonToDelete.name}】，并级联删除该申请季下的所有学生档案（共 <span className="underline font-sans">{studentCount}</span> 个学生）。
                </p>
                <p>此操作不可撤销，请谨慎操作！</p>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    请输入“确认删除”以继续：
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="请输入：确认删除"
                    className="w-full border border-red-200 p-2 rounded focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-sm font-sans"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t pt-3">
                <button
                  onClick={() => setDeletingSeasonId(null)}
                  className="px-4 py-2 border rounded text-xs text-slate-600 hover:bg-slate-50 font-serif"
                >
                  取消
                </button>
                <button
                  disabled={deleteConfirmText !== '确认删除'}
                  onClick={async () => {
                    const id = deletingSeasonId;
                    setDeletingSeasonId(null);
                    await handlePermanentDeleteSeason(id);
                  }}
                  className={`px-4 py-2 rounded text-xs text-white font-serif shadow-sm transition-colors ${
                    deleteConfirmText === '确认删除'
                      ? 'bg-red-600 hover:bg-red-700 cursor-pointer'
                      : 'bg-red-300 cursor-not-allowed'
                  }`}
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showPresetManagerModal && (() => {
        const presetList = (customPresets && customPresets.length > 0) ? customPresets : [
          { id: 'china_hk', name: '中国大陆 → 香港', docs: generateDefaultDocs('本升硕', '香港') },
          { id: 'china_macau', name: '中国大陆 → 澳门', docs: generateDefaultDocs('本升硕', '澳门') },
          { id: 'china_overseas', name: '中国大陆 → 英国/欧美海外', docs: generateDefaultDocs('本升硕', '英国') },
          { id: 'china_mainland', name: '中国大陆 → 内地', docs: generateDefaultDocs('本升硕', '') },
          { id: 'overseas_any', name: '港澳/海外 → 任意地区', docs: generateDefaultDocs('本升硕', '海外') },
        ];
        const getPresetDocs = (pid) => { const p = presetList.find(x => x.id === pid); return p ? p.docs : {}; };

        return (
          <div className="fixed inset-0 flex items-center justify-center z-50" style={OVERLAY_STYLE}>
            <div className={`${isEndfieldTheme ? 'animate-endfield-summon bg-[#0a0a0c]   clip-corner-tl cyber-modal' : 'animate-pop-in bg-[#FAF8F5] elegant-modal  '} ${isMobileBrowser ? 'w-[calc(100%-16px)] max-h-[96vh]' : 'w-[800px] max-h-[88vh]'} flex flex-col relative`}>
              <div className={`flex justify-between ${isMobileBrowser ? 'items-start px-4 py-3 gap-3' : 'items-center px-6 py-4'} border-b border-[#E5DEC9]`}>
                <div>
                  <div className="flex items-center gap-2"><h3 className="text-lg font-bold font-serif text-slate-800">材料预设管理</h3><HelpButton onClick={() => setShowMobilePresetHelp(true)} label="查看材料预设操作说明"/></div>
                </div>
                <div className={`flex items-center gap-2 ${isMobileBrowser ? 'shrink-0' : ''}`}>
                  <button
                    onClick={() => { setEditingOptionType('sourceRegion'); setShowOptionManager(true); }}
                    className={`text-xs px-2.5 py-1.5 rounded-lg ${isMobileBrowser ? 'hidden' : 'flex'} items-center gap-1 font-serif ${isEndfieldTheme ? 'text-stone-400 hover:text-[#FF6A00] border border-[#FF6A00]/30 hover:bg-[#FF6A00]/10' : 'text-slate-500 hover:text-[#C68A4C] border border-[#E5DEC9]'}`}
                  >
                    <Settings className="w-3 h-3"/> 编辑地区选项
                  </button>
                  <button onClick={() => { setShowPresetManagerModal(false); setEditingPreset(null); setAddingScene(false); }} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button>
                </div>
              </div>
              <HelpDialog open={showMobilePresetHelp} onClose={() => setShowMobilePresetHelp(false)} title="材料预设操作" label="材料预设操作说明"><ul className="space-y-2"><li>• 选择情景后查看和编辑材料。</li><li>• 长按材料 0.5 秒后拖动，可排序或移动分类。</li><li>• “智能合并”只补充学生资料库中缺少的材料。</li></ul></HelpDialog>
              <div className={`flex flex-1 min-h-0 overflow-hidden ${isMobileBrowser ? 'flex-col' : ''}`}>
                <div className={`${isMobileBrowser ? 'w-full max-h-[34vh] border-b p-3' : 'w-56 border-r p-4'} space-y-1 overflow-y-auto shrink-0 flex flex-col ${isEndfieldTheme ? 'border-[#FF6A00]/20' : 'border-[#E5DEC9]'}`}>
                  <p className={`text-xs font-semibold mb-2 ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-500'}`}>情景列表</p>
                  <div className="flex-1 space-y-1 overflow-y-auto">
                    {presetList.map(preset => (
                      <div key={preset.id} className={`flex items-center gap-1 rounded-lg transition-colors ${editingPreset === preset.id ? (isEndfieldTheme ? 'bg-[#FF6A00]/20 border border-[#FF6A00]/50 shadow-[inset_0_0_10px_rgba(255,106,0,0.1)]' : 'bg-[#C68A4C]') : (isEndfieldTheme ? 'border border-transparent hover:border-[#FF6A00]/30 hover:bg-white/5' : 'hover:bg-[#F3EFE6] border border-[#E5DEC9]')}`}>
                        <button
                          onClick={() => setEditingPreset(editingPreset === preset.id ? null : preset.id)}
                          className={`flex-1 text-left px-3 py-2 text-sm font-serif ${editingPreset === preset.id ? (isEndfieldTheme ? 'text-[#FF6A00] font-bold' : 'text-white') : (isEndfieldTheme ? 'text-stone-400' : 'text-slate-700')}`}
                        >{preset.name}</button>
                        {deletingPresetConfirmId === preset.id ? (
                          <button
                            data-confirm-zone="true"
                            onClick={() => {
                              if (editingPreset === preset.id) setEditingPreset(null);
                              setCustomPresets(presetList.filter(p => p.id !== preset.id));
                              setDeletingPresetConfirmId(null);
                            }}
                            className={`px-1.5 py-0.5 mr-1 text-[10px] font-semibold rounded shrink-0 ${editingPreset === preset.id ? 'text-white bg-red-600' : 'text-red-600 bg-red-50 border border-red-500'}`}
                            title="确认删除"
                          >
                            确认删除？
                          </button>
                        ) : (
                          <button
                            data-confirm-zone="true"
                            onClick={() => setDeletingPresetConfirmId(preset.id)}
                            className={`p-1 mr-1 rounded ${isMobileBrowser ? 'opacity-100' : 'opacity-0 hover:opacity-100'} transition-opacity shrink-0 ${editingPreset === preset.id ? 'text-white/70 hover:text-white' : 'text-red-400 hover:text-red-600'}`}
                            title="删除此情景"
                          ><Trash2 className="w-3 h-3"/></button>
                        )}
                      </div>
                    ))}
                  </div>
                  {addingScene ? (
                    <div className={`mt-2 space-y-2 p-2 rounded-lg border ${isEndfieldTheme ? 'bg-black/50 border-[#FF6A00]/30' : 'bg-[#F3EFE6] border-[#E5DEC9]'}`}>
                      <p className={`text-[11px] font-bold font-serif ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-slate-600'}`}>新增情景</p>
                      <div>
                        <label className={`text-[10px] block mb-0.5 ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-500'}`}>就读地区</label>
                        <select value={newSceneSource} onChange={e => setNewSceneSource(e.target.value)}
                          className={`w-full border rounded p-1 text-xs font-serif ${isEndfieldTheme ? 'bg-stone-900 border-[#FF6A00]/30 text-white' : 'border-[#E5DEC9] bg-white text-black'}`}>
                          <option value="">请选择</option>
                          {sourceRegions.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={`text-[10px] block mb-0.5 ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-500'}`}>目标地区</label>
                        <select value={newSceneTarget} onChange={e => setNewSceneTarget(e.target.value)}
                          className={`w-full border rounded p-1 text-xs font-serif ${isEndfieldTheme ? 'bg-stone-900 border-[#FF6A00]/30 text-white' : 'border-[#E5DEC9] bg-white text-black'}`}>
                          <option value="">请选择</option>
                          {targetRegions.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </div>
                      <input
                        type="text"
                        value={newSceneName}
                        onChange={e => setNewSceneName(e.target.value)}
                        placeholder="情景名称(可修改)"
                        className={`w-full border rounded p-1 text-xs font-serif ${isEndfieldTheme ? 'bg-stone-900 border-[#FF6A00]/30 text-white placeholder-stone-500' : 'border-[#E5DEC9] bg-white text-black placeholder-slate-400'}`}
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            const finalName = newSceneName || `${newSceneSource || '?'} → ${newSceneTarget || '?'}`;
                            if (!finalName.trim()) return;
                            const newId = 'custom_' + Date.now();
                            setCustomPresets([...presetList, { id: newId, name: finalName, docs: generateDefaultDocs('generic', newSceneTarget || '任意地区') }]);
                            setEditingPreset(newId);
                            setAddingScene(false); setNewSceneName(''); setNewSceneSource(''); setNewSceneTarget('');
                          }}
                          className={`flex-1 text-xs text-white rounded p-1 font-serif ${isEndfieldTheme ? 'bg-[#FF6A00] text-black font-bold hover:bg-orange-500' : 'bg-[#C68A4C]'}`}
                        >创建</button>
                        <button onClick={() => { setAddingScene(false); setNewSceneName(''); setNewSceneSource(''); setNewSceneTarget(''); }}
                          className={`text-xs border rounded p-1 font-serif ${isEndfieldTheme ? 'border-[#FF6A00]/30 text-stone-400 hover:text-white' : 'border-[#E5DEC9] text-slate-500'}`}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingScene(true)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs mt-2 flex items-center gap-1 font-serif border border-dashed ${isEndfieldTheme ? 'text-[#FF6A00] hover:bg-[#FF6A00]/10 border-[#FF6A00]/50' : 'text-[#C68A4C] hover:bg-[#F3EFE6] border-[#C68A4C]'}`}
                    >
                      <Plus className="w-3 h-3"/> 新增情景
                    </button>
                  )}
                </div>

                <div className={`flex-1 ${isMobileBrowser ? 'p-3' : 'p-5'} overflow-y-auto min-h-0`}>
                  {!editingPreset ? (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm font-serif">← 选择左侧情景查看材料清单</div>
                  ) : (() => {
                    const docs = getPresetDocs(editingPreset);
                    const updateDoc = (cat, docId, newLabel) => {
                      setCustomPresets(presetList.map(p => p.id !== editingPreset ? p : { ...p, docs: { ...p.docs, [cat]: (p.docs[cat] || []).map(d => d.id === docId ? { ...d, label: newLabel } : d) } }));
                    };
                    const deleteDoc = (cat, docId) => {
                      setCustomPresets(presetList.map(p => p.id !== editingPreset ? p : { ...p, docs: { ...p.docs, [cat]: (p.docs[cat] || []).filter(d => d.id !== docId) } }));
                    };
                    const addDocInline = (cat, label) => {
                      if (!label.trim()) return;
                      setCustomPresets(presetList.map(p => p.id !== editingPreset ? p : { ...p, docs: { ...p.docs, [cat]: [...(p.docs[cat] || []), { id: 'doc_' + Date.now(), label: label.trim(), checked: false }] } }));
                    };
                    const catLabels = { info: '📋 信息收集表类', basic: '🪪 个人基础材料', academic: '🎓 学术公证类', writing: '✍️ 教务文书类' };
                    return (
                      <div className="space-y-5">
                        {['info', 'basic', 'academic', 'writing'].map(cat => (
                          <div
                            key={cat}
                            data-mobile-preset-category={cat}
                            className={`rounded-lg border border-transparent p-2 transition-colors ${dragOverBlockKey === `preset-${cat}` ? 'border-[#C68A4C] bg-[#C68A4C]/5' : ''}`}
                            onDragOver={(event) => { event.preventDefault(); setDragOverBlockKey(`preset-${cat}`); }}
                            onDragLeave={() => setDragOverBlockKey(null)}
                            onDrop={(event) => {
                              event.preventDefault();
                              setDragOverBlockKey(null);
                              const sourceDocId = event.dataTransfer.getData('presetDocId');
                              const fromCategory = event.dataTransfer.getData('presetFromCategory');
                              if (sourceDocId && fromCategory) handleReorderPresetDoc(editingPreset, fromCategory, cat, sourceDocId);
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-bold text-slate-700 font-serif">{catLabels[cat]}</h4>
                            </div>
                            <div className="space-y-1">
                              {(docs[cat] || []).map(doc => (
                                <MobileLongPressDraggable
                                  key={doc.id}
                                  label={doc.label}
                                  dropSelector="[data-mobile-preset-doc], [data-mobile-preset-category]"
                                  onDropTarget={target => {
                                    const targetCategory = target.getAttribute('data-mobile-preset-category');
                                    const targetDocId = target.getAttribute('data-mobile-preset-doc');
                                    if (targetCategory) handleReorderPresetDoc(editingPreset, cat, targetCategory, doc.id, targetDocId || undefined);
                                  }}
                                >
                                <div
                                  draggable={false}
                                  data-mobile-preset-category={cat}
                                  data-mobile-preset-doc={doc.id}
                                  onDragStart={(event) => {
                                    event.dataTransfer.setData('presetDocId', doc.id);
                                    event.dataTransfer.setData('presetFromCategory', cat);
                                    event.dataTransfer.effectAllowed = 'move';
                                    handleDragStartWithGhost(event, doc.label, 'custom');
                                  }}
                                  onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDragOverDocId(`preset-${doc.id}`); }}
                                  onDragLeave={() => setDragOverDocId(null)}
                                  onDrop={(event) => {
                                    event.preventDefault(); event.stopPropagation(); setDragOverDocId(null);
                                    const sourceDocId = event.dataTransfer.getData('presetDocId');
                                    const fromCategory = event.dataTransfer.getData('presetFromCategory');
                                    if (sourceDocId && fromCategory) handleReorderPresetDoc(editingPreset, fromCategory, cat, sourceDocId, doc.id);
                                  }}
                                  className={`flex items-center gap-2 group rounded border px-1 transition-colors ${isMobileBrowser ? 'min-h-11 bg-white' : ''} ${dragOverDocId === `preset-${doc.id}` ? 'border-[#C68A4C] bg-[#C68A4C]/10' : 'border-transparent'}`}
                                  title="拖动可调整顺序或移动到其他分类"
                                >
                                  <span className="text-slate-300 cursor-grab select-none text-xs" aria-hidden="true">⋮⋮</span>
                                  <span contentEditable suppressContentEditableWarning
                                    onBlur={(e) => { const v = e.currentTarget.textContent && e.currentTarget.textContent.trim(); if (v && v !== doc.label) updateDoc(cat, doc.id, v); }}
                                    className="flex-1 text-xs text-slate-600 font-serif px-2 py-1 rounded border border-transparent hover:border-[#E5DEC9] focus:border-[#C68A4C] outline-none cursor-text"
                                  >{doc.label}</span>
                                  <button onClick={() => { if (window.confirm(`确定从材料预设中删除“${doc.label}”吗？`)) deleteDoc(cat, doc.id); }} className={`${isMobileBrowser ? 'opacity-100 p-2' : 'opacity-0 group-hover:opacity-100 p-0.5'} text-red-400 hover:text-red-600 rounded transition-opacity`}><Trash2 className="w-3 h-3"/></button>
                                </div>
                                </MobileLongPressDraggable>
                              ))}
                              {(docs[cat] || []).length === 0 && <p className="text-xs text-slate-300 font-serif italic">暂无材料</p>}
                              {addingDocInPreset?.cat === cat ? (
                                <div className="flex items-center gap-1 mt-1">
                                  <input
                                    autoFocus
                                    type="text"
                                    value={newDocInPreset}
                                    onChange={e => setNewDocInPreset(e.target.value)}
                                    placeholder="材料名称..."
                                    className="flex-1 text-xs border border-[#C68A4C] rounded px-2 py-1 font-serif outline-none"
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') { addDocInline(cat, newDocInPreset); setAddingDocInPreset(null); setNewDocInPreset(''); }
                                      if (e.key === 'Escape') { setAddingDocInPreset(null); setNewDocInPreset(''); }
                                    }}
                                  />
                                  <button onClick={() => { addDocInline(cat, newDocInPreset); setAddingDocInPreset(null); setNewDocInPreset(''); }} className="text-white bg-green-500 rounded p-1"><Check className="w-3 h-3"/></button>
                                  <button onClick={() => { setAddingDocInPreset(null); setNewDocInPreset(''); }} className="text-slate-400 border border-slate-200 rounded p-1"><X className="w-3 h-3"/></button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setAddingDocInPreset({ cat }); setNewDocInPreset(''); }}
                                  className="text-xs text-[#C68A4C] hover:text-[#A97138] flex items-center gap-1 font-serif mt-1 ml-1"
                                ><Plus className="w-3 h-3"/>添加材料</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className={`${isMobileBrowser ? 'px-3 py-3 flex-col items-stretch gap-2' : 'px-6 py-3 justify-between items-center'} border-t border-[#E5DEC9] flex`}>
                {selectedStudentForDocsId && editingPreset && (
                  <div className={`flex flex-wrap items-center gap-2 ${isMobileBrowser ? '[&>button]:w-full' : ''}`}>
                    <button
                      onClick={() => { if (handleApplyPreset('smart', editingPreset)) setShowPresetManagerModal(false); }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-serif shadow-md flex items-center gap-1.5"
                      title="保留现有材料和勾选状态，仅追加资料库中不存在的材料"
                    >
                      <Check className="w-4 h-4"/> 智能合并到当前学生
                    </button>
                    <button
                      onClick={() => { if (handleApplyPreset('safe', editingPreset)) setShowPresetManagerModal(false); }}
                      className="px-4 py-2 border border-blue-500 text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-serif flex items-center gap-1.5"
                      title="把现有材料移至未分类，再用预设重建分类"
                    >
                      <RotateCcw className="w-4 h-4"/> 安全覆盖应用
                    </button>
                  </div>
                )}
                {!selectedStudentForDocsId && <div/>}
                <button onClick={() => { setShowPresetManagerModal(false); setEditingPreset(null); setAddingScene(false); }} className="px-5 py-2 bg-[#C68A4C] hover:bg-[#A97138] text-white rounded-lg text-sm font-serif shadow-md">保存并关闭</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showOptionManager && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]" style={OVERLAY_STYLE}>
          <div className={`${isEndfieldTheme ? 'animate-endfield-summon bg-[#0a0a0c] border border-[#FF6A00]/50 shadow-[0_0_30px_rgba(255,106,0,0.15)] clip-corner-tl' : 'bg-[#FAF8F5] rounded-xl shadow-2xl border border-[#E5DEC9]'} w-[450px] p-6 space-y-4 font-serif relative`}>
            <h3 className="text-lg font-bold text-slate-800 border-b border-[#E5DEC9] pb-2">地区与阶段选项配置</h3>
            
            {/* 四大选项卡 */}
            <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-lg border ${isEndfieldTheme ? 'bg-black/50 border-[#FF6A00]/30 p-1.5' : 'bg-[#F3EFE6] border-[#E5DEC9]'}`}>
              <button type="button" onClick={() => { setEditingOptionType('sourceRegion'); setNewRegionInput(''); }}
                className={`py-1.5 text-[11px] font-bold rounded transition-colors ${editingOptionType === 'sourceRegion' ? (isEndfieldTheme ? 'bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/50' : 'bg-[#C68A4C] text-white') : (isEndfieldTheme ? 'text-stone-400 hover:bg-white/5 border border-transparent' : 'text-slate-600 hover:bg-[#FAF8F5]')}`}>就读地区</button>
              <button type="button" onClick={() => { setEditingOptionType('sourceStage'); setNewRegionInput(''); }}
                className={`py-1.5 text-[11px] font-bold rounded transition-colors ${editingOptionType === 'sourceStage' ? (isEndfieldTheme ? 'bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/50' : 'bg-[#C68A4C] text-white') : (isEndfieldTheme ? 'text-stone-400 hover:bg-white/5 border border-transparent' : 'text-slate-600 hover:bg-[#FAF8F5]')}`}>就读阶段</button>
              <button type="button" onClick={() => { setEditingOptionType('targetRegion'); setNewRegionInput(''); }}
                className={`py-1.5 text-[11px] font-bold rounded transition-colors ${editingOptionType === 'targetRegion' ? (isEndfieldTheme ? 'bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/50' : 'bg-[#C68A4C] text-white') : (isEndfieldTheme ? 'text-stone-400 hover:bg-white/5 border border-transparent' : 'text-slate-600 hover:bg-[#FAF8F5]')}`}>目标地区</button>
              <button type="button" onClick={() => { setEditingOptionType('targetStage'); setNewRegionInput(''); }}
                className={`py-1.5 text-[11px] font-bold rounded transition-colors ${editingOptionType === 'targetStage' ? (isEndfieldTheme ? 'bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/50' : 'bg-[#C68A4C] text-white') : (isEndfieldTheme ? 'text-stone-400 hover:bg-white/5 border border-transparent' : 'text-slate-600 hover:bg-[#FAF8F5]')}`}>目标阶段</button>
            </div>

            {/* 选项卡内容列表 */}
            <div className={`flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border rounded min-h-[4rem] items-start ${isEndfieldTheme ? 'bg-stone-900 border-[#FF6A00]/30' : 'border-[#E5DEC9]/50 bg-[#FAF8F5]'}`}>
              {(() => {
                let currentList = [];
                let setter = null;
                if (editingOptionType === 'sourceRegion') { currentList = sourceRegions; setter = setSourceRegions; }
                else if (editingOptionType === 'targetRegion') { currentList = targetRegions; setter = setTargetRegions; }
                else if (editingOptionType === 'sourceStage') { currentList = sourceStages; setter = setSourceStages; }
                else if (editingOptionType === 'targetStage') { currentList = targetStages; setter = setTargetStages; }

                if (currentList.length === 0) return <span className="text-xs text-slate-400 p-2">暂无选项，请在下方添加</span>;

                return currentList.map(r => (
                  <div key={r} className={`px-2 py-1 rounded text-xs flex items-center gap-1.5 border shadow-sm font-sans ${isEndfieldTheme ? 'bg-[#0a0a0c] border-[#FF6A00]/40 text-stone-300' : 'bg-[#FAF8F5] border-[#E5DEC9] text-slate-700'}`}>
                    {editingOptionItem === r ? (
                      <input
                        type="text"
                        value={editingOptionValue}
                        onChange={e => setEditingOptionValue(e.target.value)}
                        onBlur={() => {
                          if (editingOptionValue.trim() && editingOptionValue.trim() !== r) {
                            setter(currentList.map(x => x === r ? editingOptionValue.trim() : x));
                          }
                          setEditingOptionItem(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (editingOptionValue.trim() && editingOptionValue.trim() !== r) {
                              setter(currentList.map(x => x === r ? editingOptionValue.trim() : x));
                            }
                            setEditingOptionItem(null);
                          }
                          if (e.key === 'Escape') {
                            setEditingOptionItem(null);
                          }
                        }}
                        className="border border-[#C68A4C] rounded px-1 py-0.5 text-xs bg-white outline-none w-20 font-serif"
                        autoFocus
                      />
                    ) : (
                      <>
                        <span className="font-serif font-medium">{r}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingOptionItem(r);
                            setEditingOptionValue(r);
                          }}
                          className="text-slate-400 hover:text-blue-500 text-[10px]"
                          title="重命名"
                        >编辑</button>
                      </>
                    )}
                    {deletingOptionConfirm === r ? (
                      <button
                        type="button"
                        data-confirm-zone="true"
                        onClick={() => {
                          setter(currentList.filter(x => x !== r));
                          setDeletingOptionConfirm(null);
                        }}
                        className="text-red-600 hover:text-red-800 text-[10px] font-bold"
                        title="确认删除"
                      >确认删除？</button>
                    ) : (
                      <button
                        type="button"
                        data-confirm-zone="true"
                        onClick={() => {
                          setDeletingOptionConfirm(r);
                        }}
                        className="text-slate-400 hover:text-red-500"
                        title="删除"
                      ><X className="w-2.5 h-2.5"/></button>
                    )}
                  </div>
                ));
              })()}
            </div>

            {/* 添加新选项 */}
            <div className="flex gap-2">
              <input
                value={newRegionInput}
                onChange={e => setNewRegionInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (!newRegionInput.trim()) return;
                    let currentList = [];
                    let setter = null;
                    if (editingOptionType === 'sourceRegion') { currentList = sourceRegions; setter = setSourceRegions; }
                    else if (editingOptionType === 'targetRegion') { currentList = targetRegions; setter = setTargetRegions; }
                    else if (editingOptionType === 'sourceStage') { currentList = sourceStages; setter = setSourceStages; }
                    else if (editingOptionType === 'targetStage') { currentList = targetStages; setter = setTargetStages; }
                    if (currentList.includes(newRegionInput.trim())) return alert('该选项已存在');
                    setter([...currentList, newRegionInput.trim()]);
                    setNewRegionInput('');
                  }
                }}
                className={`flex-1 border rounded p-2 text-xs font-serif outline-none ${isEndfieldTheme ? 'bg-stone-900 border-[#FF6A00]/30 text-white focus:border-[#FF6A00]' : 'animate-pop-in bg-white border-[#E5DEC9]'}`}
                placeholder={`添加新${{sourceRegion:'就读地区',sourceStage:'就读阶段',targetRegion:'目标地区',targetStage:'目标阶段'}[editingOptionType]}...`}
              />
              <button
                type="button"
                onClick={() => {
                  if (!newRegionInput.trim()) return;
                  let currentList = [];
                  let setter = null;
                  if (editingOptionType === 'sourceRegion') { currentList = sourceRegions; setter = setSourceRegions; }
                  else if (editingOptionType === 'targetRegion') { currentList = targetRegions; setter = setTargetRegions; }
                  else if (editingOptionType === 'sourceStage') { currentList = sourceStages; setter = setSourceStages; }
                  else if (editingOptionType === 'targetStage') { currentList = targetStages; setter = setTargetStages; }
                  if (currentList.includes(newRegionInput.trim())) return alert('该选项已存在');
                  setter([...currentList, newRegionInput.trim()]);
                  setNewRegionInput('');
                }}
                className={`px-3.5 py-2 rounded text-sm shadow flex items-center justify-center ${isEndfieldTheme ? 'bg-[#FF6A00] text-black font-bold hover:bg-orange-500' : 'bg-[#C68A4C] text-white hover:bg-[#A97138]'}`}
              ><Plus className="w-4 h-4"/></button>
            </div>
            <button type="button" onClick={() => setShowOptionManager(false)} className={`w-full mt-1 py-2 rounded-lg text-xs font-serif shadow-sm ${isEndfieldTheme ? 'bg-transparent border border-[#FF6A00]/30 text-stone-400 hover:text-white hover:bg-white/5' : 'bg-[#FAF8F5] border border-[#E5DEC9] text-slate-600 hover:bg-[#F3EFE6]'}`}>关闭</button>
          </div>
        </div>
      )}

      {addingRecommender && (
        <div className="fixed inset-0 flex items-center justify-center z-[70]" style={OVERLAY_STYLE}>
          <div className={`${isEndfieldTheme ? 'animate-endfield-summon bg-[#0a0a0c] border border-[#FF6A00]/50 shadow-[0_0_30px_rgba(255,106,0,0.15)] clip-corner-tl' : 'animate-pop-in bg-white rounded-xl shadow-2xl  border border-slate-200'} ${isMobileBrowser ? 'w-[calc(100%-20px)]' : 'w-96'} relative`}>
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h3 className="font-bold">添加推荐人</h3>
              <button onClick={() => setAddingRecommender(false)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleAddRecommender} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">推荐人姓名</label>
                <input required type="text" name="recName" placeholder="如：张三 教授" className="w-full border p-2 rounded"/>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">邮箱 (选填)</label>
                <input type="text" name="recEmail" placeholder="如：zhangsan@edu.cn" className="w-full border p-2 rounded"/>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">备注 <span className="text-slate-400 font-normal text-xs">(选填，如：兼职导师、联系方式等)</span></label>
                <textarea name="recNotes" rows={2} placeholder="可记录：联系偏好、提醒方式、合作记录等..." className="w-full border p-2 rounded text-sm resize-none"/>
              </div>
              <div className="flex justify-end pt-2">
                <button type="submit" className="px-4 py-2 bg-[#C68A4C] hover:bg-[#A97138] text-white rounded">添加</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showStudentModal && studentForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={OVERLAY_STYLE}>
          <div className={`${isEndfieldTheme ? 'animate-endfield-summon bg-[#0a0a0c]   clip-corner-tl cyber-modal relative' : 'animate-pop-in bg-white elegant-modal  '} ${isMobileBrowser ? 'w-[calc(100%-20px)] max-h-[94vh]' : 'max-w-2xl w-full max-h-[90vh]'} overflow-y-auto`}>
            {isEndfieldTheme && <div className="absolute top-0 left-0 w-[40%] h-[2px] bg-[#FF6A00]/80"></div>}
            <div className={`flex justify-between items-center ${isMobileBrowser ? 'px-4 py-3 gap-3' : 'px-6 py-4'} border-b ${isEndfieldTheme ? 'bg-[#17181c] border-[#FF6A00]/20' : 'animate-pop-in bg-white border-slate-200'}`}>
              <h3 className={`${isMobileBrowser ? 'text-base leading-snug' : 'text-lg'} font-bold flex items-center min-w-0 ${isEndfieldTheme ? 'font-mono text-white tracking-widest' : ''}`}>
                {isEndfieldTheme && <span className="text-[#FF6A00] mr-3">// SYS_STUDENT_PROFILE</span>}
                {editingStudent?.id ? (isEndfieldTheme ? 'EDIT_PROFILE' : '修改学生基础档案') : (isEndfieldTheme ? 'CREATE_PROFILE' : '录入新生档案')}
              </h3>
              <button onClick={() => setShowStudentModal(false)} className={isEndfieldTheme ? 'text-[#FF6A00]/50 hover:text-[#FF6A00]' : 'text-slate-400 hover:text-slate-700'}><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleSaveStudent} className={`${isMobileBrowser ? 'p-4 space-y-5 mobile-student-form' : 'p-6 space-y-6'} ${isEndfieldTheme ? 'font-mono' : ''}`}>
              <div>
                <h4 className={`font-bold border-b pb-1.5 mb-3 ${isEndfieldTheme ? 'text-[#FF6A00] border-[#FF6A00]/20 tracking-widest' : 'text-slate-800 font-serif border-slate-200'}`}>{isEndfieldTheme ? '// BASIC_INFO' : '基本信息'}</h4>
                <div className={`grid ${isMobileBrowser ? 'grid-cols-1 gap-3' : 'grid-cols-2 gap-4'}`}>
                  <div>
                    <label className={`block text-xs mb-1 ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-600'}`}>{isEndfieldTheme ? 'NAME' : '姓名'}</label>
                    <input name="name" value={studentForm?.name || ''} onChange={e => setStudentForm(p => ({ ...p, name: e.target.value }))} required className={`w-full p-2 text-sm outline-none transition-colors ${isEndfieldTheme ? 'bg-transparent border border-[#FF6A00]/30 text-white focus:border-[#FF6A00]' : 'border rounded border-slate-300'}`}/>
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold mb-1 ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-blue-800'}`}>{isEndfieldTheme ? 'SEASON_ID' : '所属申请季'}</label>
                    <CustomSelect 
                      name="seasonId"
                      options={seasons.filter(s => !s.isArchived || s.id === studentForm?.seasonId).map(s => ({ value: s.id, label: s.name + (s.isArchived ? ' (已归档)' : '') }))}
                      value={studentForm?.seasonId || ''}
                      onChange={e => setStudentForm(p => ({ ...p, seasonId: e.target.value }))}
                      className="w-full h-[38px]"
                      isEndfieldTheme={isEndfieldTheme}
                    />
                  </div>
                  <div className={isMobileBrowser ? 'col-span-1' : 'col-span-2'}>
                    <label htmlFor="stu-planner-username" className={`block text-xs mb-1 ${isEndfieldTheme ? 'text-cyan-500' : 'text-slate-600'}`}>{isEndfieldTheme ? 'PLANNING_TEACHER' : '负责规划老师（选填）'}</label>
                    <select
                      id="stu-planner-username"
                      name="plannerUsername"
                      value={studentForm?.plannerUsername || ''}
                      onChange={e => setStudentForm(p => ({ ...p, plannerUsername: e.target.value }))}
                      className={`h-[38px] w-full p-2 text-sm outline-none ${isEndfieldTheme ? 'border border-[#FF6A00]/30 bg-transparent text-white focus:border-[#FF6A00]' : 'rounded border border-slate-300 bg-white'}`}
                    >
                      <option value="">暂不分配规划老师</option>
                      {studentForm?.plannerUsername && !plannerAccounts.some(planner => planner.username === studentForm.plannerUsername) && (
                        <option value={studentForm.plannerUsername}>{studentForm.plannerUsername}（当前分配，账号状态待刷新）</option>
                      )}
                      {plannerAccounts.map(planner => <option key={planner.username} value={planner.username}>{planner.username}</option>)}
                    </select>
                    <p className={`mt-1 text-[11px] ${plannerAccountsError ? 'text-red-500' : 'text-slate-400'}`}>{plannerAccountsError || '可以不选择；保存后会与该规划老师的学生后台双向同步。'}</p>
                  </div>
                  <div>
                    <label className={`block text-xs mb-1 ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-600'}`}>{isEndfieldTheme ? 'NATIONALITY' : '国籍'}</label>
                    <input name="nationality" value={studentForm?.nationality || ''} onChange={e => setStudentForm(p => ({ ...p, nationality: e.target.value }))} className={`w-full p-2 text-sm outline-none transition-colors ${isEndfieldTheme ? 'bg-transparent border border-[#FF6A00]/30 text-white focus:border-[#FF6A00]' : 'border rounded border-slate-300'}`}/>
                  </div>
                  <div>
                    <label className={`block text-xs mb-1 ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-600'}`}>{isEndfieldTheme ? 'REGION' : '地区'}</label>
                    <input name="region" value={studentForm?.region || ''} onChange={e => setStudentForm(p => ({ ...p, region: e.target.value }))} className={`w-full p-2 text-sm outline-none transition-colors ${isEndfieldTheme ? 'bg-transparent border border-[#FF6A00]/30 text-white focus:border-[#FF6A00]' : 'border rounded border-slate-300'}`}/>
                  </div>
                  <div className={isMobileBrowser ? 'col-span-1' : 'col-span-2'}>
                    <label className={`block text-xs mb-1 ${isEndfieldTheme ? 'text-cyan-500' : 'text-slate-600'}`}>{isEndfieldTheme ? 'GLOBAL_STATUS' : '全局主状态'}</label>
                    <CustomSelect
                      name="status"
                      options={['备考备料中', '材料收集', '申请提交中', '等待结果', '有录取·选校中', '已确认录取', '签证准备', '签证审批中', '已结案', '已结单', '全部被拒']}
                      value={studentForm?.status || '材料收集'}
                      onChange={e => setStudentForm(p => ({ ...p, status: e.target.value }))}
                      className="w-full h-[38px]"
                      isEndfieldTheme={isEndfieldTheme}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs mb-1 ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-600'}`}>{isEndfieldTheme ? 'VISA_START' : '签证窗口开始'}</label>
                    <input type="datetime-local" name="visaStart" value={studentForm?.visaStart?.includes('T') ? studentForm.visaStart.slice(0,16) : (studentForm?.visaStart ? studentForm.visaStart+'T00:00' : '')} onChange={e => setStudentForm(p => ({ ...p, visaStart: e.target.value }))} className={`w-full p-2 text-xs outline-none transition-colors ${isEndfieldTheme ? 'bg-transparent border border-[#FF6A00]/30 text-[#FF6A00] focus:border-[#FF6A00] custom-date-input' : 'border rounded border-slate-300'}`}/>
                  </div>
                  <div>
                    <label className={`block text-xs mb-1 ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-600'}`}>{isEndfieldTheme ? 'VISA_END' : '签证窗口截止'}</label>
                    <input type="datetime-local" name="visaEnd" value={studentForm?.visaEnd?.includes('T') ? studentForm.visaEnd.slice(0,16) : (studentForm?.visaEnd ? studentForm.visaEnd+'T00:00' : '')} onChange={e => setStudentForm(p => ({ ...p, visaEnd: e.target.value }))} className={`w-full p-2 text-xs outline-none transition-colors ${isEndfieldTheme ? 'bg-transparent border border-[#FF6A00]/30 text-[#FF6A00] focus:border-[#FF6A00] custom-date-input' : 'border rounded border-slate-300'}`}/>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center border-b pb-1.5 mb-3">
                  <h4 className="font-bold text-slate-800 font-serif">学业背景</h4>
                  <button type="button" onClick={() => { setEditingOptionType('sourceRegion'); setShowOptionManager(true); }} className="text-xs text-[#C68A4C] hover:underline font-serif">管理地区与阶段</button>
                </div>
                <div className={`grid ${isMobileBrowser ? 'grid-cols-1 gap-3' : 'grid-cols-2 gap-4'}`}>
                  <div>
                    <label htmlFor="stu-precedingSchoolLocation" className="block text-xs text-slate-600 mb-1">就读地点</label>
                    <select id="stu-precedingSchoolLocation" name="precedingSchoolLocation" value={studentForm?.precedingSchoolLocation || ''} onChange={e => setStudentForm(p => ({ ...p, precedingSchoolLocation: e.target.value }))} className="w-full border p-2 rounded text-sm">
                      <option value="">请选择</option>
                      {sourceRegions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="stu-precedingStage" className="block text-xs text-slate-600 mb-1">就读阶段</label>
                    <select id="stu-precedingStage" name="precedingStage" value={studentForm?.precedingStage || ''} onChange={e => setStudentForm(p => ({ ...p, precedingStage: e.target.value }))} className="w-full border p-2 rounded text-sm">
                      <option value="">请选择</option>
                      {sourceStages.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="stu-precedingSchoolName" className="block text-xs text-slate-600 mb-1">毕业学校</label>
                    <input id="stu-precedingSchoolName" type="text" name="precedingSchoolName" value={studentForm?.precedingSchoolName || ''} onChange={e => setStudentForm(p => ({ ...p, precedingSchoolName: e.target.value }))} className="w-full border p-2 rounded text-sm" placeholder="请输入学校名称"/>
                  </div>
                  <div>
                    <label htmlFor="stu-major" className="block text-xs text-slate-600 mb-1">所学专业</label>
                    <input id="stu-major" type="text" name="major" value={studentForm?.major || ''} onChange={e => setStudentForm(p => ({ ...p, major: e.target.value }))} className="w-full border p-2 rounded text-sm" placeholder="如：计算机科学"/>
                  </div>
                  <div>
                    <label htmlFor="stu-gpa" className="block text-xs text-slate-600 mb-1">绩点</label>
                    <input id="stu-gpa" type="number" step="any" min="0" name="gpa" value={studentForm?.gpa || ''} onChange={e => setStudentForm(p => ({ ...p, gpa: e.target.value }))} className="w-full border p-2 rounded text-sm" placeholder="如：3.8"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">GPA分制 <span className="text-slate-400 font-normal text-[10px]">(自由填写)</span></label>
                    <input name="gpaScale" type="text" value={studentForm?.gpaScale || ''} onChange={e => setStudentForm(p => ({ ...p, gpaScale: e.target.value }))} className="w-full border p-2 rounded text-sm" placeholder="如: 4.0 / 百分制 / 5.0"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">毕业状态</label>
                    <select name="graduationStatus" value={studentForm?.graduationStatus || ''} onChange={e => setStudentForm(p => ({ ...p, graduationStatus: e.target.value }))} className="w-full border p-2 rounded text-sm">
                      <option value="">请选择</option>
                      <option>在读</option>
                      <option>已毕业</option>
                    </select>
                  </div>
                  {studentForm?.graduationStatus === '在读' && (
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">当前年级</label>
                      <input type="text" name="currentYear" value={studentForm?.currentYear || ''} onChange={e => setStudentForm(p => ({ ...p, currentYear: e.target.value }))} className="w-full border p-2 rounded text-sm" placeholder="如：大一、大三、研一"/>
                    </div>
                  )}
                  {studentForm?.graduationStatus === '已毕业' && (
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">毕业后多久</label>
                      <input type="text" name="yearsAfterGrad" value={studentForm?.yearsAfterGrad || ''} onChange={e => setStudentForm(p => ({ ...p, yearsAfterGrad: e.target.value }))} className="w-full border p-2 rounded text-sm" placeholder="如：1年、半年、刚毕业"/>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">学制 <span className="text-slate-400 font-normal text-[10px]">(自由填写)</span></label>
                    <input type="text" name="programLength" value={studentForm?.programLength || ''} onChange={e => setStudentForm(p => ({ ...p, programLength: e.target.value }))} className="w-full border p-2 rounded text-sm" placeholder="如：4年、3年制、5年"/>
                  </div>

                  {/* 内地院校层次 */}
                  {studentForm?.precedingSchoolLocation === '中国大陆' && (
                    <div>
                      <label htmlFor="stu-precedingSchoolLevel" className="block text-xs text-slate-600 mb-1">院校层次</label>
                      <select id="stu-precedingSchoolLevel" name="precedingSchoolLevel" value={studentForm?.precedingSchoolLevel || ''} onChange={e => setStudentForm(p => ({ ...p, precedingSchoolLevel: e.target.value }))} className="w-full border p-2 rounded text-sm">
                        <option value="">请选择</option>
                        <option>985</option>
                        <option>211</option>
                        <option>一本</option>
                        <option>二本</option>
                        <option>三本/专科</option>
                        <option>其他</option>
                      </select>
                    </div>
                  )}

                  {/* 港澳/海外：国家地区 + 排名来源 + 数值 */}
                  {['香港/澳门', '海外'].includes(studentForm?.precedingSchoolLocation) && (
                    <>
                      <div>
                        <label htmlFor="stu-precedingSchoolCountry" className="block text-xs text-slate-600 mb-1">国家/地区</label>
                        <input id="stu-precedingSchoolCountry" type="text" name="precedingSchoolCountry" value={studentForm?.precedingSchoolCountry || ''} onChange={e => setStudentForm(p => ({ ...p, precedingSchoolCountry: e.target.value }))} className="w-full border p-2 rounded text-sm" placeholder="如：美国波士顿 / 英国伦敦 / 香港"/>
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label htmlFor="stu-precedingSchoolRankingSource" className="block text-xs text-slate-600">排名来源</label>
                          <span className="text-slate-400 font-normal text-[10px]">(如有)</span>
                        </div>
                        <select id="stu-precedingSchoolRankingSource" name="precedingSchoolRankingSource" value={studentForm?.precedingSchoolRankingSource || ''} onChange={e => setStudentForm(p => ({ ...p, precedingSchoolRankingSource: e.target.value }))} className="w-full border p-2 rounded text-sm">
                          <option value="">不填写</option>
                          <option>QS</option>
                          <option>THE</option>
                          <option>US News</option>
                        </select>
                      </div>
                      {studentForm?.precedingSchoolRankingSource && studentForm.precedingSchoolRankingSource !== '不填写' && (
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">排名数值</label>
                          <input type="number" min="1" step="1" name="precedingSchoolRankingValue" value={studentForm?.precedingSchoolRankingValue || ''} onChange={e => setStudentForm(p => ({ ...p, precedingSchoolRankingValue: e.target.value }))} className="w-full border p-2 rounded text-sm" placeholder="如：50"/>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 申请意向与经历 */}
              <div>
                <div className={`flex justify-between items-center border-b pb-1.5 mb-3 ${isEndfieldTheme ? 'border-[#FF6A00]/20' : 'border-slate-200'}`}>
                  <h4 className={`font-bold ${isEndfieldTheme ? 'text-[#FF6A00] tracking-widest' : 'text-slate-800 font-serif'}`}>{isEndfieldTheme ? '// INTENT & EXPERIENCE' : '申请意向与经历'}</h4>
                  <button type="button" onClick={() => { setEditingOptionType('targetRegion'); setShowOptionManager(true); }} className={`text-xs hover:underline ${isEndfieldTheme ? 'text-cyan-500' : 'text-[#C68A4C] font-serif'}`}>{isEndfieldTheme ? 'MANAGE_OPTIONS' : '管理意向与层级'}</button>
                </div>
                <div className={`grid ${isMobileBrowser ? 'grid-cols-1 gap-3' : 'grid-cols-2 gap-4'}`}>
                  <div>
                    <label htmlFor="stu-applicationStage" className="block text-xs text-slate-600 mb-1">目标阶段</label>
                    <select id="stu-applicationStage" name="applicationStage" value={studentForm?.applicationStage || ''} onChange={e => setStudentForm(p => ({ ...p, applicationStage: e.target.value }))} className="w-full border p-2 rounded text-sm">
                      <option value="">请选择</option>
                      {targetStages.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="relative" data-region-dropdown="true">
                    <label className="block text-xs text-slate-600 mb-1">意向目标地区 <span className="text-slate-400 font-normal">(可多选)</span></label>
                    {/* Multi-select dropdown for target regions */}
                    <div
                      className="w-full border p-2 rounded text-sm cursor-pointer flex items-center justify-between min-h-[38px] bg-white hover:border-[#C68A4C] transition-colors"
                      onClick={() => setShowRegionDropdown(v => !v)}
                    >
                      <span className={`truncate ${!(studentForm?.applicationRegion) ? 'text-slate-400' : 'text-slate-800'}`}>
                        {studentForm?.applicationRegion || '请选择（可多选）'}
                      </span>
                      <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${showRegionDropdown ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </div>
                    {showRegionDropdown && (
                      <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-[#E5DEC9] rounded-lg shadow-xl w-full max-h-48 overflow-y-auto">
                        {targetRegions.map(r => {
                          const selected = (studentForm?.applicationRegion || '').split('/').filter(Boolean).includes(r);
                          return (
                            <div
                              key={r}
                              className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#F3EFE6] text-sm transition-colors ${selected ? 'bg-[#FFF8F0]' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setStudentForm(p => {
                                  const current = (p.applicationRegion || '').split('/').filter(Boolean);
                                  const idx = current.indexOf(r);
                                  const updated = idx >= 0
                                    ? current.filter(x => x !== r)
                                    : [...current, r];
                                  return { ...p, applicationRegion: updated.join('/') };
                                });
                              }}
                            >
                              <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected ? 'bg-[#C68A4C] border-[#C68A4C]' : 'border-slate-300'}`}>
                                {selected && <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                              </span>
                              <span className={`font-serif ${selected ? 'font-semibold text-[#C68A4C]' : 'text-slate-700'}`}>{r}</span>
                            </div>
                          );
                        })}
                        {(studentForm?.applicationRegion || '').split('/').filter(Boolean).length > 0 && (
                          <div className="border-t border-[#E5DEC9] px-3 py-1.5">
                            <button
                              type="button"
                              className="text-xs text-slate-400 hover:text-red-500 font-serif"
                              onClick={(e) => { e.stopPropagation(); setStudentForm(p => ({ ...p, applicationRegion: '' })); }}
                            >清空选择</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-600 mb-1">联系地址</label>
                    <input name="address" value={studentForm?.address || ''} onChange={e => setStudentForm(p => ({ ...p, address: e.target.value }))} className="w-full border p-2 rounded text-sm" placeholder="请输入学生联系地址"/>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-600 mb-1">经历背景</label>
                    <textarea name="experience" rows={3} value={studentForm?.experience || ''} onChange={e => setStudentForm(p => ({ ...p, experience: e.target.value }))} className="w-full border p-2 rounded text-sm resize-none" placeholder="科研、实习、工作经历等描述..."/>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-600 mb-1">获奖经历</label>
                    <textarea name="awards" rows={2} value={studentForm?.awards || ''} onChange={e => setStudentForm(p => ({ ...p, awards: e.target.value }))} className="w-full border p-2 rounded text-sm resize-none" placeholder="各类竞赛、奖学金、荣誉称号等..."/>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-600 mb-1">职业证书 <span className="text-slate-400 font-normal text-[10px]">(如: CFA、律师执照、教师资格证等)</span></label>
                    <textarea name="professionalCerts" rows={2} value={studentForm?.professionalCerts || ''} onChange={e => setStudentForm(p => ({ ...p, professionalCerts: e.target.value }))} className="w-full border p-2 rounded text-sm resize-none" placeholder="如：CFA Level 2、教师资格证（中学数学）、中级会计师"/>
                  </div>
                </div>
              </div>

              <div className={`flex justify-end gap-2 pt-4 border-t ${isEndfieldTheme ? 'border-[#FF6A00]/20' : 'border-slate-200'}`}>
                <button type="button" onClick={() => setShowStudentModal(false)} className={`px-4 py-2 text-sm outline-none transition-colors ${isEndfieldTheme ? 'border border-[#FF6A00]/50 text-[#FF6A00] hover:bg-[#FF6A00]/10' : 'border rounded text-slate-700 hover:bg-slate-50'}`}>{isEndfieldTheme ? 'CANCEL' : '取消'}</button>
                <button type="submit" className={`px-6 py-2 text-sm font-bold outline-none transition-colors ${isEndfieldTheme ? 'bg-[#FF6A00] text-black clip-corner-br shadow-[0_0_15px_rgba(255,106,0,0.4)] hover:bg-orange-500 tracking-widest' : 'bg-blue-600 text-white rounded hover:bg-blue-700'}`}>{isEndfieldTheme ? 'COMMIT' : '保存'}</button>
              </div>
            </form>
          </div>
        </div>
      )}


      {showAppModal && appForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={OVERLAY_STYLE}>
          <div className={`${isEndfieldTheme ? 'animate-endfield-summon bg-[#0a0a0c]   clip-corner-tl cyber-modal relative' : 'animate-pop-in bg-white elegant-modal   '} ${isMobileBrowser ? 'w-[calc(100%-20px)]' : 'w-[600px]'} max-h-[95vh] overflow-y-auto`}>
            {isEndfieldTheme && <div className="absolute top-0 left-0 w-[40%] h-[2px] bg-[#FF6A00]/80"></div>}
            <div className={`flex justify-between items-center ${isMobileBrowser ? 'px-4 py-3 gap-3' : 'px-6 py-4'} border-b ${isEndfieldTheme ? 'bg-[#17181c] border-[#FF6A00]/20' : 'animate-pop-in bg-white'}`}>
              <h3 className={`${isMobileBrowser ? 'text-base leading-snug' : 'text-lg'} font-bold flex items-center min-w-0 ${isEndfieldTheme ? 'font-mono text-white tracking-widest' : ''}`}>
                {isEndfieldTheme ? <span className="text-[#FF6A00] mr-3">// SYS_APP_CONFIG</span> : <Target className="w-5 h-5 mr-2"/>}
                {editingApp?.id ? (isEndfieldTheme ? 'EDIT_APPLICATION' : '编辑网申专业') : (isEndfieldTheme ? 'NEW_APPLICATION' : '新增网申专业')}
              </h3>
              <button onClick={handleCloseAppModal} className={isEndfieldTheme ? 'text-[#FF6A00]/50 hover:text-[#FF6A00]' : 'text-slate-400 hover:text-slate-700'}><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleSaveApp} className={`${isMobileBrowser ? 'p-3 space-y-3 mobile-application-form' : 'p-6 space-y-4'} ${isEndfieldTheme ? 'font-mono' : ''}`}>
              <div className={`${isMobileBrowser ? 'p-3' : 'p-4'} ${isEndfieldTheme ? 'bg-[#17181c] border border-[#FF6A00]/20 clip-corner-br relative' : 'bg-slate-50 rounded-lg border'}`}>
                {isEndfieldTheme && <div className="absolute right-0 bottom-0 w-2 h-2 border-r-2 border-b-2 border-[#FF6A00]/50"></div>}
                <div className={`grid ${isMobileBrowser ? 'grid-cols-1 gap-3' : 'grid-cols-3 gap-4'} mb-4`}>
                  <div><label className={`block text-sm mb-1 ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-600'}`}>{isEndfieldTheme ? 'TARGET_INSTITUTION' : '目标院校'}</label><input name="school" value={appForm?.school || ''} onChange={e => setAppForm(p => ({ ...p, school: e.target.value }))} required className={`w-full p-2 text-sm outline-none transition-colors ${isEndfieldTheme ? 'bg-transparent border-b border-[#FF6A00]/30 text-white focus:border-[#FF6A00]' : 'border rounded'}`}/></div>
                  <div><label className={`block text-sm mb-1 ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-600'}`}>{isEndfieldTheme ? 'PROGRAM' : '具体专业'}</label><input name="program" value={appForm?.program || ''} onChange={e => setAppForm(p => ({ ...p, program: e.target.value }))} required className={`w-full p-2 text-sm outline-none transition-colors ${isEndfieldTheme ? 'bg-transparent border-b border-[#FF6A00]/30 text-white focus:border-[#FF6A00]' : 'border rounded'}`}/></div>
                  <div><label className={`block text-sm mb-1 font-semibold ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-blue-700'}`}>{isEndfieldTheme ? 'APP_TIER' : '申请档位'}</label>
                    <CustomSelect 
                      name="tier"
                      options={['冲刺档', '稳妥档', '保底档']} 
                      value={appForm?.tier || '稳妥档'} 
                      onChange={e => setAppForm(p => ({ ...p, tier: e.target.value }))} 
                      className="w-full h-[38px]" 
                      isEndfieldTheme={isEndfieldTheme} 
                    />
                  </div>
                </div>
                <div className={`grid ${isMobileBrowser ? 'grid-cols-1 gap-3' : 'grid-cols-3 gap-4'} items-end`}>
                  <div><label className={`block text-sm mb-1 ${isEndfieldTheme ? 'text-stone-400' : 'text-slate-600'}`}>{isEndfieldTheme ? 'OPEN_DATE' : '开放申请日'}</label><input type="datetime-local" name="openDate" value={appForm?.openDate?.includes('T') ? appForm.openDate.slice(0,16) : (appForm?.openDate ? appForm.openDate+'T00:00' : '')} onChange={e => setAppForm(p => ({ ...p, openDate: e.target.value }))} required className={`w-full p-2 text-sm outline-none transition-colors ${isEndfieldTheme ? 'bg-transparent border-b border-[#FF6A00]/30 text-[#FF6A00] focus:border-[#FF6A00] custom-date-input' : 'border rounded'}`}/></div>
                  <div><label className={`block text-sm mb-1 font-medium ${isEndfieldTheme ? 'text-red-500 animate-pulse' : 'text-red-600'}`}>{isEndfieldTheme ? 'DEADLINE (SYS_LOCK)' : '系统关闭日(DDL)'}</label><input type="datetime-local" name="deadline" value={appForm?.deadline?.includes('T') ? appForm.deadline.slice(0,16) : (appForm?.deadline ? appForm.deadline+'T00:00' : '')} onChange={e => setAppForm(p => ({ ...p, deadline: e.target.value }))} required className={`w-full p-2 text-sm outline-none transition-colors ${isEndfieldTheme ? 'bg-transparent border border-red-500/50 text-red-400 focus:border-red-500 custom-date-input shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'border rounded border-red-200'}`}/></div>
                  <div><label className={`block text-sm mb-1 font-semibold ${isEndfieldTheme ? 'text-cyan-500' : 'text-slate-600'}`}>{isEndfieldTheme ? 'STATUS' : '网申进度'}</label>
                    <CustomSelect 
                      name="status"
                      options={['收集中', '已递交', '待补件', '已录取', '已拒绝', '已取消']} 
                      value={appForm?.status || '收集中'} 
                      onChange={e => setAppForm(p => ({ ...p, status: e.target.value }))} 
                      className="w-full h-[38px]" 
                      isEndfieldTheme={isEndfieldTheme} 
                    />
                  </div>
                </div>
              </div>

              <div className={`p-4 border ${isEndfieldTheme ? 'bg-[#0a0a0c] border-cyan-900/50 relative' : 'bg-blue-50 border-blue-100 rounded-lg'}`}>
                {isEndfieldTheme && <div className="absolute left-0 top-0 w-[2px] h-full bg-cyan-500/50"></div>}
                <label className={`block text-sm font-semibold mb-3 flex items-center ${isEndfieldTheme ? 'text-cyan-500 tracking-widest' : 'text-blue-800'}`}>{isEndfieldTheme ? '// PORTAL_CREDENTIALS' : <><Lock className="w-4 h-4 mr-1"/> 账号密码档案</>}</label>
                <div className={`grid ${isMobileBrowser ? 'grid-cols-1' : 'grid-cols-2'} gap-3 mb-3`}>
                  <div><label className={`block text-[10px] mb-0.5 ${isEndfieldTheme ? 'text-cyan-600' : 'text-blue-600'}`}>{isEndfieldTheme ? 'REG_EMAIL' : '注册用邮箱'}</label><input name="portalEmail" value={appForm?.portalEmail || ''} onChange={e => setAppForm(p => ({ ...p, portalEmail: e.target.value }))} className={`w-full p-2 text-xs outline-none ${isEndfieldTheme ? 'bg-transparent border-b border-cyan-900/50 text-cyan-100 focus:border-cyan-500' : 'border border-blue-200 rounded'}`}/></div>
                  <div><label className={`block text-[10px] mb-0.5 ${isEndfieldTheme ? 'text-cyan-600' : 'text-blue-600'}`}>{isEndfieldTheme ? 'EMAIL_PWD' : '该邮箱密码'}</label><input type="password" name="portalEmailPwd" value={appForm?.portalEmailPwd || ''} onChange={e => setAppForm(p => ({ ...p, portalEmailPwd: e.target.value }))} className={`w-full p-2 text-xs outline-none ${isEndfieldTheme ? 'bg-transparent border-b border-cyan-900/50 text-cyan-100 focus:border-cyan-500' : 'border border-blue-200 rounded'}`}/></div>
                </div>
                <div className={`grid ${isMobileBrowser ? 'grid-cols-1' : 'grid-cols-3'} gap-3 mb-3`}>
                  <div><label className={`block text-[10px] mb-0.5 ${isEndfieldTheme ? 'text-cyan-600' : 'text-blue-600'}`}>{isEndfieldTheme ? 'PORTAL_ID' : '网申账号'}</label><input name="portalAccount" value={appForm?.portalAccount || ''} onChange={e => setAppForm(p => ({ ...p, portalAccount: e.target.value }))} className={`w-full p-2 text-xs outline-none ${isEndfieldTheme ? 'bg-transparent border-b border-cyan-900/50 text-cyan-100 focus:border-cyan-500' : 'border border-blue-200 rounded'}`}/></div>
                  <div><label className={`block text-[10px] mb-0.5 ${isEndfieldTheme ? 'text-cyan-600' : 'text-blue-600'}`}>{isEndfieldTheme ? 'PORTAL_PWD' : '网申密码'}</label><input type="password" name="portalPassword" value={appForm?.portalPassword || ''} onChange={e => setAppForm(p => ({ ...p, portalPassword: e.target.value }))} className={`w-full p-2 text-xs outline-none ${isEndfieldTheme ? 'bg-transparent border-b border-cyan-900/50 text-cyan-100 focus:border-cyan-500' : 'border border-blue-200 rounded'}`}/></div>
                  <div><label className={`block text-[10px] mb-0.5 ${isEndfieldTheme ? 'text-cyan-600' : 'text-blue-600'}`}>{isEndfieldTheme ? 'APP_ID' : 'App ID'}</label><input name="portalAppId" value={appForm?.portalAppId || ''} onChange={e => setAppForm(p => ({ ...p, portalAppId: e.target.value }))} className={`w-full p-2 text-xs outline-none ${isEndfieldTheme ? 'bg-transparent border-b border-cyan-900/50 text-cyan-100 focus:border-cyan-500' : 'border border-blue-200 rounded'}`}/></div>
                </div>
                <div><label className={`block text-[10px] mb-0.5 ${isEndfieldTheme ? 'text-cyan-600' : 'text-blue-600'}`}>{isEndfieldTheme ? 'SECURITY_QA' : '密保问题及答案'}</label><input name="portalSecurityQA" value={appForm?.portalSecurityQA || ''} onChange={e => setAppForm(p => ({ ...p, portalSecurityQA: e.target.value }))} className={`w-full p-2 text-xs outline-none ${isEndfieldTheme ? 'bg-transparent border-b border-cyan-900/50 text-cyan-100 focus:border-cyan-500' : 'border border-blue-200 rounded'}`}/></div>
              </div>
              <div className={`p-4 border ${isEndfieldTheme ? 'bg-[#17181c] border-orange-500/30' : 'bg-orange-50 border-orange-200 rounded-lg'}`}>
                <label className={`block text-sm font-semibold mb-2 flex items-center ${isEndfieldTheme ? 'text-[#FF6A00] tracking-widest' : 'text-orange-800'}`}>{isEndfieldTheme ? '// NOTES_LOG' : <><Calendar className="w-4 h-4 mr-1"/> 备注（带截止日预警与完成标记）</>}</label>
                <div className="space-y-2 mt-4">
                  {appFormNotes.map(note => {
                    const studentRef = editingAppStudentId;
                    const alertId = `${studentRef}-${editingApp?.id}-note-${note.id}`;
                    const isCompleted = completedAlerts[alertId];
                    return (
                      <div key={note.id} className={`flex ${isMobileBrowser ? 'flex-wrap gap-2 rounded-lg border border-orange-200 p-2' : 'space-x-2'} items-center`}>
                        <button type="button" onClick={() => handleCompleteAlert({ id: alertId, title: '备注: ' + note.text, type: 'info', message: '从专业编辑页面手动完成' })} 
                                title={isCompleted ? (isEndfieldTheme ? 'RESTORE' : '取消完成') : (isEndfieldTheme ? 'MARK_COMPLETE' : '标记完成')}
                                className={`p-1.5 transition-colors flex-shrink-0 ${isEndfieldTheme ? (isCompleted ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-500' : 'bg-transparent border border-stone-600 text-stone-500 hover:text-[#FF6A00] hover:border-[#FF6A00]') : (isCompleted ? 'bg-green-100 text-green-600 border border-green-300 rounded-md' : 'animate-pop-in bg-white border border-slate-300 text-slate-400 hover:text-green-500 hover:border-green-400 rounded-md')}`}>
                          <Check className="w-4 h-4"/>
                        </button>
                        <input type="text" value={note.text} onChange={(e) => updateAppFormNote(note.id, 'text', e.target.value)} placeholder={isEndfieldTheme ? 'INPUT_LOG_CONTENT' : '如：补交语言成绩...'} className={`${isMobileBrowser ? 'min-w-0 basis-[calc(100%-44px)]' : ''} flex-1 p-2 text-sm outline-none transition-colors ${isEndfieldTheme ? (isCompleted ? 'bg-transparent border-b border-cyan-900/50 text-cyan-700 line-through' : 'bg-transparent border-b border-[#FF6A00]/30 text-[#c8cbd0] focus:border-[#FF6A00]') : (isCompleted ? 'border border-transparent bg-slate-50 text-slate-400 line-through rounded' : 'border border-orange-200 rounded')}`} required/>
                        <div className={`${isMobileBrowser ? 'order-3 basis-full' : 'w-52'} min-w-0`}>
                          <InlineDateInput
                            initialValue={note.deadline}
                            onSave={(value) => updateAppFormNote(note.id, 'deadline', value)}
                            optional
                            emptyLabel="设置提醒时间"
                            ariaLabel={`${note.text || '备注'}提醒时间`}
                          />
                        </div>
                        <button type="button" onClick={() => { if (window.confirm('确定删除这条备注吗？')) removeAppFormNote(note.id); }} className={`p-1 transition-colors ${isEndfieldTheme ? 'text-stone-500 hover:text-red-500' : 'text-slate-400 hover:text-red-500 bg-white rounded'}`}><Trash2 className="w-4 h-4"/></button>
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={addAppFormNote} className={`mt-4 text-sm font-medium flex items-center hover:underline ${isEndfieldTheme ? 'text-stone-400 hover:text-[#FF6A00] border border-stone-700 hover:border-[#FF6A00] px-3 py-1 transition-colors' : 'text-orange-700'}`}><Plus className="w-4 h-4 mr-1"/> {isEndfieldTheme ? 'ADD_ENTRY' : '新增备注项'}</button>
              </div>
              <div className={`flex justify-end gap-3 pt-4 border-t ${isEndfieldTheme ? 'border-[#FF6A00]/20' : 'border-slate-200'}`}>
                <button type="button" onClick={handleCloseAppModal} className={`px-5 py-2.5 text-sm outline-none transition-colors ${isEndfieldTheme ? 'border border-[#FF6A00]/50 text-[#FF6A00] hover:bg-[#FF6A00]/10' : 'border rounded-lg text-slate-700 hover:bg-slate-50'}`}>{isEndfieldTheme ? 'CANCEL' : '取消'}</button>
                <button type="submit" className={`px-6 py-2.5 text-sm font-bold outline-none transition-colors ${isEndfieldTheme ? 'bg-[#FF6A00] text-black clip-corner-br shadow-[0_0_15px_rgba(255,106,0,0.4)] hover:bg-orange-500 tracking-widest' : 'bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700'}`}>{isEndfieldTheme ? 'COMMIT' : '保存专业配置'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 左侧导航 */}
      {!plannerStudentContext && (isEndfieldTheme ? (
        <EndfieldSidebar 
          activeTab={activeTab} 
          setActiveTab={navigatePrimaryTab}
          onOpenSettings={() => setShowEffectsModal(true)}
          onExit={handleSafeExit}
        />
      ) : (
      <aside className="w-64 bg-[#1B1E24] text-white flex flex-col z-30 border-r border-[#E5DEC9]/10">
        <div className="p-6 border-b border-[#E5DEC9]/10">
          <h1 className="text-xl font-bold tracking-wider text-[#C68A4C] flex items-center font-serif"><MapPin className="w-5 h-5 mr-2"/> 教务进度中心</h1>
          <p className="text-xs text-slate-400 mt-2 flex items-center"><Clock className="w-3 h-3 mr-1"/> 今日: {(() => { const d = new Date(); return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`; })()}</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {[['calendar','每周待办日历','日历',Calendar], ['dashboard','智能预警仪表盘','预警',LayoutDashboard], ['gantt','时间轴排期总览','时间轴',AlignLeft], ['students','学生档案和资料','档案库',Users]].map(([tab, label, mobileLabel, Icon]) => {
            const isActive = activeTab === tab && !selectedStudentForDocsId && !selectedStudentForGanttId;
            return (
              <button key={tab} aria-label={label} onClick={() => navigatePrimaryTab(tab)}
                className={`w-full flex items-center px-4 py-3 rounded-lg transition-all duration-300 relative overflow-hidden group/btn ${isActive ? 'bg-[#C68A4C] text-white font-serif shadow-[0_0_12px_rgba(198,138,76,0.3)] tech-scanline' : 'text-slate-300 hover:bg-stone-800/80 hover:pl-6'}`}>
                <span className="tech-btn-arrow text-[#C68A4C] mr-1.5 text-xs font-bold">▸</span>
                <Icon className="w-5 h-5 mr-3"/><span>{isMobileBrowser ? mobileLabel : label}</span>
                {tab === 'dashboard' && activeAlerts.filter(a=>a.type==='critical').length > 0 && (
                  <span className="mobile-nav-alert-badge ml-auto bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{activeAlerts.filter(a=>a.type==='critical').length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-[#E5DEC9]/10 space-y-2">
          <button onClick={() => setShowEffectsModal(true)} className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-slate-400 hover:bg-stone-800 hover:text-white transition-colors text-sm">
            <Paintbrush className="w-4 h-4 text-[#C68A4C]"/><span>视觉特效设置</span>
            <span className="ml-auto text-[10px] text-slate-500">{effectsConfig.enabled ? '已开启' : '已关闭'}</span>
          </button>
          {!readOnlyViewer && !!window.electronAPI && <button onClick={() => setShowDataModal(true)} className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-slate-400 hover:bg-stone-800 hover:text-white transition-colors text-sm">
            <Database className="w-4 h-4"/><span>数据管理</span>
            <span className={`ml-auto text-[10px] ${cloudSession ? 'text-cyan-400' : dataFolderPath ? 'text-green-400' : 'text-amber-400'}`}>● {cloudSession ? '云端同步中' : dataFolderPath ? '已配置' : '演示模式'}</span>
          </button>}
          {!window.electronAPI && !readOnlyViewer && !!getActiveTeacherSyncSession() && <button onClick={() => void handleCloudSaveOnly()} disabled={syncStatus === 'syncing'} title={dataStatus} className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-slate-300 hover:bg-stone-800 hover:text-white transition-colors text-sm disabled:opacity-50">
            <CloudUpload className="w-4 h-4 text-[#C68A4C]"/><span>{syncStatus === 'syncing' ? '正在保存到云端' : '保存到云端'}</span>
            <span className={`ml-auto text-[10px] ${syncStatus === 'error' ? 'text-red-400' : dataStatus.includes('成功') ? 'text-green-400' : 'text-cyan-400'}`}>● {syncStatus === 'error' ? '失败' : syncStatus === 'syncing' ? '同步中' : dataStatus.includes('成功') ? '已保存' : dataStatus.includes('刷新') ? '已刷新' : '云端'}</span>
          </button>}
          {!window.electronAPI && !!getActiveTeacherSyncSession() && <button data-readonly-allow="true" onClick={() => void handleCloudRefresh()} disabled={syncStatus === 'syncing'} title={dataStatus} className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-slate-400 hover:bg-stone-800 hover:text-white transition-colors text-sm disabled:opacity-50">
            <CloudDownload className="w-4 h-4"/><span>从云端刷新</span>
          </button>}
          <button onClick={handleSafeExit} className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-slate-400 hover:bg-stone-800 hover:text-white transition-colors text-sm">
            <LogOut className="w-4 h-4 text-[#C68A4C]"/><span>退出系统</span>
          </button>
        </div>
      </aside>
      ))}

      <main
        ref={mainScrollRef}
        data-testid="main-scroll-container"
        onPointerDown={handleMobilePagePointerDown}
        onPointerUp={handleMobilePagePointerUp}
        onPointerCancel={() => { mobilePageSwipeRef.current = { pointerId: null, startX: 0, startY: 0, ignored: false }; }}
        className={`flex-1 min-w-0 max-w-full overflow-auto overflow-x-hidden transition-colors duration-500 relative ${isEndfieldTheme ? 'bg-[#0a0a0c] endfield-content-area' : 'bg-[#F3EFE6]'}`}
      >
        {impersonatedSession && cloudSession?.role !== 'planner' && (
          <div className={`mobile-context-bar w-full min-w-0 py-2.5 px-8 flex justify-between items-center gap-2 text-xs border-b sticky top-0 z-50 ${
            isEndfieldTheme 
              ? 'bg-[#2a1315] border-red-950/40 text-red-400 font-mono' 
              : 'bg-red-50 border-red-200 text-red-800 font-serif'
          }`}>
            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
              <span className={`w-2 h-2 rounded-full ${readOnlyViewer ? 'bg-blue-500 animate-pulse' : 'bg-red-500 animate-ping'}`}></span>
              <span className="min-w-0 truncate whitespace-nowrap">{readOnlyViewer ? '只读查看' : '模拟登录模式'}: 当前用户 <strong>{impersonatedSession.username}</strong>{readOnlyViewer ? '；所有编辑、保存与上传均已禁用' : ''}</span>
            </div>
            <button 
              onClick={() => void handleExitAdminImpersonation(true)}
              data-readonly-allow="true"
              className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-md text-xs border ${
                isEndfieldTheme 
                  ? 'border-red-900/60 hover:bg-red-900/20 text-red-400' 
                  : 'border-red-300 hover:bg-red-100 text-red-800 bg-white'
              } transition-colors cursor-pointer`}
            >
              {readOnlyViewer ? '退出查看' : '退出模拟'}
            </button>
          </div>
        )}
        {subAdminSelfMode && (
          <div className={`mobile-context-bar w-full min-w-0 py-2.5 px-8 flex justify-between items-center gap-2 text-xs border-b sticky top-0 z-50 ${
            isEndfieldTheme 
              ? 'bg-[#152a13] border-green-950/40 text-green-400 font-mono' 
              : 'bg-green-50 border-green-200 text-green-800 font-serif'
          }`}>
            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="min-w-0 truncate whitespace-nowrap">您正在查看自己的教务数据</span>
            </div>
            <button 
              onClick={async () => {
                const saved = await handleCloudSaveOnly({ silentSuccess: true });
                if (!saved && !window.confirm('云端保存失败。仍要返回管理面板并放弃未同步修改吗？')) return;
                // Returning to the dashboard may clear the pending timer only
                // after the explicit cloud flush above has completed.
                setDataLoaded(false);
                if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
                setSubAdminSelfMode(false);
                (window as any).subAdminSelfMode = false;
                lastSyncedStudentsRef.current = [];
                lastSyncedSeasonsRef.current = [];
                lastSyncedSettingsRef.current = '';
                lastSyncedCalendarRef.current = '';
                setStudents([]);
                setSeasons([]);
                setDataLoaded(true);
              }}
              className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-md text-xs border ${
                isEndfieldTheme 
                  ? 'border-green-900/60 hover:bg-green-900/20 text-green-400' 
                  : 'border-green-300 hover:bg-green-100 text-green-800 bg-white'
              } transition-colors cursor-pointer`}
            >
              返回管理面板
            </button>
          </div>
        )}
        {plannerStudentContext ? (
          <header className={`sticky ${impersonatedSession && cloudSession?.role !== 'planner' ? 'top-11' : 'top-0'} z-40 flex items-center gap-2 border-b border-[#E5DEC9] bg-[#FAF8F5] px-3 py-2 sm:px-8`}>
            <h2 className="min-w-0 flex-1 truncate text-sm font-bold sm:text-lg">{plannerStudentContext.name} 的资料库</h2>
            <FontScalePicker value={fontScaleMode} onChange={setFontScaleMode} />
            <button
              data-readonly-allow="true"
              onClick={handleExitPlannerStudentView}
              className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#D8E0EA] bg-white px-2 text-xs text-slate-600 hover:bg-slate-50"
              aria-label="返回我的学生"
              title="返回我的学生"
            >
              <Users className="h-4 w-4"/><span className="hidden sm:inline">返回我的学生</span>
            </button>
          </header>
        ) : isEndfieldTheme ? (
          <EndfieldHeader 
            activeTab={activeTab}
            selectedStudentForDocs={selectedStudentForDocs}
            selectedStudentForGantt={selectedStudentForGantt}
            setSelectedStudentForDocsId={setSelectedStudentForDocsId}
            setSelectedStudentForGanttId={setSelectedStudentForGanttId}
            seasons={seasons}
            activeSeasonId={activeSeasonId}
            setActiveSeasonId={setActiveSeasonId}
            isRecycleBinMode={isRecycleBinMode}
            activeCompletedItemsCount={activeCompletedItems.length}
            setShowCompletedModal={setShowCompletedModal}
            setShowSeasonModal={setShowSeasonModal}
            dataFolderPath={dataFolderPath}
            dataStatus={dataStatus}
          />
        ) : (
        <header className={`border-b transition-colors duration-500 flex justify-between sticky z-40 ${(impersonatedSession || subAdminSelfMode) ? (isMobileBrowser ? 'top-11' : 'top-9') : 'top-0'} ${isMobileBrowser ? `${activeTab === 'calendar' ? 'hidden' : ''} mobile-main-header px-3 py-1.5 items-center gap-1.5` : 'px-8 py-4 items-center'} ${isEndfieldTheme ? 'bg-[#17181c] border-[#FF6A00]/20' : 'bg-[#FAF8F5] border-[#E5DEC9]'}`}>
          <h2 className={`font-semibold text-slate-800 flex items-center ${isMobileBrowser ? 'min-w-0 flex-1 text-sm whitespace-nowrap' : 'text-xl'}`}>
            {selectedStudentForDocs ? (
              isEndfieldTheme ? (
                <><span className="cursor-pointer hover:text-blue-400 font-mono text-[#c8cbd0]" onClick={() => closeStudentDocs()}>[ BACK ]</span><span className="mx-2 text-stone-600">//</span><GlitchText text={selectedStudentForDocs.name.toUpperCase() + ' // REGISTRY_CONTROL'} className="text-[#FF6A00] font-mono tracking-wider font-bold" trigger={selectedStudentForDocs.id} /></>
              ) : (
                <><span className={`cursor-pointer transition-colors ${isEndfieldTheme ? 'hover:text-[#FF6A00] font-mono' : 'hover:text-blue-600'}`} onClick={() => closeStudentDocs()}>返回档案库</span><ChevronRight className="w-5 h-5 mx-2 text-slate-400"/>{selectedStudentForDocs.name} 的材料总控</>
              )
            ) : selectedStudentForGantt ? (
              isEndfieldTheme ? (
                <><span className="cursor-pointer hover:text-blue-400 font-mono text-[#c8cbd0]" onClick={() => setSelectedStudentForGanttId(null)}>[ BACK ]</span><span className="mx-2 text-stone-600">//</span><GlitchText text={selectedStudentForGantt.name.toUpperCase() + ' // TIMELINE_DRILL'} className="text-[#FF6A00] font-mono tracking-wider font-bold" trigger={selectedStudentForGantt.id} /></>
              ) : (
                <><span className={`cursor-pointer transition-colors ${isEndfieldTheme ? 'hover:text-[#FF6A00] font-mono' : 'hover:text-blue-600'}`} onClick={() => setSelectedStudentForGanttId(null)}>返回时间轴</span><ChevronRight className="w-5 h-5 mx-2 text-slate-400"/>{selectedStudentForGantt.name} 排期钻取</>
              )
            ) : (
              <div className={`flex items-center ${isMobileBrowser ? 'min-w-0 flex-1 flex-nowrap gap-1.5' : 'gap-4'}`}>
                {isEndfieldTheme ? (
                  <GlitchText text={`[ SYSTEM // ${{dashboard:'DASHBOARD_OVERVIEW',gantt:'GANTT_TIMELINE',students:'REGISTRY_DATABASE'}[activeTab] || ''} ]`} className="text-[#FF6A00] font-mono tracking-widest font-bold" trigger={activeTab} />
                ) : (
                  <span className={isMobileBrowser ? 'shrink-0' : ''}>{{dashboard:'工作台概览',gantt:'全局时间轴',students:'教务档案库'}[activeTab]}</span>
                )}
                {activeTab !== 'calendar' && (
                <div
                  className={`flex items-center rounded-lg border ${isMobileBrowser ? 'mobile-header-season min-w-0 shrink p-0.5' : 'p-1'} ${isEndfieldTheme ? 'bg-stone-900 border-[#FF6A00]/20' : 'bg-slate-100 border-slate-200'}`}
                  style={isMobileBrowser ? { '--season-name-length': Math.max(6, activeSeasonConfig?.name?.length || 6) } as React.CSSProperties : undefined}
                >
                  <span className={`text-xs font-medium text-slate-500 ml-2 mr-1 translate-y-[2.5px] ${isMobileBrowser ? 'sr-only' : ''}`}>申请季:</span>
                  <CustomSelect
                    value={activeSeasonId}
                    onChange={(e) => { setActiveSeasonId(e.target.value); setSelectedStudentForDocsId(null); setSelectedStudentForGanttId(null); }}
                    options={seasons.filter(s => isRecycleBinMode ? s.isArchived : !s.isArchived).map(s => ({ value: s.id, label: s.name }))}
                    className={`${isMobileBrowser ? 'w-full min-w-0' : 'w-48'} h-[32px] text-sm`}
                    isEndfieldTheme={isEndfieldTheme}
                    customButtonClass={`w-full h-full min-w-0 bg-transparent border-none text-[#C68A4C] font-bold text-sm focus:ring-0 cursor-pointer px-1 font-serif flex items-center justify-between gap-1 ${isEndfieldTheme ? 'text-[#FF6A00] font-mono focus:outline-none' : ''}`}
                  />



                </div>
                )}
              </div>
            )}
          </h2>
          <div className={`flex items-center ${isMobileBrowser ? 'shrink-0 gap-1' : 'gap-3'}`}>
            {dataFolderPath && <span className="text-xs text-slate-400 hidden md:block">{dataStatus}</span>}
            {isMobileBrowser && activeTab !== 'calendar' ? (
              <button data-readonly-allow="true" onClick={() => setShowMobileSystemMenu(true)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5DEC9] bg-[#FAF8F5] text-slate-600 shadow-sm" aria-label="系统与云端" title="系统与云端">
                <Settings className="h-4 w-4"/>
              </button>
            ) : activeTab !== 'calendar' && (
              <>
                {activeTab !== 'dashboard' && <button onClick={() => setShowCompletedModal(true)} className="flex items-center text-[#C68A4C] hover:text-[#A97138] border border-[#E5DEC9] bg-[#FAF8F5] rounded-lg shadow-sm font-serif px-3 py-1.5 text-sm" aria-label={`已完成任务 ${activeCompletedItems.length}`} title="已完成任务">
                  {`已完成任务 (${activeCompletedItems.length})`}
                </button>}
                <button onClick={() => setShowSeasonModal(true)} className="flex items-center justify-center text-slate-500 hover:text-[#C68A4C] border border-[#E5DEC9] bg-[#FAF8F5] rounded-lg shadow-sm font-serif px-3 py-1.5 text-sm" aria-label="申请季配置" title="申请季配置">
                  申请季配置
                </button>
              </>
            )}
          </div>
        </header>
        )}

        {isEndfieldTheme && (
          <div className="bg-[#17181c] text-stone-500 border-b border-[#FF6A00]/15 px-8 py-2 flex justify-between items-center text-[10px] font-mono select-none">
            <div className="flex gap-5 items-center">
              <span className="text-[#FF6A00] animate-pulse">● SECURE_LINK_ON</span>
              <span>SECTOR // TALOS-II // DECK-S04</span>
              <span>CORE: <span className="text-[#FF6A00]">42.8°C</span></span>
              <span>LOAD: <span className="text-[#FF6A00]">31.2%</span></span>
              <span>FPS: <span className="text-stone-300">60.0</span></span>
            </div>
            <div className="flex gap-3 items-center">
              <span>ALERTS: <span className="text-red-500 font-bold">{activeAlerts.filter(a=>a.type==='critical').length}</span></span>
              <span>USER // ENF-ADMIN</span>
            </div>
          </div>
        )}

        {isRecycleBinMode && !plannerStudentContext && (
          <div className="bg-amber-50 border-b border-amber-200 px-8 py-3 flex items-center justify-between text-amber-800 text-sm font-serif">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#C68A4C] shrink-0" />
              <span>您当前处于已归档申请季 (回收站) 视图，仅显示已归档的数据。</span>
            </div>
            <button onClick={exitRecycleBinMode} className="text-[#C68A4C] hover:text-[#A97138] font-bold underline">
              返回进行中申请季
            </button>
          </div>
        )}

        <div className={isMobileBrowser ? 'p-3' : 'p-8'}>
          {activeTab === 'dashboard' && !selectedStudentForDocsId && !selectedStudentForGanttId && (
            <div className={isMobileBrowser ? "space-y-3" : "space-y-6"}>
              {!isMobileBrowser && <div className="grid grid-cols-4 gap-4">
                {[
                  [isEndfieldTheme ? 'ACTIVE_AGENTS' : '活跃学生', activeStudents.length, isEndfieldTheme ? 'border-t-cyan-500' : 'border-t-blue-500', isEndfieldTheme ? 'text-cyan-500 font-mono tracking-widest' : 'text-blue-600'],
                  [`紧急 (≤${alertConfig.deadlineCritical}天)`, activeAlerts.filter(a=>a.type==='critical').length, 'border-t-red-500', 'text-red-600'],
                  [`注意 (≤${alertConfig.deadlineWarning}天)`, activeAlerts.filter(a=>a.type==='warning').length, 'border-t-[#C68A4C]', 'text-[#C68A4C]'],
                  [isEndfieldTheme ? 'RESOLVED_TASKS' : '已完成任务(活跃)', activeCompletedItems.length, isEndfieldTheme ? 'border-t-stone-500' : 'border-t-green-500', isEndfieldTheme ? 'text-stone-500 font-mono tracking-widest' : 'text-green-600'],
                ].map(([label, val, border, color]) => {
                  if (isEndfieldTheme) {
                    return (
                      <div key={label} className="bg-[#0a0a0c] p-6 border border-[#FF6A00]/20 cursor-pointer hover:bg-[#FF6A00]/5 transition-colors font-mono clip-corner-br group relative"
                           onMouseMove={handleCardMouseMove}
                           onMouseLeave={handleCardMouseLeave}
                           onClick={() => { if(label.includes('已完成')) setShowCompletedModal(true); }}>
                        <div className={`absolute top-0 left-0 w-full h-[2px] ${color.includes('red') ? 'bg-red-500' : 'bg-[#FF6A00]'} opacity-50`}></div>
                        <h3 className="text-stone-500 text-[10px] tracking-widest">{label.replace('活跃学生', 'ACTIVE_OPR').replace('紧急', 'CRITICAL').replace('注意', 'WARNING').replace('已完成任务(活跃)', 'COMPLETED_TASKS')}</h3>
                        <p className={`text-4xl font-black mt-3 ${color.includes('red') ? 'text-red-500' : 'text-white'}`}>{val}</p>
                        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] text-[#FF6A00]">/ VIEW /</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={label} className={`bg-[#FAF8F5] p-5 rounded-lg border border-[#E5DEC9] border-t-4 ${border} shadow-sm cursor-pointer hover:shadow-md transition-shadow font-serif tech-tilt-card`} 
                         onMouseMove={handleCardMouseMove}
                         onMouseLeave={handleCardMouseLeave}
                         onClick={() => { if(label.includes('已完成')) setShowCompletedModal(true); }}>
                      <h3 className="text-slate-500 text-xs font-medium">{label}</h3>
                      <p className={`text-3xl font-bold mt-2 ${color}`}>{val}</p>
                    </div>
                  );
                })}
              </div>}

              {!dataFolderPath && !cloudSession && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center"><AlertTriangle className="w-5 h-5 text-[#C68A4C] mr-3 flex-shrink-0"/>
                    <div><p className="font-semibold text-amber-800 text-sm font-serif">演示模式：数据未持久化</p>
                      <p className="text-amber-600 text-xs mt-0.5">当前显示的是测试数据，关闭程序后将丢失。请配置存储文件夹以保存真实数据。</p>
                    </div>
                  </div>
                  <button onClick={() => setShowDataModal(true)} className="flex items-center text-sm bg-[#C68A4C] hover:bg-[#A97138] text-white px-3 py-1.5 rounded-lg ml-4 flex-shrink-0 font-serif">
                    <FolderOpen className="w-4 h-4 mr-1"/> 配置存档
                  </button>
                </div>
              )}

              {isMobileBrowser && (
                <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-[#E5DEC9] bg-[#FAF8F5] p-2 text-[11px] text-slate-600 shadow-sm" aria-label="预警摘要">
                  <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1.5 text-blue-700">学生 {activeStudents.length}</span>
                  <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1.5 font-semibold text-red-600">紧急 {activeAlerts.filter(a=>a.type==='critical').length}</span>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1.5 text-amber-700">注意 {activeAlerts.filter(a=>a.type==='warning').length}</span>
                  <button onClick={() => setShowCompletedModal(true)} className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1.5 text-emerald-700">已完成 {activeCompletedItems.length}</button>
                </div>
              )}

              <div className={`${isEndfieldTheme ? 'bg-transparent border-t border-[#FF6A00]/20 pt-8' : 'bg-[#FAF8F5] rounded-lg shadow-sm border border-[#E5DEC9]'}`}>
                <div className={`${isMobileBrowser ? 'bg-[#FAF8F5] p-3 border-b border-[#E5DEC9] flex items-start justify-between gap-2' : (isEndfieldTheme ? 'px-2 py-4 flex items-center justify-between' : 'bg-[#FAF8F5] px-6 py-4 border-b border-[#E5DEC9] flex items-center justify-between')}`}>
                  <div className={`flex items-center ${isMobileBrowser ? 'min-w-0 flex-1 gap-2 flex-wrap' : 'gap-3'}`}>
                    {!isMobileBrowser && <AlertCircle className={`w-5 h-5 ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-slate-700'}`}/>} 
                    <h3 className={`font-semibold ${isMobileBrowser ? 'text-base' : ''} ${isEndfieldTheme ? 'text-white font-mono tracking-widest text-lg' : 'text-slate-800 font-serif'}`}>
                      {isEndfieldTheme ? 'ALERT_MONITOR_SYS' : `复合智能预警中心 (${activeSeasonConfig.name})`}
                    </h3>
                    {(ignoredAlerts.size) > 0 && (
                      <button onClick={handleRestoreAlerts} className={`text-xs flex items-center border px-2 py-1 rounded font-serif transition-colors ${
                        isEndfieldTheme 
                          ? 'text-[#FF6A00] hover:text-white border-[#FF6A00]/50 bg-stone-900 font-mono tracking-wider' 
                          : 'text-slate-500 hover:text-[#C68A4C] border-[#E5DEC9] bg-[#FAF8F5]'
                      }`}>
                        重置忽略项({ignoredAlerts.size})
                      </button>
                    )}
                  </div>
                  <button aria-label="预警规则设置" title="预警规则设置" onClick={() => setShowSettingsModal(true)} className={`text-sm flex items-center justify-center ${isMobileBrowser ? 'h-9 w-9 shrink-0 p-0' : 'px-3 py-1.5'} ${isEndfieldTheme ? 'border border-[#FF6A00]/30 text-[#FF6A00] font-mono clip-corner-br hover:bg-[#FF6A00]/10 tracking-wider' : 'text-slate-600 hover:text-[#C68A4C] border border-[#E5DEC9] bg-[#FAF8F5] rounded shadow-sm font-serif'}`}>
                    {isMobileBrowser ? <Settings className="h-4 w-4"/> : (isEndfieldTheme ? '/ SYS_RULE_CONF' : '预警规则设置')}
                  </button>
                </div>
                <div className={isEndfieldTheme ? "mt-4 border-t border-[#FF6A00]/20 pt-4" : "divide-y divide-[#E5DEC9]/50"}>
                  {activeAlerts.length === 0 ? (
                    <p className={`p-10 text-center flex flex-col items-center ${isEndfieldTheme ? 'text-stone-500 font-mono tracking-widest' : 'text-slate-400 font-serif'}`}>
                      <CheckCircle2 className={`w-10 h-10 mb-2 ${isEndfieldTheme ? 'text-[#FF6A00] opacity-50' : 'text-[#C68A4C]'}`}/>
                      {isEndfieldTheme ? 'NO_CRITICAL_ALERTS' : '该申请季下暂无紧急预警事件'}
                    </p>
                  ) : activeAlerts.map(a => (
                    <React.Fragment key={a.id}>
                      {renderAlertCard(a, false)}
                    </React.Fragment>
                  ))}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'gantt' && !selectedStudentForDocsId && !selectedStudentForGanttId && isMobileBrowser && (
            <div className="space-y-3 mobile-gantt-cards">
              <div className="mobile-gantt-summary rounded-xl border border-[#E5DEC9] bg-[#FAF8F5] p-3 shadow-sm"><div className="flex items-center gap-2"><h2 className="shrink-0 whitespace-nowrap font-bold text-base font-serif text-slate-800">申请季时间轴</h2><HelpButton onClick={() => setShowMobileGanttHelp(true)} label="查看时间轴操作说明"/><span className="mobile-gantt-season-name ml-auto truncate text-[11px] text-slate-500">{activeSeasonConfig.name}</span></div><div className="mt-2 flex items-center justify-between text-[11px] text-slate-500" aria-label="申请季月份范围"><span data-testid="mobile-gantt-start-month">{mobileGanttScale.startLabel}</span><span className={`flex items-center gap-1 font-bold ${mobileGanttScale.todayInRange ? 'text-red-500' : 'text-slate-400'}`} aria-label={`今天 ${mobileGanttScale.todayLabel}，${mobileGanttScale.todayRelation}`}><i className={`inline-block h-3 w-0.5 ${mobileGanttScale.todayInRange ? 'bg-red-500' : 'bg-slate-300'}`}/>今天 {mobileGanttScale.todayLabel}{!mobileGanttScale.todayInRange && ` · ${mobileGanttScale.todayRelation}`}</span><span data-testid="mobile-gantt-end-month">{mobileGanttScale.endLabel}</span></div></div>
              <HelpDialog open={showMobileGanttHelp} onClose={() => setShowMobileGanttHelp(false)} title="时间轴操作" label="时间轴操作说明"><p>卡片按整个申请季等比例显示申请窗口、签证窗口和截止点。点击学生卡片可查看每个专业的日期明细。</p></HelpDialog>
              {activeStudents.length === 0 ? <div className="rounded-xl border border-[#E5DEC9] bg-white py-16 text-center text-sm text-slate-400">当前申请季暂无学生</div> : activeStudents.map(stu => {
                const [windowStart, windowEnd] = getStudentAppWindow(stu);
                const startPos = Math.max(0, getPos(windowStart));
                const endPos = windowEnd ? Math.max(startPos, getPos(windowEnd)) : startPos;
                const hasVisa = stu.visaWindow?.[0] && stu.visaWindow?.[1];
                const visaStart = hasVisa ? Math.max(0, getPos(stu.visaWindow[0])) : 0;
                const visaEnd = hasVisa ? Math.max(visaStart, getPos(stu.visaWindow[1])) : 0;
                return <button key={stu.id} onClick={() => setSelectedStudentForGanttId(stu?.id || null)} className="w-full text-left rounded-xl border border-[#E5DEC9] bg-white p-4 shadow-sm active:scale-[0.99] transition-transform">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-base text-slate-800">{stu.name}</h3><p className="text-xs text-slate-500 mt-0.5">{(stu.applications || []).length} 个申请专业</p></div><span className={`px-2 py-1 rounded-full text-[10px] ${isTerminalStudent(stu) ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-[#A97138]'}`}>{stu.status}</span></div>
                  <div className="mt-4 relative h-12 rounded-lg border border-[#E5DEC9] bg-[#FAF8F5] overflow-hidden"><div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-200"/><div className="absolute top-3 h-4 rounded-full bg-[#C68A4C] shadow-sm" style={{left:`${startPos}%`,width:`${Math.max(2,endPos-startPos)}%`}}/>{hasVisa && <div className="absolute bottom-1.5 h-1.5 rounded-full bg-teal-400" style={{left:`${visaStart}%`,width:`${Math.max(2,visaEnd-visaStart)}%`}}/>}{stu.applications.flatMap(app => (app.notes || []).filter(note => note.deadline).map(note => {
                    const alertId = `${stu.id}-${app.id}-note-${note.id}`;
                    return <MobileGanttMilestone key={`${app.id}-${note.id}`} completedAlerts={completedAlerts} alertId={alertId} terminal={isTerminalStudent(stu) || isTerminalApplication(app)} noteCompleted={note.isCompleted} label={note.text || '备注'} className="absolute top-2 w-2.5 h-2.5" style={{left:`calc(${Math.max(0,getPos(note.deadline))}% - 5px)`}}/>;
                  }))}{mobileGanttScale.todayInRange && <span data-mobile-gantt-today-line="true" aria-label={`今天 ${mobileGanttScale.todayLabel}`} className="absolute inset-y-0 z-20 w-0.5 bg-red-500/80 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]" style={{left:`${mobileGanttScale.todayPosition}%`}}/>}</div>
                  <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500"><span><i className="inline-block w-3 h-1.5 rounded bg-[#C68A4C] mr-1"/>申请窗口</span>{hasVisa && <span><i className="inline-block w-3 h-1.5 rounded bg-teal-400 mr-1"/>签证窗口</span>}<span className="ml-auto text-[#C68A4C] font-bold">查看明细 ›</span></div>
                </button>;
              })}
            </div>
          )}

          {activeTab === 'gantt' && !selectedStudentForDocsId && !selectedStudentForGanttId && !isMobileBrowser && (
            <div className={isEndfieldTheme ? "bg-[#0a0a0c] border border-[#FF6A00]/20 p-6 clip-corner-tl relative" : "bg-[#FAF8F5] rounded-lg shadow-sm border border-[#E5DEC9] p-6"}>
              {isEndfieldTheme && <div className="absolute top-0 left-0 w-[40%] h-[2px] bg-[#FF6A00]/50"></div>}
              <div className={`flex items-center gap-6 mb-6 text-xs ${isEndfieldTheme ? 'font-mono text-stone-400 tracking-widest' : 'text-slate-500'}`}>
                <span className="flex items-center gap-2"><span className={`w-3 h-3 ${isEndfieldTheme ? 'bg-[#FF6A00]' : 'rounded-full bg-[#C68A4C]'} inline-block`}/> {isEndfieldTheme ? 'DEADLINE (PENDING)' : '备注截止日（圆=待处理）'}</span>
                <span className="flex items-center gap-2"><span className={`w-3 h-3 inline-block ${isEndfieldTheme ? 'bg-stone-600' : 'bg-slate-400'}`} style={{borderRadius: isEndfieldTheme ? '0' : '2px'}}/> {isEndfieldTheme ? 'DEADLINE (RESOLVED)' : '备注截止日（方=已完成）'}</span>
                <span className="flex items-center gap-2 ml-4"><span className={`w-4 h-1.5 inline-block ${isEndfieldTheme ? 'bg-cyan-500' : 'rounded-full bg-teal-400'}`}/> {isEndfieldTheme ? 'VISA_WINDOW_SECURE' : '签证安全窗口期'}</span>
              </div>
              {renderGanttHeader()}
              <div className="relative">
                {renderTodayLine('12rem')}
                {activeStudents.length === 0 ? <p className={`text-center py-16 ${isEndfieldTheme ? 'font-mono text-stone-600' : 'text-slate-400 font-serif'}`}>{isEndfieldTheme ? 'NO_DATA_AVAILABLE' : '当前申请季暂无学生'}</p> : (
                  <div className="space-y-4">
                    {activeStudents.map(stu => {
                      const [ws, we] = getStudentAppWindow(stu);
                      const left = getPos(ws), width = we ? getPos(we) - left : 0;
                      const hasVisa = stu.visaWindow && stu.visaWindow[0] && stu.visaWindow[1];
                      const visaL = hasVisa ? getPos(stu.visaWindow[0]) : -100;
                      const visaW = hasVisa ? (getPos(stu.visaWindow[1]) - visaL) : 0;
                      return (
                        <div key={stu.id} className={`flex items-center text-sm cursor-pointer group p-2 ${isEndfieldTheme ? 'hover:bg-[#FF6A00]/10 border-b border-[#FF6A00]/10 transition-colors' : ''}`} onClick={() => setSelectedStudentForGanttId(stu?.id || null)}>
                          <div className="w-48 flex-shrink-0 pr-4">
                            <p className={`font-bold transition-colors ${isEndfieldTheme ? 'text-white group-hover:text-[#FF6A00] font-mono text-lg' : 'text-slate-800 group-hover:text-[#C68A4C] font-serif'}`}>{stu.name}</p>
                            <p className={`text-xs ${isEndfieldTheme ? 'text-cyan-500 font-mono tracking-widest' : 'text-slate-400 font-serif'}`}>{(stu.applications || []).length} {isEndfieldTheme ? 'MODULES' : '个项目'}</p>
                          </div>
                          <div className={`flex-1 relative h-10 ${isEndfieldTheme ? 'border-b border-[#FF6A00]/20' : 'bg-[#FAF8F5] rounded-lg border border-[#E5DEC9]'}`}>
                            {/* App Window */}
                            {ws && width > 0 && <div className={`absolute top-2 h-4 shadow-sm opacity-80 ${isEndfieldTheme ? 'bg-[#FF6A00]' : 'rounded-full bg-[#C68A4C]'}`} style={{ left: `${Math.max(0,left)}%`, width: `${Math.max(0,width)}%` }}/>}
                            {/* Visa Window (Global Overview) */}
                            {visaW > 0 && <div className={`absolute bottom-1 h-1.5 shadow-sm opacity-80 ${isEndfieldTheme ? 'bg-cyan-500' : 'rounded-full bg-teal-400'}`} style={{ left: `${Math.max(0,visaL)}%`, width: `${Math.max(0,visaW)}%` }}/>}
                            {/* Notes/Dots */}
                            {stu.applications.map(app => (
                              <React.Fragment key={app.id}>
                                {app.notes?.map(note =>
                                  note.deadline ? renderDot(note.deadline, isEndfieldTheme ? 'bg-[#FF6A00]' : 'bg-[#C68A4C]', note.text, `dot-${app.id}-${note.id}`, `${stu.id}-${app.id}-note-${note.id}`, undefined, isTerminalStudent(stu) || isTerminalApplication(app)) : null
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'gantt' && selectedStudentForGantt && isMobileBrowser && (
            <div className="space-y-3 mobile-gantt-detail">
              <div className="rounded-xl border border-[#E5DEC9] bg-[#FAF8F5] p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-lg text-slate-800">{selectedStudentForGantt.name}</h2><p className="text-xs text-slate-500 mt-1">专业申请时间明细 · {activeSeasonConfig.name}</p></div>{selectedStudentForGantt.applications.some(app => isTerminalApplication(app)) && <button onClick={() => setHideCompletedApps(value => !value)} className="px-2.5 py-1.5 rounded-lg border border-[#E5DEC9] text-xs text-slate-600">{hideCompletedApps ? '显示终态' : '隐藏终态'}</button>}</div><div className="mt-3 flex items-center justify-between text-[11px] text-slate-500"><span>{mobileGanttScale.startLabel}</span><span className={`flex items-center gap-1 font-bold ${mobileGanttScale.todayInRange ? 'text-red-500' : 'text-slate-400'}`}><i className={`inline-block h-3 w-0.5 ${mobileGanttScale.todayInRange ? 'bg-red-500' : 'bg-slate-300'}`}/>今天 {mobileGanttScale.todayLabel}</span><span>{mobileGanttScale.endLabel}</span></div></div>
              {(hideCompletedApps ? selectedStudentForGantt.applications.filter(app => !isTerminalApplication(app)) : selectedStudentForGantt.applications).map(app => {
                const startPos = Math.max(0, getPos(app.openDate));
                const endPos = Math.max(startPos, getPos(app.deadline));
                const terminal = isTerminalStudent(selectedStudentForGantt) || isTerminalApplication(app);
                return <button key={app.id} onClick={() => handleJumpToApp(selectedStudentForGantt, `app-card-${app.id}`)} className="w-full text-left rounded-xl border border-[#E5DEC9] bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-bold text-base text-slate-800 break-words">{app.school}</h3><p className="text-sm text-slate-500 mt-0.5 break-words">{app.program}</p></div><div className="flex flex-col items-end gap-1"><span className="px-2 py-0.5 rounded text-[10px] bg-amber-50 text-[#A97138]">{app.tier}</span><span className={`px-2 py-0.5 rounded text-[10px] ${terminal ? 'bg-slate-100 text-slate-600' : 'bg-sky-50 text-sky-700'}`}>{app.status}</span></div></div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-[#FAF8F5] border border-[#E5DEC9] p-2"><p className="text-[10px] text-slate-400">开放日期</p><p className="mt-1 font-semibold text-slate-700">{app.openDate || '未设置'}</p></div><div className="rounded-lg bg-[#FAF8F5] border border-[#E5DEC9] p-2"><p className="text-[10px] text-slate-400">截止日期</p><p className="mt-1 font-semibold text-slate-700">{app.deadline || '未设置'}</p></div></div>
                  <div className="mt-3 relative h-10 rounded-lg border border-[#E5DEC9] bg-[#FAF8F5] overflow-hidden"><div data-mobile-gantt-application-bar="true" className={`absolute top-3 h-4 ${getMobileGanttApplicationBarClass(terminal)}`} style={{left:`${startPos}%`,width:`${Math.max(2,endPos-startPos)}%`}}/>{(app.notes || []).filter(note => note.deadline).map(note => {
                    const alertId = `${selectedStudentForGantt.id}-${app.id}-note-${note.id}`;
                    return <MobileGanttMilestone key={note.id} completedAlerts={completedAlerts} alertId={alertId} terminal={terminal} noteCompleted={note.isCompleted} label={note.text || '备注'} className="absolute top-2.5 w-3 h-3" style={{left:`calc(${Math.max(0,getPos(note.deadline))}% - 6px)`}}/>;
                  })}{mobileGanttScale.todayInRange && <span data-mobile-gantt-today-line="true" aria-label={`今天 ${mobileGanttScale.todayLabel}`} className="absolute inset-y-0 z-20 w-0.5 bg-red-500/80 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]" style={{left:`${mobileGanttScale.todayPosition}%`}}/>}</div>
                  {(app.notes || []).filter(note => note.deadline).length > 0 && <div className="mt-3 space-y-1">{app.notes.filter(note => note.deadline).map(note => <p key={note.id} className="text-[11px] text-slate-500 flex justify-between gap-2"><span className="truncate">• {note.text || '备注'}</span><time className="shrink-0">{note.deadline}</time></p>)}</div>}
                  <p className="mt-3 text-right text-xs font-bold text-[#C68A4C]">进入专业档案 ›</p>
                </button>;
              })}
              {selectedStudentForGantt.visaWindow?.[0] && selectedStudentForGantt.visaWindow?.[1] && <div className="rounded-xl border border-teal-200 bg-teal-50 p-4"><h3 className="font-bold text-teal-800">签证办理安全窗口</h3><p className="text-xs text-teal-700 mt-1">{selectedStudentForGantt.visaWindow[0]} — {selectedStudentForGantt.visaWindow[1]}</p></div>}
            </div>
          )}

          {activeTab === 'gantt' && selectedStudentForGantt && !isMobileBrowser && (
            <div className="bg-[#FAF8F5] rounded-lg shadow-sm border border-[#E5DEC9] p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-full bg-blue-500 inline-block opacity-80"/> 申请期间</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-full bg-[#C68A4C] inline-block opacity-80"/> 备注截止日</span>
                  {selectedStudentForGantt.visaWindow?.[0] && <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-teal-400 inline-block opacity-80"/> 签证窗口</span>}
                </div>
                {/* 已完成专业计数 + 切换按钮 */}
                {(() => {
                  const completedAppsCount = selectedStudentForGantt.applications.filter(a => ['已录取','已拒绝','已取消'].includes(a.status)).length;
                  return completedAppsCount > 0 ? (
                    <button
                      onClick={() => setHideCompletedApps(v => !v)}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        hideCompletedApps
                          ? (isEndfieldTheme ? 'bg-[#FF6A00]/10 border-[#FF6A00]/50 text-[#FF6A00] font-mono' : 'bg-[#FAF8F5] border-[#C68A4C] text-[#C68A4C] font-serif')
                          : (isEndfieldTheme ? 'bg-[#0a0a0c] border-[#FF6A00]/20 text-stone-500 font-mono hover:bg-[#FF6A00]/5' : 'bg-[#FAF8F5] border-[#E5DEC9] text-slate-600 hover:bg-[#F3EFE6] font-serif')
                      }`}
                    >
                      {hideCompletedApps ? (
                        <>显示已完成 ({completedAppsCount})</>
                      ) : (
                        <>隐藏已完成 ({completedAppsCount})</>
                      )}
                    </button>
                  ) : null;
                })()}
              </div>
              {renderGanttHeader(true)}
              <div className="relative space-y-3">
                {renderTodayLine('16rem')}
                {(hideCompletedApps
                  ? selectedStudentForGantt.applications.filter(a => !['已录取','已拒绝','已取消'].includes(a.status))
                  : selectedStudentForGantt.applications
                ).map(app => {
                  const left = getPos(app.openDate), width = getPos(app.deadline) - left;
                  return (
                    <div key={app.id} className={`flex items-center text-sm relative group rounded-lg p-1.5 border cursor-pointer transition-colors ${isEndfieldTheme ? 'bg-stone-900/50 hover:bg-[#FF6A00]/10 border-[#FF6A00]/10 hover:border-[#FF6A00]/40' : 'bg-[#FAF8F5] hover:bg-[#F3EFE6]/55 border-[#E5DEC9] hover:border-[#C68A4C]'}`} onClick={() => handleJumpToApp(selectedStudentForGantt, `app-card-${app.id}`)}>
                      <div className="w-64 pr-6 flex-shrink-0 z-20">
                        <span className={`font-bold ${isEndfieldTheme ? 'text-white font-mono' : 'text-slate-800 font-serif'}`}>{app.school}</span>
                        <span className={`text-xs ml-2 ${isEndfieldTheme ? 'text-cyan-500 font-mono' : 'text-slate-500 font-serif'}`}>{app.program}</span>
                        <div className="flex gap-1 mt-0.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isEndfieldTheme ? (app.tier==='冲刺档'?'bg-red-900/40 text-red-500':app.tier==='稳妥档'?'bg-orange-900/40 text-[#FF6A00]':'bg-cyan-900/40 text-cyan-500') : (app.tier==='冲刺档'?'bg-red-100 text-red-600':app.tier==='稳妥档'?'bg-amber-100 text-[#C68A4C]':'bg-green-100 text-green-600')}`}>{isEndfieldTheme ? app.tier.replace('档','_LVL') : app.tier}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isEndfieldTheme ? 'bg-stone-800 text-stone-300' : 'bg-slate-100 text-slate-600'}`}>{app.status}</span>
                        </div>
                      </div>
                      <div className={`flex-1 relative h-8 rounded-lg ${isEndfieldTheme ? 'border-b border-stone-800/50' : 'bg-[#FAF8F5] border border-[#E5DEC9]'}`}>
                        {width > 0 && <div className={`absolute top-2 h-4 shadow-sm opacity-80 ${isEndfieldTheme ? 'bg-cyan-500' : 'rounded-full bg-[#C68A4C]'}`} style={{ left: `${Math.max(0,left)}%`, width: `${Math.max(0,width)}%` }}/>}
                        {app.notes?.map(note =>
                          note.deadline ? renderDot(note.deadline, 'bg-[#C68A4C]', note.text, `dot-${app.id}-${note.id}`, `${selectedStudentForGantt.id}-${app.id}-note-${note.id}`, undefined, isTerminalStudent(selectedStudentForGantt) || isTerminalApplication(app)) : null
                        )}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setEditingApp(app); setAppFormNotes(app.notes||[]); setEditingAppStudentId(selectedStudentForGantt.id); setShowAppModal(true); }} className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 text-[#C68A4C] hover:bg-[#FAF8F5] p-2 rounded-lg border border-[#C68A4C] shadow-sm z-30 bg-[#FAF8F5]">
                        <Edit className="w-4 h-4"/>
                      </button>
                    </div>
                  );
                })}
                {selectedStudentForGantt.visaWindow && selectedStudentForGantt.visaWindow[0] && selectedStudentForGantt.visaWindow[1] && (
                  <div className="flex items-center text-sm relative bg-[#FAF8F5] rounded-lg p-1.5 mt-6 pt-6 border-t border-dashed border-[#E5DEC9]">
                    <div className="w-64 pr-6 flex-shrink-0 z-20"><span className="font-bold text-orange-800 font-serif">签证办理安全窗口</span></div>
                    <div className="flex-1 relative h-8 bg-[#FAF8F5] rounded-lg border border-[#E5DEC9]">
                      {(() => { const vl = getPos(selectedStudentForGantt.visaWindow[0]); const vw = getPos(selectedStudentForGantt.visaWindow[1]) - vl; return vw > 0 && <div className="absolute top-2 h-4 rounded-full bg-teal-400 shadow-sm opacity-80" style={{ left: `${Math.max(0,vl)}%`, width: `${Math.max(0,vw)}%` }}/>; })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'students' && !selectedStudentForDocsId && !selectedStudentForGanttId && (
            <div className={isMobileBrowser ? 'mobile-student-library' : 'bg-[#FAF8F5] rounded-lg shadow-sm border border-[#E5DEC9]'}>
              {unassignedStudents.length > 0 && (
                <div className={`${isMobileBrowser ? 'mb-3 p-2.5' : 'mx-4 mt-4 p-3'} rounded-lg border border-amber-300 bg-amber-50 text-amber-900 flex items-center justify-between gap-3 text-sm`}>
                  <span>发现 {unassignedStudents.length} 名未归属申请季的学生。它们不会在普通申请季列表中显示。</span>
                  <button onClick={recoverUnassignedStudents} className="shrink-0 px-3 py-1.5 rounded bg-[#C68A4C] text-white hover:bg-[#A97138]">归入当前申请季</button>
                </div>
              )}
              <div className={`flex justify-between ${isMobileBrowser ? 'flex-col items-stretch gap-2 pb-3' : 'items-center p-4 border-b border-[#E5DEC9] bg-[#FAF8F5]'}`}>
                <div className={`flex min-w-0 items-center ${isMobileBrowser ? 'gap-2' : 'gap-4'}`}>
                  <h3 className={`min-w-0 font-semibold text-slate-700 font-serif ${isMobileBrowser ? 'flex-1 truncate text-sm' : ''}`}>{showArchived ? '已归档库' : '活跃学生档案'} ({activeSeasonConfig.name})</h3>
                  <button onClick={() => setShowArchived(!showArchived)} className={`${isMobileBrowser ? 'shrink-0 whitespace-nowrap px-2.5 py-1 text-xs' : 'text-sm px-3 py-1.5'} rounded-full border border-[#E5DEC9] text-slate-600 hover:bg-[#F3EFE6] font-serif`}>{showArchived ? '返回活跃区' : (isMobileBrowser ? '归档/结案' : '查看归档/结案区')}</button>
                </div>
                <button onClick={() => { setEditingStudent(null); setShowStudentModal(true); }} className={`flex items-center justify-center text-sm bg-[#C68A4C] hover:bg-[#A97138] text-white px-3 py-2 rounded-lg font-serif ${isMobileBrowser ? 'w-full' : ''}`}><Plus className="w-4 h-4 mr-1"/> 录入新档案</button>
              </div>
              {isMobileBrowser ? (
                <div className="space-y-2.5 mobile-student-cards">
                  {displayStudents.length === 0 && <div className="rounded-xl border border-[#E5DEC9] bg-white py-16 px-4 text-center text-slate-400 text-sm font-serif">{showArchived ? '暂无已归档学生' : '暂无学生档案，点击上方“录入新档案”开始'}</div>}
                  {displayStudents.map(stu => (
                    <article key={stu.id} className={`rounded-xl border border-[#E5DEC9] bg-white p-3 shadow-sm ${stu.status === '已归档' ? 'opacity-65' : ''}`}>
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="font-bold text-lg text-slate-800 font-serif truncate">{stu.name}</h4></div><span className="shrink-0 px-2 py-1 rounded-md text-xs bg-violet-50 text-violet-700 border border-violet-200">{(stu.applications || []).length} 个专业</span></div>
                      <div className="mt-2.5 space-y-1.5 rounded-lg bg-[#F7F3EB] px-2.5 py-2 text-xs text-slate-700">
                        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto_minmax(0,1fr)] items-center gap-1"><span className="whitespace-nowrap text-[10px] text-slate-400">学术地区</span><span className="truncate font-medium">{stu.precedingSchoolLocation || stu.region || '未填写'}</span><span className="text-slate-400">→</span><span className="whitespace-nowrap text-[10px] text-slate-400">目标地区</span><span className="truncate font-medium">{stu.applicationRegion || '未填写'}</span></div>
                        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto_minmax(0,1fr)] items-center gap-1"><span className="whitespace-nowrap text-[10px] text-slate-400">学术状态</span><span className="truncate font-medium">{studentStageParts(stu).source || '未填写'}</span><span className="text-slate-400">→</span><span className="whitespace-nowrap text-[10px] text-slate-400">目标状态</span><span className="truncate font-medium">{studentStageParts(stu).target || '未填写'}</span></div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">学生状态</span>{stu.status === '已归档' ? <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-200 text-slate-600">已归档</span> : <CustomSelect value={stu.status} onChange={(e) => handleInlineUpdateStudentStatus(stu.id, e.target.value)} options={['备考备料中', '材料收集', '申请提交中', '等待结果', '有录取·选校中', '已确认录取', '签证准备', '签证审批中', '已结案', '已结单', '全部被拒']} isEndfieldTheme={false} customButtonClass="text-xs font-semibold px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-[#A97138] flex items-center gap-2" />}</div>
                      <div className="mobile-student-card-actions mt-3 grid grid-cols-4 gap-1.5">
                        <button onClick={() => setInlineConfirmModal({ title: '永久删除档案', message: `确定永久删除“${stu.name}”及其全部专业、材料和记录吗？此操作无法撤销。`, dangerous: true, confirmLabel: '永久删除', onConfirm: () => handleDeleteStudent(stu.id) })} className="min-h-10 whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-1 text-[11px] font-semibold text-red-600">删除</button>
                        <button onClick={() => { setEditingStudent(stu); setShowStudentModal(true); }} className="min-h-10 whitespace-nowrap rounded-lg border border-[#E5DEC9] bg-[#FAF8F5] px-1 text-[11px] text-slate-600">编辑资料</button>
                        <button onClick={() => handleArchiveToggle(stu.id, stu.status)} className="min-h-10 whitespace-nowrap rounded-lg border border-[#E5DEC9] bg-[#FAF8F5] px-1 text-[11px] text-slate-600">{stu.status === '已归档' ? '恢复档案' : '手动归档'}</button>
                        <button onClick={() => openStudentDocs(stu?.id || null)} className="min-h-10 whitespace-nowrap rounded-lg bg-[#C68A4C] px-1 text-[11px] font-bold text-white">进入档案</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
              <table className="w-full text-left">
                <thead className="bg-[#FAF8F5] border-b border-[#E5DEC9] text-sm font-semibold text-slate-600 font-serif"><tr><th className="p-4">姓名</th><th className="p-4">地区</th><th className="p-4">阶段</th><th className="p-4">专业数</th><th className="p-4">状态</th><th className="p-4 text-center">操作</th></tr></thead>
                <tbody className="divide-y divide-[#E5DEC9]/50">
                  {displayStudents.length === 0 && <tr><td colSpan={6} className="text-center py-16 text-slate-400 font-serif">{showArchived ? '暂无已归档学生' : '暂无学生档案，点击右上角录入'}</td></tr>}
                  {displayStudents.map(stu => (
                    <tr key={stu.id} className={`hover:bg-[#F3EFE6]/55 ${stu.status==='已归档'?'opacity-60':''}`}>
                      <td className="p-4 font-bold text-slate-800 font-serif whitespace-nowrap">{stu.name}</td>
                      <td className="p-4 text-sm text-slate-600 font-serif whitespace-nowrap">
                        {stu.precedingSchoolLocation || stu.region || ''} → {stu.applicationRegion || ''}
                      </td>
                      <td className="p-4 text-sm text-slate-600 font-serif whitespace-nowrap">
                        {formatStudentStagePath(stu, '')}
                      </td>
                      <td className="p-4 text-sm text-slate-600 font-serif">{(stu.applications || []).length} 个</td>
                      <td className="p-4">
                        {stu.status === '已归档' ? (
                          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-200 text-slate-600 font-serif">已归档</span>
                        ) : (
                          <CustomSelect 
                              value={stu.status} 
                              onChange={(e) => handleInlineUpdateStudentStatus(stu.id, e.target.value)}
                              options={['备考备料中', '材料收集', '申请提交中', '等待结果', '有录取·选校中', '已确认录取', '签证准备', '签证审批中', '已结案', '已结单', '全部被拒']}
                              isEndfieldTheme={isEndfieldTheme}
                              customButtonClass={`text-xs font-semibold px-2 py-1 rounded-md border cursor-pointer outline-none transition-colors flex items-center justify-between gap-1 ${isEndfieldTheme ? 'font-mono bg-[#0a0a0c] text-[#FF6A00] border-[#FF6A00]/50 hover:bg-[#FF6A00]/10' : 'font-serif ' + ({ '备考备料中':'bg-violet-100 text-violet-700 border-violet-200', '材料收集':'bg-amber-100 text-[#C68A4C] border-amber-200', '申请提交中':'bg-amber-100 text-[#C68A4C] border-amber-200', '等待结果':'bg-sky-100 text-sky-700 border-sky-200', '有录取·选校中':'bg-emerald-100 text-emerald-700 border-emerald-200', '已确认录取':'bg-green-100 text-green-700 border-green-300', '签证准备':'bg-orange-100 text-orange-700 border-orange-300', '签证审批中':'bg-amber-200 text-amber-800 border-amber-400', '已结单':'bg-slate-200 text-slate-600 border-slate-300', '已结案':'bg-slate-200 text-slate-600 border-slate-300', '全部被拒':'bg-red-100 text-red-700 border-red-200', '已归档':'bg-slate-200 text-slate-600 border-slate-300' }[stu.status] || 'bg-amber-100 text-[#C68A4C] border-[#E5DEC9]')}`}
                            />
                        )}
                      </td>
                      <td className="p-4 flex items-center justify-center space-x-3">
                        <button onClick={() => openStudentDocs(stu?.id || null)} className="text-[#C68A4C] hover:text-[#A97138] font-medium text-sm hover:underline font-serif">处理档案</button>
                        <span className="text-slate-300">|</span>
                        <button onClick={() => { setEditingStudent(stu); setShowStudentModal(true); }} title="编辑"><Edit className="w-4 h-4 text-slate-400 hover:text-[#C68A4C]"/></button>
                        <button onClick={() => handleArchiveToggle(stu.id, stu.status)} title="归档/恢复">{stu.status==='已归档'?<RotateCcw className="w-4 h-4 text-slate-400 hover:text-[#C68A4C]"/>:<Archive className="w-4 h-4 text-slate-400 hover:text-[#C68A4C]"/>}</button>
                        {deletingStudentConfirmId === stu.id ? (
                          <button
                            data-confirm-zone="true"
                            onClick={() => { handleDeleteStudent(stu.id); setDeletingStudentConfirmId(null); }}
                            title="点击确认删除"
                            className="text-[10px] text-red-600 bg-red-50 border border-red-400 rounded px-1 py-0.5 font-semibold hover:bg-red-100 animate-fade-in"
                          >确认删除？</button>
                        ) : (
                          <button
                            data-confirm-zone="true"
                            onClick={() => setDeletingStudentConfirmId(stu.id)}
                            title="删除"
                          ><Trash2 className="w-4 h-4 text-slate-300 hover:text-red-500"/></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          )}

          {selectedStudentForDocs && activeTab === 'students' && (
            <div className={`${isMobileBrowser ? 'space-y-3' : 'space-y-6'} mobile-student-detail`}>
              <HelpDialog open={showPortalCredentialsHelp} onClose={() => setShowPortalCredentialsHelp(false)} title="账号密码档案说明" label="账号密码档案说明"><p>{readOnlyViewer ? '规划老师可查看账号密码档案，但不能修改或保存任何字段。' : '点击账号密码档案中的任一字段即可直接修改；移开焦点后会按当前账号的数据保存规则写入。'}</p></HelpDialog>
              <HelpDialog open={showDocumentLibraryHelp} onClose={() => setShowDocumentLibraryHelp(false)} title="材料库操作说明" label="材料库操作说明">{readOnlyViewer ? <p>规划老师可查看材料分类及当前完成状态，但拖动、勾选和预设应用都不会保存。</p> : <ul className="space-y-2"><li>• 未分类材料可拖动到对应的标准分类。</li><li>• 勾选状态会联动预警仪表盘和日历中的材料提醒。</li><li>• 材料预设可通过“智能合并”只补充当前学生缺少的项目。</li></ul>}</HelpDialog>
              <HelpDialog open={showActivityLogHelp} onClose={() => setShowActivityLogHelp(false)} title="操作日志说明" label="操作日志说明"><p>学生档案中的有效修改、状态变更、材料流转和已完成预警都会自动保存在这里。</p></HelpDialog>
              <div className={isMobileBrowser ? "mobile-detail-profile bg-[#FAF8F5] rounded-lg border border-[#E5DEC9] p-4 shadow-sm space-y-4" : (isEndfieldTheme ? "border-b border-[#FF6A00]/20 pb-6 flex justify-between items-end" : "bg-[#FAF8F5] rounded-lg border border-[#E5DEC9] p-6 flex justify-between items-start shadow-sm")}>
                <div>
                  <h2 className={`flex items-center ${isMobileBrowser ? 'flex-wrap gap-2 text-xl font-bold text-slate-800 font-serif' : (isEndfieldTheme ? 'text-4xl font-black text-white font-mono tracking-widest' : 'text-2xl font-bold text-slate-800 font-serif')}`}>
                    {selectedStudentForDocs.name}
                    {isEndfieldTheme ? (
                      <span className={`ml-4 text-[10px] font-mono px-3 py-1 ${selectedStudentForDocs.status==='已归档' ? 'bg-stone-800 text-stone-500 border border-stone-700 clip-corner-br' : 'bg-[#FF6A00]/10 text-[#FF6A00] border border-[#FF6A00]/30 clip-corner-br'}`}>STATUS // {selectedStudentForDocs.status}</span>
                    ) : (
                      <span className={`${isMobileBrowser ? '' : 'ml-3'} text-sm font-semibold px-2.5 py-1 rounded-md font-serif ${selectedStudentForDocs.status==='已归档'?'bg-slate-200 text-slate-600':'bg-amber-100 text-[#C68A4C]'}`}>{selectedStudentForDocs.status}</span>
                    )}
                  </h2>
                  <p className={`mt-3 text-sm flex ${isMobileBrowser ? 'flex-col items-start gap-1.5' : 'items-center gap-4'} ${isEndfieldTheme ? 'text-cyan-500 font-mono tracking-widest' : 'text-slate-500 font-serif'}`}>
                    <span>{selectedStudentForDocs.precedingSchoolLocation || selectedStudentForDocs.region || ''} {isEndfieldTheme ? '//' : '→'} {selectedStudentForDocs.applicationRegion || ''}</span>
                    {!isMobileBrowser && <span>{isEndfieldTheme ? '::' : '|'}</span>}
                    <span>{formatStudentStagePath(selectedStudentForDocs, '', isEndfieldTheme ? ' // ' : ' → ')}</span>
                    {selectedStudentForDocs.visaWindow?.[0] && selectedStudentForDocs.visaWindow?.[1] && (
                      <>{!isMobileBrowser && <span>{isEndfieldTheme ? '::' : '|'}</span>}<span>{isEndfieldTheme ? 'VISA_WIN:' : '签证窗口:'} {selectedStudentForDocs.visaWindow[0].split('T')[0]} TO {selectedStudentForDocs.visaWindow[1].split('T')[0]}</span></>
                    )}
                  </p>
                </div>
                {!readOnlyViewer && <button onClick={() => { setEditingStudent(selectedStudentForDocs); setShowStudentModal(true); }} className={isMobileBrowser ? "w-full justify-center text-[#C68A4C] flex items-center text-sm border border-[#E5DEC9] px-3 py-2.5 rounded-lg bg-white font-serif" : (isEndfieldTheme ? "px-4 py-2 border border-[#FF6A00]/30 text-[#FF6A00] text-xs hover:bg-[#FF6A00]/20 font-mono tracking-widest clip-corner-br transition-colors" : "text-[#C68A4C] hover:text-[#A97138] flex items-center text-sm border border-[#E5DEC9] px-3 py-1.5 rounded-lg hover:bg-[#F3EFE6] font-serif")}>
                  {isEndfieldTheme ? '[ EDIT_PROFILE ]' : <><Edit className="w-4 h-4 mr-1"/> 修改基本资料</>}
                </button>}
              </div>

              <div className={`${isMobileBrowser ? 'mobile-detail-shell' : ''} ${isEndfieldTheme ? "mt-8" : "bg-[#FAF8F5] rounded-lg border border-[#E5DEC9] shadow-sm"}`}>
                <div className={isMobileBrowser ? "mobile-detail-header p-4 border-b border-[#E5DEC9] flex flex-col gap-3 bg-[#FAF8F5] rounded-t-lg" : (isEndfieldTheme ? "flex justify-between items-end mb-6" : "p-4 border-b border-[#E5DEC9] flex justify-between items-center bg-[#FAF8F5] rounded-t-lg")}>
                  <h3 className={`font-semibold flex items-center ${isEndfieldTheme ? 'text-white font-mono tracking-widest text-lg' : 'text-slate-800 font-serif'}`}>
                    {isEndfieldTheme ? <span className="text-[#FF6A00] mr-3">// OPR_MODULES</span> : <CalendarDays className="w-5 h-5 mr-2 text-[#C68A4C]"/>} 
                    {isEndfieldTheme ? '申请项目跟进总控' : '申请项目跟进台 & 账号密码库'}
                  </h3>
                  {!readOnlyViewer && <button onClick={() => { setEditingApp({ id: 'APP' + Date.now(), school: '', program: '', tier: '稳妥档', portal: {}, specificDocs: [], notes: [] }); setAppFormNotes([]); setEditingAppStudentId(selectedStudentForDocsId); setShowAppModal(true); }} className={isMobileBrowser ? "w-full justify-center flex items-center text-sm bg-[#C68A4C] text-white px-3 py-2.5 rounded-lg font-serif" : (isEndfieldTheme ? "px-4 py-1.5 border border-cyan-900/40 text-cyan-500 text-xs hover:bg-cyan-900/20 font-mono tracking-widest clip-corner-br" : "flex items-center text-sm bg-[#C68A4C] hover:bg-[#A97138] text-white px-3 py-1.5 rounded-lg font-serif")}>
                    {isEndfieldTheme ? '[ ADD_MODULE ]' : <><Plus className="w-4 h-4 mr-1"/> 添加专业</>}
                  </button>}
                </div>
                <div className={`${isMobileBrowser ? 'mobile-detail-body' : ''} ${isEndfieldTheme ? "" : (isMobileBrowser ? "p-3" : "p-6")}`}>
                  {selectedStudentForDocs.applications.length === 0 ? <div className={`text-center py-10 font-mono ${isEndfieldTheme ? 'text-stone-600 border border-stone-800' : 'text-slate-400 bg-[#FAF8F5] rounded-lg border border-dashed border-[#E5DEC9]'}`}> {isEndfieldTheme ? 'NO_MODULES_DETECTED' : '点击右上角为学生添加申请专业'} </div> : (
                    <div className="space-y-4">
                      {selectedStudentForDocs.applications.map(app => {
                        const appStatusColors = { '收集中':'bg-amber-50 text-[#C68A4C] border-[#E5DEC9]', '已递交':'bg-teal-50 text-teal-700 border-teal-200', '待补件':'bg-orange-100 text-orange-700 border-orange-300', '已录取':'bg-green-100 text-green-700 border-green-300', '已拒绝':'bg-red-100 text-red-600 border-red-200', '已取消':'bg-slate-100 text-slate-500 border-slate-300' };
                        return (
                          <div id={`app-card-${app.id}`} key={app.id}
                            onMouseMove={handleCardMouseMove}
                            onMouseLeave={handleCardMouseLeave}
                            className={isEndfieldTheme 
                              ? `relative border border-[#FF6A00]/20 bg-[#0a0a0c] p-6 transition-all duration-300 clip-corner-tl group hover:border-[#FF6A00]/50` 
                              : `border rounded-lg ${isMobileBrowser ? 'p-3' : 'p-5'} transition-all duration-700 shadow-sm tech-tilt-card ${highlightTargetId===`app-card-${app.id}`?'border-[#C68A4C] bg-[#FAF8F5]':app.status==='待补件'?'bg-orange-50/30 border-orange-200':'bg-[#FAF8F5] border-[#E5DEC9] hover:border-[#C68A4C]'}`
                            }>
                            {isEndfieldTheme && <div className="absolute top-0 left-0 w-[40%] h-[2px] bg-[#FF6A00]/50"></div>}
                            <div className={`flex justify-between items-start ${isMobileBrowser ? 'flex-col gap-3' : ''}`}>
                              <div className={`flex-1 ${isMobileBrowser ? 'w-full min-w-0' : 'pr-6'}`}>
                                <div className="flex items-center flex-wrap gap-x-3 gap-y-2">
                                  <div className={`flex gap-2 ${isMobileBrowser ? 'flex-col items-start min-w-0' : 'items-end'}`}>
                                    <span className={isEndfieldTheme ? 'text-2xl font-black tracking-widest leading-none' : 'font-serif text-xl font-bold text-slate-800 leading-none'}>{app.school}</span>
                                    <span className={isEndfieldTheme ? 'text-cyan-500 text-lg leading-none' : 'text-slate-500 font-normal text-base font-serif leading-none'}>{isEndfieldTheme ? '//' : '-'} {app.program}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={isEndfieldTheme ? 'text-[11px] text-[#C68A4C] border border-[#C68A4C]/30 px-2 py-0.5 clip-corner-br' : 'text-[11px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded border font-serif'}>{app.tier}</span>
                                    <CustomSelect 
                                      value={app.status} 
                                      onChange={(e) => handleInlineUpdateApp(app.id, 'status', e.target.value)}
                                      options={['收集中', '已递交', '待补件', '已录取', '已拒绝', '已取消']}
                                      isEndfieldTheme={isEndfieldTheme}
                                      customButtonClass={`text-[11px] font-bold px-2 py-0.5 rounded-md border cursor-pointer outline-none transition-colors inline-flex items-center gap-1 ${isEndfieldTheme ? 'font-mono bg-[#0a0a0c] text-[#FF6A00] border-[#FF6A00]/50 hover:bg-[#FF6A00]/10' : 'font-serif ' + (appStatusColors[app.status] || 'bg-slate-100 text-slate-600 border-slate-300')}`}
                                    />
                                  </div>
                                </div>
                                {/* === 日期行（点击即可修改）=== */}
                                <div className={`mt-4 flex ${isMobileBrowser ? 'flex-col items-stretch gap-3' : 'gap-6 items-center flex-wrap'} ${isEndfieldTheme ? 'font-mono text-xs' : 'text-sm text-slate-600'}`}>
                                  <label className="flex items-center gap-2 min-w-0">
                                    <strong className={isEndfieldTheme ? 'text-stone-500 shrink-0' : 'text-slate-500 shrink-0'}>{isEndfieldTheme ? 'OPEN_DATE:' : '开放日:'}</strong>
                                    <InlineDateInput initialValue={app.openDate} onSave={(val) => handleInlineUpdateApp(app.id, 'openDate', val)} className={`border-0 border-b border-dashed bg-transparent cursor-pointer focus:outline-none transition-colors ${isMobileBrowser ? 'flex-1 min-w-0 w-auto' : 'w-40'} ${isEndfieldTheme ? 'border-stone-700 text-stone-300 hover:border-[#FF6A00] focus:border-[#FF6A00]' : 'border-slate-300 text-slate-700 text-sm hover:border-[#C68A4C] focus:border-[#C68A4C]'}`} />
                                  </label>
                                  <label className="flex items-center gap-2 min-w-0">
                                    <strong className={isEndfieldTheme ? 'text-[#FF6A00] shrink-0' : 'text-red-500 shrink-0'}>{isEndfieldTheme ? 'DDL_DATE:' : '截止DDL:'}</strong>
                                    <InlineDateInput initialValue={app.deadline} onSave={(val) => handleInlineUpdateApp(app.id, 'deadline', val)} className={`border-0 border-b border-dashed bg-transparent font-medium cursor-pointer focus:outline-none transition-colors ${isMobileBrowser ? 'flex-1 min-w-0 w-auto' : 'w-40'} ${isEndfieldTheme ? 'border-[#FF6A00]/50 text-[#FF6A00] hover:border-[#FF6A00] focus:border-[#FF6A00]' : 'border-red-300 text-red-700 text-sm hover:border-red-500 focus:border-red-600'}`} />
                                  </label>
                                </div>

                                {/* === 账号密码档案（点击字段即可直接修改）=== */}
                                <div className={`mt-6 ${isMobileBrowser ? 'mobile-app-subsection' : ''} ${isEndfieldTheme ? 'text-xs border border-stone-800 p-4 font-mono relative' : 'text-xs bg-[#FAF8F5] border border-[#E5DEC9] rounded-lg p-3'}`}>
                                  {isEndfieldTheme && <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#FF6A00]"></div>}
                                  {isEndfieldTheme && <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#FF6A00]"></div>}
                                  
                                  <div className="flex items-center mb-3">
                                    <Lock className={`w-3.5 h-3.5 mr-1.5 flex-shrink-0 ${isEndfieldTheme ? 'text-stone-500' : 'text-[#C68A4C]'}`}/>
                                    <span className={`font-bold text-[11px] uppercase tracking-wide ${isEndfieldTheme ? 'text-white' : 'text-[#C68A4C] font-serif'}`}>{isEndfieldTheme ? 'PORTAL_CREDENTIALS' : '账号密码档案'}</span>
                                    <HelpButton onClick={() => setShowPortalCredentialsHelp(true)} label="查看账号密码档案说明" className="ml-2"/>
                                  </div>
                                  <div className={`grid ${isMobileBrowser ? 'grid-cols-1 gap-y-3' : 'grid-cols-2 gap-y-3 gap-x-6'}`}>
                                    {[
                                      { icon: <Mail className={`w-3.5 h-3.5 shrink-0 ${isEndfieldTheme ? 'text-stone-600' : 'text-slate-400'}`}/>, label: isEndfieldTheme ? 'REG_EMAIL' : '注册邮箱', field: 'email', cls: isEndfieldTheme ? 'text-cyan-500' : 'text-slate-800' },
                                      { icon: <KeyRound className={`w-3.5 h-3.5 shrink-0 ${isEndfieldTheme ? 'text-stone-600' : 'text-slate-400'}`}/>, label: isEndfieldTheme ? 'EMAIL_PWD' : '邮箱密码', field: 'emailPwd', cls: isEndfieldTheme ? 'text-stone-300' : 'text-slate-700' },
                                      { icon: <Lock className={`w-3.5 h-3.5 shrink-0 ${isEndfieldTheme ? 'text-stone-600' : 'text-slate-400'}`}/>, label: isEndfieldTheme ? 'PORTAL_ID' : '网申账号', field: 'account', cls: isEndfieldTheme ? 'text-cyan-500 font-bold' : 'text-slate-800 font-bold' },
                                      { icon: <KeyRound className={`w-3.5 h-3.5 shrink-0 ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-[#C68A4C]'}`}/>, label: isEndfieldTheme ? 'PORTAL_PWD' : '网申密码', field: 'password', cls: isEndfieldTheme ? 'text-[#FF6A00] font-bold' : 'text-[#C68A4C] font-bold' },
                                      { icon: <FileText className={`w-3.5 h-3.5 shrink-0 ${isEndfieldTheme ? 'text-stone-600' : 'text-slate-400'}`}/>, label: 'APP_ID', field: 'appId', cls: isEndfieldTheme ? 'text-[#FF6A00] font-bold' : 'text-[#C68A4C] font-mono font-bold' },
                                      { icon: <ShieldAlert className={`w-3.5 h-3.5 shrink-0 ${isEndfieldTheme ? 'text-stone-600' : 'text-slate-400'}`}/>, label: isEndfieldTheme ? 'SECURITY_QA' : '密保Q&A', field: 'securityQA', cls: isEndfieldTheme ? 'text-stone-400' : 'text-amber-900' },
                                    ].map(({ icon, label, field, cls }) => (
                                      <span key={field} className="flex items-center gap-2 min-w-0">
                                        {icon}
                                        <span className={`shrink-0 ${isEndfieldTheme ? 'text-stone-500' : 'text-slate-400'}`}>{label}:</span>
                                        <InlineInput
                                          type={field === 'password' || field === 'emailPwd' ? 'password' : 'text'}
                                          initialValue={(app.portal && app.portal[field]) || ''}
                                          onSave={(val) => handleInlineUpdatePortal(app.id, field, val)}
                                          readOnly={readOnlyViewer}
                                          placeholder={isEndfieldTheme ? 'NULL' : '—'}
                                          className={`flex-1 min-w-0 bg-transparent border-0 border-b border-dashed border-transparent focus:border-[#FF6A00] hover:border-stone-600 outline-none transition-colors ${cls} ${isEndfieldTheme ? 'text-[11px]' : 'text-xs hover:border-[#C68A4C]'}`}
                                        />
                                    </span>
                                    ))}
                                  </div>
                                </div>

                                {/* === 备注（直接在卡片中增删改完成）=== */}
                                <div className={`mt-4 ${isMobileBrowser ? 'mobile-app-subsection' : ''} ${isEndfieldTheme ? 'border border-[#FF6A00]/20 bg-black/40 p-4 relative font-mono' : 'bg-[#FAF8F5] rounded-lg p-3 border border-[#E5DEC9]'}`}>
                                  {isEndfieldTheme && <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#FF6A00]"></div>}
                                  <div className="flex justify-between items-center mb-3">
                                    <h4 className={`text-xs font-bold flex items-center tracking-widest ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-amber-800'}`}>
                                      {isEndfieldTheme ? <span className="mr-2">// NOTES_LOG</span> : <Calendar className="w-3.5 h-3.5 mr-1.5"/>}
                                      {isEndfieldTheme ? '附加备注' : '备注'}
                                    </h4>
                                    <button onClick={() => handleInlineAddNote(app.id)}
                                      className={`text-xs flex items-center font-medium transition-colors ${isEndfieldTheme ? 'px-3 py-1 border border-[#FF6A00]/30 text-[#FF6A00] bg-transparent hover:bg-[#FF6A00]/10 clip-corner-br' : 'text-amber-700 hover:text-amber-900 bg-[#FAF8F5] border border-[#E5DEC9] px-2 py-1 rounded-md shadow-sm hover:bg-[#F3EFE6]'}`}>
                                      <Plus className="w-3 h-3 mr-1"/> {isEndfieldTheme ? 'ADD_ENTRY' : '新增备注'}
                                    </button>
                                  </div>
                                  {app.notes && app.notes.length > 0 ? (
                                    <div className="space-y-1.5">
                                      {app.notes.map(note => {
                                        const alertId = `${selectedStudentForDocs.id}-${app.id}-note-${note.id}`;
                                        const isCompleted = !!completedAlerts[alertId];
                                        return (
                                          <div
                                            key={note.id}
                                            data-mobile-application-note={isMobileBrowser ? 'true' : undefined}
                                            className={`${isMobileBrowser ? 'grid grid-cols-[22px_minmax(0,1fr)_28px] items-start gap-x-2 gap-y-1 p-1.5' : 'flex items-start gap-3 p-2'} group transition-colors min-w-0 ${isCompleted ? (isEndfieldTheme ? "opacity-30" : "opacity-60") : (isEndfieldTheme ? "hover:bg-[#FF6A00]/5 border-b border-[#FF6A00]/10" : "hover:bg-[#F3EFE6] rounded-lg")}`}
                                          >
                                            <button
                                              onClick={() => handleCompleteAlert({ id: alertId, title: "备注: " + note.text, type: "info", student: selectedStudentForDocs.name, studentId: selectedStudentForDocs.id, appId: app.id, message: "已从档案库手动完成" })}
                                              className={`w-5 h-5 ${isMobileBrowser ? 'mt-0' : 'mt-0.5'} rounded border flex-shrink-0 flex items-center justify-center cursor-pointer transition-all ${isCompleted ? (isEndfieldTheme ? 'bg-[#FF6A00] border-[#FF6A00] text-black' : 'bg-green-500 border-green-500 rounded') : (isEndfieldTheme ? 'bg-transparent border border-[#FF6A00]/50 hover:bg-[#FF6A00]' : 'border-amber-400 hover:border-green-500 hover:bg-green-50 bg-white rounded')}`}
                                              title={isCompleted ? '点击取消完成' : '点击标记完成'}>
                                              {isCompleted && <Check className={`w-3 h-3 ${isEndfieldTheme ? 'text-black' : 'text-white'}`}/>}
                                            </button>
                                            <div className="min-w-0 flex-1">
                                              <InlineInput
                                                type="text"
                                                initialValue={note.text}
                                                onSave={(val) => handleCommitUpdateNote(app.id, note.id, val, undefined)}
                                                placeholder={isEndfieldTheme ? "INPUT_TEXT..." : "输入备注内容..."}
                                                readOnly={readOnlyViewer || isCompleted}
                                                wrapText={true}
                                                className={`${isMobileBrowser ? 'w-full max-h-[2.1rem] overflow-hidden break-all [overflow-wrap:anywhere] text-[12px] leading-[1.35]' : 'flex-1 text-sm'} bg-transparent outline-none border-0 border-b border-dashed transition-colors ${isCompleted ? 'text-slate-400 line-through border-transparent cursor-default' : (isEndfieldTheme ? 'text-stone-300 border-stone-700 hover:border-[#FF6A00] focus:border-[#FF6A00]' : 'text-slate-800 border-amber-200 hover:border-[#C68A4C] focus:border-[#C68A4C]')}`}
                                              />
                                            </div>
                                            <button onClick={() => { if (window.confirm(`确定删除备注“${note.text || '空白备注'}”吗？删除后无法撤销。`)) handleInlineRemoveNote(app.id, note.id); }}
                                              className={`${isMobileBrowser ? 'col-start-3 row-start-1 opacity-100 p-1' : 'order-4 opacity-0 group-hover:opacity-100 p-1 mt-0.5'} transition-opacity ${isEndfieldTheme ? 'text-stone-600 hover:text-red-500' : 'text-slate-300 hover:text-red-500 rounded'}`} title="删除该备注">
                                              <Trash2 className="w-3.5 h-3.5"/>
                                            </button>
                                            <div className={isMobileBrowser ? 'col-start-2 col-span-2 row-start-2 min-w-0' : 'order-3'}>
                                              <InlineDateInput 
                                                initialValue={note.deadline}
                                                onSave={(val) => handleCommitUpdateNote(app.id, note.id, undefined, val)}
                                                optional
                                                ariaLabel={`${note.text || '备注'}提醒时间`}
                                                className={isEndfieldTheme 
                                                  ? `${isMobileBrowser ? 'w-full min-w-0 h-8 px-1 text-[11px]' : 'w-40 mt-1 text-xs'} border-0 border-b border-dashed bg-transparent ${isCompleted ? 'text-stone-600 border-transparent' : 'text-red-500 border-red-500/50 focus:border-red-500 hover:border-red-500'}`
                                                  : `${isMobileBrowser ? 'w-full min-w-0 h-8 px-2 py-1 text-[11px]' : 'w-44 mt-1 p-1 text-xs'} border rounded ${isCompleted ? 'text-slate-400 bg-slate-50 border-transparent' : 'border-[#E5DEC9] bg-white/70'}`
                                                }
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className={`text-xs italic py-2 ${isEndfieldTheme ? 'text-stone-600' : 'text-amber-500'}`}>{isEndfieldTheme ? 'NO_ENTRIES_FOUND' : '暂无备注，点击「新增备注」添加'}</p>
                                  )}
                                </div>

                                {/* === 专属材料 === */}
                                <div className={`mt-4 ${isEndfieldTheme ? 'border border-[#FF6A00]/20 bg-black/40 p-4 relative font-mono' : 'bg-[#FAF8F5] rounded-lg p-3 border border-[#E5DEC9]'}`}>
                                  {isEndfieldTheme && <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#FF6A00]"></div>}
                                  <h4 className={`text-xs font-bold mb-3 tracking-widest ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-[#C68A4C] font-serif'}`}>
                                    {isEndfieldTheme ? '// SPECIFIC_DOCS_REQ' : '专业专属特殊材料'}
                                  </h4>
                                  {app.specificDocs?.length > 0 && (
                                    <ul className="space-y-1.5 mb-2">
                                      {app.specificDocs.map(doc => (
                                        <li key={doc.id} className="text-sm text-slate-700 flex items-center group min-h-[28px]">
                                          <div onClick={() => toggleSpecificDoc(app.id, doc.id)} className={`w-4 h-4 mr-2 rounded border flex items-center justify-center cursor-pointer flex-shrink-0 ${doc.checked?'bg-[#C68A4C] border-[#C68A4C]':'bg-white border-slate-300 hover:border-[#C68A4C]'}`}>{doc.checked && <Check className="w-3 h-3 text-white"/>}</div>
                                          <InlineInput
                                            type="text"
                                            initialValue={doc.label}
                                            onSave={(val) => handleInlineUpdateSpecificDoc(app.id, doc.id, val)}
                                            placeholder="输入材料名称..."
                                            readOnly={readOnlyViewer || doc.checked}
                                            className={`flex-1 text-sm bg-transparent outline-none border-0 border-b border-dashed transition-colors ${
                                              doc.checked 
                                                ? 'text-slate-400 line-through border-transparent cursor-default' 
                                                : 'text-slate-700 font-medium border-[#E5DEC9] hover:border-[#C68A4C] focus:border-[#C68A4C]'
                                            }`}
                                          />
                                          <button onClick={() => { if (window.confirm(`确定删除专业材料“${doc.label}”吗？`)) removeSpecificDoc(app.id, doc.id); }} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                                            <Trash2 className="w-3.5 h-3.5"/>
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  {addingSpecificDocToApp === app.id ? (
                                    <div className={`flex items-center gap-2 p-1.5 shadow-sm mt-2 ${isEndfieldTheme ? 'bg-black/60 border border-[#FF6A00]/50' : 'bg-[#FAF8F5] rounded-lg border border-[#E5DEC9]'}`}>
                                      <input autoFocus type="text" value={newSpecificDocLabel} onChange={e=>setNewSpecificDocLabel(e.target.value)} placeholder={isEndfieldTheme ? 'DOC_TYPE...' : '如: 作品集/Writing Sample...'} className={`flex-1 text-sm border-none focus:ring-0 px-2 bg-transparent outline-none ${isEndfieldTheme ? 'text-white' : ''}`} onKeyDown={e=>{if(e.key==='Enter')confirmAddSpecificDoc(app.id);if(e.key==='Escape')setAddingSpecificDocToApp(null)}}/>
                                      <button onClick={() => confirmAddSpecificDoc(app.id)} className={`p-1 flex items-center justify-center ${isEndfieldTheme ? 'text-[#0a0a0c] bg-[#FF6A00] hover:bg-orange-500' : 'text-white bg-green-500 rounded'}`}><Check className="w-3.5 h-3.5"/></button>
                                      <button onClick={() => setAddingSpecificDocToApp(null)} className={`p-1 flex items-center justify-center ${isEndfieldTheme ? 'text-stone-400 bg-stone-800 hover:text-white' : 'text-slate-500 hover:bg-slate-200 rounded'}`}><X className="w-3.5 h-3.5"/></button>
                                    </div>
                                  ) : (
                                    <button onClick={() => { setAddingSpecificDocToApp(app.id); setNewSpecificDocLabel(''); }} className={`text-xs mt-3 flex items-center font-medium transition-colors ${isEndfieldTheme ? 'text-[#FF6A00] hover:text-white bg-transparent hover:bg-[#FF6A00]/20 px-3 py-1.5 border border-[#FF6A00]/30 clip-corner-br' : 'text-[#C68A4C] hover:text-[#A97138] hover:underline'}`}><Plus className="w-3.5 h-3.5 mr-1"/> {isEndfieldTheme ? 'ADD_DOC_REQ' : '添加该专业专属材料'}</button>
                                  )}
                                </div>
                              </div>

                              {/* === 右侧操作按钮 === */}
                              {!readOnlyViewer && <div className={`flex gap-2 flex-shrink-0 ${isMobileBrowser ? 'w-full flex-row flex-wrap border-t border-[#E5DEC9] pt-3' : 'flex-col border-l border-[#E5DEC9] pl-4 ml-4'}`}>
                                <button onClick={() => { setEditingApp(app); setAppFormNotes(app.notes||[]); setEditingAppStudentId(selectedStudentForDocsId); setShowAppModal(true); }} className="text-slate-500 hover:text-[#C68A4C] p-2 bg-[#FAF8F5] border border-[#E5DEC9] rounded-lg flex items-center justify-center gap-1 text-xs font-medium" title="编辑院校/专业/档位等信息"><Edit className="w-4 h-4"/>编辑项目</button>
                                <button onClick={() => handleAddProgramToSchool(app)} className="text-slate-500 hover:text-green-700 p-2 bg-[#FAF8F5] border border-[#E5DEC9] rounded-lg flex items-center justify-center gap-1 text-xs font-medium" title="申同校其他专业"><Plus className="w-4 h-4"/>申同校其他</button>
                                {deletingAppConfirmId === app.id ? (
                                   <button
                                     data-confirm-zone="true"
                                     onClick={() => { handleDeleteApp(selectedStudentForDocsId, app.id); setDeletingAppConfirmId(null); }}
                                     className="text-red-600 bg-red-50 border border-red-400 rounded-lg p-2 flex items-center justify-center gap-1 text-xs font-semibold hover:bg-red-100 animate-fade-in"
                                     title="点击确认删除"
                                   >确认删除？</button>
                                 ) : (
                                   <button
                                     data-confirm-zone="true"
                                     onClick={() => setDeletingAppConfirmId(app.id)}
                                     className="text-slate-500 hover:text-red-500 p-2 bg-[#FAF8F5] border border-[#E5DEC9] rounded-lg flex items-center justify-center gap-1 text-xs font-medium"
                                     title="删除"
                                   ><Trash2 className="w-4 h-4"/>删除</button>
                                 )}
                              </div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className={`bg-[#FAF8F5] rounded-lg border border-[#E5DEC9] shadow-sm ${isMobileBrowser ? 'mobile-detail-shell' : ''}`}>
                <div className={`bg-[#FAF8F5] border-b border-[#E5DEC9] flex items-center justify-between rounded-t-lg ${isMobileBrowser ? 'mobile-detail-header px-3 py-3 flex-wrap gap-2' : 'px-6 py-4'}`}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <CheckCircle2 className="w-5 h-5 mr-2 text-[#C68A4C]"/>
                    <h3 className="min-w-0 font-semibold text-slate-800 font-serif">全局动态材料库</h3>
                    <HelpButton onClick={() => setShowDocumentLibraryHelp(true)} label="查看材料库操作说明"/>
                  </div>
                  {!readOnlyViewer && <button 
                    onClick={() => setShowPresetManagerModal(true)}
                    className={`text-xs text-[#C68A4C] hover:text-[#A97138] border border-[#E5DEC9] px-2.5 py-1.5 rounded-lg hover:bg-[#F3EFE6] transition-colors flex items-center gap-1 font-serif whitespace-nowrap ${isMobileBrowser ? 'ml-auto' : ''}`}
                    type="button"
                  >
                    <Settings className="w-3.5 h-3.5"/>
                    材料预设管理
                  </button>}
                </div>
                <div className={`${isMobileBrowser ? 'mobile-detail-body p-3 space-y-3' : 'p-6 space-y-6'}`} id="generic-docs-section">
                  {[
                    {key:'info', title:'📋 信息收集表类', color:'blue'},
                    {key:'basic', title:'🪪 个人基础材料类', color:'amber'},
                    {key:'academic', title:'🎓 学术公证类', color:'green'},
                    {key:'writing', title:'✍️ 教务文书类', color:'purple'},
                    {key:'unclassified', title:'未分类材料', color:'red'},
                  ].map(block => {
                    const isDragOver = dragOverBlockKey === block.key;
                    const borderColor = isDragOver 
                      ? 'border-[#C68A4C] bg-[#C68A4C]/5 scale-[1.01]' 
                      : (highlightTargetId === 'generic-docs-section' ? 'border-[#C68A4C]' : 'border-[#E5DEC9]');
                    return (
                    <div
                      key={block.key}
                      onDragEnter={() => setDragOverBlockKey(block.key)}
                      onDragLeave={() => setDragOverBlockKey(null)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        setDragOverBlockKey(null);
                        const docId = e.dataTransfer.getData('docId');
                        const fromCat = e.dataTransfer.getData('fromCategory');
                        if (docId && fromCat) {
                          handleDropDoc(docId, fromCat, block.key);
                        }
                      }}
                      className={`bg-[#FAF8F5] p-4 rounded-lg border transition-all duration-200 ${isMobileBrowser ? 'mobile-material-category' : ''} ${borderColor}`}
                    >
                      <h4 className="font-bold text-slate-700 mb-3 border-b border-[#E5DEC9] pb-2 font-serif text-sm">{block.title}</h4>
                      <div className="space-y-1.5">
                        {(selectedStudentForDocs.docs[block.key] || []).map(doc => (
                          <div
                            key={doc.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('docId', doc.id);
                              e.dataTransfer.setData('fromCategory', block.key);
                              handleDragStartWithGhost(e, doc.label, 'custom');
                            }}
                            onDragOver={(e) => { e.preventDefault(); setDragOverDocId(doc.id); }}
                            onDragLeave={(e) => {
                              // Only clear if leaving to an element outside this item
                              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                                setDragOverDocId(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragOverDocId(null);
                              const sourceId = e.dataTransfer.getData('docId');
                              const fromCat = e.dataTransfer.getData('fromCategory');
                              if (sourceId && fromCat === block.key && sourceId !== doc.id) {
                                handleReorderStudentDoc(block.key, sourceId, doc.id);
                              } else if (sourceId && fromCat && fromCat !== block.key) {
                                handleDropDoc(sourceId, fromCat, block.key);
                              }
                            }}
                            className={`flex items-center gap-2 group p-1.5 hover:bg-[#F3EFE6]/55 rounded-lg border cursor-grab active:cursor-grabbing ${dragOverDocId === doc.id ? 'border-[#C68A4C] shadow-sm' : 'border-transparent hover:border-[#E5DEC9]'}`}
                          >
                            <div onMouseDown={(e) => e.stopPropagation()} onClick={() => toggleDoc(block.key, doc.id)} className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer flex-shrink-0 ${doc.checked?'bg-[#C68A4C] border-[#C68A4C]':'bg-white border-slate-300 hover:border-[#C68A4C]'}`}>{doc.checked && <Check className="w-4 h-4 text-white"/>}</div>
                            <InlineInput
                              type="text"
                              initialValue={doc.label}
                              onSave={(val) => {
                                if (!val || !val.trim()) return;
                                setStudents(prev => prev.map(stu => {
                                  if (stu.id !== selectedStudentForDocsId) return stu;
                                  return { ...stu, docs: { ...stu.docs, [block.key]: (stu.docs[block.key]||[]).map(d => d.id === doc.id ? { ...d, label: val.trim() } : d) } };
                                }));
                              }}
                              readOnly={readOnlyViewer || doc.checked}
                              placeholder="材料名称"
                              className={`flex-1 text-sm bg-transparent outline-none border-0 border-b border-dashed transition-colors min-w-0 ${
                                doc.checked
                                  ? 'text-slate-400 line-through border-transparent cursor-default'
                                  : 'text-slate-700 font-medium border-[#E5DEC9] hover:border-[#C68A4C] focus:border-[#C68A4C]'
                              }`}
                            />
                            <button onMouseDown={(e) => e.stopPropagation()} onClick={() => { if (window.confirm(`确定删除材料“${doc.label}”吗？`)) removeDoc(block.key, doc.id); }} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0"><Trash2 className="w-4 h-4"/></button>
                          </div>
                        ))}
                        {addingDocCategory === block.key ? (
                          <div className="flex items-center gap-2 mt-2 bg-white p-1 rounded-lg border border-[#E5DEC9] shadow-sm">
                            <input autoFocus type="text" value={newDocLabel} onChange={e=>setNewDocLabel(e.target.value)} placeholder="输入材料名称..." className="flex-1 text-sm border-none focus:ring-0 px-2 bg-transparent" onKeyDown={e=>{if(e.key==='Enter')confirmAddDoc(block.key);if(e.key==='Escape')setAddingDocCategory(null)}}/>
                            <button onClick={() => confirmAddDoc(block.key)} className="text-white bg-green-500 rounded p-1"><Check className="w-4 h-4"/></button>
                            <button onClick={() => setAddingDocCategory(null)} className="text-slate-500 hover:bg-slate-200 rounded p-1"><X className="w-4 h-4"/></button>
                          </div>
                        ) : (
                          <button onClick={() => { setAddingDocCategory(block.key); setNewDocLabel(''); }} className="text-sm text-[#C68A4C] flex items-center mt-2 ml-2 font-medium hover:underline font-serif"><Plus className="w-4 h-4 mr-1"/> 补充材料</button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {/* 签证材料区：仅当学生设置了签证窗口时才显示 */}
                  {selectedStudentForDocs.visaWindow?.[0] && selectedStudentForDocs.visaWindow?.[1] ? (
                    <div
                      id="visa-docs-section"
                      onDragEnter={() => setDragOverBlockKey('visa')}
                      onDragLeave={() => setDragOverBlockKey(null)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        setDragOverBlockKey(null);
                        const docId = e.dataTransfer.getData('docId');
                        const fromCat = e.dataTransfer.getData('fromCategory');
                        if (docId && fromCat) {
                          handleDropDoc(docId, fromCat, 'visa');
                        }
                      }}
                      className={`bg-[#FAF8F5] border p-6 rounded-lg transition-all duration-200 ${
                        dragOverBlockKey === 'visa' 
                          ? 'border-[#C68A4C] bg-[#C68A4C]/5 scale-[1.01]' 
                          : (highlightTargetId === 'visa-docs-section' ? 'border-[#C68A4C]' : 'border-orange-200')
                      }`}
                    >
                      <h4 className="font-bold text-orange-900 mb-4 border-b border-orange-200 pb-2 font-serif">签证专区前置准备</h4>
                      <div className="grid grid-cols-2 gap-4">
                        {(selectedStudentForDocs.docs.visa || []).map(doc => (
                          <div
                            key={doc.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('docId', doc.id);
                              e.dataTransfer.setData('fromCategory', 'visa');
                              handleDragStartWithGhost(e, doc.label, 'custom');
                            }}
                            onDragOver={(e) => { e.preventDefault(); setDragOverDocId(doc.id); }}
                            onDragLeave={(e) => {
                              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                                setDragOverDocId(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragOverDocId(null);
                              const sourceId = e.dataTransfer.getData('docId');
                              const fromCat = e.dataTransfer.getData('fromCategory');
                              if (sourceId && fromCat === 'visa' && sourceId !== doc.id) {
                                handleReorderStudentDoc('visa', sourceId, doc.id);
                              } else if (sourceId && fromCat && fromCat !== 'visa') {
                                handleDropDoc(sourceId, fromCat, 'visa');
                              }
                            }}
                            className={`flex items-center gap-2 group p-1.5 hover:bg-[#F3EFE6]/55 rounded border cursor-grab active:cursor-grabbing ${dragOverDocId === doc.id ? 'border-orange-500 shadow-sm' : 'border-transparent hover:border-orange-200'}`}
                          >
                             <div onMouseDown={(e) => e.stopPropagation()} onClick={() => toggleDoc('visa', doc.id)} className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer flex-shrink-0 ${doc.checked?'bg-[#C68A4C] border-[#C68A4C]':'bg-white border-orange-300 hover:border-[#C68A4C]'}`}>{doc.checked && <Check className="w-4 h-4 text-white"/>}</div>
                             <InlineInput
                               type="text"
                               initialValue={doc.label}
                               onSave={(val) => {
                                 if (!val || !val.trim()) return;
                                 setStudents(prev => prev.map(stu => {
                                   if (stu.id !== selectedStudentForDocsId) return stu;
                                   return { ...stu, docs: { ...stu.docs, visa: (stu.docs.visa||[]).map(d => d.id === doc.id ? { ...d, label: val.trim() } : d) } };
                                 }));
                               }}
                               readOnly={doc.checked}
                               placeholder="签证材料名称"
                               className={`flex-1 text-sm bg-transparent outline-none border-0 border-b border-dashed transition-colors min-w-0 ${
                                 doc.checked
                                   ? 'text-orange-300 line-through border-transparent cursor-default'
                                   : 'text-orange-900 font-medium border-orange-200 hover:border-[#C68A4C] focus:border-[#C68A4C]'
                               }`}
                             />
                             <button onClick={() => { if (window.confirm(`确定删除签证材料“${doc.label}”吗？`)) removeDoc('visa', doc.id); }} className="text-orange-300 hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0"><Trash2 className="w-4 h-4"/></button>
                          </div>

                        ))}
                      </div>
                      {addingDocCategory === 'visa' ? (
                        <div className="flex items-center gap-2 mt-4 w-1/2 bg-white p-1 rounded border border-orange-300 shadow-sm">
                          <input autoFocus type="text" value={newDocLabel} onChange={e=>setNewDocLabel(e.target.value)} placeholder="如: TB Test/冻结证明..." className="flex-1 text-sm border-none focus:ring-0 px-2 bg-transparent" onKeyDown={e=>{if(e.key==='Enter')confirmAddDoc('visa');if(e.key==='Escape')setAddingDocCategory(null)}}/>
                          <button onClick={() => confirmAddDoc('visa')} className="text-white bg-green-500 rounded p-1"><Check className="w-4 h-4"/></button>
                          <button onClick={() => setAddingDocCategory(null)} className="text-slate-500 hover:bg-slate-200 rounded p-1"><X className="w-4 h-4"/></button>
                        </div>
                      ) : (
                        <button onClick={() => { setAddingDocCategory('visa'); setNewDocLabel(''); }} className="text-sm text-[#C68A4C] flex items-center mt-4 ml-2 font-medium hover:underline font-serif"><Plus className="w-4 h-4 mr-1"/> 添加签证要求</button>
                      )}
                    </div>
                  ) : (
                    <div data-testid="empty-visa-window" id="visa-docs-section" className={`bg-[#FAF8F5] border border-dashed border-[#E5DEC9] rounded-lg ${isMobileBrowser ? 'p-3 flex flex-col items-stretch gap-2.5' : 'p-5 flex items-center justify-between gap-4'}`}>
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="min-w-0 font-semibold text-slate-600 font-serif">未设置签证窗口（无需签证模式）</p>
                        <HelpButton onClick={() => setShowVisaWindowHelp(true)} label="查看签证窗口说明"/>
                      </div>
                      <button onClick={() => { setEditingStudent(selectedStudentForDocs); setShowStudentModal(true); }} className={`text-sm text-[#C68A4C] border border-[#E5DEC9] px-3 py-2 rounded-lg hover:bg-[#F3EFE6] flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 font-serif ${isMobileBrowser ? 'w-full justify-center bg-white' : ''}`}>
                        <Plus className="w-4 h-4"/> 设置签证窗口
                      </button>
                      <HelpDialog open={showVisaWindowHelp} onClose={() => setShowVisaWindowHelp(false)} title="签证窗口说明" label="签证窗口说明">
                        <p>适用于中外合办、纯国内项目等无出国需求的学生。签证预警、甘特图及材料区均已自动隐藏。若需出国签证，请点击“设置签证窗口”。</p>
                      </HelpDialog>
                    </div>
                  )}

                  <div className={`col-span-2 mt-8 relative ${isEndfieldTheme ? 'p-4 border border-orange-500/30 bg-[#0a0a0c]/80' : ''}`} id="recommender-matrix-section">
                    {isEndfieldTheme && <div className="absolute top-0 left-0 w-[20%] h-[2px] bg-[#FF6A00]/80"></div>}
                    <div className={`flex justify-between items-center mb-4 transition-all duration-1000 ${isEndfieldTheme ? (highlightTargetId === 'recommender-matrix-section' ? 'border-b border-orange-400 pb-2 shadow-[0_0_15px_rgba(255,106,0,0.3)]' : 'border-b border-orange-500/20 pb-2') : (highlightTargetId === 'recommender-matrix-section' ? 'bg-[#FAF8F5] border border-[#C68A4C] shadow-md p-4 rounded-lg' : 'p-4 rounded-lg bg-transparent')}`}>
                      <h3 className={`text-lg flex items-center ${isEndfieldTheme ? 'font-mono text-[#FF6A00] font-bold tracking-widest' : 'font-bold text-slate-800 font-serif'}`}>
                        {isEndfieldTheme ? <><span className="mr-3 text-orange-400/50">#</span>[ MATRIX // REC_WEB_PUSH ]</> : <><Users className="w-5 h-5 mr-2 text-[#C68A4C]"/> 推荐人</>}
                      </h3>
                      <button onClick={() => setAddingRecommender(true)} className={`text-sm flex items-center font-medium transition-colors ${isEndfieldTheme ? 'text-cyan-500 hover:text-cyan-400 font-mono tracking-widest border border-cyan-500/30 px-4 py-1.5 hover:bg-cyan-900/20 clip-corner-br' : 'bg-[#FAF8F5] text-[#C68A4C] px-3 py-1.5 rounded-lg hover:bg-[#F3EFE6] border border-[#E5DEC9] shadow-sm font-serif'}`}>
                        <Plus className="w-4 h-4 mr-1"/> {isEndfieldTheme ? 'ADD_RECOMMENDER' : '添加推荐人'}
                      </button>
                    </div>
                    
                    <div className={`${isEndfieldTheme ? 'border-t border-orange-500/20' : (isMobileBrowser ? 'mobile-recommender-list' : 'bg-[#FAF8F5] border border-[#E5DEC9] rounded-lg shadow-sm')}`}>
                      {isMobileBrowser ? (
                        <div className="space-y-3">
                          {(selectedStudentForDocs.recommenders || []).map(rec => (
                            <section key={rec.id} className="rounded-xl border border-[#E5DEC9] bg-white p-3 shadow-sm">
                              <div className="flex items-start justify-between gap-3 border-b border-[#E5DEC9] pb-3">
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-slate-800 break-words">{rec.name}</div>
                                  {rec.email && <div className="mt-0.5 text-xs text-slate-500 break-all">{rec.email}</div>}
                                  <InlineTextarea
                                    initialValue={rec.notes || ''}
                                    onSave={(newValue) => handleInlineLogRecommenderNotes(rec.id, rec.notes || '', newValue)}
                                    placeholder="备注（联系方式、偏好等）..."
                                    className="mt-2 w-full resize-none border-0 border-b border-dashed border-[#E5DEC9] bg-transparent text-xs text-slate-500 outline-none focus:border-[#C68A4C]"
                                  />
                                </div>
                                {deletingRecommenderConfirmId === rec.id ? (
                                  <button data-confirm-zone="true" onClick={() => { handleDeleteRecommender(rec.id); setDeletingRecommenderConfirmId(null); }} className="shrink-0 rounded-lg border border-red-300 bg-red-50 px-2.5 py-2 text-xs font-bold text-red-600">确认删除</button>
                                ) : (
                                  <button data-confirm-zone="true" onClick={() => setDeletingRecommenderConfirmId(rec.id)} className="shrink-0 rounded-lg border border-red-100 p-2 text-red-400" aria-label={`删除推荐人 ${rec.name}`}><Trash2 className="h-4 w-4"/></button>
                                )}
                              </div>
                              <div className="mt-3 space-y-3">
                                {selectedStudentForDocs.applications.map(app => {
                                  const recData = (app.recommendations && app.recommendations[rec.id]) ? app.recommendations[rec.id] : { status: 'none', deadline: app.deadline };
                                  return (
                                    <div key={app.id} className="border-t border-[#E5DEC9] pt-3">
                                      <div className="mb-2 min-w-0">
                                        <div className="font-semibold text-slate-800 break-words">{app.school}</div>
                                        <div className="text-xs text-slate-500 break-words">{app.program}</div>
                                      </div>
                                      <CustomSelect
                                        value={recData.status}
                                        onChange={(e) => handleUpdateRLStatus(app.id, rec.id, e.target.value)}
                                        options={[
                                          {value: 'none', label: '不需要'},
                                          {value: 'pending', label: '待发链接'},
                                          {value: 'sent', label: '已发链接'},
                                          {value: 'completed', label: '已完成'}
                                        ]}
                                        customButtonClass="flex w-full items-center justify-between rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-sm text-slate-700"
                                      />
                                      {recData.status !== 'none' && recData.status !== 'completed' && (
                                        <label className="mt-2 flex items-center gap-2 rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-xs text-slate-500">
                                          <span className="shrink-0 font-semibold">推荐信截止</span>
                                          <input type="datetime-local" value={recData.deadline?.includes('T') ? recData.deadline.slice(0,16) : (recData.deadline ? recData.deadline+'T00:00' : '')} onChange={(e) => handleUpdateRLDeadline(app.id, rec.id, e.target.value)} className="min-w-0 flex-1 bg-transparent text-right text-xs text-slate-700 outline-none"/>
                                        </label>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </section>
                          ))}
                          {(!selectedStudentForDocs.recommenders || selectedStudentForDocs.recommenders.length === 0) && (
                            <div className="rounded-lg border border-dashed border-[#E5DEC9] px-4 py-8 text-center text-sm text-slate-400">尚未添加推荐人，请点击上方按钮添加。</div>
                          )}
                        </div>
                      ) : (
                       <table className="w-full text-left text-sm">
                         <thead className={isEndfieldTheme ? 'bg-[#17181c] border-b border-orange-500/30' : 'bg-[#FAF8F5] border-b border-[#E5DEC9]'}>
                           <tr>
                             <th className={`p-3 w-56 border-r ${isEndfieldTheme ? 'font-mono text-cyan-500 border-orange-500/30 bg-[#17181c] tracking-widest' : 'font-bold text-slate-700 border-[#E5DEC9] bg-[#FAF8F5] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] font-serif'}`}>{isEndfieldTheme ? 'RECOMMENDER' : '推荐人'}</th>
                             {selectedStudentForDocs.applications.map(app => (
                               <th key={app.id} className={`p-3 min-w-40 border-r text-center ${isEndfieldTheme ? 'font-mono text-orange-400 border-orange-500/30' : 'font-bold text-slate-700 border-[#E5DEC9] font-serif'}`}>
                                 <div className={`truncate ${isEndfieldTheme ? 'text-orange-300 font-bold tracking-wider' : 'text-slate-800'}`} title={app.school}>{app.school}</div>
                                 <div className={`text-xs truncate mt-1 ${isEndfieldTheme ? 'text-stone-400 font-normal' : 'font-normal text-slate-500'}`} title={app.program}>{app.program}</div>
                               </th>
                             ))}
                           </tr>
                         </thead>
                         <tbody>
                           {(selectedStudentForDocs.recommenders || []).map(rec => (
                             <tr key={rec.id} className={`border-b transition-colors group ${isEndfieldTheme ? 'border-orange-500/10 last:border-b-0 hover:bg-[#FF6A00]/5' : 'border-[#E5DEC9]/50 last:border-b-0 hover:bg-[#F3EFE6]/55'}`}>
                               <td className={`p-3 border-r relative min-w-[160px] ${isEndfieldTheme ? 'border-orange-500/20 bg-[#0a0a0c]' : 'border-[#E5DEC9] bg-[#FAF8F5] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]'}`}>
                                 <div className={`text-[15px] ${isEndfieldTheme ? 'font-mono text-cyan-300 font-bold tracking-widest' : 'font-semibold text-slate-700 font-serif'}`}>{rec.name}</div>
                                 {rec.email && <div className={`text-xs mt-0.5 ${isEndfieldTheme ? 'font-mono text-cyan-700' : 'text-slate-500 font-serif'}`}>{rec.email}</div>}
                                 <InlineTextarea
                                    initialValue={rec.notes || ''}
                                    onSave={(newValue) => handleInlineLogRecommenderNotes(rec.id, rec.notes || '', newValue)}
                                    placeholder={isEndfieldTheme ? 'NOTES (CONTACT, PREF)...' : '备注 (联系方式、偏好等)...'}
                                   className={`w-full mt-1.5 text-xs border-0 border-b border-dashed outline-none resize-none transition-colors ${isEndfieldTheme ? 'text-stone-400 bg-transparent border-stone-700 hover:border-cyan-500 focus:border-cyan-500 placeholder:text-stone-600 font-mono' : 'text-slate-500 border-transparent hover:border-[#C68A4C] focus:border-[#C68A4C] bg-transparent placeholder:text-slate-300'}`}
                                 />
                                 {deletingRecommenderConfirmId === rec.id ? (
                                   <button 
                                     data-confirm-zone="true"
                                     onClick={() => { handleDeleteRecommender(rec.id); setDeletingRecommenderConfirmId(null); }}
                                     className={`absolute right-2 top-2 px-1.5 py-0.5 border rounded text-[10px] font-semibold animate-fade-in z-10 ${isEndfieldTheme ? 'text-red-500 bg-red-900/30 border-red-500 hover:bg-red-500 hover:text-black font-mono' : 'text-red-600 bg-red-50 border-red-400 hover:bg-red-100'}`}
                                     title="点击确认删除"
                                   >{isEndfieldTheme ? 'CONFIRM_PURGE' : '确认删除？'}</button>
                                 ) : (
                                   <button
                                     data-confirm-zone="true"
                                     onClick={() => setDeletingRecommenderConfirmId(rec.id)}
                                     className={`absolute right-2 top-2 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isEndfieldTheme ? 'text-stone-500 hover:bg-red-900/30 hover:text-red-500' : 'text-red-400 hover:bg-red-50 hover:text-red-600'}`}
                                     title="删除推荐人"
                                   ><Trash2 className="w-3.5 h-3.5"/></button>
                                 )}
                               </td>
                               {selectedStudentForDocs.applications.map(app => {
                                 const recData = (app.recommendations && app.recommendations[rec.id]) ? app.recommendations[rec.id] : { status: 'none', deadline: app.deadline };
                                 return (
                                   <td key={app.id} className={`p-3 border-r text-center align-top relative ${isEndfieldTheme ? 'border-orange-500/20' : 'border-[#E5DEC9]/50'}`}>
                                     <CustomSelect
                                       value={recData.status}
                                       onChange={(e) => handleUpdateRLStatus(app.id, rec.id, e.target.value)}
                                       isEndfieldTheme={isEndfieldTheme}
                                       options={[
                                         {value: "none", label: isEndfieldTheme ? "N/A" : "不需要"},
                                         {value: "pending", label: isEndfieldTheme ? "PENDING" : "待发链接"},
                                         {value: "sent", label: isEndfieldTheme ? "LINK_SENT" : "已发链接"},
                                         {value: "completed", label: isEndfieldTheme ? "COMPLETED" : "已完成"}
                                       ]}
                                       customButtonClass={`text-xs w-full p-2 border rounded-md mb-2 outline-none font-medium cursor-pointer transition-colors shadow-sm flex justify-between items-center ${isEndfieldTheme ? "font-mono tracking-widest" : "font-serif"} ${
                                        recData.status === "completed" ? (isEndfieldTheme ? "bg-cyan-900/30 border-cyan-500/50 text-cyan-400 hover:bg-cyan-900/50" : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100") : 
                                        recData.status === "sent" ? (isEndfieldTheme ? "bg-[#FF6A00]/20 border-[#FF6A00]/50 text-orange-300 hover:bg-[#FF6A00]/30" : "bg-[#FAF8F5] border-[#E5DEC9] text-[#C68A4C] hover:bg-amber-50") : 
                                        recData.status === "pending" ? (isEndfieldTheme ? "bg-orange-900/50 border-red-500/50 text-red-400 font-bold hover:bg-orange-900/70" : "bg-amber-50 border-amber-300 text-amber-700 font-bold hover:bg-amber-100") : 
                                        (isEndfieldTheme ? "bg-stone-900/50 border-stone-800 text-stone-500 hover:bg-stone-800" : "bg-[#FAF8F5] border-slate-200 text-slate-400 hover:bg-slate-50") 
                                       }`}
                                     />
                                     {recData.status !== 'none' && recData.status !== 'completed' && (
                                       <div className={`flex items-center justify-center text-[11px] rounded py-1 px-1 border ${isEndfieldTheme ? 'bg-[#0a0a0c] border-orange-500/30 font-mono tracking-widest' : 'bg-[#FAF8F5] border-[#E5DEC9] font-serif'}`}>
                                         <span className={`font-medium mr-1 uppercase ${isEndfieldTheme ? 'text-orange-500' : 'text-slate-400'}`}>DDL:</span>
                                         <input type="datetime-local" value={recData.deadline?.includes('T') ? recData.deadline.slice(0,16) : (recData.deadline ? recData.deadline+'T00:00' : '')} onChange={(e) => handleUpdateRLDeadline(app.id, rec.id, e.target.value)} className={`bg-transparent outline-none w-36 text-center cursor-pointer transition-colors text-[11px] custom-date-input ${isEndfieldTheme ? 'text-orange-200 hover:text-white' : 'text-slate-600 hover:text-[#C68A4C]'}`}/>
                                       </div>
                                     )}
                                   </td>
                                 )
                               })}
                             </tr>
                           ))}
                           {(!selectedStudentForDocs.recommenders || selectedStudentForDocs.recommenders.length === 0) && (
                             <tr><td colSpan={selectedStudentForDocs.applications.length + 1} className="p-12 text-center text-slate-400 bg-[#FAF8F5] italic font-serif">尚未添加任何推荐人，请点击右上角添加。</td></tr>
                           )}
                         </tbody>
                       </table>
                      )}
                    </div>
                  </div>

                  {/* === 学生个人事件时间线 === */}
                  {(() => {
                    const completedAlertsMapped = completedAlertItems
                      .filter(item => item.alert?.studentId === selectedStudentForDocs.id)
                      .map(item => ({
                        id: `ca-${item.alert.id}`,
                        timestamp: item.timestamp,
                        category: 'alert_resolved',
                        action: 'complete',
                        title: item.alert.title,
                        detail: item.alert.message,
                        originalAlert: item.alert
                      }));
                    const stuEvents = selectedStudentForDocs.events || [];
                    const stuTimeline = [...completedAlertsMapped, ...stuEvents]
                      .sort((a, b) => b.timestamp - a.timestamp);

                    return (
                      <div className={`${isMobileBrowser ? 'mobile-timeline-shell' : ''} ${isEndfieldTheme ? 'bg-[#0a0a0c] border border-cyan-900/50 shadow-[0_0_15px_rgba(6,182,212,0.1)] clip-corner-tl' : 'animate-pop-in bg-white rounded-xl border border-slate-200 shadow-sm'} col-span-2 relative`}>
                        {isEndfieldTheme && <div className="absolute top-0 left-0 w-16 h-[2px] bg-cyan-500/80"></div>}
                        <div data-readonly-allow="true" className={`${isMobileBrowser ? 'mobile-timeline-header' : ''} ${isEndfieldTheme ? 'bg-[#17181c] border-b border-cyan-900/50 flex items-center gap-3 px-6 py-4 cursor-pointer' : 'bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b flex items-center gap-3 rounded-t-xl cursor-pointer'}`} onClick={() => setShowStudentTimeline(!showStudentTimeline)}>
                          <Activity className={`w-5 h-5 ${isEndfieldTheme ? 'text-cyan-500' : 'text-blue-500'}`}/>
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <h3 className={`${isEndfieldTheme ? 'text-cyan-400 font-mono tracking-widest font-bold' : 'font-semibold text-slate-800'}`}>{isEndfieldTheme ? '// SYS_TIMELINE_LOG' : '全景操作日志与时间线'}</h3>
                            <HelpButton onClick={(event) => { event.stopPropagation(); setShowActivityLogHelp(true); }} label="查看操作日志说明"/>
                          </div>
                          <span className={`text-xs px-2.5 py-1 font-medium ${isEndfieldTheme ? 'text-cyan-500 bg-cyan-900/30 border border-cyan-700 font-mono' : 'text-slate-400 bg-white rounded-full border border-slate-200'}`}>{stuTimeline.length} {isEndfieldTheme ? 'RECORDS' : '条记录'}</span>
                          <button className={`p-1 transition-colors ml-2 ${isEndfieldTheme ? 'hover:bg-cyan-900/50 text-cyan-600' : 'hover:bg-slate-200 rounded text-slate-500'}`}>
                            {showStudentTimeline ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                          </button>
                        </div>
                        {showStudentTimeline && (
                          stuTimeline.length === 0 ? (
                          <div className={`p-10 text-center flex flex-col items-center ${isEndfieldTheme ? 'text-cyan-800' : 'text-slate-400'}`}>
                            <Clock className={`w-8 h-8 mb-2 ${isEndfieldTheme ? 'text-cyan-900/50' : 'text-slate-200'}`}/>
                            <p className={`font-medium ${isEndfieldTheme ? 'font-mono' : ''}`}>{isEndfieldTheme ? 'NO_RECORDS_FOUND' : '暂无事件记录'}</p>
                          </div>
                        ) : (
                          <div className="relative">
                            <div className={`absolute left-[2.35rem] top-0 bottom-0 w-0.5 z-0 ${isEndfieldTheme ? 'bg-cyan-900/30' : 'bg-slate-100'}`}/>
                            {stuTimeline.map((item) => {
                              const actionColors = {
                                add: isEndfieldTheme ? 'bg-green-900/20 border-green-500/50 text-green-500' : 'bg-green-100 border-green-300 text-green-600',
                                edit: isEndfieldTheme ? 'bg-cyan-900/20 border-cyan-500/50 text-cyan-500' : 'bg-blue-100 border-blue-300 text-blue-600',
                                delete: isEndfieldTheme ? 'bg-red-900/20 border-red-500/50 text-red-500' : 'bg-red-100 border-red-300 text-red-600',
                                status_change: isEndfieldTheme ? 'bg-orange-900/20 border-[#FF6A00]/50 text-[#FF6A00]' : 'bg-[#F2EDE4] border-[#DCD3C1] text-[#7A6E57]',
                                complete: isEndfieldTheme ? 'bg-indigo-900/20 border-indigo-500/50 text-indigo-400' : 'bg-indigo-100 border-indigo-300 text-indigo-600',
                                uncomplete: isEndfieldTheme ? 'bg-stone-900/20 border-stone-700/50 text-stone-500' : 'bg-slate-100 border-slate-300 text-slate-500'
                              };
                              const actionEmoji = {
                                add: isEndfieldTheme ? '[+]' : '[新增]', 
                                edit: isEndfieldTheme ? '[*]' : '[修改]', 
                                delete: isEndfieldTheme ? '[-]' : '[删除]', 
                                status_change: isEndfieldTheme ? '[~]' : '[变更]', 
                                complete: isEndfieldTheme ? '[V]' : '[完成]', 
                                uncomplete: isEndfieldTheme ? '[X]' : '[撤销]'
                              };
                              const colorClass = actionColors[item.action] || (isEndfieldTheme ? 'bg-stone-900/20 border-stone-700/50 text-stone-500' : 'bg-slate-100 border-slate-300 text-slate-500');
                              const emoji = actionEmoji[item.action] || '•';

                              const isResolvedAlert = item.category === 'alert_resolved';

                              return (
                                <div key={item.id} className={`flex items-start gap-4 px-6 py-3 transition-colors group relative border-b last:border-0 ${isEndfieldTheme ? 'hover:bg-cyan-900/10 border-cyan-900/20' : 'hover:bg-slate-50/60 border-slate-50'}`}>
                                  <div className={`min-w-[2.2rem] h-8 px-1 flex items-center justify-center text-[10px] flex-shrink-0 z-10 mt-0.5 ${isEndfieldTheme ? 'border font-mono tracking-widest' : 'rounded-full border-2'} ${colorClass}`}>
                                    {emoji}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start gap-2 flex-wrap">
                                      <p className={`font-semibold text-sm ${isResolvedAlert ? (isEndfieldTheme ? 'text-cyan-800 line-through' : 'text-slate-500 line-through') : (isEndfieldTheme ? 'text-cyan-300' : 'text-slate-700')}`}>{item.title}</p>
                                      <span className={`text-[11px] whitespace-nowrap px-2 py-0.5 ${isEndfieldTheme ? 'text-cyan-600 bg-cyan-900/20 font-mono tracking-widest border border-cyan-900/50' : 'text-slate-400 bg-slate-100 rounded-full'}`}>
                                        {new Date(item.timestamp).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
                                      </span>
                                    </div>
                                    {item.detail && (
                                      <p className={`text-xs mt-1 leading-relaxed ${isResolvedAlert ? 'text-slate-400 line-clamp-2' : 'text-slate-500 bg-white border border-slate-100 p-2 rounded-md inline-block shadow-sm'}`}>
                                        {item.detail}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    {isResolvedAlert && (
                                      <button
                                        onClick={() => handleCompleteAlert(item.originalAlert)}
                                        className="px-2.5 py-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md flex items-center gap-1"
                                        title="取消完成（移回预警）">
                                        <RotateCcw className="w-3 h-3"/>取消
                                      </button>
                                    )}
                                    {!isResolvedAlert && (
                                      deletingEventConfirmId === item.id ? (
                                        <button
                                          data-confirm-zone="true"
                                          onClick={() => { handleDeleteEvent(item.id); setDeletingEventConfirmId(null); }}
                                          className="px-2 py-1 text-xs text-red-600 bg-red-50 border border-red-500 rounded-md flex items-center gap-1 font-semibold animate-fade-in"
                                          title="确认删除">
                                          确认？
                                        </button>
                                      ) : (
                                        <button
                                          data-confirm-zone="true"
                                          onClick={() => setDeletingEventConfirmId(item.id)}
                                          className="px-2 py-1 text-xs text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md flex items-center gap-1"
                                          title="删除此条记录">
                                          删除
                                        </button>
                                      )
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          )
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="space-y-0">
              {(() => {
                const HOURS = [9, 10, 11, 12, 14, 15, 16, 17, 18];
                const now = new Date();
                const dow = now.getDay();
                const thisMonday = new Date(now);
                thisMonday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
                thisMonday.setHours(0, 0, 0, 0);
                const monday = new Date(thisMonday);
                monday.setDate(thisMonday.getDate() + calendarWeekOffset * 7);
                const weekDays = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(monday);
                  d.setDate(monday.getDate() + i);
                  return d;
                });
                // Next week days (for cross-week drop zone label)
                const nextWeekMonday = new Date(monday);
                nextWeekMonday.setDate(monday.getDate() + 7);
                const nextWeekDays = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(nextWeekMonday);
                  d.setDate(nextWeekMonday.getDate() + i);
                  return d;
                });
                const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
                const fmtDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const todayStr = fmtDay(now);
                const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
                const tomorrowStr = fmtDay(tomorrow);
                const isLunch = (h) => h === 12;

                // Build the calendar exclusively from business data plus an
                // optional calendar-only position override.  Custom blue notes
                // remain independent in calendarEvents.
                const alertEventsByCell = {};
                derivedCalendarEvents.forEach(alertObj => {
                  if (!alertObj.targetTimeMs) return;
                  const override = calendarEvents.find(evt => evt.isAlert && evt.alertId === alertObj.id);
                  const d = override
                    ? new Date(`${override.day}T${String(override.hour || 9).padStart(2, '0')}:00:00`)
                    : new Date(alertObj.targetTimeMs);
                  const dayStr = fmtDay(d);
                  const weekDayStrs = weekDays.map(fmtDay);
                  if (!weekDayStrs.includes(dayStr)) return;
                  const hour = Math.min(18, Math.max(9, d.getHours() || 9));
                  const key = `${dayStr}_${hour}`;
                  if (!alertEventsByCell[key]) alertEventsByCell[key] = [];
                  alertEventsByCell[key].push(alertObj);
                });

                const visibleCalendarEvents = isRecycleBinMode
                  ? []
                  : calendarEvents.filter(evt => !evt.isAlert);

                // Calendar events (user-created and moved alerts)
                const calEventsByCell = {};
                visibleCalendarEvents.forEach(evt => {
                  const key = `${evt.day}_${evt.hour}`;
                  if (!calEventsByCell[key]) calEventsByCell[key] = [];
                  calEventsByCell[key].push(evt);
                });

                const handleGlobalAlertDrop = (alertObj, newDay, newHour) => {
                  const newDateStr = `${newDay}T${String(newHour).padStart(2, '00')}:00:00`;
                  const { studentId, appId, noteId, recId, kind } = alertObj;
                  if (!studentId) return;

                  if (alertObj.positionMode === 'calendar') {
                    setCalendarEvents(prev => {
                      const moved = { id: 'alert-' + alertObj.id, alertId: alertObj.id, day: newDay, hour: newHour, text: alertObj.title, type: alertObj.type, isAlert: true };
                      return prev.some(evt => evt.alertId === alertObj.id)
                        ? prev.map(evt => evt.alertId === alertObj.id ? { ...evt, ...moved } : evt)
                        : [...prev, moved];
                    });
                    return;
                  }

                  const studentOverride = systemWarningsTimeOverrides[studentId] || {};
                  const rlLeadDays = Number(studentOverride.rlWarning ?? alertConfig.rlWarning ?? 14);
                  const recommendationDeadline = fmtDay(new Date(shiftDays(new Date(newDateStr).getTime(), rlLeadDays)));

                  setStudents(prev => prev.map(stu => {
                    if (stu.id !== studentId) return stu;
                    
                    if (appId && kind === 'recommendation' && recId) {
                      return {
                        ...stu,
                        applications: stu.applications.map(app => {
                          if (app.id !== appId) return app;
                          return {
                            ...app,
                            recommendations: {
                              ...app.recommendations,
                              [recId]: { ...(app.recommendations?.[recId] || {}), deadline: recommendationDeadline }
                            }
                          };
                        })
                      };
                    }

                    if (appId && kind === 'note' && noteId) {
                      return {
                        ...stu,
                        applications: stu.applications.map(app => {
                          if (app.id !== appId) return app;
                          return { ...app, notes: (app.notes || []).map(n => n.id === noteId ? { ...n, deadline: newDateStr } : n) };
                        })
                      };
                    }

                    if (kind === 'visa_start' || kind === 'visa_end') {
                       return {
                         ...stu,
                         visaWindow: kind === 'visa_start'
                           ? [newDay, stu.visaWindow?.[1] || ''] 
                           : [stu.visaWindow?.[0] || '', newDay]
                       };
                    }

                    if (appId && (kind === 'application_open' || kind === 'application_deadline')) {
                      return {
                        ...stu,
                        applications: stu.applications.map(app => {
                          if (app.id !== appId) return app;
                          
                           if (kind === 'application_open') return { ...app, openDate: newDay };
                           if (kind === 'application_deadline') return { ...app, deadline: newDay };
                          
                          return app;
                        })
                      };
                    }
                    
                    return stu;
                  }));
                };

                // Keep the header badge in sync with the all-season calendar
                // dataset while leaving the selected-season dashboard alerts
                // unchanged outside this calendar scope.
                const activeAlerts = derivedCalendarEvents.filter(event => {
                  const completed = event.kind === 'recommendation'
                    ? event.rlStatus === 'completed' || !!completedAlerts[event.id]
                    : !!completedAlerts[event.id];
                  return !completed;
                });

                if (isMobileBrowser) {
                  const mobileDays = weekDays.map(day => {
                    const dayString = fmtDay(day);
                    const alerts = derivedCalendarEvents.filter(event => {
                      const override = calendarEvents.find(item => item.isAlert && item.alertId === event.id);
                      const eventDay = override?.day || fmtDay(new Date(event.targetTimeMs));
                      return eventDay === dayString;
                    });
                    const custom = visibleCalendarEvents.filter(event => event.day === dayString);
                    return { day, dayString, alerts, custom };
                  });
                  const mobileAddNote = (dayString) => {
                    setAddingTodo({ day: dayString, hour: 9 });
                    setNewTodoText('');
                  };
                  const saveMobileNote = () => {
                    if (!addingTodo || !newTodoText.trim()) return;
                    setCalendarEvents(previous => [...previous, { id: `cal-${Date.now()}-${Math.random()}`, day: addingTodo.day, hour: addingTodo.hour, text: newTodoText.trim(), type: 'custom' }]);
                    setAddingTodo(null);
                    setNewTodoText('');
                  };
                  return (
                    <div className={`mobile-calendar-agenda rounded-xl border shadow-sm ${isEndfieldTheme ? 'bg-[#0a0a0c] border-cyan-900/50' : 'bg-[#FAF8F5] border-[#E5DEC9]'}`}>
                      <div className="p-3 border-b border-[#E5DEC9] space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2"><Calendar className="h-5 w-5 shrink-0 text-[#C68A4C]"/><h2 className="truncate text-base font-bold font-serif">周议程</h2><HelpButton onClick={() => setShowMobileCalendarHelp(true)} label="查看日历操作说明"/></div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button type="button" onClick={() => setCalendarEvents(previous => previous.filter(event => !event.isAlert))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700" aria-label="同步数据库" title="同步数据库"><RotateCcw className="h-4 w-4"/></button>
                            <button data-readonly-allow="true" type="button" onClick={() => setShowMobileSystemMenu(true)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5DEC9] bg-white text-slate-600 shadow-sm" aria-label="系统与云端" title="系统与云端"><Settings className="h-4 w-4"/></button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2"><div className="flex rounded-lg overflow-hidden border border-[#E5DEC9] text-sm"><button onClick={() => setCalendarWeekOffset(0)} className={`px-4 py-2 ${calendarWeekOffset === 0 ? 'bg-[#C68A4C] text-white' : 'bg-white text-slate-600'}`}>本周</button><button onClick={() => setCalendarWeekOffset(1)} className={`px-4 py-2 border-l border-[#E5DEC9] ${calendarWeekOffset === 1 ? 'bg-[#C68A4C] text-white' : 'bg-white text-slate-600'}`}>下周</button></div><span className="text-[11px] text-slate-500">{fmtDay(weekDays[0])}<br/>— {fmtDay(weekDays[6])}</span></div>
                        <div className="flex gap-1.5 text-[10px]"><span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600">紧急 {activeAllSeasonsAlerts.filter(event => event.type === 'critical').length}</span><span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">注意 {activeAllSeasonsAlerts.filter(event => event.type === 'warning').length}</span></div>
                      </div>
                      <div className="p-3 space-y-3">
                        {mobileDays.map(({ day, dayString, alerts, custom }, index) => {
                          const isToday = dayString === todayStr;
                          return <section key={dayString} data-mobile-drop-date={dayString} className={`mobile-calendar-drop-day rounded-xl border overflow-hidden ${isToday ? 'border-[#C68A4C] shadow-sm' : 'border-[#E5DEC9]'} bg-white`}>
                            <div className={`px-3 py-2.5 flex items-center justify-between ${isToday ? 'bg-amber-50' : 'bg-[#FAF8F5]'}`}><div><span className="font-bold text-sm">{WEEK_LABELS[index]}</span><span className="ml-2 text-xs text-slate-500">{day.getMonth()+1}/{day.getDate()}</span>{isToday && <span className="ml-2 text-[10px] text-[#C68A4C] font-bold">今天</span>}</div><button onClick={() => mobileAddNote(dayString)} className="px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-700 text-xs border border-sky-200">+ 备注</button></div>
                            {addingTodo?.day === dayString && (
                              <div className="border-t border-sky-100 bg-sky-50/60 p-2.5">
                                <label className="text-[11px] font-semibold text-sky-800">新增备注</label>
                                <div className="mt-1.5 flex items-stretch gap-2">
                                  <input autoFocus value={newTodoText} onChange={event => setNewTodoText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') saveMobileNote(); if (event.key === 'Escape') { setAddingTodo(null); setNewTodoText(''); } }} placeholder="输入要记录的事项" className="min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-3 py-2 text-slate-800 outline-none focus:border-sky-400"/>
                                  <button onClick={saveMobileNote} disabled={!newTodoText.trim()} className="rounded-lg bg-sky-600 px-3 text-sm font-bold text-white disabled:opacity-40">添加</button>
                                  <button onClick={() => { setAddingTodo(null); setNewTodoText(''); }} className="rounded-lg border border-sky-200 bg-white px-2.5 text-sky-700" aria-label="取消新增备注"><X className="h-4 w-4"/></button>
                                </div>
                              </div>
                            )}
                            <div className="p-2.5 space-y-2">
                              {alerts.length === 0 && custom.length === 0 && <p className="py-3 text-center text-xs text-slate-400">当天没有事项</p>}
                              {alerts.map(event => {
                                const override = calendarEvents.find(item => item.isAlert && item.alertId === event.id);
                                const completed = event.kind === 'recommendation' ? event.rlStatus === 'completed' || !!completedAlerts[event.id] : !!completedAlerts[event.id];
                                const eventDate = override ? new Date(`${override.day}T${String(override.hour || 9).padStart(2, '0')}:00:00`) : new Date(event.targetTimeMs);
                                const color = event.type === 'milestone' ? 'border-violet-300 bg-violet-50 text-violet-800' : event.type === 'critical' ? 'border-red-300 bg-red-50 text-red-800' : 'border-orange-300 bg-orange-50 text-orange-800';
                                return <MobileLongPressDraggable
                                  key={event.id}
                                  label={event.title}
                                  sourceDate={dayString}
                                  crossWeekShift={calendarWeekOffset === 0 ? 7 : -7}
                                  onDropDate={targetDay => handleGlobalAlertDrop(event, targetDay, eventDate.getHours() || 9)}
                                  onLongPress={() => setMobileCalendarDetail({ kind: 'alert', event, eventDate, completed, color })}
                                >
                                  <div role="button" aria-label={`日历气泡 ${event.student ? `${event.student} ` : ''}${event.title}`} data-calendar-event-id={event.id} className={`min-h-11 rounded-lg border px-2.5 py-2 ${completed ? 'border-emerald-200 bg-emerald-50 text-emerald-700 opacity-75' : color}`}>
                                    <div className="flex items-center gap-2">
                                      <span className={`h-2 w-2 shrink-0 rounded-full ${completed ? 'bg-emerald-500' : event.type === 'milestone' ? 'bg-violet-500' : event.type === 'critical' ? 'bg-red-500' : 'bg-orange-500'}`}></span>
                                      <p className={`min-w-0 flex-1 truncate text-xs font-bold ${completed ? 'line-through' : ''}`}>{event.student ? `[${event.student}] ` : ''}{event.title}</p>
                                      <span className="shrink-0 text-[10px] font-mono opacity-75">{String(eventDate.getHours() || 9).padStart(2,'0')}:00</span>
                                    </div>
                                  </div>
                                </MobileLongPressDraggable>;
                              })}
                              {custom.map(event => <MobileLongPressDraggable
                                key={event.id}
                                label={event.text}
                                sourceDate={dayString}
                                crossWeekShift={calendarWeekOffset === 0 ? 7 : -7}
                                onDropDate={targetDay => setCalendarEvents(previous => previous.map(item => item.id === event.id ? { ...item, day: targetDay } : item))}
                                onLongPress={() => setMobileCalendarDetail({ kind: 'custom', event })}
                              ><div role="button" aria-label={`备注气泡 ${event.text}`} data-calendar-event-id={event.id} className={`min-h-11 rounded-lg border px-2.5 py-2 ${event.done ? 'border-emerald-200 bg-emerald-50 text-emerald-700 opacity-75' : 'border-sky-200 bg-sky-50 text-sky-800'}`}><div className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${event.done ? 'bg-emerald-500' : 'bg-sky-500'}`}></span><p className={`min-w-0 flex-1 truncate text-xs font-bold ${event.done ? 'line-through' : ''}`}>{event.text}</p><span className="shrink-0 text-[10px] opacity-70">备注</span></div></div></MobileLongPressDraggable>)}
                            </div>
                          </section>;
                        })}
                      </div>
                      <HelpDialog open={showMobileCalendarHelp} onClose={() => setShowMobileCalendarHelp(false)} title="日历操作" label="日历操作说明"><ul className="space-y-2"><li>• 单指上下滑动：浏览日历。</li><li>• 长按气泡 0.5 秒后松手：查看详情。</li><li>• 长按后拖到某一天：移动到该日期。</li><li>• 长按后拖到屏幕右边缘：移到另一周的同一天。</li></ul></HelpDialog>
                      {mobileCalendarDetail && (
                        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-3" role="dialog" aria-label="日历气泡详情">
                          <section className={`relative w-full max-w-sm rounded-2xl border bg-white p-4 shadow-2xl ${mobileCalendarDetail.kind === 'custom' ? 'border-sky-200' : mobileCalendarDetail.color?.split(' ')[0] || 'border-[#E5DEC9]'}`}>
                            <button onClick={() => setMobileCalendarDetail(null)} className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white p-2 text-slate-500" aria-label="关闭日历详情"><X className="h-4 w-4"/></button>
                            <div className="pr-11">
                              <p className="text-[11px] font-bold tracking-wide text-[#C68A4C]">{mobileCalendarDetail.kind === 'custom' ? '备注详情' : '预警详情'}</p>
                              <h3 className={`mt-2 text-base font-bold leading-snug ${mobileCalendarDetail.completed || mobileCalendarDetail.event?.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                {mobileCalendarDetail.kind === 'alert' && mobileCalendarDetail.event?.student ? `[${mobileCalendarDetail.event.student}] ` : ''}{mobileCalendarDetail.kind === 'custom' ? mobileCalendarDetail.event?.text : mobileCalendarDetail.event?.title}
                              </h3>
                            </div>
                            {mobileCalendarDetail.kind === 'alert' ? (
                              <>
                                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">{mobileCalendarDetail.event?.message || '暂无补充说明'}</p>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500"><span>日期：{fmtDay(mobileCalendarDetail.eventDate)}</span><span className="text-right">时间：{String(mobileCalendarDetail.eventDate?.getHours?.() || 9).padStart(2,'0')}:00</span></div>
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                  <button onClick={() => { handleCompleteAlert(mobileCalendarDetail.event); setMobileCalendarDetail(null); }} className="rounded-lg bg-[#C68A4C] px-3 py-2.5 text-sm font-bold text-white">{mobileCalendarDetail.completed ? '恢复未完成' : '标记完成'}</button>
                                  <button onClick={() => { const detailEvent = mobileCalendarDetail.event; setMobileCalendarDetail(null); setInlineConfirmModal({ title: '隐藏这条提醒？', message: '隐藏后不会再出现在日历和预警中；关联日期或材料发生变化时会自动恢复。', confirmLabel: '隐藏提醒', onConfirm: () => { setDismissedCalendarEvents(previous => ({ ...previous, [detailEvent.id]: detailEvent.sourceSignature })); setCalendarEvents(previous => previous.filter(item => item.alertId !== detailEvent.id)); } }); }} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-bold text-red-600">隐藏提醒</button>
                                </div>
                              </>
                            ) : (
                              <div className="mt-4 grid grid-cols-2 gap-2">
                                <button onClick={() => { const detailEvent = mobileCalendarDetail.event; setCalendarEvents(previous => previous.map(item => item.id === detailEvent.id ? { ...item, done: !item.done } : item)); setMobileCalendarDetail(null); }} className="rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-bold text-white">{mobileCalendarDetail.event?.done ? '恢复未完成' : '标记完成'}</button>
                                <button onClick={() => { const detailEvent = mobileCalendarDetail.event; setMobileCalendarDetail(null); setInlineConfirmModal(createCalendarNoteDeleteConfirmation(detailEvent, () => setCalendarEvents(previous => previous.filter(item => item.id !== detailEvent.id)))); }} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-bold text-red-600">删除备注</button>
                              </div>
                            )}
                          </section>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div className={`rounded-xl shadow-sm border ${isEndfieldTheme ? 'bg-[#0a0a0c] border-cyan-900/50 clip-corner-tl' : 'bg-[#FAF8F5] border-[#E5DEC9]'}`} style={{overflow: 'visible'}}>
                    <div className={`px-6 py-4 border-b flex items-center gap-3 rounded-t-xl ${isEndfieldTheme ? 'bg-[#17181c] border-cyan-900/50' : 'border-[#E5DEC9]'}`}>
                      <Calendar className={`w-5 h-5 flex-shrink-0 ${isEndfieldTheme ? 'text-cyan-500' : 'text-[#C68A4C]'}`} />
                      <h2 className={`text-xl font-bold ${isEndfieldTheme ? 'text-cyan-400 font-mono tracking-widest' : 'text-slate-800 font-serif'}`}>每周待办日历</h2>
                      {/* Week Switcher */}
                      <div className={`flex rounded-lg overflow-hidden border text-xs font-semibold ${isEndfieldTheme ? 'border-cyan-800 font-mono' : 'border-[#E5DEC9] font-serif'}`}>
                        <button
                          type="button"
                          onClick={() => setCalendarWeekOffset(0)}
                          className={`px-3 py-1.5 transition-colors ${
                            calendarWeekOffset === 0
                              ? (isEndfieldTheme ? 'bg-cyan-800 text-cyan-200' : 'bg-[#C68A4C] text-white')
                              : (isEndfieldTheme ? 'bg-[#17181c] text-cyan-600 hover:bg-cyan-900/30' : 'bg-white text-slate-500 hover:bg-[#F3EFE6]')
                          }`}
                        >本周</button>
                        <button
                          type="button"
                          onClick={() => setCalendarWeekOffset(1)}
                          className={`px-3 py-1.5 border-l transition-colors ${
                            calendarWeekOffset === 1
                              ? (isEndfieldTheme ? 'bg-cyan-800 text-cyan-200 border-cyan-700' : 'bg-[#C68A4C] text-white border-[#A97138]')
                              : (isEndfieldTheme ? 'bg-[#17181c] text-cyan-600 hover:bg-cyan-900/30 border-cyan-800' : 'bg-white text-slate-500 hover:bg-[#F3EFE6] border-[#E5DEC9]')
                          }`}
                        >下周</button>
                      </div>
                      <span className={`text-xs ${isEndfieldTheme ? 'text-cyan-700 font-mono tracking-wider' : 'text-slate-400 font-serif'}`}>{fmtDay(weekDays[0])} — {fmtDay(weekDays[6])}</span>
                      <button
                        type="button"
                        onClick={() => setCalendarEvents(prev => prev.filter(evt => !evt.isAlert))}
                        className={`ml-auto rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${isEndfieldTheme ? 'border-violet-500/50 bg-violet-950/30 text-violet-300 hover:bg-violet-900/40 font-mono' : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 font-serif'}`}
                        title="按数据库重新计算除手动备注外的气泡位置；完成与隐藏状态保持不变"
                      >同步数据库</button>
                      {activeAllSeasonsAlerts.some(a => a.type === 'critical' || a.type === 'warning') && (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isEndfieldTheme ? 'text-red-400 bg-red-900/20 border border-red-500/30 font-mono' : 'text-red-600 bg-red-50 border border-red-200 font-serif'}`}>
                          {activeAllSeasonsAlerts.filter(a => a.type === 'critical' && a.targetTimeMs).length > 0 && <span>🔴 {activeAllSeasonsAlerts.filter(a => a.type === 'critical' && a.targetTimeMs).length} {isEndfieldTheme ? 'CRITICAL' : '紧急'} </span>}
                          {activeAllSeasonsAlerts.filter(a => a.type === 'warning' && a.targetTimeMs).length > 0 && <span>🟠 {activeAllSeasonsAlerts.filter(a => a.type === 'warning' && a.targetTimeMs).length} {isEndfieldTheme ? 'WARNING' : '注意'}</span>}
                        </span>
                      )}
                    </div>
                    <div style={{overflow: 'visible'}}>
                      <div className="overflow-x-auto calendar-scroll-container rounded-b-xl" style={{minWidth: 0}}>
                        <div className="min-w-[700px]">
                          <div className={`grid border-b ${isEndfieldTheme ? 'bg-[#17181c] border-cyan-900/50' : 'border-[#E5DEC9] bg-[#FAF8F5]'}`} style={{gridTemplateColumns: '4rem repeat(7, minmax(0, 1fr))'}}>
                            <div className={`border-r p-3 ${isEndfieldTheme ? 'border-cyan-900/50' : 'border-[#E5DEC9]'}`} />
                            {weekDays.map((d, i) => {
                              const dStr = fmtDay(d);
                              const isToday = dStr === todayStr;
                              const isTomorrow = dStr === tomorrowStr;
                              return (
                                <div key={i} className={`p-3 text-center border-r last:border-r-0 ${isEndfieldTheme ? `border-cyan-900/50 font-mono ${isToday ? 'bg-cyan-900/20' : isTomorrow ? 'bg-stone-900/30' : ''}` : `border-[#E5DEC9] font-serif ${isToday ? 'bg-[#C68A4C]/10' : isTomorrow ? 'bg-amber-50/40' : ''}`}`}>
                                  <div className={`text-sm font-bold ${isToday ? (isEndfieldTheme ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-[#C68A4C]') : (isEndfieldTheme ? 'text-cyan-600' : 'text-slate-600')}`}>{WEEK_LABELS[i]}</div>
                                  <div className={`text-xs mt-0.5 ${isToday ? (isEndfieldTheme ? 'text-cyan-300 font-bold drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-[#C68A4C] font-semibold') : (isEndfieldTheme ? 'text-cyan-800' : 'text-slate-400')}`}>{d.getMonth() + 1}/{d.getDate()}</div>
                                </div>
                              );
                            })}
                          </div>
                          {HOURS.map(hour => (
                            <div key={hour} className={`grid border-b last:border-b-0 ${isEndfieldTheme ? 'border-cyan-900/20' : 'border-[#E5DEC9]'}`} style={{gridTemplateColumns: '4rem repeat(7, minmax(0, 1fr))'}}>
                              <div className={`border-r p-2 flex items-start justify-end pr-2 pt-2 ${isEndfieldTheme ? 'border-cyan-900/20' : 'border-[#E5DEC9]'}`}>
                                <span className={`text-[11px] leading-none font-bold ${isEndfieldTheme ? 'text-cyan-400 font-mono' : 'text-slate-600 font-serif'}`}>{isLunch(hour) ? '午休' : `${hour}:00`}</span>
                              </div>
                              {weekDays.map((d, di) => {
                                const dayStr = fmtDay(d);
                                const cellKey = `${dayStr}_${hour}`;
                                const isToday = dayStr === todayStr;
                                const isTomorrow = dayStr === tomorrowStr;
                                const alertsHere = alertEventsByCell[cellKey] || [];
                                const calEventsHere = calEventsByCell[cellKey] || [];
                                const addingHere = addingTodo && addingTodo.day === dayStr && addingTodo.hour === hour;
                                if (isLunch(hour)) {
                                  return (
                                    <div key={di} className={`border-r last:border-r-0 min-h-[3rem] flex items-center justify-center ${isEndfieldTheme ? `bg-[repeating-linear-gradient(-45deg,rgba(255,106,0,0.1),rgba(255,106,0,0.1)_10px,transparent_10px,transparent_20px)] bg-[#0a0a0c] border-y border-[#FF6A00]/40 shadow-[inset_0_0_20px_rgba(255,106,0,0.15)]` : `border-[#E5DEC9] bg-[#E5DEC9]/30 border-y border-[#C68A4C]/30`}`}>
                                      {di === 0 && <span className={`text-[11px] font-bold tracking-widest ${isEndfieldTheme ? 'text-[#FF6A00] font-mono drop-shadow-[0_0_5px_rgba(255,106,0,0.8)]' : 'text-[#C68A4C] font-serif'}`}>午休 12:00–13:30</span>}
                                    </div>
                                  );
                                }
                                return (
                                  <div
                                    key={di}
                                    className={`border-r last:border-r-0 min-h-[4rem] p-1 relative group/cell transition-colors cursor-pointer ${isEndfieldTheme ? `border-cyan-900/20 ${isToday ? 'bg-cyan-900/10 hover:bg-cyan-900/20' : isTomorrow ? 'bg-stone-900/20 hover:bg-stone-900/40' : 'hover:bg-cyan-950/30'}` : `border-[#E5DEC9] ${isToday ? 'bg-[#C68A4C]/5 hover:bg-[#C68A4C]/10' : isTomorrow ? 'bg-amber-50/20 hover:bg-amber-50/40' : 'hover:bg-[#F3EFE6]/50'}`}`}
                                    style={dragOverBlockKey === cellKey ? { outline: '2px solid #C68A4C', outlineOffset: '-2px' } : {}}
                                    onClick={(e) => {
                                      if (e.target.closest && e.target.closest('button, input, [data-no-click]')) return;
                                      if (Date.now() - lastBlurTimeRef.current < 200) return;
                                      if (addingTodo) return;
                                      setAddingTodo({ day: dayStr, hour });
                                      setNewTodoText('');
                                    }}
                                    onDragOver={(e) => { e.preventDefault(); setDragOverBlockKey(cellKey); }}
                                    onDragLeave={() => setDragOverBlockKey(null)}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      setDragOverBlockKey(null);
                                      const sourceType = e.dataTransfer.getData('sourceType');
                                      const eventId = e.dataTransfer.getData('eventId');
                                      const alertId = e.dataTransfer.getData('alertId');
                                      const studentId = e.dataTransfer.getData('studentId');
                                      const appId = e.dataTransfer.getData('appId');
                                      const noteId = e.dataTransfer.getData('noteId');
                                      if (sourceType === 'calendar' && eventId) {
                                        setCalendarEvents(prev => prev.map(evt => evt.id === eventId ? { ...evt, day: dayStr, hour } : evt));
                                      } else if (sourceType === 'alert' && alertId) {
                                        const alertObj = derivedCalendarEvents.find(a => a.id === alertId);
                                        if (alertObj) {
                                          handleGlobalAlertDrop(alertObj, dayStr, hour);
                                        }
                                      } else {
                                        const text = e.dataTransfer.getData('text/plain');
                                        if (text) setCalendarEvents(prev => [...prev, { id: 'cal-' + Date.now() + '-' + Math.random(), day: dayStr, hour, text, type: 'custom' }]);
                                      }
                                    }}
                                  >
                                    <div className="flex flex-col gap-1 w-full">
                                      {alertsHere.map(alertObj => {
                                        const isAlertCompleted = alertObj.id.includes('-rl-')
                                          ? (alertObj.rlStatus === 'completed' || !!completedAlerts[alertObj.id])
                                          : !!completedAlerts[alertObj.id];
                                        return (
                                          <div
                                            key={alertObj.id}
                                            data-no-click="true"
                                            draggable
                                            onDragStart={(e) => {
                                              e.stopPropagation();
                                              e.dataTransfer.setData('alertId', alertObj.id);
                                              e.dataTransfer.setData('sourceType', 'alert');
                                              e.dataTransfer.setData('text/plain', alertObj.title);
                                              if (alertObj.studentId) e.dataTransfer.setData('studentId', alertObj.studentId);
                                              if (alertObj.appId) e.dataTransfer.setData('appId', alertObj.appId);
                                              if (alertObj.noteId) e.dataTransfer.setData('noteId', alertObj.noteId);
                                              setCalendarTooltip(null);
                                              const displayText = `${alertObj.student ? `[${alertObj.student}] ` : ''}${alertObj.title}`;
                                              handleDragStartWithGhost(e, displayText, isAlertCompleted ? 'completed' : alertObj.type);
                                            }}
                                            onDragEnd={() => setCalendarTooltip(null)}
                                            onMouseEnter={(e) => {
                                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                              setCalendarTooltip({
                                                x: Math.min(rect.left + rect.width / 2, window.innerWidth - 120),
                                                y: rect.top - 6,
                                                title: `${isAlertCompleted ? '✅ ' : ''}${alertObj.student ? `[${alertObj.student}] ` : ''}${alertObj.title}`,
                                                message: alertObj.message || null,
                                                seasonName: alertObj.seasonName || null,
                                              });
                                            }}
                                            onMouseLeave={() => setCalendarTooltip(null)}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCompleteAlert(alertObj);
                                            }}
                                            className={`group relative px-1.5 py-0.5 rounded text-[10px] font-semibold leading-snug cursor-grab select-none pr-4 w-full block ${isEndfieldTheme ? 'font-mono' : 'font-serif'} ${
                                              isAlertCompleted
                                                ? (isEndfieldTheme ? 'bg-stone-900/50 border border-stone-800 text-stone-500 opacity-60' : 'bg-green-50 border border-green-200 text-green-600 opacity-70')
                                                : (alertObj.type === 'milestone'
                                                  ? (isEndfieldTheme ? 'bg-violet-900/35 border border-violet-400/60 text-violet-300' : 'bg-violet-100 border border-violet-300 text-violet-700')
                                                  : alertObj.type === 'critical'
                                                    ? (isEndfieldTheme ? 'bg-red-900/30 border border-red-500/50 text-red-400' : 'bg-red-100 border border-red-300 text-red-700')
                                                    : (isEndfieldTheme ? 'bg-orange-900/30 border border-[#FF6A00]/50 text-orange-400' : 'bg-orange-100 border border-orange-300 text-orange-700'))
                                            }`}
                                          >
                                            <span className={`truncate block w-full ${isAlertCompleted ? 'line-through' : ''}`}>
                                              {alertObj.student ? `[${alertObj.student}] ` : ''}{alertObj.title}
                                            </span>
                                            
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setInlineConfirmModal({
                                                  title: '隐藏这条提醒？',
                                                  message: '确定隐藏这个日历气泡吗？源日期或关联材料变化后会自动恢复。',
                                                  confirmLabel: '隐藏提醒',
                                                  onConfirm: () => {
                                                    setCalendarTooltip(null);
                                                    setDismissedCalendarEvents(prev => ({ ...prev, [alertObj.id]: alertObj.sourceSignature }));
                                                    setCalendarEvents(prev => prev.filter(evt => evt.alertId !== alertObj.id));
                                                  }
                                                });
                                              }}
                                              className="absolute right-0.5 top-0.5 p-0.5 bg-white/90 hover:bg-red-50 text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                              title="隐藏气泡"
                                            >
                                              <X className="w-2.5 h-2.5" />
                                            </button>
                                          </div>
                                        );
                                      })}
                                      {calEventsHere.map(evt => {
                                        const underlyingAlert = evt.isAlert ? allSeasonsAlerts.find(a => a.id === evt.alertId) : null;
                                        const isAlertCompleted = evt.isAlert && (
                                          (underlyingAlert?.rlStatus === 'completed') || !!completedAlerts[evt.alertId]
                                        );
                                        const isDone = evt.isAlert ? isAlertCompleted : !!evt.done;
                                        return (
                                          <div
                                            key={evt.id}
                                            data-no-click="true"
                                            draggable
                                            onDragStart={(e) => {
                                              e.stopPropagation();
                                              e.dataTransfer.setData('eventId', evt.id);
                                              e.dataTransfer.setData('text/plain', evt.text);
                                              e.dataTransfer.setData('sourceType', evt.isAlert ? 'alert' : 'calendar');
                                              if (evt.alertId) e.dataTransfer.setData('alertId', evt.alertId);
                                              if (evt.studentId) e.dataTransfer.setData('studentId', evt.studentId);
                                              if (evt.appId) e.dataTransfer.setData('appId', evt.appId);
                                              if (evt.noteId) e.dataTransfer.setData('noteId', evt.noteId);
                                              setCalendarTooltip(null);
                                              const displayText = evt.isAlert && underlyingAlert
                                                ? `${underlyingAlert.student ? `[${underlyingAlert.student}] ` : ''}${evt.text}`
                                                : evt.text;
                                              handleDragStartWithGhost(e, displayText, isDone ? 'completed' : (evt.isAlert ? evt.type : 'custom'));
                                            }}
                                            onDragEnd={() => setCalendarTooltip(null)}
                                            onMouseEnter={(e) => {
                                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                              const tooltipTitle = evt.isAlert && underlyingAlert
                                                ? `${isDone ? '✅ ' : ''}${underlyingAlert.student ? `[${underlyingAlert.student}] ` : ''}${evt.text}`
                                                : `${isDone ? '✅ ' : ''}${evt.text}`;
                                              const tooltipMsg = evt.isAlert && underlyingAlert ? (underlyingAlert.message || null) : null;
                                              const tooltipSeason = evt.isAlert && underlyingAlert ? (underlyingAlert.seasonName || null) : null;
                                              setCalendarTooltip({
                                                x: Math.min(rect.left + rect.width / 2, window.innerWidth - 120),
                                                y: rect.top - 6,
                                                title: tooltipTitle,
                                                message: tooltipMsg,
                                                seasonName: tooltipSeason,
                                              });
                                            }}
                                            onMouseLeave={() => setCalendarTooltip(null)}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (evt.isAlert) {
                                                const alertObj = allSeasonsAlerts.find(a => a.id === evt.alertId);
                                                if (alertObj) handleCompleteAlert(alertObj);
                                                return;
                                              }
                                              setCalendarEvents(prev => prev.map(item =>
                                                item.id === evt.id ? { ...item, done: !item.done } : item
                                              ));
                                            }}
                                            className={`group relative px-1.5 py-0.5 rounded text-[10px] font-semibold leading-snug cursor-grab select-none pr-4 w-full block ${isEndfieldTheme ? 'font-mono' : 'font-serif'} ${
                                              isDone
                                                ? (isEndfieldTheme ? 'bg-stone-900/50 border border-stone-800 text-stone-500 opacity-60' : 'bg-green-50 border border-green-200 text-green-600 opacity-70')
                                                : (evt.isAlert
                                                  ? (evt.type === 'critical' ? (isEndfieldTheme ? 'bg-red-900/30 border border-red-500/50 text-red-400' : 'bg-red-100 border border-red-300 text-red-700') : (isEndfieldTheme ? 'bg-orange-900/30 border border-[#FF6A00]/50 text-orange-400' : 'bg-orange-100 border border-orange-300 text-orange-700'))
                                                  : (isEndfieldTheme ? 'bg-cyan-900/30 border border-cyan-700/50 text-cyan-400 hover:bg-cyan-900/50' : 'bg-sky-100 border border-sky-200 text-sky-700 hover:bg-sky-50'))
                                            }`}
                                          >
                                            <span className={`truncate block w-full ${isDone ? 'line-through' : ''}`}>
                                              {evt.isAlert && underlyingAlert ? (
                                                <>{underlyingAlert.student ? `[${underlyingAlert.student}] ` : ''}{evt.text}</>
                                              ) : (
                                                <>{evt.text}</>
                                              )}
                                            </span>
                                            {evt.isAlert ? (
                                              hidingAlertConfirmId === evt.alertId ? (
                                                <button
                                                  type="button"
                                                  data-confirm-zone="true"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIgnoredAlerts(prev => {
                                                      const next = new Set(prev);
                                                      next.add(evt.alertId);
                                                      return next;
                                                    });
                                                    setCalendarEvents(prev => prev.filter(e => e.id !== evt.id));
                                                    setHidingAlertConfirmId(null);
                                                    setCalendarTooltip(null);
                                                    
                                                    // Global Sync Delete
                                                    const alertObj = allSeasonsAlerts.find(a => a.id === evt.alertId) || allAlerts.find(a => a.id === evt.alertId);
                                                    if (alertObj && alertObj.studentId) {
                                                      setStudents(prev => prev.map(stu => {
                                                        if (stu.id !== alertObj.studentId) return stu;
                                                        let updated = { ...stu };
                                                        
                                                        if (alertObj.appId && alertObj.id.includes('-rl-')) {
                                                          const recId = alertObj.id.replace(alertObj.studentId + '-' + alertObj.appId + '-rl-', '');
                                                          updated.applications = updated.applications.map(app => {
                                                            if (app.id !== alertObj.appId) return app;
                                                            return { ...app, recommendations: { ...app.recommendations, [recId]: { ...(app.recommendations?.[recId] || {}), deadline: "" } } };
                                                          });
                                                        }
                                                        else if (alertObj.appId && alertObj.noteId) {
                                                          updated.applications = updated.applications.map(app => {
                                                            if (app.id !== alertObj.appId) return app;
                                                            return { ...app, notes: (app.notes || []).map(n => n.id === alertObj.noteId ? { ...n, deadline: "" } : n) };
                                                          });
                                                        }
                                                        else if (alertObj.appId && !alertObj.noteId && !alertObj.id.includes('-rl-')) {
                                                          updated.applications = updated.applications.map(app => {
                                                            if (app.id !== alertObj.appId) return app;
                                                            if (alertObj.id.endsWith('-deadline')) {
                                                              return { ...app, deadline: "" };
                                                            } else if (alertObj.id.endsWith('-open')) {
                                                              return { ...app, openDate: "" };
                                                            }
                                                            return { ...app, deadline: "" };
                                                          });
                                                        }
                                                        return updated;
                                                      }));
                                                    }
                                                  }}
                                                  className="absolute right-0.5 top-0.5 px-1 bg-red-600 hover:bg-red-700 text-white rounded text-[9px] font-semibold transition-colors z-20"
                                                  title="确认隐藏"
                                                >
                                                  确认？
                                                </button>
                                              ) : (
                                                <button
                                                  type="button"
                                                  data-confirm-zone="true"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCalendarTooltip(null);
                                                    setHidingAlertConfirmId(evt.alertId);
                                                  }}
                                                  className="absolute right-0.5 top-0.5 p-0.5 bg-white/90 hover:bg-red-50 text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                >
                                                  <X className="w-2.5 h-2.5" />
                                                </button>
                                              )
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setCalendarTooltip(null); setInlineConfirmModal(createCalendarNoteDeleteConfirmation(evt, () => setCalendarEvents(prev => prev.filter(item => item.id !== evt.id)))); }}
                                                className="absolute right-0.5 top-0.5 p-0.5 bg-white/90 hover:bg-red-50 text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                              >
                                                <X className="w-2.5 h-2.5" />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {addingHere && (
                                        <input
                                          autoFocus
                                          type="text"
                                          value={newTodoText}
                                          onChange={e => setNewTodoText(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter' && newTodoText.trim()) {
                                              setCalendarEvents(prev => [...prev, { id: 'cal-' + Date.now() + '-' + Math.random(), day: dayStr, hour, text: newTodoText.trim(), type: 'custom' }]);
                                              setAddingTodo(null); setNewTodoText('');
                                              lastBlurTimeRef.current = Date.now();
                                            }
                                            if (e.key === 'Escape') {
                                              setAddingTodo(null); setNewTodoText('');
                                              lastBlurTimeRef.current = Date.now();
                                            }
                                          }}
                                          onBlur={() => {
                                            if (newTodoText.trim()) setCalendarEvents(prev => [...prev, { id: 'cal-' + Date.now() + '-' + Math.random(), day: dayStr, hour, text: newTodoText.trim(), type: 'custom' }]);
                                            setAddingTodo(null); setNewTodoText('');
                                            lastBlurTimeRef.current = Date.now();
                                          }}
                                          className={`w-full text-[10px] border rounded px-1 py-0.5 outline-none ${isEndfieldTheme ? 'font-mono bg-cyan-950 text-cyan-100 border-cyan-500' : 'font-serif bg-white border-[#C68A4C]'}`}
                                          placeholder="记录事项... (Enter确认)"
                                          onClick={e => e.stopPropagation()}
                                        />
                                      )}
                                      {!addingHere && alertsHere.length === 0 && calEventsHere.length === 0 && (
                                        <span className={`absolute inset-0 flex items-center justify-center text-[11px] opacity-0 group-hover/cell:opacity-100 pointer-events-none ${isEndfieldTheme ? 'text-cyan-800 font-mono' : 'text-slate-300 font-serif'}`}>+</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Cross-week drop zone works in both directions. */}
                    {(
                      <div
                        className={`mx-4 mb-4 mt-3 rounded-xl border-2 border-dashed transition-all duration-200 flex items-center justify-center gap-3 py-3 cursor-default select-none ${
                          dragOverBlockKey === '__other_week__'
                            ? (isEndfieldTheme ? 'border-cyan-400 bg-cyan-900/20 shadow-[0_0_20px_rgba(34,211,238,0.15)]' : 'border-[#C68A4C] bg-[#C68A4C]/10 shadow-sm')
                            : (isEndfieldTheme ? 'border-cyan-900/40 hover:border-cyan-700/60 bg-transparent' : 'border-[#E5DEC9] hover:border-[#C68A4C]/40 bg-transparent')
                        }`}
                        onDragOver={(e) => { e.preventDefault(); setDragOverBlockKey('__other_week__'); }}
                        onDragLeave={() => setDragOverBlockKey(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverBlockKey(null);
                          const sourceType = e.dataTransfer.getData('sourceType');
                          const eventId = e.dataTransfer.getData('eventId');
                          const alertId = e.dataTransfer.getData('alertId');
                          const dayDelta = calendarWeekOffset === 0 ? 7 : -7;

                          if (sourceType === 'calendar' && eventId) {
                            setCalendarEvents(prev => prev.map(evt => {
                              if (evt.id !== eventId) return evt;
                              const evtDate = new Date(evt.day + 'T00:00:00');
                              evtDate.setDate(evtDate.getDate() + dayDelta);
                              const newDay = fmtDay(evtDate);
                              return { ...evt, day: newDay };
                            }));
                          } else if (sourceType === 'alert' && alertId) {
                            const alertObj = derivedCalendarEvents.find(a => a.id === alertId);
                            if (alertObj && alertObj.targetTimeMs) {
                              const override = calendarEvents.find(evt => evt.alertId === alertId);
                              const targetDate = override
                                ? new Date(`${override.day}T${String(override.hour || 9).padStart(2, '0')}:00:00`)
                                : new Date(alertObj.targetTimeMs);
                              targetDate.setDate(targetDate.getDate() + dayDelta);
                              const newDay = fmtDay(targetDate);
                              const newHour = targetDate.getHours() || 9;
                              handleGlobalAlertDrop(alertObj, newDay, newHour);
                            }
                          }
                          setCalendarWeekOffset(calendarWeekOffset === 0 ? 1 : 0);
                        }}
                      >
                        <span className={`text-lg ${dragOverBlockKey === '__other_week__' ? '🗓️' : '📅'}`}>{dragOverBlockKey === '__other_week__' ? '🗓️' : '📅'}</span>
                        <div className={`text-xs ${isEndfieldTheme ? 'text-cyan-600 font-mono tracking-widest' : 'text-slate-400 font-serif'}`}>
                          <span className={`font-semibold block ${isEndfieldTheme ? 'text-cyan-500' : 'text-slate-500'}`}>
                            {calendarWeekOffset === 0
                              ? (dragOverBlockKey === '__other_week__' ? '↓ 释放以移动到下周' : '→ 将事务气泡拖至此处，移动到下周同时间段')
                              : (dragOverBlockKey === '__other_week__' ? '↑ 释放以移回本周' : '← 将事务气泡拖至此处，移回本周同时间段')}
                          </span>
                          <span className="opacity-60">
                            {calendarWeekOffset === 0
                              ? `${fmtDay(nextWeekDays[0])} — ${fmtDay(nextWeekDays[6])}`
                              : `${fmtDay(thisMonday)} — ${fmtDay(new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + 6))}`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      </main>
      
      {/* Drag Ghost element used for clean custom drag images */}
      <div 
        id="drag-ghost" 
        className="fixed top-[-1000px] left-[-1000px] pointer-events-none rounded px-2.5 py-1 text-[10px] font-semibold font-serif leading-snug border z-[9999]"
        style={{ transform: 'translate(-50%, -50%)' }}
      />

      {/* Fixed-position calendar tooltip — escapes all overflow containers */}
      {calendarTooltip && (
        <div
          className="pointer-events-none font-serif"
          style={{
            position: 'fixed',
            left: calendarTooltip.x,
            top: calendarTooltip.y,
            transform: 'translateX(-50%) translateY(-100%)',
            zIndex: 99999,
            marginBottom: '6px',
          }}
        >
          <div className={`bg-slate-800 text-white text-[15px] rounded-lg shadow-2xl border border-slate-700/50 ${calendarTooltip.message ? 'p-2.5 w-60 whitespace-normal' : 'px-2.5 py-1.5 whitespace-nowrap'}`}>
            {calendarTooltip.message ? (
              <>
                <div className="font-bold border-b border-slate-700 pb-1 mb-1 text-amber-400">
                  {calendarTooltip.title}
                  {calendarTooltip.seasonName && <span className="ml-2 px-1.5 py-0.5 bg-slate-700/50 text-slate-300 rounded text-[13px]">{calendarTooltip.seasonName}</span>}
                </div>
                <div className="text-slate-300 leading-relaxed">{calendarTooltip.message}</div>
              </>
            ) : (
              <span>{calendarTooltip.title}</span>
            )}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
          </div>
        </div>
      )}
      {/* Global custom elegant inline confirm modal to replace window.confirm */}
      {inlineConfirmModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in animate-fade-in">
          <div className={`${isEndfieldTheme ? 'animate-endfield-summon bg-[#0a0a0c] border border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.15)] clip-corner-tl' : 'animate-pop-in bg-white rounded-xl shadow-2xl  border border-[#E5DEC9] animate-scaleUp'} p-6 max-w-sm w-full mx-4 relative`}>
            <h3 className="text-base font-serif font-bold text-slate-800 mb-2">{inlineConfirmModal.title}</h3>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed">{inlineConfirmModal.message}</p>
            <div className={`flex gap-3 ${inlineConfirmModal.dangerous ? 'justify-between' : 'justify-end'}`}>
              <button
                onClick={() => {
                  const onConfirm = inlineConfirmModal.onConfirm;
                  setInlineConfirmModal(null);
                  onConfirm();
                }}
                className={`px-3.5 py-1.5 text-white rounded-lg text-xs font-medium transition-colors shadow-sm ${inlineConfirmModal.dangerous ? 'order-first bg-red-600 hover:bg-red-700' : 'order-last bg-[#C68A4C] hover:bg-[#A97138]'}`}
              >
                {inlineConfirmModal.confirmLabel || '确认'}
              </button>
              <button
                onClick={() => setInlineConfirmModal(null)}
                className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs text-slate-600 font-medium transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
