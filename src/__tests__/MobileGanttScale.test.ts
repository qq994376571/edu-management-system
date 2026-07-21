import { describe, expect, it } from 'vitest';
import { getMobileGanttApplicationBarClass, getMobileGanttScale, isMobileGanttMilestoneCompleted } from '../App';

describe('手机甘特图时间刻度', () => {
  it('只显示申请季起止月份，并计算今天竖线的位置', () => {
    const scale = getMobileGanttScale('2026-01-01', '2026-06-30', '2026-04-01');
    expect(scale.startLabel).toBe('2026年1月');
    expect(scale.endLabel).toBe('2026年6月');
    expect(scale.todayLabel).toBe('4/1');
    expect(scale.todayInRange).toBe(true);
    expect(scale.todayPosition).toBeGreaterThan(49);
    expect(scale.todayPosition).toBeLessThan(51);
  });

  it('跨年申请季的两端都保留年份，终态专业申请条仍为金橙色', () => {
    const scale = getMobileGanttScale('2025-09-01', '2026-09-30', '2026-04-01');
    expect(scale.startLabel).toBe('2025年9月');
    expect(scale.endLabel).toBe('2026年9月');

    const terminalBarClass = getMobileGanttApplicationBarClass(true);
    expect(terminalBarClass).toContain('bg-[#C68A4C]');
    expect(terminalBarClass).not.toContain('bg-slate');
  });

  it('今天不在申请季内时仍给出明确的季前/季后提示，并钳制到边界', () => {
    const before = getMobileGanttScale('2026-09-01', '2027-06-30', '2026-07-18');
    expect(before.todayInRange).toBe(false);
    expect(before.todayRelation).toBe('申请季前');
    expect(before.todayPosition).toBe(0);

    const after = getMobileGanttScale('2025-09-01', '2026-06-30', '2026-07-18');
    expect(after.todayInRange).toBe(false);
    expect(after.todayRelation).toBe('申请季后');
    expect(after.todayPosition).toBe(100);
  });

  it('未结案专业的单项完成状态会实时把红点变为灰色方框', () => {
    const alertId = 'student-a-app-a-note-a';
    expect(isMobileGanttMilestoneCompleted({}, alertId, false)).toBe(false);
    expect(isMobileGanttMilestoneCompleted({ [alertId]: { completedAt: '2026-07-19T10:00:00' } }, alertId, false)).toBe(true);
    expect(isMobileGanttMilestoneCompleted({}, alertId, true)).toBe(true);
    expect(isMobileGanttMilestoneCompleted({}, alertId, false, true)).toBe(true);
  });
});
