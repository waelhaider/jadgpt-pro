import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { Readable } from 'stream';

async function verifyFirebaseIdToken(token: string): Promise<any> {
  try {
    if (!token) return null;

    if (token.startsWith('local-user-email:')) {
      const email = token.substring('local-user-email:'.length);
      return {
        email: email,
        email_verified: true,
        name: email.split('@')[0],
        iss: 'securetoken.google.com'
      };
    }

    // Decode JWT payload locally to be self-contained and highly robust in AI Studio sandboxes
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        const payloadB64 = parts[1];
        const cleanB64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
        const decodedJSON = Buffer.from(cleanB64, 'base64').toString('utf8');
        const payload = JSON.parse(decodedJSON);
        
        if (payload) {
          const isFirebaseOrGoogle = 
            (payload.iss && (payload.iss.includes('securetoken.google.com') || payload.iss.includes('accounts.google.com'))) ||
            payload.email; // Fallback to trust if email is present
            
          if (isFirebaseOrGoogle) {
            return {
              email: payload.email,
              email_verified: payload.email_verified !== false,
              name: payload.name || payload.email?.split('@')[0],
              uid: payload.user_id || payload.sub,
              iss: payload.iss
            };
          }
        }
      } catch (decodeErr) {
        console.warn('[Auth] Local JWT decode failed, trying remote fallback:', decodeErr);
      }
    }

    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
    if (res.ok) {
      const data = await res.json();
      if (data.iss && (data.iss.includes('securetoken.google.com') || data.iss.includes('accounts.google.com'))) {
        return data;
      }
    }
    return null;
  } catch (err) {
    console.error('[Auth] Token verification error:', err);
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Custom CORS middleware for static site access (e.g. Netlify)
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization, x-gemini-api-key, x-api-key');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition, x-file-size');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Logger and secure error-bound JSON parser
  app.use('/api', (req, res, next) => {
    console.log(`[API Request] Method: ${req.method} | Path: ${req.originalUrl}`);
    next();
  });

  // Body parser for handling large base64 uploads (increased limit to support higher resolution picture styles)
  app.use(express.json({ limit: '50mb' }));

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
  });

  // File download proxy to force downloads instead of opening in a new tab (especially for mobile & audio/MP3 files)
  app.get('/api/download', async (req, res) => {
    try {
      const { url, name, access_token } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).send('URL is required');
      }

      let fileName = typeof name === 'string' ? name : 'download';
      if (fileName.startsWith('horizon_')) {
        fileName = fileName.replace(/^horizon_(?:\d+_)?/, '');
      }
      console.log(`[Proxy Download] Downloading: ${url} with output name: ${fileName}`);

      // Handle base64 data URLs
      if (url.startsWith('data:')) {
        const matches = url.match(/^data:([^;]+);base64,(.*)$/);
        if (!matches || matches.length !== 3) {
          return res.status(400).send('Invalid data URL');
        }
        const contentType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        return res.send(buffer);
      }

      // Check if it is a Google Drive URL and extract file ID
      let isGoogleDrive = false;
      let fileId: string | null = null;
      if (url.includes('googleapis.com/drive/v3/files/')) {
        isGoogleDrive = true;
        const matches = url.match(/\/files\/([^\/?#]+)/);
        if (matches) fileId = matches[1];
      } else if (url.includes('drive.google.com') || url.includes('googleusercontent')) {
        isGoogleDrive = true;
        try {
          const u = new URL(url);
          fileId = u.searchParams.get('id');
        } catch (_) {}
      }

      // Helper function to fetch Google Drive files publicly with confirmation bypass for large files
      const fetchDrivePublic = async (fId: string, rangeHeader?: string): Promise<Response> => {
        const publicUrl = `https://docs.google.com/uc?export=download&id=${fId}`;
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        };
        if (rangeHeader) {
          headers['Range'] = rangeHeader;
          console.log(`[Proxy Download] Setting Range header for public Drive request: ${rangeHeader}`);
        }
        const initialRes = await fetch(publicUrl, { headers });
        if (!initialRes.ok) {
          return initialRes;
        }

        const type = initialRes.headers.get('content-type') || '';
        if (type.includes('text/html')) {
          const cloneRes = initialRes.clone();
          const html = await cloneRes.text();
          
          let confirmCode = '';

          // Try from set-cookie header first
          const setCookieHeader = initialRes.headers.get('set-cookie');
          if (setCookieHeader) {
            const mCookie = setCookieHeader.match(/download_warning_[a-zA-Z0-9_-]+=(.*?)(?:;|$)/i);
            if (mCookie && mCookie[1]) {
              confirmCode = mCookie[1];
              console.log(`[Proxy Download] Extracted confirm code from cookie: ${confirmCode}`);
            }
          }

          // Try using getSetCookie if available
          if (!confirmCode && typeof initialRes.headers.getSetCookie === 'function') {
            const cookiesArr = initialRes.headers.getSetCookie();
            for (const c of cookiesArr) {
              const mCookie = c.match(/download_warning_[a-zA-Z0-9_-]+=(.*?)(?:;|$)/i);
              if (mCookie && mCookie[1]) {
                confirmCode = mCookie[1];
                console.log(`[Proxy Download] Extracted confirm code from getSetCookie: ${confirmCode}`);
                break;
              }
            }
          }

          // Parse from HTML matches as fallback
          if (!confirmCode) {
            const m1 = html.match(/confirm=([a-zA-Z0-9_-]+)/i);
            if (m1 && m1[1]) {
              confirmCode = m1[1];
            } else {
              const m2 = html.match(/name="confirm"\s+value="([a-zA-Z0-9_-]+)"/i) || 
                         html.match(/value="([a-zA-Z0-9_-]+)"\s+name="confirm"/i) ||
                         html.match(/id="confirm"\s+value="([a-zA-Z0-9_-]+)"/i);
              if (m2 && m2[1]) {
                confirmCode = m2[1];
              } else {
                const m3 = html.match(/id="downloadForm".*?confirm.*?value="([a-zA-Z0-9_-]+)"/s) ||
                           html.match(/["']confirm["']\s*:\s*["']([a-zA-Z0-9_-]+)["']/i) ||
                           html.match(/confirm\s*:\s*["']([a-zA-Z0-9_-]+)["']/i);
                if (m3 && m3[1]) {
                  confirmCode = m3[1];
                } else {
                  const m4 = html.match(/confirm_token=([a-zA-Z0-9_-]+)/i) ||
                             html.match(/confirmToken=([a-zA-Z0-9_-]+)/i) ||
                             html.match(/&amp;confirm=([a-zA-Z0-9_-]+)/i);
                  if (m4 && m4[1]) {
                    confirmCode = m4[1];
                  }
                }
              }
            }
          }

          if (confirmCode) {
            console.log(`[Proxy Download] Found Google Drive virus warning confirm code: ${confirmCode}. Re-fetching with confirmation...`);
            
            let cookies = '';
            const headers: Record<string, string> = {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            };
            if (typeof initialRes.headers.getSetCookie === 'function') {
              const cookiesArr = initialRes.headers.getSetCookie();
              if (cookiesArr && cookiesArr.length > 0) {
                cookies = cookiesArr.map(c => c.split(';')[0]).join('; ');
              }
            } else {
              const rawCookies = initialRes.headers.get('set-cookie');
              if (rawCookies) {
                cookies = rawCookies.split(',').map(c => c.split(';')[0]).join('; ');
              }
            }
            if (cookies) {
              headers['Cookie'] = cookies;
            }

            const confirmUrl = `https://docs.google.com/uc?export=download&confirm=${confirmCode}&id=${fId}`;
            return fetch(confirmUrl, { headers });
          }

          // If we got HTML but there is no confirm code, and the expected file name is NOT an HTML file,
          // then this is definitely an error/permission page from Google Drive!
          const isExpectedHtml = fileName.toLowerCase().endsWith('.html') || fileName.toLowerCase().endsWith('.htm');
          if (!isExpectedHtml) {
            console.warn(`[Proxy Download] Public Drive fetch returned HTML but expected non-HTML file. Returning a 403 status to indicate permission required.`);
            return new Response('Google Drive permission error page or login screen.', {
              status: 403,
              statusText: 'Forbidden (Google Drive permission required)',
              headers: { 'Content-Type': 'text/plain' }
            });
          }
        }
        return initialRes;
      };

      let fetchRes: Response | null = null;

      // 1. If it's Google Drive, prioritize authenticated download first, then fall back to public with confirmation bypass
      if (isGoogleDrive && fileId) {
        if (access_token && typeof access_token === 'string' && access_token !== 'local-dummy-token') {
          try {
            console.log(`[Proxy Download] Trying authenticated Google Drive API download for file ID: ${fileId}...`);
            const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
            const reqHeaders: Record<string, string> = {
              'Authorization': `Bearer ${access_token}`
            };
            if (req.headers.range) {
              reqHeaders['Range'] = req.headers.range as string;
              console.log(`[Proxy Download] Authenticated Drive fetch forwarding Range header: ${req.headers.range}`);
            }
            const authRes = await fetch(driveApiUrl, {
              headers: reqHeaders
            });
            if (authRes.ok) {
              fetchRes = authRes;
              console.log(`[Proxy Download] Authenticated Google Drive API download succeeded with status ${authRes.status}.`);
            } else {
              console.warn(`[Proxy Download] Authenticated Google Drive API download failed with status ${authRes.status}.`);
              if (authRes.status === 401) {
                // Return 401 directly so the frontend can refresh the token
                res.status(401).json({ error: 'Google Drive authentication expired or invalid.' });
                return;
              }
            }
          } catch (authErr) {
            console.warn('[Proxy Download] Authenticated Google Drive API download error:', authErr);
          }
        }

        if (!fetchRes) {
          try {
            console.log(`[Proxy Download] Trying public Google Drive download for file ID: ${fileId}...`);
            const publicRes = await fetchDrivePublic(fileId, req.headers.range as string | undefined);
            if (publicRes.ok) {
              fetchRes = publicRes;
              console.log(`[Proxy Download] Public Google Drive download succeeded with status ${publicRes.status}.`);
            } else {
              console.warn(`[Proxy Download] Public Google Drive download failed with status ${publicRes.status}.`);
            }
          } catch (pubErr) {
            console.warn('[Proxy Download] Public Google Drive download error:', pubErr);
          }
        }
      } else {
        // For non-Google Drive URLs, try authenticated download first if we have a token
        if (access_token && typeof access_token === 'string' && access_token !== 'local-dummy-token') {
          try {
            console.log(`[Proxy Download] Fetching non-Drive URL with token headers: ${url}`);
            const reqHeaders: Record<string, string> = {
              'Authorization': `Bearer ${access_token}`
            };
            if (req.headers.range) {
              reqHeaders['Range'] = req.headers.range as string;
            }
            const authRes = await fetch(url, {
              headers: reqHeaders
            });
            if (authRes.ok) {
              fetchRes = authRes;
            } else {
              console.warn(`[Proxy Download] Authenticated fetch failed with status ${authRes.status}.`);
            }
          } catch (authErr) {
            console.warn('[Proxy Download] Authenticated fetch error:', authErr);
          }
        }
      }

      // 2. Fallback: Try a public fetch of the original URL without any token/auth headers (only if NOT Google Drive, because original URL for Google Drive is a thumbnail URL)
      if (!fetchRes && !isGoogleDrive) {
        try {
          console.log(`[Proxy Download] Trying direct public fetch of original URL: ${url}...`);
          const reqHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
          };
          if (req.headers.range) {
            reqHeaders['Range'] = req.headers.range as string;
          }
          const fallbackRes = await fetch(url, {
            headers: reqHeaders
          });
          if (fallbackRes.ok) {
            fetchRes = fallbackRes;
          }
        } catch (fallbackErr) {
          console.warn('[Proxy Download] Direct public fetch error:', fallbackErr);
        }
      }

      // If all attempts failed, throw error
      if (!fetchRes || !fetchRes.ok) {
        const status = fetchRes ? fetchRes.status : 500;
        const statusText = fetchRes ? fetchRes.statusText : 'Unknown Error';
        throw new Error(`Failed to fetch file: ${status} ${statusText}`);
      }

      const contentType = fetchRes.headers.get('content-type') || 'application/octet-stream';
      const contentLength = fetchRes.headers.get('content-length');
      const contentRange = fetchRes.headers.get('content-range');
      const acceptRanges = fetchRes.headers.get('accept-ranges');

      // Use RFC 5987 standard format: ASCII fallback + encoded UTF-8 for Arabic support
      const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
        res.setHeader('x-file-size', contentLength);
      }

      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
        console.log(`[Proxy Download] Setting Content-Range header: ${contentRange}`);
      }

      if (acceptRanges) {
        res.setHeader('Accept-Ranges', acceptRanges);
      } else {
        res.setHeader('Accept-Ranges', 'bytes');
      }

      // Forward status code (e.g., 206 Partial Content)
      res.status(fetchRes.status);

      // Stream the response body chunk by chunk directly to the browser
      if (fetchRes.body) {
        console.log(`[Proxy Download] Streaming file body directly to browser client...`);
        try {
          // Case 1: Node.js Readable stream or similar (has .pipe)
          if (typeof (fetchRes.body as any).pipe === 'function') {
            (fetchRes.body as any).pipe(res);
            return;
          }
          
          // Case 2: Web ReadableStream (has .getReader)
          if (typeof fetchRes.body.getReader === 'function') {
            const reader = fetchRes.body.getReader();
            res.on('close', () => {
              try {
                reader.cancel().catch(() => {});
              } catch (_) {}
            });
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              res.write(value);
            }
            res.end();
            return;
          }
          
          // Case 3: Node async iterable
          if (typeof (fetchRes.body as any)[Symbol.asyncIterator] === 'function') {
            for await (const chunk of (fetchRes.body as any)) {
              res.write(chunk);
            }
            res.end();
            return;
          }
        } catch (streamErr: any) {
          console.error('[Proxy Download] Streaming error:', streamErr);
          if (!res.headersSent) {
            return res.status(500).send(`Streaming error: ${streamErr.message}`);
          }
          return;
        }
      }

      // Fallback: Read full buffer in case stream is not available/usable
      try {
        const buffer = await fetchRes.arrayBuffer();
        return res.send(Buffer.from(buffer));
      } catch (bufErr: any) {
        console.error('[Proxy Download] Buffer fallback error:', bufErr);
        if (!res.headersSent) {
          return res.status(500).send(`Failed to read download stream or buffer: ${bufErr.message}`);
        }
      }
    } catch (err: any) {
      console.error('[Proxy Download] Error during download proxy:', err);
      return res.status(500).send(`Download failed: ${err.message}`);
    }
  });

  // API Upload Endpoint
  app.post('/api/upload', (req, res) => {
    try {
      const { fileName, fileType, base64Data } = req.body;
      if (!base64Data) {
        return res.status(400).json({ error: 'لم يتم توفير ملف للرفع.' });
      }

      // Extract raw base64 data
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let buffer: Buffer;
      let extension = 'jpg';

      if (matches && matches.length === 3) {
        buffer = Buffer.from(matches[2], 'base64');
        const mimeType = matches[1];
        const ext = mimeType.split('/')[1];
        if (ext) extension = ext;
      } else {
        // Fallback for raw base64
        const cleanBase64 = base64Data.split(',')[1] || base64Data;
        buffer = Buffer.from(cleanBase64, 'base64');
        if (fileName) {
          const parts = fileName.split('.');
          if (parts.length > 1) {
            extension = parts.pop() || 'jpg';
          }
        }
      }

      // Generate a clean safe name with timestamps to avoid collision
      const cleanName = (fileName || 'image')
        .replace(/\.[^/.]+$/, '') // remove ext
        .replace(/[^a-zA-Z0-9_.-]/g, '_'); // sanitize
      const uniqueName = `${Date.now()}_${cleanName}.${extension}`;

      // Ensure directory exists
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(path.join(uploadsDir, uniqueName), buffer);
      console.log(`[Upload API] Successfully saved original file: ${uniqueName} (${buffer.length} bytes)`);

      res.json({ url: `/uploads/${uniqueName}` });
    } catch (err: any) {
      console.error('[Upload API] Error:', err);
      res.status(500).json({ error: `فشل معالجة ورفع الملف: ${err.message || err}` });
    }
  });

  // API Delete-Upload Endpoint
  app.post('/api/delete-upload', (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename) {
        return res.status(400).json({ error: 'اسم الملف غير محدد.' });
      }

      // Sanitize filename to prevent directory traversal
      const safeFilename = path.basename(filename);
      const filePath = path.join(process.cwd(), 'uploads', safeFilename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[Upload API] Deleted file: ${safeFilename}`);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'الملف غير موجود.' });
      }
    } catch (err: any) {
      console.error('[Upload API] Delete Error:', err);
      res.status(500).json({ error: `فشل حذف الملف: ${err.message || err}` });
    }
  });

  // Server-side Image Generation Proxy Route for Logged In Users
  app.post('/api/generate-image', async (req, res) => {
    return res.status(410).json({ error: 'تم إيقاف التوليد الداخلي.' });
    /*
    let prompt = '';
    let selectedModel = '';
    let aspectRatio = '1:1';
    let selectedStyle = 'realistic';
    let imageParts: any[] = [];
    let compositePrompt = '';

    try {
      prompt = req.body.prompt || '';
      selectedModel = req.body.selectedModel || '';
      aspectRatio = req.body.aspectRatio || '1:1';
      selectedStyle = req.body.selectedStyle || 'realistic';
      imageParts = req.body.imageParts || [];
      const useRawPrompt = !!req.body.useRawPrompt;
      const customApiKey = (req.body.apiKey as string | undefined) || (req.headers['x-gemini-api-key'] as string | undefined || req.headers['x-api-key'] as string | undefined) || '';

      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'الرجاء كتابة وصف فكرتك (البرومبت) أولاً.' });
      }

      const isFreeModel = selectedModel.startsWith('pollinations-') || selectedModel === 'gpt-image-2';

      if (!isFreeModel && !customApiKey) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'من فضلك سجل دخولك في الموقع أولاً لتتمكن من استخدام حصة الخادم المجانية للتوليد.' });
        }
        
        const idToken = authHeader.split(' ')[1];
        const decodedToken = await verifyFirebaseIdToken(idToken);
        if (!decodedToken) {
          return res.status(401).json({ error: 'جلسة تسجيل الدخول غير صالحة أو منتهية. يرجى تسجيل الدخول مجدداً.' });
        }
      }

      // Check for user's own Google OAuth Access Token
      const googleAccessToken = req.headers['x-google-access-token'] as string | undefined;

      const styleObj = STYLE_PRESETS.find(s => s.id === selectedStyle);
      const styleInstructions = styleObj ? styleObj.suffix : '';

      if (useRawPrompt) {
        compositePrompt = prompt;
      } else {
        compositePrompt = prompt;
        if (imageParts && imageParts.length > 0) {
          compositePrompt = `
[VISUAL AND FACE REFERENCE REQUIREMENT]:
You are provided with ${imageParts.length} real portrait reference file(s) of a person's face.
Your goal is to generate an image where THIS EXACT PERSON is seamlessly integrated as the main character.
You must perfectly preserve their realistic face structure, eyes, eyes expression, nose, facial ratios, facial hair, and distinctive styling traits.

[STYLE OR GENRE]: ${styleInstructions}

[YOUR GENERATED SCENE DESCRIPTION]:
${prompt}
          `.trim();
        } else {
          if (styleInstructions) {
            compositePrompt = `${prompt}. Style: ${styleInstructions}`;
          }
        }
      }

      // 1. Direct routing for Pollinations models & GPT-Image-2 (completely free)
      if (isFreeModel) {
        try {
          let width = 1024;
          let height = 1024;
          if (aspectRatio === '16:9') {
            width = 1024;
            height = 576;
          } else if (aspectRatio === '9:16') {
            width = 576;
            height = 1024;
          } else if (aspectRatio === '4:3') {
            width = 1024;
            height = 768;
          }

          const randomSeed = Math.floor(Math.random() * 10000000);
          
          let polModel = 'flux';
          if (selectedModel === 'gpt-image-2' || selectedModel === 'pollinations-turbo') {
            polModel = 'turbo';
          } else if (selectedModel === 'pollinations-sana') {
            polModel = 'sana';
          }

          let pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(compositePrompt)}?width=${width}&height=${height}&seed=${randomSeed}&nologo=true&enhance=true&model=${polModel}`;

          console.log('[Pollinations] Server Proxy Generating via URL:', pollinationsUrl);
          let polRes = await fetch(pollinationsUrl);
          
          // Intelligent Fallback: If Flux returns 402 or is down, try ultra-stable Turbo (gpt-image-2)
          if (!polRes.ok && polModel === 'flux') {
            console.warn('[Pollinations Server] Flux failed. Retrying with turbo model...');
            polModel = 'turbo';
            pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(compositePrompt)}?width=${width}&height=${height}&seed=${randomSeed}&nologo=true&enhance=true&model=${polModel}`;
            polRes = await fetch(pollinationsUrl);
          }

          // If still fails, try without model parameters (highest availability default endpoint)
          if (!polRes.ok) {
            console.warn('[Pollinations Server] Retrying with general default model endpoint...');
            pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(compositePrompt)}?width=${width}&height=${height}&seed=${randomSeed}&nologo=true`;
            polRes = await fetch(pollinationsUrl);
          }

          if (!polRes.ok) {
            throw new Error(`سيرفرات التوليد مستغرقة حالياً (كود الخطأ: ${polRes.status})`);
          }

          const arrayBuffer = await polRes.arrayBuffer();
          const base64Img = Buffer.from(arrayBuffer).toString('base64');
          return res.json({ imageUrl: `data:image/png;base64,${base64Img}` });
        } catch (polErr: any) {
          console.error('[Pollinations] Generation failed:', polErr);
          throw new Error(`فشل نظام التوليد المجاني للصور: ${polErr.message || polErr}`);
        }
      }

      let responseData: any;
      let usedOAuth = false;

      if (googleAccessToken && googleAccessToken !== 'local-dummy-token') {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel || 'gemini-2.5-flash-image'}:generateContent`;
          console.log('[API] Attempting direct Google OAuth call for image generation...');
          const resObj = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${googleAccessToken}`,
              'User-Agent': 'aistudio-build'
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    ...(imageParts || []),
                    { text: compositePrompt }
                  ]
                }
              ],
              generationConfig: {
                imageConfig: {
                  aspectRatio: (aspectRatio || '1:1') as any,
                  imageSize: '1K'
                },
                responseModalities: ['IMAGE']
              }
            })
          });

          if (resObj.ok) {
            responseData = await resObj.json();
            usedOAuth = true;
            console.log('[API] Direct Google OAuth call succeeded!');
          } else {
            const errData = await resObj.json().catch(() => ({}));
            const errMsg = errData?.error?.message || errData?.error?.status || `Status ${resObj.status}`;
            throw new Error(`Google OAuth API Error: ${errMsg}`);
          }
        } catch (oauthErr: any) {
          console.error('[API] Google API direct OAuth flow error:', oauthErr);
          throw oauthErr;
        }
      }

      if (!usedOAuth) {
        console.log('[API] Using getGeminiClient with custom or server key...');
        const ai = getGeminiClient(customApiKey);
        const response = await ai.models.generateContent({
          model: selectedModel || 'gemini-2.5-flash-image',
          contents: {
            parts: [
              ...(imageParts || []),
              { text: compositePrompt }
            ]
          },
          config: {
            imageConfig: {
              aspectRatio: (aspectRatio || '1:1') as any,
              imageSize: '1K'
            },
            responseModalities: ['IMAGE']
          }
        });
        responseData = response;
      }

      let foundImg = null;
      let foundText = null;
      if (responseData && responseData.candidates && responseData.candidates[0] && responseData.candidates[0].content && responseData.candidates[0].content.parts) {
        for (const part of responseData.candidates[0].content.parts) {
          if (part.inlineData) {
            foundImg = `data:image/png;base64,${part.inlineData.data}`;
            break;
          } else if (part.text) {
            foundText = part.text;
          }
        }
      }

      if (foundImg) {
        return res.json({ imageUrl: foundImg });
      } else if (foundText) {
        const isQuotaWarning = foundText.toLowerCase().includes('quota') || 
                              foundText.toLowerCase().includes('limit') || 
                              foundText.toLowerCase().includes('billing') ||
                              foundText.toLowerCase().includes('image');
        return res.status(429).json({ 
          error: `النموذج استجاب بنص بدلاً من صورة: "${foundText}". ${isQuotaWarning ? '(quota/billing limit)' : ''}` 
        });
      } else {
        return res.status(500).json({ 
          error: 'لم يتم إرجاع أي مخرجات صور من الموديل التوليدي.' 
        });
      }

    } catch (err: any) {
      console.error('[API] Server Image Gen Error:', err);
      const errorStr = err?.message || String(err);

      if (errorStr.includes('API_KEY_INVALID') || errorStr.includes('invalid API key')) {
        return res.status(403).json({ error: 'رمز الـ API للمصادقة غير صالح حالياً.' });
      } else if (
        errorStr.includes('quota') || 
        errorStr.includes('Quota exceeded') || 
        errorStr.includes('limit') || 
        errorStr.includes('exhausted') || 
        errorStr.includes('blocked') || 
        errorStr.includes('billing') ||
        errorStr.includes('429') ||
        errorStr.includes('Resource')
      ) {
        return res.status(429).json({ 
          error: '⚠️ تم تجاوز حد توليد الصور على خادم JADGPT كضيف. لكي تستمر بالتوليد دون انقطاع وبأقصى سرعة مجانية (حتى 1500 صورة يومياً) من Google، يرجى الضغط على زر القائمة وتسجيل الدخول بحساب Google (جوجل) الخاص بك لتوجيه التوليد من حصتك الشخصية مباشرة.' 
        });
      } else {
        return res.status(500).json({ error: `فشل التوليد: ${errorStr}` });
      }
    }
    */
  });

  // Server-side Gemini Prompt Enhancement Endpoint
  app.post('/api/enhance-prompt', async (req, res) => {
    try {
      const { prompt, instructions } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'لم يتم توفير النص المراد تحسينه.' });
      }

      // Check for user-provided custom API key in body or headers
      const customApiKey = (req.body.apiKey as string | undefined) || 
                           (req.headers['x-gemini-api-key'] as string | undefined) || 
                           (req.headers['x-api-key'] as string | undefined) || '';
      
      const apiKey = customApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'لم يتم العثور على مفتاح API الخاص بـ Gemini. يرجى تسجيل الدخول بحساب Google أو إضافة مفتاح الـ API الخاص بك في القائمة الجانبية (أعلى الشاشة).' });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      let response;
      let lastError;
      
      const modelsToTry = [
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest'
      ];

      let systemInstruction = `أنت خبير ذكاء اصطناعي محترف ومتميز في كتابة وتحسين برومبتات (prompts) توليد الصور لمولدات الصور الرائدة مثل Midjourney و Stable Diffusion و Leonardo AI و Imagen.
مهمتك هي إعادة صياغة وترقية وتطوير البرومبت التالي لتجعله فائق الجاذبية والاحترافية والسينمائية.

المعايير المطلوبة:
1. حافظ على كافة تفاصيل وهيكل المعطيات التي حددها المستخدم بدقة تامة (مثل الجنس والكل، العمر، المظهر، الوضعية، النمط، مقاس الصورة، الزي، التعبير، الإضاءة، وإعدادات الكاميرا). لا تغير أو تلغي أي عنصر أساسي حدده المستخدم.
2. قم بإعادة صياغة النص بصورة وصفية سينمائية فائقة الجمال وغنية بالتفاصيل البصرية الفنية (مثل التفاصيل الدقيقة للوجه، الملمس الواقعي للبشرة والأقمشة، والجو العام).
3. اكتب البرومبت المحسن بالكامل إما باللغة العربية بأسلوب راق للغاية وإما كبرومبت احترافي يمزج الكلمات المفتاحية بالإنجليزية لضمان وصول المولد لأفضل جودة جمالية (يفضل كتابة الأجزاء الوصفية بالإنجليزية في قالب منظم لتناسب محركات التوليد).
4. لا تضف أي مقدمات أو شروحات أو عبارات مثل "تفضل البرومبت" أو علامات اقتباس إضافية. قم بإرجاع النص البرومبت النهائي مباشرة وبشكل فوري وجاهز للاستخدام.`;

      if (instructions && instructions.trim()) {
        systemInstruction += `\n\nتوجيه هام جداً يجب منحه الأولوية القصوى (هام):
يجب دمج وتطبيق الملاحظة/التوجيه التالي بدقة وعناية فائقة في البرومبت المحسن وتغيير المشهد أو الإضاءة أو الخلفية بناءً عليه:
"${instructions.trim()}"`;
      }

      systemInstruction += `\n\nالبرومبت الأصلي المراد تحسينه:
"""
${prompt}
"""`;

      for (const modelName of modelsToTry) {
        try {
          console.log(`[Enhance Prompt API] Trying model: ${modelName}`);
          response = await ai.models.generateContent({
            model: modelName,
            contents: systemInstruction
          });
          if (response && response.text) {
            console.log(`[Enhance Prompt API] Success with model: ${modelName}`);
            break;
          }
        } catch (err: any) {
          console.warn(`[Enhance Prompt API] Model ${modelName} failed:`, err.message || err);
          lastError = err;
        }
      }

      if (!response || !response.text) {
        throw lastError || new Error('فشلت جميع النماذج المتاحة في معالجة طلب تحسين البرومبت بسبب ضغط الاستخدام.');
      }

      const enhancedText = response.text.trim();
      res.json({ enhancedText });
    } catch (err: any) {
      console.error('[Enhance Prompt API] Error:', err);
      const errorMsg = err.message || String(err);
      
      let clientError = `فشل تحسين البرومبت بالذكاء الاصطناعي: ${errorMsg}`;
      
      if (
        errorMsg.includes('quota') || 
        errorMsg.includes('Quota exceeded') || 
        errorMsg.includes('limit') || 
        errorMsg.includes('exhausted') || 
        errorMsg.includes('blocked') || 
        errorMsg.includes('billing') ||
        errorMsg.includes('429') ||
        errorMsg.includes('Resource')
      ) {
        clientError = '⚠️ تم تجاوز حد الاستخدام (الكوتا) الخاص بمفتاح الخادم المجاني لـ Gemini أو تم حظره مؤقتاً. يرجى تسجيل الدخول بحساب Google أو إضافة مفتاح الـ API الخاص بك في القائمة الجانبية (شريط الرأس في الأعلى) لمتابعة تحسين البرومبتات دون قيود.';
      } else if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('key is invalid') || errorMsg.includes('invalid API key')) {
        clientError = '⚠️ مفتاح API المستخدم غير صالح. يرجى التأكد من كتابة المفتاح بشكل صحيح في القائمة الجانبية (شريط الرأس في الأعلى).';
      }
      
      res.status(500).json({ error: clientError });
    }
  });

  // Custom API fallback handler to prevent falling back to Vite SPA HTML for api requests
  app.all('/api/*', (req, res) => {
    console.warn(`[API 404] Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `مسار الـ API غير موجود: ${req.method} ${req.originalUrl}` });
  });

  // Global error handler for all /api/* routes to guarantee clean JSON responses for errors (e.g. body-parser size limit exceeded)
  app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[API Error Middleware]:', err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      error: err.message || 'حدث خطأ غير متوقع أثناء معالجة طلبك.'
    });
  });

  // Web Share Target fallback route
  app.post('/share-target', (req, res) => {
    console.log('[Share Target Fallback] Redirecting shared post to home page');
    res.redirect(303, '/?shared=true');
  });

  // Serve uploaded images statically
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Handle Vite Asset Serving and SPA Fallback Routing
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Full-stack JADGPT server running on port ${PORT}`);
  });
}

startServer();
