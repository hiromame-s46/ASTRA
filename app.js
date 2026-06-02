const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
const MATCH_THRESHOLD = 0.56;
const MATCH_MARGIN = 0.03;
const MAX_ANALYSIS_SIDE = 1400;
const DETECTOR_MIN_CONFIDENCE = 0.28;
const CANDIDATE_TOP_K = 5;
const MIN_FACE_SIDE = 30;
const MIN_FACE_RATIO = 0.022;
const MIN_DETECTION_SCORE = 0.28;
const FALLBACK_MATCH_THRESHOLD = 0.62;

let matcher = null;
let labeledDescriptorRows = [];
let descriptorIndex = null;
let ready = false;
let showFrames = true;

const input = document.getElementById('image-input');
const frameToggle = document.getElementById('frame-toggle');
const statusEl = document.getElementById('status');
const previewPanel = document.getElementById('preview-panel');
const resultsEl = document.getElementById('results');

init();

async function init(){
  try{
    setStatus('モデルを読み込み中...');
    await waitForFaceApi();
    await loadModels();
    setStatus('学習データを読み込み中...');
    matcher = await loadMatcher();
    ready = true;
    setStatus(matcher ? '画像を選択してください。複数枚まとめて判定できます。' : '学習データがありません。', !matcher);
  }catch(e){
    console.error(e);
    setStatus('顔認識モデルの読み込みに失敗しました。通信環境を確認して再読み込みしてください。', true);
  }
}

input.addEventListener('change', async () => {
  const files = Array.from(input.files || []).filter(file => file.type.startsWith('image/'));
  if(!files.length || !ready) return;
  await runFiles(files);
  input.value = '';
});

frameToggle.addEventListener('change', () => {
  showFrames = frameToggle.checked;
  resultsEl.classList.toggle('frames-off', !showFrames);
});

async function loadModels(){
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ]);
}

async function loadMatcher(){
  const res = await fetch('./api.php?action=descriptors', {cache:'no-store'});
  const data = await res.json();
  descriptorIndex = window.AstraFaceIndex.build(data, {
    maxPrototypes: 32,
    refineTopMembers: 12,
    topK: CANDIDATE_TOP_K
  });
  labeledDescriptorRows = descriptorIndex.rows;
  return descriptorIndex.ready;
}

async function runFiles(files){
  previewPanel.classList.remove('hidden');
  resultsEl.innerHTML = '';
  resultsEl.classList.toggle('frames-off', !showFrames);
  setStatus(`${files.length}枚を解析中...`);

  let totalFaces = 0;
  let failed = 0;
  for(let i = 0; i < files.length; i++){
    setStatus(`${i + 1} / ${files.length} 枚目を解析中...`);
    await waitForPaint();
    const source = await createAnalysisSource(files[i]);
    try{
      const count = await runImage(source.url, files[i].name, i);
      totalFaces += count;
    }catch(e){
      console.error(e);
      renderErrorCard(files[i].name, i);
      failed++;
    }finally{
      source.revoke();
    }
  }

  setStatus(`${files.length}枚から${totalFaces}件の顔を検出しました。${failed ? ` ${failed}枚は解析できませんでした。` : ''}`, failed > 0);
}

function waitForPaint(){
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function createAnalysisSource(file){
  try{
    if(file.type.includes('svg')) return objectUrlSource(file);
    const bitmap = await createImageBitmap(file, {imageOrientation:'from-image'});
    const scale = Math.min(1, MAX_ANALYSIS_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if(blob) return objectUrlSource(blob);
  }catch(e){
    console.warn('image normalization failed; using original file', e);
  }
  return objectUrlSource(file);
}

function objectUrlSource(blob){
  const url = URL.createObjectURL(blob);
  return {
    url,
    revoke:() => URL.revokeObjectURL(url)
  };
}

async function runImage(src, fileName, index){
  const card = createImageCard(fileName, index);
  const img = card.querySelector('img');
  const overlay = card.querySelector('canvas.overlay');
  const faceResults = card.querySelector('.face-crop-results');
  await setImageSource(img, src);

  const detections = await faceapi
    .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence:DETECTOR_MIN_CONFIDENCE }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  drawDetections(img, overlay, detections);
  renderFaceResults(img, faceResults, detections);
  card.querySelector('.image-result-count').textContent = `${detections.length}件`;
  return detections.length;
}

function createImageCard(fileName, index){
  const card = document.createElement('article');
  card.className = 'image-result-card';
  card.innerHTML = `
    <div class="image-result-head">
      <div>
        <div class="image-result-name">${escapeHtml(fileName || `画像 ${index + 1}`)}</div>
        <div class="result-meta">画像 ${index + 1}</div>
      </div>
      <div class="image-result-count">解析中</div>
    </div>
    <div class="preview result-preview">
      <img alt="">
      <canvas class="overlay"></canvas>
    </div>
    <div class="face-crop-results"></div>
  `;
  resultsEl.appendChild(card);
  return card;
}

function renderErrorCard(fileName, index){
  const card = document.createElement('article');
  card.className = 'image-result-card';
  card.innerHTML = `
    <div class="image-result-head">
      <div>
        <div class="image-result-name">${escapeHtml(fileName || `画像 ${index + 1}`)}</div>
        <div class="result-meta">画像 ${index + 1}</div>
      </div>
      <div class="image-result-count">失敗</div>
    </div>
    <div class="empty-result">画像を解析できませんでした。JPEGまたはPNGで試してください。</div>
  `;
  resultsEl.appendChild(card);
}

function drawDetections(img, overlay, detections){
  const displaySize = { width: img.clientWidth, height: img.clientHeight };
  overlay.width = displaySize.width;
  overlay.height = displaySize.height;
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0,0,overlay.width,overlay.height);
  const resized = faceapi.resizeResults(detections, displaySize);
  resized.forEach((det, i) => {
    const prediction = getPrediction(detections[i], img);
    const label = prediction.name ? `${prediction.name} ${Math.round(prediction.confidence * 100)}%` : '判定保留';
    const box = det.detection.box;
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.font = '700 13px "Zen Maru Gothic", sans-serif';
    const labelW = Math.max(92, ctx.measureText(label).width + 18);
    ctx.fillStyle = 'rgba(31,41,55,.86)';
    ctx.fillRect(box.x, Math.max(0, box.y - 28), labelW, 26);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, box.x + 8, Math.max(18, box.y - 10));
  });
}

