import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../lib/cloudSync');

import {
  adminBanUser,
  adminGetAccountCredentials,
  adminGetServerStats,
  adminLockUser,
  adminDeleteUser,
  adminExtendMembership,
  adminListActivity,
  adminResetBinding,
  adminResetBrowserBindings,
  adminSetSubAdmin,
  adminUnbindBrowserDevice,
  adminUnlockUser,
  adminUpdateCredentials,
  createServerBackup,
  getServerUrl,
  getMachineId,
  initLoad,
  listServerBackups,
  listUsers,
  loadSession,
  loadArchive,
  listPlannerAccounts,
  loadPlannerDashboard,
  loadPlannerCandidates,
  assignPlannerStudents,
  unassignPlannerStudent,
  loadPlannerStudent,
  login,
  migrateLocalData,
  migrateLocalDataForce,
  register,
  restoreServerBackup,
  setServerUrl,
  syncDelta,
  updateRemark,
  verifySession,
} from '../lib/cloudSync';

describe('browser/cloud API contract', () => {
  const originalElectron = (window as any).electronAPI;
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'electronAPI', { value: undefined, configurable: true, writable: true });
    setServerUrl('http://qa-server');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'electronAPI', { value: originalElectron, configurable: true, writable: true });
    Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
  });

  it('keeps independent persistent browser IDs for mobile and desktop web', async () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; Mobile)', configurable: true });
    const phoneA = await getMachineId();
    const phoneB = await getMachineId();
    expect(phoneA).toBe(phoneB);
    expect(phoneA).toMatch(/^mobile_/);

    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', configurable: true });
    const desktopA = await getMachineId();
    const desktopB = await getMachineId();
    expect(desktopA).toBe(desktopB);
    expect(desktopA).toMatch(/^web_/);
    expect(desktopA).not.toBe(phoneA);
  });

  it('migrates the former public HTTP endpoint to HTTPS without touching local QA endpoints', () => {
    setServerUrl('http://106.53.28.53:8000');
    expect(getServerUrl()).toBe('https://106.53.28.53');
    expect(localStorage.getItem('edu_server_url')).toBe('https://106.53.28.53');

    setServerUrl('http://127.0.0.1:8000');
    expect(getServerUrl()).toBe('http://127.0.0.1:8000');
  });

  it('sends mobile client type on login and persists the returned role/session', async () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Android; Mobile)', configurable: true });
    const requests: Array<{ url: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body || '{}')) });
      return new Response(JSON.stringify({ role: 'planner', token: 'planner-token', expire_time: '2099-01-01T00:00:00' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }));

    const session = await login('planner-user', 'secret');
    expect(requests[0].url).toBe('http://qa-server/api/login');
    expect(requests[0].body.client_type).toBe('mobile_web');
    expect(requests[0].body.machine_id).toMatch(/^mobile_/);
    expect(session.role).toBe('planner');
    expect(loadSession()).toEqual(session);
  });

  it('sends only the selected teacher/planner identity during registration', async () => {
    const requests: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body || '{}')));
      return new Response(JSON.stringify({ message: 'ok', expire_time: '2099' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }));
    await register('planner-new', 'password', 'planner');
    expect(requests[0]).toMatchObject({ username: 'planner-new', password: 'password', identity: 'planner' });
    expect(['web', 'mobile_web']).toContain(requests[0].client_type);
  });

  it('matches every new admin and sync request body expected by main.py', async () => {
    const calls: Array<{ path: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const body = JSON.parse(String(init?.body || '{}'));
      calls.push({ path, body });
      const response = path === '/api/admin/extend_membership'
        ? { message: 'ok', new_expire_time: '2099-01-01T00:00:00' }
        : path === '/api/admin/activity_logs'
          ? { logs: [], retention_days: 7 }
          : path === '/api/admin/backups/restore'
            ? { message: 'ok', restored: 'snapshot.db', safety_backup: 'safety.db' }
            : path === '/api/edu/sync'
              ? { uploaded: { students: 0, seasons: 0 }, downloaded: { students: [], seasons: [], settings: null, calendar: null }, server_sync_time: '2026-01-01T00:00:00' }
              : { message: 'ok' };
      return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await adminExtendMembership('admin-token', 'teacher', -24);
    await adminGetAccountCredentials('admin-token', 'teacher');
    await adminUpdateCredentials('admin-token', 'teacher', 'teacher-new', 'new-password');
    await adminBanUser('admin-token', 'teacher', true);
    await adminResetBinding('admin-token', 'teacher');
    await adminUnbindBrowserDevice('admin-token', 'teacher', 2);
    await adminResetBrowserBindings('admin-token', 'teacher');
    await adminDeleteUser('admin-token', 'teacher');
    await adminListActivity('admin-token', 'teacher', 500);
    await restoreServerBackup({ username: '994376571', token: 'admin-token', machineId: 'admin', expireTime: '', role: 'admin' }, 'snapshot.db');
    await syncDelta(
      { username: 'teacher', token: 'teacher-token', machineId: 'desktop-id', expireTime: '2099', role: 'user' },
      { lastSyncAt: '2026-01-01T00:00:00', changedStudents: [], changedSeasons: [], settings: { activeSeasonId: 's' }, calendar: [] },
    );

    expect(calls).toEqual([
      { path: '/api/admin/extend_membership', body: { admin_token: 'admin-token', username: 'teacher', hours: -24 } },
      { path: '/api/admin/account_credentials', body: { admin_token: 'admin-token', username: 'teacher' } },
      { path: '/api/admin/update_credentials', body: { admin_token: 'admin-token', username: 'teacher', new_username: 'teacher-new', new_password: 'new-password' } },
      { path: '/api/admin/ban_user', body: { admin_token: 'admin-token', username: 'teacher', ban: true } },
      { path: '/api/admin/reset_binding', body: { admin_token: 'admin-token', username: 'teacher' } },
      { path: '/api/admin/unbind_browser_device', body: { admin_token: 'admin-token', username: 'teacher', slot: 2 } },
      { path: '/api/admin/reset_browser_bindings', body: { admin_token: 'admin-token', username: 'teacher' } },
      { path: '/api/admin/delete_user', body: { admin_token: 'admin-token', username: 'teacher' } },
      { path: '/api/admin/activity_logs', body: { admin_token: 'admin-token', username: 'teacher', limit: 500 } },
      { path: '/api/admin/backups/restore', body: { admin_token: 'admin-token', backup_name: 'snapshot.db' } },
      { path: '/api/edu/sync', body: {
        username: 'teacher', token: 'teacher-token', machine_id: 'desktop-id', last_sync_at: '2026-01-01T00:00:00',
        changed_students: [], changed_seasons: [], settings: { activeSeasonId: 's' }, calendar: [],
      } },
    ]);
  });

  it('matches every planning-teacher student route and request body expected by main.py', async () => {
    const calls: Array<{ path: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      calls.push({ path, body: JSON.parse(String(init?.body || '{}')) });
      const response = path === '/api/edu/planners'
        ? { planners: [] }
        : path === '/api/planner/dashboard'
          ? { active_students: [], archived_students: [], server_time: '2026' }
          : path === '/api/planner/candidates'
            ? { archived: false, students: [] }
            : path === '/api/planner/assign_students'
              ? { message: 'ok', assigned: 1 }
              : path === '/api/planner/load_student'
                ? { teacher_username: 'teacher', student: {}, seasons: [], server_sync_time: '2026' }
                : { message: 'ok' };
      return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const teacher = { username: 'teacher', token: 'teacher-token', machineId: 'desktop-id', expireTime: '2099', role: 'user' as const };
    const planner = { username: 'planner', token: 'planner-token', machineId: 'phone-id', expireTime: '2099', role: 'planner' as const };

    await listPlannerAccounts(teacher);
    await loadPlannerDashboard(planner);
    await loadPlannerCandidates(planner, true);
    await assignPlannerStudents(planner, [{ teacher_username: 'teacher', student_id: 'student-1' }]);
    await unassignPlannerStudent(planner, 'teacher', 'student-1');
    await loadPlannerStudent(planner, 'teacher', 'student-1');

    expect(calls).toEqual([
      { path: '/api/edu/planners', body: { username: 'teacher', token: 'teacher-token', machine_id: 'desktop-id' } },
      { path: '/api/planner/dashboard', body: { username: 'planner', token: 'planner-token', machine_id: 'phone-id' } },
      { path: '/api/planner/candidates', body: { username: 'planner', token: 'planner-token', machine_id: 'phone-id', archived: true } },
      { path: '/api/planner/assign_students', body: { username: 'planner', token: 'planner-token', machine_id: 'phone-id', students: [{ teacher_username: 'teacher', student_id: 'student-1' }] } },
      { path: '/api/planner/unassign_student', body: { username: 'planner', token: 'planner-token', machine_id: 'phone-id', teacher_username: 'teacher', student_id: 'student-1' } },
      { path: '/api/planner/load_student', body: { username: 'planner', token: 'planner-token', machine_id: 'phone-id', teacher_username: 'teacher', student_id: 'student-1' } },
    ]);
  });

  it('keeps the remaining client functions aligned with deployed route names', async () => {
    const paths: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      const response = path === '/api/login'
        ? { role: 'user', token: 'token', expire_time: '2099' }
        : path === '/api/verify_status'
          ? { status: 'valid' }
          : path === '/api/edu/init_load'
            ? { students: [], seasons: [], settings: null, calendar: null, server_sync_time: '2026' }
            : path === '/api/edu/load_archive'
              ? { season_id: 's', students: [] }
              : path.includes('/migrate')
                ? { message: 'ok', migrated_students: 1, migrated_seasons: 1 }
                : path === '/api/admin/list_users'
                  ? { users: [] }
                  : path === '/api/admin/get_server_stats'
                    ? { total: 0, online: 0, expired: 0, banned: 0, db_size: '0', uptime: '0' }
                    : path === '/api/admin/backups/list'
                      ? { backups: [], retention_days: 7, schedule: ['06:00', '18:00'] }
                      : path === '/api/admin/backups/create'
                        ? { backup: { name: 'b.db', created_at: '2026', size: 1 } }
                        : { message: 'ok', expire_time: '2099' };
      return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const session = { username: 'teacher', token: 'token', machineId: 'machine', expireTime: '2099', role: 'user' as const };
    const admin = { ...session, username: '994376571', role: 'admin' as const };

    await register('teacher', 'password');
    await verifySession(session);
    await initLoad(session);
    await loadArchive(session, 's');
    await migrateLocalData(session, { students: [{ id: 'u', seasonId: 's' }], seasons: [{ id: 's' }] });
    await migrateLocalDataForce(session, { students: [{ id: 'u', seasonId: 's' }], seasons: [{ id: 's' }] });
    await listUsers(admin);
    await updateRemark(admin, 'teacher', '教务老师');
    await adminLockUser('token', 'teacher');
    await adminUnlockUser('token', 'teacher');
    await adminSetSubAdmin('token', 'teacher', true);
    await adminGetServerStats('token');
    await listServerBackups(admin);
    await createServerBackup(admin);

    expect(paths).toEqual([
      '/api/register', '/api/verify_status', '/api/edu/init_load', '/api/edu/load_archive',
      '/api/edu/migrate', '/api/edu/migrate_force', '/api/admin/list_users', '/api/edu/admin/remark',
      '/api/edu/admin/lock_user', '/api/edu/admin/unlock_user', '/api/edu/admin/set_sub_admin',
      '/api/admin/get_server_stats', '/api/admin/backups/list', '/api/admin/backups/create',
    ]);
  });
});
