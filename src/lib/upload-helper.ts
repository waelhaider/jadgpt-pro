import { uploadToDrive, deleteFromDrive, extractFileIdFromUrl } from './drive';
import { getAccessToken } from './auth';
import { injectPromptIntoImage } from './metadata-injector';

/**
 * Safely upload an image with 100% original full size and quality directly to Google Drive.
 * Includes optional prompt metadata injection into PNG/JPEG files prior to upload.
 */
export async function uploadPostImage(file: File, userId: string, prompt?: string, onProgress?: (percent: number) => void): Promise<string> {
  const token = getAccessToken();
  if (!token || token === 'local-dummy-token') {
    throw new Error('AUTH_REQUIRED');
  }

  try {
    let finalFile = file;
    if (prompt && prompt.trim()) {
      console.log('[UploadHelper] Injecting prompt metadata for file:', file.name);
      finalFile = await injectPromptIntoImage(file, prompt);
    }
    
    console.log('[UploadHelper] Uploading to Google Drive at 100% original resolution:', finalFile.name);
    const driveUrl = await uploadToDrive(finalFile, token, onProgress);
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
 * Safely delete any post file (images, documents, archives, etc.) from Google Drive.
 */
export async function deletePostImage(url: string, accessToken?: string | null): Promise<void> {
  if (!url) return;

  if (url.startsWith('data:image') || url.startsWith('data:')) {
    console.log('[UploadHelper] Delete: local Base64 content, skipping Google Drive deletion');
    return;
  }

  const fileId = extractFileIdFromUrl(url);
  const isGoogleDriveUrl = fileId !== null || 
                           url.includes('drive.google.com') || 
                           url.includes('googleusercontent.com') || 
                           url.includes('googleapis.com') || 
                           url.includes('docs.google.com') ||
                           url.includes('/thumbnail?id=');

  if (isGoogleDriveUrl) {
    const activeToken = accessToken || getAccessToken();
    if (activeToken && activeToken !== 'local-dummy-token') {
      try {
        console.log('[UploadHelper] Delete: Removing file from Google Drive (ID:', fileId || 'unknown', '):', url);
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
