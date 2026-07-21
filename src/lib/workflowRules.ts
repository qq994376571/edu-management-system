export const TERMINAL_APPLICATION_STATUSES = new Set(['已取消', '已拒绝', '已录取']);
export const TERMINAL_STUDENT_STATUSES = new Set(['已结单', '已结案']);

export const MATERIAL_CATEGORIES = [
  'info',
  'basic',
  'academic',
  'writing',
  'visa',
  'unclassified',
] as const;

type RecordLike = Record<string, any>;

export interface DerivedCalendarEvent {
  id: string;
  kind:
    | 'application_open'
    | 'application_deadline'
    | 'generic_missing'
    | 'specific_missing'
    | 'recommendation'
    | 'note'
    | 'visa_start'
    | 'visa_end';
  type: 'milestone' | 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  targetTimeMs: number;
  sourceSignature: string;
  studentId: string;
  student: string;
  seasonName?: string;
  appId?: string;
  noteId?: string;
  recId?: string;
  rlStatus?: string;
  missingDocLabels?: string[];
  isGenericMissing?: boolean;
  targetId?: string;
  positionMode: 'database' | 'calendar';
}

export function isTerminalApplication(value: unknown): boolean {
  const status = typeof value === 'string' ? value : (value as RecordLike | null)?.status;
  return TERMINAL_APPLICATION_STATUSES.has(String(status || ''));
}

export function isTerminalStudent(value: unknown): boolean {
  const status = typeof value === 'string' ? value : (value as RecordLike | null)?.status;
  return TERMINAL_STUDENT_STATUSES.has(String(status || ''));
}

export function isArchivedStudent(value: unknown): boolean {
  const status = typeof value === 'string' ? value : (value as RecordLike | null)?.status;
  return status === '已归档';
}

export function shouldSuppressStudentWorkflow(student: RecordLike): boolean {
  return isArchivedStudent(student) || isTerminalStudent(student);
}

