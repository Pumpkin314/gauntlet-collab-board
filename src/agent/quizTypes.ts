export type Confidence = 'gray' | 'green' | 'yellow' | 'red';

export type QuizFormat = 'mc' | 'fr-text' | 'fr-visual';

export interface QuizData {
  format: QuizFormat;
  nodeId: string;
  kgNodeId: string;
  questionText: string;
  options?: string[];
  correctIndex?: number;
  components: string[];
}

export interface QuizResult {
  correct: boolean;
  partial?: boolean;
  llmConfidence?: number;
  feedback: string;
  newConfidence: Confidence;
}

export interface SpawnInstruction {
  kgNodeId: string;
  lane: string;
  laneColor: string;
  x: number;
  y: number;
  code: string;
  description: string;
}

export interface EdgeInstruction {
  sourceKgNodeId: string;
  targetKgNodeId: string;
}
