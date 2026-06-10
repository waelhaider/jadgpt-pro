import React, { useState, useRef, FormEvent, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { 
  Upload, 
  Sparkles, 
  Download, 
  Trash2, 
  Image as ImageIcon, 
  Layers, 
  ArrowLeft, 
  Check, 
  RefreshCw,
  FolderDown,
  Clock,
  Briefcase,
  Compass,
  Zap
} from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";
import { safeStorage } from '../lib/safe-storage';

export interface StylePreset {
  id: string;
  labelAr: string;
  labelEn: string;
  prompt: string;
  negative?: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "cinematic_portrait",
    labelAr: "سينمائي درامي",
    labelEn: "Cinematic Portrait",
    prompt: "Outfit: Textured, high-quality cinematic wardrobe fitting a movie poster aesthetic. Location/Background: Blurred cinematic scene with atmospheric depth and bokeh. Lighting/Color: Dramatic chiaroscuro lighting, rich slightly desaturated color grade, 85mm f/1.8 look.",
  },
  {
    id: "business_professional",
    labelAr: "رسمي واحترافي عملي",
    labelEn: "Business Professional",
    prompt: "Outfit: High-end tailored business suit or blazer with crisp shirt. Location/Background: Modern blurred corporate office or clean textured studio backdrop. Lighting/Color: Professional studio lighting, even and trustworthy, neutral color temperature.",
  },
  {
    id: "fashion_editorial",
    labelAr: "غلاف مجلة أزياء",
    labelEn: "Fashion Editorial",
    prompt: "Outfit: Avant-garde or trendy fashion editorial clothing with high-end fabrics. Location/Background: Minimalist architectural space or solid studio color. Lighting/Color: Bold, defined lighting (beauty dish or hard light), high-contrast fashion color grade.",
  },
  {
    id: "outdoor_natural",
    labelAr: "طبيعي خارجي",
    labelEn: "Outdoor Natural",
    prompt: "Outfit: Casual, comfortable, and textured everyday clothing (layers, cotton, wool). Location/Background: Softly blurred park, garden, or nature scene with green bokeh. Lighting/Color: Soft diffused natural sunlight (open shade), fresh and airy organic tones.",
  },
  {
    id: "dark_moody_studio",
    labelAr: "استوديو غامض ومظلم",
    labelEn: "Dark Moody Studio",
    prompt: "Outfit: Dark, solid-colored clothing (black, charcoal, navy) with texture. Location/Background: Pure black or very dark grey studio background. Lighting/Color: Low-key Rembrandt lighting, deep shadows, moody and emotional atmosphere.",
  },
  {
    id: "egyptian_classic",
    labelAr: "الطابع الكلاسيكي العريق",
    labelEn: "Egyptian Classic Portrait",
    prompt: "Outfit: Modern elegant clothing with subtle cultural hints or classic tones. Location/Background: Abstract warm background hinting at desert sunset or classic architecture (very blurred). Lighting/Color: Warm golden earth tones, dignified and timeless lighting.",
  },
  {
    id: "fitness_gym",
    labelAr: "رياضة لياقة بدنية",
    labelEn: "Fitness Gym",
    prompt: "Outfit: Premium athletic wear or sportswear showing physique. Location/Background: Blurred high-end gym environment with equipment in background. Lighting/Color: Dynamic, slightly gritty lighting to highlight muscle definition, cool gym tones.",
  },
  {
    id: "glamour_beauty",
    labelAr: "سحر الجمال واللمعان",
    labelEn: "Glamour Beauty",
    prompt: "Outfit: Elegant evening wear or beauty-focused styling (bare shoulders or jewelry). Location/Background: Soft glitzy bokeh or smooth studio gradient. Lighting/Color: Butterfly/Clamshell beauty lighting, shadowless face, soft glamorous glow.",
  },
  {
    id: "clean_studio_headshot",
    labelAr: "صورة شخصية رسمية نظيفة",
    labelEn: "Clean Studio Headshot",
    prompt: "Outfit: Smart casual neutral clothing (plain t-shirt, crisp shirt, no busy patterns). Location/Background: Seamless light gray or pure white background. Lighting/Color: High-key softbox lighting, very even, flattering, and clean commercial look.",
  },
  {
    id: "minimal_white_bg",
    labelAr: "خلفية بيضاء بسيطة",
    labelEn: "Minimal White Background",
    prompt: "Outfit: Simple, clean, solid-colored clothing that contrasts with white. Location/Background: Pure white seamless void. Lighting/Color: Soft diffused shadows, crisp high-contrast subject against white, ultra-minimalist.",
  },
  {
    id: "golden_hour",
    labelAr: "الساعة الذهبية والغروب",
    labelEn: "Golden Hour Sunset",
    prompt: "Outfit: Summer or autumn casual clothing with warm tones. Location/Background: Outdoor open field or horizon at sunset. Lighting/Color: Strong warm backlight (sun flare/rim light) creating a halo, golden orange aesthetic.",
  },
  {
    id: "bw_classic",
    labelAr: "أبيض وأسود كلاسيكي",
    labelEn: "Black & White Classic",
    prompt: "Outfit: Timeless clothing with good texture contrast (knits, leather, crisp collars). Location/Background: Simple studio or blurred texture. Lighting/Color: True Monochrome (Black & White), high contrast, classic film grain structure.",
    negative: "color, saturation, rainbow, sepia",
  },
  {
    id: "vintage_film_35mm",
    labelAr: "فيلم كلاسيكي قديم 35مم",
    labelEn: "Vintage Film 35mm",
    prompt: "Outfit: Vintage-inspired or timeless casual clothing. Location/Background: Unposed, candid real-world setting. Lighting/Color: Analog film look, Kodak Portra colors, slight halation, visible film grain, nostalgic vibe.",
  },
  {
    id: "streetwear_urban",
    labelAr: "ملابس شارع شبابية",
    labelEn: "Streetwear Urban",
    prompt: "Outfit: Trendy streetwear (hoodie, denim jacket, layered street style). Location/Background: Gritty city street, concrete walls, or urban alleyway. Lighting/Color: Natural city light, cool urban tones, slightly desaturated and edgy.",
  },
  {
    id: "casual_lifestyle",
    labelAr: "نمط يومي مريح كاجوال",
    labelEn: "Casual Lifestyle",
    prompt: "Outfit: Comfortable home attire (sweater, loose shirt). Location/Background: Cozy blurred living room or bedroom setting. Lighting/Color: Natural window light coming from side, warm and authentic home atmosphere.",
  },
  {
    id: "luxury_hotel_lobby",
    labelAr: "بهو فندق خمس نجوم",
    labelEn: "Luxury Hotel Lobby",
    prompt: "Outfit: Elegant business casual or cocktail attire. Location/Background: Blurred 5-star hotel lobby with chandeliers and warm architectural details. Lighting/Color: Warm ambient luxury lighting, gold and beige tones, sophisticated bokeh.",
  },
  {
    id: "coffee_shop_cozy",
    labelAr: "مقهى دافئ وهادئ",
    labelEn: "Coffee Shop Cozy",
    prompt: "Outfit: Fall/Winter casual (scarf, coat, knitwear). Location/Background: Blurred coffee shop interior with wood textures and warm lights. Lighting/Color: Ambient café lighting, warm brownish tones, intimate and candid.",
  },
  {
    id: "beach_summer",
    labelAr: "شاطئ بحر صيفي منعش",
    labelEn: "Beach Summer Vibes",
    prompt: "Outfit: Light linen shirt, summer dress, or swimwear. Location/Background: Bright sandy beach with blue sky and ocean. Lighting/Color: Bright natural sunlight, high exposure, airy pastel and blue tones, cheerful.",
  },
  {
    id: "travel_adventure",
    labelAr: "مغامرة وسفر واستكشاف",
    labelEn: "Travel Adventure",
    prompt: "Outfit: Practical travel jacket, cargo style, or outdoor gear. Location/Background: Blurred epic landscape (mountains or historic city). Lighting/Color: Natural outdoor light, documentary style, adventurous and realistic colors.",
  },
  {
    id: "tech_startup",
    labelAr: "نمط شركات تقنية ناشئة",
    labelEn: "Tech Startup Headshot",
    prompt: "Outfit: Casual tech industry attire (hoodie, t-shirt, open button-down). Location/Background: Blurred modern open-plan office with glass and daylight. Lighting/Color: Bright, friendly, modern office lighting, approachable and innovative vibe.",
  },
  {
    id: "old_money",
    labelAr: "طراز العائلات الراقية القديم",
    labelEn: "Old Money Aesthetic",
    prompt: "Outfit: Classic tailored luxury (polo, cable knit, linen, navy blazer). Location/Background: Manicured garden, tennis court, or country club estate. Lighting/Color: Soft natural daylight, rich but muted palette (cream, navy, green), expensive feel.",
  },
  {
    id: "cyberpunk_neon",
    labelAr: "تفاصيل سايبربانك النيون",
    labelEn: "Cyberpunk Neon",
    prompt: "Outfit: Tech-wear, leather jacket, or futuristic street fashion. Location/Background: Dark city night with out-of-focus neon signs. Lighting/Color: Magenta and Cyan rim lighting on edges, but face skin tone remains realistic. High contrast night look.",
  },
  {
    id: "noir_detective",
    labelAr: "سينما هوليوود القديمة",
    labelEn: "Noir Detective",
    prompt: "Outfit: Trench coat, fedora (optional), or sharp 1940s suit. Location/Background: Dark shadowy room with blinds or misty night street. Lighting/Color: High contrast Film Noir B&W (or extremely desaturated), hard shadows, dramatic rim light.",
    negative: "bright colors, cheerful",
  },
  {
    id: "winter_snow",
    labelAr: "أجواء الشتاء والثلج الأبيض",
    labelEn: "Winter Snow Scene",
    prompt: "Outfit: Stylish winter coat, scarf, gloves. Location/Background: Outdoor snowy street or forest with white snow bokeh. Lighting/Color: Cool winter tones (whites, blues), soft overcast diffused light, cozy cold feel.",
  }
];

