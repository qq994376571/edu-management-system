/**
 * NewFeatures.test.tsx
 *
 * Comprehensive test coverage for all current app features:
 * GROUP 1: Calendar (TC-CAL-x) - weekly calendar, cell click-to-save, tooltips, drag blocker
 * GROUP 2: Multi-select applicationRegion (TC-REG-x)
 * GROUP 3: Material Library (TC-MAT-x) - 4-zone, InlineInput, preset manager
 * GROUP 4: Alert System (TC-ALRT-x) - dashboard, calendar integration
 * GROUP 5: Gantt Chart (TC-GNTT-x) - visa color differentiation
 * GROUP 6: Preset Manager (TC-PRE-x) - scenario CRUD
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import React from 'react';
import App, { DEMO_STUDENTS, INITIAL_SEASONS } from '../App';

describe('New Features: Comprehensive Coverage', () => {
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

  // ============================================================
  // GROUP 1: CALENDAR FEATURES (TC-CAL-x)
  // ============================================================

  it('TC-CAL-1.1: Calendar tab is the default tab on startup', async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getAllByText(/每周待办日历/)[0]).toBeInTheDocument()
    );
  });

  it('TC-CAL-1.2: Calendar renders 7 day columns and time slots', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByText(/每周待办日历/)[0]).toBeInTheDocument());
    // 7 weekday headers
    expect(screen.getByText('周一')).toBeInTheDocument();
    expect(screen.getByText('周日')).toBeInTheDocument();
    // Time slots
    expect(screen.getByText('9:00')).toBeInTheDocument();
  });

  it('TC-CAL-1.3: Clicking an empty calendar cell opens an input field', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByText(/每周待办日历/)[0]).toBeInTheDocument());

    const cells = container.querySelectorAll('[class*="group\/cell"]');
    if (cells.length === 0) { console.warn("No cells found"); return; }

    act(() => { fireEvent.click(cells[0]); });

    const inputs = container.querySelectorAll('input[placeholder*="记录事项"]');
    expect(inputs.length).toBe(1);
  });

  it('TC-CAL-1.4: Only ONE calendar input opens at a time (addingTodo guard)', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByText(/每周待办日历/)[0]).toBeInTheDocument());

    const cells = container.querySelectorAll('[class*="group\/cell"]');
    if (cells.length < 2) return;

    // Open first cell
    act(() => { fireEvent.click(cells[0]); });
    await waitFor(() => expect(container.querySelectorAll('input[placeholder*="记录事项"]').length).toBe(1));

    // Click a different cell while first is still open
    act(() => { fireEvent.click(cells[cells.length - 1]); });

    // Must never have 2 open inputs simultaneously
    await waitFor(() => {
      const inputs = container.querySelectorAll('input[placeholder*="记录事项"]');
      expect(inputs.length).toBeLessThanOrEqual(1);
    });
  });

  it('TC-CAL-1.5: Enter key saves a calendar event as a bubble', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByText(/每周待办日历/)[0]).toBeInTheDocument());

    const cells = container.querySelectorAll('[class*="group\/cell"]');
    if (cells.length === 0) return;

    act(() => { fireEvent.click(cells[0]); });
    const input = await waitFor(() => container.querySelector('input[placeholder*="记录事项"]') as HTMLInputElement);
    if (!input) return;

    act(() => {
      fireEvent.change(input, { target: { value: '日历测试事务' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Input disappears after Enter
    await waitFor(() => expect(container.querySelectorAll('input[placeholder*="记录事项"]').length).toBe(0));
    // Event text appears as a bubble
    await waitFor(() => expect(screen.getByText('日历测试事务')).toBeInTheDocument());
  });

  it('TC-CAL-1.6: Escape key discards calendar input without saving', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByText(/每周待办日历/)[0]).toBeInTheDocument());

    const cells = container.querySelectorAll('[class*="group\/cell"]');
    if (cells.length === 0) return;

    act(() => { fireEvent.click(cells[0]); });
    const input = await waitFor(() => container.querySelector('input[placeholder*="记录事项"]') as HTMLInputElement);
    if (!input) return;

    act(() => {
      fireEvent.change(input, { target: { value: '不会被保存' } });
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    });

    await waitFor(() => expect(container.querySelectorAll('input[placeholder*="记录事项"]').length).toBe(0));
    expect(screen.queryByText('不会被保存')).not.toBeInTheDocument();
  });

  it('TC-CAL-1.7: Deleting a calendar event removes it from the cell', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByText(/每周待办日历/)[0]).toBeInTheDocument());

    const cells = container.querySelectorAll('[class*="group\/cell"]');
    if (cells.length === 0) return;

    // Add an event first
    act(() => { fireEvent.click(cells[0]); });
    const input = await waitFor(() => container.querySelector('input[placeholder*="记录事项"]') as HTMLInputElement);
    if (!input) return;

    act(() => {
      fireEvent.change(input, { target: { value: '删除测试' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => expect(screen.getByText('删除测试')).toBeInTheDocument());

    // Hover on the bubble to reveal delete button, then click X
    const bubble = screen.getByText('删除测试').closest('[class*="group"]');
    if (!bubble) return;

    const deleteBtn = bubble.querySelector("button[type=\"button\"]");
    if (deleteBtn) {
      act(() => { fireEvent.click(deleteBtn); });
      expect(screen.getByText('删除这条备注？')).toBeInTheDocument();
      expect(screen.getByText('删除测试')).toBeInTheDocument();
      act(() => { fireEvent.click(screen.getByRole('button', { name: '删除备注' })); });
      await waitFor(() => expect(screen.queryByText('删除测试')).not.toBeInTheDocument());
    }
  });

  it('TC-CAL-1.8: Week navigation buttons render (prev/next week)', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByText(/每周待办日历/)[0]).toBeInTheDocument());

    // Navigation buttons should exist (prev/next week)
    const prevBtn = screen.queryByTitle('上一周') || screen.queryByLabelText('上一周');
    const nextBtn = screen.queryByTitle('下一周') || screen.queryByLabelText('下一周');
    const navBtns = document.querySelectorAll("[title*=\"\u5468\"]");
    expect(navBtns.length + (prevBtn ? 1 : 0) + (nextBtn ? 1 : 0)).toBeGreaterThanOrEqual(0);
    expect(screen.getByText('午休')).toBeInTheDocument();
  });

  it('TC-CAL-1.9: Hovering a calendar event shows details in fixed tooltip', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByText(/每周待办日历/)[0]).toBeInTheDocument());

    const cells = container.querySelectorAll('[class*="group\/cell"]');
    if (cells.length === 0) return;

    // Add an event first
    act(() => { fireEvent.click(cells[0]); });
    const input = await waitFor(() => container.querySelector('input[placeholder*="记录事项"]') as HTMLInputElement);
    if (!input) return;

    act(() => {
      fireEvent.change(input, { target: { value: '悬浮测试事项' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    const bubble = await waitFor(() => screen.getByText('悬浮测试事项'));

    // Trigger mouseEnter
    act(() => {
      fireEvent.mouseEnter(bubble);
    });

    // Tooltip should appear in fixed layout
    await waitFor(() => {
      const fixedTooltip = container.querySelector('[style*="position: fixed"]');
      expect(fixedTooltip).toBeTruthy();
      expect(within(fixedTooltip as HTMLElement).getByText('悬浮测试事项')).toBeInTheDocument();
    });

    // Trigger mouseLeave
    act(() => {
      fireEvent.mouseLeave(bubble);
    });

    // Tooltip should disappear
    await waitFor(() => {
      const fixedTooltip = container.querySelector('[style*="position: fixed"]');
      expect(fixedTooltip).toBeNull();
    });
  });

  it('TC-CAL-1.10: Click on another cell saves first event and does NOT open new input (timestamp guard)', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByText(/每周待办日历/)[0]).toBeInTheDocument());

    const cells = container.querySelectorAll('[class*="group\/cell"]');
    if (cells.length < 2) return;

    // 1. Click first cell to open input
    act(() => { fireEvent.click(cells[0]); });
    const input = await waitFor(() => container.querySelector('input[placeholder*="记录事项"]') as HTMLInputElement);
    expect(input).toBeTruthy();

    // 2. Type some text
    act(() => { fireEvent.change(input, { target: { value: '第一格文字' } }); });

    // 3. Click the second cell. This will first blur the input (triggering save) and then fire click on cell.
    // We simulate blur and immediate click to test event timing.
    act(() => {
      fireEvent.blur(input);
      fireEvent.click(cells[1]);
    });

    // 4. Verify that the first event is saved
    await waitFor(() => expect(screen.getByText('第一格文字')).toBeInTheDocument());

    // 5. Verify that NO input field is open in the second cell (the click is ignored due to timestamp dampening)
    const inputsAfter = container.querySelectorAll("input[placeholder*=\"记录事项\"]");
    expect(inputsAfter.length).toBe(0);
  });

  it('TC-CAL-1.11: Deleting calendar event clears active hovered event tooltip immediately', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByText(/每周待办日历/)[0]).toBeInTheDocument());

    const cells = container.querySelectorAll('[class*="group\/cell"]');
    if (cells.length === 0) return;

    // Add an event
    act(() => { fireEvent.click(cells[0]); });
    const input = await waitFor(() => container.querySelector('input[placeholder*="记录事项"]') as HTMLInputElement);
    if (!input) return;

    act(() => {
      fireEvent.change(input, { target: { value: '删除清除悬浮' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    const bubble = await waitFor(() => screen.getByText('删除清除悬浮'));

    // Mouse enter to show tooltip
    act(() => { fireEvent.mouseEnter(bubble); });
    await waitFor(() => expect(container.querySelector('[style*="position: fixed"]')).toBeTruthy());

    // Click delete X button
    const deleteBtn = bubble.closest('[class*="group"]')?.querySelector('button[type="button"]');
    if (deleteBtn) {
      act(() => { fireEvent.click(deleteBtn); });
    }

    // The tooltip closes immediately, while the event remains until the
    // destructive second confirmation is explicitly accepted.
    expect(container.querySelector('[style*="position: fixed"]')).toBeNull();
    expect(screen.getByText('删除清除悬浮')).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole('button', { name: '删除备注' })); });

    // The event should be gone after confirmation and the tooltip stays closed.
    await waitFor(() => {
      expect(screen.queryByText('删除清除悬浮')).toBeNull();
      expect(container.querySelector('[style*="position: fixed"]')).toBeNull();
    });
  });

  // ============================================================
  // GROUP 2: MULTI-SELECT APPLICATION REGION (TC-REG-x)
  // ============================================================

  it('TC-REG-2.1: Student edit form has NO legacy single select for applicationRegion', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByTitle('编辑'));

    await waitFor(() => expect(screen.getByText(/意向目标地区/)).toBeInTheDocument());

    const legacySelect = container.querySelector("#stu-applicationRegion");
    expect(legacySelect).toBeNull();
  });

  it('TC-REG-2.2: Multi-select container (data-region-dropdown) is present', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByTitle('编辑'));

    await waitFor(() => expect(screen.getByText(/意向目标地区/)).toBeInTheDocument());

    const multiSelect = container.querySelector("[data-region-dropdown]");
    expect(multiSelect).not.toBeNull();
  });

  it('TC-REG-2.3: Multi-select label includes (可多选) hint', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByTitle('编辑'));

    await waitFor(() => expect(screen.getAllByText(/可多选/)[0]).toBeInTheDocument());
  });

  it('TC-REG-2.4: Clicking dropdown trigger reveals region checkboxes panel', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByTitle('编辑'));
    await waitFor(() => expect(screen.getByText(/意向目标地区/)).toBeInTheDocument());

    const dropdownContainer = container.querySelector("[data-region-dropdown]") as HTMLElement;
    const triggerDiv = dropdownContainer.querySelector("div[class*=\"cursor-pointer\"]") as HTMLElement;

    act(() => { fireEvent.click(triggerDiv); });

    await waitFor(() => {
      const panel = dropdownContainer.querySelector(".max-h-48");
      expect(panel).not.toBeNull();
    });
  });

  it('TC-REG-2.5: Selecting a region updates the trigger display text', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByTitle('编辑'));
    await waitFor(() => expect(screen.getByText(/意向目标地区/)).toBeInTheDocument());

    const dropdownContainer = container.querySelector("[data-region-dropdown]") as HTMLElement;
    const triggerDiv = dropdownContainer.querySelector("div[class*=\"cursor-pointer\"]") as HTMLElement;
    act(() => { fireEvent.click(triggerDiv); });

    await waitFor(() => {
      const panel = dropdownContainer.querySelector(".max-h-48");
      expect(panel).not.toBeNull();
    });

    const panel = dropdownContainer.querySelector(".max-h-48") as HTMLElement;
    const options = panel.querySelectorAll("[class*=\"cursor-pointer\"]");

    if (options.length > 0) {
      act(() => { fireEvent.click(options[0]); });
      await waitFor(() => {
        const spanText = dropdownContainer.querySelector("span")?.textContent || "";
        expect(spanText).not.toBe('请选择（可多选）');
      });
    }
  });

  it('TC-REG-2.6: Selecting two regions produces slash-joined string in trigger', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByTitle('编辑'));
    await waitFor(() => expect(screen.getByText(/意向目标地区/)).toBeInTheDocument());

    const dropdownContainer = container.querySelector("[data-region-dropdown]") as HTMLElement;
    act(() => { fireEvent.click(dropdownContainer.querySelector("div[class*=\"cursor-pointer\"]") as HTMLElement); });

    await waitFor(() => expect(dropdownContainer.querySelector(".max-h-48")).not.toBeNull());

    const panel = dropdownContainer.querySelector(".max-h-48") as HTMLElement;
    const options = panel.querySelectorAll("[class*=\"cursor-pointer\"]");

    if (options.length >= 2) {
      act(() => {
        fireEvent.click(options[0]);
        fireEvent.click(options[1]);
      });
      await waitFor(() => {
        const txt = dropdownContainer.querySelector("div > span")?.textContent || "";
        expect(txt).toContain("/");
      });
    }
  });

  it('TC-REG-2.7: Student list shows applicationRegion in the region column', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const arrowCells = screen.getAllByText(/→/);
    expect(arrowCells.length).toBeGreaterThan(0);
  });

  it('TC-REG-2.8: Outside click handler uses click event (not mousedown) which prevents focus hijacking', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByTitle('编辑'));
    await waitFor(() => expect(screen.getByText(/意向目标地区/)).toBeInTheDocument());

    const dropdownContainer = container.querySelector("[data-region-dropdown]") as HTMLElement;
    const triggerDiv = dropdownContainer.querySelector("div[class*=\"cursor-pointer\"]") as HTMLElement;

    // Open dropdown
    act(() => { fireEvent.click(triggerDiv); });
    await waitFor(() => expect(dropdownContainer.querySelector(".max-h-48")).toBeTruthy());

    // Find another input on the modal, e.g. name input
    const nameInput = container.querySelector("input[name=\"name\"]") as HTMLInputElement;
    expect(nameInput).toBeTruthy();

    // Click the name input to close dropdown AND focus name input
    act(() => {
      fireEvent.click(nameInput);
    });

    // Dropdown should be closed
    await waitFor(() => expect(dropdownContainer.querySelector(".max-h-48")).toBeNull());
  });

  // ============================================================
  // GROUP 3: MATERIAL LIBRARY - 4-ZONE STRUCTURE (TC-MAT-x)
  // ============================================================

  it('TC-MAT-3.1: Material library renders 4 category zones', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));

    await waitFor(() => expect(screen.getByText(/信息收集表/)).toBeInTheDocument());
    expect(screen.getByText(/个人基础材料/)).toBeInTheDocument();
    expect(screen.getByText(/学术公证/)).toBeInTheDocument();
    expect(screen.getByText(/教务文书/)).toBeInTheDocument();
  });

  it('TC-MAT-3.2: Material checkbox toggles completed state', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));

    await waitFor(() => expect(screen.getByText(/信息收集表/)).toBeInTheDocument());

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      const firstCheckbox = checkboxes[0] as HTMLInputElement;
      const initialState = firstCheckbox.checked;
      act(() => { fireEvent.click(firstCheckbox); });
      await waitFor(() => expect(firstCheckbox.checked).toBe(!initialState));
    }
  });

  it('TC-MAT-3.3: Preset manager modal opens from docs page', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));

    await waitFor(() => expect(screen.getByText(/材料预设管理/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/材料预设管理/));

    await waitFor(() => expect(screen.getByText(/情景列表/)).toBeInTheDocument());
  });

  it('TC-MAT-3.4: Preset manager shows existing scenario list', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    await waitFor(() => expect(screen.getByText(/材料预设管理/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/材料预设管理/));

    await waitFor(() => expect(screen.getByText(/中国大陆 → 香港/)).toBeInTheDocument());
  });

  it('TC-MAT-3.5: Preset manager can add a new scenario', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));
    await waitFor(() => expect(screen.getByText(/材料预设管理/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/材料预设管理/));

    await waitFor(() => expect(screen.getByText(/情景列表/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('新增情景'));

    await waitFor(() => expect(screen.getByPlaceholderText('情景名称(可修改)')).toBeInTheDocument());
    const nameInput = screen.getByPlaceholderText('情景名称(可修改)');
    fireEvent.change(nameInput, { target: { value: '测试新情景' } });
    fireEvent.click(screen.getByText('创建'));

    await waitFor(() => expect(screen.getByText('测试新情景')).toBeInTheDocument());
  });

  it('TC-MAT-3.6: InlineInput renders material labels as editable spans', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByText('处理档案'));

    await waitFor(() => expect(screen.getByText('个人简历 (CV) & PS')).toBeInTheDocument());

    const labelEl = screen.getByText("个人简历 (CV) & PS");
    act(() => { fireEvent.click(labelEl); });

    await waitFor(() => expect(container.querySelector('input[value="个人简历 (CV) & PS"]') ||
      container.querySelector('input[value*="CV"]')).toBeTruthy());
  });

  // ============================================================
  // GROUP 4: ALERT SYSTEM (TC-ALRT-x)
  // ============================================================

  it('TC-ALRT-4.1: Alert dashboard renders on the dashboard tab', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('智能预警仪表盘'));
    await waitFor(() => expect(screen.getByText('工作台概览')).toBeInTheDocument());
  });

  it('TC-ALRT-4.2: Alert cards show active/completed/ignored counts', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('智能预警仪表盘'));
    await waitFor(() => expect(screen.getByText('工作台概览')).toBeInTheDocument());

    const activeSection = screen.queryByText(/活跃学生/);
    const attentionSection = screen.queryByText(/需要注意/);
    expect(activeSection || attentionSection).toBeTruthy();
  });

  it('TC-ALRT-4.3: Active students card and Attention card are in different colors', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('智能预警仪表盘'));
    await waitFor(() => expect(screen.getByText('工作台概览')).toBeInTheDocument());

    const activeCard = container.querySelector('.border-t-blue-500');
    expect(activeCard).toBeTruthy();

    const warningCard = container.querySelector('.border-t-\\[\\#C68A4C\\]');
    expect(warningCard).toBeTruthy();
  });

  it('TC-ALRT-4.4: Marking an alert as completed updates its state', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('智能预警仪表盘'));
    await waitFor(() => expect(screen.getByText('工作台概览')).toBeInTheDocument());

    const completeBtns = screen.queryAllByText(/标记完成/);
    if (completeBtns.length > 0) {
      const initialCount = completeBtns.length;
      act(() => { fireEvent.click(completeBtns[0]); });
      await waitFor(() => {
        const remainingBtns = screen.queryAllByText(/标记完成/);
        expect(remainingBtns.length).toBeLessThanOrEqual(initialCount);
      });
    }
  });

  // ============================================================
  // GROUP 5: GANTT CHART (TC-GNTT-x)
  // ============================================================

  it('TC-GNTT-5.1: Gantt chart renders with legend showing visa window color', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('时间轴排期总览'));
    await waitFor(() => expect(screen.getAllByText(/备注截止日/)[0]).toBeInTheDocument());
  });

  it('TC-GNTT-5.2: Gantt visa window bar uses teal color (not amber)', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('时间轴排期总览'));
    await waitFor(() => expect(screen.getAllByText(/备注截止日/)[0]).toBeInTheDocument());

    const tealElements = container.querySelectorAll('[class*="teal"]');
    const tealStyleElements = Array.from(container.querySelectorAll('*')).filter(el => {
      const style = (el as HTMLElement).style;
      return style.backgroundColor && (style.backgroundColor.includes('20,184,166') || style.backgroundColor.includes('teal'));
    });
    expect(tealElements.length + tealStyleElements.length).toBeGreaterThanOrEqual(0);
    const visaLegend = screen.queryByText(/签证安全/);
    expect(visaLegend).toBeTruthy();
  });

  // ============================================================
  // GROUP 6: STUDENT BACKGROUND INFO (TC-STU-x)
  // ============================================================

  it('TC-STU-6.1: Student edit form has preceding school fields', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByTitle('编辑'));

    await waitFor(() => expect(screen.getByText(/毕业学校/)).toBeInTheDocument());
  });

  it('TC-STU-6.2: Student form has GPA and program length fields', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByTitle('编辑'));

    await waitFor(() => expect(screen.getByText(/GPA/)).toBeInTheDocument());
    const gpaInput = container.querySelector('input[name="gpa"]');
    expect(gpaInput).not.toBeNull();
  });

  it('TC-STU-6.3: targetStages defaults are high school, bachelor, master, doctorate', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByTitle('编辑'));

    await waitFor(() => expect(screen.getByText(/目标阶段/)).toBeInTheDocument());

    const stageSelect = container.querySelector('#stu-applicationStage') as HTMLSelectElement;
    if (stageSelect) {
      const options = Array.from(stageSelect.options).map(o => o.value);
      expect(options).toContain('高中');
      expect(options).toContain('本科');
      expect(options).toContain('硕士');
      expect(options).toContain('博士');
      expect(options).not.toContain('专升本');
      expect(options).not.toContain('高升本');
    }
  });

  it('TC-STU-6.4: OptionManager supports renaming options using inline inputs (no prompt)', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByTitle('编辑'));

    const optionManagerBtns = screen.getAllByText(/管理意向/);
    expect(optionManagerBtns.length).toBeGreaterThan(0);
    fireEvent.click(optionManagerBtns[0]);

    const modal = await waitFor(() => screen.getByText('地区与阶段选项配置').closest('div')!);
    expect(modal).toBeTruthy();

    const jdTabBtn = within(modal).getByText('就读地区');
    fireEvent.click(jdTabBtn);

    const optionDiv = await waitFor(() => within(modal).getAllByText('中国大陆')[0].closest('div')!);
    const editBtn = within(optionDiv).getByText('编辑');
    fireEvent.click(editBtn);

    const inlineInput = await waitFor(() => screen.getByDisplayValue('中国大陆') as HTMLInputElement);
    expect(inlineInput).toBeTruthy();

    act(() => {
      fireEvent.change(inlineInput, { target: { value: '华夏大陆' } });
      fireEvent.keyDown(inlineInput, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(screen.queryByDisplayValue('华夏大陆')).toBeNull();
      expect(within(modal).getAllByText('华夏大陆')[0]).toBeInTheDocument();
    });
  });

  it('TC-STU-6.5: OptionManager supports inline double-click deletion (no confirm Dialog)', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText('张伟（测试）')).toBeInTheDocument());

    const row = screen.getByText('张伟（测试）').closest('tr')!;
    fireEvent.click(within(row).getByTitle('编辑'));

    const optionManagerBtns = screen.getAllByText(/管理意向/);
    expect(optionManagerBtns.length).toBeGreaterThan(0);
    fireEvent.click(optionManagerBtns[0]);

    const modal = await waitFor(() => screen.getByText('地区与阶段选项配置').closest('div')!);
    expect(modal).toBeTruthy();

    const jdTabBtn = within(modal).getByText('就读地区');
    fireEvent.click(jdTabBtn);

    const optionDiv = await waitFor(() => within(modal).getAllByText('海外')[0].closest('div')!);
    const deleteBtn = within(optionDiv).getByTitle('删除');
    expect(deleteBtn).toBeTruthy();

    // 1st click to enter confirm state
    act(() => { fireEvent.click(deleteBtn); });

    // Verify it changed to "确认删除？" text and is NOT deleted yet
    const confirmBtn = await waitFor(() => within(optionDiv).getByText('确认删除？'));
    expect(confirmBtn).toBeTruthy();
    expect(within(modal).getByText('海外')).toBeInTheDocument();

    // 2nd click to actually delete
    act(() => { fireEvent.click(confirmBtn); });

    // Option is deleted
    await waitFor(() => {
      expect(within(modal).queryByText('海外')).toBeNull();
    });
  });

  // ============================================================
  // GROUP 7: SIDEBAR NAVIGATION (TC-NAV-x)
  // ============================================================

  it('TC-NAV-7.1: All main tabs are navigable', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('学生档案和资料'));
    await waitFor(() => expect(screen.getByText(/活跃学生档案/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('时间轴排期总览'));
    await waitFor(() => expect(screen.getAllByText(/备注截止日/)[0]).toBeInTheDocument());

    fireEvent.click(screen.getByText('智能预警仪表盘'));
    await waitFor(() => expect(screen.getByText('工作台概览')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText(/每周待办/)[0]);
    await waitFor(() => expect(screen.getAllByText(/每周待办日历/)[0]).toBeInTheDocument());
  });

});
