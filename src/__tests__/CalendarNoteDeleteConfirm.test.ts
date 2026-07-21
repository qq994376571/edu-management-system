import { describe, expect, it, vi } from 'vitest';
import { createCalendarNoteDeleteConfirmation } from '../App';

describe('calendar note deletion confirmation', () => {
  it('does not delete before the second confirmation and identifies the note', () => {
    const remove = vi.fn();
    const confirmation = createCalendarNoteDeleteConfirmation({ id: 'note-1', text: '补材料' }, remove);

    expect(remove).not.toHaveBeenCalled();
    expect(confirmation.dangerous).toBe(true);
    expect(confirmation.confirmLabel).toBe('删除备注');
    expect(confirmation.message).toContain('补材料');

    confirmation.onConfirm();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
