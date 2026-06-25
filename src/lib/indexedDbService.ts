const DB_NAME = 'JadGptLocalDB';
const DB_VERSION = 1;
const POSTS_STORE = 'posts';
const IMAGES_STORE = 'images';

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(POSTS_STORE)) {
        db.createObjectStore(POSTS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getLocalUserPostsIndexedDB(): Promise<any[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([POSTS_STORE, IMAGES_STORE], 'readonly');
    const postsStore = transaction.objectStore(POSTS_STORE);
    const imagesStore = transaction.objectStore(IMAGES_STORE);

    const getAllRequest = postsStore.getAll();

    getAllRequest.onsuccess = () => {
      const posts = getAllRequest.result || [];
      if (posts.length === 0) {
        resolve([]);
        return;
      }

      // Collect all image IDs we need to retrieve
      const imageIdsToFetch = new Set<string>();
      posts.forEach((post: any) => {
        if (post.imageUrl && post.imageUrl.startsWith('img_')) {
          imageIdsToFetch.add(post.imageUrl);
        }
        if (post.imageUrls && Array.isArray(post.imageUrls)) {
          post.imageUrls.forEach((img: string) => {
            if (img && img.startsWith('img_')) {
              imageIdsToFetch.add(img);
            }
          });
        }
      });

      // Fetch all images in parallel
      const imageMap: Record<string, string> = {};
      let fetchCount = 0;
      const totalToFetch = imageIdsToFetch.size;

      if (totalToFetch === 0) {
        // No images to fetch, return sorted posts
        posts.sort((a: any, b: any) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
        resolve(posts);
        return;
      }

      imageIdsToFetch.forEach(id => {
        const req = imagesStore.get(id);
        req.onsuccess = () => {
          if (req.result) {
            imageMap[id] = req.result.data;
          }
          fetchCount++;
          if (fetchCount === totalToFetch) {
            // All images fetched, hydrate posts
            const hydrated = posts.map((post: any) => {
              const imageUrls = (post.imageUrls || []).map((img: string) => {
                if (img && img.startsWith('img_')) {
                  return imageMap[img] || img;
                }
                return img;
              });

              let imageUrl = post.imageUrl;
              if (imageUrl && imageUrl.startsWith('img_')) {
                imageUrl = imageMap[imageUrl] || imageUrl;
              }

              return {
                ...post,
                imageUrl,
                imageUrls
              };
            });

            hydrated.sort((a: any, b: any) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
            resolve(hydrated);
          }
        };

        req.onerror = () => {
          fetchCount++;
          if (fetchCount === totalToFetch) {
            posts.sort((a: any, b: any) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
            resolve(posts);
          }
        };
      });
    };

    getAllRequest.onerror = () => {
      reject(getAllRequest.error);
    };
  });
}

export async function saveLocalUserPostsIndexedDB(posts: any[]): Promise<boolean> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([POSTS_STORE, IMAGES_STORE], 'readwrite');
      const postsStore = transaction.objectStore(POSTS_STORE);
      const imagesStore = transaction.objectStore(IMAGES_STORE);

      const referencedImageIds = new Set<string>();

      // 1. Clear posts store
      postsStore.clear();

      // 2. Process and save each post
      for (const post of posts) {
        const updatedImageUrls: string[] = [];
        let updatedImageUrl: string | null = null;

        if (post.imageUrls && Array.isArray(post.imageUrls)) {
          for (let i = 0; i < post.imageUrls.length; i++) {
            const img = post.imageUrls[i];
            if (img && img.startsWith('data:image/')) {
              const imgId = `img_${post.id}_${i}`;
              imagesStore.put({ id: imgId, data: img });
              updatedImageUrls.push(imgId);
              referencedImageIds.add(imgId);
            } else if (img && img.startsWith('img_')) {
              updatedImageUrls.push(img);
              referencedImageIds.add(img);
            } else if (img) {
              updatedImageUrls.push(img);
            }
          }
        }

        if (post.imageUrl) {
          if (post.imageUrl.startsWith('data:image/')) {
            const imgId = `img_${post.id}_0`;
            imagesStore.put({ id: imgId, data: post.imageUrl });
            updatedImageUrl = imgId;
            referencedImageIds.add(imgId);
          } else if (post.imageUrl.startsWith('img_')) {
            updatedImageUrl = post.imageUrl;
            referencedImageIds.add(post.imageUrl);
          } else {
            updatedImageUrl = post.imageUrl;
          }
        } else if (updatedImageUrls.length > 0) {
          updatedImageUrl = updatedImageUrls[0];
        }

        const postToSave = {
          ...post,
          imageUrl: updatedImageUrl,
          imageUrls: updatedImageUrls,
        };

        // Put the post metadata in DB
        postsStore.put(postToSave);
      }

      // 3. Prune orphaned images
      const keysRequest = imagesStore.getAllKeys();
      keysRequest.onsuccess = () => {
        const keys = keysRequest.result || [];
        for (const key of keys) {
          const keyStr = String(key);
          if (!referencedImageIds.has(keyStr)) {
            imagesStore.delete(key);
          }
        }
      };

      // Wrap transaction completion
      transaction.oncomplete = () => {
        resolve(true);
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('Error in saveLocalUserPostsIndexedDB:', error);
    return false;
  }
}
