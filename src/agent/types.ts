import type { ShapeType } from '../types/board';

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent' | 'status' | 'error';
  content: string;
  timestamp: number;
}

export interface AgentToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ExecutionResult {
  success: boolean;
  objectId?: string;
  error?: string;
}

export interface PipelineResult {
  messages: AgentMessage[];
  executionResults: ExecutionResult[];
}

export type SupportedShapeType = Exclude<ShapeType, 'connector'>;

export interface ViewportCenter {
  x: number;
  y: number;
}
