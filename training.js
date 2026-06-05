const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
const AUTO_ASSIGN_THRESHOLD = 0.5;
const AUTO_ASSIGN_MARGIN = 0.035;
const CANDIDATE_TOP_K = 5;
const MIN_TRAIN_FACE_SIDE = 48;
const MIN_TRAIN_FACE_RATIO = 0.035;
const MIN_TRAIN_DETECTION_SCORE = 0.45;

const page = document.body.dataset.trainingPage === 'from_image' ? 'from_image' : 'upload';

let members = [];
let detections = [];
let assignments = [];
let inferredAssignments = [];
let activeFace = 0;
let currentImage = null;
let imageQueue = [];
let imageIndex = -1;
let imageHistory = [];
let labeledDescriptorRows = [];
let descriptorIndex = null;
let modelsReady = false;
let isSaving = false;
let efficientMode = true;
let currentObjectUrl = '';

const statusEl = document.getElementById('status');
const accessPanel = document.getElementById('access-panel');
const queuePanel = document.getElementById('queue-panel');
const efficientModeToggle = document.getElementById('efficient-mode-toggle');
const uploadInput = document.getElementById('upload-input');
const imagePanel = document.getElementById('image-panel');
const imageEl = document.getElementById('train-image');
const overlay = document.getElementById('overlay');
const faceList = document.getElementById('face-list');
const saveSummary = document.getElementById('save-summary');
const imageInfo = document.getElementById('image-info');
const undoBottomBtn = document.getElementById('undo-bottom-btn');
const saveBottomBtn = document.getElementById('save-bottom-btn');

init();

efficientModeToggle?.addEventListener('change', () => {
  efficientMode = efficientModeToggle.checked;
  updateSaveState();
});

uploadInput?.addEventListener('change', () => {
  const files = Array.from(uploadInput.files || []).filter(file => file.type.startsWith('image/'));
  if(!files.length) return;
  setUploadQueue(files);
  uploadInput.value = '';
});

async function init(){
  const allowed = await ensureAccess();
  if(!allowed) return;
  try{
    setStatus('データを読み込み中...');
    const config = await fetchJson('./api.php?action=public_config');
    members = config.data?.members || [];
    if(!members.length){
      setStatus('メンバーが未設定です。管理画面で人物名を登録してください。', true);
      return;
    }
    setStatus('モデルを読み込み中...');
    await waitForFaceApi();
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    modelsReady = true;
    await refreshMatcher();
    if(page === 'from_image') await reloadSourceQueue();
    else setStatus('学習画像を選択してください。');
  }catch(e){
    console.error(e);
    setStatus(e.message || '初期化に失敗しました。', true);
  }
}

async function ensureAccess(){
  accessPanel.classList.add('hidden');
  const json = await fetchJson(`./api.php?action=access_me&page=${encodeURIComponent(page)}`);
  const data = json.data || {};
  if(data.allowed){
    queuePanel.classList.remove('hidden');
    return true;
  }
  queuePanel.classList.add('hidden');
  document.querySelector('.train-bottom-bar')?.classList.add('hidden');
  accessPanel.classList.remove('hidden');
  const shared = data.mode === 'shared';
  accessPanel.innerHTML = `
    <p class="label">Access</p>
    <h2 class="access-title">学習ページに入る</h2>
    <p class="status" id="access-status">${shared ? '共通パスワードを入力してください。' : '協力者ユーザーでログインしてください。'}</p>
    <div class="grid two ${shared ? 'hidden' : ''}">
      <input class="field" id="login-username" autocomplete="username" placeholder="ユーザー名">
    </div>
    <input class="field" id="login-password" type="password" autocomplete="current-password" placeholder="${shared ? '共通パスワード' : 'パスワード'}">
    <button class="button primary" type="button" onclick="loginContributor()">ログイン</button>`;
  return false;
}

async function loginContributor(){
  setAccessStatus('ログイン中...');
  try{
    const res = await fetch('./api.php?action=contributor_login', {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        page,
        username:document.getElementById('login-username')?.value.trim() || '',
        password:document.getElementById('login-password')?.value || ''
      })
    });
    const json = await readJson(res);
    if(!res.ok || !json.ok) throw new Error(json.error || 'ログインできませんでした。');
    location.reload();
  }catch(e){
    setAccessStatus(e.message, true);
  }
}

function setAccessStatus(text, error=false){
  const el = document.getElementById('access-status');
  if(!el) return;
  el.textContent = text;
  el.style.color = error ? '#ef4444' : '#9ca3af';
}

