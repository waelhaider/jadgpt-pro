import React, { useState, useRef, FormEvent } from 'react';
import { ImageFile, StylePreset } from './types';
import { STYLE_PRESETS } from './styles';
import { GoogleGenAI, Modality } from "@google/genai";
import JSZip from 'jszip';

const UploadIcon = () => (
    <svg className="w-8 h-8 mb-2 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
    </svg>
);

const LoadingSpinner = () => (
    <div className="flex flex-col items-center justify-center space-y-4">
        <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-lg text-gray-300">جاري إنشاء الصور... قد يستغرق هذا بعض الوقت.</p>
    </div>
);

function App() {
  const [personImage, setPersonImage] = useState<ImageFile | null>(null);
  const [age, setAge] = useState('');
  // Use the ID of the first preset as default
  const [styleId, setStyleId] = useState<string>(STYLE_PRESETS[0].id);
  const [numImages, setNumImages] = useState(1);
  const [extraNotes, setExtraNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Invalid file type. Please upload a JPEG, PNG, or WEBP image.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setPersonImage({ base64: base64String, mimeType: file.type });
        setError(null);
      };
      reader.onerror = () => {
        setError('Failed to read the image file.');
      };
      reader.readAsDataURL(file);
    }
  };

  const buildPrompt = (preset: StylePreset, userAge: string, notes: string): string => {
    return `Generate a cinematic ultra-realistic portrait of the person in the uploaded image.
    
    **CRITICAL INSTRUCTION: PRESERVE FACE IDENTITY 100%.** 
    The generated person MUST look exactly like the reference photo. 
    Target age: approx ${userAge} years old.

    **MANDATORY STYLE INSTRUCTION:**
    Apply ONLY the selected style '${preset.label}'. The outfit, location, background, and lighting must strictly follow this style. Do not mix styles.

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

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault();

    if (!personImage) {
      setError("الرجاء رفع صورة الشخص أولاً.");
      return;
    }
    if (!age.trim() || isNaN(Number(age))) {
      setError("الرجاء إدخال عمر صحيح.");
      return;
    }
    
    setIsLoading(true);
    setGeneratedImages([]);
    setError(null);

    const selectedPreset = STYLE_PRESETS.find(p => p.id === styleId) || STYLE_PRESETS[0];

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const newImages: string[] = [];
      const imagePromises = [];

      for (let i = 0; i < numImages; i++) {
        const textPrompt = buildPrompt(selectedPreset, age, extraNotes);

        const imagePart = {
          inlineData: {
            data: personImage.base64,
            mimeType: personImage.mimeType,
          },
        };
        const textPart = { text: textPrompt };
        
        const promise = ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, textPart] },
            config: {
              responseModalities: [Modality.IMAGE],
            },
          }).then(response => {
              for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                  const base64ImageBytes = part.inlineData.data;
                  const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
                  newImages.push(imageUrl);
                  setGeneratedImages(prev => [...prev, imageUrl]);
                  break;
                }
              }
          });
        imagePromises.push(promise);
      }
      await Promise.all(imagePromises);

    } catch (e: any) {
        console.error(e);
        setError(`An error occurred during image generation: ${e.message || 'Please check the console for details.'}`);
    } finally {
        setIsLoading(false);
        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
  };

  const downloadZip = (zipBlob: Blob) => {
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "generated_images.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadSingleImage = (url: string, index: number) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `image_${index}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadAll = async () => {
    if (generatedImages.length === 0) return;

    const zip = new JSZip();
    generatedImages.forEach((dataUrl, index) => {
      const base64Data = dataUrl.split(',')[1];
      zip.file(`image_${index + 1}.png`, base64Data, { base64: true });
    });

    try {
      const content = await zip.generateAsync({ type: 'blob' });
      downloadZip(content);
    } catch (e) {
      console.error("Error creating zip file", e);
      setError("Failed to create the zip file for download.");
    }
  };


  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 lg:p-8" dir="rtl">
      <main className="max-w-3xl mx-auto">
        <header className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                Adult Photo Session Generator
            </h1>
            <p className="mt-2 text-md text-gray-400">
                أنشئ صورًا احترافية باستخدام الذكاء الاصطناعي
            </p>
        </header>

        <div className="bg-gray-800/50 p-6 sm:p-8 rounded-2xl shadow-lg border border-gray-700">
          <form onSubmit={handleGenerate} className="flex flex-col space-y-6">
            
            {/* person_image */}
            <div>
              <label className="block text-lg font-medium mb-2 text-gray-200">صورة الشخص</label>
              <p className="text-sm text-gray-400 mb-2">ارفع صورة واضحة للوجه بدون فلاتر قوية.</p>
              <input
                id="file-upload"
                ref={fileInputRef}
                type="file"
                className="sr-only"
                onChange={handleFileChange}
                accept="image/png, image/jpeg, image/webp"
                disabled={isLoading}
              />
              <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="w-full p-4 text-center bg-gray-700/50 border-2 border-dashed border-gray-600 rounded-lg hover:bg-gray-700 hover:border-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {personImage ? (
                  <div className="flex items-center justify-center text-green-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span>تم رفع الصورة بنجاح!</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                      <UploadIcon />
                      <p className="text-sm text-gray-400"><span className="font-semibold">اضغط للرفع</span></p>
                  </div>
                )}
              </button>
            </div>

            {/* age */}
            <div>
              <label htmlFor="age" className="block text-lg font-medium mb-2 text-gray-200">العمر</label>
              <input
                id="age"
                type="text"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="مثال: 25"
                disabled={isLoading}
                className="w-full p-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 disabled:opacity-50"
              />
            </div>

            {/* style */}
            <div>
              <label htmlFor="style" className="block text-lg font-medium mb-2 text-gray-200">اختيار نوع الجلسة</label>
              <select
                id="style"
                value={styleId}
                onChange={(e) => setStyleId(e.target.value)}
                disabled={isLoading}
                className="w-full p-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 disabled:opacity-50"
              >
                {STYLE_PRESETS.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            {/* num_images */}
            <div>
                <label htmlFor="num_images" className="block text-lg font-medium mb-2 text-gray-200">
                    عدد الصور المطلوبة: <span className="font-bold text-purple-400">{numImages}</span>
                </label>
                <input
                    id="num_images"
                    type="range"
                    min="1"
                    max="10"
                    value={numImages}
                    onChange={(e) => setNumImages(Number(e.target.value))}
                    disabled={isLoading}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50"
                />
            </div>
            
            {/* extra_notes */}
            <div>
              <label htmlFor="extra_notes" className="block text-lg font-medium mb-2 text-gray-200">ملاحظات إضافية</label>
              <textarea
                id="extra_notes"
                value={extraNotes}
                onChange={(e) => setExtraNotes(e.target.value)}
                placeholder="الألوان، الملابس، الخلفية، التفاصيل..."
                disabled={isLoading}
                className="w-full h-28 p-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 resize-y disabled:opacity-50"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 text-lg font-bold rounded-lg transition-all duration-300 flex items-center justify-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading ? '...جاري الإنشاء' : 'إنشاء الصور'}
              </button>
            </div>

            {/* Error Display */}
            {error && !isLoading && (
              <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg" role="alert">
                <strong className="font-bold">خطأ: </strong>
                <span className="block sm:inline">{error}</span>
              </div>
            )}
          </form>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="mt-8">
            {isLoading && <LoadingSpinner />}
            {!isLoading && generatedImages.length > 0 && (
                <div className="bg-gray-800/50 p-4 sm:p-6 rounded-2xl shadow-lg border border-gray-700">
                    <h2 className="text-xl font-semibold mb-4 text-gray-200">الصور التي تم إنشاؤها</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {generatedImages.map((src, index) => (
                           <div key={index} className="relative group aspect-square rounded-lg overflow-hidden shadow-lg">
                                <img 
                                    src={src} 
                                    alt={`Generated image ${index + 1}`} 
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-300 flex items-center justify-center">
                                    <button
                                        onClick={() => downloadSingleImage(src, index + 1)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform group-hover:scale-100 scale-90 bg-white/80 hover:bg-white text-gray-900 font-bold py-2 px-4 rounded-lg backdrop-blur-sm"
                                    >
                                        تحميل
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 text-center">
                        <button
                            onClick={handleDownloadAll}
                            className="py-3 px-6 text-lg font-bold rounded-lg transition-all duration-300 flex items-center justify-center bg-green-600 hover:bg-green-700 text-white shadow-lg transform hover:scale-105"
                        >
                            تحميل جميع الصور دفعة واحدة
                        </button>
                    </div>
                </div>
            )}
        </div>
      </main>
    </div>
  );
}

export default App;