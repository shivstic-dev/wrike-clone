import { describe, expect, it } from 'vitest';
import { operationsAtlasColors, priorityTone, statusTone } from './tokens';

describe('Operations Atlas tokens', () => {
  it('publishes approved colors and semantic task tones', () => {
    expect(operationsAtlasColors).toEqual({
      canopy: '#123C3A',
      current: '#25766F',
      fieldNote: '#F2CB67',
      signalCoral: '#F27B55',
      mist: '#DCE9E6',
      paper: '#F8FAF8',
      ink: '#183432',
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
