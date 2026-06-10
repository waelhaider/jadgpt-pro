export interface ImageFile {
  base64: string;
  mimeType: string;
}

export interface StylePreset {
  id: string;
  label: string;
  prompt: string;
  negative?: string;
}