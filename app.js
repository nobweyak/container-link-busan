import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore, collection, addDoc, getDocs, query, where,
  updateDoc, doc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const root = document.querySelector('#app');
const toast = document.querySelector('#toast');
const firebase = initializeApp(firebaseConfig);
const auth = getAuth(firebase);
const db = getFirestore(firebase);
const state = {
  user: null,
  role: '',
  types: ['DRY'],
  sizes: ['20FT', '40FT'],
  condition: '정상',
  selected: null,
  photoData: '',
  photoName: '',
  hidden: new Set()
};
let connectionPromise = null;
let toastTimer = null;

const account = () => sessionStorage.getItem('container-link-active-account') || '';
function accountName() {
  const email = account();
  try {
    const profile = JSON.parse(localStorage.getItem(`container-link-member:${email}`) || 'null');
    if (profile?.name?.trim()) return profile.name.trim();
  } catch (error) { console.warn('회원 이름을 읽지 못했습니다.', error); }
  const demoNames = {
    'carrier-demo@containerlink.kr': '김기사',
    'requester-demo@containerlink.kr': '이배차'
  };
  return demoNames[email] || email.split('@')[0] || '회원';
}
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);
const say = (message) => {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
};
const waitLimit = (promise, milliseconds = 9000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('요청 시간이 초과되었습니다.')), milliseconds))
]);

async function connect() {
  if (state.user) return true;
  if (auth.currentUser) { state.user = auth.currentUser; return true; }
  if (connectionPromise) return connectionPromise;
  connectionPromise = signInAnonymously(auth)
    .then(({ user }) => { state.user = user; return true; })
    .catch((error) => { console.error(error); say('Firebase 연결에 실패했습니다. 인터넷 연결을 확인해 주세요.'); return false; })
    .finally(() => { connectionPromise = null; });
  return connectionPromise;
}

const header = (title) => `<header><button type="button" id="back" aria-label="뒤로">‹</button><b>${escapeHtml(title)}</b><button type="button" id="home" aria-label="홈">⌂</button></header>`;
function bindHeader(back) {
  document.querySelector('#back').onclick = back;
  document.querySelector('#home').onclick = dashboard;
}
function toggle(values, value) {
  return values.includes(value)
    ? (values.length > 1 ? values.filter((item) => item !== value) : values)
    : [...values, value];
}

function login() {
  root.innerHTML = `<section class="login-view">
    <div class="logo"><img src="assets/connext-logo.png" alt="CONNEXT 로고"><span>CONNEXT</span></div>
    <div class="login-copy"><p>빈 컨테이너의 이동을 연결하다</p><h1>공컨 매칭부터<br>검수·승인까지</h1><p class="muted">부산항 공컨테이너 실시간 매칭 플랫폼</p></div>
    <label>이메일<input id="email" value="demo@containerlink.kr" autocomplete="username"></label>
    <label>비밀번호<input id="password" type="password" value="1234" autocomplete="current-password"></label>
    <section class="demo-accounts"><b>시연용 테스트 계정</b>
      <button type="button" data-account="carrier-demo@containerlink.kr"><span>공컨 운반자</span><small>carrier-demo@containerlink.kr</small></button>
      <button type="button" data-account="requester-demo@containerlink.kr"><span>컨테이너 필요자</span><small>requester-demo@containerlink.kr</small></button>
    </section>
    <button class="button main" id="signin">로그인</button>
    <button class="button ghost signup-link" id="signup">회원가입</button>
    <small>시연용 앱입니다. 실제 개인정보는 입력하지 마세요.</small>
  </section>`;
  document.querySelectorAll('[data-account]').forEach((button) => {
    button.onclick = () => { document.querySelector('#email').value = button.dataset.account; document.querySelector('#password').value = '1234'; };
  });
  document.querySelector('#signin').onclick = () => {
    const email = document.querySelector('#email').value.trim();
    if (!email) return say('이메일을 입력해 주세요.');
    sessionStorage.setItem('container-link-active-account', email);
    roleSelect();
    connect();
  };
  document.querySelector('#signup').onclick = signup;
}

