/**
 * 食物热量分析器 - 前端逻辑
 */

const state = {
  images: [], videos: [], hasDefaultConfig: false, uploadEnabled: false, lastResult: null
};

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 18 * 1024 * 1024;
const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_OUTPUT_QUALITY = 0.82;

const el = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => { loadServerConfig(); initUpload(); });

// ========== 配置 ==========

async function loadServerConfig() {
  try {
    const cfg = await (await fetch('/api/config')).json();
    state.hasDefaultConfig = cfg.hasDefaultModel;
    state.uploadEnabled = !!cfg.uploadEnabled;
    if (!state.uploadEnabled) {
      el('statusIcon').textContent = '❌'; el('statusText').textContent = '服务器未配置挂载上传目录，暂时无法上传文件';
      el('statusBar').className = 'status-bar status-error';
      el('analyzeBtn').disabled = true;
      return;
    }
    if (cfg.hasDefaultModel) {
      el('statusIcon').textContent = '✅'; el('statusText').textContent = '模型已就绪';
      el('statusBar').className = 'status-bar status-ok';
    } else {
      el('statusIcon').textContent = '⚠️'; el('statusText').textContent = '服务器未配置模型，请在下方填写';
      el('statusBar').className = 'status-bar status-warn';
      el('configContent').classList.remove('collapsed');
    }
  } catch {
    el('statusIcon').textContent = '❌'; el('statusText').textContent = '无法连接服务器';
    el('statusBar').className = 'status-bar status-error';
  }
}

function toggleConfig() {
  const c = el('configContent'), collapsed = c.classList.toggle('collapsed');
  el('toggleIcon').style.transform = collapsed ? 'rotate(-90deg)' : '';
}

// ========== 上传 ==========

function initUpload() {
  const box = el('uploadBox'), input = el('fileInput');
  input.addEventListener('change', e => { processFiles(e.target.files); input.value = ''; });
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('dragover'); });
  box.addEventListener('dragleave', e => { e.preventDefault(); box.classList.remove('dragover'); });
  box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('dragover'); processFiles(e.dataTransfer.files); });
}

async function processFiles(files) {
  if (!files || !files.length) return;
  if (!state.uploadEnabled) {
    showError('服务器未配置挂载上传目录，无法上传文件');
    return;
  }
  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) {
      if (state.images.length >= 3) { showError('图片最多上传 3 张'); break; }
      if (file.size > MAX_IMAGE_SIZE) { showError(`图片 "${file.name}" 超过 10MB`); continue; }
      try {
        const processed = await prepareImage(file);
        if (wouldExceedUploadBudget(processed.size)) {
          showError('上传内容总大小过大，请减少图片数量或换更小的图片');
          continue;
        }
        setGlobalLoading(true, '上传图片中...');
        const uploaded = await uploadFile(processed.file, 'image');
        state.images.push({
          name: file.name,
          size: processed.size,
          originalSize: file.size,
          previewUrl: processed.previewUrl,
          url: uploaded.url
        });
      } catch {
        showError(`图片 "${file.name}" 处理失败，请换一张后重试`);
      } finally {
        setGlobalLoading(false);
      }
    } else if (file.type.startsWith('video/')) {
      if (state.videos.length >= 1) { showError('视频最多上传 1 个'); break; }
      const dur = await getVideoDuration(file);
      if (dur > 15) { showError(`视频超过 15 秒`); continue; }
      if (file.size > MAX_VIDEO_SIZE) { showError(`视频超过 50MB`); continue; }
      if (wouldExceedUploadBudget(file.size * 1.37)) {
        showError('视频体积过大，移动网络或 iPhone 上传时容易失败，请缩短视频或改传图片');
        continue;
      }
      try {
        setGlobalLoading(true, '上传视频中...');
        const uploaded = await uploadFile(file, 'video');
        state.videos.push({
          name: file.name,
          size: file.size,
          originalSize: file.size,
          previewUrl: URL.createObjectURL(file),
          url: uploaded.url
        });
      } catch {
        showError(`视频 "${file.name}" 上传失败，请重试`);
      } finally {
        setGlobalLoading(false);
      }
    } else { showError(`不支持的文件类型: ${file.name}`); }
  }
  renderPreview();
}

function getVideoDuration(f) { return new Promise(r => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => { r(v.duration); URL.revokeObjectURL(v.src); }; v.onerror = () => r(Infinity); v.src = URL.createObjectURL(f); }); }

