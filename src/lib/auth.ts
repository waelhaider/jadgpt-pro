import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { safeStorage } from './safe-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface VirtualUser {
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  uid: string;
  getIdToken: () => Promise<string>;
}

// Cache the access token in memory and local storage.
let cachedAccessToken: string | null = safeStorage.getItem('google_access_token');
let isSigningIn = false;

// Helpers to synchronize user Gemini API key to Firestore securely
export const syncUserKeyFromFirestore = async (email: string): Promise<string | null> => {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();
  try {
    const docRef = doc(db, 'user_keys', cleanEmail);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && data.apiKey) {
        safeStorage.setItem('user_gemini_api_key', data.apiKey);
        console.log('[KeySync] Successfully synchronized API key from Firestore for email:', cleanEmail);
        return data.apiKey;
      }
    }

    // If no key is configured in Firestore for this user, automatically fetch and provision the default API key
    let idToken = '';
    if (auth.currentUser) {
      idToken = await auth.currentUser.getIdToken();
    } else {
      idToken = 'local-user-email:' + cleanEmail;
    }

    if (idToken) {
      const response = await fetch('/api/default-key', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      if (response.ok) {
        const resData = await response.json();
        if (resData.apiKey) {
          safeStorage.setItem('user_gemini_api_key', resData.apiKey);
          // Set via setDoc directly to avoid recursive calls from saveUserKeyToFirestore
          await setDoc(docRef, {
            apiKey: resData.apiKey,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          console.log('[KeySync] Auto-provisioned server Gemini API Key for user:', cleanEmail);
          return resData.apiKey;
        }
      }
    }
  } catch (err) {
    console.warn('[KeySync] Failed to fetch user key from firestore/server:', err);
  }
  return null;
};

export const saveUserKeyToFirestore = async (email: string, apiKey: string): Promise<void> => {
  if (!email) return;
  const cleanEmail = email.trim().toLowerCase();
  const cleanKey = apiKey.trim();
  try {
    const docRef = doc(db, 'user_keys', cleanEmail);
    await setDoc(docRef, {
      apiKey: cleanKey,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    if (cleanKey) {
      safeStorage.setItem('user_gemini_api_key', cleanKey);
      console.log('[KeySync] Saved API key to Firestore for email:', cleanEmail);
    } else {
      safeStorage.removeItem('user_gemini_api_key');
    }
  } catch (err) {
    console.error('[KeySync] Failed to save user key to firestore:', err);
    throw err;
  }
};

export const deleteUserKeyFromFirestore = async (email: string): Promise<void> => {
  if (!email) return;
  const cleanEmail = email.trim().toLowerCase();
  try {
    const docRef = doc(db, 'user_keys', cleanEmail);
    await setDoc(docRef, {
      apiKey: '',
      updatedAt: new Date().toISOString()
    }, { merge: true });
    safeStorage.removeItem('user_gemini_api_key');
    console.log('[KeySync] Cleared API key from Firestore for email:', cleanEmail);
  } catch (err) {
    console.error('[KeySync] Failed to delete user key from firestore:', err);
    throw err;
  }
};

export const initAuth = (
  onAuthSuccess?: (user: any, token: string) => void,
  onAuthFailure?: () => void
) => {
  // First, check if there is a local email login stored
  const localEmail = safeStorage.getItem('local_auth_user_email');
  if (localEmail) {
    const localName = safeStorage.getItem('local_auth_user_name') || localEmail.split('@')[0];
    const virtualUser: VirtualUser = {
      email: localEmail,
      displayName: localName,
      photoURL: null,
      uid: auth.currentUser ? auth.currentUser.uid : 'local-' + btoa(localEmail),
      getIdToken: async () => auth.currentUser ? auth.currentUser.getIdToken() : 'local-user-email:' + localEmail,
    };
    cachedAccessToken = 'local-dummy-token';

    // Synchronize Key in background
    syncUserKeyFromFirestore(localEmail);

    if (onAuthSuccess) {
      setTimeout(() => onAuthSuccess(virtualUser, 'local-dummy-token'), 50);
    }
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    const activeLocalEmail = safeStorage.getItem('local_auth_user_email');
    if (activeLocalEmail) {
      // If we have a local email login and an active firebase auth, sync the UID
      if (user && onAuthSuccess) {
        const localName = safeStorage.getItem('local_auth_user_name') || activeLocalEmail.split('@')[0];
        const updatedVirtualUser: VirtualUser = {
          email: activeLocalEmail,
          displayName: localName,
          photoURL: null,
          uid: user.uid,
          getIdToken: async () => user.getIdToken(),
        };
        onAuthSuccess(updatedVirtualUser, cachedAccessToken || 'local-dummy-token');
      }
      return;
    }

    if (user) {
      if (user.email) {
        syncUserKeyFromFirestore(user.email);
      }
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      safeStorage.removeItem('google_access_token');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    safeStorage.setItem('google_access_token', cachedAccessToken);

    // Synchronize local / virtual session state with Google Login
    if (result.user.email) {
      safeStorage.setItem('local_auth_user_email', result.user.email);
      if (result.user.displayName) {
        safeStorage.setItem('local_auth_user_name', result.user.displayName);
      }
      // Fetch key from Firestore in background
      await syncUserKeyFromFirestore(result.user.email);
    }

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const emailSignIn = async (email: string, name?: string): Promise<{ user: VirtualUser; accessToken: string }> => {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name?.trim() || cleanEmail.split('@')[0];

  safeStorage.setItem('local_auth_user_email', cleanEmail);
  safeStorage.setItem('local_auth_user_name', cleanName);

  const virtualUser: VirtualUser = {
    email: cleanEmail,
    displayName: cleanName,
    photoURL: null,
    uid: auth.currentUser ? auth.currentUser.uid : 'local-' + btoa(cleanEmail),
    getIdToken: async () => auth.currentUser ? auth.currentUser.getIdToken() : 'local-user-email:' + cleanEmail,
  };

  cachedAccessToken = 'local-dummy-token';
  safeStorage.setItem('google_access_token', 'local-dummy-token');

  // Fetch key from Firestore in background
  await syncUserKeyFromFirestore(cleanEmail);

  return { user: virtualUser, accessToken: 'local-dummy-token' };
};

export const getAccessToken = (): string | null => {
  const token = safeStorage.getItem('google_access_token');
  if (token && token !== 'local-dummy-token') {
    return token;
  }
  return cachedAccessToken;
};

export const getCurrentUser = (): any => {
  const localEmail = safeStorage.getItem('local_auth_user_email');
  const firebaseUser = auth.currentUser;

  if (firebaseUser && (!localEmail || firebaseUser.email === localEmail)) {
    return firebaseUser;
  }

  if (localEmail) {
    const localName = safeStorage.getItem('local_auth_user_name') || localEmail.split('@')[0];
    const virtualUser: VirtualUser = {
      email: localEmail,
      displayName: localName,
      photoURL: null,
      uid: firebaseUser ? firebaseUser.uid : 'local-' + btoa(localEmail),
      getIdToken: async () => firebaseUser ? firebaseUser.getIdToken() : 'local-user-email:' + localEmail,
    };
    return virtualUser;
  }
  return firebaseUser;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  safeStorage.removeItem('google_access_token');
  safeStorage.removeItem('user_gemini_api_key');
  safeStorage.removeItem('local_auth_user_email');
  safeStorage.removeItem('local_auth_user_name');
};