function signup() {
  root.innerHTML = `${header('회원가입')}<section class="form-view signup-view">
    <h1>CONNEXT 회원가입</h1><p class="muted">시연에 사용할 정보를 입력해 주세요.</p>
    <label>이름<input id="signupName" required></label>
    <label>이메일<input id="signupEmail" type="email" required></label>
    <label>비밀번호<input id="signupPassword" type="password" minlength="4" required></label>
    <label class="check"><input id="termsAgree" type="checkbox"><span>이용약관·개인정보·위치정보 이용에 동의합니다. (필수)</span></label>
    <button type="button" class="button ghost" id="viewTerms">약관 전문 보기</button>
    <button type="button" class="button main" id="createAccount">동의하고 회원가입</button>
  </section>`;
  bindHeader(login);
  document.querySelector('#viewTerms').onclick = () => window.open('terms.html', 'container-link-terms', 'width=760,height=760');
  document.querySelector('#createAccount').onclick = () => {
    const name = document.querySelector('#signupName').value.trim();
    const email = document.querySelector('#signupEmail').value.trim();
    const password = document.querySelector('#signupPassword').value;
    if (!name) return say('이름을 입력해 주세요.');
    if (!email || password.length < 4) return say('이메일과 4자 이상의 비밀번호를 입력해 주세요.');
    if (!document.querySelector('#termsAgree').checked) return say('필수 약관에 동의해 주세요.');
    localStorage.setItem(`container-link-member:${email}`, JSON.stringify({
      name, email, consentedAt: new Date().toISOString()
    }));
    sessionStorage.setItem('container-link-active-account', email);
    say('회원가입이 완료되었습니다.');
    roleSelect();
    connect();
  };
}

function roleSelect() {
  root.innerHTML = `<section class="role-view">
    <div class="logo"><img src="assets/connext-logo.png" alt="CONNEXT 로고"><span>CONNEXT</span></div>
    <div class="progress"><i></i><i class="on"></i><i></i></div>
    <p class="eyebrow">업무 선택</p><h1>어떤 업무를<br>하시나요?</h1>
    <button class="role-card carrier" id="carrier"><img class="role-visual" src="assets/role.png" alt="파란색 컨테이너 트럭"><b>공컨테이너 운반자</b><em>›</em></button>
    <button class="role-card requester" id="requester"><img class="role-visual" src="assets/role.png" alt="주황색 컨테이너"><b>컨테이너가 필요해요</b><em>›</em></button>
  </section>`;
  document.querySelector('#carrier').onclick = () => chooseRole('carrier');
  document.querySelector('#requester').onclick = () => chooseRole('requester');
}

function chooseRole(role) {
  state.role = role;
  localStorage.setItem('container-link-role', role);
  dashboard();
}

async function loadForDashboard() {
  if (!await connect()) return [];
  const field = state.role === 'requester' ? 'requesterAccount' : 'carrierAccount';
  try {
    const snapshot = await waitLimit(getDocs(query(collection(db, 'containerRequests'), where(field, '==', account()))));
    return snapshot.docs.map((row) => ({ id: row.id, ...row.data() }));
  } catch (error) {
    console.error('내 거래 조회 실패', error);
    say('내 거래를 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.');
    return [];
  }
}

const statusLabel = (status) => ({
  open: '매칭 대기', approval: '승인 대기', review: '승인 요청 도착', confirmed: '매칭 확정', rejected: '매칭 반려'
})[status] || '진행 중';
const statusRank = { confirmed: 0, review: 1, approval: 2, open: 3, rejected: 4 };

function dashboardCard(item) {
  const actionable = state.role === 'requester' && ['approval', 'review'].includes(item.status);
  return `<button type="button" class="mini-card ${actionable ? 'actionable' : ''}" data-dashboard-id="${escapeHtml(item.id)}">
    <div><b>${escapeHtml(item.size)} ${escapeHtml(item.type)}</b><span>${escapeHtml(item.pickup)} → ${escapeHtml(item.returnPlace)}</span><small>${Number(item.price || 0).toLocaleString('ko-KR')}원</small></div>
    <em class="state ${escapeHtml(item.status)}">${statusLabel(item.status)}</em>
  </button>`;
}

