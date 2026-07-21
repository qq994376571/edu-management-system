import { useState, useEffect } from 'react';
import { Users, UserCheck, LogOut, ChevronDown, ChevronUp, Search, RefreshCw, User, Shield, ShieldAlert, DatabaseBackup, RotateCcw, Ban, Trash2, Clock, Monitor, Globe, Settings, X, Wifi, Activity, Eye, EyeOff, KeyRound } from 'lucide-react';
import { listUsers, updateRemark, getServerUrl, adminSetSubAdmin, listServerBackups, createServerBackup, restoreServerBackup, adminBanUser, adminExtendMembership, adminDeleteUser, adminResetBinding, adminUnbindBrowserDevice, adminResetBrowserBindings, adminGetServerStats, adminListActivity, adminGetAccountCredentials, adminUpdateCredentials } from '../lib/cloudSync';
import type { UserRecord, CloudSession, ServerBackup, ServerStats, ActivityLogRecord } from '../lib/cloudSync';
import FontScalePicker from './FontScalePicker';
import type { FontScaleMode } from '../lib/fontScale';

type AdminHelpTopic = 'activity' | 'backup' | 'account' | 'devices';

const ADMIN_HELP_CONTENT: Record<AdminHelpTopic, { title: string; items: string[] }> = {
  activity: {
    title: '活动记录说明',
    items: ['记录登录、教务数据修改与主管理员操作。普通心跳不会写入，避免无效记录占用列表。'],
  },
  backup: {
    title: '备份与回滚说明',
    items: ['恢复到历史版本前，服务器会自动创建当前状态快照，保留一个可再次回滚的节点。'],
  },
  account: {
    title: '账号管理说明',
    items: [
      '会员期限：续期、扣减或填写自定义天数。',
      '登录账号：主管理员可查看加密保存的密码，并可修改用户名或重置密码；修改后旧会话会立即退出。',
      '设备绑定：查看桌面 App 设备码和最多三个浏览器设备码，并可分别解绑。',
      '账号安全：封禁、解封或永久删除账号及其教务数据。',
      '七天操作数据：查看该账号近期登录和数据修改记录。',
    ],
  },
  devices: {
    title: '设备绑定说明',
    items: ['桌面 App 使用独立设备槽；电脑和手机浏览器共同使用三个浏览器槽，可按任意组合绑定最多三台浏览器设备。'],
  },
};

function AdminHelpButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#C68A4C]/50 bg-amber-50 text-xs font-black text-[#A97138] shadow-sm transition-colors hover:bg-amber-100"
    >
      ?
    </button>
  );
}

const isTeacherRemark = (remark?: string) => remark === '教务老师' || remark === 'Teacher';
const isPlannerRemark = (remark?: string) => remark === '规划老师' || remark === 'Planner';
const displayRemark = (remark?: string) => isTeacherRemark(remark) ? '教务老师' : isPlannerRemark(remark) ? '规划老师' : (remark || '');
const parseServerUtcTime = (value?: string) => {
  if (!value) return new Date(Number.NaN);
  const trimmed = value.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  // The server stores activity/member timestamps as naive UTC ISO strings.
  // Appending Z makes browsers convert them to the viewer's local timezone.
  return new Date(hasTimezone ? trimmed : `${trimmed}Z`);
};

const displayServerTime = (value?: string) => {
  if (!value) return '未设置';
  const date = parseServerUtcTime(value);
  if (!Number.isFinite(date.getTime())) return '时间异常';
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
};

const displayExpireTime = displayServerTime;

const browserSlotsFor = (user: UserRecord): [string, string, string] => {
  const values = Array.isArray(user.browser_machine_ids)
    ? user.browser_machine_ids
    : [user.web_machine_id || '', user.mobile_machine_id || '', user.browser_machine_id_3 || ''];
  return [values[0] || '', values[1] || '', values[2] || ''];
};

const browserSlotPatch = (values: string[]) => {
  const slots: [string, string, string] = [values[0] || '', values[1] || '', values[2] || ''];
  return { browser_machine_ids: slots, web_machine_id: slots[0], mobile_machine_id: slots[1], browser_machine_id_3: slots[2] };
};

interface AdminDashboardProps {
  session: CloudSession;
  onLogout: () => void;
  onImpersonate: (impersonatedSession: CloudSession) => void;
  isEndfieldTheme: boolean;
  fontScaleMode?: FontScaleMode;
  onFontScaleChange?: (value: FontScaleMode) => void;
}

