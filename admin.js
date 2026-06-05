let adminState = null;

const loginPanel = document.getElementById('login-panel');
const adminApp = document.getElementById('admin-app');
const logoutBtn = document.getElementById('logout-btn');
const sourceInput = document.getElementById('source-images-input');

initAdmin();

sourceInput?.addEventListener('change', uploadSourceImages);

async function initAdmin(){
  try{
    const res = await fetch('./api.php?action=admin_me', {credentials:'include', cache:'no-store'});
    const json = await readJson(res);
    const data = json.data || {};
    if(!data.configured){
      setText('login-status', '.env に ASTRA_ADMIN_USERNAME と ASTRA_ADMIN_PASSWORD または ASTRA_ADMIN_PASSWORD_HASH を設定してください。', true);
    }
    if(data.admin){
      showAdminApp();
      await loadSettings();
    }
  }catch(e){
    setText('login-status', e.message || '管理APIに接続できませんでした。', true);
  }
}

async function loginAdmin(){
  setText('login-status', 'ログイン中...');
  const username = document.getElementById('admin-username').value.trim();
  const password = document.getElementById('admin-password').value;
  try{
    const res = await fetch('./api.php?action=admin_login', {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username, password})
    });
    const json = await readJson(res);
    if(!res.ok || !json.ok) throw new Error(json.error || 'ログインできませんでした。');
    showAdminApp();
    await loadSettings();
  }catch(e){
    setText('login-status', e.message, true);
  }
}

async function logoutAdmin(){
  await fetch('./api.php?action=admin_logout', {method:'POST', credentials:'include'});
  location.reload();
}

function showAdminApp(){
  loginPanel.classList.add('hidden');
  adminApp.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
}

async function loadSettings(){
  const res = await fetch('./api.php?action=admin_settings', {credentials:'include', cache:'no-store'});
  const json = await readJson(res);
  if(!res.ok || !json.ok) throw new Error(json.error || '設定を読み込めませんでした。');
  adminState = json.data;
  renderSettings();
}

function renderSettings(){
  document.getElementById('members-text').value = (adminState.members || []).map(row => row.name).join('\n');
  document.getElementById('upload-mode').value = adminState.access?.pages?.upload?.mode || 'shared';
  document.getElementById('from-image-mode').value = adminState.access?.pages?.from_image?.mode || 'shared';
  setText('shared-status', adminState.access?.shared_ready ? `共通パスワード設定済み ${adminState.access.shared_updated_at || ''}` : '共通パスワードは未設定です。');
  renderUsers();
  renderSourceImages();
  renderStats();
}

async function saveMembers(){
  const members = document.getElementById('members-text').value
    .split(/\r?\n/)
    .map(name => ({name:name.trim()}))
    .filter(row => row.name);
  setText('members-status', '保存中...');
  try{
    const res = await fetch('./api.php?action=admin_save_members', {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({members})
    });
    const json = await readJson(res);
    if(!res.ok || !json.ok) throw new Error(json.error || '保存できませんでした。');
    adminState.members = json.data || members;
    setText('members-status', `${adminState.members.length}人を保存しました。`);
    renderStats();
  }catch(e){
    setText('members-status', e.message, true);
  }
}

async function saveAccessModes(){
  setText('access-status', '保存中...');
  try{
    const pages = {
      upload:{mode:document.getElementById('upload-mode').value},
      from_image:{mode:document.getElementById('from-image-mode').value}
    };
    const res = await fetch('./api.php?action=admin_save_access', {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pages})
    });
    const json = await readJson(res);
    if(!res.ok || !json.ok) throw new Error(json.error || '保存できませんでした。');
    adminState.access.pages = pages;
    setText('access-status', '権限モードを保存しました。');
  }catch(e){
    setText('access-status', e.message, true);
  }
}

async function saveSharedPassword(){
  const password = document.getElementById('shared-password').value;
  setText('shared-status', '保存中...');
  try{
    const res = await fetch('./api.php?action=admin_set_shared_password', {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password})
    });
    const json = await readJson(res);
    if(!res.ok || !json.ok) throw new Error(json.error || '保存できませんでした。');
    document.getElementById('shared-password').value = '';
    await loadSettings();
    setText('shared-status', '共通パスワードを保存しました。');
  }catch(e){
    setText('shared-status', e.message, true);
  }
}