async function dashboard() {
  root.innerHTML = `<section class="dashboard dashboard-loading"><div class="loading-panel"><span class="spinner"></span><b>내 거래를 불러오는 중입니다</b><small>최대 9초 안에 자동으로 종료됩니다.</small></div></section>`;
  const rows = await loadForDashboard();
  rows.sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9));
  const visibleRows = state.role === 'carrier' ? rows.filter((item) => item.status !== 'open') : rows;
  root.innerHTML = `<section class="dashboard">
    <div class="top"><div><p class="eyebrow">${state.role === 'carrier' ? '공컨테이너 운반자' : '컨테이너 필요자'}</p><h1>안녕하세요.<br>${escapeHtml(accountName())}님</h1></div><button id="switch">역할 변경</button></div>
    <div class="hero"><span>CONNEXT</span><b>${visibleRows.length}<small> 건</small></b><p>${state.role === 'carrier' ? '내가 진행 중인 운송' : '내가 등록한 요청과 승인 현황'}</p></div>
    <div class="section-heading"><h2>${state.role === 'carrier' ? '진행 중 운송' : '내 요청 목록'}</h2><button type="button" id="refresh">새로고침</button></div>
    <div class="mine-list">${visibleRows.length ? visibleRows.map(dashboardCard).join('') : '<div class="empty">현재 표시할 거래가 없습니다.</div>'}</div>
    <button class="action-row" id="action"><span>＋</span><div><b>${state.role === 'carrier' ? '매칭 찾기' : '공컨테이너 요청 등록'}</b></div><em>›</em></button>
  </section>`;
  document.querySelector('#switch').onclick = roleSelect;
  document.querySelector('#refresh').onclick = dashboard;
  document.querySelector('#action').onclick = () => spec(state.role);
  document.querySelectorAll('[data-dashboard-id]').forEach((button) => {
    button.onclick = () => {
      const item = visibleRows.find((row) => row.id === button.dataset.dashboardId);
      if (state.role === 'requester' && ['approval', 'review'].includes(item?.status)) requesterReview(item);
      else say(statusLabel(item?.status));
    };
  });
}

function spec(role) {
  const carrier = role === 'carrier';
  const types = ['DRY', 'REEFER', 'OPEN TOP', 'FLAT RACK'];
  root.innerHTML = `${header(carrier ? '운반 조건 선택' : '필요 조건 선택')}<section class="form-view">
    <div class="step">2 / 3 <span></span></div>
    <h1>${carrier ? '운반 가능한' : '필요한'} 컨테이너를<br>선택해 주세요</h1>
    <p class="muted">여러 조건을 동시에 선택할 수 있습니다.</p>
    <h3>컨테이너 타입 <small class="multi-hint">복수 선택</small></h3>
    <div class="option-grid type-grid">${types.map((type) => `<button type="button" class="option ${state.types.includes(type) ? 'selected' : ''}" data-type="${type}">${type}</button>`).join('')}</div>
    <h3>사이즈 <small class="multi-hint">복수 선택</small></h3>
    <div class="option-grid two">${['20FT', '40FT'].map((size) => `<button type="button" class="option ${state.sizes.includes(size) ? 'selected' : ''}" data-size="${size}">${size}</button>`).join('')}</div>
    ${carrier ? `<h3>컨테이너 상태</h3><div class="option-grid two"><button type="button" class="option ${state.condition === '정상' ? 'selected good' : ''}" data-condition="정상">정상</button><button type="button" class="option ${state.condition === '확인 필요' ? 'selected warn' : ''}" data-condition="확인 필요">확인 필요</button></div>` : ''}
    <div class="sticky"><button class="button main" id="next">${carrier ? '이 조건으로 매칭 찾기' : '운송 정보 입력하기'}</button></div>
  </section>`;
  bindHeader(dashboard);
  document.querySelectorAll('[data-type]').forEach((button) => { button.onclick = () => { state.types = toggle(state.types, button.dataset.type); spec(role); }; });
  document.querySelectorAll('[data-size]').forEach((button) => { button.onclick = () => { state.sizes = toggle(state.sizes, button.dataset.size); spec(role); }; });
  document.querySelectorAll('[data-condition]').forEach((button) => { button.onclick = () => { state.condition = button.dataset.condition; spec(role); }; });
  document.querySelector('#next').onclick = () => carrier ? matchList() : requestForm();
}

