import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, X } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select } from '@/components/ui';
import { filterGlossary, glossary } from './model';
import './learning.css';

export default function GlossaryPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const category = params.get('category') ?? 'all';
  const [visible, setVisible] = useState(24);
  const selectedId = params.get('term');
  const categories = useMemo(
    () => [...new Set(glossary.map((entry) => entry.category))].sort(),
    [],
  );
  const results = useMemo(() => filterGlossary(search, category), [search, category]);
  const selected = glossary.find((entry) => entry.id === selectedId);
  const entries = selected ? [selected] : results.slice(0, visible);
  const updateFilters = (nextSearch: string, nextCategory: string) => {
    setVisible(24);
    const next = new URLSearchParams();
    if (nextSearch) next.set('q', nextSearch);
    if (nextCategory !== 'all') next.set('category', nextCategory);
    setParams(next, { replace: true });
  };
  const inspect = (id: string) => {
    setParams({ term: id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <div className="page learning-page">
      <PageHeader
        eyebrow="A connected reference"
        title="The networking glossary."
        description={`${glossary.length} original definitions, practical examples, and connected concepts. Find the meaning behind the terminology.`}
        actions={
          <Badge>
            <BookOpen size={15} />5 categories
          </Badge>
        }
      />
      <Card className="glossary-filters no-print">
        <Field label="Find a term" hint="Search names, definitions, and examples.">
          <Input
            aria-label="Search glossary"
            value={search}
            placeholder="Try CIDR, gateway, or longest prefix…"
            onChange={(event) => updateFilters(event.target.value, category)}
          />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(event) => updateFilters(search, event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
      <div className="row glossary-result-count" aria-live="polite">
        <span className="muted">
          {selected
            ? 'One connected concept'
            : `${results.length} matching ${results.length === 1 ? 'entry' : 'entries'}`}
        </span>
        {(selected || search || category !== 'all') && (
          <Button variant="ghost" onClick={() => updateFilters('', 'all')}>
            <X size={14} />
            Show all terms
          </Button>
        )}
      </div>
      {entries.length === 0 ? (
        <EmptyState
          title="No matching term"
          description="Try a shorter phrase, another spelling, or all categories."
        />
      ) : (
        <div className={`glossary-grid ${selected ? 'glossary-selected' : ''}`}>
          {entries.map((entry) => (
            <Card key={entry.id} id={`term-${entry.id}`} className="glossary-entry">
              <Badge>{entry.category}</Badge>
              <h2>
                <button
                  className="glossary-term-button"
                  type="button"
                  onClick={() => inspect(entry.id)}
                >
                  {entry.term}
                </button>
              </h2>
              <p>{entry.definition}</p>
              <div className="glossary-example">
                <span className="eyebrow">In practice</span>
                <p>{entry.example}</p>
              </div>
              <div className="glossary-related">
                <span className="muted small">Related concepts</span>
                <div className="row">
                  {entry.related.map((id) => {
                    const related = glossary.find((item) => item.id === id);
                    return related ? (
                      <button
                        key={id}
                        type="button"
                        className="learning-chip"
                        onClick={() => inspect(id)}
                      >
                        {related.term}
                      </button>
                    ) : null;
                  })}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {!selected && visible < results.length && (
        <div className="learning-load-more">
          <Button variant="secondary" onClick={() => setVisible((count) => count + 24)}>
            Show 24 more terms <span className="muted">({results.length - visible} remaining)</span>
          </Button>
        </div>
      )}
      <p className="muted small section">
        Definitions and examples are original educational summaries. Address purposes and protocol
        details should be checked against the linked standards in the corresponding lessons and tool
        results.
      </p>
    </div>
  );
}
