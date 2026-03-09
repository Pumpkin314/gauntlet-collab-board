import type { QuizData, QuizFormat } from './quizTypes';
import type { StandardNode, LearningComponent } from '../data/knowledge-graph-v2/index';
import { callAnthropic } from './apiClient';

export function pickQuizFormat(
  grade: string,
  componentCount: number,
  forceFormat?: QuizFormat,
): QuizFormat {
  if (forceFormat) return forceFormat;

  const g = grade.toUpperCase();
  if (g === 'K' || g === '1' || g === '2') return 'mc';
  if (g === '3' || g === '4' || g === '5') return 'mc';
  if (g === '6' || g === '7' || g === '8') {
    return componentCount >= 4 ? 'fr-text' : 'mc';
  }
  return 'mc';
}

function extractJSON(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const toParse = fenced ? fenced[1].trim() : text.trim();
  return JSON.parse(toParse);
}

export async function generateMCQuiz(
  node: StandardNode,
  components: LearningComponent[],
  grade: string,
): Promise<QuizData> {
  const componentContext = components.map((c) => c.description).join('; ');
  const systemPrompt =
    `You are a math quiz generator for grade ${grade} students. ` +
    `Generate a multiple choice question about ${node.description} (${node.code}). ` +
    `Use these learning components as context: ${componentContext}. ` +
    `Return JSON: { questionText, options (4 strings), correctIndex (0-3) }. ` +
    `Make the question age-appropriate and encouraging.`;

  const parse = (text: string): { questionText: string; options: string[]; correctIndex: number } => {
    const obj = extractJSON(text) as Record<string, unknown>;
    return {
      questionText: obj.questionText as string,
      options: obj.options as string[],
      correctIndex: obj.correctIndex as number,
    };
  };

  let parsed: ReturnType<typeof parse>;
  try {
    const resp = await callAnthropic(
      [{ role: 'user', content: 'Generate the quiz question now.' }],
      [],
      systemPrompt,
      { maxTokens: 512 },
    );
    const text = resp.content.find((b) => b.type === 'text')?.text ?? '';
    parsed = parse(text);
  } catch {
    const retryPrompt =
      systemPrompt +
      ' You MUST respond with ONLY valid JSON, no markdown or explanation.';
    const resp = await callAnthropic(
      [{ role: 'user', content: 'Generate the quiz question now. Respond with only JSON.' }],
      [],
      retryPrompt,
      { maxTokens: 512 },
    );
    const text = resp.content.find((b) => b.type === 'text')?.text ?? '';
    parsed = parse(text);
  }

  return {
    format: 'mc',
    nodeId: '',
    kgNodeId: node.id,
    questionText: parsed.questionText,
    options: parsed.options,
    correctIndex: parsed.correctIndex,
    components: components.map((c) => c.id),
  };
}

export async function generateFRQuiz(
  node: StandardNode,
  components: LearningComponent[],
  grade: string,
): Promise<QuizData> {
  const componentContext = components.map((c) => c.description).join('; ');
  const systemPrompt =
    `You are a math quiz generator for grade ${grade} students. ` +
    `Generate a free-response question about ${node.description} (${node.code}). ` +
    `Use these learning components as context: ${componentContext}. ` +
    `Return JSON: { questionText }. ` +
    `Make the question age-appropriate and encouraging.`;

  const parse = (text: string): { questionText: string } => {
    const obj = extractJSON(text) as Record<string, unknown>;
    return { questionText: obj.questionText as string };
  };

  let parsed: ReturnType<typeof parse>;
  try {
    const resp = await callAnthropic(
      [{ role: 'user', content: 'Generate the quiz question now.' }],
      [],
      systemPrompt,
      { maxTokens: 512 },
    );
    const text = resp.content.find((b) => b.type === 'text')?.text ?? '';
    parsed = parse(text);
  } catch {
    const retryPrompt =
      systemPrompt +
      ' You MUST respond with ONLY valid JSON, no markdown or explanation.';
    const resp = await callAnthropic(
      [{ role: 'user', content: 'Generate the quiz question now. Respond with only JSON.' }],
      [],
      retryPrompt,
      { maxTokens: 512 },
    );
    const text = resp.content.find((b) => b.type === 'text')?.text ?? '';
    parsed = parse(text);
  }

  return {
    format: 'fr-text',
    nodeId: '',
    kgNodeId: node.id,
    questionText: parsed.questionText,
    components: components.map((c) => c.id),
  };
}

export function gradeMCAnswer(
  quiz: QuizData,
  answerIndex: number,
): { correct: boolean; feedback: string } {
  if (answerIndex === quiz.correctIndex) {
    return { correct: true, feedback: "That's right! Great job!" };
  }
  const correctOption = quiz.options?.[quiz.correctIndex ?? 0] ?? '';
  return {
    correct: false,
    feedback: `Not quite. The answer is "${correctOption}".`,
  };
}

export async function gradeFRAnswer(
  quiz: QuizData,
  answer: string,
  node: StandardNode,
  grade: string,
): Promise<{ correct: boolean; partial: boolean; llmConfidence: number; feedback: string }> {
  const systemPrompt =
    `You are grading a math answer for a grade ${grade} student. ` +
    `Question: ${quiz.questionText}. Topic: ${node.description}. ` +
    `Student's answer: ${answer}. ` +
    `Evaluate and return JSON: { correct (boolean), partial (boolean - true if partially correct), ` +
    `confidence (0-1, how confident you are the student understands), feedback (encouraging, 1-2 sentences) }.`;

  const resp = await callAnthropic(
    [{ role: 'user', content: 'Grade the answer now.' }],
    [],
    systemPrompt,
    { maxTokens: 256 },
  );
  const text = resp.content.find((b) => b.type === 'text')?.text ?? '';
  const obj = extractJSON(text) as Record<string, unknown>;

  return {
    correct: obj.correct as boolean,
    partial: obj.partial as boolean,
    llmConfidence: obj.confidence as number,
    feedback: obj.feedback as string,
  };
}
