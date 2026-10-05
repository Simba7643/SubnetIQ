import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { articles } from '@/lib/articles';
import { Card, PageHeader, Badge } from '@/components/ui';
import { Markdown } from '@/components/Markdown';
export default function ArticlePage() {
  const { articleId } = useParams();
  const article = articles.find((item) => item.id === articleId);
  if (!article)
    return (
      <div className="page">
        <PageHeader
          title="That field note isn’t here."
          description="Explore the available networking guides."
        />
        <Link className="button button-primary" to="/blog">
          Browse field notes
        </Link>
      </div>
    );
  return (
    <article className="page legal-layout">
      <Link className="button button-ghost" to="/blog" style={{ marginBottom: 20 }}>
        <ArrowLeft size={13} />
        All field notes
      </Link>
      <PageHeader
        eyebrow={article.category}
        title={article.title}
        description={article.description}
      />
      <div className="row" style={{ marginBottom: 24 }}>
        <Badge>
          <Clock size={12} />
          {article.readingMinutes} min read
        </Badge>
        <span className="small muted">
          Published{' '}
          {new Date(`${article.publishedAt}T00:00:00Z`).toLocaleDateString('en', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>
      <Card>
        <Markdown>{article.body}</Markdown>
      </Card>
      <Card className="section">
        <h2>Put the idea into practice.</h2>
        <p className="muted" style={{ margin: '12px 0 18px' }}>
          Use the same reasoning on your own inputs, and inspect the calculation steps.
        </p>
        <div className="row">
          <Link className="button button-primary" to="/tools">
            Explore calculators
          </Link>
          <Link className="button button-secondary" to="/practice">
            Open practice lab
          </Link>
        </div>
      </Card>
    </article>
  );
}
