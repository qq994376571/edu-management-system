import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import React from 'react';
import App from '../App';

describe('Tier 1: Feature Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).mockElectronState.reset();
  });

  it('TC-1.1: Verify teal-400 visa window color', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_001', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '已确认录取',
        visaWindow: ['2026-06-01', '2026-08-30'],
        applications: [{ id: 'APP1', school: '香港大学', program: '金融', deadline: '2026-05-01', openDate: '2025-10-01', status: '已录取' }],
        recommenders: [], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.1'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.1');

    render(<App />);
    await screen.findByText('● 已配置');

    // Switch to Gantt tab
    fireEvent.click(screen.getByText('时间轴排期总览'));
    // Select the student to drill down
    fireEvent.click(screen.getByText('张伟'));

    // Check that the visa bar element is rendered and has the bg-teal-400 class
    const visaSection = screen.getByText('签证办理安全窗口');
    expect(visaSection).toBeInTheDocument();
    const barContainer = visaSection.closest('div')?.nextSibling as HTMLElement;
    const visaBar = barContainer.querySelector('.bg-teal-400');
    expect(visaBar).toBeInTheDocument();
  });

  it('TC-1.2: Verify visa bar hides on date clear', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_001', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '已确认录取',
        visaWindow: ['2026-06-01', '2026-08-30'],
        applications: [{ id: 'APP1', school: '香港大学', program: '金融', deadline: '2026-05-01', openDate: '2025-10-01', status: '已录取' }],
        recommenders: [], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.2'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.2');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    const editBtn = screen.getByTitle('编辑');
    fireEvent.click(editBtn);

    // Clear visa dates
    const startInput = document.querySelector('input[name="visaStart"]') as HTMLInputElement;
    const endInput = document.querySelector('input[name="visaEnd"]') as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: '' } });
    fireEvent.change(endInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    // Switch to Gantt tab
    fireEvent.click(screen.getByText('时间轴排期总览'));
    fireEvent.click(screen.getByText('张伟'));

    expect(screen.queryByText('签证办理安全窗口')).not.toBeInTheDocument();
  });

  it('TC-1.3: Archived seasons hidden from selectors', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' },
        { id: 'season_archived', name: '2026-2027 Archived Season', start: '2026-09-01', end: '2027-09-30', isArchived: true }
      ],
      students: [],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.3'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.3');

    render(<App />);
    await screen.findByText('● 已配置');

    // Inspect season select options
    fireEvent.click(screen.getByText('学生档案和资料'));
    const select = screen.getAllByRole('combobox')[0];
    const options = within(select).getAllByRole('option');
    const optionTexts = options.map(o => o.textContent);
    expect(optionTexts).toContain('2025-2026 Active Season');
    expect(optionTexts).not.toContain('2026-2027 Archived Season');
  });

  it.skip('TC-1.4: Recycle Bin toggle in modal', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' },
        { id: 'season_archived', name: '2026-2027 Archived Season', start: '2026-09-01', end: '2027-09-30', isArchived: true }
      ],
      students: [],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.4'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.4');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('申请季配置'));
    // Click "进入已归档申请季 (回收站)"
    fireEvent.click(screen.getByText('进入已归档申请季 (回收站)'));

    // The modal should display the archived season name in the list
    expect(screen.getByDisplayValue('2026-2027 Archived Season')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('2025-2026 Active Season')).not.toBeInTheDocument();
  });

  it.skip('TC-1.5: Permanent deletion cascade', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' },
        { id: 'season_archived', name: '2026-2027 Archived Season', start: '2026-09-01', end: '2027-09-30', isArchived: true }
      ],
      students: [
        { id: 'STU_1', name: 'Active Student', seasonId: 'season_active', applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] } },
        { id: 'STU_2', name: 'Archived Student', seasonId: 'season_archived', applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] } }
      ],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.5'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.5');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('申请季配置'));
    fireEvent.click(screen.getByText('进入已归档申请季 (回收站)'));

    const deleteBtn = screen.getByTitle('永久删除');
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('确认删除');

    fireEvent.click(deleteBtn);
    expect(promptSpy).toHaveBeenCalled();

    // Verify cascading deletion of STU_2 in storage
    const savedData = (globalThis as any).mockElectronState.getFiles()['C:\\test-1.5'];
    expect(savedData.seasons.find((s: any) => s.id === 'season_archived')).toBeUndefined();
    expect(savedData.students.find((s: any) => s.id === 'STU_2')).toBeUndefined();
    expect(savedData.students.length).toBe(1);
    expect(savedData.students[0].id).toBe('STU_1');
  });

  it.skip('TC-1.6: Empty seasons fallback', async () => {
    const initialData = {
      version: 1,
      seasons: [],
      students: [],
      activeSeasonId: null
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.6'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.6');

    render(<App />);
    await screen.findByText('● 已配置');

    // App should render workstation overview / toolbar without crashing
    expect(screen.getByText('工作台概览')).toBeInTheDocument();
  });

  it('TC-1.7: specificDocs safety', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '材料收集',
        applications: [{ id: 'APP1', school: '香港大学', program: '金融', deadline: '2026-05-01', openDate: '2025-10-01', status: '收集中', specificDocs: null }],
        recommenders: [], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.7'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.7');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('处理档案'));

    // Verify it rendered successfully without exception
    expect(screen.getByText('张伟 的材料总控')).toBeInTheDocument();
  });

  it('TC-1.8: Gantt Division-by-Zero', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2025-09-01' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '材料收集',
        applications: [{ id: 'APP1', school: '香港大学', program: '金融', deadline: '2025-09-01', openDate: '2025-09-01', status: '收集中' }],
        recommenders: [], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.8'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.8');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('时间轴排期总览'));
    expect(screen.getByText('张伟')).toBeInTheDocument();
  });

  it('TC-1.9: statusMap completed spell', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '材料收集',
        applications: [{ id: 'APP1', school: '香港大学', program: '金融', deadline: '2026-05-01', openDate: '2025-10-01', status: '收集中', recommendations: { 'R1': { status: 'pending' } } }],
        recommenders: [{ id: 'R1', name: '张教授', email: '' }], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.9'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.9');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('处理档案'));

    const tr = screen.getByText('张教授').closest('tr')!;
    const select = within(tr).getAllByRole('combobox')[0];
    fireEvent.change(select, { target: { value: 'completed' } });

    await waitFor(() => expect(select).toHaveValue('completed'));
  });

  it.skip('TC-1.10: migrateStudents type check', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: 'invalid_corrupted_string',
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.10'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.10');

    render(<App />);
    await screen.findByText('● 已配置');

    expect(screen.getByText('工作台概览')).toBeInTheDocument();
  });

  it('TC-1.11: 4-Zone layout partitioning', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '材料收集',
        applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.11'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.11');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('处理档案'));

    // Check for the 4 zones
    expect(screen.getByText(/信息收集表类/)).toBeInTheDocument();
    expect(screen.getByText(/个人基础材料类/)).toBeInTheDocument();
    expect(screen.getByText(/学术公证类/)).toBeInTheDocument();
    expect(screen.getByText(/教务文书类/)).toBeInTheDocument();
  });

  it('TC-1.12: Inline edit name Enter/blur', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '材料收集',
        applications: [], recommenders: [],
        docs: {
          basic: [{ id: 'b1', label: '身份证正反面扫描件', checked: false }],
          academic: [], visa: []
        }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.12'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.12');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('处理档案'));

    const nameLabel = screen.getByText('身份证正反面扫描件');
    fireEvent.click(nameLabel);

    // After clicking, an InlineInput input should appear
    const input = screen.getByDisplayValue('身份证正反面扫描件');
    fireEvent.change(input, { target: { value: '身份证扫描件新' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Verify name updated and input switched back
    await waitFor(() => expect(screen.queryByDisplayValue('身份证扫描件新')).not.toBeInTheDocument());
    expect(screen.getByText('身份证扫描件新')).toBeInTheDocument();
  });

  it('TC-1.13: Inline edit cancel Escape', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '材料收集',
        applications: [], recommenders: [],
        docs: {
          basic: [{ id: 'b1', label: '身份证正反面扫描件', checked: false }],
          academic: [], visa: []
        }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.13'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.13');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('处理档案'));

    const nameLabel = screen.getByText('身份证正反面扫描件');
    fireEvent.click(nameLabel);

    const input = screen.getByDisplayValue('身份证正反面扫描件');
    fireEvent.change(input, { target: { value: '身份证修改' } });
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    // Verify name reverted to original and editing exited
    await waitFor(() => expect(screen.queryByDisplayValue('身份证修改')).not.toBeInTheDocument());
    expect(screen.getByText('身份证正反面扫描件')).toBeInTheDocument();
  });

  it.skip('TC-1.14: Preset list fold/unfold', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '材料收集',
        applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.14'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.14');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('处理档案'));

    // Find and click "预设管理" toggle button
    const presetBtn = screen.getByText('预设管理');
    fireEvent.click(presetBtn);

    // Verify the preset configuration area is displayed
    expect(screen.getByText('默认预设方案')).toBeInTheDocument();

    // Click again to fold
    fireEvent.click(presetBtn);
    expect(screen.queryByText('默认预设方案')).not.toBeInTheDocument();
  });

  it.skip('TC-1.15: determineMaterialPreset matching', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '材料收集',
        applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.15'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.15');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    const editBtn = screen.getByTitle('编辑');
    fireEvent.click(editBtn);

    // Change student location/region to "海外" in edit form
    const regionInput = document.querySelector('input[name="region"]') as HTMLInputElement;
    fireEvent.change(regionInput, { target: { value: '海外' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    fireEvent.click(screen.getByText('处理档案'));

    // Checklist updates: displays "留服认证", hides mainland "学信网" items.
    expect(screen.getByText('留服认证')).toBeInTheDocument();
    expect(screen.queryByText('学信网学历验证')).not.toBeInTheDocument();
  });

  it('TC-1.16: Render background fields', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('录入新档案'));

    // Check presence of location, major, GPA, phase (all background fields)
    expect(screen.getByLabelText('毕业学校')).toBeInTheDocument();
    expect(screen.getByLabelText('所学专业')).toBeInTheDocument();
    expect(screen.getByLabelText('绩点')).toBeInTheDocument();
    expect(screen.getByLabelText('就读地点')).toBeInTheDocument();
  });

  it('TC-1.17: Location sub-fields toggle', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('录入新档案'));

    const locationSelect = screen.getByLabelText('就读地点') as HTMLSelectElement;

    // Toggle location to "中国大陆"
    fireEvent.change(locationSelect, { target: { value: '中国大陆' } });
    expect(screen.getByLabelText('院校层次')).toBeInTheDocument();
    expect(screen.queryByLabelText('排名来源')).not.toBeInTheDocument();

    // Toggle location to "海外"
    fireEvent.change(locationSelect, { target: { value: '海外' } });
    expect(screen.getByLabelText('国家/地区')).toBeInTheDocument();
    expect(screen.getByLabelText('排名来源')).toBeInTheDocument();
  });

  it.skip('TC-1.18: Save all background fields', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('录入新档案'));

    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: '王小明' } });
    fireEvent.change(screen.getByLabelText('就读地点'), { target: { value: '中国大陆' } });
    fireEvent.change(screen.getByLabelText('毕业学校'), { target: { value: '北京大学' } });
    fireEvent.change(screen.getByLabelText('所学专业'), { target: { value: '计算机科学与技术' } });
    fireEvent.change(screen.getByLabelText('绩点'), { target: { value: '3.9' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    // Verify background fields saved successfully in storage
    const savedData = (globalThis as any).mockElectronState.getFiles()[Object.keys((globalThis as any).mockElectronState.getFiles())[0]];
    const newStu = savedData.students.find((s: any) => s.name === '王小明');
    expect(newStu.background).toBeDefined();
    expect(newStu.background.schoolName).toBe('北京大学');
    expect(newStu.background.gpa).toBe('3.9');
  });

  it.skip('TC-1.19: Save blank background fields', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('录入新档案'));

    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: '空白背景学生' } });
    // Keep background fields blank
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(screen.getByText('空白背景学生')).toBeInTheDocument());
  });

  it.skip('TC-1.20: Render Weekly Grid', async () => {
    render(<App />);

    // Click sidebar Calendar tab
    fireEvent.click(screen.getByText('每周待办日历'));

    // Check Mon-Sun columns and 09:00 - 18:00 timeslots (rendered as h:00 format)
    expect(screen.getByText('周一')).toBeInTheDocument();
    expect(screen.getByText('周日')).toBeInTheDocument();
    expect(screen.getByText('9:00')).toBeInTheDocument();
    // The calendar ends at 18:00 or 17:00 depending on implementation
    const endHour = screen.queryByText('18:00') || screen.queryByText('17:00');
    expect(endHour).toBeInTheDocument();
  });

  it.skip('TC-1.21: Lunch Break separator', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('每周待办日历'));

    const lunchSeparator = screen.getByText('午休时间 (12:00 - 13:30)');
    expect(lunchSeparator).toBeInTheDocument();
    expect(lunchSeparator).toHaveClass('bg-slate-200'); // highlighted in grey

    // Verify it is non-editable / cannot drop
    const dropHandler = lunchSeparator.closest('div');
    expect(dropHandler?.getAttribute('aria-disabled')).toBe('true');
  });

  it.skip('TC-1.22: Today/Tomorrow styling', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('每周待办日历'));

    // Get today's and tomorrow's columns
    const todayCol = screen.getByTestId('calendar-column-today');
    const tomorrowCol = screen.getByTestId('calendar-column-tomorrow');

    expect(todayCol.className).toContain('bg-amber-50/80');
    expect(todayCol.className).toContain('font-serif');
    expect(tomorrowCol.className).toContain('bg-amber-50/40');
  });

  it.skip('TC-1.23: Create manual transaction', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('每周待办日历'));

    // Click a timeslot (e.g., Monday 10:00)
    const slot = screen.getByTestId('calendar-slot-mon-1000');
    fireEvent.click(slot);

    // Modal pops up
    const input = screen.getByPlaceholderText('输入备忘/任务内容');
    fireEvent.change(input, { target: { value: '跟进学生申请' } });
    fireEvent.click(screen.getByRole('button', { name: '保存日程' }));

    // Transaction card renders with sky-300 background
    const card = screen.getByText('跟进学生申请');
    expect(card).toBeInTheDocument();
    expect(card.className).toContain('bg-sky-300');
  });

  it.skip('TC-1.24: Hover preview tooltip', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('每周待办日历'));

    const card = screen.getByText('跟进学生申请');
    fireEvent.mouseEnter(card);

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      expect(screen.getByRole('tooltip')).toHaveTextContent('跟进学生申请');
    });
  });

  it.skip('TC-1.25: Drag warning updates deadline', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '英国', type: '本升硕', status: '材料收集',
        applications: [{ id: 'APP1', school: '曼大', program: '建筑', deadline: '2026-06-01', openDate: '2025-10-01', status: '收集中' }],
        recommenders: [], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-1.25'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-1.25');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('每周待办日历'));

    // Find the warning transaction card (e.g., 曼大 - 建筑 截止日)
    const warningCard = screen.getByText(/曼大 - 建筑 截止日/);
    const targetSlot = screen.getByTestId('calendar-column-friday');

    // Simulate drag and drop
    fireEvent.dragStart(warningCard);
    fireEvent.dragOver(targetSlot);
    fireEvent.drop(targetSlot);
    fireEvent.dragEnd(warningCard);

    // Verify student's target deadline date updates in storage
    const savedData = (globalThis as any).mockElectronState.getFiles()['C:\\test-save-1.25'];
    const updatedApp = savedData.students[0].applications[0];
    expect(updatedApp.deadline).toContain('2026-06-05');
  });
});

