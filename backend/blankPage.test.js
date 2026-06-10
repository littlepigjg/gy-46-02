import assert from 'assert';
import { generateAllTestImages, TEST_IMAGES_DIR } from './utils/testImageGenerator.js';
import { calculateBlankRatio } from './utils/pngUtils.js';
import { run as blankPageCheck } from './checks/blankPageCheck.js';
import { DEFAULT_CONFIG } from './qualityAnalyzer.js';

const BLANK_THRESHOLD = DEFAULT_CONFIG.blank_page_threshold;

const results = [];
let passedCount = 0;
let failedCount = 0;

function test(name, fn) {
  try {
    fn();
    results.push({ name, status: 'PASS' });
    passedCount++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, status: 'FAIL', error: e.message });
    failedCount++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  const ok = Math.abs(actual - expected) <= tolerance;
  assert.ok(ok, `${msg}: expected ~${expected} (±${tolerance}), got ${actual}`);
}

console.log('\n=== 生成测试图像 ===');
const images = await generateAllTestImages();
console.log('所有测试图像已生成:', TEST_IMAGES_DIR);

console.log('\n=== 空白页检测单元测试 ===\n');

console.log('【1. 应该判定为空白页的场景】\n');

{
  console.log('1.1 纯白页面');
  const info = await calculateBlankRatio(images.pureWhite);
  console.log(`    blankRatio=${info.blankRatio.toFixed(4)}, avgBrightness=${info.avgBrightness.toFixed(1)}`);
  test('纯白页 blankRatio >= 0.95', () => {
    assert.ok(info.blankRatio >= 0.95, `expected >= 0.95, got ${info.blankRatio}`);
  });
  test('纯白页 isVeryBright=true', () => assert.ok(info.isVeryBright));
  test('纯白页 nearWhiteRatio >= 0.99', () => assert.ok(info.nearWhiteRatio >= 0.99));
  const check = await blankPageCheck(images.pureWhite, DEFAULT_CONFIG);
  test('纯白页检测应失败 (passed=0)', () => assert.strictEqual(check.passed, 0));
}

console.log('');

{
  console.log('1.2 白色页面 + 50 个随机彩色噪点');
  const info = await calculateBlankRatio(images.whiteWithNoise50);
  console.log(`    blankRatio=${info.blankRatio.toFixed(4)}, noiseRatio=${info.noiseRatio.toFixed(2)}, contentPixelRatio=${info.contentPixelRatio.toFixed(4)}`);
  test('少量噪点白页 blankRatio >= 0.9', () => {
    assert.ok(info.blankRatio >= 0.9, `expected >= 0.9, got ${info.blankRatio}`);
  });
  test('噪点过滤后 filteredColorCount < 10', () => {
    assert.ok(info.filteredColorCount < 10, `expected < 10, got ${info.filteredColorCount}`);
  });
  const check = await blankPageCheck(images.whiteWithNoise50, DEFAULT_CONFIG);
  test('少量噪点白页检测应失败 (passed=0)', () => assert.strictEqual(check.passed, 0));
}

console.log('');

{
  console.log('1.3 白色页面 + 200 个随机彩色噪点');
  const info = await calculateBlankRatio(images.whiteWithNoise200);
  console.log(`    blankRatio=${info.blankRatio.toFixed(4)}, noiseRatio=${info.noiseRatio.toFixed(2)}`);
  test('多噪点白页 blankRatio >= 0.85', () => {
    assert.ok(info.blankRatio >= 0.85, `expected >= 0.85, got ${info.blankRatio}`);
  });
  const check = await blankPageCheck(images.whiteWithNoise200, DEFAULT_CONFIG);
  test('多噪点白页检测应失败 (passed=0)', () => assert.strictEqual(check.passed, 0));
}

console.log('');

{
  console.log('1.4 近白色 (#f8f8f8) 空白页');
  const info = await calculateBlankRatio(images.nearWhiteBlank);
  console.log(`    blankRatio=${info.blankRatio.toFixed(4)}, avgBrightness=${info.avgBrightness.toFixed(1)}`);
  test('近白空白页 blankRatio >= 0.85', () => {
    assert.ok(info.blankRatio >= 0.85, `expected >= 0.85, got ${info.blankRatio}`);
  });
  test('近白空白页 isBright=true', () => assert.ok(info.isBright));
  const check = await blankPageCheck(images.nearWhiteBlank, DEFAULT_CONFIG);
  test('近白空白页检测应失败 (passed=0)', () => assert.strictEqual(check.passed, 0));
}

console.log('\n【2. 不应判定为空白页的场景】\n');

