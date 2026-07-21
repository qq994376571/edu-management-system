import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import App from '../App';

describe('Challenger 2: Empirical Verification Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).mockElectronState.reset();
  });

  it.skip('Verify: Cascade deletion removes all student objects with matching seasonId from the state', async () => {
    // 1. Setup mock data in stored path
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active_1', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' },
        { id: 'season_archived_2', name: '2026-2027 Archived Season', start: '2026-09-01', end: '2027-09-30', isArchived: true }
      ],
      students: [
        { id: 'STU_1', name: 'Active Student', seasonId: 'season_active_1', applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] } },
        { id: 'STU_2', name: 'Archived Student', seasonId: 'season_archived_2', applications: [], recommenders: [], docs: { basic: [], academic: [], visa: [] } }
      ],
      activeSeasonId: 'season_active_1'
    };

    (globalThis as any).mockElectronState.getFiles()['C:\\test-save-cascade'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-save-cascade');

    render(<App />);

    // Wait for the app to load and show configured state
    await screen.findByText('● 已配置');

    // Open season configuration modal
    fireEvent.click(screen.getByText('学生档案和资料'));
    fireEvent.click(screen.getByText('申请季配置'));

    // Go to Recycle Bin mode
    fireEvent.click(screen.getByText('进入已归档申请季 (回收站)'));

    // Permanently delete the archived season
    const deleteButtons = screen.getAllByTitle('永久删除');
    expect(deleteButtons.length).toBe(1);

    // Spy on window.prompt to type confirmation
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('确认删除');
    
    fireEvent.click(deleteButtons[0]);
    expect(promptSpy).toHaveBeenCalled();

    // Close modal
    fireEvent.click(screen.getByText('完成'));

    // Wait for autosave or force save
    await new Promise(r => setTimeout(r, 1500));

    // Verify the state saved back to the mock storage
    const savedData = (globalThis as any).mockElectronState.getFiles()['C:\\test-save-cascade'];
    expect(savedData).toBeDefined();
    
    // Check that seasons has only the active season
    expect(savedData.seasons.find((s: any) => s.id === 'season_archived_2')).toBeUndefined();

    // Check that students from season_archived_2 are completely deleted from state
    const remainingStudents = savedData.students;
    expect(remainingStudents.length).toBe(1);
    expect(remainingStudents[0].id).toBe('STU_1');
    expect(remainingStudents.find((s: any) => s.seasonId === 'season_archived_2')).toBeUndefined();
  });

  it('Verify: Mode switching behaves correctly: loading the app with an archived activeSeasonId automatically starts it in Recycle Bin mode', async () => {
    // 1. Setup stored data where the activeSeasonId points to an archived season
    const initialData = {
      version: 1,
      seasons: [
        { id: 'season_active_1', name: '2025-2026 Active Season', start: '2025-09-01', end: '2026-09-30' },
        { id: 'season_archived_2', name: '2026-2027 Archived Season', start: '2026-09-01', end: '2027-09-30', isArchived: true }
      ],
      students: [],
      activeSeasonId: 'season_archived_2'
    };

    (globalThis as any).mockElectronState.getFiles()['C:\\test-save-mode'] = initialData;
    (globalThis as any).mockElectronState.setStoredPath('C:\\test-save-mode');

    render(<App />);

    // Wait for the app to load and check if it starts in Recycle Bin mode
    await screen.findByText('● 已配置');

    // The Recycle Bin warning banner should be visible
    expect(screen.getByText(/您当前处于已归档申请季 \(回收站\) 视图/)).toBeInTheDocument();
  });

  it.skip('Verify: Emojis are successfully removed from all major UI sections', () => {
    const { container } = render(<App />);

    // Scan the entire rendered container text for emojis
    const textContent = container.textContent || '';
    
    // Regex for typical emojis
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
    
    const matches = textContent.match(emojiRegex);
    
    if (matches) {
      console.log('Detected emojis in UI text content:', matches);
    }
    
    // Assert that no emojis exist in the UI text
    expect(matches).toBeNull();
  });
});