function setUploadQueue(files){
  revokeCurrentObjectUrl();
  imageHistory = [];
  imageIndex = -1;
  updateBackState();
  imageQueue = files.map((file, index) => ({
    kind:'file',
    file,
    title:file.name || `画像 ${index + 1}`,
    sourceName:file.name || ''
  }));
  setStatus(`${files.length}枚の画像を読み込みます。`);
  loadNextImage();
}

async function reloadSourceQueue(){
  if(page !== 'from_image') return;
  setStatus('画像リストを読み込み中...');
  try{
    const json = await fetchJson('./api.php?action=source_images', {credentials:'include', cache:'no-store'});
    imageHistory = [];
    imageIndex = -1;
    updateBackState();
    imageQueue = (json.data || []).map(row => ({
      kind:'source',
      id:row.id,
      title:row.name,
      sourceName:row.name,
      url:`./api.php?action=source_image&id=${encodeURIComponent(row.id)}`
    }));
    if(!imageQueue.length){
      clearCurrentImage();
      setStatus('管理画面でフォルダ学習用画像を追加してください。', true);
      return;
    }
    setStatus(`${imageQueue.length}枚の画像を読み込みます。`);
    await loadNextImage({pushHistory:false});
  }catch(e){
    setStatus(e.message || '画像リストを読み込めませんでした。', true);
  }
}

async function loadNextImage(options={}){
  if(!modelsReady){
    setStatus('顔認識モデルを読み込み中です。', true);
    return;
  }
  if(!imageQueue.length){
    setStatus(page === 'upload' ? '学習画像を選択してください。' : '学習用画像がありません。');
    return;
  }
  const nextIndex = imageIndex + 1;
  if(nextIndex >= imageQueue.length){
    revokeCurrentObjectUrl();
    clearCurrentImage();
    imageInfo.innerHTML = '';
    setStatus('画像の確認が終わりました。');
    return;
  }
  await loadImageAt(nextIndex, null, options);
}

async function loadImageAt(index, restoredAssignments=null, options={}){
  const shouldPushHistory = options.pushHistory !== false;
  if(shouldPushHistory && imageIndex >= 0 && imageIndex < imageQueue.length){
    imageHistory.push({
      imageIndex,
      assignments:assignments.slice(),
      inferredAssignments:inferredAssignments.slice()
    });
    updateBackState();
  }
  imageIndex = Math.max(0, Math.min(index, imageQueue.length - 1));
  const item = imageQueue[imageIndex];
  const src = item.kind === 'file' ? URL.createObjectURL(item.file) : item.url;
  if(item.kind === 'file') setCurrentObjectUrl(src);
  else revokeCurrentObjectUrl();
  imageInfo.innerHTML = `<div class="image-meta">${imageIndex + 1} of ${imageQueue.length}</div>
    <div class="image-title">${escapeHtml(item.title || '画像')}</div>
    <div class="image-meta">${item.kind === 'file' ? '画像ファイルは保存しません' : '管理者アップロード画像'}</div>`;
  const didShowImage = await analyzeImage(src, {
    source:page,
    source_name:item.sourceName || item.title || ''
  }, restoredAssignments);
  if(didShowImage !== false) scrollToImagePanel();
}

