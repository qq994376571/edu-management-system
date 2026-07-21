import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const localDay = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

describe('calendar hide and source-change restore workflow', () => {
  const originalElectron = (window as Window & { electronAPI?: unknown }).electronAPI;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    const today = localDay(new Date());
    localStorage.clear();
    localStorage.setItem('教务数据', JSON.stringify({
      activeSeasonId: 'hide-season',
      seasons: [{ id: 'hide-season', name: '隐藏恢复测试季', start: today, end: today }],
      students: [{
        id: 'hide-student', seasonId: 'hide-season', name: '隐藏测试学生', status: '等待结果',
        docs: { info: [], basic: [], academic: [], writing: [], visa: [], unclassified: [] },
        recommenders: [],
        applications: [{
          id: 'hide-app', school: '隐藏测试大学', program: '测试专业', tier: '稳妥档', status: '收集中',
          openDate: '', deadline: '', portal: {}, recommendations: {}, specificDocs: [],
          notes: [{ id: 'hide-note', text: '恢复隐藏提醒', deadline: `${today}T09:00` }],
        }],
      }],
    }));
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'electronAPI', { configurable: true, writable: true, value: originalElectron });
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: originalMatchMedia });
    vi.restoreAllMocks();
  });

  it('hides from calendar and warnings, then restores only after the source time changes', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: '每周待办日历' })).toBeInTheDocument();

    fireEvent.click(await screen.findByTitle('隐藏气泡'));
    expect(await screen.findByText('隐藏这条提醒？')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '隐藏提醒' }));
    await waitFor(() => expect(screen.queryByTitle('隐藏气泡')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '智能预警仪表盘' }));
    await waitFor(() => expect(screen.queryByText('恢复隐藏提醒')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '学生档案和资料' }));
    const row = (await screen.findByText('隐藏测试学生')).closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '处理档案' }));
    const note = await screen.findByText('恢复隐藏提醒');
    const noteRow = note.closest('div.group');
    expect(noteRow).not.toBeNull();
    fireEvent.click(within(noteRow as HTMLElement).getByRole('button', { name: /恢复隐藏提醒提醒时间：/ }));
    const dialog = screen.getByRole('dialog', { name: '设置恢复隐藏提醒提醒时间' });
    const today = localDay(new Date());
    fireEvent.change(within(dialog).getByLabelText('恢复隐藏提醒提醒时间日期'), { target: { value: today } });
    fireEvent.change(within(dialog).getByLabelText('恢复隐藏提醒提醒时间时刻'), { target: { value: '10:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '确定' }));

    fireEvent.click(screen.getByRole('button', { name: '每周待办日历' }));
    expect(await screen.findByTitle('隐藏气泡')).toBeInTheDocument();
  });
});
