import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineDateInput } from '../App';

describe('Safari-safe optional reminder time', () => {
  it('shows no empty native datetime box and never saves a cancelled draft', () => {
    const onSave = vi.fn();
    const { container } = render(<InlineDateInput initialValue="" onSave={onSave} optional ariaLabel="材料备注时间" />);

    expect(screen.getByRole('button', { name: '设置提醒时间' })).toBeVisible();
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.queryByRole('dialog', { name: '设置材料备注时间' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '设置提醒时间' }));
    const dialog = screen.getByRole('dialog', { name: '设置材料备注时间' });
    const date = within(dialog).getByLabelText('材料备注时间日期');
    const time = within(dialog).getByLabelText('材料备注时间时刻');
    expect(date).toHaveValue('');
    expect(time).toHaveValue('');

    // Even if Safari provisionally chooses a value, Cancel must discard it.
    fireEvent.change(date, { target: { value: '2026-07-22' } });
    fireEvent.change(time, { target: { value: '15:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '设置提醒时间' })).toBeVisible();

    // Clicking the backdrop is another non-destructive cancel path.
    fireEvent.click(screen.getByRole('button', { name: '设置提醒时间' }));
    const reopened = screen.getByRole('dialog', { name: '设置材料备注时间' });
    fireEvent.mouseDown(reopened.parentElement as HTMLElement);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('writes only after explicit confirmation and clears only through the explicit clear button', () => {
    const onSave = vi.fn();
    render(<InlineDateInput initialValue="" onSave={onSave} optional ariaLabel="备注时间" />);

    fireEvent.click(screen.getByRole('button', { name: '设置提醒时间' }));
    const dialog = screen.getByRole('dialog', { name: '设置备注时间' });
    fireEvent.change(within(dialog).getByLabelText('备注时间日期'), { target: { value: '2026-07-22' } });
    fireEvent.change(within(dialog).getByLabelText('备注时间时刻'), { target: { value: '15:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '确定' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('2026-07-22T15:00');
    expect(screen.getByRole('button', { name: '备注时间：2026/07/22 15:00' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '清除备注时间' }));
    expect(onSave).toHaveBeenLastCalledWith('');
    expect(screen.getByRole('button', { name: '设置提醒时间' })).toBeVisible();
  });
});