export function parseCalendarTime(value: unknown): number | null {
  if (!value) return null;
  const text = String(value);
  const parsed = new Date(text.includes('T') ? text : `${text}T00:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function shiftDays(timeMs: number, days: number): number {
  const result = new Date(timeMs);
  result.setDate(result.getDate() + days);
  return result.getTime();
}

function signature(parts: unknown[]): string {
  return JSON.stringify(parts);
}

function docsFor(student: RecordLike, categories: readonly string[]): RecordLike[] {
  return categories.flatMap(category => Array.isArray(student?.docs?.[category]) ? student.docs[category] : []);
}

export function buildDerivedCalendarEvents(
  students: RecordLike[],
  seasons: RecordLike[],
  alertConfig: RecordLike,
  perStudentOverrides: RecordLike = {},
  completedEvents: RecordLike = {},
  completionBackups: RecordLike = {},
): DerivedCalendarEvent[] {
  const events: DerivedCalendarEvent[] = [];
  const activeSeasonNames = new Map(
    (Array.isArray(seasons) ? seasons : [])
      .filter(season => season && !season.isArchived)
      .map(season => [season.id, season.name]),
  );

  for (const student of Array.isArray(students) ? students : []) {
    const seasonName = activeSeasonNames.get(student?.seasonId);
    if (!seasonName || shouldSuppressStudentWorkflow(student)) continue;

    const applications = Array.isArray(student.applications) ? student.applications : [];
    const studentAlertConfig = { ...alertConfig, ...(perStudentOverrides?.[student.id] || {}) };
    const activeApplications = applications.filter(app => !isTerminalApplication(app));
    const genericMissing = docsFor(student, ['info', 'basic', 'academic', 'writing'])
      .filter(doc => !doc?.checked)
      .map(doc => String(doc.label || '未命名材料'));

    let genericAnchor: { app: RecordLike; deadlineMs: number } | null = null;

    for (const app of activeApplications) {
      const appLabel = `【${app.school || '未填写学校'} - ${app.program || '未填写专业'}】`;
      const openMs = parseCalendarTime(app.openDate);
      const deadlineMs = parseCalendarTime(app.deadline);
      const base = `${student.id}-${app.id}`;

      if (openMs !== null) {
        events.push({
          id: `${base}-open`, kind: 'application_open', type: 'milestone',
          title: `${appLabel}申请开放`, message: '点击后将该专业标记为“已递交”；拖动会同步修改数据库开放日期。',
          targetTimeMs: openMs, sourceSignature: signature([app.openDate]),
          studentId: student.id, student: student.name, seasonName, appId: app.id,
          targetId: `app-card-${app.id}`, positionMode: 'database',
        });
      }

      if (deadlineMs !== null) {
        events.push({
          id: `${base}-deadline`, kind: 'application_deadline', type: 'milestone',
          title: `${appLabel}申请截止`, message: '点击后将该专业标记为“已递交”；拖动会同步修改数据库截止日期。',
          targetTimeMs: deadlineMs, sourceSignature: signature([app.deadline]),
          studentId: student.id, student: student.name, seasonName, appId: app.id,
          targetId: `app-card-${app.id}`, positionMode: 'database',
        });
        if (!genericAnchor || deadlineMs < genericAnchor.deadlineMs) genericAnchor = { app, deadlineMs };

        const specificEventId = `${base}-specific-missing`;
        const specificMissing = (Array.isArray(app.specificDocs) ? app.specificDocs : [])
          .filter((doc: RecordLike) => !doc?.checked)
          .map((doc: RecordLike) => String(doc.label || '未命名材料'));
        const priorSpecificMissing = (completionBackups?.[specificEventId]?.specificDocs || [])
          .filter((doc: RecordLike) => !doc?.checked)
          .map((doc: RecordLike) => String(doc.label || '未命名材料'));
        const displayedSpecificMissing = specificMissing.length > 0 ? specificMissing : priorSpecificMissing;
        if (specificMissing.length > 0 || completedEvents?.[specificEventId]) {
          const leadDays = Number(studentAlertConfig?.deadlineCritical ?? 7);
          const reminderMs = shiftDays(deadlineMs, -leadDays);
          events.push({
            id: specificEventId, kind: 'specific_missing', type: 'critical',
            title: `${appLabel}专属材料未齐`, message: displayedSpecificMissing.length > 0 ? `缺少：${displayedSpecificMissing.join('、')}` : '已通过日历标记完成',
            targetTimeMs: reminderMs,
            sourceSignature: signature([app.deadline, leadDays, specificMissing]),
            studentId: student.id, student: student.name, seasonName, appId: app.id,
            missingDocLabels: displayedSpecificMissing, targetId: `app-card-${app.id}`, positionMode: 'calendar',
          });
        }
      }

      for (const note of Array.isArray(app.notes) ? app.notes : []) {
        const noteMs = parseCalendarTime(note.deadline);
        if (noteMs === null) continue;
        events.push({
          id: `${base}-note-${note.id}`, kind: 'note', type: 'warning',
          title: `备注：${note.text || '未填写内容'}`, message: `${appLabel}备注截止时间`,
          targetTimeMs: noteMs, sourceSignature: signature([note.deadline]),
          studentId: student.id, student: student.name, seasonName, appId: app.id, noteId: note.id,
          targetId: `app-card-${app.id}`, positionMode: 'database',
        });
      }

      for (const [recId, recData] of Object.entries(app.recommendations || {})) {
        const recommendation = recData as RecordLike;
        if (!['pending', 'sent', 'completed'].includes(recommendation.status)) continue;
        const deadline = parseCalendarTime(recommendation.deadline || app.deadline);
        if (deadline === null) continue;
        const leadDays = Number(studentAlertConfig?.rlWarning ?? 14);
        const reminderMs = shiftDays(deadline, -leadDays);
        const recommender = (student.recommenders || []).find((item: RecordLike) => item.id === recId);
        events.push({
          id: `${base}-rl-${recId}`, kind: 'recommendation', type: 'warning',
          title: `${appLabel}推荐信：${recommender?.name || '未命名推荐人'}`,
          message: `推荐信截止日前 ${leadDays} 天提醒；拖动会同步调整数据库中的推荐信截止日。`,
          targetTimeMs: reminderMs,
          sourceSignature: signature([recommendation.deadline || app.deadline, leadDays]),
          studentId: student.id, student: student.name, seasonName, appId: app.id, recId,
          rlStatus: recommendation.status, targetId: 'recommender-matrix-section', positionMode: 'database',
        });
      }
    }

    const genericEventId = `${student.id}-generic-missing`;
    const priorGenericMissing = Object.values(completionBackups?.[genericEventId]?.docs || {})
      .flatMap((docs: any) => Array.isArray(docs) ? docs : [])
      .filter((doc: RecordLike) => !doc?.checked)
      .map((doc: RecordLike) => String(doc.label || '未命名材料'));
    const displayedGenericMissing = genericMissing.length > 0 ? genericMissing : priorGenericMissing;
    if ((genericMissing.length > 0 || completedEvents?.[genericEventId]) && genericAnchor) {
      const leadDays = Number(studentAlertConfig?.deadlineCritical ?? 7);
      events.push({
        id: genericEventId, kind: 'generic_missing', type: 'critical',
        title: '通用申请材料缺漏', message: displayedGenericMissing.length > 0 ? `缺少：${displayedGenericMissing.join('、')}` : '已通过日历标记完成',
        targetTimeMs: shiftDays(genericAnchor.deadlineMs, -leadDays),
        sourceSignature: signature([genericAnchor.app.id, genericAnchor.app.deadline, leadDays, genericMissing]),
        studentId: student.id, student: student.name, seasonName, appId: genericAnchor.app.id,
        missingDocLabels: displayedGenericMissing, isGenericMissing: true,
        targetId: 'generic-docs-section', positionMode: 'calendar',
      });
    }

    const visaStart = parseCalendarTime(student?.visaWindow?.[0]);
    const visaEnd = parseCalendarTime(student?.visaWindow?.[1]);
    if (visaStart !== null) {
      events.push({
        id: `${student.id}-visa-start`, kind: 'visa_start', type: 'info', title: '签证窗口开启',
        message: '拖动会同步修改数据库中的签证窗口开始时间。', targetTimeMs: visaStart,
        sourceSignature: signature([student.visaWindow?.[0]]), studentId: student.id, student: student.name,
        seasonName, targetId: 'visa-docs-section', positionMode: 'database',
      });
    }
    if (visaEnd !== null) {
      events.push({
        id: `${student.id}-visa-end`, kind: 'visa_end', type: 'warning', title: '签证窗口关闭',
        message: '拖动会同步修改数据库中的签证窗口结束时间。', targetTimeMs: visaEnd,
        sourceSignature: signature([student.visaWindow?.[1]]), studentId: student.id, student: student.name,
        seasonName, targetId: 'visa-docs-section', positionMode: 'database',
      });
    }
  }

  return events.sort((left, right) => left.targetTimeMs - right.targetTimeMs || left.id.localeCompare(right.id));
}

export function isCalendarEventDismissed(
  event: Pick<DerivedCalendarEvent, 'id' | 'sourceSignature'>,
  dismissed: Record<string, string> | null | undefined,
): boolean {
  return dismissed?.[event.id] === event.sourceSignature;
}

export function movePresetDocument(
  presets: RecordLike[],
  presetId: string,
  fromCategory: string,
  toCategory: string,
  sourceDocId: string,
  targetDocId?: string,
): RecordLike[] {
  return presets.map(preset => {
    if (preset.id !== presetId) return preset;
    const source = [...(preset.docs?.[fromCategory] || [])];
    const sourceIndex = source.findIndex(doc => doc.id === sourceDocId);
    if (sourceIndex < 0) return preset;
    const [moved] = source.splice(sourceIndex, 1);
    const destination = fromCategory === toCategory ? source : [...(preset.docs?.[toCategory] || [])];
    const targetIndex = targetDocId ? destination.findIndex(doc => doc.id === targetDocId) : -1;
    destination.splice(targetIndex < 0 ? destination.length : targetIndex, 0, moved);
    return {
      ...preset,
      docs: {
        ...preset.docs,
        [fromCategory]: fromCategory === toCategory ? destination : source,
        [toCategory]: destination,
      },
    };
  });
}

export function smartMergePresetDocs(currentDocs: RecordLike, presetDocs: RecordLike): RecordLike {
  const merged: RecordLike = { ...currentDocs };
  for (const category of MATERIAL_CATEGORIES) {
    const current = Array.isArray(currentDocs?.[category]) ? currentDocs[category] : [];
    const additions = Array.isArray(presetDocs?.[category]) ? presetDocs[category] : [];
    const labels = new Set(current.map((doc: RecordLike) => String(doc.label || '').trim()));
    merged[category] = [
      ...current,
      ...additions
        .filter((doc: RecordLike) => !labels.has(String(doc.label || '').trim()))
        .map((doc: RecordLike, index: number) => ({
          ...doc,
          id: `D${Date.now()}_${category}_${index}_${Math.random().toString(36).slice(2, 8)}`,
          checked: false,
        })),
    ];
  }
  return merged;
}
