import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import { calculateBlankRatio } from './utils/pngUtils.js';
import blankPageCheck from './checks/blankPageCheck.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join(__dirname, '__test_images__');

const CONFIG = { blank_page_threshold: 0.95 };

function ensureTestDir() {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
}

function createPng(width, height, fillFn) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const [r, g, b, a] = fillFn(x, y, width, height);
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a !== undefined ? a : 255;
    }
  }
  return png;
}

function savePng(png, name) {
  const filePath = path.join(TEST_DIR, name);
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function solidFill(r, g, b) {
  return () => [r, g, b, 255];
}

function noiseOnBase(baseR, baseG, baseB, noiseProbability, noiseRange) {
  return (x, y, w, h) => {
    if (Math.random() < noiseProbability) {
      const nr = baseR + Math.floor((Math.random() - 0.5) * noiseRange);
      const ng = baseG + Math.floor((Math.random() - 0.5) * noiseRange);
      const nb = baseB + Math.floor((Math.random() - 0.5) * noiseRange);
      return [Math.max(0, Math.min(255, nr)), Math.max(0, Math.min(255, ng)), Math.max(0, Math.min(255, nb)), 255];
    }
    return [baseR, baseG, baseB, 255];
  };
}

function solidBackgroundWithContent(bgR, bgG, bgB, contentR, contentG, contentB, contentFraction) {
  return (x, y, w, h) => {
    const topContent = Math.floor(h * (1 - contentFraction));
    if (y >= topContent) {
      return [contentR, contentG, contentB, 255];
    }
    return [bgR, bgG, bgB, 255];
  };
}

function webpageSim(bgR, bgG, bgB) {
  return (x, y, w, h) => {
    if (y < 60) {
      return [50, 50, 50, 255];
    }
    if (y < 70) {
      return [bgR, bgG, bgB, 255];
    }
    if (x >= 100 && x <= w - 100 && y >= 100 && y <= 140) {
      return [30, 30, 30, 255];
    }
    if (x >= 100 && x <= w - 200 && y >= 160 && y <= 180) {
      return [100, 100, 100, 255];
    }
    if (x >= 100 && x <= w - 300 && y >= 200 && y <= 215) {
      return [120, 120, 120, 255];
    }
    if (x >= 100 && x <= w - 250 && y >= 235 && y <= 248) {
      return [110, 110, 110, 255];
    }
    if (x >= 100 && x <= 300 && y >= 280 && y <= 320) {
      return [66, 133, 244, 255];
    }
    if (x >= 50 && x <= w - 50 && y >= 360 && y <= h - 50) {
      if (y < 370 || y >= h - 60) return [200, 200, 200, 255];
      return [245, 245, 245, 255];
    }
    return [bgR, bgG, bgB, 255];
  };
}

function errorPageSim() {
  return (x, y, w, h) => {
    if (y >= h / 2 - 60 && y <= h / 2 - 30 && x >= w / 2 - 100 && x <= w / 2 + 100) {
      return [200, 50, 50, 255];
    }
    if (y >= h / 2 - 10 && y <= h / 2 + 10 && x >= w / 2 - 150 && x <= w / 2 + 150) {
      return [100, 100, 100, 255];
    }
    return [255, 255, 255, 255];
  };
}

const W = 400;
const H = 300;

const TEST_CASES = [
  {
    name: '01_pure_white.png',
    desc: '纯白页面（应该判定为空白）',
    expectBlank: true,
    fillFn: solidFill(255, 255, 255)
  },
  {
    name: '02_near_white_offwhite.png',
    desc: '近白色页面 RGB(248,248,248)（应该判定为空白）',
    expectBlank: true,
    fillFn: solidFill(248, 248, 248)
  },
  {
    name: '03_pure_light_gray.png',
    desc: '浅灰色页面 RGB(230,230,230)（应该判定为空白）',
    expectBlank: true,
    fillFn: solidFill(230, 230, 230)
  },
  {
    name: '04_pure_black.png',
    desc: '纯黑页面（加载失败的空白页，应该判定为空白）',
    expectBlank: true,
    fillFn: solidFill(0, 0, 0)
  },
  {
    name: '05_pure_blue_bg.png',
    desc: '纯蓝色背景页面（没有内容，应该判定为空白）',
    expectBlank: true,
    fillFn: solidFill(66, 133, 244)
  },
  {
    name: '06_white_with_sparse_noise.png',
    desc: '白底上少量随机噪声点（噪声<3%，应该判定为空白）',
    expectBlank: true,
    fillFn: noiseOnBase(255, 255, 255, 0.02, 200)
  },
  {
    name: '07_white_with_colorful_noise.png',
    desc: '白底上散落彩色噪点（噪点5%，但仍无真实内容，应该判定为空白）',
    expectBlank: true,
    fillFn: noiseOnBase(255, 255, 255, 0.05, 255)
  },
  {
    name: '08_blue_bg_with_sparse_noise.png',
    desc: '蓝色背景加少量噪声（应该判定为空白）',
    expectBlank: true,
    fillFn: noiseOnBase(66, 133, 244, 0.02, 100)
  },
  {
    name: '09_gray_bg_sparse_noise.png',
    desc: '灰色背景加少量噪声（应该判定为空白）',
    expectBlank: true,
    fillFn: noiseOnBase(128, 128, 128, 0.02, 80)
  },
  {
    name: '10_dark_bg_sparse_noise.png',
    desc: '深色背景加少量噪声（加载失败场景，应该判定为空白）',
    expectBlank: true,
    fillFn: noiseOnBase(30, 30, 30, 0.01, 60)
  },
  {
    name: '11_normal_webpage_white_bg.png',
    desc: '正常网页-白底有导航/标题/正文/按钮（不应该判定为空白）',
    expectBlank: false,
    fillFn: webpageSim(255, 255, 255)
  },
  {
    name: '12_normal_webpage_blue_bg.png',
    desc: '正常网页-蓝色底有导航/标题/正文/按钮（不应该判定为空白）',
    expectBlank: false,
    fillFn: webpageSim(66, 133, 244)
  },
  {
    name: '13_normal_webpage_gray_bg.png',
    desc: '正常网页-灰色底有内容（不应该判定为空白）',
    expectBlank: false,
    fillFn: webpageSim(240, 240, 240)
  },
  {
    name: '14_simple_landing_blue_bg.png',
    desc: '简单着陆页-蓝色背景+白色标题+按钮（不应该判定为空白）',
    expectBlank: false,
    fillFn: solidBackgroundWithContent(66, 133, 244, 255, 255, 255, 0.15)
  },
  {
    name: '15_error_page.png',
    desc: '错误页面-白底+红色错误标题+灰色副文本（不应该判定为空白）',
    expectBlank: false,
    fillFn: errorPageSim()
  },
  {
    name: '16_minimal_content.png',
    desc: '最少内容-白底中央一个蓝色小按钮（不应该判定为空白）',
    expectBlank: false,
    fillFn: (x, y, w, h) => {
      const cx = w / 2, cy = h / 2;
      if (Math.abs(x - cx) < 60 && Math.abs(y - cy) < 20) {
        return [66, 133, 244, 255];
      }
      return [255, 255, 255, 255];
    }
  },
  {
    name: '17_gradient_page.png',
    desc: '渐变页面（有颜色变化但无实际内容，应该判定为空白）',
    expectBlank: true,
    fillFn: (x, y, w, h) => {
      const r = Math.floor(200 + (x / w) * 55);
      const g = Math.floor(200 + (y / h) * 55);
      return [r, g, 240, 255];
    }
  },
  {
    name: '18_white_bg_text_block.png',
    desc: '白底+大段文字区域（不应该判定为空白）',
    expectBlank: false,
    fillFn: (x, y, w, h) => {
      if (y >= 50 && y <= 250 && x >= 50 && x <= 350) {
        const line = Math.floor(y / 4) % 2;
        if (line === 0) return [30, 30, 30, 255];
        return [255, 255, 255, 255];
      }
      return [255, 255, 255, 255];
    }
  }
];

async function runTests() {
  ensureTestDir();

  console.log('='.repeat(80));
  console.log('空白页检测算法测试');
  console.log('='.repeat(80));
  console.log(`测试图片目录: ${TEST_DIR}`);
  console.log(`测试图片尺寸: ${W}x${H}`);
  console.log(`空白阈值: ${CONFIG.blank_page_threshold}`);
  console.log('');

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const tc of TEST_CASES) {
    const png = createPng(W, H, tc.fillFn);
    const filePath = savePng(png, tc.name);

    try {
      const info = await calculateBlankRatio(filePath);
      const checkResult = await blankPageCheck.run(filePath, CONFIG);
      const isBlank = checkResult.passed === 0;
      const correct = isBlank === tc.expectBlank;

      if (correct) passed++;
      else failed++;

      const status = correct ? '✅ PASS' : '❌ FAIL';
      const blankLabel = isBlank ? '空白' : '非空白';
      const expectLabel = tc.expectBlank ? '应为空白' : '应为非空白';

      console.log(`${status} | ${tc.name}`);
      console.log(`       ${tc.desc}`);
      console.log(`       判定: ${blankLabel} | 期望: ${expectLabel} | 空白比: ${info.blankRatio.toFixed(4)}`);
      console.log(`       主色覆盖率: ${(info.dominantCoverage * 100).toFixed(1)}% | 内容比例: ${(info.contentRatio * 100).toFixed(2)}% | 边缘密度: ${(info.edgeDensity * 100).toFixed(2)}%`);
      if (info.dominantColor) {
        const dc = info.dominantColor;
        console.log(`       主色: RGB(${dc.r}, ${dc.g}, ${dc.b}) | 近白比: ${(info.nearWhiteRatio * 100).toFixed(1)}% | 近黑比: ${(info.nearBlackRatio * 100).toFixed(1)}%`);
      }
      console.log('');

      results.push({
        name: tc.name,
        desc: tc.desc,
        expectBlank: tc.expectBlank,
        isBlank,
        correct,
        blankRatio: info.blankRatio,
        dominantCoverage: info.dominantCoverage,
        contentRatio: info.contentRatio,
        edgeDensity: info.edgeDensity
      });
    } catch (e) {
      failed++;
      console.log(`❌ ERROR | ${tc.name}`);
      console.log(`       ${e.message}`);
      console.log('');
      results.push({
        name: tc.name,
        desc: tc.desc,
        expectBlank: tc.expectBlank,
        isBlank: null,
        correct: false,
        error: e.message
      });
    }
  }

  console.log('='.repeat(80));
  console.log(`测试结果: ${passed} 通过 / ${failed} 失败 / ${TEST_CASES.length} 总计`);
  console.log('='.repeat(80));

  if (failed > 0) {
    console.log('');
    console.log('失败用例详情:');
    for (const r of results) {
      if (!r.correct) {
        console.log(`  - ${r.name}: 判定=${r.isBlank ? '空白' : '非空白'}, 期望=${r.expectBlank ? '空白' : '非空白'}, 空白比=${r.blankRatio?.toFixed(4)}`);
      }
    }
  }

  const reportPath = path.join(TEST_DIR, 'test_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n测试报告已保存: ${reportPath}`);

  return failed === 0;
}

runTests()
  .then((ok) => {
    process.exit(ok ? 0 : 1);
  })
  .catch((e) => {
    console.error('测试运行出错:', e);
    process.exit(1);
  });
