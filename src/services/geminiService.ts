import { GoogleGenAI } from "@google/genai";

// قراءة المفتاح المحفوظ من المتصفح الخاص بالمستخدم
export const getApiKey = (): string | null => {
  return localStorage.getItem("GEMINI_API_KEY");
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
  if (!apiKey) {
    throw new Error("API Key is missing. Please save your API Key first.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // التحقق من الصور المرجعية وتحويلها إلى أجزاء Gemini
  const imageParts = referenceImagesBase64.map(imageBase64 => {
    const base64Data = imageBase64.split(',')[1] || imageBase64;
    return {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data,
      },
    };
  });

  const finalPrompt = `
    Based on the attached ${referenceImagesBase64.length} reference image(s), generate a brand new photorealistic cinematic image that illustrates this creative prompt:
    "${userPrompt}"
    
    Styling & Framing guidance to apply:
    ${variantStyle}
    
    Subject & Character Consistency:
    You MUST keep 100% visual consistency with the main subjects/characters/products from all the provided reference images. Combine their visual elements, facial details, brand shapes, styles, and distinct traits realistically, and place them beautifully into the brand new scene described by the prompt.
    
    Quality constraints:
    8k resolution, professional photography studio lighting, hyper-realistic, no mutations, no visual distortion, beautiful cinematic color correction.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { text: finalPrompt },
          ...imageParts
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error("No image content returned");

    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data found in response");
  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
    throw new Error(error.message || "فشلت عملية التوليد. يُرجى التحقق من صلاحية مفتاح الـ API.");
  }
};

// تعديل الصورة بناءً على طلب المستخدم المكتوب عند الضغط على زر التعديل
export const editImageWithPrompt = async (
  imageBase64: string,
  editInstruction: string
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          },
          {
            text: `Apply these edits to the image: "${editInstruction}". Maintain high quality, preserve subject identity and overall setting, changing ONLY the requested aspects.`
          }
        ]
      }
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error("No content returned from edit");

    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data found in edit response");
  } catch (error: any) {
    console.error("Gemini Edit Error:", error);
    throw new Error(error.message || "فشلت عملية التعديل.");
  }
};
