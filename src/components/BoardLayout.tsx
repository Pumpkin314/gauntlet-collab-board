import { useParams } from 'react-router-dom';
import { BoardProvider } from '../contexts/BoardContext';
import { SelectionProvider } from '../contexts/SelectionContext';
import App from '../App';

const isTestMode = import.meta.env.VITE_TEST_AUTH_BYPASS === 'true';

let PerfBridgeConnector: React.ComponentType | null = null;

if (isTestMode) {
  // Eager import is fine here — this component only mounts inside a board route
  import('../components/PerfBridgeConnector').then((m) => {
    PerfBridgeConnector = m.default;
  });
}

export default function BoardLayout() {
  const { boardId } = useParams<{ boardId: string }>();

  return (
    <BoardProvider boardId={boardId ?? 'default-board'}>
      <SelectionProvider>
        <App />
        {PerfBridgeConnector && <PerfBridgeConnector />}
      </SelectionProvider>
    </BoardProvider>
  );
}
