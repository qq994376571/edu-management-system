import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MobileGanttMilestone } from '../App';

describe('mobile Gantt milestone rendering', () => {
  it('updates a non-terminal milestone from a red dot to a gray square immediately', () => {
    const alertId = 'student-a-app-a-note-a';
    const { rerender } = render(
      <MobileGanttMilestone completedAlerts={{}} alertId={alertId} label="补材料" />,
    );

    const pending = screen.getByLabelText('补材料：未完成');
    expect(pending).toHaveAttribute('data-mobile-gantt-milestone', 'pending');
    expect(pending).toHaveClass('rounded-full', 'bg-red-500');

    rerender(
      <MobileGanttMilestone
        completedAlerts={{ [alertId]: { timestamp: Date.now() } }}
        alertId={alertId}
        label="补材料"
      />,
    );

    const completed = screen.getByLabelText('补材料：已完成');
    expect(completed).toHaveAttribute('data-mobile-gantt-milestone', 'completed');
    expect(completed).toHaveClass('rounded-sm', 'bg-slate-500');
  });

  it('also renders terminal applications and database-completed notes as gray squares', () => {
    const { rerender } = render(
      <MobileGanttMilestone completedAlerts={{}} alertId="terminal-note" terminal label="终态备注" />,
    );
    expect(screen.getByLabelText('终态备注：已完成')).toHaveClass('rounded-sm', 'bg-slate-500');

    rerender(
      <MobileGanttMilestone completedAlerts={{}} alertId="database-note" noteCompleted label="档案备注" />,
    );
    expect(screen.getByLabelText('档案备注：已完成')).toHaveClass('rounded-sm', 'bg-slate-500');
  });
});
