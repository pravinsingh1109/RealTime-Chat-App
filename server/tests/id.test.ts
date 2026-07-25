import { expect, test } from '@jest/globals';
import { canonicalDirectKey } from '../src/utils/id.js';
test('direct keys are stable', () => expect(canonicalDirectKey('z', 'a')).toBe(canonicalDirectKey('a', 'z')));
