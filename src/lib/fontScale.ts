export type FontScaleMode = 'auto' | 'small' | 'standard' | 'large';

export const FONT_SCALE_STORAGE_KEY = 'edu_progress_font_scale';

const FONT_SCALE_MODES: FontScaleMode[] = ['auto', 'small', 'standard', 'large'];

export function normalizeFontScaleMode(value: unknown): FontScaleMode {
  return FONT_SCALE_MODES.includes(value as FontScaleMode) ? value as FontScaleMode : 'auto';
}

export function loadFontScaleMode(): FontScaleMode {
  try {
    return normalizeFontScaleMode(localStorage.getItem(FONT_SCALE_STORAGE_KEY));
  } catch {
    return 'auto';
  }
}

export function applyFontScaleMode(value: unknown): FontScaleMode {
  const mode = normalizeFontScaleMode(value);
  if (typeof document !== 'undefined') document.documentElement.dataset.uiFontScale = mode;
  return mode;
}

export function saveFontScaleMode(value: unknown): FontScaleMode {
  const mode = applyFontScaleMode(value);
  try {
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, mode);
  } catch {}
  return mode;
}

export function initializeFontScale(): FontScaleMode {
  return applyFontScaleMode(loadFontScaleMode());
}
