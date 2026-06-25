/**
 * Utility to compress images on the client-side using Canvas.
 * Reduces the dimension to a maximum of 1024px and compresses quality to 0.7.
 */
export async function compressImage(file: File, maxDimension = 1024, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    // If it's not an image, just convert to simple Base64
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback to direct Base64 if canvas context fails
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        // Export to JPEG format with specified quality (0.7 is sweet spot)
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = (err) => {
      reject(err);
    };

    // Load file into Image object via FileReader
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

