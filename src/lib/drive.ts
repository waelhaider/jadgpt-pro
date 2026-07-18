
interface DriveUploadResponse {
  id: string;
  webViewLink: string;
  webContentLink: string;
}

export async function uploadToDrive(file: File, accessToken: string, onProgress?: (percent: number) => void): Promise<string> {
  if (onProgress) onProgress(5); // Start metadata creation

  // 1. Initiate resumable upload session
  const metadata = {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
  };

  const createResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': file.type || 'application/octet-stream',
      'X-Upload-Content-Length': file.size.toString(),
    },
    body: JSON.stringify(metadata),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.text();
    throw new Error(`Drive initiate resumable session failed: ${createResponse.statusText} - ${errorBody}`);
  }

  const sessionUrl = createResponse.headers.get('Location');
  if (!sessionUrl) {
    throw new Error('Google Drive upload initiation failed: Location header was not returned in the response.');
  }

  if (onProgress) onProgress(15); // Metadata created/session initiated, start upload

  // 2. Upload file content in chunks to the session URL with real-time progress tracking
  const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB (must be a multiple of 256 KB)
  const totalBytes = file.size;
  let startByte = 0;
  let lastResponseText = '';

  while (startByte < totalBytes) {
    const endByte = Math.min(startByte + CHUNK_SIZE, totalBytes);
    const chunk = file.slice(startByte, endByte);
    const chunkLength = endByte - startByte;

    // Range is 0-indexed and inclusive, so end with endByte - 1
    const contentRange = `bytes ${startByte}-${endByte - 1}/${totalBytes}`;

    const uploadResponse = await new Promise<{ ok: boolean; status: number; statusText: string; text: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (event) => {
          const chunkUploaded = event.loaded || 0;
          const totalUploadedSoFar = startByte + chunkUploaded;
          // Map total upload progress (0% - 100%) to (15% - 90%)
          const percent = Math.round(15 + (totalUploadedSoFar / totalBytes) * 75);
          onProgress(Math.min(90, percent));
        };
      }
      
      xhr.open('PUT', sessionUrl, true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('Content-Range', contentRange);
      
      xhr.onload = () => {
        resolve({
          ok: (xhr.status >= 200 && xhr.status < 300) || xhr.status === 308,
          status: xhr.status,
          statusText: xhr.statusText,
          text: xhr.responseText
        });
      };
      
      xhr.onerror = () => {
        reject(new Error('Network error during Google Drive chunk upload.'));
      };
      
      xhr.send(chunk);
    });

    if (!uploadResponse.ok) {
      throw new Error(`Drive upload chunk failed: ${uploadResponse.statusText} - ${uploadResponse.text}`);
    }

    if (onProgress) {
      const completedPercent = Math.round(15 + (endByte / totalBytes) * 75);
      onProgress(Math.min(90, completedPercent));
    }

    lastResponseText = uploadResponse.text;
    startByte = endByte;
  }

  let fileId = '';
  try {
    const fileData = JSON.parse(lastResponseText);
    fileId = fileData.id;
  } catch (err) {
    throw new Error(`Failed to parse Google Drive upload response: ${lastResponseText}`);
  }

  if (!fileId) {
    throw new Error('Google Drive upload succeeded but returned no file ID.');
  }

  if (onProgress) onProgress(93); // Setting permissions

  // 3. Set permissions to public view
  const permResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    }),
  });

  if (!permResponse.ok) {
    console.warn('Failed to set public permissions on Drive file');
  }

  if (onProgress) onProgress(100); // Complete!

  // 4. Return a viewable link
  // The thumbnail API is more reliable for direct embedding than uc?export=view
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
}

export async function deleteFromDrive(fileUrl: string, accessToken: string): Promise<void> {
  const fileId = extractFileIdFromUrl(fileUrl);
  if (!fileId) {
    console.warn('Could not extract fileId from URL:', fileUrl);
    return;
  }

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const errorBody = await response.text();
    throw new Error(`Drive delete failed: ${response.statusText} - ${errorBody}`);
  }
}

function extractFileIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // Handle https://drive.google.com/thumbnail?id=FILE_ID...
    const id = urlObj.searchParams.get('id');
    if (id) return id;

    // Fallback for other potential formats if needed
    return null;
  } catch (e) {
    return null;
  }
}