async function analyzeImage(src, meta, restoredAssignments=null){
  try{
    currentImage = meta;
    activeFace = 0;
    detections = [];
    assignments = [];
    inferredAssignments = [];
    saveBottomBtn.disabled = true;
    faceList.innerHTML = '';
    imagePanel.classList.remove('hidden');
    setSaveSummary();
    setStatus('顔を検出中...');
    await setImageSource(imageEl, src);
    detections = await faceapi
      .detectAllFaces(imageEl, new faceapi.SsdMobilenetv1Options({ minConfidence:0.35 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    if(detections.length === 0 && !restoredAssignments){
      await autoSkipCurrentImage();
      return false;
    }
    await refreshMatcher();
    const restored = normalizeRestoredState(restoredAssignments);
    assignments = inferAssignments(restored.assignments);
    inferredAssignments = restored.inferredAssignments || assignments.slice();
    drawDetections();
    renderFaceOptions();
    updateSaveState();
    setStatus(`${detections.length}件の顔を検出しました。`);
    return true;
  }catch(e){
    console.error(e);
    clearCurrentImage();
    setStatus('この画像を読み込めませんでした。スキップしてください。', true);
    return false;
  }
}

async function autoSkipCurrentImage(){
  const skipped = imageQueue.splice(imageIndex, 1)[0];
  imageIndex -= 1;
  clearCurrentImage();
  if(!imageQueue.length){
    imageInfo.innerHTML = '';
    updateBackState();
    setStatus('顔を検出できる画像がありませんでした。', true);
    return;
  }
  setStatus(`顔が検出できなかったため自動スキップしました。${skipped?.title ? `（${skipped.title}）` : ''}`);
  await loadNextImage({pushHistory:false});
}

function inferAssignments(restoredAssignments=null){
  if(Array.isArray(restoredAssignments)){
    return detections.map((_, i) => Object.prototype.hasOwnProperty.call(restoredAssignments, i) ? restoredAssignments[i] : '');
  }
  return resolveUniquePredictions();
}

function resolveUniquePredictions(){
  if(!labeledDescriptorRows.length) return detections.map(() => '');
  const proposals = [];
  detections.forEach((det, faceIndex) => {
    if(!isTrainableFace(det)) return;
    const candidates = getMemberCandidates(det.descriptor);
    const best = candidates[0];
    if(!best || best.distance > AUTO_ASSIGN_THRESHOLD) return;
    const second = candidates[1];
    const margin = second ? second.distance - best.distance : Infinity;
    if(margin < AUTO_ASSIGN_MARGIN) return;
    proposals.push({faceIndex, name:best.name, distance:best.distance});
  });
  proposals.sort((a,b) => a.distance - b.distance);
  const next = detections.map(() => '');
  const usedNames = new Set();
  const usedFaces = new Set();
  proposals.forEach(proposal => {
    if(usedNames.has(proposal.name) || usedFaces.has(proposal.faceIndex)) return;
    next[proposal.faceIndex] = proposal.name;
    usedNames.add(proposal.name);
    usedFaces.add(proposal.faceIndex);
  });
  return next;
}

function getMemberCandidates(descriptor){
  return window.AstraFaceIndex.candidates(descriptorIndex, descriptor, {
    refineTopMembers:12,
    topK:CANDIDATE_TOP_K
  });
}

function normalizeRestoredState(restored){
  if(Array.isArray(restored)) return {assignments:restored, inferredAssignments:null};
  if(restored && typeof restored === 'object'){
    return {
      assignments:Array.isArray(restored.assignments) ? restored.assignments : null,
      inferredAssignments:Array.isArray(restored.inferredAssignments) ? restored.inferredAssignments : null
    };
  }
  return {assignments:null, inferredAssignments:null};
}

function drawDetections(){
  const displaySize = {width:imageEl.clientWidth, height:imageEl.clientHeight};
  overlay.width = displaySize.width;
  overlay.height = displaySize.height;
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0,0,overlay.width,overlay.height);
  const resized = faceapi.resizeResults(detections, displaySize);
  resized.forEach((det, i) => {
    const box = det.detection.box;
    const skipped = assignments[i] === '__skip__';
    const assigned = !!assignments[i] && !skipped;
    ctx.strokeStyle = i === activeFace ? '#ec4899' : assigned ? '#f9a8d4' : skipped ? '#d1d5db' : '#1f2937';
    ctx.lineWidth = i === activeFace ? 4 : 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    const label = assigned ? assignments[i] : skipped ? 'スキップ' : `顔 ${i + 1}`;
    ctx.font = '700 13px "Zen Maru Gothic", sans-serif';
    const labelW = Math.max(58, ctx.measureText(label).width + 18);
    ctx.fillStyle = assigned ? '#ec4899' : 'rgba(31,41,55,.85)';
    ctx.fillRect(box.x, Math.max(0, box.y - 25), labelW, 24);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, box.x + 8, Math.max(17, box.y - 8));
  });
}

function renderFaceOptions(){
  faceList.innerHTML = '';
  detections.forEach((det, i) => {
    const node = document.createElement('div');
    const skipped = assignments[i] === '__skip__';
    const assigned = !!assignments[i] && !skipped;
    const quality = getFaceQuality(det);
    node.className = 'face-option' + (i === activeFace ? ' active' : '') + (assigned ? ' assigned' : '') + (skipped ? ' skipped' : '') + (!quality.ok ? ' low-quality' : '');
    node.onclick = () => {
      activeFace = i;
      renderFaceOptions();
      drawDetections();
    };

    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 160;
    drawFaceCrop(c, det);

    const head = document.createElement('div');
    head.className = 'face-option-head';
    head.innerHTML = `<div class="face-option-title">顔 ${i + 1}</div><div class="face-option-status">${!quality.ok ? '低品質' : assigned ? '登録対象' : skipped ? 'スキップ' : '未設定'}</div>`;

    const select = document.createElement('select');
    select.className = 'face-member-select';
    select.innerHTML = renderMemberSelectOptions();
    select.value = assigned ? assignments[i] : '';
    select.onclick = e => e.stopPropagation();
    select.onchange = e => {
      assignments[i] = e.target.value;
      activeFace = i;
      renderFaceOptions();
      drawDetections();
      updateSaveState();
    };

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'face-skip';
    skip.textContent = skipped ? 'スキップ解除' : 'この顔はスキップ';
    skip.onclick = e => {
      e.stopPropagation();
      assignments[i] = skipped ? '' : '__skip__';
      activeFace = i;
      renderFaceOptions();
      drawDetections();
      updateSaveState();
    };

    const body = document.createElement('div');
    body.className = 'face-option-body';
    body.appendChild(head);
    body.appendChild(select);
    body.appendChild(skip);
    node.appendChild(c);
    node.appendChild(body);
    faceList.appendChild(node);
  });
}

function renderMemberSelectOptions(){
  return '<option value="">人物を選択</option>' + members.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
}

function drawFaceCrop(canvas, det){
  const ctx = canvas.getContext('2d');
  const box = det.detection.box;
  const pad = Math.max(box.width, box.height) * 0.28;
  const cropX = Math.max(0, box.x - pad);
  const cropY = Math.max(0, box.y - pad);
  const cropW = Math.min(imageEl.naturalWidth - cropX, box.width + pad * 2);
  const cropH = Math.min(imageEl.naturalHeight - cropY, box.height + pad * 2);
  const scale = Math.max(canvas.width / cropW, canvas.height / cropH);
  const sw = canvas.width / scale;
  const sh = canvas.height / scale;
  const sx = Math.max(0, cropX + cropW / 2 - sw / 2);
  const sy = Math.max(0, cropY + cropH / 2 - sh / 2);
  ctx.drawImage(imageEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}

async function saveAssignedFaces(){
  if(isSaving) return;
  const rows = getRowsForSave();
  if(!rows.length) return;
  setSaveLoading(true, `${rows.length}件を保存中`);
  setStatus(`${rows.length}件を保存中...`);
  let saved = 0;
  try{
    for(const row of rows){
      const res = await fetch('./api.php?action=save_descriptor', {
        method:'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          member:row.member,
          descriptor:Array.from(row.det.descriptor),
          source:page,
          source_name:currentImage?.source_name || ''
        })
      });
      const json = await readJson(res);
      if(!res.ok || !json.ok) throw new Error(json.error || '保存に失敗しました。');
      saved++;
    }
    setSaveLoading(true, '反映中');
    await refreshMatcher();
    setStatus(`${saved}件の顔を登録しました。`);
    await loadNextImage();
  }catch(e){
    console.error(e);
    setStatus(e.message || '保存中にエラーが発生しました。', true);
    updateSaveState();
  }finally{
    setSaveLoading(false);
  }
}

