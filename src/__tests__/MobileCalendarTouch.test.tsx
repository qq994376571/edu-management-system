import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileLongPressDraggable } from '../App';

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'touch';
    this.isPrimary = init.isPrimary ?? true;
  }
}

const touch = (overrides: Partial<PointerEventInit> = {}): PointerEventInit => ({
  pointerId: 7,
  pointerType: 'touch',
  isPrimary: true,
  bubbles: true,
  buttons: 1,
  clientX: 20,
  clientY: 20,
  ...overrides,
});

const mouse = (overrides: Partial<PointerEventInit> = {}): PointerEventInit => ({
  pointerId: 11,
  pointerType: 'mouse',
  isPrimary: true,
  bubbles: true,
  button: 0,
  buttons: 1,
  clientX: 20,
  clientY: 20,
  ...overrides,
});

describe('手机日历长按与拖动手势', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'PointerEvent', { value: TestPointerEvent, configurable: true });
    Object.defineProperty(globalThis, 'PointerEvent', { value: TestPointerEvent, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('长按 0.5 秒但不移动时打开详情而不改日期', () => {
    const onLongPress = vi.fn();
    const onDropDate = vi.fn();
    render(<MobileLongPressDraggable label="测试气泡" sourceDate="2026-07-18" onLongPress={onLongPress} onDropDate={onDropDate}><div>测试气泡</div></MobileLongPressDraggable>);
    const bubble = screen.getByText('测试气泡');
    expect(bubble.closest('[data-page-swipe-ignore="true"]')).toBeInTheDocument();

    fireEvent.pointerDown(bubble, touch());
    act(() => vi.advanceTimersByTime(499));
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    fireEvent.pointerUp(bubble, touch({ buttons: 0 }));

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onDropDate).not.toHaveBeenCalled();
  });

  it('普通单指滑动在 0.5 秒内移动时不会误触详情或拖动', () => {
    const onLongPress = vi.fn();
    const onDropDate = vi.fn();
    render(<MobileLongPressDraggable label="可滚动气泡" sourceDate="2026-07-18" onLongPress={onLongPress} onDropDate={onDropDate}><div>可滚动气泡</div></MobileLongPressDraggable>);
    const bubble = screen.getByText('可滚动气泡');

    fireEvent.pointerDown(bubble, touch());
    act(() => vi.advanceTimersByTime(250));
    fireEvent.pointerMove(bubble, touch({ clientY: 70 }));
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(bubble, touch({ clientY: 70, buttons: 0 }));

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onDropDate).not.toHaveBeenCalled();
  });

  it('长按后拖到指定日期只触发改期', () => {
    const onLongPress = vi.fn();
    const onDropDate = vi.fn();
    render(<><MobileLongPressDraggable label="待拖气泡" sourceDate="2026-07-18" onLongPress={onLongPress} onDropDate={onDropDate}><div>待拖气泡</div></MobileLongPressDraggable><div data-mobile-drop-date="2026-07-21">周二目标</div></>);
    const bubble = screen.getByText('待拖气泡');
    const target = screen.getByText('周二目标');
    Object.defineProperty(document, 'elementFromPoint', { value: vi.fn(() => target), configurable: true });

    fireEvent.pointerDown(bubble, touch());
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerMove(bubble, touch({ clientX: 60, clientY: 65 }));
    fireEvent.pointerUp(bubble, touch({ clientX: 60, clientY: 65, buttons: 0 }));

    expect(onDropDate).toHaveBeenCalledWith('2026-07-21');
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('长按后拖到跨周框按同一星期移动七天', () => {
    const onDropDate = vi.fn();
    render(<MobileLongPressDraggable label="跨周气泡" sourceDate="2026-07-18" crossWeekShift={7} onDropDate={onDropDate}><div>跨周气泡</div></MobileLongPressDraggable>);
    const bubble = screen.getByText('跨周气泡');
    Object.defineProperty(document, 'elementFromPoint', { value: vi.fn(() => document.querySelector('[data-mobile-drop-shift="7"]')), configurable: true });

    fireEvent.pointerDown(bubble, touch());
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerMove(bubble, touch({ clientX: 75, clientY: 75 }));
    expect(screen.getByText('移到下周')).toBeInTheDocument();
    fireEvent.pointerUp(bubble, touch({ clientX: 75, clientY: 75, buttons: 0 }));

    expect(onDropDate).toHaveBeenCalledWith('2026-07-25');
  });

  it('材料等通用项目可用同一长按手势拖到分类目标', () => {
    const onDropTarget = vi.fn();
    render(<><MobileLongPressDraggable label="成绩单" dropSelector="[data-mobile-material-category]" onDropTarget={onDropTarget}><div>成绩单</div></MobileLongPressDraggable><div data-mobile-material-category="academic">学术材料</div></>);
    const source = screen.getByText('成绩单');
    const target = screen.getByText('学术材料');
    Object.defineProperty(document, 'elementFromPoint', { value: vi.fn(() => target), configurable: true });

    fireEvent.pointerDown(source, touch());
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerMove(source, touch({ clientX: 80, clientY: 80 }));
    fireEvent.pointerUp(source, touch({ clientX: 80, clientY: 80, buttons: 0 }));

    expect(onDropTarget).toHaveBeenCalledWith(target);
  });

  it('a mouse tap mirrors a finger tap and does not open or move the bubble', () => {
    const onLongPress = vi.fn();
    const onDropDate = vi.fn();
    render(<MobileLongPressDraggable label="Mouse bubble" sourceDate="2026-07-18" onLongPress={onLongPress} onDropDate={onDropDate}><div>Mouse bubble</div></MobileLongPressDraggable>);
    const bubble = screen.getByText('Mouse bubble');

    fireEvent.pointerDown(bubble, mouse());
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerUp(bubble, mouse({ buttons: 0 }));

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onDropDate).not.toHaveBeenCalled();
  });

  it('holding the primary mouse button for half a second opens details', () => {
    const onLongPress = vi.fn();
    render(<MobileLongPressDraggable label="Mouse hold" onLongPress={onLongPress}><div>Mouse hold</div></MobileLongPressDraggable>);
    const bubble = screen.getByText('Mouse hold');

    fireEvent.pointerDown(bubble, mouse());
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(bubble, mouse({ buttons: 0 }));

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('holding then dragging with a mouse changes the date', () => {
    const onLongPress = vi.fn();
    const onDropDate = vi.fn();
    render(<><MobileLongPressDraggable label="Mouse drag" sourceDate="2026-07-18" onLongPress={onLongPress} onDropDate={onDropDate}><div>Mouse drag</div></MobileLongPressDraggable><div data-mobile-drop-date="2026-07-22">Mouse date target</div></>);
    const bubble = screen.getByText('Mouse drag');
    const target = screen.getByText('Mouse date target');
    Object.defineProperty(document, 'elementFromPoint', { value: vi.fn(() => target), configurable: true });

    fireEvent.pointerDown(bubble, mouse());
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerMove(bubble, mouse({ clientX: 80, clientY: 80 }));
    fireEvent.pointerUp(bubble, mouse({ clientX: 80, clientY: 80, buttons: 0 }));

    expect(onDropDate).toHaveBeenCalledWith('2026-07-22');
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('a normal held mouse drag works without waiting for the touch delay', () => {
    const onDropDate = vi.fn();
    render(<><MobileLongPressDraggable label="Immediate mouse drag" sourceDate="2026-07-18" onDropDate={onDropDate}><div>Immediate mouse drag</div></MobileLongPressDraggable><div data-mobile-drop-date="2026-07-20">Immediate target</div></>);
    const bubble = screen.getByText('Immediate mouse drag');
    const target = screen.getByText('Immediate target');
    Object.defineProperty(document, 'elementFromPoint', { value: vi.fn(() => target), configurable: true });

    fireEvent.pointerDown(bubble, mouse());
    fireEvent.pointerMove(bubble, mouse({ clientX: 70, clientY: 70 }));
    fireEvent.pointerUp(bubble, mouse({ clientX: 70, clientY: 70, buttons: 0 }));

    expect(onDropDate).toHaveBeenCalledWith('2026-07-20');
  });

  it('a cancelled pointer never opens details or changes business data', () => {
    const onLongPress = vi.fn();
    const onDropDate = vi.fn();
    render(<MobileLongPressDraggable label="Cancelled bubble" sourceDate="2026-07-18" onLongPress={onLongPress} onDropDate={onDropDate}><div>Cancelled bubble</div></MobileLongPressDraggable>);
    const bubble = screen.getByText('Cancelled bubble');

    fireEvent.pointerDown(bubble, touch());
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerCancel(bubble, touch({ buttons: 0 }));

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onDropDate).not.toHaveBeenCalled();
  });

  it('the full-height right screen edge moves a bubble across weeks', () => {
    const onDropDate = vi.fn();
    render(<MobileLongPressDraggable label="Edge bubble" sourceDate="2026-07-18" crossWeekShift={7} onDropDate={onDropDate}><div>Edge bubble</div></MobileLongPressDraggable>);
    const bubble = screen.getByText('Edge bubble');
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(document, 'elementFromPoint', { value: vi.fn(() => null), configurable: true });

    fireEvent.pointerDown(bubble, mouse());
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerMove(bubble, mouse({ clientX: 388, clientY: 5 }));
    fireEvent.pointerUp(bubble, mouse({ clientX: 388, clientY: 5, buttons: 0 }));

    expect(onDropDate).toHaveBeenCalledWith('2026-07-25');
  });
});
