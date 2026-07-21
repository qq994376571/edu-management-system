import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { FontScaleMode } from '../lib/fontScale';

const OPTIONS: Array<{ value: FontScaleMode; label: string; detail: string }> = [
  { value: 'auto', label: '自动', detail: '按屏幕宽度在安全范围内小幅调整' },
  { value: 'small', label: '小', detail: '适合希望同屏查看更多内容' },
  { value: 'standard', label: '标准', detail: '固定使用默认字号' },
  { value: 'large', label: '大', detail: '提高文字和控件的可读性' },
];

const LABELS: Record<FontScaleMode, string> = {
  auto: '自动', small: '小', standard: '标准', large: '大',
};

interface FontScalePickerProps {
  value: FontScaleMode;
  onChange: (value: FontScaleMode) => void;
  isEndfieldTheme?: boolean;
  compact?: boolean;
}

export default function FontScalePicker({ value, onChange, isEndfieldTheme = false, compact = true }: FontScalePickerProps) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasOpenedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    queueMicrotask(() => closeRef.current?.focus());
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      hasOpenedRef.current = true;
    } else if (hasOpenedRef.current) {
      triggerRef.current?.focus?.({ preventScroll: true });
    }
  }, [open]);

  const buttonClass = isEndfieldTheme
    ? 'border-[#FF6A00]/45 bg-[#17181c] text-[#FF6A00] hover:bg-[#FF6A00]/10 font-mono'
    : 'border-[#E5DEC9] bg-[#FAF8F5] text-[#A97138] hover:bg-amber-50 font-serif';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-readonly-allow="true"
        onClick={() => setOpen(true)}
        aria-label={`字体大小设置，当前${LABELS[value]}`}
        title={`字体大小：${LABELS[value]}`}
        className={`inline-flex shrink-0 items-center justify-center rounded-lg border shadow-sm transition-colors ${buttonClass} ${compact ? 'h-8 min-w-8 px-2 text-xs font-bold' : 'w-full gap-2 px-3 py-2 text-sm'}`}
      >
        <span aria-hidden="true" className="text-[11px] leading-none">A</span>
        <span aria-hidden="true" className="text-sm leading-none">a</span>
        {!compact && <span className="ml-1">字体：{LABELS[value]}</span>}
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[520] flex items-center justify-center bg-slate-950/35 p-4"
          onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="font-scale-title"
            className={`w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl ${isEndfieldTheme ? 'border-[#FF6A00]/45 bg-[#101115] text-stone-200' : 'border-[#E5DEC9] bg-[#FAF8F5] text-slate-800'}`}
          >
            <header className={`flex items-center justify-between border-b px-4 py-3 ${isEndfieldTheme ? 'border-[#FF6A00]/25' : 'border-[#E5DEC9]'}`}>
              <div>
                <h2 id="font-scale-title" className="font-bold">字体大小</h2>
                <p className="mt-0.5 text-xs opacity-60">仅保存在当前设备，不影响教务数据</p>
              </div>
              <button data-readonly-allow="true" ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="关闭字体大小设置" className="rounded-lg p-2 opacity-60 hover:bg-black/5 hover:opacity-100"><X className="h-4 w-4" /></button>
            </header>
            <div className="grid grid-cols-2 gap-2 p-4">
              {OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  data-readonly-allow="true"
                  aria-label={option.label}
                  aria-pressed={value === option.value}
                  onClick={() => onChange(option.value)}
                  className={`min-h-20 rounded-xl border p-3 text-left transition-colors ${value === option.value
                    ? (isEndfieldTheme ? 'border-[#FF6A00] bg-[#FF6A00]/10' : 'border-[#C68A4C] bg-amber-50')
                    : (isEndfieldTheme ? 'border-stone-800 hover:border-stone-600' : 'border-[#E5DEC9] bg-white hover:border-[#C68A4C]/60')}`}
                >
                  <span className="block font-bold">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 opacity-65">{option.detail}</span>
                </button>
              ))}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
