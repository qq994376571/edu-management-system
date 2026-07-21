import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import App from '../App';

describe('Empirical Verification of Season Recycle Bin (R1) & Dropdown selectors (R2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).mockElectronState.reset();
  });

  it.skip('Scenario 1: Deleting an archived season: mock window prompt return value to verify behavior', async () => {
    // Setup mock data in stored path
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' },
        { id: 'season_archived', name: '2026-2027 Archived Season', start: '2026-09-01', end: '2027-09-30', isArchived: true }
      ],
      students: [
        { id: 'STU_active', name: 'Active Student', seasonId: 'season_active', applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] } },
        { id: 'STU_archived', name: 'Archived Student', seasonId: 'season_archived', applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] } }
      ],
      activeSeasonId: 'season_active'
    };

    (globalThis as any).mockElectronState.getFiles()['C:\\test-save-delete'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-save-delete');

    render(<App />);
    await screen.findByText('● 已配置');

    // 1. First delete attempt: prompt returns invalid value (e.g. 'cancel' or 'wrong')
    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('申请季配置'));
    fireEvent.click(screen.getByText('进入已归档申请季 (回收站)'));

    const deleteButtons = screen.getAllByTitle('永久删除');
    expect(deleteButtons.length).toBe(1);

    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('wrong_confirmation');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    fireEvent.click(deleteButtons[0]);

    // Check alert was called and no deletion occurred in store
    expect(promptSpy).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('已取消删除操作');

    // Close and reopen or just verify state has not changed
    let savedData = (globalThis as any).mockElectronState.getFiles()['C:\\test-save-delete'];
    expect(savedData.seasons.find((s: any) => s.id === 'season_archived')).toBeDefined();
    expect(savedData.students.find((s: any) => s.id === 'STU_archived')).toBeDefined();

    // 2. Second delete attempt: prompt returns '确认删除'
    promptSpy.mockReturnValue('确认删除');
    fireEvent.click(deleteButtons[0]);

    // Verify deletion has occurred
    savedData = (globalThis as any).mockElectronState.getFiles()['C:\\test-save-delete'];
    expect(savedData.seasons.find((s: any) => s.id === 'season_archived')).toBeUndefined();
    expect(savedData.students.find((s: any) => s.id === 'STU_archived')).toBeUndefined();
    expect(savedData.students.length).toBe(1);
    expect(savedData.students[0].id).toBe('STU_active');
  });

  it('Scenario 2: Restoring an archived season updates isArchived to false, activeSeasonId to restored, and exits recycle bin mode', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' },
        { id: 'season_archived', name: '2026-2027 Archived Season', start: '2026-09-01', end: '2027-09-30', isArchived: true }
      ],
      students: [],
      activeSeasonId: 'season_active'
    };

    (globalThis as any).mockElectronState.getFiles()['C:\\test-save-restore'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-save-restore');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('申请季配置'));
    fireEvent.click(screen.getByText('进入已归档申请季 (回收站)'));

    const restoreButtons = screen.getAllByTitle('恢复申请季');
    expect(restoreButtons.length).toBe(1);

    fireEvent.click(restoreButtons[0]);

    // Check that state updated back in storage
    const savedData = (globalThis as any).mockElectronState.getFiles()['C:\\test-save-restore'];
    const restoredSeason = savedData.seasons.find((s: any) => s.id === 'season_archived');
    expect(restoredSeason.isArchived).toBe(false);
    expect(savedData.activeSeasonId).toBe('season_archived');

    // Close season configurations modal
    fireEvent.click(screen.getByText('完成'));

    // Verify app has exited Recycle Bin mode (the warning banner is not present)
    expect(screen.queryByText(/您当前处于已归档申请季 \(回收站\) 视图/)).toBeNull();

    // Verify restored season is selected in dropdown
    fireEvent.click(screen.getByText('学生档案和资料'));
    const select = screen.getAllByRole('combobox')[0];
    expect(select).toHaveValue('season_archived');
  });

  it('Scenario 3: Dropdown selectors hide archived seasons when isRecycleBinMode is false', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' },
        { id: 'season_archived', name: '2026-2027 Archived Season', start: '2026-09-01', end: '2027-09-30', isArchived: true }
      ],
      students: [],
      activeSeasonId: 'season_active'
    };

    (globalThis as any).mockElectronState.getFiles()['C:\\test-save-dropdown'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-save-dropdown');

    render(<App />);
    await screen.findByText('● 已配置');

    // Verify when isRecycleBinMode is false (the default state)
    // The combobox should only show active seasons
    fireEvent.click(screen.getByText('学生档案和资料'));
    const select = screen.getAllByRole('combobox')[0];
    const options = select.querySelectorAll('option');
    expect(options.length).toBe(1);
    expect(options[0].value).toBe('season_active');
    expect(options[0].textContent).toBe('2025-2026 Active Season');
  });

  it('Scenario 4: an empty recycle bin never falls back to active-season students', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active', name: 'Only Active Season', start: '2025-09-01', end: '2026-09-30' }
      ],
      students: [
        { id: 'STU_active_only', name: '不应出现在空归档中的学生', seasonId: 'season_active', applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] } }
      ],
      activeSeasonId: 'season_active'
    };

    (globalThis as any).mockElectronState.getFiles()['C:\\test-empty-recycle-bin'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-empty-recycle-bin');

    render(<App />);
    await screen.findByText('● 已配置');
    fireEvent.click(screen.getByText('学生档案和资料'));
    expect(screen.getAllByText('不应出现在空归档中的学生').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('申请季配置'));
    fireEvent.click(screen.getByText('进入已归档申请季 (回收站)'));
    fireEvent.click(screen.getByText('完成'));

    expect(screen.queryByText('不应出现在空归档中的学生')).not.toBeInTheDocument();
    expect(screen.getByText('暂无学生档案，点击右上角录入')).toBeInTheDocument();
    expect(screen.getByText(/活跃学生档案 \(暂无已归档申请季\)/)).toBeInTheDocument();
  });
});
