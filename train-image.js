const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
const MEMBER_URLS = ['../data/member.json', '/data/member.json', './data/member.json'];
const GRAD_MEMBER_URLS = ['../data/member_grad.json', '/data/member_grad.json', './data/member_grad.json'];
const BLOG_URL = '../data/blogs.json';
const ACTIVE_MEMBER_EXCLUDES = new Set(['小池 美波']);
const RECENT_BLOG_KEEP = 80;
const OLDER_BLOG_SAMPLE = 260;
const AUTO_ASSIGN_THRESHOLD = 0.5;
const AUTO_ASSIGN_MARGIN = 0.035;
const CANDIDATE_TOP_K = 5;
const MIN_TRAIN_FACE_SIDE = 48;
const MIN_TRAIN_FACE_RATIO = 0.035;
const MIN_TRAIN_DETECTION_SCORE = 0.45;
const LOW_COUNT_BOOST_MAX = 2.2;
const LOW_COUNT_BOOST_SCALE = 18;
const LOW_COUNT_BOOST_OFFSET = 12;
const LOW_COUNT_REGISTER_THRESHOLD = 100;
const BLOG_PRIORITY_TIERS = [
  {maxCount:10, weight:18},
  {maxCount:30, weight:8},
  {maxCount:50, weight:3},
  {maxCount:Infinity, weight:1}
];

let members = [];
let graduatedMembers = [];
let selectableMembers = [];
let activeMemberNames = new Set();
let memberStats = {};
let detections = [];
let assignments = [];
let inferredAssignments = [];
let activeFace = 0;
let currentImage = null;
let imageQueue = [];
let imageIndex = -1;
let imageHistory = [];
let matcher = null;
let labeledDescriptorRows = [];
let descriptorIndex = null;
let modelsReady = false;
let isSaving = false;
let efficientMode = true;
let authUser = null;
let currentObjectUrl = '';

const statusEl = document.getElementById('status');
const efficientModeToggle = document.getElementById('efficient-mode-toggle');
const uploadInput = document.getElementById('upload-input');
const imagePanel = document.getElementById('image-panel');
const imageEl = document.getElementById('train-image');
const overlay = document.getElementById('overlay');
const faceList = document.getElementById('face-list');
const saveSummary = document.getElementById('save-summary');
const blogInfo = document.getElementById('blog-info');
const undoBottomBtn = document.getElementById('undo-bottom-btn');
const saveBottomBtn = document.getElementById('save-bottom-btn');

init();

efficientModeToggle.addEventListener('change', () => {
  efficientMode = efficientModeToggle.checked;
  updateSaveState();
});

async function init(){
  authUser = await ensurePageAccess();
  if(!authUser) return;

  try{
    setStatus('データを読み込み中...');
    await loadMembers();
    await loadMemberStats();
  }catch(e){
    console.error(e);
    setStatus('メンバーまたはブログデータの読み込みに失敗しました。', true);
    return;
  }

  try{
    setStatus('モデルを読み込み中...');
    await waitForFaceApi();
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    modelsReady = true;
    await refreshMatcher();
    if(imageQueue.length) await loadNextImage({pushHistory:false});
    else setStatus('学習画像を選択してください。');
  }catch(e){
    console.error(e);
    setStatus('顔認識モデルの読み込みに失敗しました。通信環境を確認して再読み込みしてください。', true);
  }
}

uploadInput.addEventListener('change', () => {
  const files = Array.from(uploadInput.files || []).filter(file => file.type.startsWith('image/'));
  if(!files.length) return;
  setImageQueue(files);
  uploadInput.value = '';
});

async function ensurePageAccess(){
  try{
    setStatus('ログイン状態を確認中...');
    const res = await fetch('./api.php?action=image_access_me', {credentials:'include', cache:'no-store'});
    const json = await res.json();
    const data = json && json.ok ? json.data : null;
    const user = data?.user || null;
    if(!user){
      showAccessMessage('ログインが必要です。', 'Buddies profileアカウントでログインしてください。');
      return null;
    }
    if(!data.allowed){
      showAccessMessage('画像学習権限がありません。', '管理者に画像学習の利用許可を依頼してください。');
      return null;
    }
    return user;
  }catch(e){
    console.error(e);
    showAccessMessage('ログイン確認に失敗しました。', '時間をおいて再読み込みしてください。');
    return null;
  }
}