function requestForm() {
  root.innerHTML = `${header('공컨테이너 요청 등록')}<form class="form-view" id="requestForm">
    <div class="request-summary"><b>${escapeHtml(state.sizes.join(', '))} / ${escapeHtml(state.types.join(', '))}</b><span>선택한 컨테이너 조건</span></div>
    <h2>운송 조건을 입력해 주세요</h2>
    <label>희망 인수 장소<input id="pickup" required placeholder="예: 부산신항"><button type="button" class="address-search-button" data-address="pickup">지도에서 장소 검색</button></label>
    <label>반납지<input id="returnPlace" required placeholder="예: 감만CY"><button type="button" class="address-search-button" data-address="returnPlace">지도에서 장소 검색</button></label>
    <div id="distanceResult" class="distance-result">두 위치를 선택하면 이동 거리를 계산합니다.</div>
    <label>희망 인수 시간<input id="time" type="datetime-local" required></label>
    <label>필요 수량<input id="quantity" type="number" min="1" step="1" value="1" required></label>
    <label>희망 매칭 가격 (원)<input id="price" type="number" min="0" placeholder="예: 80000" required></label>
    <div class="sticky"><button class="button main">요청 등록</button></div>
  </form>`;
  bindHeader(() => spec('requester'));
  document.querySelectorAll('[data-address]').forEach((button) => { button.onclick = () => openAddressPicker(button.dataset.address); });
  document.querySelector('#requestForm').onsubmit = saveRequest;
}

async function saveRequest(event) {
  event.preventDefault();
  if (!await connect()) return;
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"], .sticky button');
  submit.disabled = true;
  submit.textContent = '등록 중…';
  try {
    await waitLimit(addDoc(collection(db, 'containerRequests'), {
      ownerId: state.user.uid,
      requesterAccount: account(),
      type: state.types[0], size: state.sizes[0],
      acceptableTypes: state.types, acceptableSizes: state.sizes,
      condition: '미검수',
      pickup: form.querySelector('#pickup').value.trim(),
      returnPlace: form.querySelector('#returnPlace').value.trim(),
      pickupLat: Number(form.querySelector('#pickup').dataset.latitude || 0),
      pickupLon: Number(form.querySelector('#pickup').dataset.longitude || 0),
      returnLat: Number(form.querySelector('#returnPlace').dataset.latitude || 0),
      returnLon: Number(form.querySelector('#returnPlace').dataset.longitude || 0),
      distanceKm: Number(document.querySelector('#distanceResult').dataset.distance || 0),
      time: form.querySelector('#time').value,
      quantity: Number(form.querySelector('#quantity').value),
      price: Number(form.querySelector('#price').value),
      status: 'open', createdAt: serverTimestamp()
    }));
    say('요청이 Firebase에 등록되었습니다.');
    dashboard();
  } catch (error) {
    console.error(error);
    say('요청 저장에 실패했습니다. Firestore 권한을 확인해 주세요.');
    submit.disabled = false;
    submit.textContent = '요청 등록';
  }
}

async function matchList() {
  root.innerHTML = `${header('매칭 찾기')}<section class="match-view">
    <div class="filters"><button class="active">${escapeHtml(state.types.join(' · '))}</button><button>${escapeHtml(state.sizes.join(' · '))}</button></div>
    <div id="matchResults" class="results"><p class="loading">조건에 맞는 요청을 불러오는 중…</p></div>
  </section>`;
  bindHeader(() => spec('carrier'));
  let rows = [];
  try {
    if (!await connect()) throw new Error('Firebase 인증 실패');
    const result = await waitLimit(getDocs(query(collection(db, 'containerRequests'), where('status', '==', 'open'))));
    rows = result.docs.map((row) => ({ id: row.id, ...row.data() })).filter((item) => {
      const types = item.acceptableTypes || [item.type];
      const sizes = item.acceptableSizes || [item.size];
      return !state.hidden.has(item.id) && state.types.some((type) => types.includes(type)) && state.sizes.some((size) => sizes.includes(size));
    });
  } catch (error) {
    console.error(error);
    say('매칭 요청을 불러오지 못했습니다.');
  }
  const box = document.querySelector('#matchResults');
  box.innerHTML = rows.length ? rows.map((item, index) => `<button type="button" class="match-card" data-id="${escapeHtml(item.id)}">
    <span class="rank">${index + 1}</span><div><b>${escapeHtml(item.pickup)} <i>→</i> ${escapeHtml(item.returnPlace)}</b><small>${escapeHtml(item.size)} ${escapeHtml(item.type)} · ${Number(item.price || 0).toLocaleString('ko-KR')}원</small><em>매칭 가능</em></div><strong>${Math.max(70, 96 - index * 3)}<small>매칭도</small></strong>
  </button>`).join('') : '<div class="empty">선택한 조건에 맞는 요청이 없습니다.</div>';
  box.querySelectorAll('[data-id]').forEach((button) => { button.onclick = () => { state.selected = rows.find((item) => item.id === button.dataset.id); detail(); }; });
}

