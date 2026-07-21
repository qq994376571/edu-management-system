import { describe, expect, it } from 'vitest';
import {
  buildDerivedCalendarEvents,
  isCalendarEventDismissed,
  isTerminalApplication,
  isTerminalStudent,
  movePresetDocument,
  smartMergePresetDocs,
} from '../lib/workflowRules';

const baseStudent = {
  id: 's1', seasonId: 'season', name: '学生A', status: '材料收集',
  docs: {
    info: [{ id: 'i1', label: '信息表', checked: false }],
    basic: [{ id: 'b1', label: '护照', checked: true }],
    academic: [{ id: 'a1', label: '成绩单', checked: false }],
    writing: [], visa: [], unclassified: [],
  },
  recommenders: [{ id: 'r1', name: '教授A' }],
  applications: [{
    id: 'a1', school: '学校A', program: '专业A', status: '收集中',
    openDate: '2026-08-01', deadline: '2026-08-20',
    notes: [{ id: 'n1', text: '补件', deadline: '2026-08-12' }],
    specificDocs: [{ id: 'sd1', label: '作品集', checked: false }],
    recommendations: { r1: { status: 'pending', deadline: '2026-08-18' } },
  }],
};

describe('workflow rules', () => {
  it('suppresses every derived event for terminal applications and students', () => {
    expect(isTerminalApplication('已取消')).toBe(true);
    expect(isTerminalApplication('已录取')).toBe(true);
    expect(isTerminalStudent('已结单')).toBe(true);
    expect(isTerminalStudent('已结案')).toBe(true);

    const terminalApp = structuredClone(baseStudent);
    terminalApp.applications[0].status = '已拒绝';
    expect(buildDerivedCalendarEvents([terminalApp], [{ id: 'season', name: '申请季' }], {}).length).toBe(0);

    const terminalStudent = structuredClone(baseStudent);
    terminalStudent.status = '已结单';
    expect(buildDerivedCalendarEvents([terminalStudent], [{ id: 'season', name: '申请季' }], {}).length).toBe(0);
  });

  it('creates purple milestones and lead-time material/recommendation reminders', () => {
    const events = buildDerivedCalendarEvents(
      [baseStudent],
      [{ id: 'season', name: '申请季' }],
      { deadlineCritical: 7, rlWarning: 14 },
    );
    expect(events.find(event => event.kind === 'application_open')?.type).toBe('milestone');
    expect(events.find(event => event.kind === 'application_deadline')?.type).toBe('milestone');
    expect(new Date(events.find(event => event.kind === 'generic_missing')!.targetTimeMs).getDate()).toBe(13);
    expect(new Date(events.find(event => event.kind === 'recommendation')!.targetTimeMs).getDate()).toBe(4);
  });

  it('restores a dismissed event when its database signature changes', () => {
    const event = buildDerivedCalendarEvents([baseStudent], [{ id: 'season', name: '申请季' }], {})[0];
    expect(isCalendarEventDismissed(event, { [event.id]: event.sourceSignature })).toBe(true);
    expect(isCalendarEventDismissed({ ...event, sourceSignature: 'changed' }, { [event.id]: event.sourceSignature })).toBe(false);
  });

  it('keeps completed material reminders available so a second click can restore the exact checklist', () => {
    const completedStudent = structuredClone(baseStudent);
    completedStudent.docs.info[0].checked = true;
    completedStudent.docs.academic[0].checked = true;
    completedStudent.applications[0].specificDocs[0].checked = true;
    const completed = {
      's1-generic-missing': { timestamp: 1 },
      's1-a1-specific-missing': { timestamp: 1 },
    };
    const backups = {
      's1-generic-missing': { docs: baseStudent.docs },
      's1-a1-specific-missing': { specificDocs: baseStudent.applications[0].specificDocs },
    };

    const events = buildDerivedCalendarEvents(
      [completedStudent],
      [{ id: 'season', name: '申请季' }],
      { deadlineCritical: 7 },
      {},
      completed,
      backups,
    );

    expect(events.find(event => event.id === 's1-generic-missing')?.missingDocLabels).toEqual(['信息表', '成绩单']);
    expect(events.find(event => event.id === 's1-a1-specific-missing')?.missingDocLabels).toEqual(['作品集']);
  });

  it('moves preset documents across categories and preserves order', () => {
    const presets = [{ id: 'p', docs: { basic: [{ id: 'a' }, { id: 'b' }], academic: [{ id: 'c' }] } }];
    const moved = movePresetDocument(presets, 'p', 'basic', 'academic', 'b', 'c');
    expect(moved[0].docs.basic.map((doc: any) => doc.id)).toEqual(['a']);
    expect(moved[0].docs.academic.map((doc: any) => doc.id)).toEqual(['b', 'c']);
  });

  it('smart merges only missing labels without changing existing completion state', () => {
    const current = { basic: [{ id: 'old', label: '护照', checked: true }] };
    const preset = { basic: [{ id: 'p1', label: '护照', checked: false }, { id: 'p2', label: '照片', checked: false }] };
    const merged = smartMergePresetDocs(current, preset);
    expect(merged.basic).toHaveLength(2);
    expect(merged.basic[0]).toEqual(current.basic[0]);
    expect(merged.basic[1].label).toBe('照片');
  });
});
