/**
 * cloudSync.ts
 * 教务管理系统 — 云端同步工具库 v1.0
 */

const PUBLIC_SERVER_URL = 'https://106.53.28.53';
const LEGACY_PUBLIC_SERVER_URL = /^http:\/\/106\.53\.28\.53(?::8000)?\/?$/i;
const DEFAULT_SERVER_URL = typeof window !== 'undefined' && !(window as any).electronAPI && /^https?:$/.test(window.location.protocol)
  ? window.location.origin
  : PUBLIC_SERVER_URL;
const STORAGE_KEYS = {
  SESSION: 'edu_cloud_session',
  MACHINE_ID: 'edu_machine_id',
  MOBILE_MACHINE_ID: 'edu_mobile_machine_id',
  LAST_SYNC_AT: 'edu_last_sync_at',
  SERVER_URL: 'edu_server_url',
};

export interface CloudSession {
  username: string;
  token: string;
  machineId: string;
  expireTime: string;
  role: 'user' | 'admin' | 'sub_admin' | 'planner';
}

export interface StudentSyncRecord {
  student_id: string;
  data_json: string;
  updated_at: string;
  is_deleted?: boolean;
}

export interface SeasonSyncRecord {
  season_id: string;
  data_json: string;
  is_archived?: boolean;
  updated_at: string;
  is_deleted?: boolean;
}

export interface SyncPayload {
  changedStudents: StudentSyncRecord[];
  changedSeasons: SeasonSyncRecord[];
  settings?: Record<string, unknown> | null;
  calendar?: unknown[] | null;
  lastSyncAt: string;
}

export interface SyncResult {
  uploaded: { students: number; seasons: number };
  downloaded: {
    students: StudentSyncRecord[];
    seasons: SeasonSyncRecord[];
    settings: string | null;
    calendar: string | null;
  };
  server_sync_time: string;
}

export interface InitLoadResult {
  students: StudentSyncRecord[];
  seasons: SeasonSyncRecord[];
  settings: string | null;
  calendar: string | null;
  server_sync_time: string;
}

export type VerifyResult = 'valid' | 'kicked_out' | 'locked_by_admin' | 'expired' | 'error' | 'offline';

export function getServerUrl(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.SERVER_URL);
    if (saved && LEGACY_PUBLIC_SERVER_URL.test(saved.trim())) {
      localStorage.setItem(STORAGE_KEYS.SERVER_URL, PUBLIC_SERVER_URL);
      return PUBLIC_SERVER_URL;
    }
    return saved || DEFAULT_SERVER_URL;
  } catch { return DEFAULT_SERVER_URL; }
}

export function setServerUrl(url: string): void {
  try {
    const cleaned = url.trim().replace(/\/+$/, '');
    localStorage.setItem(STORAGE_KEYS.SERVER_URL, LEGACY_PUBLIC_SERVER_URL.test(cleaned) ? PUBLIC_SERVER_URL : cleaned);
  } catch {}
}

function getClientType(): 'desktop' | 'web' | 'mobile_web' {
  if ((window as any).electronAPI) return 'desktop';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? 'mobile_web' : 'web';
}

export async function getMachineId(): Promise<string> {
  try {
    const api = (window as any).electronAPI;
    if (api?.getMachineId) { const mid = await api.getMachineId(); if (mid) return mid; }
  } catch {}
  try {
    const mobile = getClientType() === 'mobile_web';
    const key = mobile ? STORAGE_KEYS.MOBILE_MACHINE_ID : STORAGE_KEYS.MACHINE_ID;
    let mid = localStorage.getItem(key);
    if (!mid) {
      mid = (mobile ? 'mobile_' : 'web_') + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14);
      localStorage.setItem(key, mid);
    }
    return mid;
  } catch { return 'unknown_' + Date.now().toString(36); }
}

export function saveSession(session: CloudSession): void {
  try { localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session)); } catch {}
}

export function loadSession(): CloudSession | null {
  try {
    const s = localStorage.getItem(STORAGE_KEYS.SESSION);
    if (!s) return null;
    const parsed = JSON.parse(s);
    if (!parsed?.username || !parsed?.token) return null;
    return parsed as CloudSession;
  } catch { return null; }
}

export function clearSession(): void {
  try { localStorage.removeItem(STORAGE_KEYS.SESSION); localStorage.removeItem(STORAGE_KEYS.LAST_SYNC_AT); } catch {}
}