function showAccessMessage(title, detail){
  setStatus(title, true);
  document.getElementById('image-panel')?.classList.add('hidden');
  document.querySelector('.sort-bottom-bar')?.classList.add('hidden');
  const panel = document.createElement('section');
  panel.className = 'panel access-panel';
  panel.innerHTML = `
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(detail)}</p>
    <form class="access-login" onsubmit="handleAccessLogin(event)">
      <input class="field" id="access-username" name="username" autocomplete="username" placeholder="ユーザー名">
      <input class="field" id="access-password" name="password" type="password" autocomplete="current-password" placeholder="パスワード">
      <button class="button primary" id="access-login-btn" type="submit">ログイン</button>
      <div class="access-login-error" id="access-login-error"></div>
    </form>`;
  document.querySelector('main.wrap')?.appendChild(panel);
}

async function handleAccessLogin(event){
  event.preventDefault();
  const username = document.getElementById('access-username')?.value.trim() || '';
  const password = document.getElementById('access-password')?.value || '';
  const errorEl = document.getElementById('access-login-error');
  const btn = document.getElementById('access-login-btn');
  if(errorEl) errorEl.style.display = 'none';
  if(btn) btn.disabled = true;
  try{
    const res = await fetch('./api.php?action=auth_login', {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username, password})
    });
    const json = await readJsonResponse(res);
    if(!res.ok || !json.ok) throw new Error(json.error || 'ログインに失敗しました。');
    location.reload();
  }catch(e){
    if(errorEl){
      errorEl.textContent = e.message || 'ログインに失敗しました。';
      errorEl.style.display = 'block';
    }
  }finally{
    if(btn) btn.disabled = false;
  }
}

async function readJsonResponse(res){
  try{
    return await res.json();
  }catch(e){
    return {ok:false, error:'ログイン処理でエラーが発生しました。時間をおいて再度お試しください。'};
  }
}

async function loadMembers(){
  const [activeData, gradData] = await Promise.all([
    fetchFirstJson(MEMBER_URLS),
    fetchFirstJson(GRAD_MEMBER_URLS, {})
  ]);
  members = normalizeMembers(activeData, ACTIVE_MEMBER_EXCLUDES);
  graduatedMembers = normalizeMembers(gradData);
  selectableMembers = [...members, ...graduatedMembers];
  activeMemberNames = new Set(members.map(m => m.name));
}

async function fetchFirstJson(urls, fallback){
  const list = Array.isArray(urls) ? urls : [urls];
  const errors = [];
  for(const url of list){
    try{
      const res = await fetch(url, {cache:'no-store'});
      if(!res.ok) throw new Error(`${url}: ${res.status}`);
      return await res.json();
    }catch(e){
      errors.push(e);
    }
  }
  if(arguments.length >= 2){
    console.warn('optional json not found', list, errors);
    return fallback;
  }
  throw errors[0] || new Error('json not found');
}

function normalizeMembers(data, excludes=new Set()){
  return Object.values(data || {})
    .filter(m => m && m.name)
    .filter(m => !excludes.has(m.name))
    .filter((member, index, list) => list.findIndex(row => row.name === member.name) === index);
}

async function loadMemberStats(){
  try{
    const res = await fetch('./api.php?action=stats', {cache:'no-store'});
    memberStats = await res.json();
  }catch(e){
    console.warn('failed to load member stats; using neutral blog weights', e);
    memberStats = {};
  }
}

function setImageQueue(files){
  revokeCurrentObjectUrl();
  imageHistory = [];
  imageIndex = -1;
  updateBackState();
  imageQueue = files.map((file, index) => ({
    file,
    title:file.name || `画像 ${index + 1}`,
    imageOrder:index,
    imageCount:files.length
  }));
  setStatus(`${files.length}枚の画像を読み込みます。`);
  loadNextImage();
}

function getBlogTrainingWeight(blog){
  const count = getMemberTrainingCount(blog.member);
  const boost = Math.min(LOW_COUNT_BOOST_MAX - 1, LOW_COUNT_BOOST_SCALE / (count + LOW_COUNT_BOOST_OFFSET));
  const tier = getActiveBlogPriorityTier(blog);
  return (1 + boost) * BLOG_PRIORITY_TIERS[tier].weight;
}

