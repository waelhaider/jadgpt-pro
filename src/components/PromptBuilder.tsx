import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Copy, RefreshCw, Check, ArrowRight, UserPlus, Sliders, Eye, ChevronDown, Trash2, ArrowLeftRight, Plus, ExternalLink, Globe } from 'lucide-react';
import { safeStorage } from '../lib/safe-storage';

interface CustomSelectorProps {
  label?: string;
  options: string[];
  value: string;
  onChange: (val: string) => void;
  zIndex?: number;
  labelComponent?: React.ReactNode;
}

function CustomSelector({ label, options, value, onChange, zIndex = 11, labelComponent }: CustomSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative text-right" style={{ zIndex }}>
      {labelComponent ? (
        labelComponent
      ) : label ? (
        <label className="block text-xs font-black text-natural-primary mb-1.5">
          {label}
        </label>
      ) : null}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-right rounded-xl border border-natural-border bg-natural-bg/40 px-3 py-2.5 text-xs font-bold focus:ring-1 focus:ring-natural-primary focus:outline-none transition-all hover:bg-natural-bg/60"
      >
        <span className="truncate pl-3 text-[#4A4A35] text-right flex-1 select-none">{value}</span>
        <ChevronDown size={14} className={`text-natural-muted transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop to close list when clicked outside */}
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="absolute z-50 mt-1 w-full rounded-xl border border-natural-border bg-white shadow-xl max-h-60 overflow-y-auto"
            >
              <div className="p-1">
                {options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                    }}
                    className={`w-full text-right px-3 py-2.5 text-xs font-bold rounded-lg transition-colors whitespace-normal break-words leading-relaxed block ${
                      value === opt
                        ? 'bg-natural-primary text-white'
                        : 'text-[#4A3A25] hover:bg-natural-bg/80'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PromptBuilder() {
  // Visited sites state (resets on page load)
  const [visitedSiteIds, setVisitedSiteIds] = useState<string[]>([]);
  
  // Is the "مواقع برومبت جاهزة" directory open?
  const [isSitesOpen, setIsSitesOpen] = useState(false);

  // Is the custom prompt builder options & tools container open?
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  
  // Custom states for adding new site
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [newSiteName, setNewSiteName] = useState('');

  // Prompt Sites state (hydrates from localStorage if exists)
  const [sites, setSites] = useState<{ id: string; url: string; name: string; isDefault: boolean; }[]>(() => {
    const saved = safeStorage.getItem('prompt_builder_sites');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse prompt builder sites', e);
      }
    }
    return [
      { id: '1', url: 'https://youmind.com/gpt-image-2-prompts', name: ' برومبت gpt-image-2', isDefault: true },
      { id: '2', url: 'https://youmind.com/nano-banana-pro-prompts', name: ' برومبت nanobanana-pro', isDefault: true },
      { id: '3', url: 'https://youmind.com/prompts', name: ' لاختيار الموديلات', isDefault: true },
      { id: '4', url: 'https://generateprompt.ai', name: ' يحول الصورة إلى برومبت', isDefault: true },
      { id: '5', url: 'https://www.origastock.com/ai/prompt-builder', name: ' إعدادات بشكل صور', isDefault: true },
      { id: '6', url: 'https://yesand.ai/portrait', name: ' تبويبات البورتريه', isDefault: true },
      { id: '7', url: 'https://www.promptifex.com/ar/home', name: '- برومبتيفكس العربي', isDefault: true },
      { id: '8', url: 'https://aitoolsbot.com', name: ' جميع أدوات الذكاء الاصطناعي', isDefault: true },
      { id: '9', url: 'https://songgenerator.io/ar/app', name: ' صانع موسيقى', isDefault: true },
      { id: '10', url: 'https://cinematicpromptgenerator.lovable.app/', name: ' أداة برومبتات سينمائية', isDefault: true },
      { id: '11', url: 'https://luvvoice.com/en/language/arabic', name: ' يحول النص إلى صوت عربي', isDefault: true },
      { id: '12', url: 'https://easy-peasy.ai/ai-images', name: ' مع توليد الصورة', isDefault: true },
      { id: '13', url: 'https://www.bananaprompts.xyz/explore', name: ' استكشاف برومبتات', isDefault: true },
    ];
  });

  // Sync sites with localStorage whenever updated
  useEffect(() => {
    safeStorage.setItem('prompt_builder_sites', JSON.stringify(sites));
  }, [sites]);

  // Handle changing site name inline
  const handleEditSiteName = (id: string, newName: string) => {
    setSites(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
  };

  // Handle adding custom site
  const handleAddSite = () => {
    if (!newSiteUrl.trim()) return;
    
    let formattedUrl = newSiteUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const newSite = {
      id: Date.now().toString(),
      url: formattedUrl,
      name: newSiteName.trim(),
      isDefault: false
    };

    setSites(prev => [...prev, newSite]);
    setNewSiteUrl('');
    setNewSiteName('');
  };

  // Handle deleting custom site matching URL
  const handleDeleteCustomSite_byUrl = () => {
    if (!newSiteUrl.trim()) {
      setNewSiteUrl('');
      setNewSiteName('');
      return;
    }
    
    let formattedUrl = newSiteUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    setSites(prev => prev.filter(s => s.isDefault || s.url.toLowerCase() !== formattedUrl.toLowerCase()));
    setNewSiteUrl('');
    setNewSiteName('');
  };

  // Delete directly by ID
  const handleDeleteSiteById = (id: string) => {
    setSites(prev => prev.filter(s => s.id !== id));
  };

  // Form selections states
  const [aspectRatio, setAspectRatio] = useState('حجم تلقائي');
  const [styleMode, setStyleMode] = useState('يتبع الصورة المرجعية');
  const [shotType, setShotType] = useState('يتبع الصورة المرجعية');
  const [shotAngle, setShotAngle] = useState('يتبع الصورة المرجعية');
  const [gender, setGender] = useState('رجل');
  const [age, setAge] = useState('');
  const [pose, setPose] = useState('يتبع الصورة المرجعية');
  const [outfit, setOutfit] = useState('يتبع الصورة المرجعية');
  const [expression, setExpression] = useState('يتبع الصورة المرجعية');
  const [lighting, setLighting] = useState('يتبع الصورة المرجعية');
  const [camera, setCamera] = useState('يتبع الصورة المرجعية');

  // Generated Text State
  const [isCopied, setIsCopied] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Outfit category selection (men / women) matches the active gender
  const [outfitType, setOutfitType] = useState<'men' | 'women'>('men');

  // Men outfit subcategories: 'modern' (ملابس عصرية), 'threePiece' (بدلة 3 قطع), 'formal' (بدلة رسمية)
  const [menOutfitSubCategory, setMenOutfitSubCategory] = useState<'modern' | 'threePiece' | 'formal'>('modern');

  // Women outfit subcategories: 'casual' (ملابس عصرية كاجوال), 'formal' (بليزر ورسمي أعمال), 'traditional' (فساتين ومناسبات)
  const [womenOutfitSubCategory, setWomenOutfitSubCategory] = useState<'casual' | 'formal' | 'traditional'>('casual');

  // Helper variables for gender & age - automatically append "عام" if not written
  const cleanAge = age.trim();
  const formatAge = cleanAge ? (cleanAge.includes('عام') || cleanAge.includes('سنة') ? cleanAge : `${cleanAge} عام`) : '';
  const genderAgeText = `${gender}${formatAge ? ` بعمر ${formatAge}` : ''}`;

  // Sync outfitType with chosen gender automatically
  useEffect(() => {
    if (gender === 'رجل' || gender === 'طفل') {
      setOutfitType('men');
    } else if (gender === 'امرأة' || gender === 'طفلة') {
      setOutfitType('women');
    }
  }, [gender]);

  // Sync the current outfit with the selected outfits list on switch
  useEffect(() => {
    const activeList = outfitType === 'men'
      ? (menOutfitSubCategory === 'threePiece' ? menOutfitsThreePiece : menOutfitSubCategory === 'formal' ? menOutfitsFormal : menOutfitsModern)
      : (womenOutfitSubCategory === 'formal' ? womenOutfitsFormal : womenOutfitSubCategory === 'traditional' ? womenOutfitsTraditional : womenOutfitsCasual);
    if (!activeList.includes(outfit)) {
      // Fallback to "يتبع الصورة المرجعية" which is at index 0
      setOutfit(activeList[0]);
    }
  }, [outfitType, menOutfitSubCategory, womenOutfitSubCategory]);

  // Formula generator based on user choices
  const getStructuredPrompt = () => {
    const displayShotRaw = (shotType === 'بدون نوع (يتبع البرومبت)' || shotType === 'يتبع الصورة المرجعية') ? 'صورة' : shotType;
    const displayShot = displayShotRaw.replace(/\.*$/, '').trim();
    
    const displayPoseRaw = (pose === 'بدون نوع (يتبع البرومبت)' || pose === 'يتبع الصورة المرجعية') ? 'تلقائي (نفس الصورة المرجعية)' : pose;
    const displayPose = displayPoseRaw.replace(/\.*$/, '').trim();
    
    const displayStyleRaw = (styleMode === 'بدون نوع (يتبع البرومبت)' || styleMode === 'يتبع الصورة المرجعية') ? 'تلقائي (نفس الصورة المرجعية)' : styleMode;
    const displayStyle = displayStyleRaw.replace(/\.*$/, '').trim();
    
    const displayOutfitRaw = (outfit === 'بدون نوع (يتبع البرومبت)' || outfit === 'يتبع الصورة المرجعية') ? 'تلقائي (نفس الصورة المرجعية)' : outfit;
    const displayOutfit = displayOutfitRaw.replace(/\.*$/, '').trim();
    
    const displayExpressionRaw = (expression === 'بدون نوع (يتبع البرومبت)' || expression === 'يتبع الصورة المرجعية') ? 'تلقائي (نفس الصورة المرجعية)' : expression;
    const displayExpression = displayExpressionRaw.replace(/\.*$/, '').trim();
    
    const displayLightingRaw = (lighting === 'بدون نوع (يتبع البرومبت)' || lighting === 'يتبع الصورة المرجعية') ? 'تلقائي (نفس الصورة المرجعية)' : lighting;
    const displayLighting = displayLightingRaw.replace(/\.*$/, '').trim();
    
    const displayCameraRaw = (camera === 'بدون نوع (يتبع البرومبت)' || camera === 'يتبع الصورة المرجعية') ? 'تلقائي (نفس الصورة المرجعية)' : camera;
    const displayCamera = displayCameraRaw.replace(/\.*$/, '').trim();
    
    const displayAngleRaw = (shotAngle === 'بدون نوع (يتبع البرومبت)' || shotAngle === 'يتبع الصورة المرجعية') ? 'تلقائي (نفس الصورة المرجعية)' : shotAngle;
    const displayAngle = displayAngleRaw.replace(/\.*$/, '').trim();

    let outfitPrefix = 'يرتدي الرجل';
    if (gender === 'رجل') outfitPrefix = 'يرتدي الرجل';
    else if (gender === 'امرأة') outfitPrefix = 'ترتدي المرأة';
    else if (gender === 'طفل') outfitPrefix = 'يرتدي الطفل';
    else if (gender === 'طفلة') outfitPrefix = 'ترتدي الطفلة';

    return `قم بإنشاء ${displayShot} لنفس الشخص، ${genderAgeText}، من الصور المرجعية التي تم تحميلها بدقة 100% ، مع الحفاظ على ملامح الوجه الحقيقي وتصفيفة الشعر ولون البشرة وهوية الجسم وبنية العظام بأقصى قدر من الدقة دون تغيير او تعديل.
الموضوع :${genderAgeText}
الوضعية :${displayPose}
نوع الجلسة والأجواء :${displayStyle}
زاوية التصوير :${displayAngle}
مقاس الصورة : ${aspectRatio}
${outfitPrefix} :${displayOutfit}
التعبير :${displayExpression}
الاضاءة : ${displayLighting}
الكاميرا : ${displayCamera}`;
  };

  // Controlled textarea state
  const [promptText, setPromptText] = useState('');
  const [isCleared, setIsCleared] = useState(false);

  // Translation States
  const [translatedPromptText, setTranslatedPromptText] = useState('');
  const [srcLang, setSrcLang] = useState('auto');
  const [tgtLang, setTgtLang] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  // Auto-detect direction helper: returns true if Arabic/RTL is matched
  const isRtl = (text: string): boolean => {
    if (!text) return true; // Default to natural Arabic direction
    let arabicCount = 0;
    let englishCount = 0;
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      if ((charCode >= 0x0600 && charCode <= 0x06FF) || 
          (charCode >= 0x0750 && charCode <= 0x077F) || 
          (charCode >= 0x08A0 && charCode <= 0x08FF) || 
          (charCode >= 0xFB50 && charCode <= 0xFDFF) || 
          (charCode >= 0xFE70 && charCode <= 0xFEFF)) {
        arabicCount++;
      } else if ((charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122)) { // A-Z, a-z
        englishCount++;
      }
    }
    if (arabicCount > englishCount) return true;
    if (englishCount > arabicCount) return false;
    // If equal or no letter characters, check if any Arabic exists
    const rtlChar = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\uFE70-\uFEFC]/;
    return rtlChar.test(text);
  };

  // Auto-switch target language based on typed/generated original text
  useEffect(() => {
    if (!promptText.trim()) return;
    const isOrigArabic = /[\u0600-\u06FF]/.test(promptText);
    
    if (!isOrigArabic) {
      // Original text is English / Non-Arabic
      if (tgtLang === 'en') {
        setTgtLang('ar');
      }
    } else {
      // Original text is Arabic
      if (tgtLang === 'ar') {
        setTgtLang('en');
      }
    }
  }, [promptText]);

  // Auto-translate with debounce
  useEffect(() => {
    if (!promptText.trim()) {
      setTranslatedPromptText('');
      return;
    }

    setIsTranslating(true);
    const timer = setTimeout(async () => {
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcLang}&tl=${tgtLang}&dt=t&q=${encodeURIComponent(promptText)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Translation API error');
        
        const data = await response.json();
        if (data && data[0]) {
          const result = data[0]
            .map((item: any) => item[0])
            .filter(Boolean)
            .join('');
          setTranslatedPromptText(result);
        }
      } catch (err) {
        console.error('Translation failed:', err);
      } finally {
        setIsTranslating(false);
      }
    }, 450); // 450ms debounce to prevent hitting rate limits

    return () => clearTimeout(timer);
  }, [promptText, srcLang, tgtLang]);

  const handleSwap = () => {
    const tempText = promptText;
    setPromptText(translatedPromptText);
    setTranslatedPromptText(tempText);

    // Swap selected languages seamlessly
    const currentSrc = srcLang;
    const currentTgt = tgtLang;

    if (currentSrc === 'auto') {
      const detectedSrc = /[\u0600-\u06FF]/.test(tempText) ? 'ar' : 'en';
      setSrcLang(currentTgt);
      setTgtLang(detectedSrc);
    } else {
      setSrcLang(currentTgt);
      setTgtLang(currentSrc);
    }
  };

  // Reset enhanced prompt and update textarea when any selection changes
  useEffect(() => {
    if (isCleared) {
      setIsCleared(false);
      return;
    }
    
    const isDefaultConfig = 
      aspectRatio === 'حجم تلقائي' &&
      (styleMode === 'بدون نوع (يتبع البرومبت)' || styleMode === 'يتبع الصورة المرجعية') &&
      (shotType === 'بدون نوع (يتبع البرومبت)' || shotType === 'يتبع الصورة المرجعية') &&
      (shotAngle === 'بدون نوع (يتبع البرومبت)' || shotAngle === 'يتبع الصورة المرجعية') &&
      gender === 'رجل' &&
      age === '' &&
      (pose === 'بدون نوع (يتبع البرومبت)' || pose === 'يتبع الصورة المرجعية') &&
      (outfit === 'بدون نوع (يتبع البرومبت)' || outfit === 'يتبع الصورة المرجعية') &&
      (expression === 'بدون نوع (يتبع البرومبت)' || expression === 'يتبع الصورة المرجعية') &&
      (lighting === 'بدون نوع (يتبع البرومبت)' || lighting === 'يتبع الصورة المرجعية') &&
      (camera === 'بدون نوع (يتبع البرومبت)' || camera === 'يتبع الصورة المرجعية');
      
    if (isDefaultConfig) {
      setPromptText('');
    } else {
      setPromptText(getStructuredPrompt());
    }
    setEnhancedPrompt(null);
  }, [aspectRatio, styleMode, shotType, shotAngle, gender, age, pose, outfit, expression, lighting, camera]);

  // Handle Clipboard Copy
  const handleCopyCustom = async (textToCopy: string, label: string) => {
    if (!textToCopy) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedLabel(label);
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
        setCopiedLabel(null);
      }, 3000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  };

  // AI Enhancement call
  const handleEnhancePrompt = async () => {
    setIsEnhancing(true);
    setApiError(null);
    try {
      const originalPrompt = promptText.trim() || getStructuredPrompt();
      const userApiKey = safeStorage.getItem('user_gemini_api_key') || '';
      
      let success = false;
      let enhancedTextResult = '';

      const systemInstruction = `أنت خبير ذكاء اصطناعي محترف ومتميز في كتابة وتحسين برومبتات (prompts) توليد الصور لمولدات الصور الرائدة مثل Midjourney و Stable Diffusion و Leonardo AI و Imagen.
مهمتك هي إعادة صياغة وترقية وتطوير البرومبت التالي لتجعله فائق الجاذبية والاحترافية والسينمائية.

المعايير المطلوبة:
1. حافظ على كافة تفاصيل وهيكل المعطيات التي حددها المستخدم بدقة تامة (مثل الجنس والكل، العمر، المظهر، الوضعية، النمط، مقاس الصورة، الزي، التعبير، الإضاءة، وإعدادات الكاميرا). لا تغير أو تلغي أي عنصر أساسي حدده المستخدم.
2. قم بإعادة صياغة النص بصورة وصفية سينمائية فائقة الجمال وغنية بالتفاصيل البصرية الفنية (مثل التفاصيل الدقيقة للوجه، الملمس الواقعي للبشرة والأقمشة، والجو العام).
3. اكتب البرومبت المحسن بالكامل إما باللغة العربية بأسلوب راق للغاية وإما كبرومبت احترافي يمزج الكلمات المفتاحية بالإنجليزية لضمان وصول المولد لأفضل جودة جمالية (يفضل كتابة الأجزاء الوصفية بالإنجليزية في قالب منظم لتناسب محركات التوليد).
4. لا تضف أي مقدمات أو شروحات أو عبارات مثل "تفضل البرومبت" أو علامات اقتباس إضافية. قم بإرجاع النص البرومبت النهائي مباشرة وبشكل فوري وجاهز للاستخدام.

البرومبت الأصلي المراد تحسينه:
"""
${originalPrompt}
"""`;

      // 1. First, attempt to call the backend endpoint (relative path /api/enhance-prompt)
      try {
        const headersKey: Record<string, string> = { 'Content-Type': 'application/json' };
        if (userApiKey) {
          headersKey['x-gemini-api-key'] = userApiKey;
        }
        
        const response = await fetch('/api/enhance-prompt', {
          method: 'POST',
          headers: headersKey,
          body: JSON.stringify({ prompt: originalPrompt, apiKey: userApiKey }),
        });

        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('application/json')) {
          const data = await response.json();
          if (data && data.enhancedText) {
            enhancedTextResult = data.enhancedText;
            success = true;
          } else if (data && data.error) {
            throw new Error(data.error);
          }
        } else {
          console.warn('[PromptBuilder] Local backend `/api/enhance-prompt` not available or returned HTML (e.g. static site). Trying fallback options...');
        }
      } catch (backendErr: any) {
        console.warn('[PromptBuilder] Local backend request failed:', backendErr);
      }

      // 2. Fallback A: If we have a user custom API key, execute direct client-side Gemini generation!
      if (!success && userApiKey) {
        console.log('[PromptBuilder] Fallback A: Executing direct client-side Gemini call with user key...');
        const modelsToTry = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
        
        for (const modelName of modelsToTry) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${userApiKey}`;
            const directRes = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: systemInstruction }] }]
              })
            });

            if (directRes.ok) {
              const resData = await directRes.json();
              const fetchedText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (fetchedText) {
                enhancedTextResult = fetchedText.trim();
                success = true;
                console.log(`[PromptBuilder] Success generating client-side with ${modelName}`);
                break;
              }
            }
          } catch (directErr) {
            console.warn(`[PromptBuilder] Client-side direct call to ${modelName} failed:`, directErr);
          }
        }
      }

      // 3. Fallback B: Cross-Origin CORS request to the actual Cloud Run live host if local endpoint is not found
      if (!success) {
        const cloudRunBaseUrl = 'https://ais-pre-73b5ktfwj7jc3r2bxn3pj5-351201511869.europe-west3.run.app';
        console.log('[PromptBuilder] Fallback B: Querying secure Cloud Run deployment CORS API...');
        try {
          const response = await fetch(`${cloudRunBaseUrl}/api/enhance-prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: originalPrompt }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data && data.enhancedText) {
              enhancedTextResult = data.enhancedText;
              success = true;
              console.log('[PromptBuilder] Cloud Run Fallback B succeeded!');
            }
          }
        } catch (crErr) {
          console.warn('[PromptBuilder] Cloud Run Fallback B request failed:', crErr);
        }
      }

      // 4. Set prompt or throw error
      if (success && enhancedTextResult) {
        setEnhancedPrompt(enhancedTextResult);
        setPromptText(enhancedTextResult);
      } else {
        throw new Error('لم ينجح خادم الذكاء الاصطناعي في الاستجابة. يرجى التأكد من إضافة مفتاح Gemini API في خيارات القائمة الجانبية (أعلى الشاشة) للتشغيل في البيئات السحابية.');
      }
    } catch (err: any) {
      console.error('Enhance API error:', err);
      setApiError(err.message || 'حدث خطأ غير متوقع أثناء تحسين البرومبت بالذكاء الاصطناعي.');
    } finally {
      setIsEnhancing(false);
    }
  };

  // Reset and clear all options to 'بدون نوع'
  const handleClearAll = () => {
    setIsCleared(true);
    setAspectRatio('حجم تلقائي');
    setStyleMode('يتبع الصورة المرجعية');
    setShotType('يتبع الصورة المرجعية');
    setShotAngle('يتبع الصورة المرجعية');
    setGender('رجل');
    setAge('');
    setPose('يتبع الصورة المرجعية');
    setOutfit('يتبع الصورة المرجعية');
    setExpression('يتبع الصورة المرجعية');
    setLighting('يتبع الصورة المرجعية');
    setCamera('يتبع الصورة المرجعية');
    setEnhancedPrompt(null);
    setPromptText('');
    setTranslatedPromptText('');
    setApiError(null);
    setOutfitType('men');
    setMenOutfitSubCategory('modern');
    setWomenOutfitSubCategory('casual');
  };

  // Selection Arrays
  const aspectRatios = [
    'حجم تلقائي',
    'مربع (1:1)',
    'أفقي (16:9)',
    'طولي (9:16)',
    'شاشة (4:3)'
  ];

  const shotTypes = [
    'يتبع الصورة المرجعية',
    'لقطة قريبة جداً للوجه (Extreme Close-Up)',
    'لقطة قريبة للوجه والأكتاف (Close-Up)',
    'لقطة متوسطة قريبة (Medium Close-Up)',
    'لقطة متوسطة للنصف العلوي (Medium Shot)',
    'لقطة كاملة للجسم (Full Body Shot)',
    'لقطة واسعة للمكان والأشخاص (Wide Shot)',
    'لقطة عريضة جداً (Extreme Wide Shot)',
    'لقطة متناظرة',
    'لقطة ماكرو',
    'لقطة أبيض وأسود عالي التباين (B&W)',
    'لقطة بدرجات رمادية ناعمة',
    'لقطة بورتريه ازياء استوديو',
    'لقطة استوديو فائقة التصوير',
    'جلسة تصوير افتتاحية لمجلة أزياء ذات أجواء جمالية وبسيطة ومتطورة'
  ];

  const shotAngles = [
    'يتبع الصورة المرجعية',
    'بمستوى العين مباشرة (Eye Level Shot)',
    'زاوية منخفضة من الأسفل للأعلى (Low Angle Shot)',
    'زاوية مرتفعة من الأعلى للأسفل (High Angle Shot)',
    'زاوية من فوق الكتف (Over the Shoulder Shot)',
    'لقطة عين الطائر عمودية (Bird\'s Eye View)',
    'زاوية مائلة سينمائية (Dutch Angle)',
    'زاوية ديناميكية 3/4',
    'لقطة عرض عين الدودة',
    'الزاوية الهولندية'
  ];

  const poses = [
    'يتبع الصورة المرجعية',
    'يقف بثقة وشموخ مع ذراعين مكتوفتين على الصدر',
    'يجلس على كرسي مريح بوضعية هادئة ومسترخية',
    'يقف بطبيعية مع وضع اليدين في جيوب البنطال',
    'يمشي ببطء مع إمالة رأسه بابتسامة خفيفة نحو الكاميرا',
    'يجلس على حافة طاولة مع وضع يد واحدة على فخذه',
    'يقف في وضع جانبي (Profile Shot) وهو يلتفت برأسه نحو الكاميرا',
    'يداه تلمسان ياقة السترة مبرزاً تفاصيل الأناقة',
    'وضعية طبيعية مريحة عفوية دون التطلع المباشر للصناعة البصرية'
  ];

  const styles = [
    'يتبع الصورة المرجعية',
    'سينمائي درامي بعدسة 85mm وخلفية معزولة (Bokeh)',
    'رسمي واحترافي عملي ملائم لبيئات الأعمال والشركات',
    'غلاف مجلة أزياء بستايل إبداعي وإضاءة قوية مبرزة للملابس',
    'طبيعي خارجي ناعم ودافئ بالهواء الطلق مع ألوان حيوية',
    'استوديو غامض ومظلم يعتمد على إضاءة ريمبراندت والظلال العميقة',
    'الطابع الكلاسيكي العريق بخلفية دافئة ترمز لغروب الشمس الصحراوي',
    'رياضة ولياقة بدنية لتسليط الضوء على الكتلة العضلية والملابس الرياضية',
    'سحر الجمال واللمعان بتركيز عالٍ على الوجه وإضاءة ناعمة خالية من الظلال',
    'صورة شخصية تجارية نظيفة بخلفية رمادية خفيفة أو بيضاء مثالية للبروفايل',
    'خلفية بيضاء بسيطة استوديو (Seamless White) لتجربة عصرية متميزة',
    'الساعة الذهبية والغروب مع إضاءة برتقالية خلفية دافئة',
    'أبيض وأسود كلاسيكي بتباين عالي وحبيبات سينمائية محاكية للأفلام القديمة',
    'سينمائي كوداك قديم وألوان Portra الكلاسيكية الدافئة',
    'ملابس الشارع بستايل حضري بسيط في أزقة المدن العصرية',
    'نمط حياة يومي مريح ودافئ داخل بيئة منزلية دافئة وإضاءة نافذة طبيعية',
    'بهو فندق 5 نجوم فاخر بإضاءة ثريات ذهبية وتفاصيل معمارية مذهلة',
    'جلسة مقهى دافئة مع درجات البني والملابس الشتوية المريحة',
    'شاطئ وبحر الصيف المنعش بألوان زرقاء وصافية'
  ];

  const menOutfitsModern = [
    'يتبع الصورة المرجعية',
    ' قميصًا أبيض بأكمام قصيرة وتي شيرت جينز أزرق فاتح، وحذاء رياضي أبيض.',
    ' سترة جلدية سوداء وتي شيرت أبيض وبنطلون جينز أسود، وحذاء بوت أسود.',
    ' قميص بولو أبيض وبنطال جينز أزرق، وحذاء لوفر بني.',
    ' تي شيرت رياضي أزرق وبنطلون رياضي أسود، وحذاء رياضي أسود.',
    ' سترة صوفية بيج وقميصًا أزرق فاتح وبنطلون جينز أزرق داكن، وحذاء بوت بني.',
    ' سترة بغطاء للرأس رمادية اللون وبنطلون رياضي أسود، وحذاء رياضي أسود.',
    ' قميص بولو أزرق داكن وجينز أزرق فاتح ، وحذاء رياضي أبيض.',
    'قميصًا أبيض بياقة مفتوحة وبنطلونًا صينيًا بنيًا، وحذاء لوفر بني.',
    'قميص حريري فيروزي وبنطال قماشي بيج.',
    'سترة بيضاء مصممة ،تحتها قميص بياقة لونه زهري(وردي) ، مفتوح الأزرار قليلاً من الأعلى، بنطال جينز أزرق مع حزام كحلي ببكلة فضية عصرية.',
    'قميصًا من الحرير الأبيض بأزرار، مفتوح قليلاً عند الصدر، ويكشف عن سلسلة فضية رفيعة، فوقها سترة مخملية غنية باللون العنابي ذات ملمس ناعم وفاخر.',
    'سترة بيضاء مصممة ،تحتها قميص بياقة من الساتان الأسود ، مفتوح على شكل حرف V (مفتوح الأزرار، صدر مرئي)، بنطال أسود مع حزام أبيض ببكلة ذهبية.',
    'جاكيت جلد "سويد" بلون بني جملي، فوق كنزة بياقة عالية (Turtleneck) بلون رمادي، وبنطال جينز غامق بقصة مستقيمة.',
    'سترة بليزر بلون "الأزرق الملكي" فوق قميص أسود بياقة مفتوحة، مع بنطال رمادي "شار كول" وحذاء لوفر أسود.',
    'تيشيرت "بولو" محبوك بلون البيج الكريمي، فوقه جاكيت خفيف بلون الزيتوني المطفي، مع بنطال أبيض وقماش قطني فاخر.',
    'قميص من الكتان الأبيض بياقة صينية، مع سترة (Blazer) غير مبطنة بلون رمادي فاتح، وبنطال "تشينو" بلون الكحلي الداكن.',
    'قميص أزرق فاتح (Sky Blue)',
    'قميص "وردة الرمال" (Pale Pink).',
    'قميص بياقة بيضاء وجسم أزرق (Winchester Shirt).',
    'قميصًا أسود عصريًا، وجينز رماديًا ناعمًا، وأحذية رياضية مكتنزة باللونين الرمادي والأبيض',
    'جمالية تنفيذية حديثة، نسيج فاخر، خياطة حادة.',
    'سترة متماسكة كريم.',
    'جاكيت شتوي أبيض (puffer jacket)، تحته قميص او تيشيرت كحلي ، وبنطلون جينز ازرق ، وحذاء رياضيا ابيض ، وساعة يد بيضاء ذكية.',
    'قميص رسمي أبيض مفتوح قليلاً من المنتصف، طية قماش طبيعية مع تجاعيد واقعية، أناقة حسية بدون ابتذال،أجواء تحريرية راقية.',
    'سترة جلدية داكنة، تظهر الياقة والكتفين، مما يضيف لمسة من الأسلوب الجريء والخالد إلى الصورة.',
    'قميص كتان خفيف الوزن (أوف وايت)، وبنطلون بيج بكسرات.',
    'قميصًا من الكتان باللون الأبيض العاجي، مفكوكًا بعض الشيء، بأكمام مطوية، ومثبتًا في بنطال بيج عالي الخصر مثبتًا بحزام منسوج بني.',
    'سترة متماسكة مريحة باللون البيج.',
    'قميصًا أبيضًا كبيرًا عليه صورة كبيرة لـ Sailor Moon. طوق القميص أزرق.',
    'سترة سوداء وجينز، ونظارات مستديرة، وسماعات رأس حول الرقبة.',
    'ملابس عصرية ذات أنسجة نابضة بالحياة وانعكاسات ضوئية.',
    'بدلة مصممة باللون البيج، وربطة عنق باللون الأزرق الداكن، ومنديل جيب.',
    'سترة بحرية وقميصًا أبيض مفتوحًا، بدون ربطة عنق.',
    'سترة بيضاء.',
    'قميص قطني خفيف، كاجوال, أزرار مفتوحة عند الياقة.',
    'قميص رسمي خفيف مع بعض الأزرار مفتوحة.'
  ];

  const menOutfitsThreePiece = [
    'يتبع الصورة المرجعية',
    'بدلة راقية ومتطورة من ثلاث قطع للرجال:السترة مصنوعة من اللون الأسود الفحمي مع طية صدر واسعة وفريدة من نوعها باللون الرمادي الفاتح المتباين،أسفلها صدرية مزدوجة الصدر باللون الرمادي الفاتح مع تصميم زر قطري غير متماثل مبتكر وطيات صدر رمادية متطابقة،مع بنطال ضيق باللون الرمادي الفاتح، ربطة عنق حريرية سوداء رفيعة مع مشبك ربطة عنق ذهبي بسيط ومربع جيب أبيض ناصع. ',
    'طقم "الإمبراطور": بدلة فاخرة بلون "البيج العاجي" بالكامل، صديرية مزدوجة الصدر بـ 8 أزرار، قميص أبيض ثلجي، وربطة عنق بلون "البرونز" الحريري لمظهر ملكي مبهر.',
    'طقم من 3 قطع بلون رمادي "كاروهات" خفيفة (Prince of Wales check), صديرية بصف واحد من الأزرار، وربطة عنق كحلية.'
  ];

  const menOutfitsFormal = [
    'يتبع الصورة المرجعية',
    'بدلة بمجموعة رسمية أنيقة، قميص رسمي أبيض مع فتحة الأزرار، ربطة عنق كلاسيكية.',
    'بدلة رسمية كلاسيكية مع ياقة عريضة وتصميم حاد أنيق.',
    'بدلة سوداء ذات لمعة خفيفة جداً، وقميص رمادي فاتح، وربطة عنق سوداء ضيقة لإطلالة حادة "عصرية".',
    'بدلة أنيقة باللونين العاجي والأسود مع ربطة عنق رفيعة ذهبية لامعة.',
    'بدلة من الكتان الكامل بلون "السماوي الفاتح"، قميص أبيض مفتوح الأزرار، ومنديل جيب بنقشات زهرية ناعمة.',
    'بدلة باللون الرمادي الفحمي، مع سترة سوداء متباينة، وربطة عنق حريرية فضية، ودبوس ياقة بسلسلة ذهبية.',
    'طقم كحلي داكن جداً (Midnight Blue), صديرية مزدوجة الصدر (Double Breasted Vest) بياقة، قميص أبيض بياقة فرنسية، وأزرار أكمام فضية.',
    'بدلة سوداء بلمعة خفيفة جداً، قميص رمادي فاتح، وربطة عنق سوداء رفيعة "Slim" لإطلالة "مودرن" حادة.',
    ' بدلة بلون البني التبغ (Tobacco Brown)، قميص أزرق فاتح، ومنديل جيب يجمع بين اللونين الأزرق والبرتقالي المحروق.',
    'بدلة بلون "الأخضر الغامق/الزيتي الفاخر"، قميص بلون الكريمي، وربطة عنق محبوكة (Knitted tie) باللون البني.',
    'بدلة ضيقة (Slim Fit) بلون أزرق "نيفي"، قميص أبيض بخطوط زرقاء دقيقة، وربطة عنق حريرية باللون العنابي.',
    'بدلة بلون الرمادي المتوسط، ياقة الجاكيت عريضة قليلاً، قميص وردي فاتح جداً، وربطة عنق رمادية داكنة بنقشة "هيرينغ بون".',
    'بدلة رمادية فاتحة مزدوجة الصدر بنمط غلين بلود،تبدو البدلة مصممة جيدًا وتناسب جسده بشكل وثيق، تتميز السترة بطية صدر عالية وما يبدو أنه ستة أزرار (أربعة وظيفية، واثنان مزخرفان)،تحتها قميصًا أبيضًا أنيقًا وربطة عنق منقوشة بظلال من اللون البني والأبيض/الذهبي، مما يضيف ملمسًا دافئًا ومتباينًا إلى البدلة الرمادية الرائعة، مع مربع جيب حريري منقوش، بني في المقام الأول وربما أحمر داكن أو كستنائي، مدسوس بدقة في جيب صدر السترة.',
    'بدلة عصرية باللون البيج الفاتح مع قميص بني تحتها وربطة عنق باللون البيج.',
    'بدلة مصممة باللون الأسود الداكن مع لمسات ذهبية رقيقة مع قميص حريري أسود بياقة مفتوحة تمثل الأناقة الحديثة الفاخرة.'
  ];

  const womenOutfitsCasual = [
    'يتبع الصورة المرجعية',
    'بلوزة كلاسيكية من الدانتيل الأبيض مطرزة بحرفية عالية مع بنطال جينز أزرق عالي الخصر وجاكيت خفيف.',
    'سترة صوفية دافئة بلون كريمي/بيج مع جينز كلاسيكي مريح وحذاء رياضي أبيض.',
    'فستان صيفي خفيف وأنيق بنقشة زهور ناعمة مع قبعة قش ونظارة شمسية دائرية.',
    'سترة صوفية ناعمة بلون المشمش مع تنورة ميدي طويلة وبوت جلدي بني دافئ.',
    'تيشيرت بولو كريمي وبنطال كتان أبيض واسع ومريح لقضاء يوم مشمس دافئ.',
    'جاكيت جلد ناعم بلون بيج فوق كنزة سوداء بياقة عالية وجينز داكن.',
    'قميص كتان مخضر هادئ وبنطال جينز فاتح مريح مع حذاء لوفر جلدي.',
    'كنزة صوفية محبوكة ربيعية ذات لون سماوي هادئ وبنطال قطني أبيض عاجي.'
  ];

  const womenOutfitsFormal = [
    'يتبع الصورة المرجعية',
    'بدلة نسائية رسمية أنيقة ومصممة بدقة باللون الكحلي الداكن مع قميص حريري أبيض وحذاء ذو كعب عالي.',
    'بليزر رسمي بلون بيج رملي فوق توب ناصع البياض وبنطال رسمي متناسق وساعة يد ذهبية فاخرة.',
    'بدلة نسائية رسمية راقية من قطعتين باللون الأسود الفخم، مع تفاصيل الخياطة الفريدة وحزام خصر عريض أنيق.',
    'معطف ترنش (Trench Coat) كلاسيكي فاخر بلون الخردل أو الكاراميل فوق بلوزة من الحرير وبنطال رسمي ناعم.',
    'بليزر أبيض عاجي ذو طية صدر مخملية فوق قميص رمادي حريري وبنطال رسمي أسود لإطلالة أعمال حادة وراقية.'
  ];

  const womenOutfitsTraditional = [
    'يتبع الصورة المرجعية',
    'عباءة شرقية معاصرة باللون الأسود الفاخر مزينة بتطريز يدوي دقيق بالخيوط الذهبية على الأكمام والأطراف.',
    'قفطان مغربي مطرز بالذهب والحرير بلون زمردي أخضر داكن وتطريزات براقة فاخرة تناسب الحفلات.',
    'فستان سهرة درامي مخملي داكن بتطريزات أزهار فضية وخرز لامع، ملمس حريري ثقيل فخم وجدير بالمتاحف.',
    'فستان طويل منسدل باللون الوردي الفاتح والأبيض الشفاف على طراز هانفو بأكمام مطرزة شفافة وزخارف ذهبية رقيقة وسحر كلاسيكي مذهل.',
    'عرايسية كلاسيكية راقية: فستان سهرة بلون العاج الفاتح مع تفاصيل الدانتيل الفاخر واللؤلؤ اللامع.',
    'فستان طويل أنيق بلون لؤلؤي لامع من الحرير والساتان الطبيعي يحاكي التصاميم الملكية المعاصرة.',
    'ملابس فستان كورسيه ساتان وتلوين عاجي مع لوحة تنورة مخملية بلون كحلي وتطريز زهور كريستالي ناعم وجذاب.'
  ];

  const expressions = [
    'يتبع الصورة المرجعية',
    'ابتسامة لطيفة على الوجه.',
    'ابتسامة لطيفة في العيون.',
    'واثق، صريح، فني.',
    'هادئ وواثق - عيون مسترخية وابتسامة باهتة.',
    'واثق ولكن غير رسمي - ابتسامة طفيفة، استرخاء طبيعي للوجه.',
    'العيون مفتوحة قليلاً ،وتنظر بنظرة تأمل أو حلم.',
    'الحفاظ على التواصل البصري الدافئ مع الكاميرا.',
    'رأسه باتجاه الكاميرا وهو ينظر اليها بوداعة وثقة.',
    'ينضح الشخص، الذي يرتدي الزي الرسمي، بالثقة الحديثة.',
    'يتمتع بتعبير مسترخٍ وراقي.',
    'لديه تعبير مريح وراقي.',
    'تنظر عيناه بلطف إلى الكاميرا بتعبير حنون ، ولطيف ، ورقيق.',
    'تنظر عيناه بلطف إلى الكاميرا بتعبير لطيف ورقيق.',
    'في وضع مريح ولكن واثق.',
    'يبدي شعوراً بالمودة والرومانسية.',
    'يُظهر الشعور بالثقة والجدية والتصميم.',
    'مبتسما ابتسامة خفيفة.',
    'ينظر بنظرة تفاؤل ورضا.',
    'ينظر برأسه الى الاعلى وعينيه الى الاعلى باتجاه السماء.',
    'ينظر الى الكاميرا بوداعة ومودّة.',
    'ينظر الى الكاميرا بمودة.',
    'نظرة حنونة موجهة للكاميرا.',
    'نظرة هادئة وواثقة.',
    'خطوط التعبير الخفيفة جدًا.',
    'يبدو وجهه لطيفًا جدًا وحنونًا تجاه الكاميرا.',
    'يوحي بإحساس بالحلم أو الأمل أو التأمل العميق.',
    'النظر مباشرة إلى الكاميرا، في وضع مريح مع وضع يده على ذقنه.',
    'عاكس، هادئ، تأملي.',
    'حنين وحميم، يستحضر جمالية الصيف الخالدة.',
    'يبتسم بشكل خفي.',
    'يبتسم بمهاره.',
    'يبتسم بلطف.',
    'في وضع مريح.',
    'ابتسامة حنونة.',
    'مدروس قليلا.',
    'محايد.',
    'متأمل.'
  ];

  const lightings = [
    'يتبع الصورة المرجعية',
    'ناعمة، عالية الجودة، واقعية',
    'ناعمة عالية الجودة، وأنسجة واقعية، وواقعية سينمائية، وأجواء فنية للصورة.',
    'الإضاءة الدرامية باستخدام المواد الهلامية ثنائية اللون. يتم غمر أحد جانبي الوجه والجسم بضوء سماوي أو أزرق مخضر نابض بالحياة، بينما يتم إضاءة الجانب الآخر بضوء أحمر أو أرجواني متباين. يؤدي هذا إلى إنشاء تقسيم لوني حاد في وسط الشكل، مما ينحت ملامح الوجه بإبرازات ملونة وظلال عميقة',
    'إضاءة الاستوديو مع صندوق شريطي أو طبق تجميل مع شبكة كإضاءة رئيسية، يتم وضعها فوق وأمام الهدف لإنشاء إضاءة درامية ومنحوتة، بدون إضاءة كاملة للحفاظ على تباينات قوية',
    'دراماتيكية ومنحوتة ومنخفضة المستوى، باستخدام مصدر ضوء رئيسي واحد من الأعلى ومن الجانب لخلق تناقضات حادة',
    'المشهد بأكمله مغمور بإضاءة حمراء سينمائية درامية، تنبعث بشكل أساسي من الجزء العلوي الأيمن، وتلقي ظلالاً عميقة وتسلط الضوء على ملامح وجه الشخص ويده',
    'الإضاءة السينمائية الذهبية الدافئة',
    'ضوء ناعم ومنتشر على الموضوع',
    'إضاءة سينمائية عالية المستوى للأزياء',
    'ضوء الشمس الطبيعي مع تباين الظل القوي',
    'الإضاءة ناعمة وطبيعية',
    'إضاءة ناعمة دافئة',
    'ضوء النهار الطبيعي',
    'ظلال سينمائية',
    'اضاءة ستوديو ناعمة',
    'إضاءة الاستوديو مع ضوء أمامي ناعم أعلى بقليل من مستوى العين، مع الحد الأدنى من الحشو الجانبي للحفاظ على الظلال المذهلة والأجواء الدرامية.'
  ];

  const cameras = [
    'يتبع الصورة المرجعية',
    'ضبط فتحة العدسة بين f/1.8 وf/2.2 للحصول على عمق مجال ضحل للغاية (بوكيه كريمي).',
    'عدسة مقاس 50 ملم f/1.4.',
    'عدسة مقاس 50 ملم f/1.8.',
    'عدسة مقاس 50 ملم f/2.2.',
    'عدسة مقاس 50 ملم f/2.8.',
    'عدسة مقاس 85 ملم f/2.8.',
    'عدسة مقاس 85 ملم f/1.8.',
    'عدسة مقاس 85 ملم f/2.2.',
     'عدسة بفتحة واسعة لخلفية غير واضحة قليلاً.',
     'عدسة صورة رئيسية (على سبيل المثال، 85 مم أو 100 مم) على كاميرا ذات إطار كامل، وهي مثالية لالتقاط صور مقربة حميمة وخالية من التشويه.',
     'يركز بشكل مكثف على العينين والوجه، ويترك الباقي غير واضح بهدوء.',
     'ISO 100-200 للحصول على أقصى جودة للصورة بالأبيض والأسود وبدون ضوضاء.',
     'تركيز فائق الوضوح، عمق المجال السينمائي.',
     '',
  ];

  return (
    <div className="mx-auto w-full max-w-xl pb-12 text-right relative z-10" dir="rtl">
      {/* Ready Prompt Sites Block */}
      <div className="mt-1 mb-2">
        <button
          type="button"
          onClick={() => setIsSitesOpen(!isSitesOpen)}
          className="w-full flex items-center justify-between bg-gradient-to-r from-[#7C7C5A] to-[#4A4A35] text-white px-4 py-1.5 rounded-2xl font-normal text-sm shadow-sm hover:shadow transition-all active:scale-[0.98] outline-none cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-amber-200 animate-spin-slow" />
            <span className="text-[14px]"> مواقع برومبت جاهزة </span>
          </div>
          <ChevronDown
            size={18}
            className={`transition-transform duration-300 ${isSitesOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Collapsible Directory of Sites */}
        <AnimatePresence>
          {isSitesOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="mt-1.5 bg-white border border-natural-border p-3 rounded-2xl shadow-md space-y-2.5 overflow-hidden relative z-50 text-right"
            >


              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1 no-scrollbar">
                {sites.map((site, index) => {
                  const isVisited = visitedSiteIds.includes(site.id);
                  // Clean URL to display only the domain and path without protocols to look cleaner
                  const cleanDisplayUrl = site.url.replace(/^https?:\/\/(www\.)?/i, '');
                  
                  return (
                    <div
                      key={site.id}
                      className={`flex items-start justify-between gap-1.5 p-2 rounded-xl border transition-all ${
                        isVisited
                          ? 'bg-neutral-50/50 border-natural-border/80 opacity-90'
                          : 'bg-green-50/5 border-natural-border/90 hover:bg-green-50/10'
                      }`}
                    >
                      {/* Left side: Numbering + Clickable Site Name + Rename field */}
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <span className="text-[10px] font-black text-[#4A4A35] min-w-[16px] mt-0.5 text-center select-none bg-natural-primary/10 rounded-md py-0.5 px-0.5">
                          {index + 1}
                        </span>
                        
                        <div className="flex-1 min-w-0 space-y-1">
                          {/* Site Name Link (Enlarged, Green by default, Red if visited) */}
                          <a
                            href={site.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              if (!visitedSiteIds.includes(site.id)) {
                                setVisitedSiteIds(prev => [...prev, site.id]);
                              }
                            }}
                            className={`inline-block text-xs sm:text-sm font-black hover:underline break-all transition-colors leading-tight cursor-pointer font-mono ${
                              isVisited
                                ? 'text-red-700 hover:text-red-800'
                                : 'text-emerald-900 hover:text-emerald-950 font-black'
                            }`}
                            title={`اضغط لزيارة: ${site.url}`}
                            dir="ltr"
                          >
                            {cleanDisplayUrl}
                          </a>

                          {/* Editable rename and feature field */}
                          <div className="flex items-center gap-1.5 opacity-90 max-w-xs bg-[#4A4A35]/5 border border-natural-border/50 rounded-lg px-2 py-0.5">
                            <span className="text-[9px] text-[#4A4A35] font-black shrink-0 select-none font-sans">الاسم والميزة:</span>
                            <input
                              type="text"
                              value={site.name}
                              onChange={(e) => handleEditSiteName(site.id, e.target.value)}
                              placeholder="اضغط لتسمية الموقع..."
                              className="w-full bg-transparent text-[10px] font-extrabold text-[#3A3A28] focus:outline-none py-0 text-right font-sans border-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Right side: Delete button for Custom Sites only */}
                      {!site.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSiteById(site.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200 shrink-0 cursor-pointer self-start mt-0.5"
                          title="حذف هذا الموقع المخصص"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* End of list: custom fields */}
              <div className="border-t border-natural-border/50 pt-3 space-y-2">
                <div className="text-[10px] font-black text-natural-primary">
                  ➕ إضافة موقع مخصص إلى قائمتك:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-right">
                  <input
                    type="text"
                    value={newSiteUrl}
                    onChange={(e) => setNewSiteUrl(e.target.value)}
                    placeholder="رابط الموقع (مثال: example.com)"
                    className="w-full text-right rounded-xl border border-natural-border bg-natural-bg/30 px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-natural-primary focus:outline-none transition-all placeholder:text-natural-muted/50"
                  />
                  <input
                    type="text"
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                    placeholder="اسم الموقع المخصص (اختياري)"
                    className="w-full text-right rounded-xl border border-natural-border bg-natural-bg/30 px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-natural-primary focus:outline-none transition-all placeholder:text-natural-muted/50"
                  />
                </div>
                <div className="flex items-center gap-1.5 justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={handleAddSite}
                    className="flex items-center gap-1 bg-natural-primary text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-sm hover:bg-[#4A4A35] transition-all cursor-pointer"
                  >
                    <Plus size={11} />
                    <span>حفظ الموقع</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCustomSite_byUrl}
                    className="flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-xl text-xs font-black shadow-sm hover:bg-red-100 transition-all cursor-pointer"
                  >
                    <Trash2 size={11} />
                    <span>حذف الموقع</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Prompt Builder Controller / Toggle Button */}
      <div className="mt-1 mb-4">
        <button
          type="button"
          onClick={() => setIsBuilderOpen(!isBuilderOpen)}
          className="w-full flex items-center justify-between bg-gradient-to-r from-[#4A4A35] to-[#7C7C5A] text-white px-3 py-2 rounded-2xl font-normal text-sm shadow-sm hover:shadow transition-all active:scale-[0.98] outline-none cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Sliders className="h-3 w-3 text-amber-200" />
            <span className="text-[14px]">أدوات صانع البرومبت والتحسين والترجمة</span>
          </div>
          <ChevronDown
            size={18}
            className={`transition-transform duration-300 ${isBuilderOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Collapsible Options and Generated Outputs */}
      <AnimatePresence>
        {isBuilderOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-4 overflow-visible"
          >
            {/* Options configuration Panel */}
            <div className="bg-white rounded-3xl border border-natural-border p-5 shadow-sm space-y-5 mb-6">
        
        {/* Option 1: Gender & Age (Custom Layout) - Now at the absolute top */}
        <div className="grid grid-cols-2 gap-3 relative z-[110]">
                <CustomSelector
                  label="تحديد الجنس"
                  options={['رجل', 'امرأة', 'طفل', 'طفلة']}
                  value={gender}
                  onChange={setGender}
                  zIndex={115}
                />
                <div>
                  <label className="block text-xs font-black text-natural-primary mb-1.5">
                    العمر (اختياري)
                  </label>
                  <input
                    type="text"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="مثال: 30 عاماً"
                    className="w-full text-right rounded-xl border border-natural-border bg-natural-bg/40 px-3 py-2.5 text-xs font-bold focus:ring-1 focus:ring-natural-primary focus:outline-none transition-all hover:bg-natural-bg/60 placeholder:text-natural-muted/50"
                  />
                </div>
              </div>

              {/* Option 2: Aspect Ratio (Now a dropdown selector like others) */}
              <CustomSelector
                label="نسبة العرض إلى الارتفاع (أبعاد الصورة)"
                options={aspectRatios}
                value={aspectRatio}
                onChange={setAspectRatio}
                zIndex={100}
              />

              {/* Option 3: Style Mode */}
              <CustomSelector
                label=" اقتراحاات افتراضية سريعة"
                options={styles}
                value={styleMode}
                onChange={setStyleMode}
                zIndex={90}
              />

              {/* Option 4: Shot Type */}
              <CustomSelector
                label="نوع اللقطة"
                options={shotTypes}
                value={shotType}
                onChange={setShotType}
                zIndex={85}
              />

              {/* Option 4.5: Shot Angle */}
              <CustomSelector
                label="زاوية التصوير"
                options={shotAngles}
                value={shotAngle}
                onChange={setShotAngle}
                zIndex={80}
              />

              {/* Option 5: Pose */}
              <CustomSelector
                label=" الوضعية"
                options={poses}
                value={pose}
                onChange={setPose}
                zIndex={70}
              />

              {/* Option 6: Outfit */}
              <CustomSelector
                options={
                  outfitType === 'women'
                    ? womenOutfitSubCategory === 'formal'
                      ? womenOutfitsFormal
                      : womenOutfitSubCategory === 'traditional'
                      ? womenOutfitsTraditional
                      : womenOutfitsCasual
                    : menOutfitSubCategory === 'threePiece'
                    ? menOutfitsThreePiece
                    : menOutfitSubCategory === 'formal'
                    ? menOutfitsFormal
                    : menOutfitsModern
                }
                value={outfit}
                onChange={setOutfit}
                zIndex={60}
                labelComponent={
                  <div className="flex flex-col gap-2 mb-1.5 matches-label-direction">
                    <div className="flex items-center justify-between w-full">
                      <label className="block text-xs font-black text-natural-primary">
                        الزي والملابس
                      </label>
                      <div className="flex items-center gap-1 bg-natural-bg/50 p-0.5 rounded-lg border border-natural-border/40 select-none">
                        <button
                          type="button"
                          onClick={() => setOutfitType('women')}
                          className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all ${
                            outfitType === 'women'
                              ? 'bg-natural-primary text-white shadow-sm'
                              : 'text-[#4A4A35] hover:bg-natural-bg/80'
                          }`}
                        >
                          ملابس نسائية
                        </button>
                        <button
                          type="button"
                          onClick={() => setOutfitType('men')}
                          className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all ${
                            outfitType === 'men'
                              ? 'bg-natural-primary text-white shadow-sm'
                              : 'text-[#4A4A35] hover:bg-natural-bg/80'
                          }`}
                        >
                          ملابس رجالية
                        </button>
                      </div>
                    </div>

                    {/* Sub-categories for Men's clothing */}
                    {outfitType === 'men' && (
                      <div className="flex justify-end select-none">
                        <div className="flex items-center gap-1 bg-natural-bg/50 p-0.5 rounded-lg border border-natural-border/40">
                          <button
                            type="button"
                            onClick={() => setMenOutfitSubCategory('formal')}
                            className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all ${
                              menOutfitSubCategory === 'formal'
                                ? 'bg-natural-primary text-white shadow-sm'
                                : 'text-[#4A4A35] hover:bg-natural-bg/80'
                            }`}
                          >
                            بدلة رسمية
                          </button>
                          <button
                            type="button"
                            onClick={() => setMenOutfitSubCategory('threePiece')}
                            className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all ${
                              menOutfitSubCategory === 'threePiece'
                                ? 'bg-natural-primary text-white shadow-sm'
                                : 'text-[#4A4A35] hover:bg-natural-bg/80'
                            }`}
                          >
                            بدلة 3 قطع
                          </button>
                          <button
                            type="button"
                            onClick={() => setMenOutfitSubCategory('modern')}
                            className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all ${
                              menOutfitSubCategory === 'modern'
                                ? 'bg-natural-primary text-white shadow-sm'
                                : 'text-[#4A4A35] hover:bg-natural-bg/80'
                            }`}
                          >
                            ملابس عصرية
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Sub-categories for Women's clothing */}
                    {outfitType === 'women' && (
                      <div className="flex justify-end select-none">
                        <div className="flex items-center gap-1 bg-natural-bg/50 p-0.5 rounded-lg border border-natural-border/40">
                          <button
                            type="button"
                            onClick={() => setWomenOutfitSubCategory('traditional')}
                            className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all ${
                              womenOutfitSubCategory === 'traditional'
                                ? 'bg-natural-primary text-white shadow-sm'
                                : 'text-[#4A4A35] hover:bg-natural-bg/80'
                            }`}
                          >
                            فساتين ومناسبات
                          </button>
                          <button
                            type="button"
                            onClick={() => setWomenOutfitSubCategory('formal')}
                            className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all ${
                              womenOutfitSubCategory === 'formal'
                                ? 'bg-natural-primary text-white shadow-sm'
                                : 'text-[#4A4A35] hover:bg-natural-bg/80'
                            }`}
                          >
                            رسمي وأعمال
                          </button>
                          <button
                            type="button"
                            onClick={() => setWomenOutfitSubCategory('casual')}
                            className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all ${
                              womenOutfitSubCategory === 'casual'
                                ? 'bg-natural-primary text-white shadow-sm'
                                : 'text-[#4A4A35] hover:bg-natural-bg/80'
                            }`}
                          >
                            عصرية كاجوال
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                }
              />

              {/* Option 7: Expression */}
              <CustomSelector
                label="تعبير الوجه والنظرة"
                options={expressions}
                value={expression}
                onChange={setExpression}
                zIndex={50}
              />

              {/* Option 8: Lighting */}
              <CustomSelector
                label="الإضاءة والجو"
                options={lightings}
                value={lighting}
                onChange={setLighting}
                zIndex={40}
              />

              {/* Option 9: Camera */}
              <CustomSelector
                label="إعدادات الكاميرا والعدسة"
                options={cameras}
                value={camera}
                onChange={setCamera}
                zIndex={30}
              />

            </div>

      {/* Generated output box frame */}
      <div className="bg-[#4A4A35]/5 rounded-3xl border border-natural-border/60 p-5 mt-4 text-right flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-natural-border/30 pb-3">
          <span className="text-[11px] font-black text-natural-muted tracking-widest uppercase flex items-center gap-1.5 leading-none">
            {enhancedPrompt ? (
              <span className="flex items-center gap-1 text-amber-700 font-extrabold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                ✨ البرومبت المحسن ومترجمه اللحظي
              </span>
            ) : (
              <span className="text-natural-muted font-bold">
                📋 البرومبت الجاهز للنسخ ومترجمه اللحظي
              </span>
            )}
          </span>
          {enhancedPrompt && (
            <button
              onClick={() => {
                setEnhancedPrompt(null);
                setPromptText(getStructuredPrompt());
              }}
              className="text-[10px] font-bold text-natural-primary hover:underline flex items-center gap-1 px-2.5 py-1 rounded-lg bg-natural-primary/5 hover:bg-natural-primary/10 transition-colors"
            >
              <Eye size={11} />
              رؤية الهيكل الأصلي (استرجاع)
            </button>
          )}
        </div>

        {/* Translation controls header */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-natural-bg/20 p-2 rounded-2xl border border-natural-border/40 select-none">
          {/* Right side (RTL, original text label with dropdown) */}
          <div className="flex flex-col text-right w-full min-w-0">
            <span className="text-[9px] sm:text-[10px] font-black text-[#4A4A35] truncate text-right block w-full">لغة النص الفعلي</span>
            <select
              value={srcLang}
              onChange={(e) => setSrcLang(e.target.value)}
              className="mt-1 text-[10px] sm:text-[11px] rounded-lg border border-natural-border px-1.5 sm:px-2 py-1.5 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary cursor-pointer w-full text-right"
            >
              <option value="auto">تحديد تلقائي (Auto)</option>
              <option value="ar">العربية (Arabic)</option>
              <option value="en">الإنجليزية (English)</option>
              <option value="fr">الفرنسية (French)</option>
              <option value="tr">التركية (Turkish)</option>
              <option value="de">الألمانية (German)</option>
              <option value="es">الإسبانية (Spanish)</option>
              <option value="it">الإيطالية (Italian)</option>
              <option value="ru">الروسية (Russian)</option>
              <option value="zh">الصينية (Chinese)</option>
            </select>
          </div>

          {/* Swap Button (center) */}
          <div className="flex items-center justify-center self-end pb-1">
            <button
              type="button"
              onClick={handleSwap}
              title="تبديل النصوص واللغات"
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-natural-primary/10 text-natural-primary hover:bg-natural-primary hover:text-white transition-all shadow-sm border border-natural-primary/20 active:scale-95 shrink-0"
            >
              <ArrowLeftRight size={13} />
            </button>
          </div>

          {/* Left side (RTL, translated text label with dropdown) */}
          <div className="flex flex-col text-left w-full min-w-0">
            <span className="text-[9px] sm:text-[10px] font-black text-[#4A4A35] block w-full text-right truncate">لغة الترجمة الفورية</span>
            <select
              value={tgtLang}
              onChange={(e) => setTgtLang(e.target.value)}
              className="mt-1 text-[10px] sm:text-[11px] rounded-lg border border-natural-border px-1.5 sm:px-2 py-1.5 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary cursor-pointer w-full text-right"
            >
              <option value="en">الإنجليزية (English)</option>
              <option value="ar">العربية (Arabic)</option>
              <option value="fr">الفرنسية (French)</option>
              <option value="tr">التركية (Turkish)</option>
              <option value="de">الألمانية (German)</option>
              <option value="es">الإسبانية (Spanish)</option>
              <option value="it">الإيطالية (Italian)</option>
              <option value="ru">الروسية (Russian)</option>
              <option value="zh">الصينية (Chinese)</option>
            </select>
          </div>
        </div>

        {/* Textboxes comparison grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Box 1: Original text */}
          <div className="flex flex-col space-y-1.5 text-right w-full">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-extrabold text-[#4A4A35] flex items-center gap-1">
                ✍️ النص الأصلي/الفعلي
              </span>
            </div>
            <div className="relative">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="اكتب البرومبت هنا أو استخدم صانع البرومبت في الأعلى لإنشائه تلقائياً..."
                className="w-full h-56 text-right rounded-2xl border border-natural-border bg-white px-4 py-3.5 text-xs font-medium text-natural-text leading-relaxed tracking-wide resize-y focus:outline-none focus:ring-1 focus:ring-natural-primary shadow-inner"
                dir={isRtl(promptText) ? 'rtl' : 'ltr'}
                style={{ textAlign: isRtl(promptText) ? 'right' : 'left' }}
              />
            </div>
          </div>

          {/* Box 2: Translation */}
          <div className="flex flex-col space-y-1.5 text-right w-full">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-extrabold text-[#4A4A35] flex items-center gap-1">
                🔄 الترجمة اللحظية المباشرة
              </span>
            </div>
            <div className="relative w-full flex-1 flex flex-col">
              <textarea
                readOnly
                value={translatedPromptText}
                placeholder="الترجمة اللحظية ستظهر هنا تلقائياً..."
                className="w-full h-56 text-right rounded-2xl border border-natural-border bg-neutral-50 px-4 py-3.5 text-xs font-medium text-natural-text leading-relaxed tracking-wide resize-y focus:outline-none shadow-inner"
                style={{ textAlign: isRtl(translatedPromptText) ? 'right' : 'left' }}
                dir={isRtl(translatedPromptText) ? 'rtl' : 'ltr'}
              />
              {/* Translating loader indicator inside field */}
              {isTranslating && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[0.5px] flex items-center justify-center rounded-2xl">
                  <div className="flex items-center gap-2 text-natural-primary bg-white px-3 py-1.5 rounded-lg shadow-sm border border-natural-border">
                    <RefreshCw size={12} className="animate-spin" />
                    <span className="text-[10px] font-black">جاري الترجمة فوراً...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Copied Feedback banner inside frame */}
        <AnimatePresence>
          {isCopied && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="rounded-xl bg-green-50 border border-green-200 p-2.5 text-center text-xs font-bold text-green-700 flex items-center justify-center gap-1.5"
            >
              <Check size={14} className="text-green-600" />
              تم نسخ {copiedLabel} بنجاح إلى الحافظة! جاهز الآن للصق وتوليد الصورة.
            </motion.div>
          )}
        </AnimatePresence>

        {/* API Error banner if improvement fails */}
        <AnimatePresence>
          {apiError && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-center text-xs font-bold text-red-700"
            >
              ⚠️ {apiError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action button bar: Copy, AI Enhance, and Clear */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* AI Enhance Button */}
          <button
            onClick={handleEnhancePrompt}
            disabled={isEnhancing}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-700 text-white font-bold text-xs px-4 py-3.5 shadow-md active:scale-95 transition-all outline-none ${
              isEnhancing ? 'opacity-80 cursor-not-allowed' : 'hover:from-amber-700 hover:to-amber-800'
            }`}
          >
            {isEnhancing ? (
              <>
                <RefreshCw size={13} className="animate-spin text-white shrink-0" />
                <span className="truncate">جاري تحسين البرومبت...</span>
              </>
            ) : (
              <>
                <Sparkles size={13} className="text-amber-200 shrink-0" />
                <span className="truncate">تحسين البرومبت</span>
              </>
            )}
          </button>

          {/* Copy Original Button */}
          <button
            onClick={() => handleCopyCustom(promptText, 'النص الفعلي')}
            disabled={!promptText.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-natural-primary text-white font-bold text-xs px-4 py-3.5 shadow-md hover:bg-[#4A4A35] active:scale-95 transition-all outline-none disabled:opacity-50"
          >
            <Copy size={13} />
            <span className="truncate">نسخ النص الفعلي</span>
          </button>

          {/* Copy Translated Button */}
          <button
            onClick={() => handleCopyCustom(translatedPromptText, 'الترجمة')}
            disabled={!translatedPromptText.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-amber-50 text-amber-900 border border-amber-200 font-bold text-xs px-4 py-3.5 shadow-sm hover:bg-amber-100 active:scale-95 transition-all outline-none disabled:opacity-50"
          >
            <Copy size={13} />
            <span className="truncate">نسخ الترجمة اللحظية</span>
          </button>

          {/* Clear Button */}
          <button
            onClick={handleClearAll}
            className="flex-none flex items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-bold text-xs px-4 py-3.5 shadow-sm hover:bg-red-100 active:scale-95 transition-all outline-none shrink-0"
            title="مسح النص والخيارات"
          >
            <span className="truncate">مسح النص</span>
          </button>
        </div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
