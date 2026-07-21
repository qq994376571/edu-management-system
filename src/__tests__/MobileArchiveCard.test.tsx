import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const fixture = {
  version: 1,
  activeSeasonId: 'mobile-season',
  seasons: [{ id: 'mobile-season', name: '2025-2026 申请季', start: '2025-09-01', end: '2026-09-30' }],
  students: [{
    id: 'mobile-student',
    seasonId: 'mobile-season',
    name: '手机布局学生',
    status: '等待结果',
    precedingSchoolLocation: '中国大陆',
    applicationRegion: '香港',
    precedingStage: '本科',
    applicationStage: '硕士',
    docs: { info: [], basic: [], academic: [], writing: [], visa: [], unclassified: [] },
    recommenders: [],
    applications: [{
      id: 'mobile-app', school: '测试大学', program: '测试专业', tier: '稳妥档', status: '收集中',
      openDate: '', deadline: '', portal: {}, recommendations: {}, specificDocs: [],
      notes: [{ id: 'optional-note', text: '尚未决定时间', deadline: '' }],
    }],
  }],
};

describe('mobile archive card and optional note layout', () => {
  const originalElectron = (window as Window & { electronAPI?: unknown }).electronAPI;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('教务数据', JSON.stringify(fixture));
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 767px') || query.includes('max-width: 639px'),
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

  it('keeps both mappings and all four safe actions on one compact row', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '学生档案和资料' }));

    const card = (await screen.findByText('手机布局学生')).closest('article');
    expect(card).not.toBeNull();
    const regionRow = within(card as HTMLElement).getByText('学术地区').parentElement;
    const stageRow = within(card as HTMLElement).getByText('学术状态').parentElement;
    expect(regionRow).toHaveClass('grid');
    expect(regionRow).toHaveTextContent('学术地区中国大陆→目标地区香港');
    expect(stageRow).toHaveClass('grid');
    expect(stageRow).toHaveTextContent('学术状态本科→目标状态硕士');

    const actions = (card as HTMLElement).querySelector('.mobile-student-card-actions');
    expect(actions).not.toBeNull();
    const buttons = within(actions as HTMLElement).getAllByRole('button');
    expect(buttons.map(button => button.textContent)).toEqual(['删除', '编辑资料', '手动归档', '进入档案']);
    buttons.forEach(button => expect(button).toHaveClass('whitespace-nowrap'));

    fireEvent.click(buttons[0]);
    expect(await screen.findByText('永久删除档案')).toBeInTheDocument();
    expect(screen.getByText(/此操作无法撤销/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '永久删除' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    fireEvent.click(buttons[3]);
    const noteText = await screen.findByText('尚未决定时间');
    const noteRow = noteText.closest('[data-mobile-application-note="true"]');
    expect(noteRow).not.toBeNull();
    expect(within(noteRow as HTMLElement).getByRole('button', { name: '设置提醒时间' })).toBeVisible();
    expect((noteRow as HTMLElement).querySelector('input[type="datetime-local"]')).toBeNull();
  });

  it('lets Safari cancel an empty picker and clear a selected value explicitly', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '学生档案和资料' }));
    const card = (await screen.findByText('手机布局学生')).closest('article');
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: '进入档案' }));

    const noteText = await screen.findByText('尚未决定时间');
    const noteRow = noteText.closest('[data-mobile-application-note="true"]');
    expect(noteRow).not.toBeNull();
    const trigger = within(noteRow as HTMLElement).getByRole('button', { name: '设置提醒时间' });

    fireEvent.click(trigger);
    let dialog = screen.getByRole('dialog', { name: '设置尚未决定时间提醒时间' });
    fireEvent.change(within(dialog).getByLabelText('尚未决定时间提醒时间日期'), { target: { value: '2026-07-22' } });
    fireEvent.change(within(dialog).getByLabelText('尚未决定时间提醒时间时刻'), { target: { value: '15:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(within(noteRow as HTMLElement).getByRole('button', { name: '设置提醒时间' })).toBeVisible();

    fireEvent.click(within(noteRow as HTMLElement).getByRole('button', { name: '设置提醒时间' }));
    dialog = screen.getByRole('dialog', { name: '设置尚未决定时间提醒时间' });
    fireEvent.change(within(dialog).getByLabelText('尚未决定时间提醒时间日期'), { target: { value: '2026-07-22' } });
    fireEvent.change(within(dialog).getByLabelText('尚未决定时间提醒时间时刻'), { target: { value: '15:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '确定' }));
    await waitFor(() => expect(within(noteRow as HTMLElement).getByRole('button', { name: /2026\/07\/22 15:00/ })).toBeVisible());
    fireEvent.click(within(noteRow as HTMLElement).getByRole('button', { name: '清除尚未决定时间提醒时间' }));
    await waitFor(() => expect(within(noteRow as HTMLElement).getByRole('button', { name: '设置提醒时间' })).toBeVisible());
  });
});