function getCurrentUploadBytes() {
  return [...state.images, ...state.videos].reduce((sum, item) => sum + (item.size || 0), 0);
}

function wouldExceedUploadBudget(nextSize) {
  return getCurrentUploadBytes() + nextSize > MAX_TOTAL_UPLOAD_BYTES;
}

async function prepareImage(file) {
  const needsCompression = file.size > 2 * 1024 * 1024 || /image\/(heic|heif)/i.test(file.type);
  const optimizedFile = needsCompression ? await compressImage(file) : file;
  const previewUrl = URL.createObjectURL(optimizedFile);
  return {
    name: file.name,
    file: optimizedFile,
    previewUrl,
    size: optimizedFile.size,
    originalSize: file.size
  };
}

async function uploadFile(file, kind) {
  const formData = new FormData();
  formData.append('file', file);

  const uploadRes = await fetch(`/api/upload?kind=${encodeURIComponent(kind)}`, {
    method: 'POST',
    body: formData
  });

  const result = await uploadRes.json();
  if (!uploadRes.ok || !result.success) {
    throw new Error(result.error || '上传失败');
  }

  return result.data;
}

async function compressImage(file) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(imageUrl);
    const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, IMAGE_MAX_DIMENSION);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_OUTPUT_QUALITY);
    return new File([blob], replaceExtension(file.name, 'jpg'), { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fitWithin(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  const scale = Math.min(maxDimension / width, maxDimension / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('blob conversion failed'));
    }, type, quality);
  });
}

function replaceExtension(fileName, ext) {
  return fileName.replace(/\.[^.]+$/, '') + '.' + ext;
}

function renderPreview() {
  const grid = el('previewGrid'), total = state.images.length + state.videos.length;
  el('fileCount').textContent = `${total} 个文件`;
  if (!total) { grid.innerHTML = ''; return; }
  let h = '';
  state.images.forEach((img, i) => {
    const compressed = img.originalSize > img.size ? ` · 已压缩 ${(img.originalSize / 1024 / 1024).toFixed(1)}MB→${(img.size / 1024 / 1024).toFixed(1)}MB` : '';
    h += `<div class="preview-item"><img src="${img.previewUrl}"><span class="preview-label">图片 ${i+1}${compressed}</span><button class="remove-btn" onclick="removeFile('image',${i})">×</button></div>`;
  });
  state.videos.forEach(vid => { h += `<div class="preview-item"><video src="${vid.previewUrl}" controls muted></video><span class="preview-label">视频</span><button class="remove-btn" onclick="removeFile('video',0)">×</button></div>`; });
  grid.innerHTML = h; grid.style.display = 'grid';
}

function removeFile(t, i) {
  const removed = t === 'image' ? state.images.splice(i, 1)[0] : state.videos.splice(i, 1)[0];
  if (removed?.previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(removed.previewUrl);
  }
  renderPreview();
}

// ========== 分析 ==========

async function analyzeFood() {
  if (!state.images.length && !state.videos.length) { showError('请至少上传一张图片或一段视频'); return; }
  const wv = el('weightInput').value.trim(), w = wv ? parseInt(wv) : 0;
  if (wv && (!w || w < 1 || w > 10000)) { showError('重量需在 1-10,000 克之间'); return; }
  const cB = el('customBaseURL').value.trim(), cK = el('customApiKey').value.trim(), cN = el('customModelName').value.trim();
  const useCustom = cB && cK && cN;
  if (!useCustom && !state.hasDefaultConfig) { showError('服务器未配置模型，请填写自定义模型配置'); return; }

  const body = { images: state.images.map(i => i.url), videos: state.videos.map(v => v.url), weight: w };
  if (useCustom) { body.model = 'custom'; body.customConfig = { baseURL: cB, apiKey: cK, modelName: cN }; }

  setLoading(true, '分析中...');
  try {
    const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await parseApiResponse(res, {
      413: '上传内容过大，请减少图片数量，或在 iPhone 上改传更清晰但更小的图片'
    });
    if (result.success) { state.lastResult = result.data; displayResult(result.data); }
    else showError(result.error || '分析失败');
  } catch (err) {
    console.error('[analyzeFood]', err);
    showError(err.message || '网络错误，请检查连接后重试');
  }
  finally { setLoading(false); }
}

