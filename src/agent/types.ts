import type { ShapeType } from '../types/board';

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent' | 'status' | 'error';
  content: string;
  timestamp: number;
  options?: string[];
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

export type ProgressCallback = (status: AgentMessage) => void;

export type SupportedShapeType = Exclude<ShapeType, 'connector'>;

export interface ViewportCenter {
  x: number;
  y: number;
  bounds?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
    scale: number;
  };
}
