import { describe, expect, it } from 'vitest';
import { insetClip } from './clip';

const outer = { top: 100, right: 1300, bottom: 900, left: 100 };

describe('insetClip', () => {
  it('clips an element down to a smaller box inside it', () => {
    const inner = { top: 100, right: 1300, bottom: 600, left: 700 };
    expect(insetClip(inner, outer, 28)).toBe('inset(0px 0px 300px 600px round 28px)');
  });

  it('shows the whole element when both boxes match', () => {
    expect(insetClip(outer, outer, 28)).toBe('inset(0px 0px 0px 0px round 28px)');
  });

  it('never produces negative insets and rounds to whole pixels', () => {
    const inner = { top: 99.6, right: 1300.4, bottom: 500.5, left: 99 };
    expect(insetClip(inner, outer, 27.6)).toBe('inset(0px 0px 400px 0px round 28px)');
  });
});
