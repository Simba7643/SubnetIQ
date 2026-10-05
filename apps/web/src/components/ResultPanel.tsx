import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  FolderPlus,
  Printer,
  Share2,
  Sparkles,
  CheckCheck,
  ListOrdered,
  Bookmark,
} from 'lucide-react';
import { toolIds, type CalculationResult } from '@subnetiq/shared';
import { Button, Card, Badge } from './ui';
import { downloadFile, exportResultPdf, resultCsv, resultText } from '@/lib/export';
import { usePreferences } from '@/lib/preferences';
import { notify } from '@/lib/notify';

export default function ResultPanel({
  result,
  onSave,
}: {
  result: CalculationResult;
  onSave?: () => void | Promise<void>;
}) {
  const showSteps = usePreferences((state) => state.showSteps);
  const setShowSteps = usePreferences((state) => state.setShowSteps);
  const [busy, setBusy] = useState(false);
  const knownTool = (toolIds as readonly string[]).includes(result.toolId);
  const copy = async (text: string, message = 'Copied to clipboard') => {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      notify('Clipboard access was denied. Select and copy the result text.', 'error');
    }
  };
  const share = async () => {
    if (!knownTool) {
      if (navigator.share) {
        try {
          await navigator.share({ title: result.title, text: resultText(result) });
        } catch (error) {
          if (!(error instanceof Error && error.name === 'AbortError'))
            await copy(resultText(result));
        }
      } else await copy(resultText(result));
      return;
    }
    const url = new URL(`/tools/${result.toolId}`, location.origin);
    url.searchParams.set('input', JSON.stringify(result.normalizedInput));
    if (url.toString().length > 8000) {
      notify('This plan is too large for a URL. Save it as a project or export JSON.', 'info');
      return;
    }
    await copy(url.toString(), 'Calculation link copied');
  };
  const pdf = async () => {
    setBusy(true);
    try {
      await exportResultPdf(result);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'PDF export failed.', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="result-panel stack" aria-label="Calculation result" aria-live="polite">
      <Card>
        <div className="card-header">
          <div className="row">
            <span className="status-dot" />
            <h2>{result.title}</h2>
          </div>
          <Badge>
            <CheckCheck size={13} />
            {knownTool ? 'Calculated locally' : 'Result & reference'}
          </Badge>
        </div>
        <dl className="result-grid">
          {result.summary.map((field, index) => (
            <div className="result-field" key={`${field.label}-${index}`}>
              <dt>{field.label}</dt>
              <dd dir="ltr">{String(field.value ?? '—')}</dd>
              {field.description && <p>{field.description}</p>}
            </div>
          ))}
        </dl>
        {result.warnings.length > 0 && (
          <div className="warning-banner">
            <strong>Notes & limitations</strong>
            <ul>
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
        {result.rows && result.columns && (
          <div className="table-wrap result-table">
            <table className="data-table">
              <caption className="sr-only">{result.title} details</caption>
              <thead>
                <tr>
                  {result.columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={index}>
                    {result.columns!.map((column) => (
                      <td key={column.key}>{String(row[column.key] ?? '—')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="result-actions no-print">
          <Button variant="secondary" onClick={() => void copy(resultText(result))}>
            <Copy size={15} />
            Copy
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              downloadFile(`subnetiq-${result.toolId}.json`, JSON.stringify(result, null, 2))
            }
          >
            <FileJson size={15} />
            JSON
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              downloadFile(
                `subnetiq-${result.toolId}.csv`,
                resultCsv(result),
                'text/csv;charset=utf-8',
              )
            }
          >
            <FileSpreadsheet size={15} />
            CSV
          </Button>
          <Button variant="ghost" onClick={() => void pdf()} disabled={busy}>
            <Download size={15} />
            {busy ? 'Exporting…' : 'PDF'}
          </Button>
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer size={15} />
            Print
          </Button>
          <Button variant="ghost" onClick={() => void share()}>
            <Share2 size={15} />
            Share
          </Button>
          {onSave && (
            <Button variant="ghost" onClick={() => void onSave()}>
              <Bookmark size={15} />
              Save
            </Button>
          )}
        </div>
      </Card>
      {result.steps.length > 0 && (
        <Card className="steps-card">
          <div className="card-header">
            <h2>
              <ListOrdered size={19} /> Understand the result
            </h2>
            <label className="switch-label no-print">
              <input
                type="checkbox"
                checked={showSteps}
                onChange={(event) => setShowSteps(event.target.checked)}
              />
              Show the work
            </label>
          </div>
          {showSteps && (
            <ol className="explanation-list">
              {result.steps.map((step, index) => (
                <li key={`${step.title}-${index}`}>
                  <span className="step-number">{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    {step.formula && (
                      <code className="formula" dir="ltr">
                        {step.formula}
                      </code>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
      {knownTool && (
        <div className="row no-print result-handoff">
          <Link className="button button-secondary" to="/projects" state={{ calculation: result }}>
            <FolderPlus size={16} />
            Add to a project
          </Link>
          <Link className="button button-ghost" to="/assistant" state={{ calculation: result }}>
            <Sparkles size={16} />
            Discuss this result
          </Link>
          <span className="muted small">Engine {result.engineVersion}</span>
        </div>
      )}
      {Boolean(result.sources?.length) && (
        <details className="source-details">
          <summary>Standards &amp; sources</summary>
          <ul>
            {result.sources!.map((source) => (
              <li key={source}>
                {/^https?:\/\//.test(source) ? (
                  <a href={source} target="_blank" rel="noreferrer">
                    {source}
                  </a>
                ) : (
                  source
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export { ResultPanel };