function detail() {
  const item = state.selected;
  if (!item) return matchList();
  root.innerHTML = `${header('매칭 적합도 상세')}<section class="detail">
    <div class="route"><span>${escapeHtml(item.pickup)} → ${escapeHtml(item.returnPlace)}</span><b>${escapeHtml(item.size)} ${escapeHtml(item.type)}</b><small>${item.distanceKm ? `예상 이동 거리 ${item.distanceKm}km` : '이동 거리 정보 없음'}</small><div><strong>92<small>점</small></strong><em>매우 적합</em></div></div>
    <div class="sticky"><button class="button main" id="requestMatch">이 조건으로 매칭 요청</button><button class="button ghost" id="other">다른 매칭 보기</button></div>
  </section>`;
  bindHeader(matchList);
  document.querySelector('#requestMatch').onclick = approval;
  document.querySelector('#other').onclick = matchList;
}

function approval() {
  const item = state.selected;
  root.innerHTML = `${header('재사용 승인 요청')}<section class="approval">
    <div class="approval-hero"><span>재사용 승인 요청</span><b>${escapeHtml(item.pickup)} → ${escapeHtml(item.returnPlace)}</b><small>${escapeHtml(item.size)} ${escapeHtml(item.type)}</small></div>
    <h2>선사 제출 정보</h2>
    <details><summary>컨테이너 정보 직접 확인·입력</summary><label>컨테이너 번호<input id="containerNumber" placeholder="예: OOLU1234567"></label><label>인수 기사 정보<input id="driverInfo" value="${escapeHtml(account())}"></label><label>이동 경로<input id="routeInfo" value="${escapeHtml(item.pickup)} → ${escapeHtml(item.returnPlace)}"></label></details>
    <label>선사 선택<select id="shippingLine"><option>HMM</option><option>OOCL</option><option>Maersk</option><option>기타</option></select></label>
    <p class="notice">승인 전에는 배차가 최종 확정되지 않습니다.</p>
    <button class="button main" id="sendApproval">선사에 승인 요청 보내기</button>
  </section>`;
  bindHeader(detail);
  document.querySelector('#sendApproval').onclick = sendApproval;
}

async function sendApproval() {
  const button = document.querySelector('#sendApproval');
  button.disabled = true;
  button.textContent = '승인 요청 전송 중…';
  try {
    if (!await connect()) throw new Error('Firebase 인증 실패');
    await waitLimit(updateDoc(doc(db, 'containerRequests', state.selected.id), {
      status: 'approval', carrierAccount: account(),
      shippingLine: document.querySelector('#shippingLine').value,
      containerNumber: document.querySelector('#containerNumber').value.trim(),
      driverInfo: document.querySelector('#driverInfo').value.trim(),
      routeInfo: document.querySelector('#routeInfo').value.trim(),
      approvalRequestedAt: new Date().toISOString()
    }));
    state.selected.status = 'approval';
    say('승인 요청이 저장되었습니다. 이어서 검수 사진을 촬영해 주세요.');
    inspection();
  } catch (error) {
    console.error(error);
    say('승인 요청 저장에 실패했습니다. Firestore 수정 권한을 확인해 주세요.');
    button.disabled = false;
    button.textContent = '선사에 승인 요청 보내기';
  }
}

function inspection() {
  root.innerHTML = `${header('컨테이너 상태 촬영')}<section class="inspection">
    <button type="button" class="capture-frame" id="capture"><span>＋</span><b>컨테이너 사진 촬영</b><small>카메라 또는 사진 보관함을 이용해 주세요.</small><img id="preview" class="hidden" alt="선택한 컨테이너 사진"></button>
    <input id="photo" type="file" accept="image/*" capture="environment" hidden>
    <p class="photo-policy">앱이 사진을 640px 이하로 압축해 전송합니다. 원본 사진은 Firestore에 저장하지 않습니다.</p>
    <button class="button main" id="sendReport">사진 및 검수 자료 전송</button>
  </section>`;
  bindHeader(approval);
  document.querySelector('#capture').onclick = () => document.querySelector('#photo').click();
  document.querySelector('#photo').onchange = preparePhoto;
  document.querySelector('#sendReport').onclick = sendInspection;
}

