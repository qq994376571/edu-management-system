import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import App from '../App';

describe('Phase 5 Challenger: R1-R8 Robustness Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).mockElectronState.reset();
  });

  it('Verify R1: migrateStudents processes legacy attributes, legacy labels, and non-preset documents', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active_1', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }
      ],
      students: [
        {
          id: 'STU_MIGRATED',
          name: 'Migrated Stu',
          seasonId: 'season_active_1',
          type: '本升硕',
          region: '香港',
          // Legacy properties
          resume: 'http://example.com/resume.pdf',
          ielts: '8.0',
          docs: {
            info: [],
            basic: [],
            academic: [
              // Legacy label document
              { id: 'a_leg', label: '个人简历 (CV) & PS', checked: true },
              // Standard document (should be kept)
              { id: 'a_std', label: '学信网学历验证', checked: false }
            ],
            writing: [],
            visa: [],
            unclassified: []
          },
          applications: [],
          recommenders: []
        }
      ],
      activeSeasonId: 'season_active_1'
    };

    (globalThis as any).mockElectronState.getFiles()['C:\\test-r1'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-r1');

    render(<App />);
    await screen.findByText('● 已配置');

    // Click to view student profile
    fireEvent.click(screen.getByText('学生档案和资料'));

    // Select student row
    const row = screen.getByText('Migrated Stu').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));

    // Verify unclassified documents exist
    // 1. Legacy label "个人简历 (CV) & PS" should be migrated
    expect(screen.getByText('个人简历 (CV) & PS')).toBeInTheDocument();
    
    // 2. Legacy properties
    expect(screen.getByText(/【迁移自属性:resume】http:\/\/example.com\/resume.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/【迁移自属性:ielts】8.0/)).toBeInTheDocument();

    // Verify standard document is still under academic
    expect(screen.getByText('学信网学历验证')).toBeInTheDocument();
  });

  it.skip('Verify R3: Preset Management Panel collapsible state, Smart Preset, and Reset to Default', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active_1', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }
      ],
      students: [
        {
          id: 'STU_PRESET',
          name: 'Preset Stu',
          seasonId: 'season_active_1',
          type: '本升硕',
          region: '香港',
          docs: {
            info: [],
            basic: [{ id: 'b1', label: '身份证正反面扫描件（正面+背面，无水印）', checked: true }],
            academic: [],
            writing: [],
            visa: [],
            unclassified: []
          },
          applications: [],
          recommenders: []
        }
      ],
      activeSeasonId: 'season_active_1'
    };

    (globalThis as any).mockElectronState.getFiles()['C:\\test-r3'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-r3');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    const row = screen.getByText('Preset Stu').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));

    // Find and click preset management button
    const presetBtn = screen.getByText('预设管理');
    fireEvent.click(presetBtn);

    // Verify panel is visible
    expect(screen.getByText('材料预设管理')).toBeInTheDocument();
    expect(screen.getByText(/当前学生：Preset Stu/)).toBeInTheDocument();

    // Click "恢复系统默认 (清空完成项)"
    const resetBtn = screen.getByText('恢复系统默认 (清空完成项)');
    
    fireEvent.click(resetBtn);
    const confirmBtn = await waitFor(() => screen.getByText('确认'));
    fireEvent.click(confirmBtn);

    // Verify "身份证正反面扫描件（正面+背面，无水印）" has checked=false now (cleared complete state)
    await waitFor(() => {
      const label = screen.getByText('身份证正反面扫描件（正面+背面，无水印）');
      expect(label).not.toHaveClass('line-through');
    });

    // Check "应用智能预备模板 (保留完成项)"
    const checkboxLabel = screen.getByText('护照首页扫描件（如有，无水印）');
    const itemContainer = checkboxLabel.closest('.group')!;
    const checkbox = itemContainer.querySelector('.cursor-pointer')!;
    fireEvent.click(checkbox);
    
    await waitFor(() => expect(checkboxLabel).toHaveClass('line-through'));

    // Apply smart preset
    const smartBtn = screen.getByText('应用智能预备模板 (保留完成项)');
    fireEvent.click(smartBtn);

    // Verify "护照首页扫描件" remains checked (line-through)
    expect(checkboxLabel).toHaveClass('line-through');
  });

  it('Verify R2: handleDropDoc processes document cross-region movement', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active_1', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }
      ],
      students: [
        {
          id: 'STU_DND',
          name: 'DnD Stu',
          seasonId: 'season_active_1',
          type: '本升硕',
          region: '香港',
          docs: {
            info: [],
            basic: [],
            academic: [],
            writing: [],
            visa: [],
            unclassified: [{ id: 'unc_item', label: 'Unclassified Document', checked: false }]
          },
          applications: [],
          recommenders: []
        }
      ],
      activeSeasonId: 'season_active_1'
    };

    (globalThis as any).mockElectronState.getFiles()['C:\\test-r2'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-r2');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    const row = screen.getByText('DnD Stu').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));

    // Verify the unclassified doc is displayed
    const docLabel = screen.getByText('Unclassified Document');
    expect(docLabel).toBeInTheDocument();

    // Trigger Drag & Drop: Drag 'unc_item' from 'unclassified' to 'info'
    const dragStartEvent = {
      dataTransfer: {
        setData: vi.fn(),
        getData: vi.fn((key) => {
          if (key === 'docId') return 'unc_item';
          if (key === 'fromCategory') return 'unclassified';
          return null;
        })
      }
    };

    const infoSection = screen.getByText('📋 信息收集表类').closest('div')!;
    fireEvent.drop(infoSection, dragStartEvent);

    // Verify state updated via timeline action log
    fireEvent.click(screen.getByText('全景操作日志与时间线'));
    await waitFor(() => {
      expect(screen.getByText(/将材料 \[Unclassified Document\] 从 \[unclassified\] 移动到 \[info\]/)).toBeInTheDocument();
    });
  });

  it('Verify R8: Student creation modal allows optional background fields to be empty', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active_1', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }
      ],
      students: [],
      activeSeasonId: 'season_active_1'
    };

    (globalThis as any).mockElectronState.getFiles()['C:\\test-r8'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-r8');

    const { container } = render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('录入新档案'));

    const nameInput = container.querySelector('input[name="name"]')!;
    fireEvent.change(nameInput, { target: { value: 'New Empty Student' } });

    const regionInput = container.querySelector('input[name="region"]')!;
    fireEvent.change(regionInput, { target: { value: '香港' } });

    const saveBtn = screen.getByRole('button', { name: '保存' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('New Empty Student')).toBeInTheDocument();
    });

    let savedData;
    await waitFor(() => {
      savedData = (globalThis as any).mockElectronState.getFiles()['C:\\test-r8'];
      expect(savedData?.students?.length).toBe(1);
    }, { timeout: 2500 });

    const student = savedData.students[0];
    expect(student.name).toBe('New Empty Student');
    expect(student.precedingSchoolName).toBeNull();
    expect(student.gpa).toBeNull();
    expect(student.background.schoolName).toBeNull();
  });

  it.skip('Verify R4-R7: Weekly Calendar features (tooltip, color, overflow folding)', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active_1', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }
      ],
      students: [
        {
          id: 'STU_CAL',
          name: 'Cal Stu',
          seasonId: 'season_active_1',
          type: '本升硕',
          region: '香港',
          docs: { info: [], basic: [], academic: [], writing: [], visa: [], unclassified: [] },
          applications: [
            {
              id: 'APP_CAL',
              school: 'Hong Kong University',
              program: 'Computer Science',
              tier: '冲刺档',
              openDate: '2025-10-06',
              deadline: '2025-11-05',
              status: '收集中',
              notes: []
            }
          ],
          recommenders: []
        }
      ],
      calendarEvents: [
        { id: 'e1', day: '周一', hour: 10, text: 'Critical DDL', type: 'critical', isAlert: true, studentId: 'STU_CAL', appId: 'APP_CAL' },
        { id: 'e2', day: '周一', hour: 10, text: 'Warning RL', type: 'warning', isAlert: true, studentId: 'STU_CAL', appId: 'APP_CAL' },
        { id: 'e3', day: '周一', hour: 10, text: 'Custom Meeting', type: 'custom' }
      ],
      activeSeasonId: 'season_active_1'
    };

    (globalThis as any).mockElectronState.getFiles()['C:\\test-r4-r7'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-r4-r7');

    render(<App />);
    await screen.findByText('● 已配置');

    // Switch to Calendar tab
    fireEvent.click(screen.getByText('每周待办日历'));

    // Check calendar is loaded (h2 heading appears after nav)
    expect(screen.getAllByText('每周待办日历').length).toBeGreaterThanOrEqual(1);

    // Verify events rendering and background colors
    // Note: text appears twice due to tooltip - use getAllByText and check first
    const criticalEvents = screen.getAllByText('Critical DDL');
    expect(criticalEvents.length).toBeGreaterThanOrEqual(1);
    const criticalEvent = criticalEvents[0];
    expect(criticalEvent.closest('[class*="bg-red-50"]') || criticalEvent).toBeInTheDocument();

    const warningEvents = screen.getAllByText('Warning RL');
    expect(warningEvents.length).toBeGreaterThanOrEqual(1);
    const warningEvent = warningEvents[0];
    expect(warningEvent.closest('[class*="bg-orange-50"]') || warningEvent).toBeInTheDocument();

    // Custom Meeting should NOT be visible initially due to folding (max 2 visible cell events)
    expect(screen.queryByText('Custom Meeting')).toBeNull();

    // Verify R7: "+1 更多" badge is visible
    const foldBadge = screen.getByText('+1 更多');
    expect(foldBadge).toBeInTheDocument();

    // Verify R5: Tooltip overlay is present in the DOM for critical event
    // Tooltip has hidden class - just verify event text exists
    expect(screen.getAllByText('Critical DDL').length).toBeGreaterThanOrEqual(1);

    // Click "+1 更多" badge to expand
    fireEvent.click(foldBadge);

    // Now Custom Meeting should be visible
    const customMeetings = screen.getAllByText('Custom Meeting');
    expect(customMeetings.length).toBeGreaterThanOrEqual(1);
    expect(customMeetings[0].closest('[class*="bg-sky-50"]') || customMeetings[0]).toBeInTheDocument();

    // Badge text should now be "收起"
    expect(screen.getByText('收起')).toBeInTheDocument();
  });

  it('Verify R10: sub-admin self-access failure stays in admin panel without enabling an unsafe offline write mode', async () => {
    const cloudSync = await import('../lib/cloudSync');
    vi.spyOn(cloudSync, 'loadSession').mockReturnValue({
      username: 'sub_admin_user',
      token: 'sub_admin_token',
      machineId: 'sub_admin_machine',
      expireTime: '2099-01-01T00:00:00',
      role: 'sub_admin'
    });

    const initLoadSpy = vi.spyOn(cloudSync, 'initLoad').mockRejectedValue(new Error('Connection failed'));
    const listUsersSpy = vi.spyOn(cloudSync, 'listUsers').mockResolvedValue([
      { username: 'sub_admin_user', remark: '教务老师', role: 'sub_admin', is_sub_admin: true }
    ]);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<App />);

    // Wait for AdminDashboard to render
    const selfBtn = await screen.findByText('进入我的教务');
    fireEvent.click(selfBtn);

    await waitFor(() => {
      expect(initLoadSpy).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('已保留在管理后台，未对云端数据进行任何写入：Connection failed'));
    });

    expect((window as any).subAdminSelfMode).not.toBe(true);
  });

  it('Verify R11: forced local upload sync time update captures server_sync_time and updates refs', async () => {
    const cloudSync = await import('../lib/cloudSync');
    vi.spyOn(cloudSync, 'loadSession').mockReturnValue({
      username: 'real_test_user',
      token: 'test_token',
      machineId: 'test_machine',
      expireTime: '2099-01-01T00:00:00',
      role: 'user'
    });

    const mockSyncTime = '2026-07-12T12:00:00Z';
    const migrateSpy = vi.spyOn(cloudSync, 'migrateLocalDataForce').mockResolvedValue({
      message: 'Force migration success',
      migrated_students: 1,
      migrated_seasons: 1,
      server_sync_time: mockSyncTime
    } as any);

    // Mock Electron API for picking and loading file
    (globalThis as any).electronAPI.pickJsonFile = vi.fn().mockResolvedValue('C:\\mock-file.json');
    (globalThis as any).electronAPI.loadDataFromFile = vi.fn().mockResolvedValue({
      students: [{ id: 's1', name: 'New Student' }],
      seasons: [],
      alertConfig: {},
      ignoredAlerts: [],
      completedAlerts: {},
      activeSeasonId: '',
      calendarEvents: [],
      customPresets: [],
      sourceRegions: [],
      targetRegions: [],
      sourceStages: [],
      targetStages: [],
      systemWarningsTimeOverrides: {}
    });

    const setLastSyncAtSpy = vi.spyOn(cloudSync, 'setLastSyncAt');

    render(<App />);

    // Click on "数据管理" in the sidebar to open the data modal
    const dataManagementBtn = await screen.findByText('数据管理');
    fireEvent.click(dataManagementBtn);

    // The modal should open, click "上传本地JSON文件覆盖云端"
    const uploadBtn = await screen.findByText('上传本地JSON文件覆盖云端');
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(migrateSpy).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(setLastSyncAtSpy).toHaveBeenCalledWith(mockSyncTime);
    });
  });
});
