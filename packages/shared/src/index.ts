import { z } from 'zod';

export const ENGINE_VERSION = '1.0.0';
export const toolIds = [
  'ipv4-subnet',
  'ipv4-split',
  'vlsm',
  'aggregate',
  'range-to-cidr',
  'cidr-to-range',
  'overlap',
  'wildcard',
  'convert',
  'classify',
  'reverse-dns',
  'netmask-table',
  'ipv6-subnet',
  'ipv6-format',
  'eui64',
  'ipv6-plan',
  'ipv4-map',
  'bandwidth',
  'mtu',
  'mac',
] as const;
export type ToolId = (typeof toolIds)[number];
export type CellValue = string | number | boolean | null;
export interface ResultField {
  label: string;
  value: CellValue;
  description?: string;
}
export interface ResultColumn {
  key: string;
  label: string;
}
export interface ExplanationStep {
  title: string;
  description: string;
  formula?: string;
}
export interface AllocationBlock {
  name: string;
  cidr: string;
  start: string;
  end: string;
  size: string;
  requested?: number;
  capacity?: string;
  color?: string;
  locked?: boolean;
}
export interface CalculationResult {
  toolId: string;
  title: string;
  normalizedInput: Record<string, unknown>;
  summary: ResultField[];
  rows?: Record<string, CellValue>[];
  columns?: ResultColumn[];
  steps: ExplanationStep[];
  warnings: string[];
  blocks?: AllocationBlock[];
  data?: Record<string, unknown>;
  sources?: string[];
  engineVersion: string;
}
export type NetworkPolicy = 'lan' | 'point-to-point' | 'aws' | 'azure' | 'gcp';
export interface SegmentInput {
  name: string;
  hosts: number;
  growthPercent?: number;
  lockedCidr?: string;
  policy?: NetworkPolicy;
}
export interface Project {
  id: string;
  owner_id?: string;
  name: string;
  description: string;
  address_space: string;
  plan: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  archived?: boolean;
}
export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at?: string;
}
export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}
export interface QuizQuestion {
  id: string;
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'exam';
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}
export interface GlossaryEntry {
  id: string;
  term: string;
  category: string;
  definition: string;
  example: string;
  related: string[];
}
export const calculationSchema = z.object({ tool: z.enum(toolIds), input: z.record(z.unknown()) });
export const projectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(3000).default(''),
  address_space: z.string().max(100).default('default'),
  plan: z.record(z.unknown()).default({}),
  version: z.number().int().positive().optional(),
  archived: z.boolean().optional(),
});
export const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(16000) }))
    .min(1)
    .max(30),
  context: z.record(z.unknown()).optional(),
  conversationId: z.string().uuid().optional(),
});
export interface ApiErrorBody {
  error: { code: string; message: string; requestId?: string; details?: unknown };
}
export { generatePracticeQuestion, fromGeneratedId } from './practice.js';
export type { PracticeDifficulty } from './practice.js';
