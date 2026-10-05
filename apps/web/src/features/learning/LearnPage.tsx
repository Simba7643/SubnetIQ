import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Binary,
  BookOpen,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Layers3,
  Target,
} from 'lucide-react';
import { Badge, PageHeader } from '@/components/ui';
import { courses, glossary, quizBank } from './model';
import { useLearningProgress } from './progress';
import './learning.css';

export default function LearnPage() {
  const reviewed = useLearningProgress((state) => state.reviewed);
  return (
    <div className="page learning-page">
      <PageHeader
        eyebrow="The learning hub"
        title="Understand the network."
        description="Build the reasoning behind every prefix, then turn what you learn into a working address plan."
        actions={
          <Link className="button button-primary" to="/practice">
            <Target size={17} />
            Start practicing
          </Link>
        }
      />
      <section className="learning-hero card">
        <div className="learning-hero-copy">
          <Badge>
            <GraduationCap size={14} />
            Your complete learning path
          </Badge>
          <h2>
            From the first bit
            <br />
            to a confident design.
          </h2>
          <p className="muted">
            Twelve original modules. Worked examples. Clear answers to the edge cases. Follow the
            path or jump to the topic you need.
          </p>
          <Link
            className="button button-secondary"
            to={`/learn/${courses.find((course) => !reviewed.includes(course.id))?.id ?? courses[0]!.id}`}
          >
            {reviewed.length ? 'Continue learning' : 'Begin with IP basics'}
            <ArrowRight size={16} />
          </Link>
        </div>
        <div
          className="learning-hero-visual"
          aria-label="A /24 network divided into four /26 subnets"
        >
          <span className="eyebrow">ONE NETWORK · FOUR POSSIBILITIES</span>
          <code>192.0.2.0/24</code>
          <div className="learning-address-bar">
            {['.0/26', '.64/26', '.128/26', '.192/26'].map((text, i) => (
              <span key={text} className={`learning-block-${i}`}>
                {text}
              </span>
            ))}
          </div>
          <p>Borrow 2 bits → 4 subnets → 64 addresses each</p>
        </div>
      </section>
      <div className="grid-3 learning-counts">
        {[
          [String(courses.length), 'guided modules'],
          [glossary.length.toLocaleString(), 'connected glossary entries'],
          [quizBank.length.toLocaleString(), 'explained bank questions'],
        ].map(([value, label]) => (
          <div className="stat" key={label}>
            <span className="stat-value">{value}</span>
            <span className="stat-label">{label}</span>
          </div>
        ))}
      </div>
      <section className="section stack">
        <div className="card-header">
          <div>
            <span className="eyebrow">A structured path</span>
            <h2>The foundations, in order</h2>
          </div>
          <Badge>
            {reviewed.length} / {courses.length} reviewed this visit
          </Badge>
        </div>
        <div className="learning-course-grid">
          {courses.map((course, index) => (
            <Link className="card learning-course-card" to={`/learn/${course.id}`} key={course.id}>
              <div className="card-header">
                <span className="learning-step">
                  {reviewed.includes(course.id) ? (
                    <CheckCircle2 size={21} />
                  ) : (
                    String(index + 1).padStart(2, '0')
                  )}
                </span>
                <Badge>{course.category}</Badge>
              </div>
              <h3>{course.title.replace(/^\d+\.\s*/, '')}</h3>
              <p className="muted">{course.description}</p>
              <div className="row learning-card-footer">
                <span>
                  <Clock3 size={14} />
                  {course.readingMinutes} min
                </span>
                <ArrowRight size={17} />
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="grid-3 section">
        {[
          {
            to: '/glossary',
            title: 'Make the vocabulary click',
            description: 'Search definitions, concrete examples, and related concepts.',
            Icon: BookOpen,
          },
          {
            to: '/cheatsheets',
            title: 'Keep the essentials nearby',
            description: 'Printable masks, powers of two, ranges, ports, and layer models.',
            Icon: Layers3,
          },
          {
            to: '/learn/binary-math#visualizer',
            title: 'Learn by moving the bits',
            description: 'Toggle an octet and watch its decimal value change.',
            Icon: Binary,
          },
        ].map(({ to, title, description, Icon }) => (
          <Link className="card tool-card" key={to} to={to}>
            <div className="icon-box">
              <Icon size={22} />
            </div>
            <h3>{title}</h3>
            <p className="muted">{description}</p>
            <span className="row">
              Explore
              <ArrowRight size={15} />
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