export interface PhotoSessionGeneratorProps {
  initialPrompt?: string;
}

export default function PhotoSessionGenerator({ initialPrompt }: PhotoSessionGeneratorProps) {
  const [personImage, setPersonImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [age, setAge] = useState('25');
  const [styleId, setStyleId] = useState<string>(STYLE_PRESETS[0].id);
  const [numImages, setNumImages] = useState(1);
  const [extraNotes, setExtraNotes] = useState(initialPrompt || '');

  useEffect(() => {
    if (initialPrompt) {
      setExtraNotes(initialPrompt);
    }
  }, [initialPrompt]);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [isLoading, setIsLoading] = useState(false);
  const [currentProgressIndex, setCurrentProgressIndex] = useState(0);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('نوع الملف غير مدعوم. يرجى رفع صورة بصيغة JPEG أو PNG أو WEBP.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setPersonImage({ 
        base64: base64String, 
        mimeType: file.type,
        preview: reader.result as string
      });
      setError(null);
    };
    reader.onerror = () => {
      setError('فشلت قراءة ملف الصورة.');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const buildPrompt = (preset: StylePreset, userAge: string, notes: string): string => {
    return `Generate a cinematic ultra-realistic portrait of the person in the uploaded image.
    
    **CRITICAL INSTRUCTION: PRESERVE FACE IDENTITY 100%.** 
    The generated person MUST look exactly like the reference photo. 
    Target age: approx ${userAge} years old.

    **MANDATORY STYLE INSTRUCTION:**
    Apply ONLY the selected style '${preset.labelEn}'. The outfit, location, background, and lighting must strictly follow this style. Do not mix styles.

    **STYLE SPECIFICATIONS:**
    ${preset.prompt}

    **Technical Quality Standards:**
    - High resolution, 8K, HDR.
    - Photorealistic skin texture (pores, imperfections visible), no plastic skin.
    - Perfect eye focus.
    - Professional camera depth of field (bokeh).

    **Additional User Notes:** ${notes || 'None'}

    **Negative / Avoid:**
    Avoid outfits/backgrounds not matching the selected style. Avoid mixed styles, random locations, random clothing. ${preset.negative || ''}
    `;
  };

  const getClientApiKey = (): string => {
    return safeStorage.getItem("user_gemini_api_key") || 
           safeStorage.getItem("GEMINI_API_KEY") || 
           (process.env.GEMINI_API_KEY || "");
  };

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault();

    if (!personImage) {
      setError("الرجاء رفع صورة الشخص أولاً لتوثيق الملامح.");
      return;
    }
    if (!age.trim() || isNaN(Number(age))) {
      setError("الرجاء إدخال عمر صحيح رقمي.");
      return;
    }
    
    setIsLoading(true);
    setGeneratedImages([]);
    setError(null);
    setCurrentProgressIndex(0);

    const selectedPreset = STYLE_PRESETS.find(p => p.id === styleId) || STYLE_PRESETS[0];

    try {
      const apiKey = getClientApiKey();
      if (!apiKey) {
        throw new Error("لم يتم العثور على مفتاح API الخاص بك. يرجى إدخال مفتاح Gemini API في الإعدادات أو تسجيل الدخول.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const localGenerated: string[] = [];

      for (let i = 0; i < numImages; i++) {
        setCurrentProgressIndex(i);
        const textPrompt = buildPrompt(selectedPreset, age, extraNotes);

        const imagePart = {
          inlineData: {
            data: personImage.base64,
            mimeType: personImage.mimeType,
          },
        };
        const textPart = { text: textPrompt };

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [imagePart, textPart] },
          config: {
            responseModalities: [Modality.IMAGE],
            imageConfig: {
              aspectRatio: aspectRatio as any,
            },
          },
        });

        let imageUrl = '';
        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              imageUrl = `data:image/png;base64,${part.inlineData.data}`;
              break;
            }
          }
        }

        if (!imageUrl) {
          throw new Error("لم ترجع خوادم Google أي محتوى للصورة.");
        }

        localGenerated.push(imageUrl);
        setGeneratedImages(prev => [...prev, imageUrl]);
      }
    } catch (e: any) {
        console.error(e);
        setError(`حدث خطأ أثناء جلسة التصوير الافتراضية: ${e.message || 'الرجاء التحقق من جودة الاتصال بمزود الذكاء الاصطناعي.'}`);
    } finally {
        setIsLoading(false);
        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 150);
    }
  };

  const downloadZip = (zipBlob: Blob) => {
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `photo_session_${styleId}_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadSingleImage = (url: string, index: number) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `photo_session_${styleId}_${index}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadAll = async () => {
    if (generatedImages.length === 0) return;

    const zip = new JSZip();
    const promises = generatedImages.map(async (dataUrl, index) => {
      // If it is a base64 DataURL, parse it, otherwise fetch it
      if (dataUrl.startsWith('data:')) {
        const base64Data = dataUrl.split(',')[1];
        zip.file(`image_${index + 1}.png`, base64Data, { base64: true });
      } else {
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          zip.file(`image_${index + 1}.png`, blob);
        } catch (err) {
          console.error("Failed to add image to zip:", err);
        }
      }
    });

    try {
      await Promise.all(promises);
      const content = await zip.generateAsync({ type: 'blob' });
      downloadZip(content);
    } catch (e) {
      console.error("Error creating zip file", e);
      setError("فشل تجميع الصور وتحميلها في ملف مضغوط.");
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-xl border border-natural-border/50 max-w-5xl mx-auto" dir="rtl">
      {/* Visual Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-pink-100 text-pink-600">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </span>
            <h2 className="text-xl font-bold text-gray-900">استوديو التصوير الاحترافي بالذكاء الاصطناعي</h2>
          </div>
          <p className="text-xs text-natural-muted">
            ارفع صورتك الشخصية وحدد طابع الجلسة ليقوم الذكاء الاصطناعي بإعادة توليد ملامحك بدقة متكاملة في لقطات سنمائية خلابة.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Control Panel / Inputs (7 cols in wider screen) */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleGenerate} className="space-y-6">
            
            {/* Image Upload Area */}
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">الصورة المرجعية للوجه</label>
              
              <div 
                className={`relative border-2 border-dashed rounded-2xl p-4 transition-all text-center flex flex-col items-center justify-center min-h-[140px] cursor-pointer ${
                  dragActive ? "border-pink-500 bg-pink-50/20" : "border-gray-200 hover:border-pink-400 bg-gray-50/50"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept="image/png, image/jpeg, image/webp"
                  disabled={isLoading}
                />

                {personImage ? (
                  <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-between" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden shadow-md border-2 border-white shrink-0">
                        <img src={personImage.preview} alt="Reference preview" className="w-full h-full object-cover" />
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-emerald-600 flex items-center gap-1 mb-0.5">
                          <Check className="w-3.5 h-3.5" />
                          تم التقاط ملامح الوجه بنجاح
                        </p>
                        <p className="text-[10px] text-gray-400">سيلتزم الموديل بنسبة تطابق كاملة مع الصورة المرفقة</p>
                      </div>
                    </div>

                    <button 
                      type="button"
                      onClick={() => setPersonImage(null)}
                      className="p-1 px-3 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 rounded-full transition-colors flex items-center gap-1 border border-red-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      إزالة الصورة
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-11 h-11 rounded-full bg-pink-50 text-pink-500 flex items-center justify-center mb-2 shadow-sm">
                      <Upload className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-gray-700 mb-0.5">اسحب وأفلت صورة الوجه هنا أو اضغط للتصفح</p>
                    <p className="text-[10px] text-gray-400">يدعم JPG, PNG او WEBP (يفضل صورة واضحة ومباشرة للوجه)</p>
                  </div>
                )}
              </div>
            </div>

            {/* Custom Age & Aspect Ratio Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1.5">العمر الافتراضي المحاكي</label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="مثال: 25"
                  disabled={isLoading}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500/10 focus:border-pink-500 transition-all text-center"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1.5">أبعاد اللقطة (المقاس)</label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: '1:1', label: 'مربع (1:1)' },
                    { id: '16:9', label: 'أفقي (16:9)' },
                    { id: '9:16', label: 'طولي (9:16)' }
                  ].map((ratio) => (
                    <button
                      key={ratio.id}
                      type="button"
                      onClick={() => setAspectRatio(ratio.id)}
                      className={`text-center py-2 px-1 text-xs font-bold rounded-lg border transition-all ${
                        aspectRatio === ratio.id
                          ? 'bg-pink-50 border-pink-500 text-pink-700 font-extrabold shadow-sm'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Advanced style preset grids with rich cards */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-bold text-gray-800">طابع جلسة التصوير (الأجواء)</label>
                <span className="text-[10px] text-pink-600 bg-pink-100/60 px-2 py-0.5 rounded-full font-bold">24 نمط فني متاح</span>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto pr-1 border border-gray-100 rounded-xl p-2.5 bg-gray-50/50">
                {STYLE_PRESETS.map((preset) => {
                  const isSelected = styleId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => !isLoading && setStyleId(preset.id)}
                      className={`cursor-pointer p-3 rounded-xl border text-right transition-all flex flex-col justify-between ${
                        isSelected 
                          ? 'bg-gradient-to-br from-pink-500 to-pink-600 text-white border-pink-600 shadow-md transform scale-[1.02]' 
                          : 'bg-white border-gray-100 hover:border-pink-200 hover:bg-pink-50/10 text-gray-800 shadow-sm'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <span className={`text-[11px] font-extrabold truncate ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                            {preset.labelAr}
                          </span>
                          {isSelected && <span className="bg-white rounded-full p-0.5 text-pink-600"><Check className="w-2.5 h-2.5 stroke-[3]" /></span>}
                        </div>
                        <p className={`text-[9px] line-clamp-2 leading-relaxed h-[26px] ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                          {preset.prompt}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Range of numbers & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">عدد الصور لتوليدها في الجلسة: <span className="text-pink-600 font-extrabold">{numImages}</span></label>
                <p className="text-[10px] text-gray-400 mb-2">تأليف عدة لقطات مختلفة لنفس الطابع الإبداعي</p>
                <input
                  type="range"
                  min="1"
                  max="6"
                  value={numImages}
                  onChange={(e) => setNumImages(Number(e.target.value))}
                  disabled={isLoading}
                  className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-pink-500 disabled:opacity-50"
                />
                <div className="flex justify-between text-[10px] text-gray-400 px-1 mt-1 font-mono">
                  <span>1 صورة</span>
                  <span>3 صور</span>
                  <span>6 صور</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">تفاصيل إضافية مخصصة (اختياري)</label>
                <p className="text-[10px] text-gray-400 mb-2">تعديل لون الملابس والشارب، تفاصيل الخلفية، النظارات...</p>
                <textarea
                  value={extraNotes}
                  onChange={(e) => setExtraNotes(e.target.value)}
                  placeholder="مثال: يرتدي سترة كشمير رمادية، نظارة شمسية أنيقة، شعره مصفف للأعلى..."
                  disabled={isLoading}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-pink-500/10 focus:border-pink-500 transition-all resize-none h-[64px]"
                />
              </div>
            </div>

            {/* Submit block */}
            <button
              type="submit"
              disabled={isLoading || !personImage}
              className={`w-full py-3.5 px-4 rounded-xl text-sm font-extrabold text-white flex items-center justify-center gap-2 transition-all shadow-md ${
                !personImage 
                  ? 'bg-gray-300 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 hover:shadow-lg hover:shadow-pink-600/15 hover:scale-[1.01]'
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري تصوير اللقطة الحالية ({currentProgressIndex + 1}/{numImages})... يرجى الانتظار</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>بدء الجلسة وتوليد الصور الفوتوغرافية</span>
                </>
              )}
            </button>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-xs font-bold leading-relaxed">
                ⚠️ {error}
              </div>
            )}
          </form>
        </div>

        {/* Right Gallery Display (5 cols in wider screen) */}
        <div className="lg:col-span-5 flex flex-col justify-between" ref={resultsRef}>
          <div className="border border-gray-100 bg-gray-50/40 rounded-2xl p-5 flex-1 flex flex-col justify-center min-h-[360px]">
            {isLoading ? (
              <div className="flex flex-col items-center text-center py-12">
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-full border-4 border-pink-100 border-t-pink-500 animate-spin flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-pink-500 animate-pulse" />
                  </div>
                </div>
                <h4 className="text-sm font-bold text-gray-800 mb-1.5">جاري توليد صورتك الفوتوغرافية الفريدة</h4>
                <div className="max-w-xs space-y-2 mt-2">
                  <p className="text-xs text-gray-400 animate-pulse leading-relaxed">
                    نقوم بالتركيز المكثّف على هويتك وملامح وجهك المرفوعة وتوجيه الموديل لتغيير الملابس والخلفية دون المساس بشخصيتك.
                  </p>
                  <p className="text-[10px] text-pink-600 bg-pink-50 inline-block px-2.5 py-1 rounded-full font-bold">
                    جاري التقاط لقطات {currentProgressIndex + 1} من أصل {numImages}
                  </p>
                </div>
              </div>
            ) : generatedImages.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <h3 className="text-xs font-black text-gray-600">الصور الملتقطة بالجلسة</h3>
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">مكتملة بنجاح</span>
                </div>

                <div className="grid grid-cols-2 gap-3.5 max-h-[380px] overflow-y-auto pr-1">
                  {generatedImages.map((img, idx) => (
                    <div key={idx} className="group relative aspect-square rounded-xl overflow-hidden shadow-sm bg-white border border-gray-100">
                      <img 
                        referrerPolicy="no-referrer"
                        src={img} 
                        alt={`Melded graphics ${idx + 1}`} 
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-center">
                        <span className="text-[10px] text-white font-bold font-mono">#{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => downloadSingleImage(img, idx + 1)}
                          className="bg-white/95 text-gray-800 hover:bg-white p-1 rounded-lg transition-colors flex items-center justify-center shadow-md active:scale-90"
                          title="تحميل الصورة"
                        >
                          <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {numImages > 1 && (
                  <button
                    type="button"
                    onClick={handleDownloadAll}
                    className="w-full mt-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
                  >
                    <FolderDown className="w-4 h-4" />
                    <span>تحميل جميع الصور كملف مضغوط (.ZIP)</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center text-center py-12 text-gray-400">
                <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-3 text-gray-300 border border-gray-100">
                  <ImageIcon className="w-8 h-8" />
                </div>
                <h4 className="text-xs font-bold text-gray-700 mb-1">جلسة تصوير فارغة حالياً</h4>
                <p className="text-[10px] text-gray-400 max-w-xs leading-relaxed">
                  بمجرد النقر على "بدء الجلسة وتوليد الصور"، سيظهر نتاج المحاكاة السينمائية هنا مع إتاحة التحميل المباشر.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