async function saveUser(){
  setText('user-status', '保存中...');
  const password = document.getElementById('user-password').value;
  if(password && password.length < 8){
    setText('user-status', 'パスワードは8文字以上にしてください。', true);
    return;
  }
  const payload = {
    id:document.getElementById('user-id').value,
    username:document.getElementById('user-username').value.trim(),
    display_name:document.getElementById('user-display-name').value.trim(),
    password,
    status:'active',
    permissions:{
      upload:document.getElementById('perm-upload').checked,
      from_image:document.getElementById('perm-from-image').checked
    }
  };
  try{
    const res = await fetch('./api.php?action=admin_save_user', {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const json = await readJson(res);
    if(!res.ok || !json.ok) throw new Error(json.error || '保存できませんでした。');
    clearUserForm();
    await loadSettings();
    setText('user-status', '協力者ユーザーを保存しました。');
  }catch(e){
    setText('user-status', e.message, true);
  }
}

function editUser(id){
  const row = (adminState.access?.users || []).find(user => user.id === id);
  if(!row) return;
  document.getElementById('user-id').value = row.id;
  document.getElementById('user-username').value = row.username || '';
  document.getElementById('user-display-name').value = row.display_name || '';
  document.getElementById('user-password').value = '';
  document.getElementById('perm-upload').checked = !!row.permissions?.upload;
  document.getElementById('perm-from-image').checked = !!row.permissions?.from_image;
  setText('user-status', '編集中です。パスワードを空欄にすると変更しません。');
}

function clearUserForm(){
  ['user-id','user-username','user-display-name','user-password'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('perm-upload').checked = true;
  document.getElementById('perm-from-image').checked = true;
}

async function deleteUser(id){
  if(!confirm('この協力者ユーザーを削除しますか？')) return;
  const res = await fetch('./api.php?action=admin_delete_user', {
    method:'POST',
    credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id})
  });
  const json = await readJson(res);
  if(!res.ok || !json.ok) {
    setText('user-status', json.error || '削除できませんでした。', true);
    return;
  }
  await loadSettings();
}

function renderUsers(){
  const rows = adminState.access?.users || [];
  const list = document.getElementById('users-list');
  if(!rows.length){
    list.innerHTML = '<div class="empty-result">協力者ユーザーは未登録です。</div>';
    return;
  }
  list.innerHTML = rows.map(row => `<div class="access-user-row">
    <div>
      <div class="access-user-name">${escapeHtml(row.display_name || row.username)}</div>
      <div class="access-user-meta">${escapeHtml(row.username)} / Upload ${row.permissions?.upload ? 'on' : 'off'} / Folder ${row.permissions?.from_image ? 'on' : 'off'}</div>
    </div>
    <div class="access-user-actions">
      <button class="button soft" type="button" onclick="editUser('${escapeAttr(row.id)}')">編集</button>
      <button class="button" type="button" onclick="deleteUser('${escapeAttr(row.id)}')">削除</button>
    </div>
  </div>`).join('');
}

async function uploadSourceImages(){
  const files = Array.from(sourceInput.files || []);
  if(!files.length) return;
  setText('source-status', 'アップロード中...');
  const form = new FormData();
  files.forEach(file => form.append('images[]', file));
  try{
    const res = await fetch('./api.php?action=admin_upload_source_images', {
      method:'POST',
      credentials:'include',
      body:form
    });
    const json = await readJson(res);
    if(!res.ok || !json.ok) throw new Error(json.error || 'アップロードできませんでした。');
    adminState.source_images = json.data || [];
    renderSourceImages();
    setText('source-status', `${json.saved?.length || 0}枚を追加しました。`);
  }catch(e){
    setText('source-status', e.message, true);
  }finally{
    sourceInput.value = '';
  }
}

async function deleteSourceImage(id){
  if(!confirm('この画像を削除しますか？')) return;
  const res = await fetch('./api.php?action=admin_delete_source_image', {
    method:'POST',
    credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id})
  });
  const json = await readJson(res);
  if(!res.ok || !json.ok){
    setText('source-status', json.error || '削除できませんでした。', true);
    return;
  }
  adminState.source_images = json.data || [];
  renderSourceImages();
}

function renderSourceImages(){
  const rows = adminState.source_images || [];
  const list = document.getElementById('source-list');
  if(!rows.length){
    list.innerHTML = '<div class="empty-result">フォルダ学習用画像は未登録です。</div>';
    return;
  }
  list.innerHTML = rows.map(row => `<div class="access-user-row">
    <div>
      <div class="access-user-name">${escapeHtml(row.name)}</div>
      <div class="access-user-meta">${Math.round((row.size || 0) / 1024)} KB / ${escapeHtml((row.updated_at || '').slice(0,10))}</div>
    </div>
    <div class="access-user-actions">
      <button class="button" type="button" onclick="deleteSourceImage('${escapeAttr(row.id)}')">削除</button>
    </div>
  </div>`).join('');
}

function renderStats(){
  const stats = adminState.stats || {};
  const members = adminState.members || [];
  document.getElementById('stats').innerHTML = members.map(member => {
    const row = stats[member.name] || {count:0, updated_at:''};
    const count = Number(row.count || 0);
    return `<div class="stat-card">
      <div class="stat-name">${escapeHtml(member.name)}</div>
      <div class="stat-count">${count}</div>
      <div class="stat-date">${row.updated_at ? escapeHtml(row.updated_at.slice(0,10)) : '未登録'}</div>
      <button class="button stat-reset" type="button" onclick="resetMember(decodeURIComponent('${encodeURIComponent(member.name)}'), ${count})" ${count ? '' : 'disabled'}>リセット</button>
    </div>`;
  }).join('');
}

async function resetMember(member, count){
  if(!count) return;
  if(!confirm(`${member}の学習データ ${count}件を削除します。続行しますか？`)) return;
  if(!confirm(`最終確認です。${member}だけをリセットします。元に戻せません。`)) return;
  const res = await fetch('./api.php?action=reset_member_descriptors', {
    method:'POST',
    credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({member})
  });
  const json = await readJson(res);
  if(!res.ok || !json.ok){
    alert(json.error || 'リセットできませんでした。');
    return;
  }
  await loadSettings();
}

async function readJson(res){
  try{return await res.json();}catch(e){return {ok:false, error:'JSONを読み込めませんでした。'};}
}

function setText(id, text, error=false){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = text;
  el.style.color = error ? '#ef4444' : '#9ca3af';
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function escapeAttr(str){
  return escapeHtml(str).replace(/`/g, '&#96;');
}
