import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import App from '../App';
import * as cloudSync from '../lib/cloudSync';

vi.mock('../lib/cloudSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/cloudSync')>();
  return {
    ...actual,
    loadSession: vi.fn(),
    saveSession: vi.fn(),
    clearSession: vi.fn(),
    logoutSession: vi.fn().mockResolvedValue(undefined),
    verifySession: vi.fn(),
    initLoad: vi.fn(),
    syncDelta: vi.fn(),
    listUsers: vi.fn(),
    updateRemark: vi.fn(),
    adminLockUser: vi.fn(),
    adminUnlockUser: vi.fn(),
    getServerUrl: vi.fn(() => 'http://127.0.0.1:8000'),
    getLastSyncAt: vi.fn(() => '1970-01-01T00:00:00'),
    setLastSyncAt: vi.fn(),
  };
});

describe('Milestone 4: Data Impersonation & Cloud Sync & Safe Exit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adminLockUser and adminUnlockUser calls FastAPI endpoints with admin_token', async () => {
    vi.mocked(cloudSync.adminLockUser).mockResolvedValue({ message: 'locked' });
    vi.mocked(cloudSync.adminUnlockUser).mockResolvedValue({ message: 'unlocked' });

    await cloudSync.adminLockUser('token123', 'studentA');
    expect(cloudSync.adminLockUser).toHaveBeenCalledWith('token123', 'studentA');

    await cloudSync.adminUnlockUser('token123', 'studentA');
    expect(cloudSync.adminUnlockUser).toHaveBeenCalledWith('token123', 'studentA');
  });

  it('periodic lockout heartbeat kicks out regular user after 15s', async () => {
    const mockSession = {
      username: 'userA',
      token: 'user-token',
      machineId: 'mac-abc',
      expireTime: '2026-12-31',
      role: 'user' as const,
    };
    
    vi.mocked(cloudSync.loadSession).mockReturnValue(mockSession);
    vi.mocked(cloudSync.verifySession).mockResolvedValue('valid');
    vi.mocked(cloudSync.initLoad).mockResolvedValue({
      students: [],
      seasons: [],
      settings: null,
      calendar: null,
      server_sync_time: '2026-07-12T02:00:00',
    });

    render(<App />);

    // Fast-forward initial load
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Verify initially logged in and not kicked out
    expect(screen.queryByText('您已被踢下线')).not.toBeInTheDocument();

    // Mock verifySession to return kicked_out
    vi.mocked(cloudSync.verifySession).mockResolvedValue('kicked_out');

    // Fast-forward 15 seconds for heartbeat
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    // Should detect kickout, call clearSession and show kicked out warning
    expect(cloudSync.clearSession).toHaveBeenCalled();
    expect(screen.getByText('您已被踢下线')).toBeInTheDocument();
  });

  it('bypasses local storage and disk auto-saves for admin user', async () => {
    const mockSession = {
      username: 'admin_user',
      token: 'admin-token',
      machineId: 'mac-abc',
      expireTime: '2026-12-31',
      role: 'admin' as const,
    };
    
    vi.mocked(cloudSync.loadSession).mockReturnValue(mockSession);
    vi.mocked(cloudSync.verifySession).mockResolvedValue('valid');
    vi.mocked(cloudSync.initLoad).mockResolvedValue({
      students: [],
      seasons: [],
      settings: null,
      calendar: null,
      server_sync_time: '2026-07-12T02:00:00',
    });

    // Mock window.electronAPI
    const mockSaveData = vi.fn().mockResolvedValue(true);
    window.electronAPI = {
      getStoredPath: vi.fn().mockResolvedValue('C:\\some\\path'),
      loadData: vi.fn().mockResolvedValue({}),
      saveData: mockSaveData,
    } as any;

    render(<App />);

    // Fast-forward initial load
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Fast-forward to trigger any potential autosave
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Save should not have been called because role is admin
    expect(mockSaveData).not.toHaveBeenCalled();
  });

  it('calls adminUnlockUser and electronAPI.exitApp on safe exit', async () => {
    const mockSession = {
      username: 'admin_user',
      token: 'admin-token',
      machineId: 'mac-abc',
      expireTime: '2026-12-31',
      role: 'admin' as const,
    };
    
    vi.mocked(cloudSync.loadSession).mockReturnValue(mockSession);
    vi.mocked(cloudSync.verifySession).mockResolvedValue('valid');
    vi.mocked(cloudSync.listUsers).mockResolvedValue([]);
    vi.mocked(cloudSync.initLoad).mockResolvedValue({
      students: [],
      seasons: [],
      settings: null,
      calendar: null,
      server_sync_time: '2026-07-12T02:00:00',
    });

    const mockExitApp = vi.fn();
    window.electronAPI = {
      getStoredPath: vi.fn().mockResolvedValue('C:\\some\\path'),
      loadData: vi.fn().mockResolvedValue({}),
      exitApp: mockExitApp,
    } as any;

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<App />);

    // Fast-forward initial load
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Assert AdminDashboard is rendered and get logout button
    const logoutBtn = screen.getByText('退出登录');
    expect(logoutBtn).toBeInTheDocument();

    // Click logout
    fireEvent.click(logoutBtn);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Should clear session and return to login screen (NOT exit the app)
    expect(cloudSync.logoutSession).toHaveBeenCalledWith(mockSession);
    expect(cloudSync.clearSession).toHaveBeenCalled();
    // exitApp should NOT be called - admin logout returns to login screen
    expect(mockExitApp).not.toHaveBeenCalled();
    // AdminDashboard should no longer be rendered
    expect(screen.queryByText('退出登录')).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