function getRowsForSave(){
  return detections
    .map((det, index) => ({det, index, member:assignments[index], inferred:inferredAssignments[index] || ''}))
    .filter(row => row.member && row.member !== '__skip__')
    .filter(row => isTrainableFace(row.det))
    .filter(row => !efficientMode || row.member !== row.inferred);
}

function handlePrimaryAction(){
  if(canMarkCorrect()){
    skipImage();
    return;
  }
  saveAssignedFaces();
}

function skipImage(){
  setStatus('スキップしました。');
  loadNextImage();
}

async function goBackImage(){
  const last = imageHistory.pop();
  if(!last) return;
  updateBackState();
  setStatus('前の画像に戻ります。');
  await loadImageAt(last.imageIndex, {
    assignments:last.assignments,
    inferredAssignments:last.inferredAssignments
  }, {pushHistory:false});
}

function updateBackState(){
  undoBottomBtn.disabled = imageHistory.length === 0;
}

function updateSaveState(){
  const count = getRowsForSave().length;
  const markCorrect = canMarkCorrect();
  saveBottomBtn.textContent = markCorrect ? '正解' : '登録';
  saveBottomBtn.classList.toggle('correct', markCorrect);
  saveBottomBtn.classList.toggle('register', !markCorrect);
  saveBottomBtn.disabled = isSaving || (!markCorrect && count === 0);
  setSaveSummary();
}

