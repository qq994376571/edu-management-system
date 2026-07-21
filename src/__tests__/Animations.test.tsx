import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import App from '../App';
import ParticleBackground from '../components/ParticleBackground';
import CursorTrail from '../components/CursorTrail';

describe('Animations and Aesthetics', () => {
  beforeAll(() => {
    // Mock canvas context
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      createRadialGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
    } as unknown as CanvasRenderingContext2D);
    
    // Mock requestAnimationFrame
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => setTimeout(cb, 16)));
    vi.stubGlobal('cancelAnimationFrame', vi.fn(clearTimeout));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('TC-Anim-1: ParticleBackground should be mounted and render a canvas', () => {
    const { container } = render(<ParticleBackground />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveClass('fixed', 'inset-0', 'pointer-events-none');
    expect(canvas?.style.opacity).toBe('0.4');
  });

  it('TC-Anim-2: App should mount CursorTrail container and render canvas', () => {
    const { container, queryByTestId } = render(<App />);
    
    // Verify CursorTrail container is mounted
    const cursorTrailContainer = queryByTestId('cursor-trail-container');
    expect(cursorTrailContainer).toBeInTheDocument();

    // Canvas should be rendered inside App (part of CursorTrail)
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('TC-Anim-3: Main element should have solid background to prevent layering performance drops', () => {
    const { container } = render(<App />);
    const main = container.querySelector('main');
    expect(main).toHaveClass('bg-[#F3EFE6]');
    expect(main).not.toHaveClass('bg-transparent');
  });

  it('TC-Anim-4: CursorTrail supports and renders different modes', () => {
    const configNebula = {
      enabled: true,
      type: 'nebula' as const,
      count: 20,
      sizeScale: 1.5,
      speedScale: 1.0,
      attraction: 1.0,
      lineDist: 100,
      linesEnabled: false,
      theme: 'blue' as const,
    };
    const { container: containerNebula } = render(<CursorTrail config={configNebula} />);
    expect(containerNebula.querySelector('canvas')).toBeInTheDocument();

    const configMatrix = {
      enabled: true,
      type: 'matrix' as const,
      count: 20,
      sizeScale: 1.0,
      speedScale: 1.0,
      attraction: 1.0,
      lineDist: 100,
      linesEnabled: false,
      theme: 'green' as const,
    };
    const { container: containerMatrix } = render(<CursorTrail config={configMatrix} />);
    expect(containerMatrix.querySelector('canvas')).toBeInTheDocument();

    const configEndfield = {
      enabled: true,
      type: 'endfield' as const,
      count: 20,
      sizeScale: 1.0,
      speedScale: 1.0,
      attraction: 1.0,
      lineDist: 100,
      linesEnabled: false,
      theme: 'orange' as const,
    };
    const { container: containerEndfield } = render(<CursorTrail config={configEndfield} />);
    expect(containerEndfield.querySelector('canvas')).toBeInTheDocument();
  });

  it('TC-Anim-5: Sidebar has button to open custom effects settings modal', () => {
    const { container, getByText, queryByText } = render(<App />);
    
    // Settings modal should initially be closed
    expect(queryByText('视觉动态系统配置')).not.toBeInTheDocument();

    // Find and click the settings button
    const settingsBtn = getByText('视觉特效设置');
    expect(settingsBtn).toBeInTheDocument();
    
    // Simulate open
    fireEvent.click(settingsBtn);
    expect(getByText('视觉动态系统配置')).toBeInTheDocument();
  });
});
