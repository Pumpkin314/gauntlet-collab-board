import { createContext, useContext, useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

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
  const [loading, setLoading] = useState(true);

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

  const value = {
    boardId,
    objects,
    loading,
    createStickyNote,
    updateObject,
    deleteObject,
  };

  return (
    <BoardContext.Provider value={value}>
      {children}
    </BoardContext.Provider>
  );
}
