import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FontScalePicker from '../components/FontScalePicker';
import {
  FONT_SCALE_STORAGE_KEY,
  applyFontScaleMode,
  loadFontScaleMode,
  normalizeFontScaleMode,
  saveFontScaleMode,
} from '../lib/fontScale';

describe('device-local font scaling', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.uiFontScale;
  });

  it('normalizes, applies and persists only supported modes', () => {
    expect(normalizeFontScaleMode('large')).toBe('large');
    expect(normalizeFontScaleMode('oversized')).toBe('auto');

    expect(applyFontScaleMode('small')).toBe('small');
    expect(document.documentElement.dataset.uiFontScale).toBe('small');

    saveFontScaleMode('large');
    expect(localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe('large');
    expect(loadFontScaleMode()).toBe('large');
  });

  it('offers automatic, small, standard and large choices in an accessible dialog', () => {
    const onChange = vi.fn();
    render(<FontScalePicker value="auto" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '字体大小设置，当前自动' }));
    expect(screen.getByRole('dialog', { name: '字体大小' })).toHaveAttribute('aria-modal', 'true');

    fireEvent.click(screen.getByRole('button', { name: '大' }));
    expect(onChange).toHaveBeenCalledWith('large');

    fireEvent.click(screen.getByRole('button', { name: '关闭字体大小设置' }));
    expect(screen.queryByRole('dialog', { name: '字体大小' })).not.toBeInTheDocument();
  });
});
