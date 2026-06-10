import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Log config to debug injection
const config = firebaseConfig as any;
const dbId = config.firestoreDatabaseId || '(default)';

console.log('[Firebase] Project ID:', config.projectId);
console.log('[Firebase] Database ID:', dbId);

const app = initializeApp(config);

// Initialize Firestore with the specific database ID
export const db = getFirestore(app, dbId);

export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
// Request Google Drive file scope for permanent user storage
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