function renderFaceResults(img, container, detections){
  if(!detections.length){
    container.innerHTML = '<div class="empty-result">顔を検出できませんでした</div>';
    return;
  }

  detections.forEach((det, i) => {
    const prediction = getPrediction(det, img);
    const row = document.createElement('div');
    row.className = 'face-result-card';

    const canvas = document.createElement('canvas');
    canvas.width = 144;
    canvas.height = 144;
    drawFaceCrop(img, canvas, det);

    const info = document.createElement('div');
    info.className = 'face-result-info';
    info.innerHTML = `
      <div class="result-title">
        <span>顔 ${i + 1}: ${prediction.name ? escapeHtml(prediction.name) : '判定保留'}</span>
        <span>${prediction.name ? Math.round(prediction.confidence * 100) + '%' : '-'}</span>
      </div>
      <div class="result-meta">${escapeHtml(prediction.meta)}</div>
    `;

    row.appendChild(canvas);
    row.appendChild(info);
    container.appendChild(row);
  });
}

function getPrediction(det, img){
  const quality = getFaceQuality(det, img);
  const candidates = getMemberCandidates(det.descriptor);
  const best = candidates[0] || null;
  const second = candidates[1] || null;
  if(!best){
    return {known:false, name:'', confidence:0, meta:'学習データなし'};
  }
  const margin = second ? second.distance - best.distance : Infinity;
  const strong = quality.ok && best.distance <= MATCH_THRESHOLD && margin >= MATCH_MARGIN;
  const fallback = best.distance <= FALLBACK_MATCH_THRESHOLD;
  const known = strong || fallback;
  const notes = [];
  if(!quality.ok) notes.push(quality.reason);
  if(margin < MATCH_MARGIN) notes.push('候補が近い');
  if(!strong && fallback) notes.push('参考候補');
  return {
    known,
    name:known ? best.name : '',
    confidence:Math.max(0, 1 - best.distance),
    meta: second
      ? `nearest: ${best.name} ${best.distance.toFixed(4)} / next: ${second.name} ${second.distance.toFixed(4)} / ${quality.label}${notes.length ? ` / ${notes.join('・')}` : ''}`
      : `nearest: ${best.name} ${best.distance.toFixed(4)} / ${quality.label}${notes.length ? ` / ${notes.join('・')}` : ''}`
  };
}

function getMemberCandidates(descriptor){
  return window.AstraFaceIndex.candidates(descriptorIndex, descriptor, {
    refineTopMembers: 12,
    topK: CANDIDATE_TOP_K
  });
}

function getRobustDistance(descriptor, descriptors){
  return window.AstraFaceIndex.robustDistance(descriptor, descriptors, CANDIDATE_TOP_K);
}

function getFaceQuality(det, img){
  const box = det.detection.box;
  const minSide = Math.min(box.width, box.height);
  const ratio = minSide / Math.max(1, Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const score = Number(det.detection.score || 0);
  if(score < MIN_DETECTION_SCORE) return {ok:false, reason:'検出信頼度が低い', label:`score ${score.toFixed(2)}`};
  if(minSide < MIN_FACE_SIDE || ratio < MIN_FACE_RATIO) return {ok:false, reason:'顔が小さい', label:`face ${Math.round(minSide)}px`};
  return {ok:true, reason:'', label:`score ${score.toFixed(2)} / face ${Math.round(minSide)}px`};
}

function euclideanDistance(a, b){
  return window.AstraFaceIndex.euclideanDistance(a, b);
}

function drawFaceCrop(img, canvas, det){
  const ctx = canvas.getContext('2d');
  const box = det.detection.box;
  const pad = Math.max(box.width, box.height) * 0.28;
  const cropX = Math.max(0, box.x - pad);
  const cropY = Math.max(0, box.y - pad);
  const cropW = Math.min(img.naturalWidth - cropX, box.width + pad * 2);
  const cropH = Math.min(img.naturalHeight - cropY, box.height + pad * 2);
  const scale = Math.max(canvas.width / cropW, canvas.height / cropH);
  const sw = canvas.width / scale;
  const sh = canvas.height / scale;
  const sx = Math.max(0, cropX + cropW / 2 - sw / 2);
  const sy = Math.max(0, cropY + cropH / 2 - sh / 2);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}

function setImageSource(img, src){
  return new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function setStatus(text, isError=false){
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#ef4444' : '#9ca3af';
}

function waitForFaceApi(){
  return new Promise((resolve, reject) => {
    if(window.faceapi) {
      resolve();
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      if(window.faceapi){
        clearInterval(timer);
        resolve();
      }else if(++tries >= 80){
        clearInterval(timer);
        reject(new Error('face-api.js is not loaded'));
      }
    }, 100);
  });
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
