import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpButton, HelpDialog } from '../App';

const HelpExample = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HelpButton onClick={() => setOpen(true)} label="查看签证窗口说明" />
      <HelpDialog open={open} onClose={() => setOpen(false)} title="签证窗口说明">
        <p>这段辅助说明只应在用户主动查看时出现。</p>
      </HelpDialog>
    </>
  );
};

describe('compact help disclosure', () => {
  it('keeps explanatory copy hidden behind an accessible question button', () => {
    render(<HelpExample />);

    expect(screen.queryByText('这段辅助说明只应在用户主动查看时出现。')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看签证窗口说明' }));

    const dialog = screen.getByRole('dialog', { name: '签证窗口说明' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('这段辅助说明只应在用户主动查看时出现。')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '关闭签证窗口说明' }));
    expect(screen.queryByRole('dialog', { name: '签证窗口说明' })).not.toBeInTheDocument();
  });
});
