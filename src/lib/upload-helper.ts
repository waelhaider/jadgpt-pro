import { uploadToDrive, deleteFromDrive } from './drive';
import { getAccessToken } from './auth';

/**
 * Safely upload an image with 100% original full size and quality directly to Google Drive.
 */
export async function uploadPostImage(file: File, userId: string): Promise<string> {
  const token = getAccessToken();
  if (!token || token === 'local-dummy-token') {
    throw new Error('AUTH_REQUIRED');
  }

  try {
    console.log('[UploadHelper] Uploading to Google Drive at 100% original resolution:', file.name);
    const driveUrl = await uploadToDrive(file, token);
    console.log('[UploadHelper] Google Drive upload succeeded:', driveUrl);
    return driveUrl;
  } catch (error: any) {
    console.error('[UploadHelper] Google Drive upload failed:', error);
    // Propagate authentic auth errors
    const errMsg = error.message || '';
    if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('token') || errMsg.includes('expired')) {
      throw new Error('AUTH_EXPIRED');
    }
    throw new Error(`فشل رفع الصورة إلى Google Drive بالدقة الكاملة: ${error.message || error}`);
  }
}

/**
 * Safely delete an image from Google Drive.
 */
export async function deletePostImage(url: string, accessToken?: string | null): Promise<void> {
  if (!url) return;

  if (url.startsWith('data:image')) {
    console.log('[UploadHelper] Delete: local Base64 image, skipping Google Drive deletion');
    return;
  }

  // Google Drive url formats usually include 'drive.google.com'
  if (url.includes('drive.google.com') || url.includes('/thumbnail?id=')) {
    const activeToken = accessToken || getAccessToken();
    if (activeToken && activeToken !== 'local-dummy-token') {
      try {
        console.log('[UploadHelper] Delete: Removing file from Google Drive:', url);
        await deleteFromDrive(url, activeToken);
        console.log('[UploadHelper] Delete: Succeeded removing from Google Drive');
      } catch (err: any) {
        console.warn('[UploadHelper] Delete: Failed to remove from Google Drive:', err);
      }
    } else {
      console.log('[UploadHelper] Delete: Skipping Google Drive removal due to missing session token');
    }
  }
}
