import { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

// Debounce utility
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Generate consistent color from user ID
function getUserColor(userId) {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
    '#F8B195', '#C06C84', '#6C5B7B', '#355C7D'
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const BoardContext = createContext();

export function useBoard() {
  const context = useContext(BoardContext);
  if (!context) {
    throw new Error('useBoard must be used within BoardProvider');
  }
  return context;
}

export function BoardProvider({ children }) {
  const { currentUser } = useAuth();
  // For MVP, use a single default board. Later, support multiple boards.
  const boardId = 'default-board';

  const [objects, setObjects] = useState([]);
  const [presence, setPresence] = useState([]);
  const [loading, setLoading] = useState(true);
  const presenceRef = useRef(null);

  // Listen to objects in real-time
  useEffect(() => {
    if (!currentUser) return;

    const objectsRef = collection(db, `boards/${boardId}/objects`);
    const q = query(objectsRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const newObjects = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setObjects(newObjects);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching objects:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, boardId]);

  // Set up presence and listen to other users' presence
  useEffect(() => {
    if (!currentUser) return;

    // Create presence document for current user
    presenceRef.current = doc(db, `boards/${boardId}/presence`, currentUser.uid);

    const userColor = getUserColor(currentUser.uid);

    // Set initial presence
    setDoc(presenceRef.current, {
      userId: currentUser.uid,
      userName: currentUser.displayName || 'Anonymous',
      userColor,
      cursorX: 0,
      cursorY: 0,
      lastActive: serverTimestamp(),
    }).catch(err => console.error('Error setting presence:', err));

    // Listen to all presence documents
    const presenceCollection = collection(db, `boards/${boardId}/presence`);
    const unsubscribe = onSnapshot(
      presenceCollection,
      (snapshot) => {
        const allPresence = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Filter out current user's presence (don't show our own cursor)
        const otherUsers = allPresence.filter(p => p.userId !== currentUser.uid);
        setPresence(otherUsers);
      },
      (error) => {
        console.error('Error fetching presence:', error);
      }
    );

    // Cleanup: Delete presence when component unmounts
    return () => {
      unsubscribe();
      if (presenceRef.current) {
        deleteDoc(presenceRef.current).catch(err =>
          console.error('Error deleting presence:', err)
        );
      }
    };
  }, [currentUser, boardId]);

  // Debounced cursor position update (100ms)
  const updateCursorPositionDebounced = useRef(
    debounce((x, y) => {
      if (presenceRef.current) {
        updateDoc(presenceRef.current, {
          cursorX: x,
          cursorY: y,
          lastActive: serverTimestamp(),
        }).catch(err => console.error('Error updating cursor:', err));
      }
    }, 100)
  ).current;

  const updateCursorPosition = (x, y) => {
    updateCursorPositionDebounced(x, y);
  };

  // Create a new sticky note
  const createStickyNote = async (x, y) => {
    if (!currentUser) return;

    try {
      const objectsRef = collection(db, `boards/${boardId}/objects`);
      await addDoc(objectsRef, {
        type: 'sticky',
        x,
        y,
        width: 200,
        height: 200,
        content: 'Double-click to edit',
        color: '#FFE66D',
        createdBy: currentUser.uid,
        createdByName: currentUser.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error creating sticky note:', error);
    }
  };

  // Create a new rectangle shape
  const createShape = async (x, y) => {
    if (!currentUser) return;

    try {
      const objectsRef = collection(db, `boards/${boardId}/objects`);
      await addDoc(objectsRef, {
        type: 'rect',
        x,
        y,
        width: 160,
        height: 100,
        color: '#85C1E2',
        createdBy: currentUser.uid,
        createdByName: currentUser.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error creating shape:', error);
    }
  };

  // Update an object
  const updateObject = async (objectId, updates) => {
    if (!currentUser) return;

    try {
      const objectRef = doc(db, `boards/${boardId}/objects`, objectId);
      await updateDoc(objectRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating object:', error);
    }
  };

  // Delete an object
  const deleteObject = async (objectId) => {
    if (!currentUser) return;

    try {
      const objectRef = doc(db, `boards/${boardId}/objects`, objectId);
      await deleteDoc(objectRef);
    } catch (error) {
      console.error('Error deleting object:', error);
    }
  };

  // Delete all objects
  const deleteAllObjects = async () => {
    if (!currentUser) return;

    try {
      // Delete all objects in the collection
      const promises = objects.map(obj =>
        deleteDoc(doc(db, `boards/${boardId}/objects`, obj.id))
      );
      await Promise.all(promises);
    } catch (error) {
      console.error('Error deleting all objects:', error);
    }
  };

  const value = {
    boardId,
    objects,
    presence,
    loading,
    createStickyNote,
    createShape,
    updateObject,
    deleteObject,
    deleteAllObjects,
    updateCursorPosition,
  };

  return (
    <BoardContext.Provider value={value}>
      {children}
    </BoardContext.Provider>
  );
}
