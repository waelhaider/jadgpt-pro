import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, Trash2, Key, Play, Sparkles, Image as ImageIcon, Copy, Check, Download, Info, Eye, EyeOff } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { auth } from '../lib/firebase';
import { getCurrentUser, getAccessToken } from '../lib/auth';
import { safeStorage } from '../lib/safe-storage';

interface PromptTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPrompt: string;
}

const STYLE_PRESETS = [
  { id: 'realistic', name: 'واقعي وسينمائي (Realistic Cinematic)', suffix: 'Realistic, cinematic lighting, 8k resolution, highly detailed, photorealistic photoportrait.' },
  { id: '3d-cartoon', name: 'شخصية كرتونية 3D (Pixar/Disney Style)', suffix: '3D animated character, Pixar style, cute, vibrant, whimsical lighting, raytraced.' },
  { id: 'oil-painting', name: 'لوحة زيتية كلاسيكية (Classic Oil Painting)', suffix: 'Masterpiece oil painting style, visible brush strokes, rich warm lighting, classical artistic texture.' },
  { id: 'cyberpunk', name: 'سايبر بانك مستقبلي (Cyberpunk Sci-Fi)', suffix: 'Cyberpunk style, glowing neon lights, futuristic high-tech streets, vibrant purple and cyan accents.' },
  { id: 'superhero', name: 'بطل خارق خيالي (Epic Superhero)', suffix: 'Epic superhero suit, heroic pose, dramatic volumetric lighting, cinematic background action.' },
  { id: 'anime', name: 'رسم أنمي ياباني (Studio Ghibli/Anime)', suffix: 'Anime style, hand-drawn aesthetic, beautiful watercolor accents, whimsical atmosphere.' },
];

