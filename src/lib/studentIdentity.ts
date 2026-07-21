export interface StudentStageLike {
  precedingStage?: unknown;
  applicationStage?: unknown;
  type?: unknown;
  background?: Record<string, unknown> | null;
}

export interface StudentStageParts {
  source: string;
  target: string;
}

const TYPE_STAGE_PATHS: Record<string, StudentStageParts> = {
  本升硕: { source: '本科', target: '硕士' },
  硕升博: { source: '硕士', target: '博士' },
  本升博: { source: '本科', target: '博士' },
  高升本: { source: '高中', target: '本科' },
  高中升本科: { source: '高中', target: '本科' },
  专升本: { source: '专科', target: '本科' },
};

const clean = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

/**
 * Historical builds stored either a single stage ("硕士") or a complete path
 * ("本科→硕士") in the target-stage field.  Split both shapes here so no UI
 * ever concatenates a complete path for a second time.
 */
export function splitStagePath(value: unknown): string[] {
  const text = clean(value);
  if (!text) return [];
  const pieces = text
    .split(/\s*(?:→|➜|⇒|->|—>|至)\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);

  return pieces.filter((item, index) => index === 0 || item !== pieces[index - 1]);
}

export function studentStageParts(student: StudentStageLike | null | undefined): StudentStageParts {
  if (!student) return { source: '', target: '' };

  const background = student.background && typeof student.background === 'object'
    ? student.background
    : {};
  const sourcePath = splitStagePath(clean(student.precedingStage) ? student.precedingStage : background.precedingStage);
  const targetPath = splitStagePath(clean(student.applicationStage) ? student.applicationStage : background.applicationStage);
  const typePath = TYPE_STAGE_PATHS[clean(student.type)] || { source: '', target: '' };

  let source = sourcePath[0] || '';
  let target = '';

  if (targetPath.length > 1) {
    source ||= targetPath[0];
    target = targetPath[targetPath.length - 1];
  } else if (targetPath.length === 1) {
    target = targetPath[0];
  }

  // A few very old records put the complete path in precedingStage instead.
  if (sourcePath.length > 1) {
    source = sourcePath[0];
    target ||= sourcePath[sourcePath.length - 1];
  }

  source ||= typePath.source;
  target ||= typePath.target;
  return { source, target };
}

export function formatStudentStagePath(
  student: StudentStageLike | null | undefined,
  fallback = '未填写',
  separator = ' → ',
): string {
  const { source, target } = studentStageParts(student);
  if (source && target) return `${source}${separator}${target}`;
  return source || target || fallback;
}

export function inferStudentType(sourceValue: unknown, targetValue: unknown, fallback = '其他'): string {
  const source = splitStagePath(sourceValue)[0] || '';
  const targetPath = splitStagePath(targetValue);
  const target = targetPath[targetPath.length - 1] || '';
  const key = `${source}\u0000${target}`;
  const mapped: Record<string, string> = {
    '本科\u0000硕士': '本升硕',
    '硕士\u0000博士': '硕升博',
    '本科\u0000博士': '本升博',
    '高中\u0000本科': '高升本',
    '专科\u0000本科': '专升本',
  };
  return mapped[key] || fallback;
}
