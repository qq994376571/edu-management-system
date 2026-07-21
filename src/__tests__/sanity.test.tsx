import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import App from '../App';

describe('Sanity Check', () => {
  it('renders App without crashing', () => {
    render(<App />);
    expect(screen.getAllByText(/演示模式/)[0]).toBeInTheDocument();
  });
});