export default function AdminDashboard({ session, onLogout, onImpersonate, isEndfieldTheme, fontScaleMode = 'auto', onFontScaleChange = () => {} }: AdminDashboardProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAllUsersExpanded, setIsAllUsersExpanded] = useState(() => session.role === 'sub_admin');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [isBackupPanelOpen, setIsBackupPanelOpen] = useState(false);
  const [backups, setBackups] = useState<ServerBackup[]>([]);
  const [backupMeta, setBackupMeta] = useState<{ retention_days: number; schedule: string[] } | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupAction, setBackupAction] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [serverStats, setServerStats] = useState<ServerStats | null>(null);
  const [managedUser, setManagedUser] = useState<UserRecord | null>(null);
  const [accountAction, setAccountAction] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [membershipDays, setMembershipDays] = useState('30');
  const [accountSection, setAccountSection] = useState<'credentials' | 'membership' | 'devices' | 'security'>('credentials');
  const [credentialUsername, setCredentialUsername] = useState('');
  const [credentialPassword, setCredentialPassword] = useState('');
  const [initialCredentialPassword, setInitialCredentialPassword] = useState('');
  const [credentialAvailable, setCredentialAvailable] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState('');
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [showCredentialPassword, setShowCredentialPassword] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityUser, setActivityUser] = useState('');
  const [activityError, setActivityError] = useState<string | null>(null);
  const [managedActivityOpen, setManagedActivityOpen] = useState(false);
  const [helpTopic, setHelpTopic] = useState<AdminHelpTopic | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 639px)').matches);

  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 639px)');
    if (!query) return;
    const update = () => setIsMobileLayout(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers(session);
      const userList = Array.isArray(data) ? data : (data as any)?.users || [];
      setUsers(userList);
      setManagedUser(current => current ? (userList.find((user: UserRecord) => user.username === current.username) || null) : null);
      if (session.role === 'admin') {
        try { setServerStats(await adminGetServerStats(session.token)); } catch { setServerStats(null); }
      }
    } catch (err: any) {
      setError(err?.message || '获取用户列表失败');
      // Do not fabricate a one-user directory for a failed secondary-admin
      // request.  That made an incompatible/old server look as if secondary
      // administrators were intentionally restricted to their own account.
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [session]);

  // Admin heartbeat: ping the server every 60s to prevent admin token expiry (120s TTL)
  useEffect(() => {
    const ping = async () => {
      try {
        await fetch(`${getServerUrl()}/api/verify_status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: session.username, token: session.token, machine_id: session.machineId }),
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        // Silent — if token expired, onLogout will be triggered by parent
      }
    };
    ping(); // Immediate ping on mount
    const interval = setInterval(ping, 60000);
    return () => clearInterval(interval);
  }, [session]);


  const handleToggleTeacher = async (targetUser: UserRecord) => {
    const isTeacher = isTeacherRemark(targetUser.remark);
    const newRemark = isTeacher ? '' : '教务老师';
    setUpdatingUser(targetUser.username);
    try {
      await updateRemark(session, targetUser.username, newRemark);
      // Immediately move between lists on successful update
      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.username === targetUser.username
            ? {
                ...u,
                remark: newRemark,
                ...(isPlannerRemark(targetUser.remark) ? { role: 'user' as const, is_sub_admin: false } : {}),
              }
          : u
        )
      );
      setManagedUser(previous => previous?.username === targetUser.username
        ? {
            ...previous,
            remark: newRemark,
            ...(isPlannerRemark(targetUser.remark) ? { role: 'user' as const, is_sub_admin: false } : {}),
          }
        : previous);
    } catch (err: any) {
      alert(err?.message || '更新用户标签失败');
    } finally {
      setUpdatingUser(null);
    }
  };

  
  const handleToggleSubAdmin = async (targetUser: UserRecord) => {
    const isCurrentlySubAdmin = targetUser.role === 'sub_admin' || targetUser.is_sub_admin;
    const newStatus = !isCurrentlySubAdmin;
    setUpdatingUser(targetUser.username + '_subadmin');
    try {
      await adminSetSubAdmin(session.token, targetUser.username, newStatus);
      // Update both role and is_sub_admin so UI reflects immediately and after refresh
      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.username === targetUser.username
            ? { ...u, is_sub_admin: newStatus, role: newStatus ? 'sub_admin' : 'user' }
          : u
        )
      );
      setManagedUser(previous => previous?.username === targetUser.username
        ? { ...previous, is_sub_admin: newStatus, role: newStatus ? 'sub_admin' : 'user' }
        : previous);
    } catch (err: any) {
      alert(err?.message || '更新次级管理员权限失败');
    } finally {
      setUpdatingUser(null);
    }
  };

  const handleImpersonateUser = (targetUser: UserRecord) => {
    const targetRole = isPlannerRemark(targetUser.remark)
      ? 'planner'
      : isTeacherRemark(targetUser.remark)
        ? 'user'
        : null;
    if (!targetRole) {
      alert('该账号尚未分配“教务老师”或“规划老师”身份，暂时不能进入。');
      return;
    }
    const impSession: CloudSession = {
      username: targetUser.username,
      token: session.token, // Use admin's authorization token
      machineId: session.machineId,
      expireTime: session.expireTime,
      role: targetRole,
    };
    onImpersonate(impSession);
  };

  const handleTogglePlanner = async (targetUser: UserRecord) => {
    const newRemark = isPlannerRemark(targetUser.remark) ? '' : '规划老师';
    setUpdatingUser(targetUser.username + '_planner');
    try {
      await updateRemark(session, targetUser.username, newRemark);
      setUsers(prevUsers => prevUsers.map(user =>
        user.username === targetUser.username
          ? { ...user, remark: newRemark, role: newRemark === '规划老师' ? 'planner' : 'user', is_sub_admin: false }
          : user
      ));
      setManagedUser(previous => previous?.username === targetUser.username
        ? { ...previous, remark: newRemark, role: newRemark === '规划老师' ? 'planner' : 'user', is_sub_admin: false }
        : previous);
    } catch (err: any) {
      alert(err?.message || '更新规划老师标签失败');
    } finally {
      setUpdatingUser(null);
    }
  };

  const updateManagedUser = (username: string, changes: Partial<UserRecord>) => {
    setUsers(previous => previous.map(user => user.username === username ? { ...user, ...changes } : user));
    setManagedUser(previous => previous?.username === username ? { ...previous, ...changes } : previous);
  };

  const loadAccountCredentials = async (targetUser: UserRecord) => {
    setCredentialUsername(targetUser.username);
    setCredentialPassword('');
    setInitialCredentialPassword('');
    setCredentialAvailable(false);
    setCredentialMessage('正在安全读取账号信息…');
    setShowCredentialPassword(false);
    setCredentialLoading(true);
    try {
      const result = await adminGetAccountCredentials(session.token, targetUser.username);
      setCredentialUsername(result.username);
      setCredentialPassword(result.password || '');
      setInitialCredentialPassword(result.password || '');
      setCredentialAvailable(result.password_available);
      setCredentialMessage(result.message || '');
    } catch (err: any) {
      setCredentialMessage(err?.message || '读取账号密码失败');
    } finally {
      setCredentialLoading(false);
    }
  };

  const openAccountManager = (targetUser: UserRecord, section: 'credentials' | 'membership' | 'devices' | 'security' = 'credentials') => {
    setManagedUser(targetUser);
    setAccountSection(section);
    setAccountError(null);
    setManagedActivityOpen(false);
    void loadAccountCredentials(targetUser);
  };

  const handleUpdateCredentials = async () => {
    if (!managedUser || credentialLoading) return;
    const nextUsername = credentialUsername.trim();
    const usernameChanged = nextUsername !== managedUser.username;
    const passwordChanged = credentialPassword !== initialCredentialPassword;
    if (!nextUsername) return setAccountError('用户名不能为空');
    if (!usernameChanged && !passwordChanged) return setAccountError('用户名和密码均未发生变化');
    if (passwordChanged && !credentialPassword) return setAccountError('新密码不能为空');
    const operation = usernameChanged && passwordChanged
      ? `把用户名改为 ${nextUsername} 并重置密码`
      : usernameChanged ? `把用户名改为 ${nextUsername}` : '重置该账号密码';
    if (!window.confirm(`确定为 ${managedUser.username} ${operation}吗？修改成功后该账号需要重新登录。`)) return;

    const oldUsername = managedUser.username;
    setAccountAction('credentials');
    setAccountError(null);
    try {
      const result = await adminUpdateCredentials(
        session.token,
        oldUsername,
        usernameChanged ? nextUsername : undefined,
        passwordChanged ? credentialPassword : undefined,
      );
      const accountPatch = {
        username: result.username,
        password_available: result.password_available,
        is_online: false,
        is_active: false,
      };
      setUsers(previous => previous.map(user => user.username === oldUsername ? { ...user, ...accountPatch } : user));
      setManagedUser(previous => previous?.username === oldUsername ? { ...previous, ...accountPatch } : previous);
      setActivityUser(previous => previous === oldUsername ? result.username : previous);
      setCredentialUsername(result.username);
      setCredentialPassword(result.password || '');
      setInitialCredentialPassword(result.password || '');
      setCredentialAvailable(result.password_available);
      setCredentialMessage(result.message || '账号信息修改成功');
      setManagedActivityOpen(false);
    } catch (err: any) {
      setAccountError(err?.message || '修改用户名或密码失败；服务器未保存任何部分更改');
    } finally {
      setAccountAction(null);
    }
  };

  const handleMembershipChange = async (days: number) => {
    if (!managedUser || !Number.isFinite(days) || days === 0) return;
    if (days < 0 && !window.confirm(`确定从 ${managedUser.username} 的当前会员到期时间扣减 ${Math.abs(days)} 天吗？`)) return;
    setAccountAction('membership');
    setAccountError(null);
    try {
      const result = await adminExtendMembership(session.token, managedUser.username, days * 24);
      const expiresAt = parseServerUtcTime(result.new_expire_time).getTime();
      updateManagedUser(managedUser.username, {
        expire_time: result.new_expire_time,
        is_expired: Number.isFinite(expiresAt) ? expiresAt <= Date.now() : managedUser.is_expired,
      });
    } catch (err: any) {
      setAccountError(err?.message || '会员期限调整失败');
    } finally {
      setAccountAction(null);
    }
  };

  const handleBanUser = async () => {
    if (!managedUser) return;
    const nextBan = !managedUser.is_banned;
    if (nextBan && !window.confirm(`封禁后 ${managedUser.username} 会立即退出登录，确定继续吗？`)) return;
    setAccountAction('ban');
    setAccountError(null);
    try {
      await adminBanUser(session.token, managedUser.username, nextBan);
      updateManagedUser(managedUser.username, { is_banned: nextBan, is_online: false, is_active: false });
    } catch (err: any) {
      setAccountError(err?.message || '账号封禁状态更新失败');
    } finally {
      setAccountAction(null);
    }
  };

  const handleResetBinding = async () => {
    if (!managedUser || !window.confirm(`将清空 ${managedUser.username} 的桌面 App、电脑浏览器和手机浏览器绑定，并立即退出其当前会话。确定继续吗？`)) return;
    setAccountAction('binding');
    setAccountError(null);
    try {
      await adminResetBinding(session.token, managedUser.username);
      updateManagedUser(managedUser.username, {
        registered_machine_id: '', bound_machine_id: '', ...browserSlotPatch([]),
        is_online: false, is_active: false,
      });
    } catch (err: any) {
      setAccountError(err?.message || '设备重新绑定操作失败');
    } finally {
      setAccountAction(null);
    }
  };

  const handleUnbindBrowserSlot = async (slot: 1 | 2 | 3) => {
    if (!managedUser || !window.confirm(`确定解绑 ${managedUser.username} 的浏览器设备 ${slot} 吗？`)) return;
    setAccountAction(`browser-${slot}`);
    setAccountError(null);
    try {
      const result = await adminUnbindBrowserDevice(session.token, managedUser.username, slot);
      updateManagedUser(managedUser.username, browserSlotPatch(result.browser_machine_ids || []));
    } catch (err: any) {
      setAccountError(err?.message || '浏览器设备解绑失败');
    } finally {
      setAccountAction(null);
    }
  };

  const handleResetBrowserDevices = async () => {
    if (!managedUser || !window.confirm(`将清空 ${managedUser.username} 的三个浏览器设备槽，但保留桌面 App 绑定。确定继续吗？`)) return;
    setAccountAction('browser-all');
    setAccountError(null);
    try {
      const result = await adminResetBrowserBindings(session.token, managedUser.username);
      updateManagedUser(managedUser.username, browserSlotPatch(result.browser_machine_ids || []));
    } catch (err: any) {
      setAccountError(err?.message || '浏览器设备重置失败');
    } finally {
      setAccountAction(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!managedUser) return;
    const typed = window.prompt(`删除会同时永久清除该账号的学生、申请季、日历和设置数据。请输入账号 ${managedUser.username} 确认：`);
    if (typed !== managedUser.username) return;
    setAccountAction('delete');
    setAccountError(null);
    try {
      await adminDeleteUser(session.token, managedUser.username);
      setUsers(previous => previous.filter(user => user.username !== managedUser.username));
      setManagedUser(null);
    } catch (err: any) {
      setAccountError(err?.message || '删除账号失败');
    } finally {
      setAccountAction(null);
    }
  };

  const fetchActivity = async (username = activityUser) => {
    if (session.role !== 'admin') return;
    setActivityLoading(true);
    setActivityError(null);
    try {
      const result = await adminListActivity(session.token, username || undefined, 500);
      setActivityLogs(result.logs || []);
    } catch (err: any) {
      setActivityError(err?.message || '读取账号活动记录失败');
    } finally {
      setActivityLoading(false);
    }
  };

  const toggleActivityPanel = () => {
    setActivityOpen(open => !open);
    if (!activityOpen) {
      setActivityUser('');
      void fetchActivity('');
    }
  };

  const toggleManagedActivity = () => {
    if (!managedUser) return;
    const nextOpen = !managedActivityOpen;
    setManagedActivityOpen(nextOpen);
    if (nextOpen) {
      setActivityUser(managedUser.username);
      void fetchActivity(managedUser.username);
    }
  };

  const fetchBackups = async () => {
    if (session.role !== 'admin') return;
    setBackupLoading(true);
    setBackupError(null);
    try {
      const result = await listServerBackups(session);
      setBackups(result.backups || []);
      setBackupMeta({ retention_days: result.retention_days, schedule: result.schedule || [] });
    } catch (err: any) {
      setBackupError(err?.message || '无法读取服务器备份列表');
    } finally {
      setBackupLoading(false);
    }
  };

  const openBackupPanel = () => {
    setIsBackupPanelOpen(open => !open);
    if (!isBackupPanelOpen) void fetchBackups();
  };

  const handleCreateBackup = async () => {
    setBackupAction('create');
    setBackupError(null);
    try {
      await createServerBackup(session);
      await fetchBackups();
    } catch (err: any) {
      setBackupError(err?.message || '创建服务器备份失败');
    } finally {
      setBackupAction(null);
    }
  };

  const handleRestoreBackup = async (backup: ServerBackup) => {
    if (!window.confirm(`将服务器恢复到 ${backup.created_at} 的备份。当前状态会先自动备份，确定继续吗？`)) return;
    setBackupAction(backup.name);
    setBackupError(null);
    try {
      const result = await restoreServerBackup(session, backup.name);
      alert(`恢复完成。恢复前快照：${result.safety_backup}`);
      await fetchBackups();
      await fetchUsers();
    } catch (err: any) {
      setBackupError(err?.message || '恢复服务器备份失败');
    } finally {
      setBackupAction(null);
    }
  };

  // Filtered lists
  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const teachers = filteredUsers.filter(u => isTeacherRemark(u.remark));
  const otherUsers = filteredUsers.filter(u => !isTeacherRemark(u.remark));

  // Styles based on theme
  const themeBg = isEndfieldTheme ? 'bg-[#111215] text-[#c8cbd0]' : 'bg-[#F3EFE6] text-slate-800';
  const headerBg = isEndfieldTheme ? 'bg-[#17181c] border-b border-[#FF6A00]/15' : 'bg-[#FAF8F5] border-b border-[#E5DEC9]';
  const cardBg = isEndfieldTheme ? 'bg-[#17181c] border border-[#FF6A00]/10' : 'bg-[#FAF8F5] border border-[#E5DEC9]';
  const tableHeaderBg = isEndfieldTheme ? 'bg-[#1e1f24] text-stone-400 border-b border-[#FF6A00]/10' : 'bg-[#FAF8F5] text-slate-600 border-b border-[#E5DEC9]';
  const tableRowBg = isEndfieldTheme ? 'bg-[#17181c] hover:bg-[#1e1f24] border-b border-[#FF6A00]/5' : 'bg-white hover:bg-[#FAF8F5] border-b border-[#E5DEC9]/50';
  const primaryBtn = isEndfieldTheme 
    ? 'bg-transparent border border-[#FF6A00] text-[#FF6A00] hover:bg-[#FF6A00] hover:text-[#111215] transition-all cursor-pointer font-mono'
    : 'bg-[#C68A4C] text-white hover:bg-[#A97138] transition-colors cursor-pointer font-serif';
  const secondaryBtn = isEndfieldTheme
    ? 'border border-stone-700 text-stone-400 hover:border-[#FF6A00] hover:text-[#FF6A00] transition-all cursor-pointer font-mono'
    : 'border border-slate-300 text-slate-600 hover:border-[#C68A4C] hover:text-[#C68A4C] transition-colors cursor-pointer font-serif';

  const canAccessUser = (user: UserRecord) => isTeacherRemark(user.remark) || isPlannerRemark(user.remark);
  const accessLabelFor = (user: UserRecord) => !canAccessUser(user)
    ? '待分配身份'
    : session.role === 'planner'
      ? '查看'
      : session.role === 'sub_admin' && user.username === session.username
      ? '进入我的教务'
      : isPlannerRemark(user.remark)
        ? '模拟进入规划'
        : '模拟进入教务';

  const renderMobileUserCard = (user: UserRecord) => {
    const teacher = isTeacherRemark(user.remark);
    const subAdmin = user.role === 'sub_admin' || user.is_sub_admin;
    return <article key={user.username} className={`p-4 space-y-3 ${tableRowBg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="font-bold break-all">{user.username}</p><div className="mt-2 flex flex-wrap gap-1.5">{teacher && <span className="px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap bg-amber-100 text-amber-800 border border-amber-200">教务老师</span>}{isPlannerRemark(user.remark) && <span className="px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap bg-blue-100 text-blue-800 border border-blue-200">规划老师</span>}{subAdmin && <span className="px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap bg-purple-100 text-purple-800 border border-purple-200">次级管理员</span>}{!user.remark && !subAdmin && <span className="text-xs text-slate-400">暂无系统备注</span>}</div></div>
        {session.role === 'admin' && <span className={`shrink-0 whitespace-nowrap px-2 py-1 rounded-full text-[10px] font-bold ${user.is_banned ? 'bg-red-100 text-red-700' : user.is_expired ? 'bg-amber-100 text-amber-700' : user.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{user.is_banned ? '已封禁' : user.is_expired ? '已过期' : user.is_online ? '在线' : '正常·离线'}</span>}
      </div>
      {session.role === 'admin' && <p className="text-xs text-slate-500">到期：<span className={user.is_expired ? 'text-amber-700 font-semibold' : 'text-slate-700'}>{displayExpireTime(user.expire_time)}</span></p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {session.role === 'admin' && <button aria-label={`${user.username} 账号详情`} onClick={() => openAccountManager(user)} className="whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs border border-slate-400 text-slate-600 inline-flex items-center gap-1"><Settings className="w-3.5 h-3.5" />详情</button>}
        <button disabled={!canAccessUser(user)} onClick={() => handleImpersonateUser(user)} title={!canAccessUser(user) ? '请先在账号详情中设置教务老师或规划老师身份' : accessLabelFor(user)} className={`ml-auto inline-flex min-h-10 min-w-max shrink-0 items-center justify-center whitespace-nowrap px-4 py-1.5 text-xs leading-none rounded-lg ${primaryBtn} disabled:cursor-not-allowed disabled:opacity-45`}>{accessLabelFor(user)}</button>
      </div>
    </article>;
  };

  return (
    <div
      data-testid="admin-scroll-container"
      className={`admin-mobile-shell h-[100svh] min-h-0 max-w-full overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] md:h-auto md:min-h-screen md:overflow-visible md:overscroll-auto md:touch-auto ${themeBg} flex flex-col font-sans`}
    >
      {/* Header */}
      <header className={`${headerBg} min-w-0 px-3 sm:px-8 py-2 sm:py-4 flex items-center justify-between gap-2 sm:gap-3 shadow-sm`}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {isEndfieldTheme ? (
            <div className="flex items-center gap-2">
              <span className="text-[#FF6A00] text-xl font-mono font-bold tracking-widest">[ ADMIN_DASHBOARD_CORE ]</span>
              <span className="bg-[#FF6A00]/10 text-[#FF6A00] text-[10px] px-2 py-0.5 font-mono border border-[#FF6A00]/25">SECURE</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 shrink-0 text-[#C68A4C] sm:h-6 sm:w-6" />
              <h1 className="min-w-0 truncate text-base font-bold font-serif text-slate-800 sm:text-xl"><span className="sm:hidden">{session.role === 'planner' ? '只读中心' : '管理后台'}</span><span className="hidden sm:inline">教务进度中心 — {session.role === 'planner' ? '规划老师只读中心' : '管理后台'}</span></h1>
            </div>
          )}
        </div>

        <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:gap-3">
          <div className="hidden min-w-0 items-center gap-1.5 min-[360px]:flex">
            <User className={`h-4 w-4 shrink-0 ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-[#C68A4C]'}`} />
            <span className={`${isEndfieldTheme ? 'font-mono' : 'font-serif text-slate-700'} max-w-[72px] truncate text-xs sm:max-w-none sm:text-sm`}>
              <span className="hidden sm:inline">{session.role === 'planner' ? '规划老师' : '管理员'}: </span><span className="font-bold">{session.username}</span>
            </span>
          </div>

          <FontScalePicker value={fontScaleMode} onChange={onFontScaleChange} isEndfieldTheme={isEndfieldTheme} />

          <button
            onClick={onLogout}
            aria-label="退出登录"
            title="退出登录"
            className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm ${secondaryBtn}`}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">退出登录</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 p-3 sm:p-8 max-w-[1500px] w-full mx-auto space-y-6">
        {/* Top Control Bar */}
        <div className={`grid grid-cols-3 sm:flex gap-2 sm:gap-4 items-center justify-between p-3 sm:p-4 rounded-xl ${cardBg}`}>
          <div className="relative w-full sm:w-80 col-span-3 sm:col-auto">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="搜索用户..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none ${
                isEndfieldTheme
                  ? 'bg-stone-900 border border-[#FF6A00]/20 text-stone-300 focus:border-[#FF6A00]'
                  : 'bg-white border border-[#E5DEC9] text-slate-800 focus:border-[#C68A4C]'
              }`}
            />
          </div>

          <button
            onClick={fetchUsers}
            disabled={loading}
            className={`flex items-center justify-center gap-1.5 px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm ${secondaryBtn}`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="sm:hidden">刷新</span><span className="hidden sm:inline">刷新数据</span>
          </button>
          {session.role === 'admin' && (
            <button
              onClick={openBackupPanel}
              className={`flex items-center justify-center gap-1.5 px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm ${secondaryBtn}`}
            >
              <DatabaseBackup className="w-4 h-4" />
              <span className="sm:hidden">备份</span><span className="hidden sm:inline">数据备份与回滚</span>
            </button>
          )}
          {session.role === 'admin' && (
            <button onClick={toggleActivityPanel} className={`flex items-center justify-center gap-1.5 px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm ${secondaryBtn}`}>
              <Activity className="w-4 h-4" /><span className="sm:hidden">活动</span><span className="hidden sm:inline">近7天账号活动</span>
            </button>
          )}
        </div>

        {session.role === 'admin' && serverStats && (
          <section className="grid grid-cols-4 gap-1.5 sm:gap-3">
            {[
              ['注册账号', serverStats.total, Users, 'text-blue-600 bg-blue-50 border-blue-100'],
              ['当前在线', serverStats.online, Wifi, 'text-emerald-600 bg-emerald-50 border-emerald-100'],
              ['会员已过期', serverStats.expired, Clock, 'text-amber-600 bg-amber-50 border-amber-100'],
              ['已封禁', serverStats.banned, Ban, 'text-red-600 bg-red-50 border-red-100'],
            ].map(([label, value, Icon, colors]: any[]) => (
              <div key={label} className={`rounded-lg sm:rounded-xl border p-2 sm:p-4 flex items-center justify-center sm:justify-start gap-1 sm:gap-3 min-w-0 ${isEndfieldTheme ? cardBg : colors}`}>
                <Icon className="hidden sm:block w-5 h-5" />
                <div className="min-w-0 text-center sm:text-left"><p className="text-[9px] sm:text-xs opacity-75 whitespace-nowrap overflow-hidden text-ellipsis">{label}</p><p className="text-base sm:text-xl font-bold leading-tight">{value}</p></div>
              </div>
            ))}
          </section>
        )}

        {session.role === 'admin' && activityOpen && (
          <section className={`rounded-xl shadow-sm p-5 space-y-4 ${cardBg}`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2"><h2 className={`font-bold flex items-center gap-2 ${isEndfieldTheme ? 'font-mono text-[#FF6A00]' : 'font-serif text-slate-800 text-lg'}`}><Activity className="w-5 h-5" />近 7 天账号活动</h2><AdminHelpButton onClick={() => setHelpTopic('activity')} label="查看活动记录说明" /></div>
              <div className="flex gap-2">
                <select value={activityUser} onChange={event => { setActivityUser(event.target.value); void fetchActivity(event.target.value); }} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm min-w-40" aria-label="活动用户筛选"><option value="">全部账号</option>{users.map(user => <option key={user.username} value={user.username}>{user.username}</option>)}</select>
                <button onClick={() => fetchActivity()} disabled={activityLoading} className={`px-3 py-2 rounded-lg text-xs ${secondaryBtn}`}><RefreshCw className={`w-3.5 h-3.5 inline mr-1 ${activityLoading ? 'animate-spin' : ''}`} />刷新</button>
              </div>
            </div>
            {activityError && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-3 text-sm">{activityError}</div>}
            {activityLoading ? <div className="py-8 text-center text-sm text-slate-400">正在读取活动记录…</div> : activityLogs.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">近 7 天没有符合条件的活动</div> : (
              <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2">
                {activityLogs.map(log => {
                  const clientLabel = log.client_type === 'mobile_web' ? '手机浏览器' : log.client_type === 'web' ? '电脑浏览器' : log.client_type === 'desktop' ? '桌面 App' : '服务器';
                  const studentEvents = Array.isArray((log.details as any)?.student_events) ? (log.details as any).student_events : [];
                  const seasonEvents = Array.isArray((log.details as any)?.season_events) ? (log.details as any).season_events : [];
                  return <div key={log.id} className={`rounded-lg border p-3 flex gap-3 ${isEndfieldTheme ? 'border-stone-800 bg-[#111215]' : 'border-[#E5DEC9] bg-white'}`}>
                    <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${log.event_type === 'login' ? 'bg-emerald-500' : log.event_type === 'logout' ? 'bg-slate-400' : log.event_type.startsWith('admin_') || log.event_type === 'reset_binding' ? 'bg-red-500' : 'bg-[#C68A4C]'}`} />
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-bold text-sm">{log.username}</span><span className="text-sm">{log.summary}</span><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{clientLabel}</span><time className="text-xs text-slate-400 ml-auto">{displayServerTime(log.created_at)}</time></div>{(studentEvents.length > 0 || seasonEvents.length > 0) && <div className="mt-2 text-xs text-slate-500 space-y-1">{studentEvents.slice(0, 5).map((item: any, index: number) => <p key={`student-${index}`}>• {item.student ? `${item.student}：` : ''}{item.action}{item.detail ? ` — ${item.detail}` : ''}</p>)}{seasonEvents.slice(0, 3).map((item: any, index: number) => <p key={`season-${index}`}>• {item.season ? `${item.season}：` : ''}{item.action}</p>)}</div>}</div>
                  </div>;
                })}
              </div>
            )}
          </section>
        )}

        {session.role === 'admin' && isBackupPanelOpen && (
          <section className={`rounded-xl shadow-sm p-5 space-y-4 ${cardBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><h2 className={`font-bold ${isEndfieldTheme ? 'font-mono text-[#FF6A00]' : 'font-serif text-slate-800 text-lg'}`}>服务器数据备份与回滚</h2><AdminHelpButton onClick={() => setHelpTopic('backup')} label="查看备份与回滚说明" /></div>
                <p className="text-xs text-slate-500 mt-1">每天 {backupMeta?.schedule?.join('、') || '06:00、18:00'} · 保留 {backupMeta?.retention_days || 7} 天</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateBackup} disabled={backupAction !== null} className={`px-3 py-1.5 rounded-lg text-xs ${primaryBtn}`}>
                  {backupAction === 'create' ? '正在备份...' : '立即创建备份'}
                </button>
                <button onClick={fetchBackups} disabled={backupLoading || backupAction !== null} className={`px-3 py-1.5 rounded-lg text-xs ${secondaryBtn}`}>
                  <RefreshCw className={`inline w-3.5 h-3.5 mr-1 ${backupLoading ? 'animate-spin' : ''}`} />刷新列表
                </button>
              </div>
            </div>
            {backupError && <div className="text-sm rounded-lg border border-red-200 bg-red-50 text-red-700 p-3">{backupError}</div>}
            {backupLoading ? (
              <div className="text-sm text-slate-400">正在读取备份列表...</div>
            ) : backups.length === 0 ? (
              <div className="text-sm text-slate-400">还没有服务器备份。可先创建即时备份，自动计划会在下一个 06:00 或 18:00 执行。</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className={tableHeaderBg}><tr><th className="p-2">备份时间</th><th className="p-2">大小</th><th className="p-2 text-right">操作</th></tr></thead>
                  <tbody>
                    {backups.map(backup => (
                      <tr key={backup.name} className={tableRowBg}>
                        <td className="p-2">{backup.created_at}</td>
                        <td className="p-2">{(backup.size / 1024 / 1024).toFixed(2)} MB</td>
                        <td className="p-2 text-right"><button onClick={() => handleRestoreBackup(backup)} disabled={backupAction !== null} className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-amber-500 text-amber-600 hover:bg-amber-500 hover:text-white text-xs"><RotateCcw className="w-3.5 h-3.5" />{backupAction === backup.name ? '恢复中...' : '恢复到此版本'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {error && (
          <div className={`p-4 rounded-xl flex items-start gap-3 border ${
            isEndfieldTheme
              ? 'bg-[#2a1315] border-red-950 text-red-400'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-bold text-sm">错误提示</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* 教务老师面板（默认视图） */}
        <section className={`rounded-xl shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 flex items-center justify-between border-b ${
            isEndfieldTheme ? 'border-[#FF6A00]/10 bg-[#1e1f24]' : 'border-[#E5DEC9] bg-[#FAF8F5]'
          }`}>
            <div className="flex items-center gap-2">
              <UserCheck className={`w-5 h-5 ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-[#C68A4C]'}`} />
              <h2 className={`font-bold ${isEndfieldTheme ? 'font-mono text-[#FF6A00] tracking-wider' : 'font-serif text-slate-800 text-lg'}`}>
                教务老师面板
              </h2>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isEndfieldTheme ? 'bg-[#FF6A00]/10 text-[#FF6A00]' : 'bg-[#FAF8F5] text-slate-500 border border-[#E5DEC9]'
            }`}>
              共 {teachers.length} 人
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
              正在加载用户列表...
            </div>
          ) : teachers.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400 font-serif">
              暂无已标记为教务的用户
            </div>
          ) : (
            isMobileLayout ? <div className="divide-y divide-[#E5DEC9]">{teachers.map(renderMobileUserCard)}</div> : <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className={tableHeaderBg}>
                    <th className="px-6 py-3 font-semibold">用户名</th>
                    <th className="px-6 py-3 font-semibold">系统备注</th>
                    {session.role === 'admin' && <th className="px-6 py-3 font-semibold">账号状态</th>}
                    {session.role === 'admin' && <th className="px-6 py-3 font-semibold">会员到期时间</th>}
                    <th className="px-6 py-3 font-semibold text-right">管理操作</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map(user => (
                    <tr key={user.username} className={tableRowBg}>
                      <td className="px-6 py-4 font-medium">{user.username}</td>
                      <td className="px-6 py-4 min-w-[190px]">
                        <div className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          isEndfieldTheme ? 'bg-[#FF6A00]/10 text-[#FF6A00] border border-[#FF6A00]/20' : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          教务老师
                        </span>
                        {(user.role === 'sub_admin' || user.is_sub_admin) && (
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${isEndfieldTheme ? 'bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/30' : 'bg-purple-100 text-purple-800 border border-purple-200'}`}>
                            次级管理员
                          </span>
                        )}
                        </div>
                      </td>
                      {session.role === 'admin' && <td className="px-6 py-4 min-w-[110px]">
                        <span className={`inline-flex whitespace-nowrap px-2 py-1 rounded-full text-[11px] font-bold ${user.is_banned ? 'bg-red-100 text-red-700' : user.is_expired ? 'bg-amber-100 text-amber-700' : user.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {user.is_banned ? '已封禁' : user.is_expired ? '已过期' : user.is_online ? '在线' : '正常·离线'}
                        </span>
                      </td>}
                      {session.role === 'admin' && <td className="px-6 py-4 min-w-[180px] whitespace-nowrap text-sm"><span className={user.is_expired ? 'text-amber-700 font-semibold' : 'text-slate-600'}>{displayExpireTime(user.expire_time)}</span></td>}
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-nowrap justify-end gap-2 min-w-[210px]">
                        {session.role === 'admin' && (
                          <button aria-label={`${user.username} 账号详情`} onClick={() => openAccountManager(user, 'membership')} className="px-3 py-1.5 rounded-lg text-xs border border-slate-400 text-slate-600 hover:border-[#C68A4C] hover:text-[#C68A4C] transition-all cursor-pointer inline-flex items-center gap-1 whitespace-nowrap">
                            <Settings className="w-3.5 h-3.5" />账号详情
                          </button>
                        )}
                        <button
                          onClick={() => handleImpersonateUser(user)}
                          className={`inline-flex min-w-max shrink-0 items-center justify-center whitespace-nowrap px-3 py-1.5 text-xs leading-none rounded-lg ${primaryBtn}`}
                        >
                          {accessLabelFor(user)}
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Collapsible View (All Registered Users) */}
        {session.role !== 'planner' && <section className={`rounded-xl shadow-sm overflow-hidden ${cardBg}`}>
          <button
            onClick={() => setIsAllUsersExpanded(!isAllUsersExpanded)}
            className={`w-full px-6 py-4 flex items-center justify-between focus:outline-none border-b cursor-pointer ${
              isEndfieldTheme ? 'border-[#FF6A00]/10 bg-[#1e1f24]' : 'border-[#E5DEC9] bg-[#FAF8F5]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className={`w-5 h-5 ${isEndfieldTheme ? 'text-[#FF6A00]' : 'text-[#C68A4C]'}`} />
              <h2 className={`font-bold ${isEndfieldTheme ? 'font-mono text-[#FF6A00] tracking-wider' : 'font-serif text-slate-800 text-lg'}`}>
                所有注册用户
              </h2>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isEndfieldTheme ? 'bg-[#FF6A00]/5 text-stone-400' : 'bg-[#FAF8F5] text-slate-500 border border-[#E5DEC9]'
              }`}>
                其他 {otherUsers.length} 人
              </span>
              {isAllUsersExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </button>

          {isAllUsersExpanded && (
            loading ? (
              <div className="p-12 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
                正在加载用户列表...
              </div>
            ) : otherUsers.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400 font-serif">
                暂无其他注册用户
              </div>
            ) : (
              isMobileLayout ? <div className="divide-y divide-[#E5DEC9]">{otherUsers.map(renderMobileUserCard)}</div> : <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className={tableHeaderBg}>
                      <th className="px-6 py-3 font-semibold">用户名</th>
                      <th className="px-6 py-3 font-semibold">当前备注</th>
                      {session.role === 'admin' && <th className="px-6 py-3 font-semibold">账号状态</th>}
                      {session.role === 'admin' && <th className="px-6 py-3 font-semibold">会员到期时间</th>}
                      <th className="px-6 py-3 font-semibold text-right">管理操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherUsers.map(user => (
                      <tr key={user.username} className={tableRowBg}>
                        <td className="px-6 py-4 font-medium">{user.username}</td>
                        <td className="px-6 py-4 text-slate-400 min-w-[190px] whitespace-nowrap">
                          <div className="inline-flex items-center gap-2 whitespace-nowrap">
                          {!isPlannerRemark(user.remark) && (displayRemark(user.remark) || <span className="italic text-stone-500">—</span>)}
                          {isPlannerRemark(user.remark) && (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">规划老师</span>
                          )}
                          {(user.role === 'sub_admin' || user.is_sub_admin) && (
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${isEndfieldTheme ? 'bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/30' : 'bg-purple-100 text-purple-800 border border-purple-200'}`}>
                            次级管理员
                          </span>
                        )}
                          </div>
                        </td>
                        {session.role === 'admin' && <td className="px-6 py-4 min-w-[110px]">
                          <span className={`inline-flex whitespace-nowrap px-2 py-1 rounded-full text-[11px] font-bold ${user.is_banned ? 'bg-red-100 text-red-700' : user.is_expired ? 'bg-amber-100 text-amber-700' : user.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {user.is_banned ? '已封禁' : user.is_expired ? '已过期' : user.is_online ? '在线' : '正常·离线'}
                          </span>
                        </td>}
                        {session.role === 'admin' && <td className="px-6 py-4 min-w-[180px] whitespace-nowrap text-sm"><span className={user.is_expired ? 'text-amber-700 font-semibold' : 'text-slate-600'}>{displayExpireTime(user.expire_time)}</span></td>}
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-nowrap justify-end gap-2 min-w-[210px]">
                          {session.role === 'admin' && (
                            <button aria-label={`${user.username} 账号详情`} onClick={() => openAccountManager(user, 'credentials')} className="px-3 py-1.5 rounded-lg text-xs border border-slate-400 text-slate-600 hover:border-[#C68A4C] hover:text-[#C68A4C] transition-all cursor-pointer inline-flex items-center gap-1 whitespace-nowrap">
                              <Settings className="w-3.5 h-3.5" />账号详情
                            </button>
                          )}
                          <button
                            disabled={!canAccessUser(user)}
                            onClick={() => handleImpersonateUser(user)}
                            title={!canAccessUser(user) ? '请先设置教务老师或规划老师身份' : accessLabelFor(user)}
                            className={`inline-flex min-w-max shrink-0 items-center justify-center whitespace-nowrap px-3 py-1.5 text-xs leading-none rounded-lg ${primaryBtn} disabled:cursor-not-allowed disabled:opacity-45`}
                          >
                            {accessLabelFor(user)}
                          </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </section>}
      </main>

      {session.role === 'admin' && managedUser && (
        <div className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={event => { if (event.target === event.currentTarget && !accountAction) setManagedUser(null); }}>
          <div role="dialog" aria-modal="true" aria-label={`${managedUser.username} 账号详情`} className={`w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl ${isEndfieldTheme ? 'bg-[#111215] border border-[#FF6A00]/40 text-stone-200' : 'bg-[#FAF8F5] border border-[#E5DEC9] text-slate-800'}`}>
            <div className={`sticky top-0 z-10 px-4 py-3 sm:px-6 sm:py-4 flex flex-wrap items-center justify-between gap-2 border-b ${isEndfieldTheme ? 'bg-[#17181c] border-[#FF6A00]/20' : 'bg-[#FAF8F5] border-[#E5DEC9]'}`}>
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="min-w-0 break-all text-xl font-bold font-serif flex items-center gap-2"><Settings className="w-5 h-5 shrink-0 text-[#C68A4C]" />{managedUser.username}</h2>
                <AdminHelpButton onClick={() => setHelpTopic('account')} label="查看账号管理说明" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={toggleManagedActivity} disabled={activityLoading} className={`px-3 py-2 rounded-lg text-xs inline-flex items-center gap-1.5 ${managedActivityOpen ? primaryBtn : secondaryBtn}`}><Activity className="w-3.5 h-3.5" />七天操作数据</button>
                <button onClick={() => !accountAction && setManagedUser(null)} className="p-2 rounded-lg hover:bg-slate-200/60 text-slate-500" aria-label="关闭账号管理"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="p-4 sm:p-6 flex flex-col gap-5">
              {accountError && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{accountError}</div>}

              <section className={`rounded-xl border p-4 ${isEndfieldTheme ? 'border-stone-800 bg-[#17181c]' : 'border-[#E5DEC9] bg-white'}`}>
                <h3 className="font-bold mb-3 flex items-center gap-2"><User className="w-4 h-4 text-[#C68A4C]" />身份与权限</h3>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleToggleTeacher(managedUser)} disabled={!!accountAction || !!updatingUser} className={`whitespace-nowrap px-3 py-2 rounded-lg text-xs border transition-colors ${isTeacherRemark(managedUser.remark) ? 'border-red-400 text-red-600 hover:bg-red-600 hover:text-white' : 'border-emerald-400 text-emerald-700 hover:bg-emerald-600 hover:text-white'}`}>{updatingUser === managedUser.username ? '处理中…' : isTeacherRemark(managedUser.remark) ? '取消教务老师' : '设为教务老师'}</button>
                  <button onClick={() => handleTogglePlanner(managedUser)} disabled={!!accountAction || !!updatingUser} className={`whitespace-nowrap px-3 py-2 rounded-lg text-xs border transition-colors ${isPlannerRemark(managedUser.remark) ? 'border-orange-400 text-orange-700 hover:bg-orange-500 hover:text-white' : 'border-blue-400 text-blue-700 hover:bg-blue-600 hover:text-white'}`}>{updatingUser === managedUser.username + '_planner' ? '处理中…' : isPlannerRemark(managedUser.remark) ? '取消规划老师' : '设为规划老师'}</button>
                  <button onClick={() => handleToggleSubAdmin(managedUser)} disabled={!!accountAction || !!updatingUser || isPlannerRemark(managedUser.remark)} className={`whitespace-nowrap px-3 py-2 rounded-lg text-xs border transition-colors ${(managedUser.role === 'sub_admin' || managedUser.is_sub_admin) ? 'border-orange-400 text-orange-700 hover:bg-orange-500 hover:text-white' : 'border-purple-400 text-purple-700 hover:bg-purple-600 hover:text-white'}`}>{updatingUser === managedUser.username + '_subadmin' ? '处理中…' : (managedUser.role === 'sub_admin' || managedUser.is_sub_admin) ? '取消次级管理员' : '设为次级管理员'}</button>
                </div>
              </section>

              {managedActivityOpen && (
                <section className={`order-first rounded-xl border p-4 ${isEndfieldTheme ? 'border-[#FF6A00]/25 bg-[#17181c]' : 'border-[#E5DEC9] bg-white'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3"><div className="flex min-w-0 items-center gap-2"><h3 className="min-w-0 font-bold flex items-center gap-2"><Activity className="w-4 h-4 shrink-0 text-[#C68A4C]" />{managedUser.username} · 近七天操作数据</h3><AdminHelpButton onClick={() => setHelpTopic('activity')} label="查看活动记录说明" /></div><button onClick={() => fetchActivity(managedUser.username)} disabled={activityLoading} className={`ml-auto px-3 py-1.5 rounded-lg text-xs ${secondaryBtn}`}><RefreshCw className={`w-3.5 h-3.5 inline mr-1 ${activityLoading ? 'animate-spin' : ''}`} />刷新</button></div>
                  {activityError ? <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-3 text-sm">{activityError}</div> : activityLoading ? <div className="py-6 text-center text-sm text-slate-400">正在读取活动记录…</div> : activityLogs.length === 0 ? <div className="py-6 text-center text-sm text-slate-400">该账号近七天没有操作记录</div> : (
                    <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                      {activityLogs.map(log => {
                        const clientLabel = log.client_type === 'mobile_web' ? '手机浏览器' : log.client_type === 'web' ? '电脑浏览器' : log.client_type === 'desktop' ? '桌面 App' : '服务器';
                        const studentEvents = Array.isArray((log.details as any)?.student_events) ? (log.details as any).student_events : [];
                        const seasonEvents = Array.isArray((log.details as any)?.season_events) ? (log.details as any).season_events : [];
                        return <div key={log.id} className={`rounded-lg border px-3 py-2.5 ${isEndfieldTheme ? 'border-stone-800 bg-[#111215]' : 'border-[#E5DEC9] bg-slate-50/70'}`}><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{log.summary}</span><span className="text-[10px] whitespace-nowrap rounded-full bg-slate-200/70 text-slate-600 px-2 py-0.5">{clientLabel}</span><time className="ml-auto text-xs whitespace-nowrap text-slate-400">{displayServerTime(log.created_at)}</time></div>{(studentEvents.length > 0 || seasonEvents.length > 0) && <div className="mt-2 space-y-1 text-xs text-slate-500">{studentEvents.slice(0, 5).map((item: any, index: number) => <p key={`student-${index}`}>• {item.student ? `${item.student}：` : ''}{item.action}{item.detail ? ` — ${item.detail}` : ''}</p>)}{seasonEvents.slice(0, 3).map((item: any, index: number) => <p key={`season-${index}`}>• {item.season ? `${item.season}：` : ''}{item.action}</p>)}</div>}</div>;
                      })}
                    </div>
                  )}
                </section>
              )}

              <section className={`rounded-xl border p-4 ${accountSection === 'credentials' ? 'order-first ring-2 ring-sky-400/40' : ''} ${isEndfieldTheme ? 'border-stone-800 bg-[#17181c]' : 'border-[#E5DEC9] bg-white'}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold flex items-center gap-2"><KeyRound className="w-4 h-4 text-[#C68A4C]" />登录账号与密码</h3>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${credentialAvailable ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {credentialLoading ? '读取中' : credentialAvailable ? '密码可查看' : '旧密码不可还原'}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="min-w-0 text-xs font-semibold text-slate-600">
                    用户名
                    <input
                      type="text"
                      value={credentialUsername}
                      onChange={event => setCredentialUsername(event.target.value)}
                      disabled={credentialLoading || !!accountAction}
                      autoComplete="off"
                      spellCheck={false}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 disabled:opacity-60"
                    />
                  </label>
                  <label className="min-w-0 text-xs font-semibold text-slate-600">
                    密码
                    <span className="relative mt-1.5 block">
                      <input
                        type={showCredentialPassword ? 'text' : 'password'}
                        value={credentialPassword}
                        onChange={event => setCredentialPassword(event.target.value)}
                        disabled={credentialLoading || !!accountAction}
                        autoComplete="new-password"
                        placeholder={credentialAvailable ? '' : '输入新密码即可重置'}
                        className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-11 text-sm text-slate-800 disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCredentialPassword(value => !value)}
                        disabled={credentialLoading || !credentialPassword}
                        aria-label={showCredentialPassword ? '隐藏密码' : '显示密码'}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 disabled:opacity-35"
                      >
                        {showCredentialPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </span>
                  </label>
                </div>
                <p className={`mt-3 text-xs leading-relaxed ${credentialAvailable ? 'text-slate-500' : 'text-amber-700'}`}>
                  {credentialMessage || '读取失败时不会影响该账号原密码登录；可直接输入新密码重置。'}
                </p>
                <div className="mt-3 flex justify-end border-t border-slate-200 pt-3">
                  <button
                    type="button"
                    disabled={credentialLoading || !!accountAction}
                    onClick={handleUpdateCredentials}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#C68A4C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#A97138] disabled:opacity-50"
                  >
                    <KeyRound className="h-4 w-4" />保存账号与密码
                  </button>
                </div>
              </section>

              <section className={`rounded-xl border p-4 ${accountSection === 'membership' ? 'order-first ring-2 ring-[#C68A4C]/40' : ''} ${isEndfieldTheme ? 'border-stone-800 bg-[#17181c]' : 'border-[#E5DEC9] bg-white'}`}>
                <h3 className="font-bold mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-[#C68A4C]" />会员期限：续期或扣减</h3>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div><p className="text-xs text-slate-500">会员到期时间</p><p className="font-semibold mt-1">{displayExpireTime(managedUser.expire_time)}</p></div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${managedUser.is_banned ? 'bg-red-100 text-red-700' : managedUser.is_expired ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{managedUser.is_banned ? '已封禁' : managedUser.is_expired ? '会员已过期' : '账号可用'}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[1, 7, 30, 365].map(days => <button key={days} disabled={!!accountAction} onClick={() => handleMembershipChange(days)} className="px-3 py-2 rounded-lg text-xs border border-emerald-300 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors">续期 {days === 365 ? '1年' : `${days}天`}</button>)}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[1, 7, 30, 365].map(days => <button key={days} disabled={!!accountAction} onClick={() => handleMembershipChange(-days)} className="px-3 py-2 rounded-lg text-xs border border-amber-300 text-amber-700 hover:bg-amber-500 hover:text-white transition-colors">扣减 {days === 365 ? '1年' : `${days}天`}</button>)}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-200">
                    <input type="number" min="1" max="3650" value={membershipDays} onChange={event => setMembershipDays(event.target.value)} className="w-24 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm" aria-label="自定义续期天数" />
                    <button disabled={!!accountAction || Number(membershipDays) <= 0} onClick={() => handleMembershipChange(Number(membershipDays))} className="px-3 py-2 rounded-lg text-xs bg-[#C68A4C] text-white hover:bg-[#A97138] disabled:opacity-50">确认续期</button>
                    <button disabled={!!accountAction || Number(membershipDays) <= 0} onClick={() => handleMembershipChange(-Number(membershipDays))} className="px-3 py-2 rounded-lg text-xs border border-amber-500 text-amber-700 hover:bg-amber-500 hover:text-white disabled:opacity-50">确认扣减</button>
                </div>
              </section>

              <section className={`rounded-xl border p-4 ${accountSection === 'devices' ? 'order-first ring-2 ring-sky-400/40' : ''} ${isEndfieldTheme ? 'border-stone-800 bg-[#17181c]' : 'border-[#E5DEC9] bg-white'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3"><div className="flex items-center gap-2"><h3 className="font-bold flex items-center gap-2"><Monitor className="w-4 h-4 text-[#C68A4C]" />设备绑定</h3><AdminHelpButton onClick={() => setHelpTopic('devices')} label="查看设备绑定说明" /></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><button disabled={!!accountAction} onClick={handleResetBrowserDevices} className="flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs border border-sky-300 text-sky-700 hover:bg-sky-600 hover:text-white">{managedUser.device_binding_exempt ? '清空浏览器记录' : '清空浏览器设备'}</button><button disabled={!!accountAction} onClick={handleResetBinding} className="flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs border border-amber-400 text-amber-700 hover:bg-amber-500 hover:text-white">{managedUser.device_binding_exempt ? '清空全部设备记录' : '重新绑定全部设备'}</button></div></div>
                {managedUser.device_binding_exempt && <p className="mb-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs leading-relaxed text-purple-800">该账号是次级管理员：以下为最近登录设备记录，仅供主管理员查看；服务器仍允许跨设备登录，不会用这些设备码拦截。</p>}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 min-w-0"><div className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><Monitor className="w-3.5 h-3.5" />桌面 App</div><p className="mt-2 text-[11px] font-mono break-all text-slate-500">{managedUser.bound_machine_id || (managedUser.device_binding_exempt ? '暂无桌面登录记录' : '等待首次登录绑定')}</p></div>
                  {browserSlotsFor(managedUser).map((code, index) => <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3 min-w-0"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><Globe className="w-3.5 h-3.5" />浏览器设备 {index + 1}</div>{code && <button type="button" disabled={!!accountAction} onClick={() => handleUnbindBrowserSlot((index + 1) as 1 | 2 | 3)} className="shrink-0 rounded border border-red-200 px-2 py-1 text-[10px] text-red-600 hover:bg-red-50">{managedUser.device_binding_exempt ? '清除' : '解绑'}</button>}</div><p className="mt-2 text-[11px] font-mono break-all text-slate-500">{code || (managedUser.device_binding_exempt ? '暂无浏览器登录记录' : '等待首次浏览器登录绑定')}</p></div>)}
                </div>
              </section>

              <section className={`rounded-xl border p-4 ${accountSection === 'security' ? 'order-first ring-2 ring-red-400/40' : ''} ${isEndfieldTheme ? 'border-red-950 bg-red-950/15' : 'border-red-200 bg-red-50/60'}`}>
                <h3 className="font-bold text-red-700 mb-1">账号安全操作</h3>
                <p className="text-xs text-red-600/80 mb-3">封禁和重绑会立即撤销当前登录；删除账号会原子清除其全部教务数据，无法撤销。</p>
                <div className="flex flex-wrap gap-2">
                  <button disabled={!!accountAction} onClick={handleBanUser} className={`px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2 border ${managedUser.is_banned ? 'border-emerald-500 text-emerald-700 hover:bg-emerald-600 hover:text-white' : 'border-red-400 text-red-700 hover:bg-red-600 hover:text-white'}`}><Ban className="w-4 h-4" />{managedUser.is_banned ? '解除封禁' : '封禁账号'}</button>
                  <button disabled={!!accountAction} onClick={handleDeleteUser} className="px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2 bg-red-600 text-white hover:bg-red-700 ml-auto"><Trash2 className="w-4 h-4" />永久删除账号及数据</button>
                </div>
              </section>

              {accountAction && <div className="text-center text-sm text-slate-500"><RefreshCw className="w-4 h-4 inline animate-spin mr-2" />正在处理账号操作，请勿关闭窗口…</div>}
            </div>
          </div>
        </div>
      )}
      {helpTopic && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setHelpTopic(null); }}>
          <section role="dialog" aria-modal="true" aria-label={ADMIN_HELP_CONTENT[helpTopic].title} className={`relative w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${isEndfieldTheme ? 'border-[#FF6A00]/35 bg-[#111215] text-stone-200' : 'border-[#E5DEC9] bg-white text-slate-700'}`}>
            <button type="button" onClick={() => setHelpTopic(null)} aria-label={`关闭${ADMIN_HELP_CONTENT[helpTopic].title}`} className="absolute right-3 top-3 rounded-full border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            <h2 className={`pr-10 text-base font-bold ${isEndfieldTheme ? 'font-mono text-[#FF6A00]' : 'font-serif text-slate-800'}`}>{ADMIN_HELP_CONTENT[helpTopic].title}</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed">
              {ADMIN_HELP_CONTENT[helpTopic].items.map(item => <li key={item}>• {item}</li>)}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
