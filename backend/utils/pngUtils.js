import fs from 'fs';
import { PNG } from 'pngjs';

export function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (e) {
    return 0;
  }
}

export function decodePng(filePath) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(filePath)) {
        return reject(new Error(`文件不存在: ${filePath}`));
      }
      const buffer = fs.readFileSync(filePath);
      if (buffer.length < 8) {
        return reject(new Error('文件过小，不是有效的PNG'));
      }
      const signature = buffer.toString('ascii', 0, 8);
      if (signature !== '\x89PNG\r\n\x1a\n') {
        return reject(new Error('不是有效的PNG文件'));
      }

      const png = new PNG();
      png.on('error', (err) => reject(err));
      png.on('parsed', () => {
        resolve({ width: png.width, height: png.height, data: png.data, png });
      });
      png.parse(buffer);
    } catch (e) {
      reject(e);
    }
  });
}

export function samplePixels({ data, width, height, sampleStep = 20 }) {
  const stats = {
    totalSamples: 0,
    whitePixels: 0,
    nearWhitePixels: 0,
    nearBlackPixels: 0
  };
  const pixels = [];

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const offset = y * stride + x * bytesPerPixel;
      if (offset + 3 >= data.length) break;

      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];

      if (a < 10) continue;

      stats.totalSamples++;
      pixels.push({ r, g, b, a });

      if (r >= 250 && g >= 250 && b >= 250) {
        stats.whitePixels++;
      }
      if (r >= 240 && g >= 240 && b >= 240) {
        stats.nearWhitePixels++;
      }
      if (r <= 15 && g <= 15 && b <= 15) {
        stats.nearBlackPixels++;
      }
    }
  }

  return { ...stats, pixels };
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function variance(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const squaredDiffs = values.map((v) => {
    const d = v - mean;
    return d * d;
  });
  return Math.sqrt(squaredDiffs.reduce((s, v) => s + v, 0) / squaredDiffs.length);
}

export function analyzeColorDiversity(pixels) {
  if (pixels.length < 2) {
    return { uniqueRatio: 0, brightnessVariance: 0, avgDistance: 0 };
  }

  const rValues = pixels.map((p) => p.r);
  const gValues = pixels.map((p) => p.g);
  const bValues = pixels.map((p) => p.b);

  const rVar = variance(rValues);
  const gVar = variance(gValues);
  const bVar = variance(bValues);
  const brightnessVariance = (rVar + gVar + bVar) / 3;

  const colorBuckets = new Set();
  for (const p of pixels) {
    const key = `${Math.floor(p.r / 32)}_${Math.floor(p.g / 32)}_${Math.floor(p.b / 32)}`;
    colorBuckets.add(key);
  }
  const uniqueRatio = colorBuckets.size / Math.pow(8, 3);

  let totalDist = 0;
  let pairCount = 0;
  const sampleSize = Math.min(50, pixels.length);
  for (let i = 0; i < sampleSize; i++) {
    for (let j = i + 1; j < sampleSize; j++) {
      const a = pixels[i];
      const b = pixels[j];
      totalDist += colorDistance(a.r, a.g, a.b, b.r, b.g, b.b);
      pairCount++;
    }
  }
  const avgDistance = pairCount > 0 ? totalDist / pairCount : 0;

  return { uniqueRatio, brightnessVariance, avgDistance };
}

export async function calculateBlankRatio(filePath) {
  try {
    const { width, height, data } = await decodePng(filePath);
    const totalPixels = width * height;

    if (totalPixels < 1000) {
      return { blankRatio: 0.5, width, height, error: '图片过小' };
    }

    const step = Math.max(5, Math.floor(Math.sqrt(totalPixels) / 100));
    const stats = samplePixels({ data, width, height, sampleStep: step });

    if (stats.totalSamples < 10) {
      return { blankRatio: 0.5, width, height, error: '采样失败' };
    }

    const nearWhiteRatio = stats.nearWhitePixels / stats.totalSamples;
    const whiteRatio = stats.whitePixels / stats.totalSamples;

    const diversity = analyzeColorDiversity(stats.pixels);

    const lowDiversityPenalty = diversity.avgDistance < 20 ? 0.3 : 0;
    const variancePenalty = diversity.brightnessVariance < 10 ? 0.2 : 0;

    let blankRatio = Math.max(nearWhiteRatio, whiteRatio) + lowDiversityPenalty + variancePenalty;
    blankRatio = Math.min(1, blankRatio + (1 - diversity.uniqueRatio) * 0.4);

    return {
      blankRatio,
      width,
      height,
      totalSamples: stats.totalSamples,
      nearWhiteRatio,
      whiteRatio,
      uniqueColorRatio: diversity.uniqueRatio,
      brightnessVariance: diversity.brightnessVariance,
      avgColorDistance: diversity.avgDistance,
      nearBlackRatio: stats.nearBlackPixels / stats.totalSamples
    };
  } catch (e) {
    throw e;
  }
}

export function readPngDimensions(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 24) return { width: 0, height: 0 };
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  } catch (e) {
    return { width: 0, height: 0 };
  }
}
