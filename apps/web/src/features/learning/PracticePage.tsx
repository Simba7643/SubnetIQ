import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  History,
  RotateCcw,
  Target,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  fromGeneratedId,
  type CalculationResult,
  type PracticeDifficulty,
  type QuizQuestion,
} from '@subnetiq/shared';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select } from '@/components/ui';
import ResultPanel from '@/components/ResultPanel';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import {
  buildSession,
  difficulties,
  formatDuration,
  matchingCurated,
  quizBank,
  sessionStats,
  topicLesson,
  topicName,
  type Attempt,
  type TopicStats,
} from './model';
import './learning.css';

interface SavedAnswer {
  attempt: Attempt;
  correct: boolean;
  correctIndex: number;
  explanation: string;
}
interface SessionConfig {
  seed: number;
  difficulty: PracticeDifficulty;
  source: 'curated' | 'generated';
  timed: boolean;
  startedAt: number;
  limitMs: number;
}
const newSeed = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 0;
};
const questionForId = (id: string) =>
  quizBank.find((question) => question.id === id) ?? fromGeneratedId(id);

function TopicProgress({ stats, label }: { stats: TopicStats[]; label: string }) {
  const combined = useMemo(() => {
    const byTopic = new Map<string, { attempts: number; correct: number; duration: number }>();
    for (const row of stats) {
      const item = byTopic.get(row.topic) ?? { attempts: 0, correct: 0, duration: 0 };
      item.attempts += Number(row.attempts);
      item.correct += Number(row.correct_answers);
      item.duration += Number(row.total_duration_ms);
      byTopic.set(row.topic, item);
    }
    return [...byTopic].sort((a, b) => a[1].correct / a[1].attempts - b[1].correct / b[1].attempts);
  }, [stats]);
  return (
    <Card className="stack">
      <div className="card-header">
        <h2>
          <Target size={19} />
          Where to focus next
        </h2>
        <Badge>{label}</Badge>
      </div>
      {combined.length ? (
        <div className="topic-progress-list">
          {combined.map(([topic, values]) => {
            const percent = Math.round((values.correct / values.attempts) * 100);
            return (
              <div className="topic-progress-item" key={topic}>
                <div className="row">
                  <strong>{topicName(topic)}</strong>
                  <span>
                    {values.correct}/{values.attempts} · {percent}%
                  </span>
                </div>
                <progress max={100} value={percent} aria-label={`${topicName(topic)} accuracy`} />
                <div className="row">
                  <small className="muted">
                    {values.attempts < 3
                      ? 'Early signal · try a few more questions'
                      : percent < 75
                        ? 'A useful topic to revisit'
                        : 'Keep building consistency'}{' '}
                    · {formatDuration(values.duration / values.attempts)} average
                  </small>
                  <Link to={`/learn/${topicLesson[topic] ?? 'ip-basics'}`}>
                    Review lesson
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">
          Answer a few questions to see topic accuracy. The lowest accuracy topics appear first;
          small samples are labeled clearly.
        </p>
      )}
    </Card>
  );
}

export default function PracticePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>('beginner');
  const [source, setSource] = useState<'curated' | 'generated'>('curated');
  const [topic, setTopic] = useState(params.get('topic') ?? 'all');
  const [count, setCount] = useState(10);
  const [seedInput, setSeedInput] = useState(() => String(newSeed()));
  const [timed, setTimed] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [finished, setFinished] = useState(false);
  const [expired, setExpired] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [panel, setPanel] = useState<'session' | 'history'>('session');
  const questionStarted = useRef(Date.now());
  const activeAccount = useRef(user?.id);
  const focusHeading = useRef<HTMLHeadingElement>(null);
  const statsQuery = useQuery({
    queryKey: ['practice-stats', user?.id],
    queryFn: () => api<TopicStats[]>('/practice/stats'),
    enabled: Boolean(user),
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ['quiz-attempts', user?.id, historyPage],
    queryFn: () => api<Attempt[]>(`/quiz-attempts?limit=20&offset=${historyPage * 20}`),
    enabled: Boolean(user) && panel === 'history',
    retry: false,
  });
  const stats = useMemo(() => sessionStats(attempts), [attempts]);
  const question = questions[index];
  const submitted = Boolean(
    question && attempts.some((attempt) => attempt.question_id === question.id),
  );
  const currentAttempt = attempts.find((attempt) => attempt.question_id === question?.id);
  const topics =
    source === 'generated'
      ? difficulty === 'beginner' || difficulty === 'intermediate'
        ? ['binary', 'cidr', 'subnetting']
        : ['binary', 'cidr', 'subnetting', 'vlsm', 'ipv6', 'summarization']
      : [
          ...new Set(
            quizBank
              .filter((item) =>
                difficulty === 'exam'
                  ? item.difficulty !== 'beginner'
                  : item.difficulty === difficulty,
              )
              .map((item) => item.topic),
          ),
        ].sort();
  const active = session !== null && questions.length > 0 && !finished;

  useEffect(() => {
    if (activeAccount.current !== user?.id) {
      activeAccount.current = user?.id;
      setQuestions([]);
      setSession(null);
      setAttempts([]);
      setFinished(false);
      setSaveErrors({});
      setHistoryPage(0);
    }
  }, [user?.id]);
  useEffect(() => {
    if (!active || !session) return;
    const tick = () => {
      const duration = Date.now() - session.startedAt;
      setElapsed(duration);
      if (session.timed && duration >= session.limitMs) {
        setFinished(true);
        setExpired(true);
      }
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [active, session]);
  useEffect(() => {
    if (active) focusHeading.current?.focus();
  }, [index, active]);
  useEffect(() => {
    const next = params.get('topic');
    if (next) setTopic(next);
  }, [params]);

  const saveAttempt = async (
    attempt: Attempt,
    submittedQuestion: QuizQuestion,
    config: SessionConfig,
  ) => {
    const account = user?.id;
    if (!account || saving.includes(attempt.id)) return;
    setSaving((current) => [...current, attempt.id]);
    setSaveErrors((current) => {
      const next = { ...current };
      delete next[attempt.id];
      return next;
    });
    try {
      const result = await api<SavedAnswer>('/quiz-attempts', {
        method: 'POST',
        body: JSON.stringify({
          questionId: submittedQuestion.id,
          answerIndex: attempt.answer_index,
          topic: submittedQuestion.topic,
          difficulty: submittedQuestion.difficulty,
          durationMs: attempt.duration_ms,
          seed: config.seed,
        }),
      });
      if (activeAccount.current !== account) return;
      setAttempts((current) =>
        current.map((item) =>
          item.id === attempt.id
            ? {
                ...item,
                correct: result.correct,
                saved: true,
                question: {
                  ...submittedQuestion,
                  correctIndex: result.correctIndex,
                  explanation: result.explanation,
                },
              }
            : item,
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['practice-stats', account] }),
        queryClient.invalidateQueries({ queryKey: ['quiz-attempts', account] }),
      ]);
    } catch (failure) {
      if (activeAccount.current === account)
        setSaveErrors((current) => ({
          ...current,
          [attempt.id]:
            failure instanceof Error ? failure.message : 'This attempt could not be saved.',
        }));
    } finally {
      setSaving((current) => current.filter((id) => id !== attempt.id));
    }
  };
  const start = () => {
    try {
      const seed = Number(seedInput);
      if (!/^\d+$/.test(seedInput.trim()))
        throw new Error('Enter a whole-number seed from 0 to 4,294,967,295.');
      const list = buildSession(source, seed, difficulty, count, topic);
      if (!list.length)
        throw new Error(
          'No questions match this level and topic. Choose all topics or another level.',
        );
      const config = {
        seed,
        source,
        difficulty,
        timed: timed || difficulty === 'exam',
        startedAt: Date.now(),
        limitMs: list.length * 90_000,
      };
      setSession(config);
      setQuestions(list);
      setIndex(0);
      setSelected(null);
      setAttempts([]);
      setFinished(false);
      setExpired(false);
      setElapsed(0);
      setError('');
      setSaveErrors({});
      setPanel('session');
      questionStarted.current = Date.now();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Could not create this practice session.',
      );
    }
  };
  const submit = () => {
    if (!question || selected === null || submitted || !session) return;
    if (session.timed && Date.now() - session.startedAt >= session.limitMs) {
      setFinished(true);
      setExpired(true);
      return;
    }
    const attempt: Attempt = {
      id: `${question.id}:${Date.now()}`,
      question_id: question.id,
      answer_index: selected,
      correct: selected === question.correctIndex,
      topic: question.topic,
      difficulty: question.difficulty,
      duration_ms: Math.min(86400000, Math.max(0, Date.now() - questionStarted.current)),
      created_at: new Date().toISOString(),
      question,
      saved: false,
    };
    setAttempts((current) => [...current, attempt]);
    if (user) void saveAttempt(attempt, question, session);
  };
  const next = () => {
    if (index + 1 === questions.length) {
      setFinished(true);
      return;
    }
    setIndex((current) => current + 1);
    setSelected(null);
    questionStarted.current = Date.now();
  };
  const result: CalculationResult | null =
    finished && session
      ? {
          toolId: 'practice-session',
          title: expired ? 'Practice time complete' : 'Practice session complete',
          normalizedInput: {
            source: session.source,
            seed: session.seed,
            difficulty: session.difficulty,
            questions: questions.length,
            timed: session.timed,
          },
          summary: [
            {
              label: 'Score',
              value: `${stats.correct} / ${questions.length}`,
              description: 'Unanswered questions do not earn a point.',
            },
            { label: 'Accuracy on answered questions', value: `${stats.score}%` },
            { label: 'Answered', value: attempts.length },
            { label: 'Best streak', value: stats.bestStreak },
            { label: 'Elapsed', value: formatDuration(elapsed) },
            { label: 'Session seed', value: String(session.seed) },
          ],
          columns: [
            { key: 'question', label: 'Question' },
            { key: 'topic', label: 'Topic' },
            { key: 'answer', label: 'Your answer' },
            { key: 'expected', label: 'Correct answer' },
            { key: 'correct', label: 'Correct' },
            { key: 'time', label: 'Time' },
            { key: 'explanation', label: 'Explanation' },
          ],
          rows: questions.map((item) => {
            const attempt = attempts.find((entry) => entry.question_id === item.id);
            return {
              question: item.question,
              topic: topicName(item.topic),
              answer: attempt ? (item.options[attempt.answer_index] ?? '') : 'Unanswered',
              expected: item.options[item.correctIndex] ?? '',
              correct: attempt?.correct ?? false,
              time: attempt ? formatDuration(attempt.duration_ms) : '—',
              explanation: item.explanation,
            };
          }),
          steps: [
            {
              title: 'Review the reasoning',
              description:
                'Read the explanation for each missed question, then revisit the related lesson before starting another targeted session.',
            },
            {
              title: 'Build a useful sample',
              description:
                'Topic accuracy becomes more informative after several attempts. A single mistake is a useful prompt to review, not a complete measure of mastery.',
            },
          ],
          warnings: [
            user
              ? `${attempts.filter((attempt) => attempt.saved).length} of ${attempts.length} answered attempts confirmed saved to your account.`
              : 'Guest results last for this visit. Export this report to retain your session.',
            ...(expired
              ? [
                  'The session timer expired. Unanswered questions are included in the session total but are not submitted as graded attempts.',
                ]
              : []),
          ],
          engineVersion: '1.0.0',
        }
      : null;

  return (
    <div className="page learning-page">
      <PageHeader
        eyebrow="Practice that explains why"
        title="Make subnetting second nature."
        description="Build accuracy with guided questions, then test your pace. Every answer comes with the reasoning."
        actions={
          <Link className="button button-secondary" to="/learn">
            <BookOpen size={16} />
            Learning path
          </Link>
        }
      />
      <div className="row practice-view-switch no-print" role="group" aria-label="Practice view">
        <Button
          variant={panel === 'session' ? 'primary' : 'ghost'}
          onClick={() => setPanel('session')}
        >
          <Target size={16} />
          Practice
        </Button>
        <Button
          variant={panel === 'history' ? 'primary' : 'ghost'}
          onClick={() => setPanel('history')}
        >
          <History size={16} />
          Saved history
        </Button>
      </div>
      {panel === 'session' && (
        <>
          {!session && (
            <div className="practice-setup-layout">
              <Card className="stack">
                <div>
                  <Badge>Choose your challenge</Badge>
                  <h2>A little practice, real progress.</h2>
                  <p className="muted">
                    Use the original question bank for concepts and scenarios, or generate
                    reproducible mathematics exercises.
                  </p>
                </div>
                <div className="grid-2">
                  <Field label="Difficulty">
                    <Select
                      value={difficulty}
                      onChange={(event) => {
                        setDifficulty(event.target.value as PracticeDifficulty);
                        setTopic('all');
                      }}
                    >
                      {difficulties.map((level) => (
                        <option key={level} value={level}>
                          {level === 'exam'
                            ? 'Exam · original CCNA-style practice'
                            : level[0]!.toUpperCase() + level.slice(1)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Question source">
                    <Select
                      value={source}
                      onChange={(event) => {
                        setSource(event.target.value as 'curated' | 'generated');
                        setTopic('all');
                      }}
                    >
                      <option value="curated">Curated bank · {quizBank.length} questions</option>
                      <option value="generated">Seeded mathematics generator</option>
                    </Select>
                  </Field>
                  <Field label="Focus topic">
                    <Select value={topic} onChange={(event) => setTopic(event.target.value)}>
                      <option value="all">All available topics</option>
                      {!topics.includes(topic) && topic !== 'all' && (
                        <option value={topic}>{topicName(topic)} (choose another level)</option>
                      )}
                      {topics.map((item) => (
                        <option key={item} value={item}>
                          {topicName(item)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Questions">
                    <Select
                      value={count}
                      onChange={(event) => setCount(Number(event.target.value))}
                    >
                      {[5, 10, 20, 40].map((number) => (
                        <option key={number} value={number}>
                          {number} questions
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <label className="row">
                  <input
                    type="checkbox"
                    checked={timed || difficulty === 'exam'}
                    disabled={difficulty === 'exam'}
                    onChange={(event) => setTimed(event.target.checked)}
                  />
                  Timed session · 90 seconds per question in one shared budget
                </label>
                <details className="practice-seed">
                  <summary>Reproducible session seed</summary>
                  <Field
                    label="Seed"
                    hint="The same source, level, topic, and seed produce the same question sequence."
                  >
                    <Input
                      inputMode="numeric"
                      value={seedInput}
                      onChange={(event) => setSeedInput(event.target.value)}
                    />
                  </Field>
                  <Button variant="ghost" onClick={() => setSeedInput(String(newSeed()))}>
                    <RotateCcw size={14} />
                    New seed
                  </Button>
                </details>
                {source === 'curated' && (
                  <p className="muted small">
                    {matchingCurated(difficulty, topic).length} matching bank questions. Sessions
                    use up to your selected count without repeating a question. Exam mode mixes
                    intermediate, advanced, and scenario questions.
                  </p>
                )}
                {error && (
                  <div role="alert" className="error-banner">
                    {error}
                  </div>
                )}
                <Button onClick={start}>
                  Start practice
                  <ArrowRight size={17} />
                </Button>
              </Card>
              <aside className="stack">
                <Card className="practice-promise">
                  <div className="icon-box">
                    <Target size={23} />
                  </div>
                  <h3>Understand each mistake.</h3>
                  <p className="muted">
                    Immediate explanations show the exact rule and point you back to a focused
                    lesson. No answer has to be a guess twice.
                  </p>
                  <div className="practice-level-notes">
                    <p>
                      <strong>Beginner</strong>
                      <span>Binary, masks, and core definitions.</span>
                    </p>
                    <p>
                      <strong>Intermediate</strong>
                      <span>Networks, ranges, and protocol behavior.</span>
                    </p>
                    <p>
                      <strong>Advanced</strong>
                      <span>VLSM, IPv6, aggregation, and exceptions.</span>
                    </p>
                    <p>
                      <strong>Exam</strong>
                      <span>
                        Original scenarios under a shared timer. No certification affiliation.
                      </span>
                    </p>
                  </div>
                </Card>
                <Card>
                  <h3>
                    {user ? 'Your progress follows you.' : 'Start freely. Save with an account.'}
                  </h3>
                  <p className="muted">
                    {user
                      ? 'Answered attempts are independently graded and saved when your account service is available.'
                      : 'Guest sessions work entirely in this visit. Sign in before starting to retain attempts and long-term topic statistics.'}
                  </p>
                  {!user && (
                    <Link className="button button-secondary" to="/auth">
                      Sign in to save progress
                    </Link>
                  )}
                </Card>
              </aside>
            </div>
          )}
          {active && question && session && (
            <section className="practice-active stack">
              <div className="practice-stat-strip">
                {[
                  { label: 'Progress', value: `${index + 1} / ${questions.length}`, Icon: Target },
                  { label: 'Correct', value: `${stats.correct} / ${stats.attempts}`, Icon: Trophy },
                  { label: 'Current streak', value: String(stats.currentStreak), Icon: Flame },
                  {
                    label: session.timed ? 'Time remaining' : 'Elapsed',
                    value: formatDuration(
                      session.timed ? Math.max(0, session.limitMs - elapsed) : elapsed,
                    ),
                    Icon: Clock3,
                  },
                ].map(({ label, value, Icon }) => (
                  <div className="stat" key={label}>
                    <span className="stat-label">
                      <Icon size={16} />
                      {label}
                    </span>
                    <strong className="stat-value">{value}</strong>
                  </div>
                ))}
              </div>
              <progress
                className="practice-progress"
                max={questions.length}
                value={index + Number(submitted)}
                aria-label="Session questions completed"
              />
              <Card className="practice-question stack">
                <div className="card-header">
                  <Badge>{topicName(question.topic)}</Badge>
                  <span className="muted small">
                    {question.difficulty} ·{' '}
                    {session.source === 'generated' ? 'Generated' : 'Curated'}
                  </span>
                </div>
                <h2 ref={focusHeading} tabIndex={-1} id="practice-question-heading">
                  {question.question}
                </h2>
                <fieldset
                  className="practice-options"
                  aria-labelledby="practice-question-heading"
                  disabled={submitted}
                >
                  <legend className="sr-only">Choose one answer</legend>
                  {question.options.map((option, answerIndex) => (
                    <label
                      key={option}
                      className={`practice-option ${selected === answerIndex ? 'selected' : ''} ${submitted && answerIndex === question.correctIndex ? 'correct' : ''} ${submitted && selected === answerIndex && selected !== question.correctIndex ? 'incorrect' : ''}`}
                    >
                      <input
                        type="radio"
                        name={`answer-${question.id}`}
                        value={answerIndex}
                        checked={selected === answerIndex}
                        onChange={() => setSelected(answerIndex)}
                      />
                      <span className="practice-option-letter">
                        {String.fromCharCode(65 + answerIndex)}
                      </span>
                      <span>{option}</span>
                      {submitted && answerIndex === question.correctIndex && (
                        <CheckCircle2 size={20} aria-label="Correct answer" />
                      )}
                    </label>
                  ))}
                </fieldset>
                {!submitted ? (
                  <div className="row">
                    <Button disabled={selected === null} onClick={submit}>
                      Check answer
                      <ArrowRight size={16} />
                    </Button>
                    <span className="muted small">
                      Choose one option. Your answer locks when checked.
                    </span>
                  </div>
                ) : (
                  <div className="stack">
                    <div
                      className={`practice-feedback ${currentAttempt?.correct ? 'success-banner' : 'warning-banner'}`}
                      role="status"
                    >
                      <h3>
                        {currentAttempt?.correct ? (
                          <>
                            <CheckCircle2 size={20} />
                            Correct. Keep the reasoning.
                          </>
                        ) : (
                          <>
                            <XCircle size={20} />A useful one to learn from.
                          </>
                        )}
                      </h3>
                      <p>{currentAttempt?.question?.explanation ?? question.explanation}</p>
                      <Link to={`/learn/${topicLesson[question.topic] ?? 'ip-basics'}`}>
                        Review {topicName(question.topic).toLowerCase()}
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                    {currentAttempt && user && (
                      <div className="practice-save-status">
                        {saving.includes(currentAttempt.id) ? (
                          <p className="muted small" role="status">
                            Saving this attempt…
                          </p>
                        ) : currentAttempt.saved ? (
                          <p className="muted small">
                            <CheckCircle2 size={13} />
                            Attempt saved to your account
                          </p>
                        ) : saveErrors[currentAttempt.id] ? (
                          <div className="error-banner" role="alert">
                            <p>
                              Answer reviewed locally. Saving failed:{' '}
                              {saveErrors[currentAttempt.id]}
                            </p>
                            <Button
                              variant="secondary"
                              onClick={() => void saveAttempt(currentAttempt, question, session)}
                            >
                              Retry saving
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                    <div className="row">
                      <Button onClick={next}>
                        {index + 1 === questions.length ? 'See session results' : 'Next question'}
                        <ArrowRight size={16} />
                      </Button>
                      <span className="muted small">
                        {formatDuration(currentAttempt?.duration_ms ?? 0)} on this question
                      </span>
                    </div>
                  </div>
                )}
              </Card>
              <details className="no-print">
                <summary>Session controls</summary>
                <p className="muted">
                  Seed {session.seed} · Ending now leaves unanswered questions in the session total.
                </p>
                <Button variant="secondary" onClick={() => setFinished(true)}>
                  End session and review
                </Button>
              </details>
            </section>
          )}
          {result && (
            <section className="stack practice-complete">
              <div className="card practice-complete-banner">
                <div className="icon-box">
                  <Trophy size={26} />
                </div>
                <div>
                  <h2>{expired ? 'Time to review.' : 'Every answer builds understanding.'}</h2>
                  <p className="muted">
                    You answered {attempts.length} of {questions.length} questions. Review your
                    explanations and choose the next focus.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setSession(null);
                    setQuestions([]);
                    setFinished(false);
                    setSeedInput(String(newSeed()));
                  }}
                >
                  Set up another session
                  <ArrowRight size={16} />
                </Button>
              </div>
              <ResultPanel result={result} />
              {Object.entries(saveErrors).map(([id, message]) => {
                const attempt = attempts.find((item) => item.id === id);
                return attempt?.question && session ? (
                  <div key={id} className="error-banner">
                    <p>One account save is still pending: {message}</p>
                    <Button
                      variant="secondary"
                      disabled={saving.includes(id)}
                      onClick={() => void saveAttempt(attempt, attempt.question!, session)}
                    >
                      Retry saving this answer
                    </Button>
                  </div>
                ) : null;
              })}
            </section>
          )}
          {(attempts.length > 0 || (user && Boolean(statsQuery.data?.length))) && (
            <section className="section">
              <TopicProgress
                stats={user && statsQuery.data?.length ? statsQuery.data : stats.topics}
                label={user && statsQuery.data?.length ? 'Saved account history' : 'This session'}
              />
            </section>
          )}
          {statsQuery.isError && user && (
            <div className="error-banner">
              Saved statistics could not load: {statsQuery.error.message}. Current-session results
              remain available.
              <Button variant="ghost" onClick={() => void statsQuery.refetch()}>
                Retry
              </Button>
            </div>
          )}
        </>
      )}
      {panel === 'history' && (
        <section className="stack">
          {!user ? (
            <EmptyState
              title="Keep a history of your progress"
              description="Sign in before a session to save graded attempts and build long-term topic statistics."
            >
              <Link className="button button-primary" to="/auth">
                Sign in
              </Link>
            </EmptyState>
          ) : (
            <>
              <TopicProgress stats={statsQuery.data ?? []} label="Saved account history" />
              <Card>
                <div className="card-header">
                  <h2>Answered questions</h2>
                  <Badge>20 per page</Badge>
                </div>
                {historyQuery.isPending ? (
                  <p className="muted" role="status">
                    Loading saved attempts…
                  </p>
                ) : historyQuery.isError ? (
                  <div className="error-banner" role="alert">
                    {historyQuery.error.message}
                    <Button variant="ghost" onClick={() => void historyQuery.refetch()}>
                      Retry
                    </Button>
                  </div>
                ) : !historyQuery.data?.length ? (
                  <EmptyState
                    title={
                      historyPage ? 'No more attempts' : 'Your first saved session starts here'
                    }
                    description="Answered questions appear after a successful account save."
                  />
                ) : (
                  <div className="practice-history">
                    {historyQuery.data.map((attempt) => {
                      const item = questionForId(attempt.question_id);
                      return (
                        <details key={attempt.id}>
                          <summary>
                            <span
                              className={
                                attempt.correct ? 'learning-correct' : 'learning-incorrect'
                              }
                            >
                              {attempt.correct ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                            </span>
                            <span>
                              {item?.question ?? `Question ${attempt.question_id}`}
                              <small className="muted">
                                {topicName(attempt.topic)} · {attempt.difficulty} ·{' '}
                                {formatDuration(attempt.duration_ms)} ·{' '}
                                {new Date(attempt.created_at).toLocaleString()}
                              </small>
                            </span>
                          </summary>
                          {item && (
                            <div className="practice-history-detail">
                              <p>
                                <strong>Your answer:</strong> {item.options[attempt.answer_index]}
                              </p>
                              <p>
                                <strong>Correct answer:</strong> {item.options[item.correctIndex]}
                              </p>
                              <p>{item.explanation}</p>
                              <Link to={`/learn/${topicLesson[attempt.topic] ?? 'ip-basics'}`}>
                                Review lesson
                                <ArrowRight size={14} />
                              </Link>
                            </div>
                          )}
                        </details>
                      );
                    })}
                  </div>
                )}
                <div className="row practice-history-paging">
                  <Button
                    variant="secondary"
                    disabled={historyPage === 0}
                    onClick={() => setHistoryPage((page) => page - 1)}
                  >
                    <ChevronLeft size={15} />
                    Previous
                  </Button>
                  <span className="muted">Page {historyPage + 1}</span>
                  <Button
                    variant="secondary"
                    disabled={(historyQuery.data?.length ?? 0) < 20}
                    onClick={() => setHistoryPage((page) => page + 1)}
                  >
                    Next
                    <ChevronRight size={15} />
                  </Button>
                </div>
              </Card>
            </>
          )}
        </section>
      )}
    </div>
  );
}
