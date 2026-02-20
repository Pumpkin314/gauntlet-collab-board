import { memo, useRef, useEffect, useCallback } from 'react';
import { Group, Rect, Text, Path } from 'react-konva';
import Konva from 'konva';
import { getCursorPosition } from '../utils/cursorStore';

interface PresenceUser {
  id: string;
  cursorX: number;
  cursorY: number;
  userName: string;
  userColor: string;
}

const SMOOTHING = 0.7;
const SNAP_THRESHOLD = 0.5;
const IDLE_POLL_MS = 200;

/** Module-level map: userId → current lerp distance (px) to target. Read by DebugOverlay. */
export const cursorDeltas = new Map<string, number>();

/** Coalesced batchDraw — multiple cursors share one layer, one draw per frame suffices. */
let batchDrawScheduled = false;
function scheduleBatchDraw(layer: Konva.Layer) {
  if (batchDrawScheduled) return;
  batchDrawScheduled = true;
  requestAnimationFrame(() => {
    batchDrawScheduled = false;
    layer.batchDraw();
  });
}

/** Memoized: prevents every cursor from re-rendering when one peer moves. */
export default memo(function Cursor({ data }: { data: PresenceUser }) {
  const { cursorX, cursorY, userName, userColor } = data;

  const groupRef = useRef<Konva.Group>(null);
  const displayPos = useRef({ x: cursorX, y: cursorY });
  const rafId = useRef<number>(0);
  const timeoutId = useRef<number>(0);

  const animate = useCallback(() => {
    rafId.current = 0;
    const node = groupRef.current;
    if (!node) return;

    const storePos = getCursorPosition(data.id);
    const targetX = storePos ? storePos.x : displayPos.current.x;
    const targetY = storePos ? storePos.y : displayPos.current.y;

    displayPos.current.x += (targetX - displayPos.current.x) * SMOOTHING;
    displayPos.current.y += (targetY - displayPos.current.y) * SMOOTHING;

    node.x(displayPos.current.x);
    node.y(displayPos.current.y);

    const layer = node.getLayer();
    const delta = Math.hypot(targetX - displayPos.current.x, targetY - displayPos.current.y);
    cursorDeltas.set(data.id, delta);

    if (delta > SNAP_THRESHOLD) {
      if (layer) scheduleBatchDraw(layer);
      rafId.current = requestAnimationFrame(animate);
    } else {
      displayPos.current.x = targetX;
      displayPos.current.y = targetY;
      node.x(targetX);
      node.y(targetY);
      if (layer) scheduleBatchDraw(layer);
      cursorDeltas.set(data.id, 0);
      timeoutId.current = window.setTimeout(() => {
        timeoutId.current = 0;
        rafId.current = requestAnimationFrame(animate);
      }, IDLE_POLL_MS);
    }
  }, [data.id]);

  useEffect(() => {
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(animate);
    }
    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = 0;
      }
      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
        timeoutId.current = 0;
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
