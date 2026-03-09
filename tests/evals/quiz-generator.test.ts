import { describe, it, expect } from 'vitest';
import { pickQuizFormat, gradeMCAnswer } from '../../src/agent/quizGenerator';
import type { QuizData } from '../../src/agent/quizTypes';

describe('pickQuizFormat', () => {
  it('returns mc for K-2', () => {
    expect(pickQuizFormat('K', 3)).toBe('mc');
    expect(pickQuizFormat('1', 5)).toBe('mc');
    expect(pickQuizFormat('2', 10)).toBe('mc');
  });

  it('returns mc for grades 3-5', () => {
    expect(pickQuizFormat('3', 6)).toBe('mc');
    expect(pickQuizFormat('5', 1)).toBe('mc');
  });

  it('returns fr-text for 6-8 with >= 4 components', () => {
    expect(pickQuizFormat('7', 5)).toBe('fr-text');
    expect(pickQuizFormat('6', 4)).toBe('fr-text');
  });

  it('returns mc for 6-8 with < 4 components', () => {
    expect(pickQuizFormat('7', 2)).toBe('mc');
    expect(pickQuizFormat('8', 3)).toBe('mc');
  });

  it('returns mc for high school', () => {
    expect(pickQuizFormat('9', 10)).toBe('mc');
    expect(pickQuizFormat('12', 5)).toBe('mc');
  });

  it('forceFormat overrides everything', () => {
    expect(pickQuizFormat('7', 2, 'fr-text')).toBe('fr-text');
    expect(pickQuizFormat('K', 1, 'fr-visual')).toBe('fr-visual');
  });
});

describe('gradeMCAnswer', () => {
  const quiz: QuizData = {
    format: 'mc',
    nodeId: 'n1',
    kgNodeId: 'kg1',
    questionText: 'What is 2+2?',
    options: ['3', '4', '5', '6'],
    correctIndex: 1,
    components: ['c1'],
  };

  it('returns correct for right answer', () => {
    const result = gradeMCAnswer(quiz, 1);
    expect(result.correct).toBe(true);
    expect(result.feedback).toContain('right');
  });

  it('returns incorrect with the correct answer in feedback', () => {
    const result = gradeMCAnswer(quiz, 0);
    expect(result.correct).toBe(false);
    expect(result.feedback).toContain('4');
  });
});
