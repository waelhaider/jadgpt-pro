
interface DriveUploadResponse {
  id: string;
  webViewLink: string;
  webContentLink: string;
}

export async function uploadToDrive(file: File, accessToken: string): Promise<string> {
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

  // 2. Upload file content
  const uploadResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.text();
    throw new Error(`Drive upload content failed: ${uploadResponse.statusText} - ${errorBody}`);
  }

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