async function parseApiResponse(res, statusMessages = {}) {
  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (res.ok) {
    if (data) return data;
    throw new Error('服务器返回了非 JSON 响应，请检查运行日志');
  }

  const message = statusMessages[res.status]
    || data?.error
    || data?.message
    || (text && text.length < 300 ? text : '')
    || `请求失败（${res.status}）`;

  throw new Error(message);
}

function setLoading(on, text = '分析中...') {
  const btn = el('analyzeBtn');
  btn.disabled = on;
  btn.querySelector('.btn-text').style.display = on ? 'none' : 'inline';
  btn.querySelector('.btn-loading').style.display = on ? 'inline-flex' : 'none';
  btn.querySelector('.btn-loading').lastChild.textContent = text;
}

function setGlobalLoading(on, text) {
  const analyzeBtn = el('analyzeBtn');
  analyzeBtn.disabled = on;
  if (on) {
    analyzeBtn.querySelector('.btn-text').style.display = 'none';
    analyzeBtn.querySelector('.btn-loading').style.display = 'inline-flex';
    analyzeBtn.querySelector('.btn-loading').lastChild.textContent = text || '处理中...';
  } else {
    analyzeBtn.querySelector('.btn-text').style.display = 'inline';
    analyzeBtn.querySelector('.btn-loading').style.display = 'none';
    analyzeBtn.querySelector('.btn-loading').lastChild.textContent = '分析中...';
  }
}

// ========== 结果展示 ==========