function buildPrioritizedBlogList(blogs){
  const buckets = BLOG_PRIORITY_TIERS.map(() => []);
  const seen = new Set();
  blogs.forEach(blog => {
    const key = blog.link || `${blog.member || ''}:${blog.date || ''}:${blog.title || ''}`;
    if(seen.has(key)) return;
    seen.add(key);
    buckets[getActiveBlogPriorityTier(blog)].push(blog);
  });
  return weightedInterleaveBuckets(
    buckets.map(bucket => weightedShuffle(bucket, getBlogTrainingWeight)),
    BLOG_PRIORITY_TIERS.map(tier => tier.weight)
  );
}

function getActiveBlogPriorityTier(blog){
  if(!activeMemberNames.has(blog.member)) return BLOG_PRIORITY_TIERS.length - 1;
  const count = getMemberTrainingCount(blog.member);
  return BLOG_PRIORITY_TIERS.findIndex(tier => count <= tier.maxCount);
}

function getMemberTrainingCount(member){
  return Number(memberStats?.[member]?.count || 0);
}

function weightedInterleaveBuckets(buckets, weights){
  const queues = buckets.map(bucket => bucket.slice());
  const result = [];
  while(queues.some(queue => queue.length)){
    let available = queues
      .map((queue, index) => ({queue, index, weight:weights[index]}))
      .filter(row => row.queue.length);
    const lastMember = result.length ? result[result.length - 1].member : '';
    const nonRepeating = available.filter(row => queueHasDifferentMember(row.queue, lastMember));
    if(nonRepeating.length) available = nonRepeating;
    const picked = pickWeightedIndex(available, row => row.weight);
    result.push(takeNextBlog(available[picked].queue, lastMember));
  }
  return result;
}

function queueHasDifferentMember(queue, member){
  return !member || queue.some(blog => blog.member !== member);
}

function takeNextBlog(queue, previousMember){
  if(!previousMember || queue[0]?.member !== previousMember) return queue.shift();
  const index = queue.findIndex(blog => blog.member !== previousMember);
  if(index <= 0) return queue.shift();
  return queue.splice(index, 1)[0];
}

