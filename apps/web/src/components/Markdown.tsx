import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy } from 'lucide-react';
import { notify } from '@/lib/notify';

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children: label, href }) => (
            <a
              href={href}
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noreferrer' : undefined}
            >
              {label}
            </a>
          ),
          pre: ({ children: content }) => (
            <div className="markdown-code">
              <pre>{content}</pre>
              <button
                className="icon-button no-print"
                aria-label="Copy code"
                onClick={(event) => {
                  const code =
                    event.currentTarget.parentElement?.querySelector('code')?.textContent;
                  if (code)
                    void navigator.clipboard
                      .writeText(code)
                      .then(() => notify('Code copied'))
                      .catch(() => notify('Clipboard unavailable.', 'error'));
                }}
              >
                <Copy size={13} />
              </button>
            </div>
          ),
          table: ({ children: content }) => (
            <div className="table-wrap">
              <table>{content}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
