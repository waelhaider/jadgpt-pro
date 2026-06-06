import React, { useState, useEffect, useRef } from 'react';
import { ApiKeyInput } from './ApiKeyInput';
import { FourImageGrid } from './FourImageGrid';
import { generateSingleImage, IMAGE_VARIANTS } from '../services/geminiService';
import { GeneratedImage } from '../types';
import { Sparkles, UploadCloud, Trash2, Sliders, AlertCircle, RefreshCw, Layers, Plus, Camera, ExternalLink, Save, Globe, X } from 'lucide-react';

interface TryPromptWorkspaceProps {
  initialPrompt?: string;
  onPostCreated?: () => void;
}

// خريطة زوايا ونوع اللقطة
const SHOT_TYPES_MAP: Record<string, string> = {
  "صورة مقربة": "Camera Framing: A detailed close-up portrait shot focusing on subject features with a narrow depth of field.",
  "لقطة كاملة": "Camera Framing: An expansive full-body cinematic shot showcasing the entire subject inside the scenery.",
  "زاوية منخفضة": "Camera Framing: A dramatic low-angle cinematic shot looking up at the subject to emphasize magnitude.",
  "لقطة من أعلى إلى أسفل": "Camera Framing: An atmospheric bird's-eye top-down view looking vertically down.",
  "لقطة على مستوى العين": "Camera Framing: An eye-level cinematic shot looking directly at the subject, natural human gaze.",
  "لقطة الملمس التفصيلية": "Camera Framing: A high-detail tactile zoom focusing purely on surface textures and micro structures.",
  "زاوية ديناميكية 3/4": "Camera Framing: A creative 3/4 dynamic offset perspective adding beautiful geometric depth.",
  "لقطة البطل (زاوية منخفضة قليلاً)": "Camera Framing: A powerful hero rendering with subtle low angle and stylized spotlighting.",
  "جبهة متناظرة": "Camera Framing: A perfectly centered, symmetrical frontal portrait view with clinical focus.",
  "عرض عين الدودة": "Camera Framing: An extreme worm's-eye view shot from the ground level emphasizing massive height.",
  "لقطة ماكرو": "Camera Framing: An ultra-high-resolution macro magnification revealing stunning pristine details.",
  "الزاوية الهولندية": "Camera Framing: A cinematic Dutch angle with a stylized slightly tilted horizon and rich drama.",
  "زاوية عالية": "Camera Framing: A high-angle view looking down at the subject, showing the scene scale perfectly.",
  "لقطة متوسطة": "Camera Framing: A balanced medium shot from waist up with professional cinematic composition."
};

const aspectRatioLabels: Record<string, string> = {
  "16:9": "سينمائي (16:9)",
  "1:1": "مربع (1:1)",
  "4:3": "شاشة (4:3)",
  "9:16": "طولي (9:16)"
};

const imageCountLabels: Record<number, string> = {
  1: "صورة واحدة (1)",
  2: "صورتين (2)",
  3: "3 صور",
  4: "4 صور (كامل)"
};

