import { safeStorage } from '../lib/safe-storage';

// قراءة المفتاح المحفوظ من المتصفح الخاص بالمستخدم
export const getApiKey = (): string | null => {
  return safeStorage.getItem("user_gemini_api_key") || safeStorage.getItem("GEMINI_API_KEY");
};

// تعريف الأنماط الفنية الأربعة للصور الأربعة
export const IMAGE_VARIANTS = [
  { id: '1', title: 'لقطة رئيسة (Master Shot)', style: 'A cinematic high-resolution master shot, beautifully framed, rich colors, deep mood, fully rendering the prompt.' },
  { id: '2', title: 'لقطة قريبة (Portrait Zoom)', style: 'An intimate cinematic close-up shot capturing fine textures, realistic lighting detail, focused soft background, fully rendering the prompt.' },
  { id: '3', title: 'زاوية سينمائية (Low Angle)', style: 'A powerful low-angle cinematic shot, creative dynamic perspective, dramatic lighting, fully rendering the prompt.' },
  { id: '4', title: 'لقطة فنية (Artistic Shot)', style: 'An atmospheric, creative artistic studio shot with professional lighting grading, intense focus, depth of field, fully rendering the prompt.' }
];

// توليد صورة واحدة مبنية على البرومبت والصورة المرجعية
export const generateSingleImage = async (
  referenceImagesBase64: string[],
  userPrompt: string,
  variantStyle: string,
  aspectRatio: string = "16:9",
  modelName: string = "gemini-2.5-flash-image"
): Promise<string> => {
  const apiKey = getApiKey();

  // التحقق من الصور المرجعية وتحويلها إلى أجزاء Gemini
  const imageParts = (referenceImagesBase64 || []).map(imageBase64 => {
    const base64Data = imageBase64.split(',')[1] || imageBase64;
    return {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data,
      },
    };
  });

  let finalPrompt = "";
  if (referenceImagesBase64 && referenceImagesBase64.length > 0) {
    finalPrompt = `
      Based on the attached ${referenceImagesBase64.length} reference image(s), generate a brand new photorealistic cinematic image that illustrates this creative prompt:
      "${userPrompt}"
      
      Styling & Framing guidance to apply:
      ${variantStyle}
      
      Subject & Character Consistency:
      You MUST keep 100% visual consistency with the main subjects/characters/products from all the provided reference images. Combine their visual elements, facial details, brand shapes, styles, and distinct traits realistically, and place them beautifully into the brand new scene described by the prompt.
      
      Quality constraints:
      8k resolution, professional photography studio lighting, hyper-realistic, no mutations, no visual distortion, beautiful cinematic color correction.
    `.trim();
  } else {
    finalPrompt = `
      Generate a brand new photorealistic cinematic image that illustrates this creative prompt:
      "${userPrompt}"
      
      Styling & Framing guidance to apply:
      ${variantStyle}
      
      Quality constraints:
      8k resolution, professional photography studio lighting, hyper-realistic, no mutations, no visual distortion, beautiful cinematic color correction.
    `.trim();
  }

  try {
    let authHeader = "";
    try {
      const { getCurrentUser } = await import("../lib/auth");
      const currentUser = getCurrentUser();
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        authHeader = `Bearer ${idToken}`;
      }
    } catch (e) {
      console.warn("Could not retrieve firebase id token:", e);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }
    if (apiKey) {
      headers["x-gemini-api-key"] = apiKey;
    }
    const googleToken = safeStorage.getItem("google_access_token");
    if (googleToken && googleToken !== "local-dummy-token") {
      headers["x-google-access-token"] = googleToken;
    }

    const response = await fetch("/api/generate-image", {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: finalPrompt,
        selectedModel: modelName,
        aspectRatio: aspectRatio,
        useRawPrompt: true, // نخبر السيرفر بأن هذا برومبت ناصع ومجهز بالكامل ولا يحتاج تعديل آخر
        imageParts: imageParts,
        apiKey: apiKey
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `خطأ من الخادم: ${response.status}`);
    }

    const data = await response.json();
    if (data.imageUrl) {
      return data.imageUrl;
    }
    throw new Error("لم يتم إرجاع رابط الصورة من الخادم.");
  } catch (error: any) {
    console.error("Google Gemini API Error (Server-Proxy):", error);
    throw new Error(error.message || "فشلت عملية التوليد والمباشر.");
  }
};

// تعديل الصورة بناءً على طلب المستخدم المكتوب عند الضغط على زر التعديل
export const editImageWithPrompt = async (
  imageBase64: string,
  editInstruction: string
): Promise<string> => {
  const apiKey = getApiKey();
  const base64Data = imageBase64.split(',')[1] || imageBase64;

  const imageParts = [
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data
      }
    }
  ];

  try {
    let authHeader = "";
    try {
      const { getCurrentUser } = await import("../lib/auth");
      const currentUser = getCurrentUser();
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        authHeader = `Bearer ${idToken}`;
      }
    } catch (e) {
      console.warn("Could not retrieve firebase id token for edit:", e);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }
    if (apiKey) {
      headers["x-gemini-api-key"] = apiKey;
    }
    const googleToken = safeStorage.getItem("google_access_token");
    if (googleToken && googleToken !== "local-dummy-token") {
      headers["x-google-access-token"] = googleToken;
    }

    const finalPrompt = `Apply these edits to the image: "${editInstruction}". Maintain high quality, preserve subject identity and overall setting, changing ONLY the requested aspects.`;

    const response = await fetch("/api/generate-image", {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: finalPrompt,
        selectedModel: 'gemini-2.5-flash-image',
        aspectRatio: '16:9',
        useRawPrompt: true, // ناصع جاهز
        imageParts: imageParts,
        apiKey: apiKey
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `خطأ من الخادم: ${response.status}`);
    }

    const data = await response.json();
    if (data.imageUrl) {
      return data.imageUrl;
    }
    throw new Error("لم يتم إرجاع رابط الصورة المعدلة من الخادم.");
  } catch (error: any) {
    console.error("Gemini Edit Error:", error);
    throw new Error(error.message || "فشلت عملية التعديل.");
  }
};
