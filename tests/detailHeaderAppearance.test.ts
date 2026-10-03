import { calculateDetailHeaderAppearance } from '../utils/detailHeaderAppearance';

describe('detail header appearance', () => {
  it.each([
    [-20, 0],
    [0, 0],
    [32, 0],
    [44, 0.25],
    [56, 0.5],
    [68, 0.75],
    [80, 1],
    [160, 1],
  ])('maps offset %s into the final 48px before the default collapse boundary', (offset, expected) => {
    expect(calculateDetailHeaderAppearance(offset, 80)).toBeCloseTo(expected);
  });

  it('uses the measured content boundary for a taller answer introduction', () => {
    expect(calculateDetailHeaderAppearance(92, 140)).toBe(0);
    expect(calculateDetailHeaderAppearance(120, 140)).toBeCloseTo(28 / 48);
    expect(calculateDetailHeaderAppearance(140, 140)).toBe(1);
  });

  it('normalizes a short introduction from the top to its collapse boundary', () => {
    expect(calculateDetailHeaderAppearance(0, 32)).toBe(0);
    expect(calculateDetailHeaderAppearance(16, 32)).toBe(0.5);
    expect(calculateDetailHeaderAppearance(32, 32)).toBe(1);
  });
});
