import { describe, expect, it } from '@jest/globals';

import { shortNames } from '@/shared/utils/names';

describe('shortNames', () => {
  it('uses first names when they are unique', () => {
    expect(
      shortNames([
        { id: '1', name: 'Vaibhav Bhardwaj' },
        { id: '2', name: 'Rahul Sharma' },
      ]),
    ).toEqual({ '1': 'Vaibhav', '2': 'Rahul' });
  });

  it('uses surnames when first names clash', () => {
    expect(
      shortNames([
        { id: '1', name: 'Rahul Sharma' },
        { id: '2', name: 'rahul Verma' },
        { id: '3', name: 'Amit Kumar' },
      ]),
    ).toEqual({ '1': 'Sharma', '2': 'Verma', '3': 'Amit' });
  });

  it('falls back to the full name when surnames clash or are missing', () => {
    expect(
      shortNames([
        { id: '1', name: 'Raj Kumar' },
        { id: '2', name: 'Raj Kumar' },
        { id: '3', name: 'Raj' },
      ]),
    ).toEqual({ '1': 'Raj Kumar', '2': 'Raj Kumar', '3': 'Raj' });
  });
});
