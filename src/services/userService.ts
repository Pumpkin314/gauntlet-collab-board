import {
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  lastLogin: ReturnType<typeof serverTimestamp>;
}

const usersCol = collection(db, 'users');

/** Upsert a minimal user profile on login for email-based lookup. */
export async function ensureUserProfile(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}): Promise<void> {
  const ref = doc(usersCol, user.uid);
  await setDoc(ref, {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? 'Anonymous',
    photoURL: user.photoURL,
    lastLogin: serverTimestamp(),
  }, { merge: true });
}

/** Look up a user by email. Returns basic info or null if not found. */
export async function lookupUserByEmail(
  email: string,
): Promise<{ uid: string; displayName: string; email: string } | null> {
  const q = query(usersCol, where('email', '==', email));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return {
    uid: data.uid as string,
    displayName: data.displayName as string,
    email: data.email as string,
  };
}
