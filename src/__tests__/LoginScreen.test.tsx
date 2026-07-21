import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginScreen from '../components/LoginScreen';
import * as cloudSync from '../lib/cloudSync';

vi.mock('../lib/cloudSync', () => ({
  login: vi.fn(),
  register: vi.fn(),
  getServerUrl: vi.fn(() => 'http://preview.test'),
  setServerUrl: vi.fn(),
}));

describe('LoginScreen browser credential memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    delete (window as any).electronAPI;
    vi.mocked(cloudSync.login).mockResolvedValue({
      username: 'mobile-admin', token: 'token', machineId: 'mobile-id',
      expireTime: '2027-01-01T00:00:00', role: 'admin',
    });
  });

  it('restores an account and password saved by this browser origin', async () => {
    localStorage.setItem('edu_browser_saved_creds', JSON.stringify({ username: 'mobile-admin', password: 'saved-password' }));
    render(<LoginScreen onLoginSuccess={vi.fn()} />);

    expect(await screen.findByPlaceholderText('请输入账号')).toHaveValue('mobile-admin');
    expect(screen.getByPlaceholderText('请输入密码')).toHaveValue('saved-password');
    expect(screen.getByRole('checkbox', { name: '记住账号密码' })).toBeChecked();
  });

  it('stores credentials only after a successful login when selected', async () => {
    render(<LoginScreen onLoginSuccess={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('请输入账号'), { target: { value: 'mobile-admin' } });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), { target: { value: 'mobile-password' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '记住账号密码' }));
    const submit = screen.getAllByRole('button', { name: '登 录' }).find(button => button.getAttribute('type') === 'submit');
    expect(submit).toBeDefined();
    fireEvent.click(submit!);

    await waitFor(() => expect(cloudSync.login).toHaveBeenCalledWith('mobile-admin', 'mobile-password'));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('edu_browser_saved_creds') || '{}')).toEqual({
      username: 'mobile-admin', password: 'mobile-password',
    }));
  });

  it('uses the matching vector control to show and hide the password', () => {
    render(<LoginScreen onLoginSuccess={vi.fn()} />);
    const passwordInput = screen.getByPlaceholderText('请输入密码');

    expect(passwordInput).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: '显示密码' }));
    expect(passwordInput).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: '隐藏密码' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(document.body).not.toHaveTextContent('🙈');
    expect(document.body).not.toHaveTextContent('👁');
  });

  it('allows touch scrolling and exposes real font-size choices in advanced settings', () => {
    const onFontScaleChange = vi.fn();
    const { container } = render(<LoginScreen onLoginSuccess={vi.fn()} fontScaleMode="auto" onFontScaleChange={onFontScaleChange} />);

    const scrollRoot = container.querySelector('.login-screen-scroll') as HTMLElement;
    expect(scrollRoot).toBeTruthy();
    expect(scrollRoot.style.overflowY).toBe('auto');
    expect(scrollRoot.style.touchAction).toBe('pan-y pinch-zoom');

    fireEvent.click(screen.getByRole('button', { name: /高级设置/ }));
    fireEvent.click(screen.getByRole('button', { name: '大' }));
    expect(onFontScaleChange).toHaveBeenCalledWith('large');
  });

  it('requires a teacher/planner choice and submits the selected registration identity', async () => {
    vi.mocked(cloudSync.register).mockResolvedValue({ message: 'ok', expire_time: '2099' });
    render(<LoginScreen onLoginSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '注 册' }));
    expect(screen.getByRole('radio', { name: '教务老师' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: '规划老师' }));
    fireEvent.change(screen.getByPlaceholderText('请输入账号'), { target: { value: 'planner-new' } });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), { target: { value: 'secret12' } });
    fireEvent.change(screen.getByPlaceholderText('再次输入密码'), { target: { value: 'secret12' } });
    const submit = screen.getAllByRole('button', { name: '注 册' }).find(button => button.getAttribute('type') === 'submit');
    fireEvent.click(submit!);
    await waitFor(() => expect(cloudSync.register).toHaveBeenCalledWith('planner-new', 'secret12', 'planner'));
  });
});