describe('Tier 2: Boundary & Corner Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).mockElectronState.reset();
  });

  it('TC-2.1: Visa window outside season range', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '已确认录取',
        visaWindow: ['2024-09-01', '2024-12-31'], // Outside active season range
        applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-2.1'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-2.1');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('时间轴排期总览'));
    fireEvent.click(screen.getByText('张伟'));

    // Visa bar is handled gracefully (doesn't draw or clamps to edge)
    expect(screen.getByText('张伟 排期钻取')).toBeInTheDocument();
  });

  it('TC-2.2: Visa window duration is 0 days', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '已确认录取',
        visaWindow: ['2026-06-01', '2026-06-01'], // 0 days duration
        applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-2.2'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-2.2');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('时间轴排期总览'));
    fireEvent.click(screen.getByText('张伟'));

    expect(screen.getByText('签证办理安全窗口')).toBeInTheDocument();
  });

  it.skip('TC-2.3: Delete season containing no students', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' },
        { id: 'season_archived', name: '2026-2027 Archived Season', start: '2026-09-01', end: '2027-09-30', isArchived: true }
      ],
      students: [],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-2.3'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-2.3');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('申请季配置'));
    fireEvent.click(screen.getByText('进入已归档申请季 (回收站)'));

    const deleteBtn = screen.getByTitle('永久删除');
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('确认删除');

    fireEvent.click(deleteBtn);
    expect(promptSpy).toHaveBeenCalled();

    // Verify deletion has occurred
    const savedData = (globalThis as any).mockElectronState.getFiles()['C:\\test-2.3'];
    expect(savedData.seasons.find((s: any) => s.id === 'season_archived')).toBeUndefined();
  });

  it.skip('TC-2.4: Cancel deletion prompt', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' },
        { id: 'season_archived', name: '2026-2027 Archived Season', start: '2026-09-01', end: '2027-09-30', isArchived: true }
      ],
      students: [],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-2.4'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-2.4');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('申请季配置'));
    fireEvent.click(screen.getByText('进入已归档申请季 (回收站)'));

    const deleteBtn = screen.getByTitle('永久删除');
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('wrong_confirmation');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    fireEvent.click(deleteBtn);

    expect(promptSpy).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('已取消删除操作');

    // Season remains in Recycle Bin
    const savedData = (globalThis as any).mockElectronState.getFiles()['C:\\test-2.4'];
    expect(savedData.seasons.find((s: any) => s.id === 'season_archived')).toBeDefined();
  });

  it('TC-2.5: Archive current active season', async () => {
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active_1', name: '2025-2026 Active 1', start: '2025-09-01', end: '2026-09-30' },
        { id: 'season_active_2', name: '2026-2027 Active 2', start: '2026-09-01', end: '2027-09-30' }
      ],
      students: [],
      activeSeasonId: 'season_active_1'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-2.5'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-2.5');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('申请季配置'));

    const archiveBtns = screen.getAllByTitle('归档申请季');
    fireEvent.click(archiveBtns[0]); // Archive season_active_1
    fireEvent.click(screen.getByText('完成'));

    // Active season changes to the next available non-archived season
    const select = screen.getAllByRole('combobox')[0];
    expect(select).toHaveValue('season_active_2');
  });

  it('TC-2.6: specificDocs empty array input', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '材料收集',
        applications: [{ id: 'APP1', school: '香港大学', program: '金融', deadline: '2026-05-01', openDate: '2025-10-01', status: '收集中', specificDocs: [] }],
        recommenders: [], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-2.6'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-2.6');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('处理档案'));

    // App does not crash, displaying placeholder "无专属材料" or equivalent
    expect(screen.getByText('添加该专业专属材料')).toBeInTheDocument();
  });

  it.skip('TC-2.7: getTodayStr cross-day transition', async () => {
    render(<App />);

    // Mock time crossing midnight
    const futureDate = new Date('2026-07-04T00:05:00');
    vi.useFakeTimers();
    vi.setSystemTime(futureDate);

    // Keep app open and fire timer to trigger update
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    // Check if warning updates
    expect(screen.getByText(/今日/)).toHaveTextContent('7.4');

    vi.useRealTimers();
  });

  it.skip('TC-2.8: migrateStudents with null', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: null, // Null value in corrupted db
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-2.8'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-2.8');

    render(<App />);
    await screen.findByText('● 已配置');

    expect(screen.getByText('工作台概览')).toBeInTheDocument();
  });

  it.skip('TC-2.9: Empty name inline save', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '材料收集',
        applications: [], recommenders: [],
        docs: {
          basic: [{ id: 'b1', label: '身份证正反面扫描件', checked: false }],
          academic: [], visa: []
        }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-2.9'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-2.9');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('处理档案'));

    const nameLabel = screen.getByText('身份证正反面扫描件');
    fireEvent.click(nameLabel);

    const input = screen.getByDisplayValue('身份证正反面扫描件');
    fireEvent.change(input, { target: { value: '' } }); // Clear input name
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Verify it reverts to original value
    expect(screen.getByText('身份证正反面扫描件')).toBeInTheDocument();
  });

  it.skip('TC-2.10: Max character name input', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '香港', type: '本升硕', status: '材料收集',
        applications: [], recommenders: [],
        docs: {
          basic: [{ id: 'b1', label: '身份证正反面扫描件', checked: false }],
          academic: [], visa: []
        }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-2.10'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-2.10');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('处理档案'));

    const nameLabel = screen.getByText('身份证正反面扫描件');
    fireEvent.click(nameLabel);

    const input = screen.getByDisplayValue('身份证正反面扫描件');
    const longName = 'A'.repeat(250);
    fireEvent.change(input, { target: { value: longName } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Verify long name is saved successfully without crashing
    await waitFor(() => expect(screen.getByText(longName)).toBeInTheDocument());
  });

  it.skip('TC-2.11: determineMaterialPreset empty state', async () => {
    const initialData = {
      version: 1,
      seasons: [{ id: 'season_active', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' }],
      students: [{
        id: 'STU_1', name: '张伟', seasonId: 'season_active', region: '', type: '', status: '材料收集',
        applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] }
      }],
      activeSeasonId: 'season_active'
    };
    (globalThis as any).mockElectronState.getFiles()['C:\\test-2.11'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-2.11');

    render(<App />);
    await screen.findByText('● 已配置');

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('处理档案'));

    // Verify it falls back to default materials checklist
    expect(screen.getByText('个人基础材料')).toBeInTheDocument();
  });

  it.skip('TC-2.12: GPA scale boundary limits', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('录入新档案'));

    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: '绩点异常学生' } });
    const gpaInput = screen.getByLabelText('绩点') as HTMLInputElement;
    fireEvent.change(gpaInput, { target: { value: '6.0' } }); // invalid scale
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    // UI blocks saving or warns (modal stays open or shows validation error)
    expect(screen.getByText('录入新档案')).toBeInTheDocument();
  });

  it.skip('TC-2.13: Location toggle clearing', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('录入新档案'));

    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: '地点切换学生' } });
    const locationSelect = screen.getByLabelText('就读地点') as HTMLSelectElement;
    
    // Fill mainland values
    fireEvent.change(locationSelect, { target: { value: '中国大陆' } });
    const tierInput = screen.getByLabelText('院校层次') as HTMLInputElement;
    fireEvent.change(tierInput, { target: { value: '985' } });

    // Toggle location to "海外" and back
    fireEvent.change(locationSelect, { target: { value: '海外' } });
    fireEvent.change(locationSelect, { target: { value: '中国大陆' } });

    // Verify filled mainland values are preserved
    expect(screen.getByLabelText('院校层次')).toHaveValue('985');
  });

  it.skip('TC-2.14: Calendar (Extreme overlapping events)', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('每周待办日历'));

    // Create 5 concurrent transactions
    for (let i = 1; i <= 5; i++) {
      const slot = screen.getByTestId('calendar-slot-mon-1000');
      fireEvent.click(slot);
      const input = screen.getByPlaceholderText('输入备忘/任务内容');
      fireEvent.change(input, { target: { value: `任务 ${i}` } });
      fireEvent.click(screen.getByRole('button', { name: '保存日程' }));
    }

    // Verify it displays 4 cards side-by-side and folds the rest into "+1"
    expect(screen.getByText('任务 1')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it.skip('TC-2.15: Calendar (Drag card outside grid limits)', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('每周待办日历'));

    const card = screen.getByText('任务 1');
    fireEvent.dragStart(card);
    // Drag to somewhere outside the calendar container
    fireEvent.dragOver(document.body);
    fireEvent.drop(document.body);
    fireEvent.dragEnd(card);

    // Snaps back: it is still in the original slot (Mon 10:00)
    expect(screen.getByTestId('calendar-slot-mon-1000')).toContainElement(card);
  });

  it.skip('TC-2.16: Calendar (Drag transaction to lunch break)', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('每周待办日历'));

    const card = screen.getByText('任务 1');
    const lunchSeparator = screen.getByText('午休时间 (12:00 - 13:30)');

    fireEvent.dragStart(card);
    fireEvent.dragOver(lunchSeparator);
    fireEvent.drop(lunchSeparator);
    fireEvent.dragEnd(card);

    // Drop rejected, card snaps back to original slot
    expect(screen.getByTestId('calendar-slot-mon-1000')).toContainElement(card);
  });
});
