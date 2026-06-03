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
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.iss && data.iss.includes('securetoken.google.com')) {
      return data;
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

  // Body parser for handling large base64 uploads
  app.use(express.json({ limit: '15mb' }));

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
  });

  // Server-side Image Generation Proxy Route for Logged In Users
  app.post('/api/generate-image', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'من فضلك سجل دخولك في الموقع أولاً لتتمكن من استخدام حصة الخادم المجانية للتوليد.' });
      }
      
      const idToken = authHeader.split(' ')[1];
      const decodedToken = await verifyFirebaseIdToken(idToken);
      if (!decodedToken) {
        return res.status(401).json({ error: 'جلسة تسجيل الدخول غير صالحة أو منتهية. يرجى تسجيل الدخول مجدداً.' });
      }

      const { prompt, selectedModel, aspectRatio, selectedStyle, imageParts } = req.body;
      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'الرجاء كتابة وصف فكرتك (البرومبت) أولاً.' });
      }

      const ai = getGeminiClient();

      const styleObj = STYLE_PRESETS.find(s => s.id === selectedStyle);
      const styleInstructions = styleObj ? styleObj.suffix : '';

      let compositePrompt = prompt;
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

      let foundImg = null;
      let foundText = null;
      if (response && response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
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
          error: 'لم يتم إرجاع أي مخرجات صور من الموديل التوليدي. تأكد من تفعيل الفوترة لرمز الـ API على الخادم.' 
        });
      }

    } catch (err: any) {
      console.error('[API] Server Image Gen Error:', err);
      const errorStr = err?.message || String(err);
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
