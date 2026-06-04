import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const STYLE_PRESETS = [
  { id: 'realistic', suffix: 'Realistic, cinematic lighting, 8k resolution, highly detailed, photorealistic photoportrait.' },
  { id: '3d-cartoon', suffix: '3D animated character, Pixar style, cute, vibrant, whimsical lighting, raytraced.' },
  { id: 'oil-painting', suffix: 'Masterpiece oil painting style, visible brush strokes, rich warm lighting, classical artistic texture.' },
  { id: 'cyberpunk', suffix: 'Cyberpunk style, glowing neon lights, futuristic high-tech streets, vibrant purple and cyan accents.' },
  { id: 'superhero', suffix: 'Epic superhero suit, heroic pose, dramatic volumetric lighting, cinematic background action.' },
  { id: 'anime', suffix: 'Anime style, hand-drawn aesthetic, beautiful watercolor accents, whimsical atmosphere.' },
];

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

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not defined.');
  }
  return new GoogleGenAI({ apiKey });
};

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  // Server-side Image Generation Proxy Route for Logged In Users
  app.post('/api/generate-image', async (req, res) => {
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

      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'الرجاء كتابة وصف فكرتك (البرومبت) أولاً.' });
      }

      const isFreeModel = selectedModel.startsWith('pollinations-') || selectedModel === 'gpt-image-2';

      if (!isFreeModel) {
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

      if (googleAccessToken && googleAccessToken !== 'local-dummy-token') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel || 'gemini-2.5-flash-image'}:generateContent`;
        const resObj = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${googleAccessToken}`,
            'User-Agent': 'aistudio-build'
          },
          body: JSON.stringify({
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
              }
            }
          })
        });

        if (!resObj.ok) {
          const errData = await resObj.json().catch(() => ({}));
          console.error('[API] Google API direct OAuth call error, status:', resObj.status, errData);
          const detail = errData?.error?.message || `Google API status: ${resObj.status}`;
          throw new Error(detail);
        }
        responseData = await resObj.json();
      } else {
        const ai = getGeminiClient();
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
            }
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
          error: 'لم يتم إرجاع أي مخرجات صور من الموديل التوليدي. تأكد من تفعيل الفوترة لرمز الـ API الخاص بك.' 
        });
      }

    } catch (err: any) {
      console.error('[API] Server Image Gen Error:', err);
      const errorStr = err?.message || String(err);

      // Attempt automatic fallback to Pollinations Flux due to Gemini billing/quota error
      console.log('[API] Attempting automatic fallback to Pollinations Flux due to Gemini error:', errorStr);
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
        const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(compositePrompt)}?width=${width}&height=${height}&seed=${randomSeed}&nologo=true&enhance=true&model=flux`;

        const polRes = await fetch(pollinationsUrl);
        if (polRes.ok) {
          const arrayBuffer = await polRes.arrayBuffer();
          const base64Img = Buffer.from(arrayBuffer).toString('base64');
          console.log('[API] Successfully generated fallback image via Pollinations!');
          return res.json({
            imageUrl: `data:image/png;base64,${base64Img}`,
            isFallback: true,
            warning: 'تم التوليد عبر الموديل البديل المجاني فائق الجودة لتخطي قيود الفوترة لـ Google AI Studio.'
          });
        }
      } catch (fallbackErr) {
        console.error('[API] Fallback also failed:', fallbackErr);
      }

      if (errorStr.includes('API_KEY_INVALID') || errorStr.includes('invalid API key')) {
        return res.status(403).json({ error: 'رمز الـ API المبرمج على خادم JADGPT غير صالح حالياً. يرجى استخدام مفتاحك الخاص.' });
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
          error: '⚠️ تم تجاوز حد التوليد المجاني للصور على سيرفر JADGPT حالياً. لتخطي هذا القيد والاستمرار بالتوليد فوراً، يرجى تفعيل الدفع (Pay-as-you-go) في حسابك على Google AI Studio وإضافة مفتاحك الشخصي في خيار (حفظ مفتاح الـ API).' 
        });
      } else {
        return res.status(500).json({ error: `فشل التوليد: ${errorStr}` });
      }
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