async function preparePhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const preview = document.querySelector('#preview');
  const capture = document.querySelector('#capture');
  capture.classList.add('processing');
  try {
    state.photoData = await compressImage(file);
    state.photoName = file.name;
    preview.src = state.photoData;
    preview.classList.remove('hidden');
    say('사진을 전송용으로 압축했습니다.');
  } catch (error) {
    console.error(error);
    state.photoData = '';
    say('사진을 처리하지 못했습니다. 다른 사진을 선택해 주세요.');
  } finally {
    capture.classList.remove('processing');
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지 읽기 실패')); };
    image.src = url;
  });
}

async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일이 아닙니다.');
  const image = await loadImage(file);
  const maxSide = 640;
  const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.62;
  let data = canvas.toDataURL('image/jpeg', quality);
  while (data.length > 180000 && quality > 0.34) {
    quality -= 0.08;
    data = canvas.toDataURL('image/jpeg', quality);
  }
  if (data.length > 240000) throw new Error('압축 후에도 사진이 너무 큽니다.');
  return data;
}

async function sendInspection() {
  if (!state.photoData) return say('먼저 사진을 촬영하거나 선택해 주세요.');
  const button = document.querySelector('#sendReport');
  button.disabled = true;
  button.textContent = '검수 자료 전송 중…';
  try {
    await waitLimit(updateDoc(doc(db, 'containerRequests', state.selected.id), {
      status: 'review', carrierAccount: account(),
      inspectionPhoto: state.photoData,
      inspectionPhotoBytes: state.photoData.length,
      inspectionPhotoName: state.photoName,
      inspectionSentAt: new Date().toISOString()
    }));
    state.photoData = '';
    state.photoName = '';
    say('검수 자료가 해당 컨테이너 필요자에게 전송되었습니다.');
    dashboard();
  } catch (error) {
    console.error(error);
    say('검수 자료 전송에 실패했습니다. Firebase 권한을 확인해 주세요.');
    button.disabled = false;
    button.textContent = '사진 및 검수 자료 전송';
  }
}

function requesterReview(item) {
  const hasPhoto = typeof item.inspectionPhoto === 'string' && item.inspectionPhoto.startsWith('data:image/');
  root.innerHTML = `${header('검수 사진 확인')}<section class="confirm review-view">
    <div class="confirm-head"><span>운반자 승인 요청</span><b>${escapeHtml(item.size)} ${escapeHtml(item.type)}</b><small>${escapeHtml(item.pickup)} → ${escapeHtml(item.returnPlace)}</small></div>
    <h2>컨테이너 검수 사진</h2>
    <img class="review-photo" id="reviewPhoto" alt="운반자가 보낸 컨테이너 검수 사진">
    <div class="result"><span>${hasPhoto ? '✓' : '!'}</span><div><b>${hasPhoto ? '검수 자료가 도착했습니다' : '승인 요청이 도착했습니다'}</b><small>${hasPhoto ? '사진을 확인한 후 최종 결정을 내려 주세요.' : '검수 사진은 아직 없지만 요청을 수락하거나 반려할 수 있습니다.'}</small></div></div>
    <label class="check"><input id="reviewChecked" type="checkbox"><span>요청과 상태 정보를 확인했습니다.</span></label>
    <button class="button ghost danger" id="rejectRequest">매칭 반려</button>
    <button class="button main" id="acceptRequest">매칭 최종 확정</button>
  </section>`;
  bindHeader(dashboard);
  const photo = document.querySelector('#reviewPhoto');
  if (hasPhoto) photo.src = item.inspectionPhoto;
  else { photo.replaceWith(Object.assign(document.createElement('div'), { className: 'photo-missing', textContent: '운반자가 검수 사진을 아직 전송하지 않았습니다.' })); }
  document.querySelector('#rejectRequest').onclick = () => decideRequest(item, 'rejected');
  document.querySelector('#acceptRequest').onclick = () => {
    if (!document.querySelector('#reviewChecked').checked) return say('요청과 상태 정보를 확인해 주세요.');
    decideRequest(item, 'confirmed');
  };
}

