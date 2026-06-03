import { auth, googleProvider } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';

export interface VirtualUser {
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  uid: string;
  getIdToken: () => Promise<string>;
}

// Cache the access token in memory and localStorage.
let cachedAccessToken: string | null = localStorage.getItem('google_access_token');
let isSigningIn = false;

export const initAuth = (
  onAuthSuccess?: (user: any, token: string) => void,
  onAuthFailure?: () => void
) => {
  // First, check if there is a local email login stored
  const localEmail = localStorage.getItem('local_auth_user_email');
  if (localEmail) {
    const localName = localStorage.getItem('local_auth_user_name') || localEmail.split('@')[0];
    const virtualUser: VirtualUser = {
      email: localEmail,
      displayName: localName,
      photoURL: null,
      uid: 'local-' + btoa(localEmail),
      getIdToken: async () => 'local-user-email:' + localEmail,
    };
    cachedAccessToken = 'local-dummy-token';
    if (onAuthSuccess) {
      setTimeout(() => onAuthSuccess(virtualUser, 'local-dummy-token'), 50);
    }
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    // If we have a local email login, don't override with null from firebase load
    if (localStorage.getItem('local_auth_user_email')) {
      return;
    }

    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      localStorage.removeItem('google_access_token');
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
    localStorage.setItem('google_access_token', cachedAccessToken);
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

  localStorage.setItem('local_auth_user_email', cleanEmail);
  localStorage.setItem('local_auth_user_name', cleanName);

  const virtualUser: VirtualUser = {
    email: cleanEmail,
    displayName: cleanName,
    photoURL: null,
    uid: 'local-' + btoa(cleanEmail),
    getIdToken: async () => 'local-user-email:' + cleanEmail,
  };

  cachedAccessToken = 'local-dummy-token';
  localStorage.setItem('google_access_token', 'local-dummy-token');

  return { user: virtualUser, accessToken: 'local-dummy-token' };
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('local_auth_user_email');
  localStorage.removeItem('local_auth_user_name');
};
