import { memo, useRef, useEffect, useCallback } from 'react';
import { Group, Rect, Text, Path } from 'react-konva';
import Konva from 'konva';

interface PresenceUser {
  id: string;
  cursorX: number;
  cursorY: number;
  userName: string;
  userColor: string;
}

const SMOOTHING = 0.3;
const SNAP_THRESHOLD = 0.5;

/** Module-level map: userId → current lerp distance (px) to target. Read by DebugOverlay. */
export const cursorDeltas = new Map<string, number>();

/** Memoized: prevents every cursor from re-rendering when one peer moves. */
export default memo(function Cursor({ data }: { data: PresenceUser }) {
  const { cursorX, cursorY, userName, userColor } = data;

  const groupRef = useRef<Konva.Group>(null);
  const displayPos = useRef({ x: cursorX, y: cursorY });
  const rafId = useRef<number>(0);

  const animate = useCallback(() => {
    const node = groupRef.current;
    if (!node) return;

    // Lerp toward target
    displayPos.current.x += (cursorX - displayPos.current.x) * SMOOTHING;
    displayPos.current.y += (cursorY - displayPos.current.y) * SMOOTHING;

    node.x(displayPos.current.x);
    node.y(displayPos.current.y);
    node.getLayer()?.batchDraw();

    const remainX = cursorX - displayPos.current.x;
    const remainY = cursorY - displayPos.current.y;
    const delta = Math.hypot(remainX, remainY);
    cursorDeltas.set(data.id, delta);

    if (delta > SNAP_THRESHOLD) {
      rafId.current = requestAnimationFrame(animate);
    } else {
      // Snap to exact target
      displayPos.current.x = cursorX;
      displayPos.current.y = cursorY;
      node.x(cursorX);
      node.y(cursorY);
      node.getLayer()?.batchDraw();
      cursorDeltas.set(data.id, 0);
      rafId.current = 0;
    }
  }, [cursorX, cursorY, data.id]);

  useEffect(() => {
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(animate);
    }
    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = 0;
      }
      cursorDeltas.delete(data.id);
    };
  }, [animate, data.id]);

  const labelPadding = 6;
  const fontSize = 12;
  const labelWidth = userName.length * (fontSize * 0.6) + labelPadding * 2;
  const labelHeight = fontSize + labelPadding * 2;

  return (
    <Group ref={groupRef} x={displayPos.current.x} y={displayPos.current.y}>
      <Path
        data="M 0 0 L 0 20 L 5 15 L 9 24 L 12 22 L 8 13 L 15 13 Z"
        fill={userColor}
        stroke="white"
        strokeWidth={1}
        shadowBlur={4}
        shadowColor="rgba(0,0,0,0.3)"
        shadowOffset={{ x: 1, y: 1 }}
      />

      <Group x={18} y={8}>
        <Rect
          width={labelWidth}
          height={labelHeight}
          fill={userColor}
          cornerRadius={4}
          shadowBlur={4}
          shadowColor="rgba(0,0,0,0.2)"
          shadowOffset={{ x: 1, y: 1 }}
        />
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
});
