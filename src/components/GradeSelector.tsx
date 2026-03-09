import { useCallback } from 'react';

interface GradeSelectorProps {
  onSelectGrade: (grade: string) => void;
}

const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', 'HS'] as const;

const EXPLORER_COLOR = '#7C4DFF';

export default function GradeSelector({ onSelectGrade }: GradeSelectorProps) {
  const handleClick = useCallback(
    (grade: string) => () => onSelectGrade(grade),
    [onSelectGrade],
  );

  return (
    <div style={{ padding: '24px 16px', textAlign: 'center' }}>
      <h3 style={{
        fontSize: 15,
        fontWeight: 600,
        color: '#333',
        marginBottom: 16,
      }}>
        Choose a grade to explore
      </h3>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}>
        {GRADES.map((grade) => (
          <button
            key={grade}
            onClick={handleClick(grade)}
            style={{
              background: 'white',
              color: EXPLORER_COLOR,
              border: `1.5px solid ${EXPLORER_COLOR}`,
              borderRadius: 10,
              padding: '10px 0',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              ...(grade === 'HS' ? { gridColumn: '1 / -1' } : {}),
            }}
          >
            {grade === 'HS' ? 'High School' : `Grade ${grade}`}
          </button>
        ))}
      </div>
    </div>
  );
}