function displayResult(data) {
  el('resultSection').style.display = 'block';
  el('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // 总热量 / 总重量 / 食材数
  animateNumber(el('totalCalories'), data.totalCalories);
  animateNumber(el('totalWeight'), data.totalWeight);
  el('totalItems').textContent = data.foodItems.length;

  // 份量校准卡片
  const cc = el('calibrateCard');
  cc.style.display = '';
  if (data.isEstimated) {
    el('calibrateBadge').textContent = 'AI 估算'; el('calibrateBadge').className = 'calibrate-badge badge-estimated';
    el('calibrateDesc').textContent = `AI 估算总重约 ${data.totalWeight}g，输入实际重量可按比例校准所有食材`;
  } else {
    const userWeight = data.userProvidedWeight || data.totalWeight;
    el('calibrateBadge').textContent = '用户输入'; el('calibrateBadge').className = 'calibrate-badge badge-user';
    el('calibrateDesc').textContent = `当前基于用户输入的 ${userWeight}g，可修改后重新校准`;
  }
  el('calibrateWeight').value = data.totalWeight;

  // 食材明细表
  renderFoodTable(data.foodItems, data.caloriesPer100g);

  // 建议 & 警告
  el('servingSuggestion').textContent = data.servingSuggestion;
  const wc = el('warningCard');
  if (data.warnings && data.warnings !== '无') { el('warnings').textContent = data.warnings; wc.style.display = ''; }
  else wc.style.display = 'none';
}

function renderFoodTable(items) {
  const tbody = el('foodTableBody'), tfoot = el('foodTableFoot');
  let bodyHtml = '', sumWeight = 0, sumCal = 0;
  items.forEach((item, idx) => {
    sumWeight += item.estimatedWeight;
    sumCal += item.totalCalories;

    // 置信度标记
    const conf = item.confidence || 'medium';
    const confLabel = conf === 'high' ? '' : conf === 'low' ? ' <span class="conf-tag conf-low">存疑</span>' : ' <span class="conf-tag conf-med">待定</span>';

    // 候选选项
    let altHtml = '-';
    if (item.alternatives && item.alternatives.length > 0) {
      altHtml = item.alternatives.map(a =>
        `<button class="alt-tag" onclick="quickReplace(${idx},'${esc(a)}',this)" title="替换为${esc(a)}">${esc(a)}</button>`
      ).join(' ');
    }

    bodyHtml += `<tr${idx % 2 === 1 ? ' class="row-alt"' : ''}>
      <td class="td-name">${esc(item.name)}${confLabel}</td>
      <td>${item.estimatedWeight}g</td>
      <td>${item.caloriesPer100g} kcal</td>
      <td class="td-cal">${item.totalCalories} kcal</td>
      <td><span class="cooking-tag">${esc(item.cookingMethod)}</span></td>
      <td class="td-alts">${altHtml}</td>
      <td class="td-note">${esc(item.note)}</td>
    </tr>`;
  });
  tbody.innerHTML = bodyHtml;
  tfoot.innerHTML = `<tr><td colspan="2"><strong>合计</strong></td><td>-</td><td class="td-cal"><strong>${Math.round(sumCal)} kcal</strong></td><td colspan="3"></td></tr>`;
}

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

function animateNumber(elem, target) {
  const duration = 400, start = performance.now();
  const from = parseInt(elem.textContent) || 0;
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    elem.textContent = Math.round(from + (target - from) * ease);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ========== 份量校准 ==========

function recalibrate() {
  const data = state.lastResult;
  if (!data || !data.foodItems || !data.foodItems.length) { showError('没有可校准的数据'); return; }

  const newTotal = parseInt(el('calibrateWeight').value);
  if (!newTotal || newTotal < 1 || newTotal > 10000) { showError('请输入有效的重量（1-10,000 克）'); return; }

  const oldTotal = data.totalWeight || 1;
  const ratio = newTotal / oldTotal;

  // 按比例缩放每项食材
  data.foodItems.forEach(item => {
    item.estimatedWeight = Math.round(item.estimatedWeight * ratio);
    item.totalCalories = Math.round((item.caloriesPer100g * item.estimatedWeight) / 100);
  });

  data.totalWeight = newTotal;
  data.totalCalories = data.foodItems.reduce((s, i) => s + i.totalCalories, 0);
  data.isEstimated = false;

  // 更新 UI
  animateNumber(el('totalCalories'), data.totalCalories);
  animateNumber(el('totalWeight'), data.totalWeight);
  renderFoodTable(data.foodItems);

  el('calibrateBadge').textContent = '已校准'; el('calibrateBadge').className = 'calibrate-badge badge-calibrated';
  el('calibrateDesc').textContent = `已校准为 ${newTotal}g，所有食材热量已按比例更新`;

  // 闪一下
  el('totalCalories').classList.add('cal-flash');
  setTimeout(() => el('totalCalories').classList.remove('cal-flash'), 600);
}

// ========== 追问/修正 ==========

function fillFollowup(text) {
  el('followupInput').value = text;
  el('followupInput').focus();
}

// 点击候选食材标签，快速替换
function quickReplace(itemIndex, newName, btnElem) {
  const data = state.lastResult;
  if (!data || !data.foodItems || !data.foodItems[itemIndex]) {
    showError('数据异常，请重新分析'); return;
  }
  const oldName = data.foodItems[itemIndex].name;
  const text = `请把"${oldName}"替换成"${newName}"，结合图片重新确认所有食材的比例和热量`;
  fillFollowup(text);
}

async function submitFollowup() {
  const text = el('followupInput').value.trim();
  if (!text) { showError('请输入修改意见或追问内容'); return; }
  if (!state.lastResult || (!state.images.length && !state.videos.length)) {
    showError('没有可追问的分析结果，请先上传图片并分析');
    return;
  }

  // 构建请求
  const body = {
    images: state.images.map(i => i.url),
    videos: state.videos.map(v => v.url),
    previousResult: state.lastResult,
    followupText: text
  };

  const cB = el('customBaseURL').value.trim();
  const cK = el('customApiKey').value.trim();
  const cN = el('customModelName').value.trim();
  if (cB && cK && cN) {
    body.model = 'custom';
    body.customConfig = { baseURL: cB, apiKey: cK, modelName: cN };
  }

  setFollowupLoading(true);
  try {
    const res = await fetch('/api/followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await parseApiResponse(res, {
      413: '追问请求内容过大，请减少图片/视频后重新分析'
    });
    if (result.success) {
      state.lastResult = result.data;
      displayResult(result.data);
      el('followupInput').value = '';
      // 滚动到结果顶部
      el('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      showError(result.error || '追问失败');
    }
  } catch (err) {
    console.error('[submitFollowup]', err);
    showError(err.message || '网络错误，请检查连接后重试');
  } finally {
    setFollowupLoading(false);
  }
}

function setFollowupLoading(on) {
  const btn = el('followupBtn');
  btn.disabled = on;
  btn.querySelector('.btn-text').style.display = on ? 'none' : 'inline';
  btn.querySelector('.btn-loading').style.display = on ? 'inline-flex' : 'none';
}

// ========== 错误 ==========

let toastTimer;
function showError(msg) { el('errorMessage').textContent = msg; el('errorToast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(hideError, 3000); }
function hideError() { el('errorToast').classList.remove('show'); }
