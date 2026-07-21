/**
 * Small, side-effect-free guards for account data loading and destructive
 * import operations.  Keeping these decisions outside the React component
 * makes the "empty cloud metadata" case explicit and testable.
 */

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordLike
    : null;
}

export function studentCount(value: unknown): number {
  const data = asRecord(value);
  return Array.isArray(data?.students) ? data.students.length : 0;
}

export function cloudStudentCount(value: unknown): number {
  const data = asRecord(value);
  return Array.isArray(data?.students) ? data.students.length : 0;
}

export function cloudHasArchivedSeasons(value: unknown): boolean {
  const data = asRecord(value);
  if (!Array.isArray(data?.seasons)) return false;
  return data.seasons.some((raw) => {
    const season = asRecord(raw);
    if (!season) return false;
    if (season.is_archived === true || season.isArchived === true) return true;
    try {
      const parsed = typeof season.data_json === 'string' ? JSON.parse(season.data_json) : season.data_json;
      return asRecord(parsed)?.isArchived === true;
    } catch {
      return false;
    }
  });
}

/**
 * A server can legitimately contain settings and default seasons before a
 * student's first successful sync.  Those records must never be allowed to
 * erase a non-empty account-local snapshot.
 */
export function shouldRestoreLocalStudents(localData: unknown, cloudData: unknown): boolean {
  // init_load deliberately omits students that belong to archived seasons.
  // Their absence is therefore not evidence of an empty cloud account and
  // must not cause an older local snapshot to replace the cloud metadata.
  return studentCount(localData) > 0
    && cloudStudentCount(cloudData) === 0
    && !cloudHasArchivedSeasons(cloudData);
}

export function cloudHasAnyData(value: unknown): boolean {
  const data = asRecord(value);
  if (!data) return false;
  return cloudStudentCount(data) > 0
    || (Array.isArray(data.seasons) && data.seasons.length > 0)
    || Boolean(data.settings)
    || Boolean(data.calendar);
}

/** A force-import must at least have the two arrays used by the data schema. */
export function validateImportData(value: unknown): { valid: boolean; studentCount: number; seasonCount: number } {
  const data = asRecord(value);
  const students = data?.students;
  const seasons = data?.seasons;
  const valid = Array.isArray(students) && Array.isArray(seasons);
  return {
    valid,
    studentCount: Array.isArray(students) ? students.length : 0,
    seasonCount: Array.isArray(seasons) ? seasons.length : 0,
  };
}
