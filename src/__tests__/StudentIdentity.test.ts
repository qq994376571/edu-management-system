import { describe, expect, it } from 'vitest';
import {
  formatStudentStagePath,
  inferStudentType,
  splitStagePath,
  studentStageParts,
} from '../lib/studentIdentity';

describe('student stage identity compatibility', () => {
  it('does not concatenate a legacy full target path twice', () => {
    const student = {
      precedingStage: '本科',
      applicationStage: '本科→硕士',
      type: '本升硕',
    };
    expect(studentStageParts(student)).toEqual({ source: '本科', target: '硕士' });
    expect(formatStudentStagePath(student)).toBe('本科 → 硕士');
  });

  it('repairs already repeated paths and accepts current single target stages', () => {
    expect(formatStudentStagePath({ precedingStage: '本科', applicationStage: '本科→本科→硕士' }))
      .toBe('本科 → 硕士');
    expect(formatStudentStagePath({ precedingStage: '高中', applicationStage: '本科' }))
      .toBe('高中 → 本科');
    expect(splitStagePath('硕士 -> 博士')).toEqual(['硕士', '博士']);
  });

  it('falls back to historical type codes and infers new storage codes', () => {
    expect(studentStageParts({ type: '专升本' })).toEqual({ source: '专科', target: '本科' });
    expect(inferStudentType('本科', '硕士')).toBe('本升硕');
    expect(inferStudentType('高中', '本科')).toBe('高升本');
  });
});
