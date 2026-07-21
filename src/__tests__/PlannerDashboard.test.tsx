import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlannerDashboard from '../components/PlannerDashboard';
import * as cloudSync from '../lib/cloudSync';

const session = {
  username: 'planner_a', token: 'planner-token', machineId: 'planner-browser',
  expireTime: '2099-01-01T00:00:00', role: 'planner' as const,
};

const activeStudent = {
  teacher_username: 'teacher_a', student_id: 'active-1', name: '在读学生甲',
  status: '材料收集', season_id: 'season-live', season_name: '2026申请季',
  archived: false, planner_username: 'planner_a', assigned_to_me: true,
  eligible: true, application_count: 2, updated_at: '2026-07-19T00:00:00',
  source_stage: '本科', target_stage: '硕士', stage_path: '本科 → 硕士',
};

const archivedStudent = {
  ...activeStudent, teacher_username: 'teacher_b', student_id: 'archive-1',
  name: '归档学生乙', season_id: 'season-archive', season_name: '2025归档季', archived: true,
};

describe('planning-teacher student dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cloudSync.loadPlannerDashboard).mockResolvedValue({
      active_students: [activeStudent], archived_students: [archivedStudent], server_time: '2026-07-19T00:00:00',
    });
    vi.mocked(cloudSync.loadPlannerCandidates).mockResolvedValue({
      archived: false,
      students: [{
        ...activeStudent, teacher_username: 'teacher_c', student_id: 'unclaimed-1', name: '未认领学生丙',
        planner_username: '', assigned_to_me: false, eligible: true,
      }],
    });
  });

  it('shows only assigned student cards and claims multiple unclaimed candidates', async () => {
    render(<PlannerDashboard session={session} onLogout={vi.fn()} onViewStudent={vi.fn()} />);

    expect(await screen.findByText('在读学生甲')).toBeInTheDocument();
    expect(screen.queryByText('归档学生乙')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '添加学生' }));

    const dialog = await screen.findByRole('dialog', { name: '添加学生' });
    const candidate = await within(dialog).findByRole('button', { name: /未认领学生丙/ });
    fireEvent.click(candidate);
    fireEvent.click(within(dialog).getByRole('button', { name: '一键添加' }));

    await waitFor(() => expect(cloudSync.assignPlannerStudents).toHaveBeenCalledWith(session, [
      { teacher_username: 'teacher_c', student_id: 'unclaimed-1' },
    ]));
  });

  it('keeps archives as a directory and cold-loads only the selected assigned student', async () => {
    const onViewStudent = vi.fn();
    render(<PlannerDashboard session={session} onLogout={vi.fn()} onViewStudent={onViewStudent} />);

    await screen.findByText('在读学生甲');
    fireEvent.click(screen.getByRole('button', { name: /归档学生目录/ }));
    expect(await screen.findByText('归档学生乙')).toBeInTheDocument();
    expect(screen.getByText(/仅目录；点击查看时才冷加载完整档案/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /查看资料库/ }));
    await waitFor(() => expect(onViewStudent).toHaveBeenCalledWith(archivedStudent));

    fireEvent.click(screen.getByRole('button', { name: '添加归档学生' }));
    await waitFor(() => expect(cloudSync.loadPlannerCandidates).toHaveBeenCalledWith(session, true));
  });

  it('removes an assignment only after confirmation without deleting the student', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    render(<PlannerDashboard session={session} onLogout={vi.fn()} onViewStudent={vi.fn()} />);
    await screen.findByText('在读学生甲');

    fireEvent.click(screen.getByTitle('从负责名单移除（不会删除档案）'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('学生档案不会被删除'));
    await waitFor(() => expect(cloudSync.unassignPlannerStudent).toHaveBeenCalledWith(
      session, 'teacher_a', 'active-1',
    ));
  });

  it('distinguishes same-name records by teacher, season and normalized stage', async () => {
    vi.mocked(cloudSync.loadPlannerCandidates).mockResolvedValueOnce({
      archived: false,
      students: [
        { ...activeStudent, teacher_username: 'teacher_a', student_id: 'same-1', name: '王晨', planner_username: '', assigned_to_me: false, source_stage: '本科', target_stage: '硕士', stage_path: '本科 → 硕士' },
        { ...activeStudent, teacher_username: 'teacher_b', student_id: 'same-2', name: '王晨', planner_username: '', assigned_to_me: false, source_stage: '高中', target_stage: '本科', stage_path: '高中 → 本科' },
      ],
    });
    render(<PlannerDashboard session={session} onLogout={vi.fn()} onViewStudent={vi.fn()} />);
    await screen.findByText('在读学生甲');
    fireEvent.click(screen.getByRole('button', { name: '添加学生' }));
    const dialog = await screen.findByRole('dialog', { name: '添加学生' });
    expect(within(dialog).getAllByText('同名 2 条')).toHaveLength(2);
    expect(within(dialog).getByText(/teacher_a/)).toBeInTheDocument();
    expect(within(dialog).getByText(/teacher_b/)).toBeInTheDocument();
    expect(within(dialog).getByText(/本科 → 硕士/)).toBeInTheDocument();
    expect(within(dialog).getByText(/高中 → 本科/)).toBeInTheDocument();
  });
});