{
  console.log('2.1 深色背景简单页面 (颜色种类少，但不是白色)');
  const info = await calculateBlankRatio(images.darkSimple);
  console.log(`    blankRatio=${info.blankRatio.toFixed(4)}, avgBrightness=${info.avgBrightness.toFixed(1)}, isBright=${info.isBright}`);
  test('深色页 blankRatio < 0.5', () => {
    assert.ok(info.blankRatio < 0.5, `expected < 0.5, got ${info.blankRatio}`);
  });
  test('深色页 isBright=false', () => assert.ok(!info.isBright));
  const check = await blankPageCheck(images.darkSimple, DEFAULT_CONFIG);
  test('深色页检测应通过 (passed=1)', () => assert.strictEqual(check.passed, 1));
}

console.log('');

{
  console.log('2.2 正常有内容页面（白背景+文字+彩色块）');
  const info = await calculateBlankRatio(images.normalContent);
  console.log(`    blankRatio=${info.blankRatio.toFixed(4)}, contentPixelRatio=${info.contentPixelRatio.toFixed(4)}, uniqueColorRatio=${info.uniqueColorRatio.toFixed(3)}`);
  test('正常内容页 blankRatio < 0.7', () => {
    assert.ok(info.blankRatio < 0.7, `expected < 0.7, got ${info.blankRatio}`);
  });
  test('正常内容页 contentPixelRatio >= 0.05', () => {
    assert.ok(info.contentPixelRatio >= 0.05, `expected >= 0.05, got ${info.contentPixelRatio}`);
  });
  const check = await blankPageCheck(images.normalContent, DEFAULT_CONFIG);
  test('正常内容页检测应通过 (passed=1)', () => assert.strictEqual(check.passed, 1));
}

console.log('');

{
  console.log('2.3 白背景 + 居中小LOGO（有真实内容）');
  const info = await calculateBlankRatio(images.whiteWithSmallLogo);
  console.log(`    blankRatio=${info.blankRatio.toFixed(4)}, contentPixelRatio=${info.contentPixelRatio.toFixed(4)}`);
  test('有小LOGO页 blankRatio < 0.95', () => {
    assert.ok(info.blankRatio < 0.95, `expected < 0.95, got ${info.blankRatio}`);
  });
  test('有小LOGO页 contentPixelRatio > 0', () => {
    assert.ok(info.contentPixelRatio > 0, `expected > 0, got ${info.contentPixelRatio}`);
  });
  const check = await blankPageCheck(images.whiteWithSmallLogo, DEFAULT_CONFIG);
  test('有小LOGO页检测应通过 (passed=1)', () => assert.strictEqual(check.passed, 1));
}

console.log('');

{
  console.log('2.4 404错误页面（白背景+文字）');
  const info = await calculateBlankRatio(images.error404);
  console.log(`    blankRatio=${info.blankRatio.toFixed(4)}, contentPixelRatio=${info.contentPixelRatio.toFixed(4)}`);
  test('404页 blankRatio < 0.8', () => {
    assert.ok(info.blankRatio < 0.8, `expected < 0.8, got ${info.blankRatio}`);
  });
  test('404页 contentPixelRatio > 0.02', () => {
    assert.ok(info.contentPixelRatio > 0.02, `expected > 0.02, got ${info.contentPixelRatio}`);
  });
  const check = await blankPageCheck(images.error404, DEFAULT_CONFIG);
  test('404页检测应通过 (passed=1)', () => assert.strictEqual(check.passed, 1));
}

console.log('');

{
  console.log('2.5 深色极简页面（颜色少，整体亮度低）');
  const info = await calculateBlankRatio(images.darkMinimalist);
  console.log(`    blankRatio=${info.blankRatio.toFixed(4)}, avgBrightness=${info.avgBrightness.toFixed(1)}, isBright=${info.isBright}`);
  test('深色极简页 blankRatio < 0.3', () => {
    assert.ok(info.blankRatio < 0.3, `expected < 0.3, got ${info.blankRatio}`);
  });
  test('深色极简页 isBright=false', () => assert.ok(!info.isBright));
  const check = await blankPageCheck(images.darkMinimalist, DEFAULT_CONFIG);
  test('深色极简页检测应通过 (passed=1)', () => assert.strictEqual(check.passed, 1));
}

console.log('\n========================================');
console.log(`测试完成: 通过 ${passedCount}, 失败 ${failedCount}, 共 ${results.length}`);
console.log('========================================\n');

if (failedCount > 0) {
  console.log('失败用例:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
  process.exit(1);
} else {
  console.log('所有测试通过！\n');
  process.exit(0);
}
