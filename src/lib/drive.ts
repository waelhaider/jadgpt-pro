
interface DriveUploadResponse {
  id: string;
  webViewLink: string;
  webContentLink: string;
}

export async function uploadToDrive(file: File, accessToken: string, onProgress?: (percent: number) => void): Promise<string> {
  if (onProgress) onProgress(5); // Start metadata creation

  // 1. Create file metadata
  const metadata = {
    name: `horizon_${Date.now()}_${file.name}`,
    mimeType: file.type,
  };

  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.text();
    throw new Error(`Drive create metadata failed: ${createResponse.statusText} - ${errorBody}`);
  }

  const fileData = await createResponse.json();
  const fileId = fileData.id;

  if (onProgress) onProgress(15); // Metadata created, start upload

  // 2. Upload file content with real-time progress tracking
  const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  
  const uploadResponse = await new Promise<{ ok: boolean; statusText: string; text: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // Register events before calling open() to guarantee compatibility
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          // Map file upload progress (0% - 100%) to (15% - 90%)
          const percent = Math.round(15 + (event.loaded / event.total) * 75);
          onProgress(percent);
        }
      };
    }
    
    xhr.open('PATCH', uploadUrl, true);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        statusText: xhr.statusText,
        text: xhr.responseText
      });
    };
    
    xhr.onerror = () => {
      reject(new Error('Network error during Google Drive upload.'));
    };
    
    xhr.send(file);
  });

  if (!uploadResponse.ok) {
    throw new Error(`Drive upload content failed: ${uploadResponse.statusText} - ${uploadResponse.text}`);
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
