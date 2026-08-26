import { describe, expect, it } from 'vitest';
import { operationsAtlasColors, priorityTone, statusTone } from './tokens';

describe('Operations Atlas tokens', () => {
  it('publishes approved colors and semantic task tones', () => {
    expect(operationsAtlasColors).toEqual({
      canopy: '#0D3B2A',
      current: '#147A50',
      fieldNote: '#B7D96B',
      signalCoral: '#D85F5F',
      mist: '#DDE5E0',
      paper: '#F3F5F3',
      ink: '#181C1A',
    });
    expect(statusTone).toEqual({
      todo: 'neutral',
      in_progress: 'info',
      completed: 'positive',
      blocked: 'danger',
    });
    expect(priorityTone).toEqual({
      low: 'neutral',
      medium: 'info',
      high: 'warning',
      critical: 'danger',
    });
  });
});
