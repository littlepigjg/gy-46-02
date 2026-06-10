import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const TEST_IMG_DIR = path.resolve(process.cwd(), 'tests', 'images');

export function ensureTestDir() {
  if (!fs.existsSync(TEST_IMG_DIR)) {
    fs.mkdirSync(TEST_IMG_DIR, { recursive: true });
  }
  return TEST_IMG_DIR;
}

function createPng(width, height, fillColor = null) {
  const png = new PNG({ width, height, colorType: 6 });
  if (fillColor) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (width * y + x) * 4;
        png.data[i] = fillColor.r;
        png.data[i + 1] = fillColor.g;
        png.data[i + 2] = fillColor.b;
        png.data[i + 3] = 255;
      }
    }
  }
  return png;
}

function fillRect(png, x, y, w, h, color) {
  for (let j = y; j < Math.min(y + h, png.height); j++) {
    for (let i = x; i < Math.min(x + w, png.width); i++) {
      const idx = (png.width * j + i) * 4;
      png.data[idx] = color.r;
      png.data[idx + 1] = color.g;
      png.data[idx + 2] = color.b;
      png.data[idx + 3] = 255;
    }
  }
}

function drawPixel(png, x, y, color) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const i = (png.width * y + x) * 4;
  png.data[i] = color.r;
  png.data[i + 1] = color.g;
  png.data[i + 2] = color.b;
  png.data[i + 3] = 255;
}

function drawTextLines(png, startX, startY, lineHeight, lines, color) {
  let y = startY;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch !== ' ') {
        const charWidth = 8;
        const charHeight = lineHeight - 2;
        fillRect(png, startX + i * charWidth, y, charWidth - 2, charHeight, color);
      }
    }
    y += lineHeight;
  }
}

function addRandomNoise(png, count, colorRange = [[0, 255], [0, 255], [0, 255]]) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * png.width);
    const y = Math.floor(Math.random() * png.height);
    const r = colorRange[0][0] + Math.floor(Math.random() * (colorRange[0][1] - colorRange[0][0]));
    const g = colorRange[1][0] + Math.floor(Math.random() * (colorRange[1][1] - colorRange[1][0]));
    const b = colorRange[2][0] + Math.floor(Math.random() * (colorRange[2][1] - colorRange[2][0]));
    drawPixel(png, x, y, { r, g, b });
  }
}

function savePng(png, filePath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    png.pack().pipe(stream);
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

export async function generatePureWhitePage(width = 1920, height = 1080) {
  ensureTestDir();
  const png = createPng(width, height, { r: 255, g: 255, b: 255 });
  const out = path.join(TEST_IMG_DIR, 'pure_white.png');
  return savePng(png, out);
}

export async function generateWhiteWithColorNoise(width = 1920, height = 1080, noiseCount = 50) {
  ensureTestDir();
  const png = createPng(width, height, { r: 255, g: 255, b: 255 });
  addRandomNoise(png, noiseCount, [[0, 255], [0, 255], [0, 255]]);
  const out = path.join(TEST_IMG_DIR, `white_noise_${noiseCount}.png`);
  return savePng(png, out);
}

export async function generateNearWhiteBlankPage(width = 1920, height = 1080) {
  ensureTestDir();
  const png = createPng(width, height, { r: 248, g: 248, b: 248 });
  const out = path.join(TEST_IMG_DIR, 'near_white_blank.png');
  return savePng(png, out);
}

export async function generateDarkSimplePage(width = 1920, height = 1080) {
  ensureTestDir();
  const png = createPng(width, height, { r: 30, g: 30, b: 40 });
  fillRect(png, 100, 100, 300, 60, { r: 200, g: 200, b: 210 });
  const out = path.join(TEST_IMG_DIR, 'dark_simple.png');
  return savePng(png, out);
}

export async function generateNormalContentPage(width = 1920, height = 1080) {
  ensureTestDir();
  const png = createPng(width, height, { r: 255, g: 255, b: 255 });
  drawTextLines(png, 80, 100, 28, [
    'Welcome to Our Website',
    'This is a normal page with real content.',
    'There are multiple lines of text here.',
    'Header Navigation    About    Products    Contact',
    '',
    'Main Content Area:',
    '  - Feature One: Provides great value',
    '  - Feature Two: Solves your problems',
    '  - Feature Three: Easy to use'
  ], { r: 20, g: 20, b: 30 });
  fillRect(png, 80, 380, 600, 240, { r: 80, g: 130, b: 200 });
  fillRect(png, 120, 420, 120, 100, { r: 230, g: 240, b: 255 });
  fillRect(png, 280, 420, 120, 100, { r: 255, g: 230, b: 200 });
  fillRect(png, 440, 420, 120, 100, { r: 220, g: 255, b: 220 });
  const out = path.join(TEST_IMG_DIR, 'normal_content.png');
  return savePng(png, out);
}

export async function generateWhiteWithSmallLogo(width = 1920, height = 1080) {
  ensureTestDir();
  const png = createPng(width, height, { r: 255, g: 255, b: 255 });
  fillRect(png, 880, 500, 160, 80, { r: 50, g: 50, b: 150 });
  drawTextLines(png, 900, 520, 18, ['LOGO'], { r: 255, g: 255, b: 255 });
  const out = path.join(TEST_IMG_DIR, 'white_small_logo.png');
  return savePng(png, out);
}

export async function generateLoadingErrorPage(width = 1920, height = 1080) {
  ensureTestDir();
  const png = createPng(width, height, { r: 255, g: 255, b: 255 });
  drawTextLines(png, 750, 400, 32, [
    '404 Not Found',
    'The page you are looking for does not exist.',
    '',
    'Error Code: 404',
    'Please check the URL and try again.'
  ], { r: 180, g: 40, b: 40 });
  const out = path.join(TEST_IMG_DIR, 'error_404.png');
  return savePng(png, out);
}

export async function generateDarkMinimalistPage(width = 1920, height = 1080) {
  ensureTestDir();
  const png = createPng(width, height, { r: 18, g: 18, b: 24 });
  drawTextLines(png, 200, 500, 30, [
    'Minimalist',
    'Less is more.'
  ], { r: 230, g: 230, b: 235 });
  fillRect(png, 200, 600, 400, 4, { r: 120, g: 120, b: 160 });
  const out = path.join(TEST_IMG_DIR, 'dark_minimalist.png');
  return savePng(png, out);
}

export async function generateAllTestImages() {
  ensureTestDir();
  return {
    pureWhite: await generatePureWhitePage(),
    whiteWithNoise50: await generateWhiteWithColorNoise(1920, 1080, 50),
    whiteWithNoise200: await generateWhiteWithColorNoise(1920, 1080, 200),
    nearWhiteBlank: await generateNearWhiteBlankPage(),
    darkSimple: await generateDarkSimplePage(),
    normalContent: await generateNormalContentPage(),
    whiteWithSmallLogo: await generateWhiteWithSmallLogo(),
    error404: await generateLoadingErrorPage(),
    darkMinimalist: await generateDarkMinimalistPage()
  };
}

export const TEST_IMAGES_DIR = TEST_IMG_DIR;
export default {
  ensureTestDir,
  generatePureWhitePage,
  generateWhiteWithColorNoise,
  generateNearWhiteBlankPage,
  generateDarkSimplePage,
  generateNormalContentPage,
  generateWhiteWithSmallLogo,
  generateLoadingErrorPage,
  generateDarkMinimalistPage,
  generateAllTestImages,
  TEST_IMAGES_DIR
};
