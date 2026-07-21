import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import React from 'react';
import App, { DEMO_STUDENTS, INITIAL_SEASONS } from '../App';

const openSeededStudentList = async () => {
  fireEvent.click(screen.getByText('学生档案和资料'));
  await screen.findByText('张伟（测试）');
};

describe('Tier 1: Feature Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).mockElectronState.reset();
    const path = 'C:\\mock-storage';
    (globalThis as any).mockElectronState.setStoredPath(path);
    (globalThis as any).mockElectronState.getFiles()[path] = {
      students: JSON.parse(JSON.stringify(DEMO_STUDENTS)),
      seasons: JSON.parse(JSON.stringify(INITIAL_SEASONS)),
      activeSeasonId: INITIAL_SEASONS[0].id,
    };
  });

  it.skip('TC-1.1: Demo Mode Initialization', async () => {
    const originalElectronAPI = (window as any).electronAPI;
    delete (window as any).electronAPI;

    render(<App />);

    // Should show demo mode warning
    expect(screen.getByText(/演示模式：数据未持久化/)).toBeInTheDocument();
    
    // Switch to Students tab to check demo students are loaded
    fireEvent.click(screen.getByText('学生档案和资料'));
    expect(screen.getByText('张伟（测试）')).toBeInTheDocument();
    expect(screen.getByText('李娜（测试）')).toBeInTheDocument();

    (window as any).electronAPI = originalElectronAPI;
  });

  it('TC-1.2: Sidebar Tab Switching', async () => {
    render(<App />);
    
    // Switch to Students tab
    fireEvent.click(screen.getByText('学生档案和资料'));
    expect(screen.getByText('活跃学生档案 (2025-2026 申请季)')).toBeInTheDocument();

    // Switch to Gantt tab
    fireEvent.click(screen.getByText('时间轴排期总览'));
    expect(screen.getByText('备注截止日（圆=待处理）')).toBeInTheDocument();

    // Switch back to Dashboard
    fireEvent.click(screen.getByText('智能预警仪表盘'));
    expect(screen.getByText('工作台概览')).toBeInTheDocument();
  });

  it('TC-1.3: Active Season Selection', async () => {
    render(<App />);
    await openSeededStudentList();
    const select = screen.getAllByRole('combobox')[0];
    fireEvent.change(select, { target: { value: 'season_26_27' } });
    
    expect(select).toHaveValue('season_26_27');
    
    fireEvent.click(screen.getByText('学生档案和资料'));
    expect(screen.getByText('暂无学生档案，点击右上角录入')).toBeInTheDocument();
  });

  it('TC-1.4: Add a New Season', async () => {
    const { container } = render(<App />);
    
    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('申请季配置'));
    fireEvent.click(screen.getByText('新增申请季'));
    
    const textInputs = container.querySelectorAll('input[type="text"]');
    const newSeasonInput = textInputs[textInputs.length - 1];
    fireEvent.change(newSeasonInput, { target: { value: '2027-2028 申请季' } });

    fireEvent.click(screen.getByText('完成'));

    const select = screen.getAllByRole('combobox')[0];
    expect(select).toHaveTextContent('2027-2028 申请季');
  });

  it('TC-1.5: Edit Season Details', async () => {
    const { container } = render(<App />);
    
    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('申请季配置'));
    
    const nameInputs = container.querySelectorAll('input[type="text"]');
    fireEvent.change(nameInputs[0], { target: { value: '2025-2026 Modified' } });
    
    fireEvent.click(screen.getByText('完成'));
    
    const select = screen.getAllByRole('combobox')[0];
    expect(select).toHaveTextContent('2025-2026 Modified');
  });

  it.skip('TC-1.6: Delete a Season', async () => {
    render(<App />);
    
    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('申请季配置'));
    
    // In active mode, archive the second season (2026-2027 申请季)
    const archiveButtons = screen.getAllByTitle('归档申请季');
    fireEvent.click(archiveButtons[1]);
    
    // Switch to Recycle Bin mode inside the modal
    fireEvent.click(screen.getByText('进入已归档申请季 (回收站)'));
    
    // Permanently delete the archived season
    const deleteButtons = screen.getAllByTitle('永久删除');
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('确认删除');
    fireEvent.click(deleteButtons[0]);
    
    expect(promptSpy).toHaveBeenCalled();
    
    fireEvent.click(screen.getByText('完成'));

    const select = screen.getAllByRole('combobox')[0];
    expect(select).not.toHaveTextContent('2026-2027 申请季');
  });

  it.skip('TC-1.7: Choose Data Folder', async () => {
    render(<App />);
    
    fireEvent.click(screen.getByText('数据管理'));
    fireEvent.click(screen.getByText('选择存储文件夹'));
    
    expect(window.electronAPI.chooseFolder).toHaveBeenCalled();
  });

  it.skip('TC-1.8: Save Data Manually', async () => {
    // Configure folder path first
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-save');
    render(<App />);
    
    // Wait for async load to finish
    await screen.findByText('● 已配置');
    
    fireEvent.click(screen.getByText('数据管理'));
    fireEvent.click(screen.getByText('立即手动保存'));
    
    expect(window.electronAPI.saveData).toHaveBeenCalled();
  });

  it.skip('TC-1.9: Backup Data', async () => {
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-save');
    render(<App />);
    
    await screen.findByText('● 已配置');
    
    fireEvent.click(screen.getByText('数据管理'));
    
    window.electronAPI.chooseFolder.mockResolvedValueOnce('D:\\backup-dest');
    fireEvent.click(screen.getByText('另存为备份...'));
    
    await waitFor(() => {
      expect(window.electronAPI.backupData).toHaveBeenCalled();
    });
  });

  it.skip('TC-1.10: Add Student Profile', async () => {
    const { container } = render(<App />);
    
    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('录入新档案'));
    
    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: '王小明' } });
    fireEvent.change(container.querySelector('input[name="region"]')!, { target: { value: '英国' } });
    fireEvent.change(container.querySelector('select[name="type"]')!, { target: { value: '本升硕' } });
    fireEvent.change(container.querySelector('select[name="status"]')!, { target: { value: '材料收集' } });
    
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());
  });

  it('TC-1.11: Edit Student Profile', async () => {
    const { container } = render(<App />);
    
    await openSeededStudentList();
    
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    const editBtn = within(row).getByTitle('编辑');
    fireEvent.click(editBtn);
    
    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: '张伟新' } });
    fireEvent.change(container.querySelector('select[name="status"]')!, { target: { value: '申请提交中' } });
    
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    
    await waitFor(() => expect(screen.getByText('张伟新')).toBeInTheDocument());
  });

  it('TC-1.12: Delete Student Profile', async () => {
    render(<App />);
    
    await openSeededStudentList();
    
    const row = screen.getByText('李娜（测试）').closest('tr')!;
    const deleteBtn = within(row).getByTitle('删除');
    
    fireEvent.click(deleteBtn);
    
    const confirmBtn = await waitFor(() => within(row).getByText('确认删除？'));
    fireEvent.click(confirmBtn);
    
    await waitFor(() => expect(screen.queryByText('李娜（测试）')).not.toBeInTheDocument());
  });

  it('TC-1.13: Archive Student Profile', async () => {
    render(<App />);
    
    await openSeededStudentList();
    
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    const archiveBtn = within(row).getByTitle('归档/恢复');
    
    fireEvent.click(archiveBtn);
    
    await waitFor(() => expect(screen.queryByText('张伟（测试）')).not.toBeInTheDocument());
    
    fireEvent.click(screen.getByText('查看归档/结案区'));
    expect(screen.getByText('张伟（测试）')).toBeInTheDocument();
  });

  it('TC-1.14: Toggle Generic Doc Checklist', async () => {
    render(<App />);
    await openSeededStudentList();
    
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));

    // InlineInput renders as a <span> inside a flex div with a checkbox div before it
    const labelSpan = screen.getByText('白底证件照 (45x55mm)');
    const itemDiv = labelSpan.closest('div.flex.items-center')!;
    const checkbox = itemDiv.querySelector('div[class*="rounded"][class*="border"]')!;
    
    fireEvent.click(checkbox);
    
    await waitFor(() => expect(labelSpan).toHaveClass('line-through'));
  });

  it('TC-1.15: Add Custom Generic Doc', async () => {
    render(<App />);
    await openSeededStudentList();
    
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    
    const blocks = screen.getAllByText('补充材料');
    fireEvent.click(blocks[0]);
    
    const input = within(document.getElementById('generic-docs-section')!).getByPlaceholderText('输入材料名称...');
    fireEvent.change(input, { target: { value: '出生证明公证' } });
    
    const checkBtn = input.closest('div')!.querySelector('.bg-green-500')!;
    fireEvent.click(checkBtn);
    
    await waitFor(() => expect(screen.getByText('出生证明公证')).toBeInTheDocument());
  });

  it('TC-1.16: Add Application to Student', async () => {
    const { container } = render(<App />);
    await openSeededStudentList();
    
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    
    fireEvent.click(screen.getByText('添加专业'));
    
    fireEvent.change(container.querySelector('input[name="school"]')!, { target: { value: '帝国理工' } });
    fireEvent.change(container.querySelector('input[name="program"]')!, { target: { value: 'Computing MSc' } });
    fireEvent.change(container.querySelector('select[name="tier"]')!, { target: { value: '冲刺档' } });
    fireEvent.change(container.querySelector('input[name="openDate"]')!, { target: { value: '2025-10-01T00:00' } });
    fireEvent.change(container.querySelector('input[name="deadline"]')!, { target: { value: '2026-03-01T00:00' } });
    
    fireEvent.click(screen.getByText('保存专业配置'));
    
    await waitFor(() => expect(screen.getAllByText('帝国理工')[0]).toBeInTheDocument());
  });

  it('TC-1.17: Edit Application Details', async () => {
    const { container } = render(<App />);
    await openSeededStudentList();
    
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    
    const card = document.getElementById('app-card-APP1')!;
    fireEvent.click(within(card).getByText('编辑项目'));
    
    fireEvent.change(container.querySelector('input[name="program"]')!, { target: { value: 'Advanced Computing MSc' } });
    fireEvent.change(container.querySelector('select[name="tier"]')!, { target: { value: '稳妥档' } });
    
    fireEvent.click(screen.getByText('保存专业配置'));
    
    await waitFor(() => expect(screen.getByText('- Advanced Computing MSc')).toBeInTheDocument());
  });

  it('TC-1.18: Delete Application', async () => {
    render(<App />);
    await openSeededStudentList();
    
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    
    const card = document.getElementById('app-card-APP2')!;
    const deleteAppBtn = within(card).getByTitle('删除');
    fireEvent.click(deleteAppBtn);
    const confirmBtn2 = await waitFor(() => within(card).getByText('确认删除？'));
    fireEvent.click(confirmBtn2);
    
    await waitFor(() => expect(screen.queryByText('香港中文大学')).not.toBeInTheDocument());
  });

  it('TC-1.19: Toggle Specific App Materials', async () => {
    render(<App />);
    await openSeededStudentList();
    
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    
    // InlineInput renders as <span> — find by text, then find checkbox in parent li
    const labelSpan = screen.getByText('Writing Sample (金融市场分析)');
    const li = labelSpan.closest('li')!;
    const checkbox = li.querySelector('div[class*="rounded"][class*="border"]')!;
    
    fireEvent.click(checkbox);
    
    await waitFor(() => expect(labelSpan).toHaveClass('line-through'));
  });

  it('TC-1.20: Add Custom Specific Material', async () => {
    render(<App />);
    await openSeededStudentList();
    
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    
    const card = document.getElementById('app-card-APP1')!;
    fireEvent.click(within(card).getByText('添加该专业专属材料'));
    
    const input = within(card).getByPlaceholderText('如: 作品集/Writing Sample...');
    fireEvent.change(input, { target: { value: 'GRE Score Report' } });
    
    const checkBtn = input.closest('div')!.querySelector('.bg-green-500')!;
    fireEvent.click(checkBtn);
    
    // After confirm, InlineInput renders as <span> with the text — check by text content
    await waitFor(() => expect(within(card).getByText('GRE Score Report')).toBeInTheDocument());
  });

  it('TC-1.21: Add Recommender', async () => {
    const { container } = render(<App />);
    await openSeededStudentList();
    
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    
    fireEvent.click(screen.getByText('添加推荐人'));
    
    fireEvent.change(container.querySelector('input[name="recName"]')!, { target: { value: '赵教授' } });
    fireEvent.change(container.querySelector('input[name="recEmail"]')!, { target: { value: 'zhao@edu.cn' } });
    fireEvent.change(container.querySelector('textarea[name="recNotes"]')!, { target: { value: '毕业设计导师' } });
    
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    
    await waitFor(() => expect(screen.getByText('赵教授')).toBeInTheDocument());
  });

  it('TC-1.22: Update Recommender Status', async () => {
    render(<App />);
    await openSeededStudentList();
    
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    
    const tr = screen.getByText('张教授').closest('tr')!;
    const select = within(tr).getAllByRole('combobox')[0];
    
    fireEvent.change(select, { target: { value: 'sent' } });
    
    await waitFor(() => expect(select).toHaveValue('sent'));
  });

  it.skip('TC-1.23: Add Application-specific To-Do', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('学生档案和资料'));
    
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    
    const card = document.getElementById('app-card-APP1')!;
    fireEvent.click(within(card).getByText('新增备注'));
    
    // After clicking 新增备注, a new note is appended. Its InlineInput is a span initially.
    // Find any new InlineInput span with placeholder text, or click to activate the new one.
    // The new note text InlineInput will show placeholder '输入备注内容...' when empty in span mode.
    // Click it to enter edit mode, then type.
    const noteSpan = await waitFor(() => within(card).getByText('输入备注内容...'));
    fireEvent.click(noteSpan);
    const noteInput = await waitFor(() => within(card).getByDisplayValue(''));
    fireEvent.change(noteInput, { target: { value: '缴付留位押金' } });
    fireEvent.keyDown(noteInput, { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(within(card).getByText('缴付留位押金')).toBeInTheDocument());
  });

  it('TC-1.24: Expand Action Log Timeline', async () => {
    render(<App />);
    await openSeededStudentList();

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    
    const header = screen.getByText('全景操作日志与时间线');
    fireEvent.click(header);

    expect(screen.queryByText('事无巨细追踪该学生的每一项修改、状态变更、材料流转及预警历史')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看操作日志说明' }));
    expect(screen.getByRole('dialog', { name: '操作日志说明' })).toHaveTextContent('有效修改、状态变更、材料流转和已完成预警');
  });

  it.skip('TC-1.25: Alert Mark Completed / Ignore', async () => {
    render(<App />);
    
    const completeBtns = screen.getAllByRole('button', { name: /标记完成/ });
    const ignoreBtns = screen.getAllByRole('button', { name: /忽略/ });
    
    const initialAlertCount = completeBtns.length;
    
    fireEvent.click(completeBtns[0]);
    
    await waitFor(() => {
      const newCompleteBtns = screen.queryAllByRole('button', { name: /标记完成/ });
      expect(newCompleteBtns.length).toBe(initialAlertCount - 1);
    });
    
    const freshIgnoreBtns = screen.getAllByRole('button', { name: /忽略/ });
    fireEvent.click(freshIgnoreBtns[0]);
    
    await waitFor(() => {
      const finalCompleteBtns = screen.queryAllByRole('button', { name: /标记完成/ });
      expect(finalCompleteBtns.length).toBe(initialAlertCount - 2);
    });
  });

  it.skip('TC-1.26: Special Materials InlineInput keyboard actions and R2 Archive toggle reversibility', async () => {
    render(<App />);
    
    // Test R1: Special Materials InlineInput keyboard actions first (while season_25_26 is active)
    await openSeededStudentList();
    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    
    // InlineInput renders as a <span> initially — click it to enter edit mode
    const labelSpan = screen.getByText('Writing Sample (金融市场分析)');
    fireEvent.click(labelSpan);
    
    const labelInput = await waitFor(() => screen.getByDisplayValue('Writing Sample (金融市场分析)'));
    
    // Enter key action: save changes
    act(() => {
      fireEvent.change(labelInput, { target: { value: 'Writing Sample Modified' } });
    });
    fireEvent.keyDown(labelInput, { key: 'Enter', code: 'Enter' });
    
    // Verify it saved — span shows new value
    await waitFor(() => expect(screen.getByText('Writing Sample Modified')).toBeInTheDocument());
    
    // Escape key action: click to edit again, then press Escape to revert
    const modifiedSpan = screen.getByText('Writing Sample Modified');
    fireEvent.click(modifiedSpan);
    const modifiedInput = await waitFor(() => screen.getByDisplayValue('Writing Sample Modified'));
    act(() => {
      fireEvent.change(modifiedInput, { target: { value: 'Writing Sample Reverted' } });
    });
    fireEvent.keyDown(modifiedInput, { key: 'Escape', code: 'Escape' });
    
    // Verify it reverted — span still shows 'Writing Sample Modified'
    await waitFor(() => expect(screen.getByText('Writing Sample Modified')).toBeInTheDocument());

    // Test R2: Archive toggle reversibility
    await openSeededStudentList();
    fireEvent.click(screen.getByText('申请季配置'));
    
    const archiveBtns = screen.getAllByRole('button', { name: /归档申请季/ });
    expect(archiveBtns.length).toBeGreaterThan(0);
    
    // Click the first archive button (archives season_25_26)
    fireEvent.click(archiveBtns[0]);
    
    // Click '完成' to close modal
    fireEvent.click(screen.getByText('完成'));
    
    // Check that active season switches to season_26_27
    const select = screen.getAllByRole('combobox')[0];
    expect(select).toHaveValue('season_26_27');
  });
});
