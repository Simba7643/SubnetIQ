import { describe, expect, it } from 'vitest';
import { fromGeneratedId } from '@subnetiq/shared';
import {
  buildSession,
  courses,
  filterGlossary,
  glossary,
  quizBank,
  sessionStats,
  type Attempt,
} from './model';

describe('learning content integrity', () => {
  it('ships substantive original content and resolvable related terms', () => {
    const ids = new Set(glossary.map((entry) => entry.id));
    expect(glossary.length).toBeGreaterThanOrEqual(220);
    expect(ids.size).toBe(glossary.length);
    for (const entry of glossary) {
      expect(entry.definition.length).toBeGreaterThan(35);
      expect(entry.example.length).toBeGreaterThan(20);
      for (const related of entry.related)
        expect(ids.has(related), `${entry.id} points to ${related}`).toBe(true);
    }
    expect(courses).toHaveLength(12);
    expect(new Set(courses.map((course) => course.id)).size).toBe(12);
    for (const course of courses) {
      expect(course.content.split(/\s+/).length).toBeGreaterThan(350);
      expect(course.objectives.length).toBeGreaterThanOrEqual(3);
      expect(course.content).toContain('https://www.rfc-editor.org/');
    }
  });
  it('includes valid explained questions at all four difficulties', () => {
    expect(quizBank.length).toBeGreaterThanOrEqual(160);
    expect(new Set(quizBank.map((item) => item.id)).size).toBe(quizBank.length);
    expect(new Set(quizBank.map((item) => item.question)).size).toBe(quizBank.length);
    expect(new Set(quizBank.map((item) => item.difficulty)).size).toBe(4);
    for (const question of quizBank) {
      expect(new Set(question.options).size).toBe(4);
      expect(question.correctIndex).toBeGreaterThanOrEqual(0);
      expect(question.correctIndex).toBeLessThan(4);
      expect(question.explanation.length).toBeGreaterThan(50);
    }
  });
  it('searches across words and categories without losing meaningful matches', () => {
    expect(
      filterGlossary('longest prefix', 'all').some((entry) => entry.id === 'longest-prefix-match'),
    ).toBe(true);
    expect(filterGlossary('127.0.0.0', 'Addressing').some((entry) => entry.id === 'loopback')).toBe(
      true,
    );
    expect(filterGlossary('ARP', 'Security').every((entry) => entry.category === 'Security')).toBe(
      true,
    );
    expect(filterGlossary('unfindable-phrase-9832', 'all')).toEqual([]);
  });
});

describe('practice sessions', () => {
  it('creates repeatable curated sessions without repeating bank IDs', () => {
    const first = buildSession('curated', 123, 'exam', 40, 'all');
    expect(first).toEqual(buildSession('curated', 123, 'exam', 40, 'all'));
    expect(first).toHaveLength(40);
    expect(new Set(first.map((item) => item.id)).size).toBe(40);
    expect(first.every((item) => item.difficulty !== 'beginner')).toBe(true);
    const focused = buildSession('curated', 123, 'advanced', 40, 'ipv6');
    expect(focused.length).toBeLessThanOrEqual(40);
    expect(focused.every((item) => item.topic === 'ipv6')).toBe(true);
  });
  it('finds focused generated exercises that remain authoritatively reproducible', () => {
    for (const topic of ['binary', 'cidr', 'subnetting', 'vlsm', 'ipv6', 'summarization']) {
      const list = buildSession('generated', 389, 'advanced', 40, topic);
      expect(list).toHaveLength(40);
      for (const question of list) {
        expect(question.topic).toBe(topic);
        expect(fromGeneratedId(question.id)).toEqual(question);
      }
    }
    expect(() => buildSession('generated', 42, 'beginner', 5, 'ipv6')).toThrow('does not cover');
    expect(() => buildSession('curated', -1, 'beginner', 10, 'all')).toThrow('seed');
    expect(() => buildSession('generated', 1, 'advanced', 41, 'all')).toThrow('40');
  });
  it('resets a streak on a wrong answer and ranks the weakest topic first', () => {
    const attempts = [
      { correct: true, topic: 'cidr', duration_ms: 1000 },
      { correct: true, topic: 'cidr', duration_ms: 2000 },
      { correct: false, topic: 'ipv6', duration_ms: 3000 },
      { correct: true, topic: 'ipv6', duration_ms: 4000 },
    ] as Attempt[];
    const stats = sessionStats(attempts);
    expect(stats).toMatchObject({
      correct: 3,
      attempts: 4,
      score: 75,
      currentStreak: 1,
      bestStreak: 2,
    });
    expect(stats.topics[0]).toMatchObject({
      topic: 'ipv6',
      attempts: 2,
      correct_answers: 1,
      total_duration_ms: 7000,
    });
    expect(sessionStats([])).toMatchObject({ score: 0, currentStreak: 0, bestStreak: 0 });
  });
});
