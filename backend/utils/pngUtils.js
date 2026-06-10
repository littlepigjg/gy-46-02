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
      const expectedSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (buffer.slice(0, 8).compare(expectedSig) !== 0) {
        const hexSig = buffer.slice(0, 8).toString('hex');
        return reject(new Error(`不是有效的PNG文件: filePath=${filePath}, size=${buffer.length}, sigHex=${hexSig}`));
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
    nearBlackPixels: 0,
    brightnessSum: 0
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
      const brightness = (r + g + b) / 3;
      stats.brightnessSum += brightness;
      pixels.push({ r, g, b, a, brightness });

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

function findDominantColor(pixels) {
  const buckets = new Map();
  for (const p of pixels) {
    const key = `${Math.floor(p.r / 32)}_${Math.floor(p.g / 32)}_${Math.floor(p.b / 32)}`;
    const entry = buckets.get(key) || { count: 0, rSum: 0, gSum: 0, bSum: 0 };
    entry.count++;
    entry.rSum += p.r;
    entry.gSum += p.g;
    entry.bSum += p.b;
    buckets.set(key, entry);
  }

  let dominant = null;
  let maxCount = 0;
  for (const [, entry] of buckets) {
    if (entry.count > maxCount) {
      maxCount = entry.count;
      dominant = {
        r: Math.round(entry.rSum / entry.count),
        g: Math.round(entry.gSum / entry.count),
        b: Math.round(entry.bSum / entry.count),
        count: entry.count
      };
    }
  }

  return dominant;
}

function computeDominantCoverage(pixels, dominantColor, tolerance = 50) {
  if (!dominantColor) return 0;
  let matchCount = 0;
  for (const p of pixels) {
    const dr = p.r - dominantColor.r;
    const dg = p.g - dominantColor.g;
    const db = p.b - dominantColor.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= tolerance) matchCount++;
  }
  return matchCount / pixels.length;
}

function computeEdgeDensity(pixels, width, height, sampleStep) {
  if (pixels.length < 10) return 0;

  const grid = [];
  let idx = 0;
  const cols = Math.ceil(width / sampleStep);
  for (let y = 0; y < height; y += sampleStep) {
    const row = [];
    for (let x = 0; x < width; x += sampleStep) {
      if (idx < pixels.length) {
        row.push(pixels[idx]);
      }
      idx++;
    }
    grid.push(row);
  }

  let edgeCount = 0;
  let pairCount = 0;
  const edgeThreshold = 60;

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const p = grid[y][x];
      if (!p) continue;

      if (x + 1 < grid[y].length && grid[y][x + 1]) {
        const q = grid[y][x + 1];
        const dr = p.r - q.r;
        const dg = p.g - q.g;
        const db = p.b - q.b;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist > edgeThreshold) edgeCount++;
        pairCount++;
      }

      if (y + 1 < grid.length && grid[y + 1][x]) {
        const q = grid[y + 1][x];
        const dr = p.r - q.r;
        const dg = p.g - q.g;
        const db = p.b - q.b;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist > edgeThreshold) edgeCount++;
        pairCount++;
      }
    }
  }

  return pairCount > 0 ? edgeCount / pairCount : 0;
}

function computeContentRatio(pixels, dominantColor) {
  if (!dominantColor || pixels.length < 10) return 0;

  let contentCount = 0;
  const bgThreshold = 80;

  for (const p of pixels) {
    const dr = p.r - dominantColor.r;
    const dg = p.g - dominantColor.g;
    const db = p.b - dominantColor.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist > bgThreshold) contentCount++;
  }

  return contentCount / pixels.length;
}

