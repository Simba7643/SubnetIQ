import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, BookOpen, Search, X } from 'lucide-react';
import { toolDefinitions } from '@/features/calculators/toolDefinitions';
import glossary from '@data/glossary.json';
import { useTranslations } from '@/lib/i18n';

const pages = [
  { title: 'Learning path', to: '/learn', category: 'Learn', keywords: 'course lessons' },
  {
    title: 'Practice lab',
    to: '/practice',
    category: 'Learn',
    keywords: 'quiz test exam subnetting',
  },
  {
    title: 'Networking glossary',
    to: '/glossary',
    category: 'Reference',
    keywords: 'definitions terms',
  },
  {
    title: 'Network and security toolkit',
    to: '/toolkit',
    category: 'Tools',
    keywords: 'ports dns whois rdap firewall cvss password hash',
  },
  {
    title: 'Network templates',
    to: '/templates',
    category: 'Planning',
    keywords: 'office branch campus lab',
  },
  {
    title: 'My projects',
    to: '/projects',
    category: 'Workspace',
    keywords: 'save saved networks plans',
  },
  { title: 'AI assistant', to: '/assistant', category: 'Workspace', keywords: 'chat questions' },
  {
    title: 'Networking cheat sheets',
    to: '/cheatsheets',
    category: 'Learn',
    keywords: 'print masks ports',
  },
  { title: 'Networking articles', to: '/blog', category: 'Learn', keywords: 'blog guides' },
  {
    title: 'My account',
    to: '/account',
    category: 'Workspace',
    keywords: 'settings profile saved favorites',
  },
];
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const t = useTranslations();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const all = [
    ...toolDefinitions.map((tool) => ({
      title: tool.title,
      to: `/tools/${tool.id}`,
      category: tool.category,
      keywords: tool.keywords.join(' '),
    })),
    ...pages,
  ];
  const needle = query.toLowerCase().trim();
  const results = needle
    ? [
        ...all.filter((entry) => `${entry.title} ${entry.keywords}`.toLowerCase().includes(needle)),
        ...glossary
          .filter((entry) => entry.term.toLowerCase().includes(needle))
          .slice(0, 5)
          .map((entry) => ({
            title: entry.term,
            to: `/glossary?q=${encodeURIComponent(entry.term)}`,
            category: 'Glossary',
            keywords: '',
          })),
      ].slice(0, 12)
    : all.slice(0, 7);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setQuery('');
      }}
    >
      <Dialog.Trigger asChild>
        <button className="topbar-search">
          <Search size={17} />
          <span>{t.common.search}</span>
          <kbd>⌘ / Ctrl K</kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <Dialog.Title className="sr-only">Find a tool or resource</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search calculators, pages, and glossary terms. Use Tab to navigate results and Enter to
            open one.
          </Dialog.Description>
          <div className="command-search">
            <Search size={20} />
            <input
              className="input"
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="What are you working on?"
              aria-label="Search tools and resources"
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  listRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
                } else if (event.key === 'Enter' && results[0]) {
                  navigate(results[0].to);
                  setOpen(false);
                  setQuery('');
                }
              }}
            />
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="Close search">
                <X size={17} />
              </button>
            </Dialog.Close>
          </div>
          <div className="command-list" ref={listRef}>
            {results.map((result) => (
              <Link
                key={result.to}
                to={result.to}
                className="command-result"
                onClick={() => {
                  setOpen(false);
                  setQuery('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    (event.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    const prior = event.currentTarget.previousElementSibling as HTMLElement | null;
                    if (prior) prior.focus();
                    else inputRef.current?.focus();
                  }
                }}
              >
                <BookOpen size={17} />
                <div>
                  {result.title}
                  <small>{result.category}</small>
                </div>
                <ArrowUpRight size={13} style={{ marginInlineStart: 'auto' }} />
              </Link>
            ))}
            {!results.length && (
              <p className="muted" style={{ padding: 20 }}>
                No matching tools or concepts. Try “IPv6”, “VLSM”, or “DNS”.
              </p>
            )}
          </div>
          <div
            className="muted small"
            style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 10 }}
          >
            ↑ ↓ to navigate · Enter to open · Esc to close
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
