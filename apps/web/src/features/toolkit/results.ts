import {
  ENGINE_VERSION,
  type CalculationResult,
  type CellValue,
  type ExplanationStep,
  type ResultColumn,
  type ResultField,
} from '@subnetiq/shared';

export function toolkitResult(
  toolId: string,
  title: string,
  normalizedInput: Record<string, unknown>,
  summary: ResultField[],
  options: {
    rows?: Record<string, CellValue>[];
    columns?: ResultColumn[];
    steps?: ExplanationStep[];
    warnings?: string[];
    sources?: string[];
    data?: Record<string, unknown>;
  } = {},
): CalculationResult {
  return {
    toolId,
    title,
    normalizedInput,
    summary,
    steps: options.steps ?? [],
    warnings: options.warnings ?? [],
    engineVersion: ENGINE_VERSION,
    ...options,
  };
}

export function messageFrom(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The operation could not be completed. Check the input and try again.';
}

export function matchesQuery(query: string, values: unknown[]): boolean {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const searchable = values
    .map((value) => String(value ?? ''))
    .join(' ')
    .toLocaleLowerCase();
  return words.every((word) => searchable.includes(word));
}
