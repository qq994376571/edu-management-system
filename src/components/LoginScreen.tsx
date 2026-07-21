import React, { useState, useCallback, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { login, register, getServerUrl, setServerUrl } from '../lib/cloudSync';
import type { CloudSession } from '../lib/cloudSync';
import type { FontScaleMode } from '../lib/fontScale';

const DESKTOP_CREDENTIALS_KEY = 'app_saved_creds';
const BROWSER_CREDENTIALS_KEY = 'edu_browser_saved_creds';
const LEGACY_BROWSER_ACCOUNT_KEY = 'edu_browser_saved_account';

interface LoginScreenProps {
  onLoginSuccess: (session: CloudSession) => void;
  isKickedOut?: boolean;
  isLockedByAdmin?: boolean;
  fontScaleMode?: FontScaleMode;
  onFontScaleChange?: (value: FontScaleMode) => void;
}

export default function LoginScreen({ onLoginSuccess, isKickedOut = false, isLockedByAdmin = false, fontScaleMode = 'auto', onFontScaleChange = () => {} }: LoginScreenProps) {
  const isDesktopApp = !!(window as any).electronAPI;
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(getServerUrl());
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [registrationIdentity, setRegistrationIdentity] = useState<'teacher' | 'planner'>('teacher');


  useEffect(() => {
    try {
      if (isDesktopApp) {
        const saved = localStorage.getItem(DESKTOP_CREDENTIALS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.username && parsed.password) {
            setUsername(parsed.username);
            setPassword(parsed.password);
            setRememberMe(true);
          }
        }
      } else {
        const saved = localStorage.getItem(BROWSER_CREDENTIALS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.username && parsed.password) {
            setUsername(parsed.username);
            setPassword(parsed.password);
            setRememberMe(true);
          }
        } else {
          const legacyAccount = localStorage.getItem(LEGACY_BROWSER_ACCOUNT_KEY);
          if (legacyAccount) {
            setUsername(legacyAccount);
            setRememberMe(true);
          }
        }
      }
    } catch {}
  }, [isDesktopApp]);

  useEffect(() => {
    setError('');
    setSuccess('');
  }, [tab]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError('请填写账号和密码'); return; }
    setLoading(true); setError('');
    try {
      const session = await login(username.trim(), password);
      if (isDesktopApp) {
        if (rememberMe) {
          localStorage.setItem(DESKTOP_CREDENTIALS_KEY, JSON.stringify({ username: username.trim(), password }));
        } else {
          localStorage.removeItem(DESKTOP_CREDENTIALS_KEY);
        }
      } else if (rememberMe) {
        // Keep browser credentials origin-scoped instead of placing them in a
        // cookie that would be transmitted with every request.
        localStorage.setItem(BROWSER_CREDENTIALS_KEY, JSON.stringify({ username: username.trim(), password }));
        localStorage.removeItem(LEGACY_BROWSER_ACCOUNT_KEY);
      } else {
        localStorage.removeItem(BROWSER_CREDENTIALS_KEY);
        localStorage.removeItem(LEGACY_BROWSER_ACCOUNT_KEY);
      }
      setSuccess('登录成功！正在加载数据...');
      setTimeout(() => onLoginSuccess(session), 600);
    } catch (err: unknown) {
      setError((err as Error).message || '登录失败，请检查账号密码');
    } finally { setLoading(false); }
  // Keep the checkbox value in the closure.  Without this dependency, the
  // first click on "remember me" can still submit the previous false value.
  }, [username, password, rememberMe, onLoginSuccess, isDesktopApp]);

  const handleRegister = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError('请填写账号和密码'); return; }
    if (password !== confirmPassword) { setError('两次输入的密码不一致'); return; }
    if (password.length < 6) { setError('密码至少需要6位'); return; }
    setLoading(true); setError('');
    try {
      const result = await register(username.trim(), password, registrationIdentity);
      setSuccess(`注册成功！${result.message || ''} 请登录。`);
      setTab('login');
      setPassword(''); setConfirmPassword('');
    } catch (err: unknown) {
      setError((err as Error).message || '注册失败，请稍后重试');
    } finally { setLoading(false); }
  }, [username, password, confirmPassword, registrationIdentity]);

  const handleSaveServerUrl = useCallback(() => {
    if (serverUrlInput.trim()) {
      setServerUrl(serverUrlInput.trim());
      setServerUrlInput(getServerUrl());
      setShowAdvanced(false);
      setSuccess('服务器地址已更新为安全连接');
    }
  }, [serverUrlInput]);

  return (
    <div className="login-screen-scroll" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y pinch-zoom', background: 'linear-gradient(135deg, #0d0d1a 0%, #0a0f1e 40%, #111827 100%)', zIndex: 9999, fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {/* Background subtle pattern */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(198,138,76,0.06) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(99,102,241,0.06) 0%, transparent 50%)', pointerEvents: 'none' }} />

      {/* Login Card */}
      <div className="login-screen-card" style={{ position: 'relative', width: '100%', maxWidth: 420, margin: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(198,138,76,0.25)', borderRadius: 20, padding: '40px 36px 32px', backdropFilter: 'blur(20px)', boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(198,138,76,0.1) inset' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 13, letterSpacing: '0.25em', color: 'rgba(198,138,76,0.7)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>教务进度中心</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f5f0e8', margin: '0 0 6px', letterSpacing: '-0.5px' }}>云端管理系统</h1>
          <p style={{ fontSize: 13, color: 'rgba(200,203,208,0.55)', margin: 0 }}>Educational Progress Management</p>
        </div>

        {/* Admin lock warning */}
        {isLockedByAdmin && (
          <div style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fde047' }}>账号暂时不可用</div>
              <div style={{ fontSize: 12, color: 'rgba(253,224,71,0.7)', marginTop: 2 }}>该账号正在被管理员查看，暂时无法登录，请稍后再试</div>
            </div>
          </div>
        )}

        {/* Kicked out warning */}
        {isKickedOut && !isLockedByAdmin && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fca5a5' }}>您已被踢下线</div>
              <div style={{ fontSize: 12, color: 'rgba(252,165,165,0.7)', marginTop: 2 }}>该账号已在其他设备登录，请重新登录</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 4, marginBottom: 28 }}>
          {(['login', 'register'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', background: tab === t ? 'rgba(198,138,76,0.9)' : 'transparent', color: tab === t ? '#fff' : 'rgba(200,203,208,0.6)' }}>
              {t === 'login' ? '登 录' : '注 册'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={tab === 'login' ? handleLogin : handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'rgba(200,203,208,0.6)', marginBottom: 6, letterSpacing: '0.05em' }}>账号</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="请输入账号"
              autoComplete="username"
              disabled={loading}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(198,138,76,0.25)', borderRadius: 10, fontSize: 14, color: '#f5f0e8', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
              onFocus={e => e.target.style.borderColor = 'rgba(198,138,76,0.7)'}
              onBlur={e => e.target.style.borderColor = 'rgba(198,138,76,0.25)'}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'rgba(200,203,208,0.6)', marginBottom: 6, letterSpacing: '0.05em' }}>密码</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                disabled={loading}
                style={{ width: '100%', padding: '10px 40px 10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(198,138,76,0.25)', borderRadius: 10, fontSize: 14, color: '#f5f0e8', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                onFocus={e => e.target.style.borderColor = 'rgba(198,138,76,0.7)'}
                onBlur={e => e.target.style.borderColor = 'rgba(198,138,76,0.25)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                title={showPassword ? '隐藏密码' : '显示密码'}
                style={{
                  position: 'absolute',
                  right: 7,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 32,
                  height: 32,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: showPassword ? '#c68a4c' : 'rgba(200,203,208,0.55)',
                  padding: 0,
                }}
              >
                {showPassword
                  ? <EyeOff size={18} strokeWidth={1.8} aria-hidden="true" />
                  : <Eye size={18} strokeWidth={1.8} aria-hidden="true" />}
              </button>
            </div>
          </div>

          {tab === 'register' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'rgba(200,203,208,0.6)', marginBottom: 6, letterSpacing: '0.05em' }}>确认密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                  disabled={loading}
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(198,138,76,0.25)', borderRadius: 10, fontSize: 14, color: '#f5f0e8', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                  onFocus={e => e.target.style.borderColor = 'rgba(198,138,76,0.7)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(198,138,76,0.25)'}
                />
              </div>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ display: 'block', fontSize: 12, color: 'rgba(200,203,208,0.6)', marginBottom: 7, letterSpacing: '0.05em' }}>账号身份（注册后由主管理员调整）</legend>
                <div role="radiogroup" aria-label="账号身份" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {([['teacher', '教务老师'], ['planner', '规划老师']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={registrationIdentity === value}
                      disabled={loading}
                      onClick={() => setRegistrationIdentity(value)}
                      style={{
                        padding: '10px 8px', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer',
                        border: registrationIdentity === value ? '1px solid rgba(198,138,76,0.95)' : '1px solid rgba(255,255,255,0.12)',
                        background: registrationIdentity === value ? 'rgba(198,138,76,0.18)' : 'rgba(255,255,255,0.04)',
                        color: registrationIdentity === value ? '#f6c68d' : 'rgba(200,203,208,0.68)',
                        fontSize: 13, fontWeight: 700,
                      }}
                    >{label}</button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚠</span> {error}
            </div>
          )}

          {success && (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#86efac', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>✓</span> {success}
            </div>
          )}

          {tab === 'login' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input 
                  type="checkbox" 
                  id="rememberMe" 
                  checked={rememberMe} 
                  onChange={e => setRememberMe(e.target.checked)} 
                  style={{ cursor: 'pointer', width: 14, height: 14 }}
                />
                <label htmlFor="rememberMe" style={{ fontSize: 12, color: 'rgba(200,203,208,0.7)', cursor: 'pointer', userSelect: 'none' }}>
                  记住账号密码
                </label>
              </div>
            )}
            <button
            type="submit"
            disabled={loading}
            style={{ marginTop: 6, padding: '12px 0', background: loading ? 'rgba(198,138,76,0.4)' : 'rgba(198,138,76,1)', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, color: loading ? 'rgba(255,255,255,0.6)' : '#fff', cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.05em', transition: 'all 0.2s', boxShadow: loading ? 'none' : '0 4px 24px rgba(198,138,76,0.35)' }}
          >
            {loading ? '请稍候...' : (tab === 'login' ? '登 录' : '注 册')}
          </button>
        </form>

        {/* Advanced Settings */}
        <div style={{ marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
          <button onClick={() => setShowAdvanced(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(200,203,208,0.4)', fontSize: 12, padding: 0, width: '100%', justifyContent: 'center' }}>
            <span style={{ fontSize: 10 }}>⚙</span> 高级设置
            <span style={{ fontSize: 10 }}>{showAdvanced ? '▲' : '▼'}</span>
          </button>

          {showAdvanced && (
            <div style={{ marginTop: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '14px 14px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'rgba(200,203,208,0.5)', marginBottom: 6 }}>显示字体（点击选择）</label>
                <div role="group" aria-label="显示字体大小" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                  {([['auto', '自动'], ['small', '小'], ['standard', '标准'], ['large', '大']] as Array<[FontScaleMode, string]>).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={fontScaleMode === mode}
                      onClick={() => onFontScaleChange(mode)}
                      style={{
                        minWidth: 0,
                        padding: '9px 2px',
                        borderRadius: 8,
                        border: fontScaleMode === mode ? '1px solid #ff6a00' : '1px solid rgba(255,255,255,0.12)',
                        background: fontScaleMode === mode ? 'rgba(255,106,0,0.13)' : 'rgba(255,255,255,0.04)',
                        color: fontScaleMode === mode ? '#ff8a3d' : 'rgba(200,203,208,0.72)',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label style={{ display: 'block', fontSize: 11, color: 'rgba(200,203,208,0.5)', marginBottom: 6 }}>服务器地址</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={serverUrlInput}
                  onChange={e => setServerUrlInput(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: '#c8cbd0', outline: 'none', fontFamily: 'monospace' }}
                />
                <button onClick={handleSaveServerUrl} style={{ padding: '8px 14px', background: 'rgba(99,102,241,0.6)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8, fontSize: 12, color: '#fff', cursor: 'pointer' }}>确认</button>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(200,203,208,0.3)', marginTop: 6 }}>当前: {getServerUrl()}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