function spreadImageQueue(images){
  const pool = images.slice();
  const result = [];
  while(pool.length){
    const last = result[result.length - 1] || null;
    const index = pickImageQueueIndex(pool, last);
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

function pickImageQueueIndex(pool, last){
  if(!last) return 0;
  const differentBlogAndMember = pool.findIndex(item => imageBlogKey(item) !== imageBlogKey(last) && item.member !== last.member);
  if(differentBlogAndMember >= 0) return differentBlogAndMember;
  const differentBlog = pool.findIndex(item => imageBlogKey(item) !== imageBlogKey(last));
  if(differentBlog >= 0) return differentBlog;
  const differentMember = pool.findIndex(item => item.member !== last.member);
  if(differentMember >= 0) return differentMember;
  return 0;
}

function imageBlogKey(item){
  return item?.link || `${item?.member || ''}:${item?.date || ''}:${item?.title || ''}`;
}

function weightedSample(items, count, weightFn){
  const pool = items.slice();
  const selected = [];
  while(pool.length && selected.length < count){
    const index = pickWeightedIndex(pool, weightFn);
    selected.push(pool.splice(index, 1)[0]);
  }
  return selected;
}

function weightedShuffle(items, weightFn){
  return weightedSample(items, items.length, weightFn);
}

function pickWeightedIndex(items, weightFn){
  const weights = items.map(item => Math.max(0.01, Number(weightFn(item)) || 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = Math.random() * total;
  for(let i = 0; i < weights.length; i++){
    cursor -= weights[i];
    if(cursor <= 0) return i;
  }
  return items.length - 1;
}

async function loadNextImage(options={}){
  if(!modelsReady){
    setStatus('顔認識モデルを読み込み中です。', true);
    return;
  }
  if(!imageQueue.length){
    setStatus('学習画像を選択してください。');
    return;
  }
  const nextIndex = imageIndex + 1;
  if(nextIndex >= imageQueue.length){
    revokeCurrentObjectUrl();
    clearCurrentImage();
    blogInfo.innerHTML = '';
    setStatus('選択した画像の確認が終わりました。');
    return;
  }
  await loadImageAt(nextIndex, null, options);
}

async function loadImageAt(index, restoredAssignments=null, options={}){
  if(!imageQueue.length) return;
  const shouldPushHistory = options.pushHistory !== false;
  if(shouldPushHistory && imageIndex >= 0 && imageIndex < imageQueue.length){
    imageHistory.push({
      imageIndex,
      assignments: assignments.slice(),
      inferredAssignments: inferredAssignments.slice()
    });
    updateBackState();
  }

  imageIndex = Math.max(0, Math.min(index, imageQueue.length - 1));
  const item = imageQueue[imageIndex];
  const objectUrl = URL.createObjectURL(item.file);
  setCurrentObjectUrl(objectUrl);
  blogInfo.innerHTML = `<div class="blog-meta">${imageIndex + 1} of ${imageQueue.length}</div>
    <div class="blog-title">${escapeHtml(item.title || '（ファイル名なし）')}</div>
    <div class="blog-meta">画像ファイルは保存しません</div>`;
  const didShowImage = await analyzeImage(objectUrl, {
    source:'image',
    source_url:'',
    blog_link:'',
    blog_date:'',
    blog_member:''
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
      .detectAllFaces(imageEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    if(detections.length === 0 && !Array.isArray(restoredAssignments)){
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
    blogInfo.innerHTML = '';
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

  const next = resolveUniquePredictions();

  const blogMember = currentImage?.blog_member || '';
  const targetIndex = getBlogMemberFallbackIndex(blogMember, next);
  if(targetIndex >= 0){
    next[targetIndex] = blogMember;
  }
  return next;
}

function resolveUniquePredictions(){
  if(!labeledDescriptorRows.length) return detections.map(() => '');

  const candidatesByFace = detections.map(det => getMemberCandidates(det.descriptor));
  const proposals = [];
  candidatesByFace.forEach((candidates, faceIndex) => {
    if(!isTrainableFace(detections[faceIndex])) return;
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
    refineTopMembers: 12,
    topK: CANDIDATE_TOP_K
  });
}

function getRobustDistance(descriptor, descriptors){
  return window.AstraFaceIndex.robustDistance(descriptor, descriptors, CANDIDATE_TOP_K);
}

function euclideanDistance(a, b){
  return window.AstraFaceIndex.euclideanDistance(a, b);
}

function getBlogMemberFallbackIndex(blogMember, currentAssignments){
  if(!blogMember || !selectableMembers.some(m => m.name === blogMember) || currentAssignments.includes(blogMember)) return -1;
  if(!labeledDescriptorRows.length || currentAssignments.some(Boolean)) return -1;
  const targetIndex = getLargestUnassignedFaceIndex(currentAssignments);
  if(targetIndex < 0) return -1;
  if(detections.length > 1 && !isDominantFace(targetIndex)) return -1;
  const candidates = getMemberCandidates(detections[targetIndex].descriptor);
  const best = candidates[0] || null;
  const blogCandidate = candidates.find(candidate => candidate.name === blogMember);
  if(!best || !blogCandidate) return -1;
  const closeToBest = blogCandidate.distance - best.distance <= AUTO_ASSIGN_MARGIN;
  const closeEnough = blogCandidate.distance <= AUTO_ASSIGN_THRESHOLD + 0.04;
  return closeToBest && closeEnough ? targetIndex : -1;
}

function isDominantFace(index){
  const areas = detections
    .map((det, faceIndex) => ({index:faceIndex, area:det.detection.box.width * det.detection.box.height}))
    .sort((a,b) => b.area - a.area);
  if(areas.length <= 1) return true;
  return areas[0].index === index && areas[0].area >= areas[1].area * 1.45;
}

function normalizeRestoredState(restored){
  if(Array.isArray(restored)){
    return {assignments:restored, inferredAssignments:null};
  }
  if(restored && typeof restored === 'object'){
    return {
      assignments:Array.isArray(restored.assignments) ? restored.assignments : null,
      inferredAssignments:Array.isArray(restored.inferredAssignments) ? restored.inferredAssignments : null
    };
  }
  return {assignments:null, inferredAssignments:null};
}

function getLargestUnassignedFaceIndex(currentAssignments){
  let bestIndex = -1;
  let bestArea = -1;
  detections.forEach((det, i) => {
    if(currentAssignments[i]) return;
    const box = det.detection.box;
    const area = box.width * box.height;
    if(area > bestArea){
      bestArea = area;
      bestIndex = i;
    }
  });
  return bestIndex;
}

function drawDetections(){
  const displaySize = { width: imageEl.clientWidth, height: imageEl.clientHeight };
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
  return `<option value="">メンバーを選択</option>` + renderMemberOptionGroup('現役メンバー', members) + renderMemberOptionGroup('卒業メンバー', graduatedMembers);
}

function renderMemberOptionGroup(title, list){
  if(!list.length) return '';
  return `<optgroup label="${escapeHtml(title)}">` + list.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('') + '</optgroup>';
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
      const payload = {
        member: row.member,
        descriptor: Array.from(row.det.descriptor),
        source: currentImage?.source || 'sort',
        source_url: currentImage?.source_url || '',
        blog_link: currentImage?.blog_link || '',
        blog_date: currentImage?.blog_date || '',
        blog_member: currentImage?.blog_member || ''
      };
      const res = await fetch('./api.php?action=save_descriptor', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
      const json = await res.json();
      if(!res.ok || !json.ok){
        throw new Error(json.error || '保存に失敗しました。');
      }
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
    .map((det, index) => ({det, index, member: assignments[index], inferred: inferredAssignments[index] || ''}))
    .filter(row => row.member && row.member !== '__skip__')
    .filter(row => isTrainableFace(row.det))
    .filter(row => !efficientMode || row.member !== row.inferred || shouldRegisterCorrectMember(row.member));
}

function handlePrimaryAction(){
  if(canMarkCorrect()){
    if(getRowsForSave().length){
      saveAssignedFaces();
    }else{
      skipImage();
    }
    return;
  }
  saveAssignedFaces();
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

function skipImage(){
  setStatus('スキップしました。');
  loadNextImage();
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
  if(!saveBottomBtn.dataset.defaultText) saveBottomBtn.dataset.defaultText = saveBottomBtn.textContent;
  const markCorrect = canMarkCorrect();
  saveBottomBtn.disabled = loading || (!markCorrect && getRowsForSave().length === 0);
  saveBottomBtn.classList.toggle('loading', loading);
  saveBottomBtn.classList.toggle('correct', markCorrect);
  saveBottomBtn.classList.toggle('register', !markCorrect);
  saveBottomBtn.textContent = loading ? text : markCorrect ? '正解' : '登録';
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

function hasLowCountCorrectPrediction(){
  return assignments.some((member, index) => {
    if(!member || member === '__skip__') return false;
    return member === inferredAssignments[index] && shouldRegisterCorrectMember(member);
  });
}

function shouldRegisterCorrectMember(member){
  const count = Number(memberStats?.[member]?.count || 0);
  return count <= LOW_COUNT_REGISTER_THRESHOLD;
}

function setSaveSummary(){
  const assigned = assignments.filter(v => v && v !== '__skip__').length;
  const count = getRowsForSave().length;
  const skipped = assignments.filter(v => v === '__skip__').length;
  const lowQuality = detections.filter(det => !isTrainableFace(det)).length;
  if(!detections.length){
    saveSummary.textContent = '登録する顔を設定してください。';
  }else if(canMarkCorrect() && hasLowCountCorrectPrediction() && count > 0){
    saveSummary.textContent = `${detections.length}件の顔を検出。登録100件以下のメンバーは正解でも登録します。`;
  }else if(canMarkCorrect()){
    saveSummary.textContent = `${detections.length}件の顔を検出。推論が正しければ正解で次へ進めます。`;
  }else if(efficientMode && assigned > 0 && count === 0){
    saveSummary.textContent = `${detections.length}件の顔を検出。登録対象の変更はありません。${lowQuality ? ` ${lowQuality}件は低品質のため保存対象外。` : ''}`;
  }else if(count === 0){
    saveSummary.textContent = `${detections.length}件の顔を検出。登録対象は未設定です。${skipped ? ` ${skipped}件をスキップ。` : ''}${lowQuality ? ` ${lowQuality}件は低品質のため保存対象外。` : ''}`;
  }else{
    saveSummary.textContent = `${detections.length}件中 ${count}件を登録します。${efficientMode ? ' 変更分のみ保存します。' : ''}${skipped ? ` ${skipped}件をスキップ。` : ''}${lowQuality ? ` ${lowQuality}件は低品質のため保存対象外。` : ''}`;
  }
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

async function refreshMatcher(){
  matcher = await loadMatcher();
  return matcher;
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
  if(!currentObjectUrl) return;
  URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = '';
}

function proxyUrl(url){
  return `./api.php?action=proxy_image&url=${encodeURIComponent(url)}`;
}

function parseDate(date){
  const m = String(date || '').match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : 0;
}

function shuffle(rows){
  const next = rows.slice();
  for(let i = next.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function setImageSource(img, src){
  return new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function scrollToImagePanel(){
  requestAnimationFrame(() => {
    imagePanel.scrollIntoView({behavior:'smooth', block:'start'});
  });
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

function setStatus(text, isError=false){
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#ef4444' : '#9ca3af';
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
