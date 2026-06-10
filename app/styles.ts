import { StylePreset } from './types';

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "cinematic_portrait",
    label: "Cinematic Portrait",
    prompt: "Outfit: Textured, high-quality cinematic wardrobe fitting a movie poster aesthetic. Location/Background: Blurred cinematic scene with atmospheric depth and bokeh. Lighting/Color: Dramatic chiaroscuro lighting, rich slightly desaturated color grade, 85mm f/1.8 look.",
  },
  {
    id: "business_professional",
    label: "Business Professional",
    prompt: "Outfit: High-end tailored business suit or blazer with crisp shirt. Location/Background: Modern blurred corporate office or clean textured studio backdrop. Lighting/Color: Professional studio lighting, even and trustworthy, neutral color temperature.",
  },
  {
    id: "fashion_editorial",
    label: "Fashion Editorial",
    prompt: "Outfit: Avant-garde or trendy fashion editorial clothing with high-end fabrics. Location/Background: Minimalist architectural space or solid studio color. Lighting/Color: Bold, defined lighting (beauty dish or hard light), high-contrast fashion color grade.",
  },
  {
    id: "outdoor_natural",
    label: "Outdoor Natural",
    prompt: "Outfit: Casual, comfortable, and textured everyday clothing (layers, cotton, wool). Location/Background: Softly blurred park, garden, or nature scene with green bokeh. Lighting/Color: Soft diffused natural sunlight (open shade), fresh and airy organic tones.",
  },
  {
    id: "dark_moody_studio",
    label: "Dark Moody Studio",
    prompt: "Outfit: Dark, solid-colored clothing (black, charcoal, navy) with texture. Location/Background: Pure black or very dark grey studio background. Lighting/Color: Low-key Rembrandt lighting, deep shadows, moody and emotional atmosphere.",
  },
  {
    id: "egyptian_classic",
    label: "Egyptian Classic Portrait",
    prompt: "Outfit: Modern elegant clothing with subtle cultural hints or classic tones. Location/Background: Abstract warm background hinting at desert sunset or classic architecture (very blurred). Lighting/Color: Warm golden earth tones, dignified and timeless lighting.",
  },
  {
    id: "fitness_gym",
    label: "Fitness Gym",
    prompt: "Outfit: Premium athletic wear or sportswear showing physique. Location/Background: Blurred high-end gym environment with equipment in background. Lighting/Color: Dynamic, slightly gritty lighting to highlight muscle definition, cool gym tones.",
  },
  {
    id: "glamour_beauty",
    label: "Glamour Beauty",
    prompt: "Outfit: Elegant evening wear or beauty-focused styling (bare shoulders or jewelry). Location/Background: Soft glitzy bokeh or smooth studio gradient. Lighting/Color: Butterfly/Clamshell beauty lighting, shadowless face, soft glamorous glow.",
  },
  {
    id: "clean_studio_headshot",
    label: "Clean Studio Headshot",
    prompt: "Outfit: Smart casual neutral clothing (plain t-shirt, crisp shirt, no busy patterns). Location/Background: Seamless light gray or pure white background. Lighting/Color: High-key softbox lighting, very even, flattering, and clean commercial look.",
  },
  {
    id: "minimal_white_bg",
    label: "Minimal White Background",
    prompt: "Outfit: Simple, clean, solid-colored clothing that contrasts with white. Location/Background: Pure white seamless void. Lighting/Color: Soft diffused shadows, crisp high-contrast subject against white, ultra-minimalist.",
  },
  {
    id: "golden_hour",
    label: "Golden Hour Sunset",
    prompt: "Outfit: Summer or autumn casual clothing with warm tones. Location/Background: Outdoor open field or horizon at sunset. Lighting/Color: Strong warm backlight (sun flare/rim light) creating a halo, golden orange aesthetic.",
  },
  {
    id: "bw_classic",
    label: "Black & White Classic",
    prompt: "Outfit: Timeless clothing with good texture contrast (knits, leather, crisp collars). Location/Background: Simple studio or blurred texture. Lighting/Color: True Monochrome (Black & White), high contrast, classic film grain structure.",
    negative: "color, saturation, rainbow, sepia",
  },
  {
    id: "vintage_film_35mm",
    label: "Vintage Film 35mm",
    prompt: "Outfit: Vintage-inspired or timeless casual clothing. Location/Background: Unposed, candid real-world setting. Lighting/Color: Analog film look, Kodak Portra colors, slight halation, visible film grain, nostalgic vibe.",
  },
  {
    id: "streetwear_urban",
    label: "Streetwear Urban",
    prompt: "Outfit: Trendy streetwear (hoodie, denim jacket, layered street style). Location/Background: Gritty city street, concrete walls, or urban alleyway. Lighting/Color: Natural city light, cool urban tones, slightly desaturated and edgy.",
  },
  {
    id: "casual_lifestyle",
    label: "Casual Lifestyle",
    prompt: "Outfit: Comfortable home attire (sweater, loose shirt). Location/Background: Cozy blurred living room or bedroom setting. Lighting/Color: Natural window light coming from side, warm and authentic home atmosphere.",
  },
  {
    id: "luxury_hotel_lobby",
    label: "Luxury Hotel Lobby",
    prompt: "Outfit: Elegant business casual or cocktail attire. Location/Background: Blurred 5-star hotel lobby with chandeliers and warm architectural details. Lighting/Color: Warm ambient luxury lighting, gold and beige tones, sophisticated bokeh.",
  },
  {
    id: "coffee_shop_cozy",
    label: "Coffee Shop Cozy",
    prompt: "Outfit: Fall/Winter casual (scarf, coat, knitwear). Location/Background: Blurred coffee shop interior with wood textures and warm lights. Lighting/Color: Ambient café lighting, warm brownish tones, intimate and candid.",
  },
  {
    id: "beach_summer",
    label: "Beach Summer Vibes",
    prompt: "Outfit: Light linen shirt, summer dress, or swimwear. Location/Background: Bright sandy beach with blue sky and ocean. Lighting/Color: Bright natural sunlight, high exposure, airy pastel and blue tones, cheerful.",
  },
  {
    id: "travel_adventure",
    label: "Travel Adventure",
    prompt: "Outfit: Practical travel jacket, cargo style, or outdoor gear. Location/Background: Blurred epic landscape (mountains or historic city). Lighting/Color: Natural outdoor light, documentary style, adventurous and realistic colors.",
  },
  {
    id: "tech_startup",
    label: "Tech Startup Headshot",
    prompt: "Outfit: Casual tech industry attire (hoodie, t-shirt, open button-down). Location/Background: Blurred modern open-plan office with glass and daylight. Lighting/Color: Bright, friendly, modern office lighting, approachable and innovative vibe.",
  },
  {
    id: "old_money",
    label: "Old Money Aesthetic",
    prompt: "Outfit: Classic tailored luxury (polo, cable knit, linen, navy blazer). Location/Background: Manicured garden, tennis court, or country club estate. Lighting/Color: Soft natural daylight, rich but muted palette (cream, navy, green), expensive feel.",
  },
  {
    id: "cyberpunk_neon",
    label: "Cyberpunk Neon",
    prompt: "Outfit: Tech-wear, leather jacket, or futuristic street fashion. Location/Background: Dark city night with out-of-focus neon signs. Lighting/Color: Magenta and Cyan rim lighting on edges, but face skin tone remains realistic. High contrast night look.",
  },
  {
    id: "noir_detective",
    label: "Noir Detective",
    prompt: "Outfit: Trench coat, fedora (optional), or sharp 1940s suit. Location/Background: Dark shadowy room with blinds or misty night street. Lighting/Color: High contrast Film Noir B&W (or extremely desaturated), hard shadows, dramatic rim light.",
    negative: "bright colors, cheerful",
  },
  {
    id: "sports_outdoor",
    label: "Sports Outdoor",
    prompt: "Outfit: Athletic jersey, running gear, or training outfit. Location/Background: Blurred stadium, track, or playing field. Lighting/Color: Bright dynamic sunlight, energetic contrast, sharp focus on action/portrait.",
  },
  {
    id: "artistic_painterly",
    label: "Artistic Painterly",
    prompt: "Outfit: Classic or textured clothing that catches light well. Location/Background: Abstract painterly background. Lighting/Color: Semi-realistic oil painting aesthetic, soft brush strokes, rich classical colors, but face remains photorealistic.",
    negative: "cartoon, anime, vector art, distorted face",
  },
  {
    id: "wedding_guest",
    label: "Wedding Guest Elegant",
    prompt: "Outfit: Formal suit or elegant cocktail dress. Location/Background: Blurred wedding reception venue with warm fairy lights (bokeh). Lighting/Color: Warm, celebratory, polished event lighting, romantic atmosphere.",
  },
  {
    id: "graduation",
    label: "Graduation Portrait",
    prompt: "Outfit: Smart formal clothes (optional graduation gown/sash). Location/Background: Blurred university campus or greenery. Lighting/Color: Bright, happy, celebratory daylight, vibrant and clear colors.",
  },
  {
    id: "winter_snow",
    label: "Winter Snow Scene",
    prompt: "Outfit: Stylish winter coat, scarf, gloves. Location/Background: Outdoor snowy street or forest with white snow bokeh. Lighting/Color: Cool winter tones (whites, blues), soft overcast diffused light, cozy cold feel.",
  },
];
