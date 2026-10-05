import { useDeferredValue, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Binary,
  CheckCheck,
  ChevronRight,
  Loader2,
  Map,
  RotateCcw,
} from 'lucide-react';
import { calculate } from '@subnetiq/netcalc';
import type { CalculationResult, ToolId } from '@subnetiq/shared';
import ResultPanel from '@/components/ResultPanel';
import { FavoriteButton } from '@/components/FavoriteButton';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/notify';
import ToolInputs from './ToolInputs';
import { AllocationVisualizer, IPv4BitVisualizer, IPv6PrefixVisualizer } from './Visualizers';
import {
  freshDefaults,
  inputText,
  prepareCalculationInput,
  readToolInput,
  type DraftInput,
} from './inputModel';
import { toolById, toolDefinitions, type ToolDefinition } from './toolDefinitions';
import './calculators.css';

interface Computation {
  input: Record<string, unknown>;
  result?: CalculationResult;
  error?: string;
}

function CalculatorWorkspace({ tool, search }: { tool: ToolDefinition; search: string }) {
  const [initial] = useState(() => readToolInput(tool, search));
  const [draft, setDraft] = useState<DraftInput>(initial.input);
  const [sharedInputError, setSharedInputError] = useState(initial.error);
  const [formVersion, setFormVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [visualizerOpen, setVisualizerOpen] = useState(
    tool.id === 'vlsm' || tool.id === 'ipv4-split' || tool.id === 'ipv6-plan',
  );
  const deferredDraft = useDeferredValue(draft);
  const { user } = useAuth();
  const resultRegion = useRef<HTMLDivElement>(null);
  const computation = useMemo<Computation>(() => {
    const input = prepareCalculationInput(tool.id, deferredDraft);
    try {
      return { input, result: calculate(tool.id, input) };
    } catch (error) {
      return {
        input,
        error:
          error instanceof Error
            ? error.message
            : 'This input could not be calculated. Check the address and options.',
      };
    }
  }, [tool.id, deferredDraft]);
  const updating = deferredDraft !== draft;
  const hasBinaryView = tool.id === 'ipv4-subnet' || tool.id === 'ipv6-subnet';
  const hasAllocationView =
    Boolean(computation.result?.blocks?.length) &&
    ['ipv4-split', 'vlsm', 'ipv6-plan'].includes(tool.id);
  const relatedTools = toolDefinitions
    .filter((candidate) => candidate.id !== tool.id && candidate.category === tool.category)
    .slice(0, 3);
  const Icon = tool.icon;
  const returnTo = `/tools/${tool.id}?input=${encodeURIComponent(JSON.stringify(prepareCalculationInput(tool.id, draft)))}`;
  const signInPath = `/auth?returnTo=${encodeURIComponent(returnTo.length <= 8000 ? returnTo : `/tools/${tool.id}`)}`;
  const update = (key: string, value: unknown) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const reset = () => {
    setDraft(freshDefaults(tool));
    setSharedInputError(undefined);
    setFormVersion((value) => value + 1);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resultRegion.current?.focus();
  };
  const save = async () => {
    if (!user || !computation.result || saving) return;
    if (updating) {
      notify('Wait for the current calculation to finish, then save.', 'info');
      return;
    }
    setSaving(true);
    try {
      await api('/saved-calculations', {
        method: 'POST',
        body: JSON.stringify({
          tool_id: tool.id,
          name: computation.result.title,
          input: computation.input,
        }),
      });
      notify('Calculation saved to your account.');
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'The calculation could not be saved. Please try again.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page calculator-workspace">
      <nav className="calculator-breadcrumb" aria-label="Breadcrumb">
        <Link to="/tools">All tools</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span>{tool.category}</span>
      </nav>
      <PageHeader
        eyebrow={
          <span className="calculator-title-eyebrow">
            <Icon size={16} aria-hidden="true" />
            {tool.category} tools
          </span>
        }
        title={tool.title}
        description={tool.description}
        actions={
          <div className="row">
            <FavoriteButton toolId={tool.id} label={tool.title} signInPath={signInPath} />
            <Button variant="secondary" onClick={reset}>
              <RotateCcw size={16} aria-hidden="true" />
              Reset example
            </Button>
          </div>
        }
      />
      {sharedInputError && (
        <div className="warning-banner" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{sharedInputError}</span>
        </div>
      )}
      <div className="calculator-layout">
        <aside className="calculator-input-column" aria-label="Calculation inputs">
          <Card className="calculator-input-card">
            <form noValidate onSubmit={submit}>
              <div className="card-header calculator-input-header">
                <h2>Inputs</h2>
                <span className="calculator-live-label">
                  <i />
                  Live calculation
                </span>
              </div>
              <div className="stack calculator-form-fields">
                <ToolInputs key={formVersion} toolId={tool.id} draft={draft} onChange={update} />
              </div>
              <div className="calculator-input-actions">
                <Button type="submit">
                  Calculate <ArrowRight size={16} aria-hidden="true" />
                </Button>
                <span>Results update as you type.</span>
              </div>
            </form>
          </Card>
          {!user && (
            <div className="calculator-guest-note">
              <span>Working as a guest</span>
              <p>
                Calculations run in your browser.{' '}
                <Link to={signInPath}>Sign in to save your work.</Link>
              </p>
              {returnTo.length > 8000 && (
                <p>Export this large plan before signing in so you can reopen its inputs.</p>
              )}
            </div>
          )}
          <div className="calculator-learning-link">
            <Binary size={18} aria-hidden="true" />
            <div>
              <strong>Make the math click.</strong>
              <p>
                <Link to="/learn">Follow the learning path</Link> or{' '}
                <Link to="/practice">try a practice question.</Link>
              </p>
            </div>
          </div>
        </aside>
        <div
          className="calculator-results-column"
          ref={resultRegion}
          tabIndex={-1}
          role="region"
          aria-label="Calculation output"
          aria-busy={updating}
        >
          <div className="calculator-output-toolbar">
            <span className="calculator-output-state" role="status">
              {updating ? (
                <>
                  <Loader2 size={15} className="calculator-spinning" aria-hidden="true" />
                  Updating…
                </>
              ) : computation.result ? (
                <>
                  <CheckCheck size={15} aria-hidden="true" />
                  Calculated locally
                </>
              ) : (
                <>
                  <AlertCircle size={15} aria-hidden="true" />
                  Input needs attention
                </>
              )}
            </span>
            {(hasBinaryView || hasAllocationView) && (
              <Button
                variant="ghost"
                aria-expanded={visualizerOpen}
                aria-controls="calculator-visual-lab"
                onClick={() => setVisualizerOpen((value) => !value)}
              >
                {hasBinaryView ? (
                  <Binary size={16} aria-hidden="true" />
                ) : (
                  <Map size={16} aria-hidden="true" />
                )}
                {visualizerOpen ? 'Hide' : 'Show'} {hasBinaryView ? 'visual lab' : 'address map'}
              </Button>
            )}
          </div>
          {computation.result ? (
            <>
              {visualizerOpen && (hasBinaryView || hasAllocationView) && (
                <div id="calculator-visual-lab" className="calculator-visual-lab">
                  {tool.id === 'ipv4-subnet' && (
                    <IPv4BitVisualizer
                      address={inputText(draft.address)}
                      onChange={(value) => update('address', value)}
                    />
                  )}
                  {tool.id === 'ipv6-subnet' && (
                    <IPv6PrefixVisualizer
                      address={inputText(draft.address)}
                      onChange={(value) => update('address', value)}
                    />
                  )}
                  {hasAllocationView && (
                    <AllocationVisualizer result={computation.result} input={computation.input} />
                  )}
                </div>
              )}
              {saving && (
                <p className="calculator-saving" role="status">
                  <Loader2 size={15} className="calculator-spinning" aria-hidden="true" />
                  Saving calculation…
                </p>
              )}
              <ResultPanel result={computation.result} onSave={user ? save : undefined} />
            </>
          ) : (
            <Card className="calculator-validation">
              <span className="calculator-validation-icon">
                <AlertCircle size={25} aria-hidden="true" />
              </span>
              <h2>Check your input</h2>
              <p role="status">{computation.error}</p>
              <span className="muted">
                Correct the value in the form. Your result will update automatically.
              </span>
              <Button variant="secondary" onClick={reset}>
                <RotateCcw size={15} aria-hidden="true" />
                Restore the example
              </Button>
            </Card>
          )}
        </div>
      </div>
      {relatedTools.length > 0 && (
        <section className="calculator-related-tools" aria-labelledby="related-tool-heading">
          <div className="calculator-related-header">
            <h2 id="related-tool-heading">Keep exploring</h2>
            <Link to="/tools">
              View all tools <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid-3">
            {relatedTools.map((related) => {
              const RelatedIcon = related.icon;
              return (
                <Link
                  className="calculator-related-card"
                  key={related.id}
                  to={`/tools/${related.id}`}
                >
                  <RelatedIcon size={19} aria-hidden="true" />
                  <span>{related.title}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ToolPage() {
  const { toolId } = useParams();
  const location = useLocation();
  const tool = toolById.get(toolId as ToolId);
  if (!tool) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Tool collection"
          title="This tool could not be found."
          description="Choose from the IPv4, IPv6, planning, and networking utilities in the collection."
        />
        <Card className="calculator-no-results">
          <Badge>Unknown tool</Badge>
          <p>The requested tool identifier is not part of this release.</p>
          <Link className="button button-primary" to="/tools">
            <ArrowLeft size={16} aria-hidden="true" />
            Browse all tools
          </Link>
        </Card>
      </div>
    );
  }
  return (
    <CalculatorWorkspace
      key={`${tool.id}:${location.search}`}
      tool={tool}
      search={location.search}
    />
  );
}
