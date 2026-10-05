import { describe, expect, it } from 'vitest';
import { fromGeneratedId, generatePracticeQuestion } from './practice';
import type { PracticeDifficulty } from './practice';

const levels: PracticeDifficulty[] = ['beginner', 'intermediate', 'advanced', 'exam'];

describe('authoritative generated practice questions', () => {
  it('reproduces every answer from the canonical question ID across levels and boundary seeds', () => {
    for (const level of levels) {
      for (const seed of [0, 1, 42, 20261004, 4294967295]) {
        for (let index = 0; index < 40; index += 1) {
          const question = generatePracticeQuestion(seed, level, index);
          expect(fromGeneratedId(question.id)).toEqual(question);
          expect(new Set(question.options).size).toBe(4);
          expect(question.correctIndex).toBeGreaterThanOrEqual(0);
          expect(question.correctIndex).toBeLessThan(4);
          expect(question.explanation.length).toBeGreaterThan(60);
        }
      }
    }
  });
  it('rejects forged, noncanonical, and unbounded IDs', () => {
    for (const id of [
      'generated:beginner:4294967296:0',
      'generated:advanced:1:1000001',
      'generated:exam:-1:0',
      'generated:beginner:01:0',
      'generated:beginner:1:01',
      'generated:unknown:1:0',
      'generated:exam:1:0:extra',
      'generated:exam:1:0\n',
      'curated-001',
    ])
      expect(fromGeneratedId(id)).toBeNull();
    expect(() => generatePracticeQuestion(Number.NaN, 'beginner')).toThrow();
    expect(() => generatePracticeQuestion(1, 'exam', -1)).toThrow();
    expect(() => generatePracticeQuestion(1.1, 'advanced')).toThrow();
  });
  it('produces numerically correct binary and host-count answers independently of explanation text', () => {
    for (let index = 0; index < 300; index += 1) {
      const question = generatePracticeQuestion(814, 'beginner', index);
      if (question.topic === 'binary') {
        const value = Number(question.question.match(/decimal (\d+)/)?.[1]);
        expect(Number.parseInt(question.options[question.correctIndex]!, 2)).toBe(value);
      }
      if (question.topic === 'subnetting') {
        const prefix = Number(question.question.match(/\/(\d+)/)?.[1]);
        let addressCount = 1;
        for (let bit = prefix; bit < 32; bit += 1) addressCount *= 2;
        expect(Number(question.options[question.correctIndex])).toBe(addressCount - 2);
      }
    }
  });
  it('makes seed and position meaningful while retaining stable identity', () => {
    expect(generatePracticeQuestion(77, 'advanced', 5)).not.toEqual(
      generatePracticeQuestion(78, 'advanced', 5),
    );
    expect(generatePracticeQuestion(77, 'advanced', 5).id).not.toBe(
      generatePracticeQuestion(77, 'advanced', 6).id,
    );
  });
});