export async function calculateBlankRatio(filePath) {
  try {
    const { width, height, data } = await decodePng(filePath);
    const totalPixels = width * height;

    if (totalPixels < 1000) {
      return { blankRatio: 0.5, width, height, error: '图片过小' };
    }

    const step = Math.max(2, Math.floor(Math.sqrt(totalPixels) / 400));
    const stats = samplePixels({ data, width, height, sampleStep: step });

    if (stats.totalSamples < 50) {
      return { blankRatio: 0.5, width, height, error: '采样失败' };
    }

    const avgBrightness = stats.brightnessSum / stats.totalSamples;
    const nearWhiteRatio = stats.nearWhitePixels / stats.totalSamples;
    const whiteRatio = stats.whitePixels / stats.totalSamples;
    const nearBlackRatio = stats.nearBlackPixels / stats.totalSamples;

    const dominantColor = findDominantColor(stats.pixels);
    const dominantCoverage = computeDominantCoverage(stats.pixels, dominantColor, 50);
    const contentRatio = computeContentRatio(stats.pixels, dominantColor);
    const edgeDensity = computeEdgeDensity(stats.pixels, width, height, step);

    const isDominantLight = dominantColor && (dominantColor.r + dominantColor.g + dominantColor.b) / 3 >= 200;
    const isDominantMidGray = dominantColor && !isDominantLight && (dominantColor.r + dominantColor.g + dominantColor.b) / 3 >= 80;

    let blankRatio = 0;

    if (dominantCoverage >= 0.95 && contentRatio < 0.03) {
      const effectiveEdge = edgeDensity * (contentRatio / 0.03);
      const edgePenalty = effectiveEdge < 0.01 ? 0 : Math.min(0.1, effectiveEdge * 3);
      blankRatio = Math.max(0.95, 1.0 - edgePenalty);
    } else if (dominantCoverage >= 0.95 && contentRatio >= 0.03 && contentRatio < 0.06 && edgeDensity < 0.02) {
      const contentPenalty = (contentRatio - 0.03) / 0.03 * 0.15;
      blankRatio = Math.max(0.80, 0.95 - contentPenalty);
    } else if (dominantCoverage >= 0.90 && contentRatio < 0.03 && edgeDensity < 0.02) {
      const effectiveEdge = edgeDensity * (contentRatio / 0.03);
      const edgePenalty = effectiveEdge < 0.01 ? 0 : Math.min(0.15, effectiveEdge * 4);
      blankRatio = Math.max(0.85, 0.95 - edgePenalty);
    } else if (dominantCoverage >= 0.85 && contentRatio < 0.05) {
      const edgePenalty = edgeDensity < 0.03 ? 0 : Math.min(0.3, edgeDensity * 5);
      const lightBonus = isDominantLight ? 0.1 : 0;
      blankRatio = Math.max(0.55, 0.7 + lightBonus - edgePenalty);
    } else if (isDominantLight && nearWhiteRatio >= 0.90 && contentRatio < 0.03 && edgeDensity < 0.05) {
      blankRatio = nearWhiteRatio - edgeDensity * 2;
    } else if (isDominantLight && nearWhiteRatio >= 0.80 && contentRatio < 0.05 && edgeDensity < 0.05) {
      blankRatio = nearWhiteRatio * 0.85;
    } else if (isDominantLight && nearWhiteRatio >= 0.70 && contentRatio < 0.08 && edgeDensity < 0.05) {
      blankRatio = nearWhiteRatio * 0.6;
    } else if (nearBlackRatio > 0.95 && contentRatio < 0.02) {
      blankRatio = nearBlackRatio * 0.9;
    } else {
      const dominantWeight = dominantCoverage * 0.25;
      const contentWeight = Math.max(0, (1 - contentRatio * 12)) * 0.35;
      const edgeWeight = Math.max(0, (1 - edgeDensity * 15)) * 0.2;
      const nearWhiteWeight = isDominantLight ? nearWhiteRatio * 0.2 : 0;
      blankRatio = dominantWeight + contentWeight + edgeWeight + nearWhiteWeight;
    }

    blankRatio = Math.max(0, Math.min(1, blankRatio));

    const dominantRgb = dominantColor
      ? { r: dominantColor.r, g: dominantColor.g, b: dominantColor.b, count: dominantColor.count }
      : null;

    return {
      blankRatio,
      width,
      height,
      totalSamples: stats.totalSamples,
      avgBrightness,
      nearWhiteRatio,
      whiteRatio,
      nearBlackRatio,
      dominantColor: dominantRgb,
      dominantCoverage,
      contentRatio,
      edgeDensity,
      isDominantLight,
      isDominantMidGray
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
