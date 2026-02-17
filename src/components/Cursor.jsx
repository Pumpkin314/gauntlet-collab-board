import { Group, Rect, Text, Path } from 'react-konva';

/**
 * Cursor Component
 * Renders another user's cursor with their name label
 */
export default function Cursor({ data }) {
  const { cursorX, cursorY, userName, userColor } = data;

  // Calculate label dimensions
  const labelPadding = 6;
  const fontSize = 12;
  const labelWidth = userName.length * (fontSize * 0.6) + labelPadding * 2;
  const labelHeight = fontSize + labelPadding * 2;

  return (
    <Group x={cursorX} y={cursorY}>
      {/* Cursor pointer (SVG-like path) */}
      <Path
        data="M 0 0 L 0 20 L 5 15 L 9 24 L 12 22 L 8 13 L 15 13 Z"
        fill={userColor}
        stroke="white"
        strokeWidth={1}
        shadowBlur={4}
        shadowColor="rgba(0,0,0,0.3)"
        shadowOffset={{ x: 1, y: 1 }}
      />

      {/* Name label */}
      <Group x={18} y={8}>
        {/* Background rectangle */}
        <Rect
          width={labelWidth}
          height={labelHeight}
          fill={userColor}
          cornerRadius={4}
          shadowBlur={4}
          shadowColor="rgba(0,0,0,0.2)"
          shadowOffset={{ x: 1, y: 1 }}
        />
        {/* Text */}
        <Text
          x={labelPadding}
          y={labelPadding}
          text={userName}
          fontSize={fontSize}
          fill="white"
          fontStyle="bold"
        />
      </Group>
    </Group>
  );
}
