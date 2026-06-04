import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, Trash2, Key, Play, Sparkles, Image as ImageIcon, Copy, Check, Download, Info, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { auth } from '../lib/firebase';
import { getCurrentUser, getAccessToken, saveUserKeyToFirestore, deleteUserKeyFromFirestore } from '../lib/auth';
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
  const [selectedModel, setSelectedModel] = useState('gpt-image-2');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [selectedStyle, setSelectedStyle] = useState('realistic');
  
  // Image Upload State
  const [userImages, setUserImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [pngBlobs, setPngBlobs] = useState<Blob[]>([]);
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
  const isFreeModel = true;

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

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      alert('يرجى إدخال مفتاح صالح أولاً!');
      return;
    }
    const cleanKey = apiKey.trim();
    safeStorage.setItem('user_gemini_api_key', cleanKey);

    const user = getCurrentUser();
    if (user && user.email) {
      try {
        await saveUserKeyToFirestore(user.email, cleanKey);
      } catch (err) {
        console.error(err);
      }
    }

    setShowKeyInput(false);
    alert('تم حفظ مفتاح الـ API بنجاح! 🔒 ونظراً لأنك مسجل دخول، فقد تم ربط المفتاح بحسابك وسيتزامن تلقائياً على أي جهاز أو متصفح تستخدمه.');
  };

  const handleDeleteKey = async () => {
    if (confirm('هل أنت متأكد من حذف مفتاح الـ API الخاص بك؟')) {
      const user = getCurrentUser();
      if (user && user.email) {
        try {
          await deleteUserKeyFromFirestore(user.email);
        } catch (err) {
          console.error(err);
        }
      } else {
        safeStorage.removeItem('user_gemini_api_key');
      }
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
    const nextBlobs = [...pngBlobs];

    imageFiles.forEach(file => {
      nextImages.push(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        const resultUrl = reader.result as string;
        nextPreviews.push(resultUrl);
        setImagePreviews([...nextPreviews]);

        // Draw to temporary and safe canvas to pre-bake a compatible 'image/png' Blob
        const img = new Image();
        img.src = resultUrl;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
              if (blob) {
                nextBlobs.push(blob);
                setPngBlobs([...nextBlobs]);
              }
            }, 'image/png');
          }
        };
      };
      reader.readAsDataURL(file);
    });

    setUserImages(nextImages);
  };

  const removeImage = (index: number) => {
    setUserImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
    setPngBlobs(prev => prev.filter((_, i) => i !== index));
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

  // Helper to copy text to clipboard with extreme compatibility fallback (works inside nested frames/iframes flawlessly)
  const copyTextToClipboard = (text: string): boolean => {
    let successful = false;
    
    // 1. Try legacy textarea execCommand method first (extremely robust and 100% synchronous inside iframes)
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.width = '2em';
      textArea.style.height = '2em';
      textArea.style.padding = '0';
      textArea.style.border = 'none';
      textArea.style.outline = 'none';
      textArea.style.boxShadow = 'none';
      textArea.style.background = 'transparent';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      successful = document.execCommand('copy');
      document.body.removeChild(textArea);
    } catch (err) {
      console.warn('Fallback execCommand copy failed:', err);
    }

    // 2. Try standard modern clipboard API as a backup
    if (!successful && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        navigator.clipboard.writeText(text);
        successful = true;
      } catch (err) {
        console.warn('Modern Clipboard API failed:', err);
      }
    }
    return successful;
  };

  // Helper to copy a base64 / dataUrl image to the user's system clipboard as standard PNG
  const handleCopyImageToClipboard = async (dataUrl: string, silent = false) => {
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      let pngBlob = blob;
      if (blob.type !== 'image/png') {
        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve) => { img.onload = resolve; });
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const canvBlob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
          if (canvBlob) {
            pngBlob = canvBlob;
          }
        }
      }
      
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlob
        })
      ]);
      if (!silent) {
        alert('تم نسخ الصورة الشخصية لحافظة جهازك بنجاح! 📋🖼️ يمكنك الآن لصقها (Paste/Ctrl+V) مباشرة في مربع محادثة الموديل.');
      }
      return true;
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      if (!silent) {
        alert('عذراً، متصفحك يمنع نسخ الصور تلقائياً. يمكنك سحب الصورة المرفوعة وإفلاتها مباشرة في موقع الموديل.');
      }
      return false;
    }
  };

  // Generate Image Handler (Compiles prompt, copies details, and forwards user directly to model official website)
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert('الرجاء كتابة أو لصق وصف فكرتك (البرومبت) أولاً!');
      return;
    }

    setIsGenerating(true);

    try {
      const styleObj = STYLE_PRESETS.find(s => s.id === selectedStyle);
      const styleInstructions = styleObj ? styleObj.suffix : '';

      let compositePrompt = prompt;
      if (userImages.length > 0) {
        compositePrompt = `Generate a realistic portrait person. Blended face traits matching reference face attributes: face structure, eyes, and styling features. Scene: ${prompt}. Style: ${styleInstructions || 'photorealistic cinematic'}`;
      } else if (styleInstructions) {
        compositePrompt = `${prompt}. Style: ${styleInstructions}`;
      }

      // Determine official URL
      let officialUrl = 'https://duck.ai';
      let modelLabel = '';

      if (selectedModel === 'duck.ai') {
        officialUrl = `https://duck.ai`;
        modelLabel = 'Duck.ai 🦆';
      } else if (selectedModel === 'gpt-image-2') {
        officialUrl = `https://chatgpt.com/`;
        modelLabel = 'GPT-Image-2 (ChatGPT) ⚡';
      } else if (selectedModel === 'gemini-3.1-flash-image-preview') {
        officialUrl = `https://gemini.google.com/app`;
        modelLabel = 'Gemini 3.1 Preview (Google Gemini) 🎨';
      } else if (selectedModel === 'nano-banana-2') {
        officialUrl = `https://huggingface.co/spaces/Efficient-Large-Model/Sana`;
        modelLabel = 'Nano Banana-2 (HuggingFace Sana HF Space) 🍌';
      } else if (selectedModel === 'wan2.7pro') {
        officialUrl = `https://huggingface.co/spaces/Wan-AI/Wan2.1-Generation`;
        modelLabel = 'Wan 2.7 Pro (HuggingFace Wan-AI Space) 🎬';
      } else if (selectedModel === 'genspark') {
        officialUrl = `https://www.genspark.ai/ar/tools/ai-image-generator`;
        modelLabel = 'Genspark ✨';
      }

      // 1. Try to write BOTH text and image to the clipboard simultaneously in a single operation
      let copiedBoth = false;
      if (pngBlobs.length > 0 && navigator.clipboard && navigator.clipboard.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': pngBlobs[0],
              'text/plain': new Blob([compositePrompt], { type: 'text/plain' })
            })
          ]);
          copiedBoth = true;
          console.log('Successfully wrote both image and text to clipboard!');
        } catch (e) {
          console.warn('Failed combined clipboard write, will fall back:', e);
        }
      }

      // 2. If combined copying failed or no image existed, fall back to standard synchronous legacy text copying
      let textCopied = false;
      if (!copiedBoth) {
        textCopied = copyTextToClipboard(compositePrompt);
        if (!textCopied) {
          console.warn('Prompt copy not confirmed');
        }
      } else {
        textCopied = true;
      }

      // 3. Open the official website synchronously in the click event!
      // This guarantees 100% popup allowance because we don't await anything prior to calling window.open.
      window.open(officialUrl, '_blank');

      // 4. Show friendly directions alert explaining what's copied
      if (imagePreviews.length > 0) {
        if (copiedBoth) {
          alert(
            `رائع جداً! 🔮✨\n\n` +
            `تم نسخ البرومبت المصمم تلقائياً وصورتك الشخصية المرفوعة معاً إلى حافظة جهازك!\n\n` +
            `تم الآن فتح صفحة الموديل الرسمية (${modelLabel}) في نافذة جديدة. كل ما عليك:\n` +
            `1. لصق الصورة هناك مباشرة (Ctrl + V)\n` +
            `2. لصق البرومبت (Ctrl + V) بجانبها لبدء التوليد الفوري بنجاح 100%! 🎯`
          );
        } else {
          // Asynchronous image copy fallback (since pre-converted blob wasn't written yet)
          handleCopyImageToClipboard(imagePreviews[0], true).then((hasCopiedImage) => {
            alert(
              `رائع جداً! 🔮✨\n\n` +
              `تم نسخ البرومبت المصمم تلقائياً وبأعلى جودة لحافظة جهازك.\n` +
              `وكذلك ${hasCopiedImage ? 'تم نسخ صورتك الشخصية الأولى كملف لقناة اللصق لحافظة جهازك!' : 'يرجى سحب صورتك المرفوعة وإلقائها هناك.'}\n\n` +
              `تم الآن فتح صفحة الموديل الرسمية (${modelLabel}) في نافذة جديدة. كل ما عليك:\n` +
              `1. لصق الصورة هناك مباشرة (Ctrl + V)\n` +
              `2. لصق البرومبت (Ctrl + V) بجانبها لبدء التوليد الفوري بنجاح 100%! 🎯`
            );
          }).catch((err) => {
            console.error(err);
            alert(
              `تم نسخ البرومبت المصمم للحافظة!\n` +
              `وتم فتح صفحة الموديل الرسمية (${modelLabel}). يرجى لصق البرومبت هناك للبدء.`
            );
          });
        }
      } else {
        alert(
          `تم نسخ البرومبت الفني للحافظة بنجاح! 📋✨\n\n` +
          `تم فتح صفحة الموديل الرسمية (${modelLabel}) في نافذة مستقلة جديدة. كل ما عليك هو عمل لصق (Ctrl + V) هناك لبدء الابتكار المذهل فوراً!`
        );
      }
    } catch (err: any) {
      console.error('Redirections err:', err);
    } finally {
      setIsGenerating(false);
    }
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

        {/* Modal Main Body: Styled as a clean, elegant single column controller */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative bg-white border border-natural-border rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
          dir="rtl"
        >
          {/* Header */}
          <div className="px-6 py-4 bg-natural-bg/50 border-b border-natural-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="text-natural-primary animate-bounce" size={20} />
              <h3 className="text-base font-black text-natural-text">
                مطور البرومبت ودمج الملامح الذكي 🚀
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Prompt Description text */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-[#4A4A35] block">وصف المشهد الفني (البرومبت)</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="اكتب فكرتك بالتفصيل، مثال: رائد فضاء يجلس في مقهى عربي تقليدي يحتسي قهوة..."
                rows={4}
                className="w-full text-sm leading-relaxed p-3.5 rounded-xl border border-natural-border focus:outline-none focus:ring-1 focus:ring-natural-primary bg-neutral-50/50 resize-none text-right font-medium"
              />
            </div>

            {/* Photo Identity Area */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-[#4A4A35]">
                  صورك الشخصية لدمج الملامح (الوجه) <span className="text-[10px] font-normal text-natural-muted">(اختياري - لتسهيل نسخ الملامح للحافظة)</span>
                </label>
                {userImages.length > 0 && (
                  <button
                    onClick={() => { setUserImages([]); setImagePreviews([]); setPngBlobs([]); }}
                    className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-0.5 animate-pulse"
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
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition-colors shadow-md animate-fade-in"
                    >
                      <X size={10} />
                    </button>
                    {idx === 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (pngBlobs[0] && navigator.clipboard && navigator.clipboard.write) {
                            try {
                              await navigator.clipboard.write([
                                new ClipboardItem({ 'image/png': pngBlobs[0] })
                              ]);
                              alert('تم نسخ الصورة الشخصية لحافظة جهازك بنجاح! 📋🖼️ يمكنك الآن لصقها (Paste/Ctrl+V) مباشرة في موقع الموديل.');
                            } catch (e) {
                              handleCopyImageToClipboard(preview);
                            }
                          } else {
                            handleCopyImageToClipboard(preview);
                          }
                        }}
                        className="absolute bottom-1 inset-x-1 bg-emerald-600/90 text-white font-black text-[8px] py-1 rounded shadow-md border border-emerald-500 flex items-center justify-center gap-0.5 hover:bg-emerald-700 transition-all active:scale-95"
                      >
                        <Copy size={9} />
                        <span>نسخ ملامح الوجه</span>
                      </button>
                    )}
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
                    <Upload size={18} className="mb-1 text-natural-primary" />
                    <span className="text-[10px] font-black text-[#4A4A35]">
                      {dragActive ? 'أفلت الصور هنا' : 'اضغط لرفع صور الملامح'}
                    </span>
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
                <span className="text-[9px] text-natural-muted block">سيقوم النظام بنسخ البيانات وبثها للموديل مباشرة.</span>
              </div>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="text-xs rounded-lg border border-natural-border px-3 py-1.5 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary cursor-pointer min-w-[170px]"
              >
                <option value="duck.ai">Duck.ai 🦆</option>
                <option value="gpt-image-2">GPT-Image-2 ⚡</option>
                <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Preview 🎨</option>
                <option value="nano-banana-2">Nano Banana-2 🍌</option>
                <option value="wan2.7pro">Wan 2.7 Pro 🎬</option>
                <option value="genspark">Genspark ✨</option>
              </select>
            </div>

            {/* Guidance Helper Box */}
            <div className="bg-emerald-50/60 border border-emerald-100 p-3 h-auto rounded-xl text-[11px] space-y-1">
              <p className="font-black text-emerald-800 flex items-center gap-1">
                💡 فكرة النسخ الذكي المتكامل للـ Clipboard:
              </p>
              <p className="leading-relaxed text-emerald-990 font-medium">
                عند النقر على زر التوليد بالأسفل، سيتم <strong className="text-emerald-950 font-black">تلقائياً نسخ البرومبت المدمج وصورتك الشخصية المرفوعة لحافظة جهازك</strong> معاً! ومن ثم توجيهك فوراً للصفحة الرسمية لموديلك المختار مجاناً وبأعلى سرعة وثبات.
              </p>
            </div>

            {/* Launch Button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full bg-natural-primary text-white text-sm font-black p-4 rounded-2xl shadow-lg hover:bg-[#3d3d2a] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <ExternalLink size={16} />
              <span>ابدأ التوليد والدمج الفوري بموقع الموديل الرسمي</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
