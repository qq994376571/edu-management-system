import { describe, expect, it } from 'vitest';
import { cloudHasAnyData, cloudHasArchivedSeasons, shouldRestoreLocalStudents, validateImportData } from '../lib/dataSafety';

describe('account data safety', () => {
  it('keeps a non-empty local snapshot when cloud only has default metadata', () => {
    const local = { students: [{ id: 'STU001', name: '新学生' }], seasons: [{ id: 'season_1' }] };
    const cloud = { students: [], seasons: [{ season_id: 'season_1' }], settings: '{}' };

    expect(cloudHasAnyData(cloud)).toBe(true);
    expect(shouldRestoreLocalStudents(local, cloud)).toBe(true);
  });

  it('uses cloud once it contains a student record', () => {
    const local = { students: [{ id: 'STU001' }] };
    const cloud = { students: [{ student_id: 'STU002', data_json: '{}' }], seasons: [] };

    expect(shouldRestoreLocalStudents(local, cloud)).toBe(false);
  });

  it('treats archived-season metadata as a cold cloud snapshot, not an empty account', () => {
    const local = { students: [{ id: 'LOCAL_OLD' }], seasons: [{ id: 'archive_1', isArchived: true }] };
    const cloud = {
      students: [],
      seasons: [{ season_id: 'archive_1', is_archived: true, data_json: JSON.stringify({ id: 'archive_1', isArchived: true }) }],
      settings: JSON.stringify({ activeSeasonId: 'archive_1' }),
    };

    expect(cloudHasArchivedSeasons(cloud)).toBe(true);
    expect(shouldRestoreLocalStudents(local, cloud)).toBe(false);
  });

  it('rejects schema-less and empty force-import files before they can wipe data', () => {
    expect(validateImportData({ students: [{ id: 'STU001' }], seasons: [] })).toEqual({ valid: true, studentCount: 1, seasonCount: 0 });
    expect(validateImportData({ students: [] })).toEqual({ valid: false, studentCount: 0, seasonCount: 0 });
  });
});
