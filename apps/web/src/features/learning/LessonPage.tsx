import { useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Printer, Target } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { courses } from './model';
import { useLearningProgress } from './progress';
import './learning.css';

export function BinaryOctet() {
  const [value, setValue] = useState(192);
  const id = useId();
  const weights = [128, 64, 32, 16, 8, 4, 2, 1];
  return (
    <Card id="visualizer" className="stack octet-lab">
      <div className="card-header">
        <h2 id={id}>Try the bits yourself</h2>
        <Badge>Interactive octet</Badge>
      </div>
      <p className="muted">
        Each button includes or removes its weight. All eight bits together form one IPv4 octet.
      </p>
      <div className="octet-controls" role="group" aria-labelledby={id}>
        {weights.map((weight) => (
          <button
            className={`octet-bit ${(value & weight) !== 0 ? 'set' : ''}`}
            type="button"
            key={weight}
            aria-label={`Toggle weight ${weight}`}
            aria-pressed={(value & weight) !== 0}
            onClick={() => setValue((current) => current ^ weight)}
          >
            <span>{(value & weight) !== 0 ? '1' : '0'}</span>
            <small>{weight}</small>
          </button>
        ))}
      </div>
      <div className="octet-output" aria-live="polite">
        <code>{value.toString(2).padStart(8, '0')}</code>
        <span>=</span>
        <strong>{value}</strong>
      </div>
      <p className="muted">
        {weights.filter((weight) => (value & weight) !== 0).join(' + ') || '0'} = {value}
      </p>
      <div className="row">
        <Button variant="ghost" onClick={() => setValue(0)}>
          Clear all
        </Button>
        <Button variant="ghost" onClick={() => setValue(255)}>
          Set all
        </Button>
        <Link
          className="button button-secondary"
          to={`/tools/ipv4-subnet?input=${encodeURIComponent(JSON.stringify({ address: `192.0.2.${value}/26`, policy: 'lan' }))}`}
        >
          Use this octet in a subnet
          <ArrowRight size={15} />
        </Link>
      </div>
    </Card>
  );
}

export default function LessonPage() {
  const { lessonId } = useParams();
  const index = courses.findIndex((course) => course.id === lessonId);
  const course = courses[index];
  const reviewed = useLearningProgress((state) => state.reviewed);
  const toggle = useLearningProgress((state) => state.toggle);
  useEffect(() => {
    if (window.location.hash === '#visualizer')
      document.getElementById('visualizer')?.scrollIntoView();
  }, [lessonId]);
  if (!course)
    return (
      <div className="page">
        <PageHeader
          title="Lesson not found"
          description="Choose a module from the learning path."
        />
        <Link to="/learn" className="button button-primary">
          View all lessons
        </Link>
      </div>
    );
  const previous = courses[index - 1];
  const next = courses[index + 1];
  const topic =
    (
      {
        'ip-basics': 'addressing',
        'binary-math': 'binary',
        'address-classes': 'addressing',
        nat: 'security',
      } as Record<string, string>
    )[course.id] ?? course.id;
  return (
    <div className="page learning-page">
      <Link to="/learn" className="learning-back">
        <ArrowLeft size={16} />
        Learning path
      </Link>
      <PageHeader
        eyebrow={`${course.category} · Module ${index + 1} of ${courses.length}`}
        title={course.title.replace(/^\d+\.\s*/, '')}
        description={course.description}
        actions={
          <div className="row">
            <Badge>
              <Clock3 size={14} />
              {course.readingMinutes} min
            </Badge>
            <Button variant="ghost" onClick={() => window.print()}>
              <Printer size={16} />
              Print lesson
            </Button>
          </div>
        }
      />
      <div className="learning-lesson-layout">
        <article className="card prose learning-article">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{course.content}</ReactMarkdown>
        </article>
        <aside className="stack learning-lesson-aside">
          <Card>
            <span className="eyebrow">By the end</span>
            <h2>What you will understand</h2>
            <ul className="learning-objectives">
              {course.objectives.map((objective) => (
                <li key={objective}>
                  <CheckCircle2 size={17} />
                  <span>{objective}</span>
                </li>
              ))}
            </ul>
            <Button
              variant={reviewed.includes(course.id) ? 'secondary' : 'primary'}
              aria-pressed={reviewed.includes(course.id)}
              onClick={() => toggle(course.id)}
            >
              {reviewed.includes(course.id) ? 'Reviewed this visit' : 'Mark reviewed this visit'}
            </Button>
            <p className="muted small">
              This reading checklist lasts for the current visit. Signed-in practice results are
              saved separately.
            </p>
          </Card>
          <Card>
            <h3>Put it into practice</h3>
            <p className="muted">Choose explained bank questions focused on this topic.</p>
            <Link className="button button-secondary" to={`/practice?topic=${topic}`}>
              <Target size={16} />
              Practice this topic
            </Link>
          </Card>
          <nav className="card learning-module-nav" aria-label="Course modules">
            {courses.map((item, itemIndex) => (
              <Link
                key={item.id}
                className={item.id === lessonId ? 'active' : ''}
                to={`/learn/${item.id}`}
                aria-current={item.id === lessonId ? 'page' : undefined}
              >
                <span>{String(itemIndex + 1).padStart(2, '0')}</span>
                {item.title.replace(/^\d+\.\s*/, '')}
              </Link>
            ))}
          </nav>
        </aside>
      </div>
      {['binary-math', 'subnetting', 'cidr'].includes(course.id) && (
        <section className="section">
          <BinaryOctet />
        </section>
      )}
      <nav className="row learning-lesson-footer no-print" aria-label="Lesson navigation">
        {previous ? (
          <Link className="button button-secondary" to={`/learn/${previous.id}`}>
            <ArrowLeft size={16} />
            {previous.title.replace(/^\d+\.\s*/, '')}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link className="button button-primary" to={`/learn/${next.id}`}>
            {next.title.replace(/^\d+\.\s*/, '')}
            <ArrowRight size={16} />
          </Link>
        ) : (
          <Link className="button button-primary" to="/practice">
            Start a practice session
            <ArrowRight size={16} />
          </Link>
        )}
      </nav>
    </div>
  );
}
