import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, X } from 'lucide-react';
import { Badge, Button, Card, Input, PageHeader } from '@/components/ui';
import { searchTools, toolCategories, toolDefinitions, type ToolCategory } from './toolDefinitions';
import './calculators.css';

export default function ToolsPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ToolCategory | 'All'>('All');
  const matches = searchTools(query, category);

  return (
    <div className="page calculator-catalog">
      <PageHeader
        eyebrow="Calculate with confidence"
        title="Every address has a story."
        description="Explore the math, build an address plan, and bring the result into your next project."
        actions={<Badge>{toolDefinitions.length} tools · runs locally</Badge>}
      />
      <Card className="tool-search-panel">
        <div className="tool-search-input">
          <Search size={20} aria-hidden="true" />
          <Input
            aria-label="Search tools"
            placeholder="Search tools, protocols, or tasks…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
          />
          {query && (
            <Button variant="ghost" aria-label="Clear tool search" onClick={() => setQuery('')}>
              <X size={17} aria-hidden="true" />
            </Button>
          )}
        </div>
        <div className="tool-filters" role="group" aria-label="Filter tools by category">
          {(['All', ...toolCategories] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`tool-filter ${category === item ? 'active' : ''}`}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
              <span>
                {item === 'All'
                  ? toolDefinitions.length
                  : toolDefinitions.filter((tool) => tool.category === item).length}
              </span>
            </button>
          ))}
        </div>
      </Card>
      <p className="muted tool-count" role="status">
        {matches.length} {matches.length === 1 ? 'tool' : 'tools'}
        {query ? ` matching “${query}”` : ' ready to use'}
      </p>
      {matches.length ? (
        <div className="calculator-tool-grid">
          {matches.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.id}
                to={`/tools/${tool.id}`}
                className="tool-card calculator-tool-card"
              >
                <div className="calculator-tool-top">
                  <span className="icon-box">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <span className="calculator-tool-category">{tool.category}</span>
                </div>
                <h2>{tool.title}</h2>
                <p>{tool.description}</p>
                <span className="calculator-tool-open">
                  Open tool <ArrowRight size={16} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card className="calculator-no-results">
          <Search size={28} aria-hidden="true" />
          <h2>No matching tools</h2>
          <p className="muted">Try a shorter search, or browse the complete tool collection.</p>
          <Button
            onClick={() => {
              setQuery('');
              setCategory('All');
            }}
          >
            Show all tools
          </Button>
        </Card>
      )}
      <div className="calculator-catalog-footer">
        <span>New to subnetting?</span>
        <Link to="/learn">
          Start with the learning path <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
