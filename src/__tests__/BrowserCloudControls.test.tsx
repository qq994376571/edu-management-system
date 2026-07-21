import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import App from '../App';
import * as cloudSync from '../lib/cloudSync';

const browserSession = {
  username: 'browser_teacher',
  token: 'browser-token',
  machineId: 'mobile-browser-id',
  expireTime: '2099-01-01T00:00:00',
  role: 'user' as const,
};

describe('browser-only cloud controls', () => {
  const originalElectron = (window as any).electronAPI;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    delete (window as any).electronAPI;
    vi.mocked(cloudSync.loadSession).mockReturnValue(browserSession);
    vi.mocked(cloudSync.syncDelta).mockResolvedValue({
      uploaded: { students: 0, seasons: 0 },
      downloaded: { students: [], seasons: [], settings: null, calendar: null },
      server_sync_time: '2026-07-18T06:00:00',
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'electronAPI', { value: originalElectron, writable: true, configurable: true });
    Object.defineProperty(window, 'matchMedia', { value: originalMatchMedia, writable: true, configurable: true });
  });

  const setPhoneViewport = (mobile: boolean) => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: mobile && (query.includes('max-width: 767px') || query.includes('max-width: 639px')),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  };

  it('shows save, refresh and logout in the phone header menu and flushes before logout', async () => {
    setPhoneViewport(true);
    render(<App />);

    const menuButton = await screen.findByRole('button', { name: '系统与云端' });
    fireEvent.click(menuButton);
    const dialog = screen.getByRole('dialog', { name: '系统与云端' });
    const menu = within(dialog);
    expect(menu.getByRole('button', { name: /保存到云端/ })).toBeInTheDocument();
    expect(menu.getByRole('button', { name: '从云端刷新' })).toBeInTheDocument();
    expect(menu.getByRole('button', { name: '退出系统' })).toBeInTheDocument();
    expect(screen.queryByText('选择存储文件夹')).not.toBeInTheDocument();

    fireEvent.click(menu.getByRole('button', { name: /保存到云端/ }));
    await waitFor(() => expect(cloudSync.syncDelta).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/云端保存成功/)).toBeInTheDocument();

    fireEvent.click(menu.getByRole('button', { name: '退出系统' }));
    await waitFor(() => expect(cloudSync.syncDelta).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(cloudSync.logoutSession).toHaveBeenCalledWith(browserSession));
    await waitFor(() => expect(cloudSync.clearSession).toHaveBeenCalled());
    expect(await screen.findByText('云端管理系统')).toBeInTheDocument();
  });

  it('shows direct cloud-only controls in a horizontal browser', async () => {
    setPhoneViewport(false);
    render(<App />);

    expect(await screen.findByRole('button', { name: /保存到云端/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '从云端刷新' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /退出系统/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /选择存储文件夹|更改文件夹|立即双端保存/ })).not.toBeInTheDocument();
  });

  it('keeps planner viewing read-only and returns to the assigned-student library without logout', async () => {
    setPhoneViewport(true);
    vi.mocked(cloudSync.loadSession).mockReturnValue({ ...browserSession, username: 'browser_planner', role: 'planner' });
    const assignedStudent = {
      teacher_username: 'teacher_target', student_id: 'student-1', name: '只读学生',
      status: '材料收集', season_id: 'season-1', season_name: '2026申请季',
      archived: false, planner_username: 'browser_planner', assigned_to_me: true,
      eligible: true, application_count: 0, updated_at: '2026-07-18T06:00:00',
    };
    vi.mocked(cloudSync.loadPlannerDashboard).mockResolvedValue({
      active_students: [assignedStudent], archived_students: [], server_time: '2026-07-18T06:10:00',
    });
    vi.mocked(cloudSync.loadPlannerStudent).mockResolvedValue({
      teacher_username: 'teacher_target',
      student: { student_id: 'student-1', data_json: JSON.stringify({
        id: 'student-1', name: '只读学生', seasonId: 'season-1', applications: [{
          id: 'app-1', school: '只读大学', program: '只读专业', status: '收集中',
          openDate: '2026-09-01T09:00', deadline: '2026-11-20T16:00',
          recommendations: {}, notes: [], specificDocs: [{ id: 'spec-1', label: 'SPEC_ONLY_READ', checked: false }],
        }],
        recommenders: [], docs: { info: [], basic: [], academic: [], writing: [], visa: [], unclassified: [] },
      }), updated_at: '2026-07-18T06:10:00' },
      seasons: [{ season_id: 'season-1', data_json: JSON.stringify({ id: 'season-1', name: '2026申请季' }), is_archived: false, updated_at: '2026-07-18T06:10:00' }],
      server_sync_time: '2026-07-18T06:10:00',
    });

    render(<App />);
    const viewButtons = await screen.findAllByRole('button', { name: /查看资料库/ });
    fireEvent.click(viewButtons[0]);
    expect(await screen.findByRole('button', { name: '返回我的学生' })).toBeInTheDocument();
    expect(screen.queryByText(/只读查看：/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /保存到云端/ })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('input[type="datetime-local"]')).toBeDisabled();
      expect(document.querySelector('select')).toBeDisabled();
      const mutationButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.planner-readonly button'))
        .filter(button => !button.closest('[data-readonly-allow="true"]'));
      expect(mutationButtons.length).toBeGreaterThan(0);
      expect(mutationButtons.every(button => button.disabled)).toBe(true);
    });
    const specificDocRow = screen.getByText('SPEC_ONLY_READ').closest('li');
    const specificDocToggle = specificDocRow?.querySelector<HTMLElement>('.cursor-pointer');
    expect(specificDocToggle).toBeTruthy();
    const toggleClassBefore = specificDocToggle!.className;
    fireEvent.click(specificDocToggle!);
    expect(specificDocToggle!.className).toBe(toggleClassBefore);
    expect(screen.getByRole('button', { name: '返回我的学生' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '返回我的学生' }));
    expect(await screen.findByRole('heading', { name: '规划老师学生管理' })).toBeInTheDocument();
    expect(cloudSync.logoutSession).not.toHaveBeenCalled();
  });

  it('gives a sub-admin save and logout controls inside their own teaching panel', async () => {
    setPhoneViewport(true);
    vi.mocked(cloudSync.loadSession).mockReturnValue({ ...browserSession, username: 'sub_admin_self', role: 'sub_admin' });
    vi.mocked(cloudSync.listUsers).mockResolvedValue({ users: [
      { username: 'sub_admin_self', remark: '教务老师', role: 'sub_admin', is_sub_admin: true },
    ] });
    vi.mocked(cloudSync.initLoad).mockResolvedValue({
      students: [], seasons: [], settings: null, calendar: null,
      server_sync_time: '2026-07-18T06:20:00',
    });

    render(<App />);
    const ownPanelButtons = await screen.findAllByRole('button', { name: '进入我的教务' });
    fireEvent.click(ownPanelButtons[0]);
    const menuButton = await screen.findByRole('button', { name: '系统与云端' });
    fireEvent.click(menuButton);
    const menu = within(screen.getByRole('dialog', { name: '系统与云端' }));

    expect(menu.getByRole('button', { name: /保存到云端/ })).toBeInTheDocument();
    expect(menu.getByRole('button', { name: '从云端刷新' })).toBeInTheDocument();
    expect(menu.getByRole('button', { name: '退出系统' })).toBeInTheDocument();
  });

  it('shows every non-primary account to a sub-admin and opens other accounts through an explicit lock', async () => {
    setPhoneViewport(true);
    vi.mocked(cloudSync.loadSession).mockReturnValue({ ...browserSession, username: 'sub_admin_self', role: 'sub_admin' });
    vi.mocked(cloudSync.listUsers).mockResolvedValue({ users: [
      { username: 'sub_admin_self', remark: '教务老师', role: 'sub_admin', is_sub_admin: true },
      { username: 'other_sub_admin', remark: '教务老师', role: 'sub_admin', is_sub_admin: true },
      { username: 'ordinary_teacher', remark: '教务老师', role: 'user' },
      { username: 'ordinary_account', remark: '', role: 'user' },
    ] });
    vi.mocked(cloudSync.adminInitLoad).mockResolvedValue({
      students: [], seasons: [], settings: null, calendar: null,
      server_sync_time: '2026-07-18T06:30:00',
    });

    render(<App />);

    expect(await screen.findByText('other_sub_admin')).toBeInTheDocument();
    expect(screen.getByText('ordinary_teacher')).toBeInTheDocument();
    expect(screen.getByText('ordinary_account')).toBeInTheDocument();
    expect(screen.queryByText('取消教务')).not.toBeInTheDocument();

    const otherCard = screen.getByText('other_sub_admin').closest('article')!;
    const accessButton = within(otherCard).getByRole('button', { name: '模拟进入教务' });
    expect(accessButton).toHaveClass('whitespace-nowrap', 'min-w-max', 'ml-auto');
    fireEvent.click(accessButton);

    await waitFor(() => expect(cloudSync.adminLockUser).toHaveBeenCalledWith('browser-token', 'other_sub_admin'));
    await waitFor(() => expect(cloudSync.adminInitLoad).toHaveBeenCalledWith('browser-token', 'other_sub_admin'));
    expect(await screen.findByText(/模拟登录模式/)).toBeInTheDocument();
  });

  it('clears the previous account calendar before opening an empty teacher account', async () => {
    setPhoneViewport(true);
    vi.mocked(cloudSync.loadSession).mockReturnValue({ ...browserSession, username: '994376571', role: 'admin' });
    vi.mocked(cloudSync.listUsers).mockResolvedValue({ users: [
      { username: 'brand_new_teacher', remark: '教务老师', role: 'user' },
    ] });
    vi.mocked(cloudSync.adminInitLoad).mockResolvedValue({
      students: [], seasons: [], settings: null, calendar: null,
      server_sync_time: '2026-07-20T01:00:00',
    });
    localStorage.setItem('教务数据', JSON.stringify({
      students: [{
        id: 'stale-student', name: 'CROSS_ACCOUNT_STUDENT_LEAK',
        seasonId: 'stale-season', applications: [],
      }],
      seasons: [{
        id: 'stale-season', name: 'CROSS_ACCOUNT_SEASON_LEAK',
        start: '2025-01-01', end: '2025-12-31',
      }],
      activeSeasonId: 'stale-season',
      calendarEvents: [{
        id: 'stale-calendar-event',
        day: new Date().toISOString().slice(0, 10),
        hour: 10,
        text: 'CROSS_ACCOUNT_CALENDAR_LEAK',
        type: 'custom',
      }],
    }));

    render(<App />);
    const targetCard = (await screen.findByText('brand_new_teacher')).closest('article')!;
    const accessButton = within(targetCard).getAllByRole('button')
      .find((button) => Boolean(button.getAttribute('title')));
    expect(accessButton).toBeTruthy();
    fireEvent.click(accessButton!);

    await waitFor(() => expect(cloudSync.adminInitLoad).toHaveBeenCalledWith('browser-token', 'brand_new_teacher'));
    await screen.findByTestId('main-scroll-container');
    expect(screen.queryByText('CROSS_ACCOUNT_CALENDAR_LEAK')).not.toBeInTheDocument();
    expect(screen.queryByText('CROSS_ACCOUNT_STUDENT_LEAK')).not.toBeInTheDocument();
    expect(screen.queryByText('CROSS_ACCOUNT_SEASON_LEAK')).not.toBeInTheDocument();
    expect(screen.queryByText('2025-2026 申请季')).not.toBeInTheDocument();
  });

  it('lets a primary administrator simulate a planner dashboard by real account identity', async () => {
    setPhoneViewport(true);
    vi.mocked(cloudSync.loadSession).mockReturnValue({ ...browserSession, username: '994376571', role: 'admin' });
    vi.mocked(cloudSync.listUsers).mockResolvedValue({ users: [
      { username: 'planner_target', remark: '规划老师', role: 'planner' },
      { username: 'unassigned_target', remark: '', role: 'user' },
    ] });
    vi.mocked(cloudSync.loadPlannerDashboard).mockResolvedValue({
      active_students: [], archived_students: [], server_time: '2026-07-19T00:00:00',
    });

    render(<App />);
    fireEvent.click(await screen.findByText('所有注册用户'));
    fireEvent.click(await screen.findByRole('button', { name: '模拟进入规划' }));
    await waitFor(() => expect(cloudSync.adminLockUser).toHaveBeenCalledWith('browser-token', 'planner_target'));
    expect(await screen.findByRole('heading', { name: '规划老师学生管理' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回管理后台' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回管理后台' }));
    await waitFor(() => expect(cloudSync.adminUnlockUser).toHaveBeenCalledWith('browser-token', 'planner_target'));
    expect(await screen.findByText('所有注册用户')).toBeInTheDocument();
  });

  it('uses a normal horizontal swipe to move among the four phone pages', async () => {
    setPhoneViewport(true);
    render(<App />);

    const main = await screen.findByTestId('main-scroll-container');
    const dashboardButton = screen.getByRole('button', { name: '智能预警仪表盘' });
    expect(dashboardButton).not.toHaveClass('bg-[#C68A4C]');

    fireEvent.pointerDown(main, { pointerId: 21, clientX: 330, clientY: 250 });
    fireEvent.pointerUp(main, { pointerId: 21, clientX: 80, clientY: 260 });

    await waitFor(() => expect(dashboardButton).toHaveClass('bg-[#C68A4C]'));
  });
});
