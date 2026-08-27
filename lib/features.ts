export type FeatureStatus = 'available' | 'not_built' | 'unavailable';

export type Feature = {
  slug: string;
  name: string;
  category: 'Photo' | 'Video' | 'Design' | 'Utilities';
  emoji: string;
  gradient: string;
  href?: string; // only set when status === 'available'
  status: FeatureStatus;
  keywords: string[];
  /** Shown on the card and in search results when status !== 'available' */
  note?: string;
};

export const FEATURES: Feature[] = [
  {
    slug: 'background-remover',
    name: 'Remove Background',
    category: 'Photo',
    emoji: '✂️',
    gradient: 'linear-gradient(135deg,#6d5efc,#22d3c9)',
    href: '/tools/background-remover',
    status: 'available',
    keywords: ['background', 'remove background', 'cutout', 'transparent', 'bg']
  },
  {
    slug: 'text-to-image',
    name: 'Text to Image',
    category: 'Photo',
    emoji: '✨',
    gradient: 'linear-gradient(135deg,#ff6b8b,#a78bfa)',
    href: '/tools/text-to-image',
    status: 'available',
    keywords: ['text to image', 'generate image', 'ai image', 'prompt to image']
  },
  {
    slug: 'image-to-image',
    name: 'Image to Image',
    category: 'Photo',
    emoji: '🔁',
    gradient: 'linear-gradient(135deg,#22d3c9,#ffb86b)',
    href: '/tools/image-to-image',
    status: 'available',
    keywords: ['image to image', 'style transfer', 'edit with prompt', 'img2img']
  },
  {
    slug: 'upscaler',
    name: '4K / 8K Enhancer',
    category: 'Photo',
    emoji: '🔍',
    gradient: 'linear-gradient(135deg,#ff6b8b,#ffb86b)',
    href: '/tools/upscaler',
    status: 'available',
    keywords: ['4k', '8k', 'upscale', 'enhance', 'super resolution', 'resolution']
  },
  {
    slug: 'photo-editor',
    name: 'Photo Editor',
    category: 'Photo',
    emoji: '🎛️',
    gradient: 'linear-gradient(135deg,#3f4dd6,#22d3c9)',
    href: '/tools/photo-editor',
    status: 'available',
    keywords: ['crop', 'resize', 'rotate', 'flip', 'brightness', 'contrast', 'saturation', 'exposure', 'sharpen', 'blur', 'filters', 'editor']
  },
  {
    slug: 'image-converter',
    name: 'Image Converter',
    category: 'Utilities',
    emoji: '🔄',
    gradient: 'linear-gradient(135deg,#22d3c9,#6d5efc)',
    href: '/tools/image-converter',
    status: 'available',
    keywords: ['convert', 'jpg', 'png', 'webp', 'format', 'compress', 'compressor', 'resize', 'batch']
  },
  {
    slug: 'remove-object',
    name: 'Remove Object',
    category: 'Photo',
    emoji: '🩹',
    gradient: 'linear-gradient(135deg,#22d3c9,#3f4dd6)',
    status: 'not_built',
    keywords: ['remove object', 'inpaint', 'erase'],
    note: 'Needs a masking UI + inpainting model — not built yet'
  },
  {
    slug: 'restore-photo',
    name: 'Restore Photo',
    category: 'Photo',
    emoji: '🖼️',
    gradient: 'linear-gradient(135deg,#a78bfa,#6d5efc)',
    status: 'not_built',
    keywords: ['restore', 'old photo', 'scratch', 'damage', 'colorize'],
    note: 'Not built yet'
  },
  {
    slug: 'ai-portrait',
    name: 'AI Portrait',
    category: 'Photo',
    emoji: '🙂',
    gradient: 'linear-gradient(135deg,#ff6b8b,#6d5efc)',
    status: 'not_built',
    keywords: ['portrait', 'headshot', 'avatar'],
    note: 'Not built yet'
  },
  {
    slug: 'video-editor',
    name: 'Edit Video',
    category: 'Video',
    emoji: '🎬',
    gradient: 'linear-gradient(135deg,#3f4dd6,#22d3c9)',
    status: 'not_built',
    keywords: ['video', 'trim', 'cut', 'merge', 'edit video'],
    note: 'Not built yet'
  },
  {
    slug: 'video-upscaler',
    name: 'Video Upscaler',
    category: 'Video',
    emoji: '📈',
    gradient: 'linear-gradient(135deg,#ff6b8b,#6d5efc)',
    status: 'not_built',
    keywords: ['video upscale', 'enhance video'],
    note: 'Not built yet'
  },
  {
    slug: 'speech-to-text',
    name: 'Speech to Text',
    category: 'Video',
    emoji: '🎙️',
    gradient: 'linear-gradient(135deg,#a78bfa,#22d3c9)',
    status: 'not_built',
    keywords: ['speech to text', 'transcribe', 'subtitles', 'captions'],
    note: 'Not built yet'
  },
  {
    slug: 'design-editor',
    name: 'Create Design',
    category: 'Design',
    emoji: '🎨',
    gradient: 'linear-gradient(135deg,#ff6b8b,#a78bfa)',
    status: 'not_built',
    keywords: ['design', 'poster', 'banner', 'thumbnail', 'social post'],
    note: 'Not built yet'
  }
];

export function searchFeatures(query: string): Feature[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return FEATURES.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      f.keywords.some((k) => k.includes(q) || q.includes(k))
  );
}
