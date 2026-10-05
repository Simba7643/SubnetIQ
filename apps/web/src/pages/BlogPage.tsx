import { Link } from 'react-router-dom';
import { ArrowRight, Binary, Globe2, Layers3, Network, ShieldCheck } from 'lucide-react';
import { Badge, PageHeader } from '@/components/ui';
import { articles } from '@/lib/articles';
const icons = [Network, Globe2, Layers3, ShieldCheck, Binary];
export default function BlogPage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="FIELD NOTES"
        title="Ideas worth taking into the field."
        description="Practical networking guides with worked examples, careful assumptions, and links to the underlying standards."
      />
      <div className="article-grid">
        {articles.map((article, index) => {
          const Icon = icons[index % icons.length];
          return (
            <Link className="card article-card" key={article.id} to={`/blog/${article.id}`}>
              <div className="article-visual">
                <Icon />
              </div>
              <div className="row">
                <Badge>{article.category}</Badge>
                <small>{article.readingMinutes} min read</small>
              </div>
              <h2>{article.title}</h2>
              <p>{article.description}</p>
              <span className="tool-card-footer">
                Read field note
                <ArrowRight size={13} />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