export default function PromptTesterModal({ isOpen, onClose, defaultPrompt }: PromptTesterModalProps) {
  const [prompt, setPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [showKeyVisible, setShowKeyVisible] = useState(false);
  
  // Model & Options
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash-image');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [selectedStyle, setSelectedStyle] = useState('realistic');
  
  // Image Upload State
  const [userImages, setUserImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Generation & Success States
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const currentUser = getCurrentUser();
  const hasGToken = !!getAccessToken();

  const loadingMessages = [
    'جاري قراءة وتحليل ملامح الوجه المرسلة...',
    'جاري تحضير وتهيئة البرومبت المدمج...',
    'جاري التواصل مع سيرفرات جوجل الذكية وحساب كوتا التوليد الخاص بك...',
    'جاري رسم وتوليد الخلفية والبيئة التفاعلية...',
    'نقوم بدمج ملامح وجهك بشكل طبيعي ومنسق...',
    'وضع الرتوش النهائية وموازنة الألوان والظلال...'
  ];

  // Sync default prompt
  useEffect(() => {
    if (defaultPrompt) {
      setPrompt(defaultPrompt);
    }
  }, [defaultPrompt, isOpen]);

  // Load API Key from safeStorage on open
  useEffect(() => {
    const savedKey = safeStorage.getItem('user_gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setShowKeyInput(false);
    } else {
      setShowKeyInput(true);
    }
  }, [isOpen]);

  // Handle dynamic status messages
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % loadingMessages.length);
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  if (!isOpen) return null;

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      alert('يرجى إدخال مفتاح صالح أولاً!');
      return;
    }
    safeStorage.setItem('user_gemini_api_key', apiKey.trim());
    setShowKeyInput(false);
    alert('تم حفظ مفتاح الـ API بنجاح في متصفحك! 🔒');
  };

  const handleDeleteKey = () => {
    if (confirm('هل أنت متأكد من حذف مفتاح الـ API الخاص بك من المتصفح؟')) {
      safeStorage.removeItem('user_gemini_api_key');
      setApiKey('');
      setShowKeyInput(true);
    }
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<{ data: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const resultString = reader.result as string;
        const commaIndex = resultString.indexOf(',');
        const data = resultString.substring(commaIndex + 1);
        const mimeType = file.type;
        resolve({ data, mimeType });
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Handle Image Uploads
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    addFiles(files);
  };

  const addFiles = (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (userImages.length + imageFiles.length > 3) {
      alert('الحد الأقصى للرفع هو 3 صور شخصية للحفاظ على ملامحك.');
      return;
    }

    const nextImages = [...userImages];
    const nextPreviews = [...imagePreviews];

    imageFiles.forEach(file => {
      nextImages.push(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        nextPreviews.push(reader.result as string);
        setImagePreviews([...nextPreviews]);
      };
      reader.readAsDataURL(file);
    });

    setUserImages(nextImages);
  };

  const removeImage = (index: number) => {
    setUserImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Generate Image Handler
  const handleGenerate = async () => {
    const storedKey = safeStorage.getItem('user_gemini_api_key');
    const currentUser = getCurrentUser();

    if (!storedKey && !currentUser) {
      alert('يرجى تسجيل الدخول بحسابك أولاً للاستفادة فوراً من حصة التوليد المجانية للموقع، أو قم بإضافة وحفظ مفتاح الـ API الشخصي الخاص بك من لوحة التحكم بالأسفل للمتابعة.');
      setShowKeyInput(true);
      return;
    }

    if (!prompt.trim()) {
      alert('يرجى كتابة أو لصق وصف فكرتك (البرومبت) أولاً!');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    setGeneratedImageUrl(null);

    try {
      // 1. Prepare visual parts (reference base64 photos)
      const imageParts = [];
      for (const file of userImages) {
        const base64Data = await fileToBase64(file);
        imageParts.push({
          inlineData: {
            data: base64Data.data,
            mimeType: base64Data.mimeType,
          }
        });
      }

      if (storedKey) {
        // Option A: Use direct client-side client using user's personal api key
        const ai = new GoogleGenAI({
          apiKey: storedKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        // Compose style instruction and text prompt
        const styleObj = STYLE_PRESETS.find(s => s.id === selectedStyle);
        const styleInstructions = styleObj ? styleObj.suffix : '';

        let compositePrompt = prompt;
        if (imageParts.length > 0) {
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

        // Run the model generation
        const response = await ai.models.generateContent({
          model: selectedModel,
          contents: {
            parts: [
              ...imageParts,
              { text: compositePrompt }
            ]
          },
          config: {
            imageConfig: {
              aspectRatio: aspectRatio as any,
              imageSize: "1K"
            }
          }
        });

        // Read response particles to extract image element
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
          setGeneratedImageUrl(foundImg);
        } else if (foundText) {
          // If the model responded with text instead of an image, it usually indicates a quota/block announcement
          const isQuotaWarning = foundText.toLowerCase().includes('quota') || 
                                foundText.toLowerCase().includes('limit') || 
                                foundText.toLowerCase().includes('billing') ||
                                foundText.toLowerCase().includes('image');
          
          throw new Error(`النموذج استجاب بنص بدلاً من صورة: "${foundText}". ${isQuotaWarning ? '(quota/billing limit)' : ''}`);
        } else {
          // Since no image was generated and no explanation text was returned, we flag it as highly likely to be a free tier billing constraint
          throw new Error('لم يتم إرجاع أي مخرجات صور من الموديل التوليدي. تأكد من تفعيل الفوترة لرمز الـ API الخاص بك حيث تتطلب موديلات توليد الصور تفعيل الدفع (quota/billing limit).');
        }
      } else if (currentUser) {
        // Option B: Proxy image generation secure request via the custom Express backend route
        const idToken = await currentUser.getIdToken();
        const gToken = getAccessToken();
        const response = await fetch('/api/generate-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
            ...(gToken ? { 'X-Google-Access-Token': gToken } : {})
          },
          body: JSON.stringify({
            prompt,
            selectedModel,
            aspectRatio,
            selectedStyle,
            imageParts
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'فشل توليد الصورة من خادم المعالجة الرئيسي.');
        }

        if (data.imageUrl) {
          setGeneratedImageUrl(data.imageUrl);
        } else {
          throw new Error('لم يتم استلام أي رابط للصور من الخادم المعالج.');
        }
      }
    } catch (err: any) {
      console.error('Generation Error:', err);
      // Construct a polished Arabic error instruction
      const errorStr = err?.message || String(err);
      if (errorStr.includes('API_KEY_INVALID') || errorStr.includes('invalid API key')) {
        setErrorMessage('رمز الـ API المدخل غير صحيح أو غير مفعل. الرجاء مراجعته أو إصدار رمز جديد.');
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
        setErrorMessage(
          '⚠️ قيد من Google AI Studio: جميع موديلات توليد وتعديل الصور تتطلب تفعيل الفوترة لـ API Key الخاص بك (Pay-as-you-go). المفاتيح المجانية العادية مخصصة للنصوص فقط، وعند استخدامها مع الصور تفشل فوراً وتُظهر خطأ نقاد الكوتا هذا حتى لو كان الحساب أو الإيميل جديداً تماماً. يرجى تفعيل الدفع/الفوترة في لوحة حسابك لتفعيل توليد الصور.'
        );
      } else {
        setErrorMessage(`فشل توليد التحفة الفنية: ${errorStr}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper copy url/base64
  const handleCopyUrl = async () => {
    if (!generatedImageUrl) return;
    try {
      await navigator.clipboard.writeText(generatedImageUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.error(err);
    }
  };

  // Helper local download file
  const handleDownload = () => {
    if (!generatedImageUrl) return;
    const link = document.createElement('a');
    link.href = generatedImageUrl;
    link.download = `jadgpt-ai-designer-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-neutral-900/60 backdrop-blur-md"
        />

        {/* Modal Main Body */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative bg-white border border-natural-border rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
          dir="rtl"
        >
          {/* Header */}
          <div className="px-6 py-4 bg-natural-bg/50 border-b border-natural-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="text-natural-primary animate-bounce" size={20} />
              <h3 className="text-base font-black text-natural-text">
                مطور البرومبت الذكي ودمج الملامح (AI Sandbox)
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* API Key management */}
            <div className="bg-neutral-50 border border-natural-border/60 rounded-2xl p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Key className="text-natural-primary" size={18} />
                  <div>
                    <span className="text-xs font-bold text-natural-text block">استهلاك حصتك الشخصية لـ Gemini API</span>
                    <span className="text-[10px] text-natural-muted">
                      {apiKey ? 'المفتاح مخزن محلياً وآمن تماماً في جهازك.' : 'تحتاج لإدخال مفتاحك المجاني للاستهلاك دون تكاليف.'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {apiKey && (
                    <button
                      type="button"
                      onClick={handleDeleteKey}
                      className="text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg px-3 py-1.5 transition-colors border border-red-200/50"
                    >
                      حذف المفتاح المحفوظ
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowKeyInput(!showKeyInput)}
                    className="text-[11px] font-bold text-natural-primary bg-natural-primary/5 hover:bg-natural-primary/10 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    {showKeyInput ? 'إخفاء لوحة الإدخال' : 'تعديل/إضافة المفتاح'}
                  </button>
                </div>
              </div>

              {/* Collapsible Form */}
              <AnimatePresence>
                {showKeyInput && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={handleSaveKey}
                    className="mt-4 border-t border-natural-border/60 pt-4 space-y-3"
                  >
                    <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                      <div className="relative flex-1 w-full">
                        <input
                          type={showKeyVisible ? "text" : "password"}
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="ألصق AI Studio API Key هنا (AIzaSy...)"
                          className="w-full text-xs rounded-xl border border-natural-border px-3 py-2.5 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKeyVisible(!showKeyVisible)}
                          className="absolute inset-y-0 left-3 flex items-center text-neutral-400 hover:text-neutral-600"
                        >
                          {showKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button
                        type="submit"
                        className="bg-natural-primary text-white text-xs font-bold rounded-xl px-4 py-2.5 hover:bg-[#4A4A35] transition-all shrink-0 w-full sm:w-auto"
                      >
                        حفظ في المتصفح
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-start gap-1.5 text-[10px] text-natural-muted bg-white border border-natural-border p-2.5 rounded-xl">
                        <Info size={12} className="text-natural-primary shrink-0 mt-0.5" />
                        <p>
                          مفتاحك الشخصي يُحفّظ محلياً بالكامل (localStorage) ولا يُرسل لأي خادم وسيط. الطلبات تتوجه مباشرة من متصفحك لخوادم Google Gemini الرسمية. للحصول على مفتاح، اذهب إلى 
                          <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-natural-primary hover:underline font-bold mx-1">
                            Google AI Studio
                          </a>
                          واضغط على &quot;Get API Key&quot;.
                        </p>
                      </div>

                      <div className="bg-amber-50/50 border border-amber-200/60 p-3 rounded-xl text-[11px] text-[#7A6432] space-y-1">
                        <span className="font-black block">💡 تنبيه هام بخصوص توليد الصور (Image Generation):</span>
                        <p className="leading-relaxed">
                          شركة جوجل تمنع استخدام موديلات توليد وتعديل الصور (مثل <span className="font-bold">Gemini Image</span>) على حسابات الـ API المجانية العادية. عند استخدام مفتاح مجاني لتوليد صور، يظهر لك خطأ <span className="font-bold">&quot;Quota Exceeded/تجاوز ليميت الاستخدام&quot;</span> تلقائياً منذ المحاولة الأولى حتى لو أنشأت حساباً أو مفتاحاً جديداً.
                        </p>
                        <p className="font-bold leading-normal">
                          حل المشكلة: لتشغيل توليد الصور برمزك الشخصي، يرجى ترقية حسابك في لوحة تحكم Google AI Studio إلى شريحة التدفق المرن (Pay-as-you-go) وربط بطاقة الدفع (فوترة مفعّلة).
                        </p>
                      </div>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            {/* Quota & Authentication Status banner */}
            {currentUser && (
              <div className="bg-emerald-50/70 border border-emerald-100 p-3.5 rounded-xl flex items-center justify-between text-xs text-emerald-800 shadow-sm animate-fade-in gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="font-bold text-[#4A4A35] leading-relaxed">
                    أنت متصل بحساب: <span className="font-black text-emerald-900">{currentUser.email}</span>
                    {hasGToken ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold inline-block mr-2 select-none">
                        مفعل بحصتها من Google Quota ✅
                      </span>
                    ) : (
                      <span className="text-[10px] bg-amber-100 text-[#7A6432] px-2 py-0.5 rounded-full font-bold inline-block mr-2 select-none font-sans">
                        تسجيل محلي (ايميل) ✉️
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-[10px] text-emerald-700 font-bold leading-none">
                  {hasGToken 
                    ? 'نظام كوتا جيميني: تتوجه طلبات توليد الصور مباشرة بحسابك لتفادي أي قيود على السيرفر.' 
                    : 'سجل دخولك بجوجل لتفعيل نظام كوتا حسابك مباشرة!'
                  }
                </div>
              </div>
            )}

            {currentUser && !hasGToken && (
              <div className="bg-amber-50/50 border border-amber-200/60 p-3.5 rounded-xl text-xs space-y-1">
                <p className="font-black text-[#7A6432]">💡 تبديل سهل لتخطي قيود كوتا الصور:</p>
                <p className="leading-relaxed text-[#8A7442]">
                  بما أنك مسجيل حالياً عبر الإيميل فقط، نوصيك بـ 
                  <strong className="mx-1 text-natural-primary">تسجيل الخروج والاتصال باستخدام زر حساب Google</strong> 
                  حتى يتم ربط كوتا حسابك الخاص بالتوليد مباشرة دون أي قيود، تماماً مثل نظام كوتا موقع Gemini الرسمي!
                </p>
              </div>
            )}

            {/* Split view: Inputs Left, Studio Output Right on desktop */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* Left Form controls: 7 columns */}
              <div className="md:col-span-7 space-y-5">
                
                {/* Prompt Description text */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-[#4A4A35] block">وصف المشهد الفني (البرومبت)</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="اكتب فكرتك بالتفصيل، مثال: رائد فضاء يجلس في مقهى عربي تقليدي يحتسي قهوة..."
                    rows={4}
                    className="w-full text-sm leading-relaxed p-3.5 rounded-xl border border-natural-border focus:outline-none focus:ring-1 focus:ring-natural-primary bg-neutral-50/50 resize-none"
                  />
                </div>

                {/* Photo Identity Area */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-[#4A4A35]">
                      صورك الشخصية لدمج الملامح (الوجه) <span className="text-[10px] font-normal text-natural-muted">(اختياري - حتى 3 صور لتثبيت وجهك)</span>
                    </label>
                    {userImages.length > 0 && (
                      <button
                        onClick={() => { setUserImages([]); setImagePreviews([]); }}
                        className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-0.5"
                      >
                        <Trash2 size={10} /> تفريغ القائمة
                      </button>
                    )}
                  </div>

                  {/* Drag drop zone or uploads preview list */}
                  <div className="grid grid-cols-3 gap-2">
                    {/* Visual Preview items */}
                    {imagePreviews.map((preview, idx) => (
                      <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-natural-border bg-neutral-50 group shadow-sm transition-transform hover:scale-[1.02]">
                        <img src={preview} alt="Reference face preview" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition-colors shadow-md"
                        >
                          <X size={10} />
                        </button>
                        <div className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5 text-center text-[7px] text-white font-black uppercase">
                          صورة {idx + 1}
                        </div>
                      </div>
                    ))}

                    {/* Placeholder click to upload */}
                    {userImages.length < 3 && (
                      <div
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`col-span-${3 - userImages.length} flex flex-col items-center justify-center aspect-auto min-h-[90px] rounded-xl border-2 border-dashed transition-all cursor-pointer text-center px-4 ${
                          dragActive
                            ? 'border-natural-primary bg-natural-primary/5 text-natural-primary'
                            : 'border-natural-border hover:border-natural-primary hover:bg-neutral-50 text-neutral-400'
                        }`}
                      >
                        <Upload size={20} className="mb-1 text-natural-primary animate-pulse" />
                        <span className="text-[10px] font-black text-[#4A4A35]">
                          {dragActive ? 'أفلت الصور هنا' : 'اضغط لرفع صورك الشخصية'}
                        </span>
                        <span className="text-[8px] text-natural-muted hidden sm:inline">أو اسحبها وأفلتها هنا مباشرة</span>
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

                {/* Design choices details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  
                  {/* Style Presets */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-[#4A4A35] block">النمط الفني للصورة (Style)</label>
                    <select
                      value={selectedStyle}
                      onChange={(e) => setSelectedStyle(e.target.value)}
                      className="w-full text-xs rounded-xl border border-natural-border px-3 py-2 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary shadow-sm cursor-pointer"
                    >
                      {STYLE_PRESETS.map((style) => (
                        <option key={style.id} value={style.id}>{style.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Dimensions aspect ratio */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-[#4A4A35] block">نسبة أبعاد الصورة (Ratio)</label>
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      className="w-full text-xs rounded-xl border border-natural-border px-3 py-2 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary shadow-sm cursor-pointer"
                    >
                      <option value="1:1">مربع 1:1 (إنستغرام)</option>
                      <option value="16:9">شاشة عريضة 16:9 (يوتيوب/سينمائي)</option>
                      <option value="9:16">طولي 9:16 (ستوري/تيك توك)</option>
                      <option value="4:3">تقليدي 4:3 (أفقي)</option>
                    </select>
                  </div>
                </div>

                {/* Model Select */}
                <div className="p-3 bg-natural-primary/5 rounded-2xl border border-natural-primary/10 flex items-center justify-between flex-wrap gap-2">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-black text-[#4A4A35] block">النموذج الذكي المستخدم (Model)</span>
                    <span className="text-[9px] text-natural-muted block">نقترح استخدام Gemini 3.1 للجودة المثالية للملامح.</span>
                  </div>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="text-xs rounded-lg border border-natural-border px-3 py-1.5 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary cursor-pointer max-w-[200px]"
                  >
                    <option value="gemini-3.1-flash-image">Gemini 3.1 Flash Image (الجودة الأعلى)</option>
                    <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image (أسرع توليد)</option>
                  </select>
                </div>

                {/* Launch Button */}
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full bg-natural-primary text-white text-sm font-black p-4 rounded-2xl shadow-lg hover:bg-[#3d3d2a] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>جاري الابتكار وصقل الصورة...</span>
                    </>
                  ) : (
                    <>
                      <Play size={16} fill="white" />
                      <span>ابدأ التوليد والدمج الفوري</span>
                    </>
                  )}
                </button>

              </div>

              {/* Right Output: 5 columns */}
              <div className="md:col-span-5 flex flex-col justify-between border-t md:border-t-0 md:border-r border-natural-border md:pr-6 pt-5 md:pt-0 max-h-full">
                <div className="space-y-3 flex-1 flex flex-col justify-center min-h-[300px]">
                  
                  {/* Visual Screen Box */}
                  <div className="relative border-2 border-dashed border-natural-border bg-neutral-50 rounded-2xl flex-1 flex flex-col items-center justify-center overflow-hidden min-h-[280px] p-4 shadow-inner">
                    
                    {/* Error block */}
                    {errorMessage && (
                      <div className="text-center p-4 max-w-xs space-y-2">
                        <div className="h-10 w-10 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-sm border border-red-200">
                          <Info size={18} />
                        </div>
                        <h4 className="text-xs font-bold text-red-600">حدث خطأ أثناء الاتصال</h4>
                        <p className="text-[10px] text-neutral-500 leading-relaxed">{errorMessage}</p>
                      </div>
                    )}

                    {/* Progress States */}
                    {isGenerating && (
                      <div className="text-center p-6 space-y-4 animate-pulse">
                        <div className="flex justify-center gap-1.5 items-center">
                          <div className="h-2 w-2 rounded-full bg-natural-primary animate-bounce [animation-delay:-0.3s]" />
                          <div className="h-2 w-2 rounded-full bg-natural-primary animate-bounce [animation-delay:-0.15s]" />
                          <div className="h-2 w-2 rounded-full bg-natural-primary animate-bounce" />
                        </div>
                        <p className="text-xs font-bold text-[#4A4A35] max-w-xs leading-relaxed">
                          {loadingMessages[loadingStep]}
                        </p>
                        <span className="text-[9px] text-natural-muted block">قد يستغرق توليد الملامح الرائعة بضع ثوانٍ...</span>
                      </div>
                    )}

                    {/* Default State */}
                    {!isGenerating && !generatedImageUrl && !errorMessage && (
                      <div className="text-center p-6 text-neutral-400 space-y-2">
                        <div className="h-12 w-12 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-md text-natural-primary/60 border border-natural-border/40">
                          <ImageIcon size={22} />
                        </div>
                        <h4 className="text-xs font-bold text-[#4A4A35]">ستظهر تحفتك الفنية هنا</h4>
                        <p className="text-[10px] text-neutral-400 max-w-xs leading-normal">حدد خياراتك الفنية، ثم اضغط على زر التوليد بالأسفل لتلقي النتيجة الفورية.</p>
                      </div>
                    )}

                    {/* Output Image display */}
                    {!isGenerating && generatedImageUrl && (
                      <div className="w-full h-full flex items-center justify-center group/panel">
                        <img
                          src={generatedImageUrl}
                          alt="AI Generated Portrait"
                          className="max-h-[320px] w-auto max-w-full rounded-xl shadow-md object-contain border border-natural-border transition-transform group-hover/panel:scale-[1.01]"
                        />

                        {/* Floater Badge */}
                        <div className="absolute top-2 left-2 bg-black/70 text-white rounded-lg px-2 py-0.5 text-[8px] font-black tracking-wider uppercase z-10">
                          مكتمل بنجاح
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Actions under image result */}
                  {generatedImageUrl && !isGenerating && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        type="button"
                        onClick={handleCopyUrl}
                        className="flex items-center justify-center gap-1.5 bg-neutral-100 hover:bg-neutral-200 text-[#4A4A35] border border-natural-border font-bold text-xs p-2.5 rounded-xl transition-all"
                      >
                        {isCopied ? (
                          <>
                            <Check size={14} className="text-green-600" />
                            <span className="text-green-600">تم النسخ!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            <span>نسخ كود الصورة</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleDownload}
                        className="flex items-center justify-center gap-1.5 bg-natural-primary hover:bg-[#3d3d2a] text-white font-bold text-xs p-2.5 rounded-xl transition-all"
                      >
                        <Download size={14} />
                        <span>تحميل الصورة</span>
                      </button>
                    </div>
                  )}

                </div>
              </div>

            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
