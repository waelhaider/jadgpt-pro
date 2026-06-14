import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Copy, RefreshCw, Check, ArrowRight, UserPlus, Sliders, Eye, ChevronDown, Trash2 } from 'lucide-react';

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
  // Main open state for the builder options
  const [isOpen, setIsOpen] = useState(true);
  const [isAnimationDone, setIsAnimationDone] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      setIsAnimationDone(false);
    }
  }, [isOpen]);

  // Form selections states
  const [aspectRatio, setAspectRatio] = useState('حجم تلقائي');
  const [styleMode, setStyleMode] = useState('بدون نوع (يتبع البرومبت)');
  const [shotType, setShotType] = useState('بدون نوع (يتبع البرومبت)');
  const [gender, setGender] = useState('رجل');
  const [age, setAge] = useState('');
  const [pose, setPose] = useState('بدون نوع (يتبع البرومبت)');
  const [outfit, setOutfit] = useState('يرتدي قميصًا أبيض بأكمام قصيرة وتي شيرت جينز أزرق فاتح، وحذاء رياضي أبيض.');
  const [expression, setExpression] = useState('ابتسامة لطيفة على الوجه.');
  const [lighting, setLighting] = useState('ناعمة، عالية الجودة، واقعية');
  const [camera, setCamera] = useState(`إعدادات الكاميرا الاحترافية: عدسة مقاس 85 مم f/1.4، وحساسية ISO 100، وفتحة واسعة لخلفية غير واضحة قليلاً، وتركيز حاد للغاية على العينين. إضاءة الاستوديو مع ضوء أمامي ناعم أعلى بقليل من مستوى العين، مع الحد الأدنى من الحشو الجانبي للحفاظ على الظلال المذهلة والأجواء الدرامية. تكوين مركزي، وجمالية سينمائية، وافتتاحية متميزة للمجلات مثل Vogue/Harper's Bazaar، مع إحساس بالحضور والقوة الهادئة.`);

  // Generated Text State
  const [isCopied, setIsCopied] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Outfit category selection (men / women) matches the active gender
  const [outfitType, setOutfitType] = useState<'men' | 'women'>('men');

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
    const activeList = outfitType === 'men' ? menOutfits : womenOutfits;
    if (!activeList.includes(outfit)) {
      // Pick index 1 (the first actual style) if available, otherwise index 0
      setOutfit(activeList[1] || activeList[0]);
    }
  }, [outfitType]);

  // Formula generator based on user choices
  const getStructuredPrompt = () => {
    const displayShot = shotType === 'بدون نوع (يتبع البرومبت)' ? 'صورة' : shotType;
    const displayPose = pose === 'بدون نوع (يتبع البرومبت)' ? 'تلقائي (يتبع البرومبت الأصلي)' : pose;
    const displayStyle = styleMode === 'بدون نوع (يتبع البرومبت)' ? 'تلقائي (يتبع البرومبت الأصلي)' : styleMode;
    const displayOutfit = outfit === 'بدون نوع (يتبع البرومبت)' ? 'تلقائي (يتبع البرومبت الأصلي)' : outfit;
    const displayExpression = expression === 'بدون نوع (يتبع البرومبت)' ? 'تلقائي (يتبع البرومبت الأصلي)' : expression;
    const displayLighting = lighting === 'بدون نوع (يتبع البرومبت)' ? 'تلقائي (يتبع البرومبت الأصلي)' : lighting;
    const displayCamera = camera === 'بدون نوع (يتبع البرومبت)' ? 'تلقائي (يتبع البرومبت الأصلي)' : camera;

    let outfitPrefix = 'يرتدي الرجل';
    if (gender === 'رجل') outfitPrefix = 'يرتدي الرجل';
    else if (gender === 'امرأة') outfitPrefix = 'ترتدي المرأة';
    else if (gender === 'طفل') outfitPrefix = 'يرتدي الطفل';
    else if (gender === 'طفلة') outfitPrefix = 'ترتدي الطفلة';

    return `قم بإنشاء ${displayShot} لنفس الشخص، ${genderAgeText}، من الصور المرجعية التي تم تحميلها بدقة 100% ، مع الحفاظ على ملامح الوجه الحقيقي وتصفيفة الشعر ولون البشرة وهوية الجسم وبنية العظام بأقصى قدر من الدقة دون تغيير او تعديل.
الموضوع :${genderAgeText}.
الوضعية :${displayPose} .
نوع الجلسة والأجواء :${displayStyle}.
مقاس الصورة : ${aspectRatio}.
${outfitPrefix} :${displayOutfit}
التعبير :${displayExpression}
الاضاءة : ${displayLighting}.
الكاميرا : ${displayCamera}.`;
  };

  // Controlled textarea state
  const [promptText, setPromptText] = useState('');
  const [isCleared, setIsCleared] = useState(false);

  // Reset enhanced prompt and update textarea when any selection changes
  useEffect(() => {
    if (isCleared) {
      setIsCleared(false);
      return;
    }
    setPromptText(getStructuredPrompt());
    setEnhancedPrompt(null);
  }, [aspectRatio, styleMode, shotType, gender, age, pose, outfit, expression, lighting, camera]);

  // Handle Clipboard Copy
  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(promptText);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = promptText;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
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
      const response = await fetch('/api/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: originalPrompt }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'فشل الاتصال بخادم الذكاء الاصطناعي.');
      }

      if (data.enhancedText) {
        setEnhancedPrompt(data.enhancedText);
        setPromptText(data.enhancedText);
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
    setStyleMode('بدون نوع (يتبع البرومبت)');
    setShotType('بدون نوع (يتبع البرومبت)');
    setGender('رجل');
    setAge('');
    setPose('بدون نوع (يتبع البرومبت)');
    setOutfit('بدون نوع (يتبع البرومبت)');
    setExpression('بدون نوع (يتبع البرومبت)');
    setLighting('بدون نوع (يتبع البرومبت)');
    setCamera('بدون نوع (يتبع البرومبت)');
    setEnhancedPrompt(null);
    setPromptText('');
    setApiError(null);
    setOutfitType('men');
  };

  // Selection Arrays
  const aspectRatios = [
    'حجم تلقائي',
    'مربع (1:1)',
    'أفقي (16:9)',
    'طولي (9:16)',
    'شاشة (4:3)'
  ];

  const styles = [
    'بدون نوع (يتبع البرومبت)',
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
    'شاطئ وبحر الصيف المنعش بألوان زرقاء ساطعة وإضاءة شمس قوية',
    'سفر وسياحة ومغامرات بين الجبال الشاهقة أو المدن الأثرية',
    'رائد أعمال وشركات برمجية في بيئة عمل زجاجية حديثة',
    'طراز أولد موني الكلاسيكي الفاخر (ملابس راقية وهادئة كالبلايزر والقمصان الفاخرة)',
    'ألوان وحياة السايبربنك بإضاءة نيون زرقاء وقرمزية على ملامح الوجه',
    'فيلم تحقيق بوليسي غامض بتباين كلاسيكي وظلال من وراء الستائر',
    'رياضة وملاعب خارجية نشطة مليئة بالحيوية والنشاط الرياضي',
    'رسم زيتي فني كلاسيكي يدمج بين واقعية الوجه وجمال اللوحات المدهونة بالفرشاة',
    'زفاف وحفلات فخمة ملائمة لحضور المناسبات بإضاءة احتفالية دافئة',
    'جلسة التخرج الأكاديمي والاحتفال بالشهادة الجامعية',
    'أجواء الثلوج والشتاء وإحساس البرد الدافئ بالملابس الشتوية الأنيقة'
  ];

  const shotTypes = [
    'بدون نوع (يتبع البرومبت)',
    'صورة مقربة واقعية للغاية',
    'صورة واقعية للغاية',
    'صورة شخصية كاملة الطول مركزية بشكل متماثل',
    'صورة فنية لكامل الجسم',
    'لقطة كاملة فائقة الدقة',
    'لقطة متوسطة',
    'صورة واقعية فائقة الدقة في منتصف اللقطة',
    'صورة بورتريه ازياء استوديو.',
    'صورة سينمائية احترافية.',
    'صورة استوديو فائقة التصوير.',
    'صورة فوتوغرافية روائية سينمائية.',
    'صورة أبيض وأسود عالي التباين (B&W).',
    'صورة بدرجات رمادية ناعمة.',
    'لقطة من أعلى إلى أسفل.',
    'لقطة على مستوى العين.',
    'زاوية منخفضة.',
    'لقطة الملمس التفصيلية.',
    'زاوية ديناميكية 3/4.',
    'لقطة البطل (زاوية منخفضة قليلاً).',
    'جبهة متناظرة.',
    'عرض عين الدودة.',
    'لقطة ماكرو.',
    'الزاوية الهولندية.',
    'زاوية عالية.',
    'صورة فخمة فائقة الدقة وواقعية للغاية.',
    'جلسة تصوير افتتاحية لمجلة أزياء ذات أجواء جمالية وبسيطة ومتطورة.',
    'الرأس مائل قليلاً بزاوية ولكن أحافظ على التواصل البصري مع المشاهد.'
  ];

  const poses = [
    'بدون نوع (يتبع البرومبت)',
    'يجلس على طاولة خشبية ريفية',
    'يجلس على حافة النافذة (ضوء الصباح)',
    'وسط مناظر المدينة الحضرية (بوكيه)',
    'مع الأشكال الهندسية والظلال',
    'في خلفية مخملية فاخرة',
    'في الخلفية الخرسانية الصناعية',
    'على شاطئ رملي',
    'في غابة خضراء مورقة',
    'في الطبيعة (مع قطرات الندى).',
    'استوديو الحد الأدنى (خلفية متدرجة).',
    'إعداد Cyberpunk بإضاءة النيون.',
    'وهي تقف على درج كبير مغطى بالسجاد الأزرق، ويمكن رؤيتها من الخلف في دورة رشيقة بمقدار ثلاثة أرباع مع وضع يد واحدة على خصرها ورأسها ملتف قليلاً فوق كتفها.',
    'في وضعية إمالة الرأس قليلاً إلى الأسفل مع نظرة حالمة.',
    'ينحني بلطف.',
    'يقف واضعا يديه في جيوبه.',
    'يقف في منتصف طريق اسفلتي.',
    'يحمل أحد طرفي إيصال طويل للغاية ينتشر في جميع أنحاء الغرفة. يتم تجميد مئات الأوراق والوثائق في الهواء من حوله، وسط انفجار فوضوي للبيروقراطية.',
    'يجلس على كرسي خشبي مقلوب، داكن اللون، ويضع ذراعيه على مسند الظهر،ويداه في الوضع الطبيعي.',
    'يجلس الرجل بهدوء على كرسي عائم فاخر معلق في الهواء ،(لا توجد دعامات مرئية، تصميم واقعي تمامًا يتحدى الجاذبية،تصميم الكرسي:الحد الأدنى من العرش المستقبلي,هيكل أسود غير لامع مع حواف ذهبية أنيقة،مقعد جلد ناعم ،تشطيب فاخر ممتاز).',
    'يجلس بشكل أنيق على الحافة السفلية لإطار مستطيل كبير مزخرف بشكل مزخرف.',
    'في وضعيته مسترخية، ويداه في جيوبه ورأسه مائل قليلا إلى الأسفل، مما يجسد مشاعر الهدوء والتأمل.',
    'يتكئ بشكل عرضي على جدار كريمي اللون في ضوء الظهيرة الدافئ.',
    'يخرج بثقة من العالم الرقمي إلى الواقع حيث تحطم زجاج الهاتف بشظايا متوهجة.',
    'يقف بجوار نافذة زجاجية كبيرة، ويحدق في انعكاسه بحنان ورومانسية.',
    'يجلس على كرسي بذراعين عصري باللون البيج بأرجل خشبية.',
    'يقف في حديقة مشمسة بها أشجار الخريف.',
    'الأيدي مسترخية.',
    'يجلس بأناقة على الأرض.',
    'يجلس على الأريكة.'
  ];

  const menOutfits = [
    'بدون نوع (يتبع البرومبت)',
    ' قميصًا أبيض بأكمام قصيرة وتي شيرت جينز أزرق فاتح، وحذاء رياضي أبيض.',
    ' سترة جلدية سوداء وتي شيرت أبيض وبنطلون جينز أسود، وحذاء بوت أسود.',
    ' قميص بولو أبيض وبنزلون جينز أزرق، وحذاء لوفر بني.',
    ' تي شيرت رياضي أزرق وبنطلون رياضي أسود، وحذاء رياضي أسود.',
    ' سترة صوفية بيج وقميصًا أزرق فاتح وبنطلون جينز أزرق داكن، وحذاء بوت بني.',
    ' سترة بغطاء للرأس رمادية اللون وبنطلون رياضي أسود، وحذاء رياضي أسود.',
    ' قميص بولو أزرق داكن وجينز أزرق فاتح ، وحذاء رياضي أبيض.',
    'قميصًا أبيض بياقة مفتوحة وبنطلونًا صينيًا بنيًا، وحذاء لوفر بني.',
    'قميص حريري فيروزي وبنطال قماشي بيج.',
    'سترة بيضاء مصممة ،تحتها قميص بياقة لونه زهري(وردي) ، مفتوح الأزرار قليلاً من الأعلى، بنطال جينز أزرق مع حزام كحلي ببكلة فضية عصرية.',
    'بدلة سوداء ذات لمعة خفيفة جداً، وقميص رمادي فاتح، وربطة عنق سوداء ضيقة لإطلالة حادة "عصرية".',
    'قميصًا من الحرير الأبيض بأزرار، مفتوح قليلاً عند الصدر، ويكشف عن سلسلة فضية رفيعة، فوقها سترة مخملية غنية باللون العنابي ذات ملمس ناعم وفاخر.',
    'بدلة أنيقة باللونين العاجي والأسود مع ربطة عنق رفيعة ذهبية لامعة.',
    'سترة بيضاء مصممة ،تحتها قميص بياقة من الساتان الأسود ، مفتوح على شكل حرف V (مفتوح الأزرار، صدر مرئي)، بنطال أسود مع حزام أبيض ببكلة ذهبية.',
    'بدلة من الكتان الكامل بلون "السماوي الفاتح"، قميص أبيض مفتوح الأزرار، ومنديل جيب بنقشات زهرية ناعمة.',
    'جاكيت جلد "سويد" بلون بني جملي، فوق كنزة بياقة عالية (Turtleneck) بلون رمادي، وبنطال جينز غامق بقصة مستقيمة.',
    'سترة بليزر بلون "الأزرق الملكي" فوق قميص أسود بياقة مفتوحة، مع بنطال رمادي "شار كول" وحذاء لوفر أسود.',
    'تيشيرت "بولو" محبوك بلون البيج الكريمي، فوقه جاكيت خفيف بلون الزيتوني المطفي، مع بنطال أبيض وقماش قطني فاخر.',
    'قميص من الكتان الأبيض بياقة صينية، مع سترة (Blazer) غير مبطنة بلون رمادي فاتح، وبنطال "تشينو" بلون الكحلي الداكن.',
    'طقم "الإمبراطور": بدلة فاخرة بلون "البيج العاجي" بالكامل، صديرية مزدوجة الصدر بـ 8 أزرار، قميص أبيض ثلجي، وربطة عنق بلون "البرونز" الحريري لمظهر ملكي مبهر.',
    'بدلة باللون الرمادي الفحمي، مع سترة سوداء متباينة، وربطة عنق حريرية فضية، ودبوس ياقة بسلسلة ذهبية.',
    'جاكيت من المخمل العنابي بياقة "شال" سوداء، صديرية سوداء، وبنطال أسود، مع "ببيونة" مخملية سوداء.',
    
    'طقم كحلي داكن جداً (Midnight Blue)، صديرية مزدوجة الصدر (Double Breasted Vest) بياقة، قميص أبيض بياقة فرنسية، وأزرار أكمام فضية.',
    'طقم من 3 قطع بلون رمادي "كاروهات" خفيفة (Prince of Wales check)، صديرية بصف واحد من الأزرار، وربطة عنق كحلية.',
     'بدلة سوداء بلمعة خفيفة جداً، قميص رمادي فاتح، وربطة عنق سوداء رفيعة "Slim" لإطلالة "مودرن" حادة.',
     ' بدلة بلون البني التبغ (Tobacco Brown)، قميص أزرق فاتح، ومنديل جيب يجمع بين اللونين الأزرق والبرتقالي المحروق.',
     'بدلة بلون "الأخضر الغامق/الزيتي الفاخر"، قميص بلون الكريمي، وربطة عنق محبوكة (Knitted tie) باللون البني.',
     'بدلة ضيقة (Slim Fit) بلون أزرق "نيفي"، قميص أبيض بخطوط زرقاء دقيقة، وربطة عنق حريرية باللون العنابي.',
     'قميص أزرق الفاتح (Sky Blue)',
     'قميص "وردة الرمال" (Pale Pink).',
     'قميص بياقة بيضاء وجسم أزرق (Winchester Shirt).',     
     'بدلة بلون الرمادي المتوسط، ياقة الجاكيت عريضة قليلاً، قميص وردي فاتح جداً، وربطة عنق رمادية داكنة بنقشة "هيرينغ بون".',
     'قميصًا أسود عصريًا، وجينز رماديًا ناعمًا، وأحذية رياضية مكتنزة باللونين الرمادي والأبيض',
     'بدلة راقية ومتطورة من ثلاث قطع للرجال:السترة مصنوعة من اللون الأسود الفحمي مع طية صدر واسعة وفريدة من نوعها باللون الرمادي الفاتح المتباين،أسفلها صدرية مزدوجة الصدر باللون الرمادي الفاتح مع تصميم زر قطري غير متماثل مبتكر وطيات صدر رمادية متطابقة،مع بنطال ضيق باللون الرمادي الفاتح، ربطة عنق حريرية سوداء رفيعة مع مشبك ربطة عنق ذهبي بسيط ومربع جيب أبيض ناصع. ',
     'جمالية تنفيذية حديثة، نسيج فاخر، خياطة حادة.',
     'بدلة رمادية فاتحة مزدوجة الصدر بنمط غلين بلود،تبدو البدلة مصممة جيدًا وتناسب جسده بشكل وثيق، تتميز السترة بطية صدر عالية وما يبدو أنه ستة أزرار (أربعة وظيفية، واثنان مزخرفان)،تحتها قميصًا أبيضًا أنيقًا وربطة عنق منقوشة بظلال من اللون البني والأبيض/الذهبي، مما يضيف ملمسًا دافئًا ومتباينًا إلى البدلة الرمادية الرائعة، مع مربع جيب حريري منقوش، بني في المقام الأول وربما أحمر داكن أو كستنائي، مدسوس بدقة في جيب صدر السترة.',
     'سترة متماسكة كريم.',
     'بدلة عصرية باللون البيج الفاتح مع قميص بني تحتها وربطة عنق باللون البيج.',
     'جاكيت شتوي أبيض (puffer jacket)، تحته قميص او تيشيرت كحلي ، وبنطلون جينز ازرق ، وحذاء رياضيا ابيض ، وساعة يد بضاء ذكية.',
     'قميص رسمي أبيض مفتوح قليلاً من المنتصف، طية قماش طبيعية مع تجاعيد واقعية، أناقة حسية بدون ابتذال،أجواء تحريرية راقية.',
     'سترة جلدية داكنة، تظهر الياقة والكتفين، مما يضيف لمسة من الأسلوب الجريء والخالد إلى الصورة.',
     'بدلة مصممة باللون الأسود الداكن مع لمسات ذهبية رقيقة مع قميص حريري أسود بياقة مفتوحة تمثل الأناقة الحديثة الفاخرة.',
     'قميص كتان خفيف الوزن (أوف وايت)، وبنطلون بيج بكسرات.',
     'قميصًا من الكتان باللون الأبيض العاجي، مفكوكًا بعض الشيء، بأكمام مطوية، ومثبتًا في بنطال بيج عالي الخصر مثبتًا بحزام منسوج بني.',
     'سترة متماسكة مريحة باللون البيج.',
     'قميصًا أبيضًا كبيرًا عليه صورة كبيرة لـ Sailor Moon. طوق القميص أزرق.',
     'سترة سوداء وجينز، ونظارات مستديرة، وسماعات رأس حول الرقبة.',
     'ملابس عصرية ذات أنسجة نابضة بالحياة وانعكاسات ضوئية.',
     'بدلة مصممة باللون البيج، وربطة عنق باللون الأزرق الداكن، ومنديل جيب.',
     'سترة بحرية وقميصًا أبيض مفتوحًا، بدون ربطة عنق.',
     'سترة بيضاء.',
     'قميص قطني خفيف، كاجوال، أزرار مفتوحة عند الياقة.',
     'قميص رسمي خفيف مع بعض الأزرار مفتوحة.',
     '',

  ];

  const womenOutfits = [
    'بدون نوع (يتبع البرومبت)',
    'فستانًا منسدلًا باللونين الوردي الفاتح والأبيض الشفاف على طراز هانفو بأكمام مطرزة شفافة وزخارف نباتية وزخرفة ذهبية رقيقة وخط عنق منخفض؛ أضف قلادات ذهبية متعددة الطبقات، وقلادة ذهبية من الأزهار، وزخارف شعر متدلية باللونين الذهبي والوردي، وسلاسل من الخرز الكريستالي، وتسريحة محدثة متقنة مع خيوط طويلة داكنة المظهر مبللة تؤطر الوجه.',
    'ترتدي فستاناً صيفياً أنيقاً بنقشة الزهور مع صندل كلاسيكي ونظارة شمسية دائرية.',
    'ترتدي بدلة نسائية رسمية أنيقة باللون الكحلي مع قميص حريري أبيض وحذاء ذو كعب عالي.',
    'ترتدي سترة صوفية ناعمة بلون المشمش مع تنورة طويلة ميدي وبوت جلدي بني كلاسيكي.',
    'ترتدي بلوزة كلاسيكية من الدانتيل الأبيض مطرزة بحرفية عالية مع بنطال جينز أزرق عالي الخصر وجاكيت خفيف.',
    'ترتدي تي شيرت رياضي مريح بلون خوخي مع بنطال رياضي أسود ضيق وحذاء رياضي رمادي ذو تصميم حديث.'
  ];

  const expressions = [
    'بدون نوع (يتبع البرومبت)',
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
    'بدون نوع (يتبع البرومبت)',
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
    'بدون نوع (يتبع البرومبت)',
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
    <div className="mx-auto w-full max-w-xl pb-12 text-right" dir="rtl">
      {/* Top flashing glowing icon block */}
      <div className="my-6 flex flex-col items-center justify-center">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="relative group flex items-center justify-center h-16 w-16 rounded-full bg-natural-primary/10 border border-natural-primary/30 shadow-[0_0_15px_rgba(74,74,53,0.1)] transition-transform active:scale-95 duration-200"
          title="افتح / أغلق إعدادات صانع البرومبت"
        >
          {/* Animated pulsing outer rings */}
          <span className="absolute inline-flex h-full w-full rounded-full bg-natural-primary/20 opacity-75 animate-ping duration-1000" />
          <span className="absolute inline-flex h-4/5 w-4/5 rounded-full bg-natural-primary/10 opacity-50 animate-pulse duration-700" />
          
          <Sparkles className="relative text-natural-primary h-7 w-7 animate-pulse drop-shadow-[0_0_8px_rgba(74,74,53,0.5)]" />
        </button>
      
      
      </div>

      <AnimatePresence initial={false} mode="wait">
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onAnimationComplete={() => setIsAnimationDone(isOpen)}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={isOpen && isAnimationDone ? "relative z-30 overflow-visible" : "relative z-30 overflow-hidden"}
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
                label="نمط الصورة والأجواء"
                options={styles}
                value={styleMode}
                onChange={setStyleMode}
                zIndex={90}
              />

              {/* Option 4: Shot Type */}
              <CustomSelector
                label="نوع اللقطة والزاوية"
                options={shotTypes}
                value={shotType}
                onChange={setShotType}
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
                options={outfitType === 'men' ? menOutfits : womenOutfits}
                value={outfit}
                onChange={setOutfit}
                zIndex={60}
                labelComponent={
                  <div className="flex items-center justify-between mb-1.5 matches-label-direction">
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generated output box frame */}
      <div className="bg-[#4A4A35]/5 rounded-3xl border border-natural-border/60 p-5 mt-4 text-right flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black text-natural-muted tracking-widest uppercase">
            {enhancedPrompt ? '✨ البرومبت المحسن بالذكاء الاصطناعي' : ' البرومبت الجاهز للنسخ'}
          </span>
          {enhancedPrompt && (
            <button
              onClick={() => {
                setEnhancedPrompt(null);
                setPromptText(getStructuredPrompt());
              }}
              className="text-[10px] font-bold text-natural-primary hover:underline flex items-center gap-1"
            >
              <Eye size={11} />
              رؤية الهيكل الأصلي
            </button>
          )}
        </div>

        {/* Textbox container */}
        <div className="relative">
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="اكتب البرومبت هنا أو استخدم صانع البرومبت في الأعلى لإنشائه تلقائياً..."
            className="w-full h-56 text-right rounded-2xl border border-natural-border bg-white px-4 py-3.5 text-xs font-medium text-natural-text leading-relaxed tracking-wide resize-y focus:outline-none focus:ring-1 focus:ring-natural-primary shadow-inner"
            dir="rtl"
          />
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
              تم نسخ البرومبت بنجاح إلى الحافظة! جاهز الآن للصق وتوليد الصورة.
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
        <div className="flex flex-row gap-2">
          {/* AI Enhance Button */}
          <button
            onClick={handleEnhancePrompt}
            disabled={isEnhancing}
            className={`flex-[2] sm:flex-[3] flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-700 text-white font-bold text-[11px] sm:text-xs px-2.5 sm:px-4 py-3.5 shadow-md active:scale-95 transition-all outline-none ${
              isEnhancing ? 'opacity-80 cursor-not-allowed' : 'hover:from-amber-700 hover:to-amber-800'
            }`}
          >
            {isEnhancing ? (
              <>
                <RefreshCw size={13} className="animate-spin text-white shrink-0" />
                <span className="truncate">جاري التحسين...</span>
              </>
            ) : (
              <span className="truncate">تحسين البرومبت</span>
            )}
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="flex-[2] sm:flex-[3] flex items-center justify-center gap-1.5 rounded-2xl bg-natural-primary text-white font-bold text-[11px] sm:text-xs px-2.5 sm:px-4 py-3.5 shadow-md hover:bg-[#4A4A35] active:scale-95 transition-all outline-none"
          >
            <span className="truncate">نسخ البرومبت</span>
          </button>

          {/* Clear Button */}
          <button
            onClick={handleClearAll}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-bold text-[11px] sm:text-xs px-2 sm:px-4 py-3.5 shadow-sm hover:bg-red-100 active:scale-95 transition-all outline-none shrink-0"
            title="مسح النص والخيارات"
          >
            <span className="truncate">مسح النص</span>
          </button>
        </div>
      </div>
    </div>
  );
}
