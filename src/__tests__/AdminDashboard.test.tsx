import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import AdminDashboard from '../components/AdminDashboard';
import * as cloudSync from '../lib/cloudSync';

vi.mock('../lib/cloudSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/cloudSync')>();
  return {
    ...actual,
    listUsers: vi.fn(),
    updateRemark: vi.fn(),
    listServerBackups: vi.fn(),
    createServerBackup: vi.fn(),
    restoreServerBackup: vi.fn(),
    adminGetServerStats: vi.fn(),
    adminExtendMembership: vi.fn(),
    adminBanUser: vi.fn(),
    adminDeleteUser: vi.fn(),
    adminResetBinding: vi.fn(),
    adminUnbindBrowserDevice: vi.fn(),
    adminResetBrowserBindings: vi.fn(),
    adminListActivity: vi.fn(),
    adminGetAccountCredentials: vi.fn(),
    adminUpdateCredentials: vi.fn(),
  };
});

describe('AdminDashboard Component', () => {
  const originalMatchMedia = window.matchMedia;
  const mockSession = {
    username: 'admin_test',
    token: 'admin-token-123',
    machineId: 'mac-123',
    expireTime: '2026-12-31',
    role: 'admin' as const,
  };

  const mockUsers = [
    { username: 'teacher1', remark: '教务老师' },
    { username: 'student1', remark: '' },
    { username: 'student2', remark: 'Some other remark' },
  ];

  const mockOnLogout = vi.fn();
  const mockOnImpersonate = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(cloudSync.listUsers).mockResolvedValue(mockUsers);
    vi.mocked(cloudSync.updateRemark).mockResolvedValue({ message: 'Success' });
    vi.mocked(cloudSync.adminGetServerStats).mockResolvedValue({ total: 3, online: 1, expired: 0, banned: 0, db_size: '1 MB', uptime: '1小时' });
    vi.mocked(cloudSync.adminExtendMembership).mockResolvedValue({ message: 'ok', new_expire_time: '2027-01-31T00:00:00' });
    vi.mocked(cloudSync.adminBanUser).mockResolvedValue({ message: 'ok' });
    vi.mocked(cloudSync.adminDeleteUser).mockResolvedValue({ message: 'ok' });
    vi.mocked(cloudSync.adminResetBinding).mockResolvedValue({ message: 'ok' });
    vi.mocked(cloudSync.adminUnbindBrowserDevice).mockResolvedValue({ message: 'ok', browser_machine_ids: ['', 'phone-code', 'third-code'] });
    vi.mocked(cloudSync.adminResetBrowserBindings).mockResolvedValue({ message: 'ok', browser_machine_ids: ['', '', ''] });
    vi.mocked(cloudSync.adminListActivity).mockResolvedValue({ logs: [], retention_days: 7 });
    vi.mocked(cloudSync.adminGetAccountCredentials).mockResolvedValue({
      username: 'teacher1', password: 'teacher-pass', password_available: true, message: 'ok',
    });
    vi.mocked(cloudSync.adminUpdateCredentials).mockResolvedValue({
      message: 'ok', old_username: 'teacher1', username: 'teacher1',
      password: 'new-pass', password_available: true,
    });
    vi.mocked(cloudSync.listServerBackups).mockResolvedValue({ backups: [], retention_days: 7, schedule: ['06:00', '18:00'] });
  });

  it('renders Teacher Panel (default view) and handles All Registered Users collapsible section', async () => {
    render(
      <AdminDashboard
        session={mockSession}
        onLogout={mockOnLogout}
        onImpersonate={mockOnImpersonate}
        isEndfieldTheme={false}
      />
    );

    // Should fetch user list
    expect(cloudSync.listUsers).toHaveBeenCalledWith(mockSession);

    // Wait for the loader to finish and users to render
    await waitFor(() => {
      expect(screen.getByText('teacher1')).toBeInTheDocument();
    });

    // Default view: "Teacher Panel" is active and lists tagged teachers
    expect(screen.getByText('教务老师面板')).toBeInTheDocument();
    expect(screen.getByText('teacher1')).toBeInTheDocument();
    // Non-teachers should not be shown by default because "所有注册用户" is collapsed
    expect(screen.queryByText('student1')).not.toBeInTheDocument();
    expect(screen.queryByText('student2')).not.toBeInTheDocument();

    // Click to expand "所有注册用户"
    const collapseHeader = screen.getByText('所有注册用户');
    fireEvent.click(collapseHeader);

    // Now non-teachers should be visible
    expect(screen.getByText('student1')).toBeInTheDocument();
    expect(screen.getByText('student2')).toBeInTheDocument();
  });

  it('toggles user tag between Teacher and All-Users', async () => {
    render(
      <AdminDashboard
        session={mockSession}
        onLogout={mockOnLogout}
        onImpersonate={mockOnImpersonate}
        isEndfieldTheme={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('teacher1')).toBeInTheDocument();
    });

    // Account-management actions live inside the details dialog so the list stays compact.
    const teacher1Row = screen.getAllByText('teacher1').map(node => node.closest('tr')).find(Boolean)!;
    fireEvent.click(within(teacher1Row).getByRole('button', { name: 'teacher1 账号详情' }));
    const teacherDialog = screen.getByRole('dialog', { name: 'teacher1 账号详情' });
    fireEvent.click(within(teacherDialog).getByText('取消教务老师'));

    await waitFor(() => {
      expect(cloudSync.updateRemark).toHaveBeenCalledWith(mockSession, 'teacher1', '');
    });

    fireEvent.click(within(teacherDialog).getByRole('button', { name: '关闭账号管理' }));

    // Check that teacher1 immediately moves out of Teacher Panel (no longer in Teacher list)
    await waitFor(() => {
      const teacherPanel = screen.getByText('教务老师面板').closest('section')!;
      expect(within(teacherPanel).queryByText('teacher1')).not.toBeInTheDocument();
    });

    // Expand All Registered Users list
    fireEvent.click(screen.getByText('所有注册用户'));

    // Check that teacher1 is now in the All Registered Users list
    await waitFor(() => {
      expect(screen.getByText('teacher1')).toBeInTheDocument();
    });

    // Now tag student1 as Teacher
    const student1Row = screen.getByText('student1').closest('tr')!;
    fireEvent.click(within(student1Row).getByRole('button', { name: 'student1 账号详情' }));
    const studentDialog = screen.getByRole('dialog', { name: 'student1 账号详情' });
    fireEvent.click(within(studentDialog).getByText('设为教务老师'));

    await waitFor(() => {
      expect(cloudSync.updateRemark).toHaveBeenCalledWith(mockSession, 'student1', '教务老师');
    });

    // student1 should move out of All Registered Users and into Teacher Panel
    await waitFor(() => {
      const teacherPanel = screen.getByText('教务老师面板').closest('section')!;
      const allUsersPanel = screen.getByText('所有注册用户').closest('section')!;
      expect(within(teacherPanel).getByText('student1')).toBeInTheDocument();
      expect(within(allUsersPanel).queryByText('student1')).not.toBeInTheDocument();
    });
  });

  it('calls onImpersonate when mock login button is clicked', async () => {
    render(
      <AdminDashboard
        session={mockSession}
        onLogout={mockOnLogout}
        onImpersonate={mockOnImpersonate}
        isEndfieldTheme={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('teacher1')).toBeInTheDocument();
    });

    const impersonateButtons = screen.getAllByText('模拟进入教务');
    fireEvent.click(impersonateButtons[0]); // Click on teacher1's impersonate button

    expect(mockOnImpersonate).toHaveBeenCalledWith({
      username: 'teacher1',
      token: mockSession.token,
      machineId: mockSession.machineId,
      expireTime: mockSession.expireTime,
      role: 'user',
    });
  });

  it('handles Endfield theme layout and styling', async () => {
    render(
      <AdminDashboard
        session={mockSession}
        onLogout={mockOnLogout}
        onImpersonate={mockOnImpersonate}
        isEndfieldTheme={true}
      />
    );

    // Endfield theme specific elements
    await waitFor(() => {
      expect(screen.getByText('[ ADMIN_DASHBOARD_CORE ]')).toBeInTheDocument();
    });
  });

  it('loads and updates credentials from the compact account details dialog', async () => {
    render(
      <AdminDashboard
        session={mockSession}
        onLogout={mockOnLogout}
        onImpersonate={mockOnImpersonate}
        isEndfieldTheme={false}
      />
    );
    await screen.findByText('teacher1');
    const teacherRow = screen.getAllByText('teacher1').map(node => node.closest('tr')).find(Boolean)!;
    fireEvent.click(within(teacherRow).getByRole('button', { name: 'teacher1 账号详情' }));
    const dialog = screen.getByRole('dialog', { name: 'teacher1 账号详情' });
    await waitFor(() => {
      expect(cloudSync.adminGetAccountCredentials).toHaveBeenCalledWith(mockSession.token, 'teacher1');
    });
    expect(within(dialog).getByDisplayValue('teacher-pass')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('用户名'), { target: { value: 'teacher-renamed' } });
    fireEvent.change(within(dialog).getByLabelText('密码'), { target: { value: 'new-pass' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /保存账号与密码/ }));
    await waitFor(() => {
      expect(cloudSync.adminUpdateCredentials).toHaveBeenCalledWith(
        mockSession.token, 'teacher1', 'teacher-renamed', 'new-pass',
      );
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

  it('provides an independent mobile scroll surface for mouse-wheel and touch scrolling', async () => {
    render(
      <AdminDashboard
        session={mockSession}
        onLogout={mockOnLogout}
        onImpersonate={mockOnImpersonate}
        isEndfieldTheme={false}
      />
    );

    await waitFor(() => expect(screen.getByText('teacher1')).toBeInTheDocument());
    const scrollSurface = screen.getByTestId('admin-scroll-container');
    expect(scrollSurface).toHaveClass('h-[100svh]', 'overflow-y-auto', 'overflow-x-hidden', 'touch-pan-y', '[-webkit-overflow-scrolling:touch]');
    expect(scrollSurface).toHaveClass('md:h-auto', 'md:overflow-visible');

    const wheel = new WheelEvent('wheel', { deltaY: 160, bubbles: true, cancelable: true });
    scrollSurface.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
  });

  it('keeps every primary-admin access action on one right-aligned mobile line', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 639px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(
      <AdminDashboard
        session={mockSession}
        onLogout={mockOnLogout}
        onImpersonate={mockOnImpersonate}
        isEndfieldTheme={false}
      />
    );

    await waitFor(() => expect(screen.getByText('teacher1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('所有注册用户'));
    const accessButtons = screen.getAllByRole('button', { name: /模拟进入教务|待分配身份/ });
    expect(accessButtons).toHaveLength(3);
    accessButtons.forEach(button => {
      expect(button).toHaveClass('whitespace-nowrap', 'min-w-max', 'shrink-0', 'ml-auto');
      expect(button.closest('article')).not.toBeNull();
    });
    expect(screen.getAllByRole('button', { name: '待分配身份' })).toHaveLength(2);
    screen.getAllByRole('button', { name: '待分配身份' }).forEach(button => expect(button).toBeDisabled());
  });

  it('gives a planning teacher a read-only teacher list with 查看 actions only', async () => {
    const plannerSession = { ...mockSession, username: 'planner1', role: 'planner' as const };
    vi.mocked(cloudSync.listUsers).mockResolvedValue([
      { username: 'teacher1', remark: '教务老师' },
      { username: 'legacy-teacher', remark: 'Teacher' },
    ]);

    render(
      <AdminDashboard
        session={plannerSession}
        onLogout={mockOnLogout}
        onImpersonate={mockOnImpersonate}
        isEndfieldTheme={false}
      />
    );

    await waitFor(() => expect(screen.getByText('teacher1')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /规划老师只读中心/ })).toBeInTheDocument();
    expect(screen.getAllByText('查看')).toHaveLength(2);
    expect(screen.queryByText('所有注册用户')).not.toBeInTheDocument();
    expect(screen.queryByText('取消教务身份')).not.toBeInTheDocument();
    expect(screen.queryByText('设为规划老师')).not.toBeInTheDocument();
  });

  it('exposes primary-admin membership and independent device controls', async () => {
    vi.mocked(cloudSync.listUsers).mockResolvedValue([{
      username: 'teacher1', remark: '教务老师', expire_time: '2026-12-31T00:00:00',
      bound_machine_id: 'desktop-code', web_machine_id: 'desktop-web-code', mobile_machine_id: 'phone-code', browser_machine_id_3: 'third-code',
      browser_machine_ids: ['desktop-web-code', 'phone-code', 'third-code'],
    }]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AdminDashboard session={mockSession} onLogout={mockOnLogout} onImpersonate={mockOnImpersonate} isEndfieldTheme={false} />);
    await waitFor(() => expect(screen.getByText('teacher1')).toBeInTheDocument());
    const teacherRow = screen.getAllByText('teacher1').map(node => node.closest('tr')).find(Boolean)!;
    expect(within(teacherRow).getByText(/2026/)).toBeInTheDocument();
    expect(within(teacherRow).queryByText('续期')).not.toBeInTheDocument();
    expect(within(teacherRow).queryByText('扣减')).not.toBeInTheDocument();
    expect(within(teacherRow).queryByText('封禁')).not.toBeInTheDocument();
    expect(within(teacherRow).queryByText('解绑设备')).not.toBeInTheDocument();
    expect(within(teacherRow).queryByText('删除')).not.toBeInTheDocument();
    expect(within(teacherRow).queryByText('取消教务老师')).not.toBeInTheDocument();
    fireEvent.click(within(teacherRow).getByRole('button', { name: 'teacher1 账号详情' }));

    const dialog = screen.getByRole('dialog', { name: 'teacher1 账号详情' });
    expect(within(dialog).getByText('桌面 App')).toBeInTheDocument();
    expect(within(dialog).getByText('浏览器设备 1')).toBeInTheDocument();
    expect(within(dialog).getByText('浏览器设备 2')).toBeInTheDocument();
    expect(within(dialog).getByText('浏览器设备 3')).toBeInTheDocument();
    expect(within(dialog).getByText('phone-code')).toBeInTheDocument();
    expect(within(dialog).getByText('third-code')).toBeInTheDocument();
    expect(within(dialog).getByText('取消教务老师')).toBeInTheDocument();
    expect(within(dialog).getByText('设为规划老师')).toBeInTheDocument();
    expect(within(dialog).getByText('设为次级管理员')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText('续期 1天'));
    await waitFor(() => expect(cloudSync.adminExtendMembership).toHaveBeenCalledWith(mockSession.token, 'teacher1', 24));

    fireEvent.click(within(dialog).getByText('扣减 1天'));
    await waitFor(() => expect(cloudSync.adminExtendMembership).toHaveBeenCalledWith(mockSession.token, 'teacher1', -24));

    fireEvent.click(within(dialog).getAllByText('解绑')[0]);
    await waitFor(() => expect(cloudSync.adminUnbindBrowserDevice).toHaveBeenCalledWith(mockSession.token, 'teacher1', 1));

    fireEvent.click(within(dialog).getByText('清空浏览器设备'));
    await waitFor(() => expect(cloudSync.adminResetBrowserBindings).toHaveBeenCalledWith(mockSession.token, 'teacher1'));

    fireEvent.click(within(dialog).getByText('重新绑定全部设备'));
    await waitFor(() => expect(cloudSync.adminResetBinding).toHaveBeenCalledWith(mockSession.token, 'teacher1'));

    fireEvent.click(within(dialog).getByText('七天操作数据'));
    await waitFor(() => expect(cloudSync.adminListActivity).toHaveBeenCalledWith(mockSession.token, 'teacher1', 500));
    expect(await within(dialog).findByText('该账号近七天没有操作记录')).toBeInTheDocument();
  });

  it('renders legacy English role data using only Chinese labels', async () => {
    vi.mocked(cloudSync.listUsers).mockResolvedValue([
      { username: 'legacy-teacher', remark: 'Teacher' },
      { username: 'legacy-planner', remark: 'Planner', role: 'planner' },
    ]);

    render(<AdminDashboard session={mockSession} onLogout={mockOnLogout} onImpersonate={mockOnImpersonate} isEndfieldTheme={false} />);
    await waitFor(() => expect(screen.getByText('legacy-teacher')).toBeInTheDocument());
    expect(screen.getByText('教务老师')).toBeInTheDocument();
    expect(screen.queryByText('Teacher')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('所有注册用户'));
    expect(await screen.findByText('规划老师')).toBeInTheDocument();
    expect(screen.queryByText('Planner')).not.toBeInTheDocument();
  });

  it('moves administrator feature explanations into contextual help dialogs', async () => {
    vi.mocked(cloudSync.listUsers).mockResolvedValue([{
      username: 'teacher1', remark: '教务老师', expire_time: '2026-12-31T00:00:00',
      bound_machine_id: 'desktop-code', web_machine_id: 'desktop-web-code', mobile_machine_id: 'phone-code', browser_machine_id_3: 'third-code',
      browser_machine_ids: ['desktop-web-code', 'phone-code', 'third-code'],
    }]);

    render(<AdminDashboard session={mockSession} onLogout={mockOnLogout} onImpersonate={mockOnImpersonate} isEndfieldTheme={false} />);
    await waitFor(() => expect(screen.getByText('teacher1')).toBeInTheDocument());

    fireEvent.click(screen.getByText('近7天账号活动'));
    expect(screen.queryByText(/普通心跳不会写入/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看活动记录说明' }));
    expect(screen.getByRole('dialog', { name: '活动记录说明' })).toHaveTextContent('普通心跳不会写入');
    fireEvent.click(screen.getByRole('button', { name: '关闭活动记录说明' }));

    fireEvent.click(screen.getByText('数据备份与回滚'));
    await waitFor(() => expect(cloudSync.listServerBackups).toHaveBeenCalledWith(mockSession));
    expect(screen.getByText('每天 06:00、18:00 · 保留 7 天')).toBeInTheDocument();
    expect(screen.queryByText(/恢复前会自动创建/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看备份与回滚说明' }));
    expect(screen.getByRole('dialog', { name: '备份与回滚说明' })).toHaveTextContent('自动创建当前状态快照');
    fireEvent.click(screen.getByRole('button', { name: '关闭备份与回滚说明' }));

    const teacherRow = screen.getAllByText('teacher1').map(node => node.closest('tr')).find(Boolean)!;
    fireEvent.click(within(teacherRow).getByRole('button', { name: 'teacher1 账号详情' }));
    const accountDialog = screen.getByRole('dialog', { name: 'teacher1 账号详情' });
    expect(within(accountDialog).queryByText(/主管理员账号控制/)).not.toBeInTheDocument();
    fireEvent.click(within(accountDialog).getByRole('button', { name: '查看账号管理说明' }));
    expect(screen.getByRole('dialog', { name: '账号管理说明' })).toHaveTextContent('会员期限');
    fireEvent.click(screen.getByRole('button', { name: '关闭账号管理说明' }));

    expect(within(accountDialog).queryByText(/三种客户端独立占用/)).not.toBeInTheDocument();
    fireEvent.click(within(accountDialog).getByRole('button', { name: '查看设备绑定说明' }));
    expect(screen.getByRole('dialog', { name: '设备绑定说明' })).toHaveTextContent('共同使用三个浏览器槽');
    expect(within(accountDialog).getByText(/删除账号会原子清除其全部教务数据/)).toBeInTheDocument();
  });

  it('renders naive server activity timestamps as local time', async () => {
    const createdAt = '2026-07-18T10:29:33';
    vi.mocked(cloudSync.adminListActivity).mockResolvedValue({
      retention_days: 7,
      logs: [{ id: 1, username: 'teacher1', event_type: 'sync_change', summary: '同步修改：学生档案 1 项', details: {}, client_type: 'desktop', created_at: createdAt }],
    });
    render(<AdminDashboard session={mockSession} onLogout={mockOnLogout} onImpersonate={mockOnImpersonate} isEndfieldTheme={false} />);
    await waitFor(() => expect(screen.getByText('teacher1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('近7天账号活动'));
    const expected = new Date(`${createdAt}Z`).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('shows every returned non-primary account to a secondary administrator', async () => {
    const subAdminSession = { ...mockSession, username: 'sub_self', role: 'sub_admin' as const };
    vi.mocked(cloudSync.listUsers).mockResolvedValue({ users: [
      { username: 'sub_self', remark: '教务老师', role: 'sub_admin', is_sub_admin: true },
      { username: 'sub_other', remark: '教务老师', role: 'sub_admin', is_sub_admin: true },
      { username: 'teacher_other', remark: '教务老师', role: 'user' },
      { username: 'plain_other', remark: '', role: 'user' },
    ] });
    render(<AdminDashboard session={subAdminSession} onLogout={mockOnLogout} onImpersonate={mockOnImpersonate} isEndfieldTheme={false} />);
    await waitFor(() => expect(screen.getByText('sub_self')).toBeInTheDocument());
    expect(screen.getByText('sub_other')).toBeInTheDocument();
    expect(screen.getByText('teacher_other')).toBeInTheDocument();
    expect(screen.getByText('plain_other')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '进入我的教务' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '模拟进入教务' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '待分配身份' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /账号详情|设为规划|设为次级/ })).not.toBeInTheDocument();
  });

  it('routes planner accounts to the planner dashboard role and blocks accounts without an identity', async () => {
    vi.mocked(cloudSync.listUsers).mockResolvedValue([
      { username: 'planner1', remark: '规划老师', role: 'planner' },
      { username: 'unassigned1', remark: '', role: 'user' },
    ]);
    render(<AdminDashboard session={mockSession} onLogout={mockOnLogout} onImpersonate={mockOnImpersonate} isEndfieldTheme={false} />);
    await waitFor(() => expect(screen.getByText('所有注册用户')).toBeInTheDocument());
    fireEvent.click(screen.getByText('所有注册用户'));
    expect(await screen.findByText('planner1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '模拟进入规划' }));
    expect(mockOnImpersonate).toHaveBeenCalledWith(expect.objectContaining({ username: 'planner1', role: 'planner' }));
    expect(screen.getByRole('button', { name: '待分配身份' })).toBeDisabled();
  });

  it('shows secondary-administrator device audit records without presenting them as restrictions', async () => {
    vi.mocked(cloudSync.listUsers).mockResolvedValue([{
      username: 'sub_teacher', remark: '教务老师', role: 'sub_admin', is_sub_admin: true,
      device_binding_exempt: true, expire_time: '2026-12-31T00:00:00',
      bound_machine_id: 'desktop-sub-audit', browser_machine_ids: ['safari-phone-audit', 'chrome-laptop-audit', ''],
    }]);
    render(<AdminDashboard session={mockSession} onLogout={mockOnLogout} onImpersonate={mockOnImpersonate} isEndfieldTheme={false} />);
    await waitFor(() => expect(screen.getByText('sub_teacher')).toBeInTheDocument());
    const teacherRow = screen.getAllByText('sub_teacher').map(node => node.closest('tr')).find(Boolean)!;
    fireEvent.click(within(teacherRow).getByRole('button', { name: 'sub_teacher 账号详情' }));
    const dialog = screen.getByRole('dialog', { name: 'sub_teacher 账号详情' });
    expect(within(dialog).getByText(/最近登录设备记录，仅供主管理员查看/)).toBeInTheDocument();
    expect(within(dialog).getByText('desktop-sub-audit')).toBeInTheDocument();
    expect(within(dialog).getByText('safari-phone-audit')).toBeInTheDocument();
    expect(within(dialog).getByText('chrome-laptop-audit')).toBeInTheDocument();
    expect(within(dialog).getByText('暂无浏览器登录记录')).toBeInTheDocument();
    expect(within(dialog).queryByText('免绑定')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('等待首次浏览器登录绑定')).not.toBeInTheDocument();
  });
});