export async function logoutSession(session: CloudSession): Promise<void> {
  if (session.role === 'admin') {
    await apiPost('/api/admin/logout', { admin_token: session.token });
    return;
  }
  await apiPost('/api/logout', {
    username: session.username,
    token: session.token,
    machine_id: session.machineId,
    is_active: false,
  });
}

export function getLastSyncAt(): string {
  try { return localStorage.getItem(STORAGE_KEYS.LAST_SYNC_AT) || '1970-01-01T00:00:00'; } catch { return '1970-01-01T00:00:00'; }
}

export function setLastSyncAt(t: string): void {
  try { localStorage.setItem(STORAGE_KEYS.LAST_SYNC_AT, t); } catch {}
}

async function apiPost<T>(path: string, body: Record<string, unknown>, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getServerUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      // 423: Account is locked by admin — provide a localized error
      if (res.status === 423) {
        throw new Error('该账号正在被管理员查看，暂时无法登录');
      }
      throw new Error(errData?.detail || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (e: unknown) {
    clearTimeout(timer);
    if ((e as Error).name === 'AbortError') throw new Error('TIMEOUT');
    throw e;
  }
}

export async function login(username: string, password: string): Promise<CloudSession> {
  const machineId = await getMachineId();
  const result = await apiPost<{ role: string; token: string; expire_time: string }>('/api/login', { username, password, machine_id: machineId, client_type: getClientType() });
  const session: CloudSession = { username, token: result.token, machineId, expireTime: result.expire_time || '', role: (result.role as CloudSession['role']) || 'user' };
  saveSession(session);
  return session;
}

export async function register(
  username: string,
  password: string,
  identity: 'teacher' | 'planner' = 'teacher',
): Promise<{ message: string; expire_time: string }> {
  const machineId = await getMachineId();
  return apiPost('/api/register', { username, password, machine_id: machineId, client_type: getClientType(), identity });
}

export async function verifySession(session: CloudSession): Promise<VerifyResult> {
  try {
    await apiPost('/api/verify_status', { username: session.username, token: session.token, machine_id: session.machineId }, 8000);
    return 'valid';
  } catch (e: unknown) {
    const msg = (e as Error).message || '';
    if (msg === 'LOCKED_BY_ADMIN' || msg.includes('LOCKED_BY_ADMIN') || msg.includes('该账号正在被管理员查看') || msg.includes('occupied by Admin')) return 'locked_by_admin';
    if (msg === 'KICKED_OUT' || msg.includes('KICKED_OUT')) return 'kicked_out';
    if (msg.includes('已过期') || msg.includes('expired')) return 'expired';
    if (msg === 'TIMEOUT' || msg.includes('fetch') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) return 'offline';
    return 'error';
  }
}

export async function initLoad(session: CloudSession): Promise<InitLoadResult> {
  return apiPost<InitLoadResult>('/api/edu/init_load', { username: session.username, token: session.token, machine_id: session.machineId }, 30000);
}

export async function syncDelta(session: CloudSession, payload: SyncPayload): Promise<SyncResult> {
  return apiPost<SyncResult>('/api/edu/sync', {
    username: session.username, token: session.token, machine_id: session.machineId,
    last_sync_at: payload.lastSyncAt, changed_students: payload.changedStudents,
    changed_seasons: payload.changedSeasons, settings: payload.settings ?? null, calendar: payload.calendar ?? null,
  }, 30000);
}

export async function loadArchive(session: CloudSession, seasonId: string): Promise<{ season_id: string; students: StudentSyncRecord[] }> {
  return apiPost('/api/edu/load_archive', { username: session.username, token: session.token, machine_id: session.machineId, season_id: seasonId }, 20000);
}

export interface PlannerAccount {
  username: string;
}

export interface PlannerStudentSummary {
  teacher_username: string;
  student_id: string;
  name: string;
  status: string;
  season_id: string;
  season_name: string;
  archived: boolean;
  planner_username: string;
  assigned_to_me: boolean;
  eligible: boolean;
  application_count: number;
  /** Normalized source/target stages supplied by new servers. */
  source_stage?: string;
  target_stage?: string;
  stage_path?: string;
  updated_at: string;
}

export async function listPlannerAccounts(session: CloudSession): Promise<{ planners: PlannerAccount[] }> {
  return apiPost('/api/edu/planners', {
    username: session.username, token: session.token, machine_id: session.machineId,
  });
}

export async function loadPlannerDashboard(session: CloudSession): Promise<{
  active_students: PlannerStudentSummary[];
  archived_students: PlannerStudentSummary[];
  server_time: string;
}> {
  return apiPost('/api/planner/dashboard', {
    username: session.username, token: session.token, machine_id: session.machineId,
  }, 30000);
}

export async function loadPlannerCandidates(session: CloudSession, archived: boolean): Promise<{
  archived: boolean;
  students: PlannerStudentSummary[];
}> {
  return apiPost('/api/planner/candidates', {
    username: session.username, token: session.token, machine_id: session.machineId, archived,
  }, 30000);
}

export async function assignPlannerStudents(
  session: CloudSession,
  students: Array<{ teacher_username: string; student_id: string }>,
): Promise<{ message: string; assigned: number }> {
  return apiPost('/api/planner/assign_students', {
    username: session.username, token: session.token, machine_id: session.machineId, students,
  }, 30000);
}

export async function unassignPlannerStudent(
  session: CloudSession,
  teacherUsername: string,
  studentId: string,
): Promise<{ message: string }> {
  return apiPost('/api/planner/unassign_student', {
    username: session.username, token: session.token, machine_id: session.machineId,
    teacher_username: teacherUsername, student_id: studentId,
  }, 30000);
}

export async function loadPlannerStudent(
  session: CloudSession,
  teacherUsername: string,
  studentId: string,
): Promise<{
  teacher_username: string;
  student: StudentSyncRecord;
  seasons: SeasonSyncRecord[];
  server_sync_time: string;
}> {
  return apiPost('/api/planner/load_student', {
    username: session.username, token: session.token, machine_id: session.machineId,
    teacher_username: teacherUsername, student_id: studentId,
  }, 30000);
}

export interface MigratePayload {
  students: unknown[]; seasons: unknown[];
  alertConfig?: Record<string, unknown>; ignoredAlerts?: unknown[]; completedAlerts?: Record<string, unknown>;
  dismissedCalendarEvents?: Record<string, string>; calendarCompletionBackups?: Record<string, unknown>;
  activeSeasonId?: string; calendarEvents?: unknown[]; systemWarningsTimeOverrides?: Record<string, unknown>;
  customPresets?: unknown[]; sourceRegions?: string[]; targetRegions?: string[];
  sourceStages?: string[]; targetStages?: string[];
}

export async function migrateLocalData(session: CloudSession, data: MigratePayload): Promise<{ message: string; migrated_students: number; migrated_seasons: number }> {
  return apiPost('/api/edu/migrate', { username: session.username, token: session.token, machine_id: session.machineId, ...data }, 60000);
}

export async function migrateLocalDataForce(session: CloudSession, data: MigratePayload): Promise<{ message: string; migrated_students: number; migrated_seasons: number }> {
  return apiPost('/api/edu/migrate_force', { username: session.username, token: session.token, machine_id: session.machineId, ...data }, 60000);
}

export async function checkServerReachable(): Promise<boolean> {
  try { const res = await fetch(`${getServerUrl()}/api/service_status`, { signal: AbortSignal.timeout(5000) }); return res.ok; } catch { return false; }
}

export interface UserRecord {
  username: string;
  remark: string;
  role?: 'user' | 'admin' | 'sub_admin' | 'planner';
  is_sub_admin?: boolean;
  registered_machine_id?: string;
  bound_machine_id?: string;
  web_machine_id?: string;
  mobile_machine_id?: string;
  browser_machine_id_3?: string;
  /** Three shared browser-device slots (desktop and mobile browsers combined). */
  browser_machine_ids?: [string, string, string] | string[];
  /** True for a secondary administrator: shown device IDs are audit records, never login restrictions. */
  device_binding_exempt?: boolean;
  expire_time?: string;
  is_expired?: boolean;
  is_banned?: boolean;
  is_online?: boolean;
  is_active?: boolean;
  last_seen?: string;
  created_at?: string;
  /** True when the primary administrator can reveal the encrypted password copy. */
  password_available?: boolean;
}

export async function listUsers(session: CloudSession): Promise<{ users: UserRecord[] } | UserRecord[]> {
  return apiPost<any>('/api/admin/list_users', {
    admin_token: session.token,
  });
}

export async function updateRemark(session: CloudSession, targetUsername: string, remark: string): Promise<any> {
  const payload = {
    admin_token: session.token,
    username: targetUsername,
    remark,
  };
  try {
    return await apiPost('/api/edu/admin/remark', payload);
  } catch (err) {
    console.warn('/api/edu/admin/remark failed, trying /api/admin/update_remark', err);
    return await apiPost('/api/admin/update_remark', payload);
  }
}

export async function adminLockUser(adminToken: string, username: string): Promise<any> {
  return apiPost('/api/edu/admin/lock_user', { admin_token: adminToken, username });
}

export async function adminUnlockUser(adminToken: string, username: string): Promise<any> {
  return apiPost('/api/edu/admin/unlock_user', { admin_token: adminToken, username });
}

export async function adminSetSubAdmin(adminToken: string, username: string, isSubAdmin: boolean): Promise<any> {
  return apiPost('/api/edu/admin/set_sub_admin', { admin_token: adminToken, username, is_sub_admin: isSubAdmin });
}

export async function adminBanUser(adminToken: string, username: string, ban: boolean): Promise<{ message: string }> {
  return apiPost('/api/admin/ban_user', { admin_token: adminToken, username, ban });
}

export async function adminExtendMembership(adminToken: string, username: string, hours: number): Promise<{ message: string; new_expire_time: string }> {
  return apiPost('/api/admin/extend_membership', { admin_token: adminToken, username, hours });
}

export async function adminDeleteUser(adminToken: string, username: string): Promise<{ message: string }> {
  return apiPost('/api/admin/delete_user', { admin_token: adminToken, username });
}

export async function adminResetBinding(adminToken: string, username: string): Promise<{ message: string }> {
  return apiPost('/api/admin/reset_binding', { admin_token: adminToken, username });
}

export async function adminUnbindBrowserDevice(
  adminToken: string,
  username: string,
  slot: 1 | 2 | 3,
): Promise<{ message: string; browser_machine_ids: string[] }> {
  return apiPost('/api/admin/unbind_browser_device', { admin_token: adminToken, username, slot });
}

export async function adminResetBrowserBindings(
  adminToken: string,
  username: string,
): Promise<{ message: string; browser_machine_ids: string[] }> {
  return apiPost('/api/admin/reset_browser_bindings', { admin_token: adminToken, username });
}

export interface AdminAccountCredentials {
  username: string;
  password: string;
  password_available: boolean;
  message: string;
}

export async function adminGetAccountCredentials(
  adminToken: string,
  username: string,
): Promise<AdminAccountCredentials> {
  return apiPost('/api/admin/account_credentials', { admin_token: adminToken, username });
}

export async function adminUpdateCredentials(
  adminToken: string,
  username: string,
  newUsername?: string,
  newPassword?: string,
): Promise<AdminAccountCredentials & { old_username: string }> {
  const payload: Record<string, string> = { admin_token: adminToken, username };
  if (newUsername !== undefined) payload.new_username = newUsername;
  if (newPassword !== undefined) payload.new_password = newPassword;
  return apiPost('/api/admin/update_credentials', payload);
}

export interface ServerStats {
  total: number;
  online: number;
  expired: number;
  banned: number;
  db_size: string;
  uptime: string;
}

export async function adminGetServerStats(adminToken: string): Promise<ServerStats> {
  return apiPost('/api/admin/get_server_stats', { admin_token: adminToken });
}

export interface ActivityLogRecord {
  id: number;
  username: string;
  event_type: string;
  summary: string;
  details: Record<string, unknown>;
  client_type: string;
  created_at: string;
}

export async function adminListActivity(adminToken: string, username?: string, limit = 300): Promise<{ logs: ActivityLogRecord[]; retention_days: number }> {
  return apiPost('/api/admin/activity_logs', { admin_token: adminToken, username: username || null, limit });
}

export interface ServerBackup {
  name: string;
  created_at: string;
  size: number;
}

export async function listServerBackups(session: CloudSession): Promise<{ backups: ServerBackup[]; retention_days: number; schedule: string[] }> {
  return apiPost('/api/admin/backups/list', { admin_token: session.token }, 20000);
}

export async function createServerBackup(session: CloudSession): Promise<{ backup: ServerBackup }> {
  return apiPost('/api/admin/backups/create', { admin_token: session.token }, 30000);
}

export async function restoreServerBackup(session: CloudSession, backupName: string): Promise<{ message: string; restored: string; safety_backup: string }> {
  return apiPost('/api/admin/backups/restore', { admin_token: session.token, backup_name: backupName }, 60000);
}

/**
 * Load user data via admin token (no active lock needed).
 * Used when admin impersonates a teacher to view/edit their data.
 */
export async function adminInitLoad(adminToken: string, targetUsername: string): Promise<InitLoadResult> {
  return apiPost<InitLoadResult>('/api/edu/admin/load_user_data', { admin_token: adminToken, username: targetUsername }, 30000);
}


