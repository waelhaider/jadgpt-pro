import { Timestamp } from 'firebase/firestore';

export interface Post {
  id: string;
  text: string;
  imageUrl?: string;
  imageUrls?: string[];
  imageModels?: string[];
  boardId: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  authorId: string;
  authorEmail: string;
}

export interface Board {
  id: string;
  name: string;
  order: number;
  createdAt: Timestamp;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export interface GeneratedImage {
  id: string;
  title: string;
  imageUrl: string | null;
  status: 'pending' | 'loading' | 'completed' | 'failed';
  error?: string;
}