function setSaveLoading(loading, text='登録'){
  isSaving = loading;
  saveBottomBtn.disabled = loading || (!canMarkCorrect() && getRowsForSave().length === 0);
  saveBottomBtn.classList.toggle('loading', loading);
  saveBottomBtn.textContent = loading ? text : canMarkCorrect() ? '正解' : '登録';
  if(!loading) updateSaveState();
}

function canMarkCorrect(){
  return efficientMode && isPredictionUnchanged() && hasPrediction();
}

function isPredictionUnchanged(){
  if(assignments.length !== inferredAssignments.length) return false;
  return assignments.every((value, index) => value === inferredAssignments[index]);
}

function hasPrediction(){
  return inferredAssignments.some(value => value && value !== '__skip__');
}

function setSaveSummary(){
  const assigned = assignments.filter(v => v && v !== '__skip__').length;
  const count = getRowsForSave().length;
  const skipped = assignments.filter(v => v === '__skip__').length;
  const lowQuality = detections.filter(det => !isTrainableFace(det)).length;
  if(!detections.length) saveSummary.textContent = '登録する顔を設定してください。';
  else if(canMarkCorrect()) saveSummary.textContent = `${detections.length}件の顔を検出。推論が正しければ正解で次へ進めます。`;
  else if(efficientMode && assigned > 0 && count === 0) saveSummary.textContent = `${detections.length}件の顔を検出。登録対象の変更はありません。${lowQuality ? ` ${lowQuality}件は低品質のため保存対象外。` : ''}`;
  else if(count === 0) saveSummary.textContent = `${detections.length}件の顔を検出。登録対象は未設定です。${skipped ? ` ${skipped}件をスキップ。` : ''}${lowQuality ? ` ${lowQuality}件は低品質のため保存対象外。` : ''}`;
  else saveSummary.textContent = `${detections.length}件中 ${count}件を登録します。変更分のみ保存します。${skipped ? ` ${skipped}件をスキップ。` : ''}${lowQuality ? ` ${lowQuality}件は低品質のため保存対象外。` : ''}`;
}

function isTrainableFace(det){
  return getFaceQuality(det).ok;
}

function getFaceQuality(det){
  const box = det.detection.box;
  const minSide = Math.min(box.width, box.height);
  const ratio = minSide / Math.max(1, Math.min(imageEl.naturalWidth || imageEl.width, imageEl.naturalHeight || imageEl.height));
  const score = Number(det.detection.score || 0);
  if(score < MIN_TRAIN_DETECTION_SCORE) return {ok:false, reason:'検出信頼度が低い'};
  if(minSide < MIN_TRAIN_FACE_SIDE || ratio < MIN_TRAIN_FACE_RATIO) return {ok:false, reason:'顔が小さい'};
  return {ok:true, reason:''};
}

async function refreshMatcher(){
  const data = await fetchJson('./api.php?action=descriptors', {cache:'no-store'});
  descriptorIndex = window.AstraFaceIndex.build(data, {
    maxPrototypes:32,
    refineTopMembers:12,
    topK:CANDIDATE_TOP_K
  });
  labeledDescriptorRows = descriptorIndex.rows;
  return descriptorIndex.ready;
}

function clearCurrentImage(){
  detections = [];
  assignments = [];
  inferredAssignments = [];
  currentImage = null;
  saveBottomBtn.disabled = true;
  faceList.innerHTML = '';
  imagePanel.classList.add('hidden');
  setSaveSummary();
}

function setCurrentObjectUrl(url){
  revokeCurrentObjectUrl();
  currentObjectUrl = url;
}

function revokeCurrentObjectUrl(){
  if(currentObjectUrl){
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = '';
  }
}

function setImageSource(img, src){
  return new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function scrollToImagePanel(){
  requestAnimationFrame(() => imagePanel.scrollIntoView({behavior:'smooth', block:'start'}));
}

function waitForFaceApi(){
  return new Promise((resolve, reject) => {
    if(window.faceapi) return resolve();
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

async function fetchJson(url, options={}){
  const res = await fetch(url, {credentials:'include', ...options});
  const json = await readJson(res);
  if(!res.ok || json.ok === false) throw new Error(json.error || '通信に失敗しました。');
  return json;
}

async function readJson(res){
  try{return await res.json();}catch(e){return {ok:false, error:'JSONを読み込めませんでした。'};}
}

function setStatus(text, isError=false){
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#ef4444' : '#9ca3af';
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