export default function TryPromptWorkspace({ initialPrompt = '', onPostCreated }: TryPromptWorkspaceProps) {
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [promptText, setPromptText] = useState(initialPrompt);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [images, setImages] = useState<Record<string, GeneratedImage>>({});
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [imageCount, setImageCount] = useState<number>(4);
  const [selectedModel] = useState<string>("gemini-2.5-flash-image");
  const [selectedShotType, setSelectedShotType] = useState<string>("تلقائي / نمط افتراضي");

  // حالات فتح القوائم المنسدلة الخفيفة والذكية
  const [showRatioDropdown, setShowRatioDropdown] = useState(false);
  const [showCountDropdown, setShowCountDropdown] = useState(false);
  const [showShotTypeDropdown, setShowShotTypeDropdown] = useState(false);

  // حالات مقارنة الصور في منصات خارجية مع نسخ البرومبت تلقائياً
  const [showComparisonDropdown, setShowComparisonDropdown] = useState(false);
  const [customSites, setCustomSites] = useState<{name: string, url: string}[]>([]);
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteUrl, setNewSiteUrl] = useState("");
  const [copySuccessMsg, setCopySuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('TRY_PROMPT_CUSTOM_SITES');
    if (saved) {
      try {
        setCustomSites(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initialPrompt changes (e.g. when user clicks on a post card's test button)
  useEffect(() => {
    if (initialPrompt) {
      setPromptText(initialPrompt);
      const el = document.getElementById('try-prompt-workspace-title');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [initialPrompt]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(file => {
        processFile(file as File);
      });
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('الرجاء اختيار ملف صورة صالح.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setReferenceImages(prev => {
        if (prev.length >= 3) {
          alert('الحد الأقصى للصور المرجعية هو 3 صور.');
          return prev;
        }
        return [...prev, reader.result as string];
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach(file => {
        processFile(file as File);
      });
    }
  };

  const generateSingleImageWithRetry = async (
    refImages: string[],
    pText: string,
    style: string,
    aspect: string,
    model: string,
    maxRetries = 3
  ): Promise<string> => {
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = await generateSingleImage(refImages, pText, style, aspect, model);
        if (url) return url;
        throw new Error("لم ترجع خوادم Google أي محتوى للصورة.");
      } catch (err: any) {
        lastError = err;
        const errStr = String(err?.message || JSON.stringify(err)).toLowerCase();
        
        // Don't retry if it's an authorization/API key invalid error that will never succeed
        const isAuthError = errStr.includes("key") || errStr.includes("api_key") || errStr.includes("unauthorized") || errStr.includes("not_found") || errStr.includes("entity was not found");
        if (isAuthError) {
          throw err;
        }

        if (attempt < maxRetries) {
          // Exponential backoff sleep: 2s, 4s, etc.
          const delay = attempt * 2000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError || new Error("فشلت المحاولة بعد عدة تجارب متكررة.");
  };

  const handleGenerate = async () => {
    if (referenceImages.length === 0) {
      alert("الطلب ملغى: برجاء رفع صورة مرجعية واحدة على الأقل لتطابق الملامح والمنتجات بالكامل.");
      return;
    }
    if (!promptText.trim()) {
      alert("الطلب ملغى: برجاء كتابة البرومبت أو السيناريو المنشود توليده.");
      return;
    }
    if (!hasApiKey) {
      alert("الطلب ملغى: يرجى إدخال وحفظ مفتاح الـ API الخاص بـ Gemini في الأعلى للبدء.");
      return;
    }

    setIsGenerating(true);
    setErrorGlobal(null);

    // تصفية الأنماط على حسب العدد المطلوب
    const selectedVariants = IMAGE_VARIANTS.slice(0, imageCount);

    const initialImages: Record<string, GeneratedImage> = {};
    selectedVariants.forEach((variant, index) => {
      initialImages[variant.id] = {
        id: variant.id,
        title: variant.title,
        imageUrl: null,
        status: index === 0 ? 'loading' : 'pending' // الأولى تبدأ فوراً، البقية في الاستعداد
      };
    });
    setImages(initialImages);

    // زاوية اللقطة المحددة من قبل المستخدم
    const shotStyle = SHOT_TYPES_MAP[selectedShotType];

    // تشغيل التوليد في صف متتالي (Sequential Queue) لتقليل العبء ومنع الـ 503
    for (let i = 0; i < selectedVariants.length; i++) {
      const variant = selectedVariants[i];

      // تحديث الحالة إلى جاري المعالجة (loading) عند البدء
      setImages(prev => ({
        ...prev,
        [variant.id]: {
          ...prev[variant.id],
          status: 'loading'
        }
      }));

      try {
        const finalStyle = shotStyle ? `${shotStyle}. Additionally apply style: ${variant.style}` : variant.style;
        const url = await generateSingleImageWithRetry(referenceImages, promptText.trim(), finalStyle, aspectRatio, selectedModel);
        
        setImages(prev => ({
          ...prev,
          [variant.id]: {
            ...prev[variant.id],
            status: 'completed',
            imageUrl: url
          }
        }));
      } catch (err: any) {
        setImages(prev => ({
          ...prev,
          [variant.id]: {
            ...prev[variant.id],
            status: 'failed',
            error: err.message || "فشلت معالجة اللقطة الفنية بعد المحاولة"
          }
        }));
      }
    }

    setIsGenerating(false);
  };

  const handleRegenerateImage = async (id: string) => {
    const variant = IMAGE_VARIANTS.find(v => v.id === id);
    if (!variant) return;

    if (referenceImages.length === 0) {
      alert("الطلب ملغى: برجاء رفع صورة مرجعية واحدة على الأقل لتطابق الملامح والمنتجات بالكامل.");
      return;
    }
    if (!promptText.trim()) {
      alert("الطلب ملغى: برجاء كتابة البرومبت أولاً.");
      return;
    }
    if (!hasApiKey) {
      alert("الطلب ملغى: يرجى إدخال وحفظ مفتاح الـ API الخاص بـ Gemini في الأعلى للبدء.");
      return;
    }

    setImages(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        status: 'loading',
        error: undefined,
        imageUrl: null
      }
    }));

    const shotStyle = SHOT_TYPES_MAP[selectedShotType];

    try {
      const finalStyle = shotStyle ? `${shotStyle}. Additionally apply style: ${variant.style}` : variant.style;
      const url = await generateSingleImageWithRetry(referenceImages, promptText.trim(), finalStyle, aspectRatio, selectedModel);
      setImages(prev => ({
        ...prev,
        [id]: {
          ...prev[id],
          status: 'completed',
          imageUrl: url,
          error: undefined
        }
      }));
    } catch (err: any) {
      setImages(prev => ({
        ...prev,
        [id]: {
          ...prev[id],
          status: 'failed',
          error: err.message || "حدث خطأ أثناء إعادة التوليد"
        }
      }));
    }
  };

  const handleUpdateImage = (id: string, newUrl: string) => {
    setImages(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        imageUrl: newUrl,
        status: 'completed'
      }
    }));
  };

  const handleAddCustomSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim() || !newSiteUrl.trim()) return;
    
    let formattedUrl = newSiteUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const updated = [...customSites, { name: newSiteName.trim(), url: formattedUrl }];
    setCustomSites(updated);
    localStorage.setItem('TRY_PROMPT_CUSTOM_SITES', JSON.stringify(updated));
    setNewSiteName("");
    setNewSiteUrl("");
  };

  const handleRemoveCustomSite = (indexToRemove: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customSites.filter((_, idx) => idx !== indexToRemove);
    setCustomSites(updated);
    localStorage.setItem('TRY_PROMPT_CUSTOM_SITES', JSON.stringify(updated));
  };

  const handleOpenSite = (url: string) => {
    const textToCopy = promptText.trim() || "A gorgeous cinematic scene";
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopySuccessMsg("تم نسخ نص البرومبت تلقائياً! جارٍ فتح الموقع المختار...");
      setTimeout(() => setCopySuccessMsg(null), 2500);
      window.open(url, '_blank');
    }).catch((err) => {
      console.error("Failed to copy text: ", err);
      window.open(url, '_blank');
    });
  };

  const removeReference = (index: number) => {
    setReferenceImages(prev => prev.filter((_, idx) => idx !== index));
  };

  const samplePrompts = [
    "شخصية واقفة في مدينة مستقبلية ساحرة نيون، طراز سايبربانك",
    "تصوير إعلاني احترافي مع لمسة دافئة للمنتج محاطاً بأزهار عطرية مبهجة",
    "رائد فضاء يطفو بهدوء في الفراغ الكوني مع سديم ذهبي مشع",
    "على ضفاف شلال طبيعي رائع وقت غروب الشمس الخلاب مع هالة حالمة",
    "يجلس على طاولة خشبية ريفية",
    "يجلس على حافة النافذة (ضوء الصباح)",
    "وسط مناظر المدينة الحضرية (بوكيه)",
    "مع الأشكال الهندسية والظلال",
    "خلفية مخملية فاخرة",
    "الخلفية الخرسانية الصناعية",
    "على شاطئ رملي",
    "في غابة خضراء مورقة",
    "في الطبيعة (مع قطرات الندى)",
    "استوديو الحد الأدنى (خلفية متدرجة)",
    "إعداد Cyberpunk بإضاءة النيون"
  ];

  return (
    <div className="bg-[#030712] border border-gray-850 rounded-3xl p-6 md:p-8 text-white shadow-2xl relative overflow-hidden" dir="rtl">
      {/* Glow Effects */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="relative z-10">
        {/* Header Title */}
        <div className="text-right border-b border-gray-850 pb-6 mb-8">
          <div className="flex items-center gap-3 mb-1 justify-start relative">
            <div className="relative">
              {/* Pulsing button to trigger dropdown */}
              <button
                type="button"
                onClick={() => setShowComparisonDropdown(!showComparisonDropdown)}
                className="bg-amber-500/10 p-2.5 rounded-2xl border border-amber-500/20 text-amber-500 hover:bg-amber-500/25 transition-all cursor-pointer block relative transition-transform hover:scale-105 active:scale-95"
                title="مقارنة النتائج بمنصات خارجية ومواقع أخرى"
              >
                <Sparkles className="w-6 h-6 animate-pulse" />
                {/* Visual badge indicator */}
                <span className="absolute -top-1 -left-1 w-3 h-3 bg-red-500 rounded-full ring-2 ring-[#030712] animate-bounce"></span>
              </button>

              {/* The Dropdown block */}
              {showComparisonDropdown && (
                <div className="absolute right-0 top-14 z-50 bg-[#0f172a] border border-amber-500/30 w-80 md:w-[420px] rounded-2xl p-4 shadow-2xl text-right animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-3">
                    <div className="flex items-center gap-2 text-amber-400">
                      <Globe size={18} className="animate-spin duration-3000" />
                      <span className="text-sm font-black">مقارنة النتائج بمنصات أخرى 🌐</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowComparisonDropdown(false)}
                      className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <p className="text-[11px] text-gray-400 leading-relaxed mb-4">
                    💡 اضغط على أي منصة للتوليد بالأسفل، سيتم <span className="text-amber-400 font-extrabold">نسخ البرومبت الحالي تلقائياً</span> إلى الحافظة الخاصة بك، ثم فتح الموقع في علامة تبويب جديدة لتسهيل عملية اللصق والمقارنة الفورية!
                  </p>

                  {/* Toast-like alert within dropdown */}
                  {copySuccessMsg && (
                    <div className="bg-emerald-500/10 border border-emerald-500/25 p-2 rounded-xl text-xs text-emerald-400 font-bold mb-3 flex items-center gap-1.5 animate-pulse">
                      <span>✓</span>
                      <span>{copySuccessMsg}</span>
                    </div>
                  )}

                  {/* Predefined websites */}
                  <div className="space-y-2 mb-4">
                    <span className="text-[10px] font-extrabold text-gray-400 block mb-1">المواقع الافتراضية السريعة:</span>
                    {[
                      { name: "Wan Video (Wan 2.7)", url: "https://create.wan.video/generate/image/draft?model=wan2.7", desc: "أقوى نموذج صيني لتجربة صور احترافية" },
                      { name: "GenSpark AI Image", url: "https://www.genspark.ai/ai_image", desc: "التوليد والمقارنة المتعددة" },
                      { name: "Arena AI Workspace", url: "https://arena.ai/image/side-by-side", desc: "مقارنة جنبا إلى جنب بين الموديلات المختلفة" },
                      { name: "DuckDuckGo AI Chat & Draw", url: "https://duck.ai/", desc: "الدردشة والرسم الفني بخصوصية فائقة" },
                      { name: "PromptsRef AI Generator", url: "https://promptsref.com/tool/AI-Image-Generator", desc: "توليد وإسناد فني معاصر" }
                    ].map((site, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleOpenSite(site.url)}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl border border-gray-800 bg-gray-900/50 hover:bg-amber-500/5 hover:border-amber-500/30 text-right group transition-all duration-200 cursor-pointer text-xs"
                      >
                        <div className="flex flex-col text-right">
                          <span className="font-extrabold text-[#f3f4f6] group-hover:text-amber-400 transition-colors">{site.name}</span>
                          <span className="text-[10px] text-gray-500 mt-0.5">{site.desc}</span>
                        </div>
                        <ExternalLink size={14} className="text-gray-500 group-hover:text-amber-400 transition-colors shrink-0 mr-2" />
                      </button>
                    ))}
                  </div>

                  {/* Custom Websites */}
                  <div className="border-t border-gray-800 pt-3">
                    <span className="text-[10px] font-extrabold text-gray-400 block mb-2 font-mono">مواقعك المخصصة المحفوظة 📌:</span>
                    
                    {customSites.length > 0 ? (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto mb-3 pr-1 divide-y divide-gray-900/40">
                        {customSites.map((site, idx) => (
                          <div 
                            key={idx}
                            onClick={() => handleOpenSite(site.url)}
                            className="flex items-center justify-between py-2 px-1 hover:bg-gray-900 rounded-lg group transition-all duration-150 cursor-pointer text-xs"
                          >
                            <span className="font-bold text-[#e5e7eb] group-hover:text-amber-400">{site.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-gray-500 truncate max-w-[120px]">{site.url}</span>
                              <button
                                type="button"
                                onClick={(e) => handleRemoveCustomSite(idx, e)}
                                className="text-gray-500 hover:text-red-400 p-1 rounded transition-colors cursor-pointer"
                                title="إزالة الموقع"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-500 block text-center mb-3">لم تقم بإضافة أقسام ومواقع مقارنة خاصة بك بعد.</span>
                    )}

                    {/* Add Custom site form */}
                    <div className="bg-gray-950 p-3 rounded-xl border border-gray-900 space-y-2">
                      <span className="text-[10px] font-extrabold text-amber-500/95 block">أضف موقعاً جديداً لجدول المقارنة:</span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          value={newSiteName}
                          onChange={(e) => setNewSiteName(e.target.value)}
                          placeholder="اسم موقعك المفضل"
                          className="bg-gray-900 border border-gray-800 rounded-lg text-[10px] p-2 focus:outline-none focus:ring-1 focus:ring-amber-500 w-full text-right text-gray-200"
                        />
                        <input
                          type="text"
                          required
                          value={newSiteUrl}
                          onChange={(e) => setNewSiteUrl(e.target.value)}
                          placeholder="الرابط (URL)"
                          className="bg-gray-900 border border-gray-800 rounded-lg text-[10px] p-2 focus:outline-none focus:ring-1 focus:ring-amber-500 w-full text-right text-gray-200"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          const mockEvent = { preventDefault: () => {} } as React.FormEvent;
                          handleAddCustomSite(mockEvent);
                        }}
                        className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[10px] font-black tracking-wide text-white transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-95"
                      >
                        <Save size={12} />
                        <span>حفظ وحقن الموقع في ذاكرة المتصفح</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <h2 id="try-prompt-workspace-title" className="text-2xl font-black bg-gradient-to-l from-white via-gray-100 to-amber-500 bg-clip-text text-transparent">
              معمل الصور الذكي (تجربة البرومبت) 🧪✨
            </h2>
          </div>
          <p className="text-sm text-gray-400 mt-1 mr-1">
            ابتكر لقطات سينمائية ساحرة مع دمج ما يصل إلى 3 صور مرجعية والحفاظ التام على ملامح العناصر الشخصية والمنتجات.
          </p>
        </div>

        {/* Api Key Store */}
        <ApiKeyInput onKeyUpdate={setHasApiKey} />

        {/* Workspace Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
          
          {/* Right Panel: Uploader & Context */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <label className="block text-sm font-extrabold text-gray-300 mb-3 text-right">
                1. الصور المرجعية (حتى 3 صور مدمجة) 📸
              </label>
              
              <div className="space-y-4">
                {/* Upload drag block */}
                {referenceImages.length < 3 && (
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl h-36 flex flex-col justify-center items-center text-center p-4 cursor-pointer transition-all ${
                      isDragActive 
                        ? 'border-amber-500 bg-amber-500/10' 
                        : 'border-gray-800 bg-gray-950/40 hover:bg-gray-900/30 hover:border-gray-700'
                    }`}
                  >
                    <UploadCloud className="w-8 h-8 text-gray-400 mb-2 animate-bounce" />
                    <p className="text-xs font-bold text-gray-200">اسحب وأفلت صورة مرجعية ({3 - referenceImages.length} متبقية)</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">أو اضغط لتصفح الملفات من جهازك</p>
                  </div>
                )}

                {/* Upladed horizontal / grid row */}
                {referenceImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {referenceImages.map((img, idx) => (
                      <div key={idx} className="relative rounded-xl border border-gray-800 overflow-hidden bg-gray-950/80 group aspect-video">
                        <img src={img} alt={`Reference ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => removeReference(idx)}
                            className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-lg transition-transform active:scale-95 cursor-pointer"
                            title="إزالة الصورة"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[8px] text-gray-300 font-bold border border-gray-850">
                          صورة {idx + 1}
                        </div>
                      </div>
                    ))}
                    {referenceImages.length < 3 && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-xl border border-dashed border-gray-800 bg-gray-950/60 flex flex-col items-center justify-center group hover:bg-gray-900 hover:border-amber-500/50 transition-all aspect-video cursor-pointer"
                      >
                        <Plus size={16} className="text-gray-500 group-hover:text-amber-500" />
                        <span className="text-[9px] text-gray-500 group-hover:text-amber-500 font-bold mt-1">إضافة صورة</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                multiple
                className="hidden"
              />
            </div>

            {/* Micro Parameter Row selectors */}
            <div className="bg-gray-950/60 p-4 border border-gray-850 rounded-2xl space-y-4">
              
              {/* Aspect Ratio Selector Dropdown */}
              <div className="flex items-center justify-between relative">
                <div className="flex items-center gap-1.5 text-gray-300">
                  <Sliders size={14} className="text-amber-500 animate-pulse" />
                  <span className="text-xs font-bold">نسبة العرض (Ratio):</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-amber-500 bg-amber-400/5 px-2.5 py-1 rounded-lg border border-amber-500/20">
                    {aspectRatioLabels[aspectRatio]}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRatioDropdown(!showRatioDropdown);
                      setShowCountDropdown(false);
                      setShowShotTypeDropdown(false);
                    }}
                    className="px-2.5 py-1.5 text-[11px] font-bold bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg text-gray-300 hover:text-white transition-all cursor-pointer"
                  >
                    تغيير ▾
                  </button>
                </div>
                {/* Overlay Dropdown */}
                {showRatioDropdown && (
                  <div className="absolute left-0 top-10 z-50 bg-gray-950 border border-gray-800 rounded-xl shadow-2xl w-44 overflow-hidden p-1 text-right animate-in fade-in duration-200">
                    {Object.entries(aspectRatioLabels).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setAspectRatio(value);
                          setShowRatioDropdown(false);
                        }}
                        className={`w-full text-right px-3 py-2 text-xs font-semibold rounded-lg transition-colors block ${
                          aspectRatio === value ? 'bg-amber-500/10 text-amber-400' : 'text-gray-300 hover:bg-gray-900 hover:text-amber-500'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Image Count Dropdown */}
              <div className="flex items-center justify-between relative pt-3 border-t border-gray-900">
                <div className="flex items-center gap-1.5 text-gray-300">
                  <Layers size={14} className="text-amber-500 animate-pulse" />
                  <span className="text-xs font-bold">عدد الصور (Count):</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-amber-500 bg-amber-400/5 px-2.5 py-1 rounded-lg border border-amber-500/20">
                    {imageCountLabels[imageCount]}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCountDropdown(!showCountDropdown);
                      setShowRatioDropdown(false);
                      setShowShotTypeDropdown(false);
                    }}
                    className="px-2.5 py-1.5 text-[11px] font-bold bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg text-gray-300 hover:text-white transition-all cursor-pointer"
                  >
                    تغيير ▾
                  </button>
                </div>
                {showCountDropdown && (
                  <div className="absolute left-0 top-10 z-50 bg-gray-950 border border-gray-800 rounded-xl shadow-2xl w-44 overflow-hidden p-1 text-right animate-in fade-in duration-200">
                    {Object.entries(imageCountLabels).map(([value, label]) => {
                      const numVal = Number(value);
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setImageCount(numVal);
                            setShowCountDropdown(false);
                          }}
                          className={`w-full text-right px-3 py-2 text-xs font-semibold rounded-lg transition-colors block ${
                            imageCount === numVal ? 'bg-amber-500/10 text-amber-400' : 'text-gray-300 hover:bg-gray-900 hover:text-amber-500'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Shot Type Dropdown */}
              <div className="flex items-center justify-between relative pt-3 border-t border-gray-900">
                <div className="flex items-center gap-1.5 text-gray-300">
                  <Camera size={14} className="text-amber-500 animate-pulse" />
                  <span className="text-xs font-bold">زاوية أو نوع اللقطة:</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-amber-400 bg-amber-400/5 px-2.5 py-1 rounded-lg border border-amber-500/20 max-w-[110px] truncate" title={selectedShotType}>
                    {selectedShotType}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowShotTypeDropdown(!showShotTypeDropdown);
                      setShowRatioDropdown(false);
                      setShowCountDropdown(false);
                    }}
                    className="px-2.5 py-1.5 text-[11px] font-bold bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg text-gray-300 hover:text-white transition-all cursor-pointer"
                  >
                    تغيير ▾
                  </button>
                </div>
                {showShotTypeDropdown && (
                  <div className="absolute left-0 top-10 z-50 bg-gray-950 border border-gray-800 rounded-xl shadow-2xl w-56 max-h-56 overflow-y-auto p-1 text-right divide-y divide-gray-900 animate-in fade-in duration-200 scrollbar-thin scrollbar-thumb-gray-850">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedShotType("تلقائي / نمط افتراضي");
                        setShowShotTypeDropdown(false);
                      }}
                      className="w-full text-right px-3 py-2 text-xs font-bold text-amber-400 hover:bg-gray-900 transition-colors rounded-lg"
                    >
                      ✨ تلقائي / نمط افتراضي
                    </button>
                    {Object.keys(SHOT_TYPES_MAP).map((shotName) => (
                      <button
                        key={shotName}
                        type="button"
                        onClick={() => {
                          setSelectedShotType(shotName);
                          setShowShotTypeDropdown(false);
                        }}
                        className={`w-full text-right px-3 py-2 text-xs font-semibold rounded-lg transition-colors block ${
                          selectedShotType === shotName ? 'bg-amber-500/10 text-amber-400' : 'text-gray-300 hover:bg-gray-900 hover:text-amber-500'
                        }`}
                      >
                        {shotName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Model Info */}
            <div className="bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-2xl text-right">
              <p className="text-xs font-bold text-amber-400 mb-1">🎯 Google Gemini 2.5 Flash Image</p>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                يدعم الحفاظ التام (100%) على ملامح العناصر الشخصية والمنتجات وإعادة دمجها بذكاء فائق في الخلفيات الجديدة.
              </p>
            </div>
          </div>

          {/* Left Panel: Prompt Details & Generation */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <label className="block text-sm font-extrabold text-gray-300 text-right">
                2. صياغة البرومبت الإبداعي (Creative Prompt)
              </label>
              
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="أدخل برومبت تخيلي مذهل... مثال: شخصية تلعب الشطرنج بثقة تامة وسط حطام سفينة قديمة تحت المحيط..."
                className="w-full h-40 bg-gray-950 border border-gray-800 text-white rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all resize-none placeholder:text-gray-600 leading-relaxed text-right"
              />

              {/* Sample Helpers on 2 columns as requested */}
              <div>
                <span className="text-[11px] font-bold text-gray-400 block mb-2 text-right">أفكار سريعة ومقترحة لتجربتها والدمج مع لقطاتك:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1 text-right" dir="rtl">
                  {samplePrompts.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPromptText(p)}
                      className="text-[10px] bg-gray-950/60 hover:bg-gray-900 border border-gray-850 px-3 py-2 rounded-xl text-gray-400 hover:text-white font-semibold transition-all text-right truncate"
                      title={p}
                    >
                      💡 {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit Control */}
            <div className="pt-4 border-t border-gray-850 space-y-4">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || referenceImages.length === 0 || !promptText.trim()}
                className={`w-full py-4 rounded-2xl font-black text-sm tracking-wide text-white transition-all flex items-center justify-center gap-3 shadow-lg cursor-pointer ${
                  isGenerating || referenceImages.length === 0 || !promptText.trim()
                    ? 'bg-gray-900 border border-gray-850 text-gray-600 cursor-not-allowed'
                    : 'bg-gradient-to-l from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 hover:shadow-amber-500/15 active:scale-[0.99]'
                }`}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>جاري تفعيل معالجة الصور بالتوازي بـ Gemini...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>توليد {imageCount} {imageCount === 1 ? 'لقطة فنية' : imageCount === 2 ? 'لقطتين' : 'لقطات'} بالتوازي ✨</span>
                  </>
                )}
              </button>

              {/* Context status warning */}
              {referenceImages.length === 0 && (
                <div className="flex items-center gap-2 text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-xl text-right justify-start">
                  <AlertCircle size={14} className="shrink-0 text-amber-500" />
                  <span>برجاء رفع صورة مرجعية واحدة على الأقل باليمين لتفعيل التوليد بالكامل.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Results Panel */}
        {Object.keys(images).length > 0 && (
          <div className="mt-12 pt-8 border-t border-gray-850">
            <FourImageGrid 
              images={images} 
              onUpdateImage={handleUpdateImage} 
              onRegenerateImage={handleRegenerateImage} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
