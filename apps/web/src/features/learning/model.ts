import type { GlossaryEntry, QuizQuestion } from '@subnetiq/shared';
import { generatePracticeQuestion, type PracticeDifficulty } from '@subnetiq/shared';
import glossaryData from '@data/glossary.json';
import quizData from '@data/quiz-bank.json';
import coursesData from '@data/courses.json';

export interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  readingMinutes: number;
  objectives: string[];
  content: string;
}
export interface Attempt {
  id: string;
  question_id: string;
  answer_index: number;
  correct: boolean;
  topic: string;
  difficulty: PracticeDifficulty;
  duration_ms: number;
  created_at: string;
  question?: QuizQuestion;
  saved?: boolean;
}
export interface TopicStats {
  topic: string;
  difficulty?: PracticeDifficulty;
  attempts: number | string;
  correct_answers: number | string;
  total_duration_ms: number | string;
  current_streak: number | string;
  best_streak: number | string;
}
export const glossary: GlossaryEntry[] = glossaryData;
export const quizBank = quizData as QuizQuestion[];
export const courses: Course[] = coursesData;
export const difficulties: PracticeDifficulty[] = ['beginner', 'intermediate', 'advanced', 'exam'];
export const topicLesson: Record<string, string> = {
  binary: 'binary-math',
  cidr: 'cidr',
  addressing: 'ip-basics',
  subnetting: 'subnetting',
  vlsm: 'vlsm',
  summarization: 'summarization',
  ipv6: 'ipv6',
  routing: 'routing',
  dhcp: 'dhcp',
  dns: 'dns',
  protocols: 'ip-basics',
  security: 'nat',
  switching: 'routing',
};
export const topicName = (topic: string) =>
  ({
    cidr: 'CIDR and masks',
    vlsm: 'VLSM',
    ipv6: 'IPv6',
    dhcp: 'DHCP',
    dns: 'DNS',
    binary: 'Binary mathematics',
    addressing: 'Address classification',
    subnetting: 'Subnetting',
    summarization: 'Summarization',
    routing: 'Routing',
    protocols: 'Protocols and capacity',
    security: 'Security',
    switching: 'Switching',
  })[topic] ?? topic;

export function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function filterGlossary(search: string, category: string) {
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return glossary.filter(
    (entry) =>
      (category === 'all' || entry.category === category) &&
      terms.every((term) =>
        `${entry.term} ${entry.definition} ${entry.example}`.toLowerCase().includes(term),
      ),
  );
}

export function shuffleQuestions(items: QuizQuestion[], seed: number) {
  const shuffled = [...items];
  let value = seed >>> 0;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    const next = value % (index + 1);
    [shuffled[index], shuffled[next]] = [shuffled[next]!, shuffled[index]!];
  }
  return shuffled;
}

export function matchingCurated(difficulty: PracticeDifficulty, topic: string) {
  return quizBank.filter(
    (question) =>
      (difficulty === 'exam'
        ? question.difficulty !== 'beginner'
        : question.difficulty === difficulty) &&
      (topic === 'all' || question.topic === topic),
  );
}

export function buildSession(
  source: 'curated' | 'generated',
  seed: number,
  difficulty: PracticeDifficulty,
  count: number,
  topic: string,
): QuizQuestion[] {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)
    throw new Error('Enter a whole-number seed from 0 to 4,294,967,295.');
  if (!Number.isInteger(count) || count < 1 || count > 40)
    throw new Error('Choose between 1 and 40 questions.');
  if (source === 'curated')
    return shuffleQuestions(matchingCurated(difficulty, topic), seed).slice(0, count);
  const questions: QuizQuestion[] = [];
  for (let index = 0; index < 2000 && questions.length < count; index += 1) {
    const question = generatePracticeQuestion(seed, difficulty, index);
    if (topic === 'all' || question.topic === topic) questions.push(question);
  }
  if (questions.length < count)
    throw new Error(
      'This generated level does not cover that topic. Select another topic or the curated question bank.',
    );
  return questions;
}

export function sessionStats(attempts: Attempt[]) {
  let currentStreak = 0;
  let bestStreak = 0;
  const topics = new Map<string, TopicStats>();
  for (const attempt of attempts) {
    currentStreak = attempt.correct ? currentStreak + 1 : 0;
    bestStreak = Math.max(bestStreak, currentStreak);
    const entry = topics.get(attempt.topic) ?? {
      topic: attempt.topic,
      attempts: 0,
      correct_answers: 0,
      total_duration_ms: 0,
      current_streak: 0,
      best_streak: 0,
    };
    entry.attempts = Number(entry.attempts) + 1;
    entry.correct_answers = Number(entry.correct_answers) + Number(attempt.correct);
    entry.total_duration_ms = Number(entry.total_duration_ms) + attempt.duration_ms;
    entry.current_streak = attempt.correct ? Number(entry.current_streak) + 1 : 0;
    entry.best_streak = Math.max(Number(entry.best_streak), Number(entry.current_streak));
    topics.set(attempt.topic, entry);
  }
  const correct = attempts.filter((attempt) => attempt.correct).length;
  return {
    correct,
    attempts: attempts.length,
    score: attempts.length ? Math.round((correct / attempts.length) * 100) : 0,
    currentStreak,
    bestStreak,
    topics: [...topics.values()].sort(
      (a, b) =>
        Number(a.correct_answers) / Number(a.attempts) -
        Number(b.correct_answers) / Number(b.attempts),
    ),
  };
}