async function decideRequest(item, status) {
  const buttons = document.querySelectorAll('#rejectRequest, #acceptRequest');
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await waitLimit(updateDoc(doc(db, 'containerRequests', item.id), {
      status,
      requesterDecisionAt: new Date().toISOString(),
      transportStatus: status === 'confirmed' ? '매칭 확정' : '매칭 반려'
    }));
    say(status === 'confirmed' ? '매칭이 최종 확정되었습니다.' : '매칭을 반려했습니다.');
    dashboard();
  } catch (error) {
    console.error(error);
    say('처리에 실패했습니다. Firebase 수정 권한을 확인해 주세요.');
    buttons.forEach((button) => { button.disabled = false; });
  }
}

const BUSAN_PLACES = [
  { name: '부산신항', road: '부산광역시 강서구 신항남로 372', lat: 35.0786, lon: 128.8324 },
  { name: '감만CY', road: '부산광역시 남구 북항로 1', lat: 35.1153, lon: 129.0836 },
  { name: '부산항 북항', road: '부산광역시 동구 충장대로 206', lat: 35.1142, lon: 129.0459 }
];

function openAddressPicker(targetId) {
  const target = document.querySelector(`#${targetId}`);
  const modal = document.createElement('div');
  modal.className = 'address-modal';
  modal.innerHTML = `<section role="dialog" aria-modal="true"><header><b>장소와 도로명 주소 검색</b><button type="button" id="closeAddress">×</button></header><form class="address-query"><input id="addressQuery" placeholder="예: 부산신항"><button>검색</button></form><div class="address-results"><p>장소명을 입력해 주세요.</p></div></section>`;
  document.body.append(modal);
  const close = () => modal.remove();
  modal.querySelector('#closeAddress').onclick = close;
  modal.onclick = (event) => { if (event.target === modal) close(); };
  modal.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();
    const keyword = modal.querySelector('#addressQuery').value.trim();
    if (!keyword) return;
    const resultBox = modal.querySelector('.address-results');
    resultBox.innerHTML = '<p>도로명 주소를 검색하는 중…</p>';
    let places = [];
    try {
      const response = await waitLimit(fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&accept-language=ko&q=${encodeURIComponent(keyword)}`), 7000);
      if (!response.ok) throw new Error('주소 검색 실패');
      places = await response.json();
    } catch (error) { console.warn(error); }
    if (!places.length) {
      const normalized = keyword.replace(/\s/g, '').toLowerCase();
      places = BUSAN_PLACES.filter((place) => place.name.replace(/\s/g, '').toLowerCase().includes(normalized) || normalized.includes(place.name.replace(/\s/g, '').toLowerCase())).map((place) => ({ display_name: `${place.road} (${place.name})`, lat: place.lat, lon: place.lon }));
    }
    renderAddressResults(resultBox, places, target, close);
  };
}

function renderAddressResults(box, places, target, close) {
  if (!places.length) { box.innerHTML = '<p>검색 결과가 없습니다. 더 구체적인 장소명이나 주소를 입력해 주세요.</p>'; return; }
  box.innerHTML = places.map((place, index) => `<article><b>${escapeHtml(place.display_name)}</b><button type="button" data-place="${index}">지도에서 확인</button></article>`).join('');
  box.querySelectorAll('[data-place]').forEach((button) => {
    button.onclick = () => {
      const place = places[Number(button.dataset.place)];
      const row = button.closest('article');
      row.innerHTML = `<b>${escapeHtml(place.display_name)}</b><iframe title="선택 위치 지도" src="https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=${Number(place.lat)}%2C${Number(place.lon)}"></iframe><button type="button" class="address-confirm">이 주소로 선택</button>`;
      row.querySelector('.address-confirm').onclick = () => {
        target.value = place.display_name;
        target.dataset.latitude = place.lat;
        target.dataset.longitude = place.lon;
        updateDistance();
        close();
      };
    };
  });
}

function updateDistance() {
  const pickup = document.querySelector('#pickup');
  const destination = document.querySelector('#returnPlace');
  const result = document.querySelector('#distanceResult');
  if (!pickup?.dataset.latitude || !destination?.dataset.latitude || !result) return;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const lat1 = Number(pickup.dataset.latitude); const lat2 = Number(destination.dataset.latitude);
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(Number(destination.dataset.longitude) - Number(pickup.dataset.longitude));
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  const straight = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const estimate = Math.round(straight * 1.25 * 10) / 10;
  result.dataset.distance = estimate;
  result.textContent = `예상 도로 이동 거리 약 ${estimate}km`;
}

login();
