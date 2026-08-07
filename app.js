import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore, collection, addDoc, getDocs, query, where,
  updateDoc, getDoc, setDoc, onSnapshot, doc, serverTimestamp
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
let stopLocationRequestListener = null;
let lastHandledLocationRequest = '';
let tmapKeyPromise = null;

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
  if (auth.currentUser) { state.user = auth.currentUser; resolveTmapAppKey(); return true; }
  if (connectionPromise) return connectionPromise;
  connectionPromise = signInAnonymously(auth)
    .then(({ user }) => { state.user = user; resolveTmapAppKey(); return true; })
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
      <button type="button" data-account="requester-demo@containerlink.kr"><span>공컨테이너 수요자</span><small>requester-demo@containerlink.kr</small></button>
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
    <button class="role-card requester" id="requester"><img class="role-visual" src="assets/role.png" alt="주황색 컨테이너"><b>공컨테이너 수요자</b><em>›</em></button>
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
  open: '매칭 대기', approval: '승인 대기', review: '승인 요청 도착', reinspection: '재촬영 요청', confirmed: '매칭 확정', completed: '운반 완료', rejected: '매칭 반려'
})[status] || '진행 중';
const statusRank = { confirmed: 0, review: 1, reinspection: 2, approval: 3, open: 4, rejected: 5, completed: 6 };
const TRUST_BASE_TEMPERATURE = 36.5;
const TRUST_RATINGS = {
  5: { label: '매우 만족', delta: 1.0 },
  4: { label: '만족', delta: 0.5 },
  3: { label: '보통', delta: 0 },
  2: { label: '아쉬움', delta: -0.5 },
  1: { label: '매우 아쉬움', delta: -1.0 }
};

function trustTemperature(rows) {
  const change = rows
    .filter((item) => item.status === 'completed')
    .reduce((total, item) => {
      const delta = Number(item.connextTrustDelta || 0);
      return total + (Number.isFinite(delta) ? delta : 0);
    }, 0);
  return Math.max(0, Math.min(100, TRUST_BASE_TEMPERATURE + change));
}

async function loadCarrierTrust(carrierAccount) {
  if (!carrierAccount || !await connect()) return null;
  try {
    const snapshot = await waitLimit(getDocs(query(collection(db, 'containerRequests'), where('carrierAccount', '==', carrierAccount))));
    const rows = snapshot.docs.map((row) => row.data());
    return {
      temperature: trustTemperature(rows),
      count: rows.filter((row) => row.status === 'completed' && Number(row.connextTrustRating || 0)).length
    };
  } catch (error) {
    console.warn('운반자 신뢰온도 조회 실패', error);
    return null;
  }
}

function dashboardCard(item) {
  const actionable = (state.role === 'requester' && ['approval', 'review'].includes(item.status)) || (state.role === 'carrier' && item.status === 'reinspection');
  const trackable = item.status === 'confirmed';
  return `<button type="button" class="mini-card ${actionable ? 'actionable' : ''} ${trackable ? 'trackable' : ''}" data-dashboard-id="${escapeHtml(item.id)}">
    <div><b>${escapeHtml(item.size)} ${escapeHtml(item.type)}</b><span>${escapeHtml(item.pickup)} → ${escapeHtml(item.returnPlace)}</span><small>${Number(item.price || 0).toLocaleString('ko-KR')}원</small></div>
    <em class="state ${escapeHtml(item.status)}">${trackable ? (state.role === 'carrier' ? 'GPS 공유' : '차량 위치') : statusLabel(item.status)}</em>
  </button>`;
}

async function dashboard() {
  stopAutoLocationResponse();
  root.innerHTML = `<section class="dashboard dashboard-loading"><div class="loading-panel"><span class="spinner"></span><b>내 거래를 불러오는 중입니다</b><small>최대 9초 안에 자동으로 종료됩니다.</small></div></section>`;
  const rows = await loadForDashboard();
  rows.sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9));
  const activeRows = rows.filter((item) => item.status !== 'completed');
  const visibleRows = state.role === 'carrier' ? activeRows.filter((item) => item.status !== 'open') : activeRows;
  const currentTrustTemperature = trustTemperature(rows);
  root.innerHTML = `<section class="dashboard">
    <div class="top"><div><p class="eyebrow">${state.role === 'carrier' ? '공컨테이너 운반자' : '공컨테이너 수요자'}</p><h1>안녕하세요.<br>${escapeHtml(accountName())}님</h1></div><button id="switch">역할 변경</button></div>
    <div class="hero"><span>CONNEXT</span><b>${visibleRows.length}<small> 건</small></b><p>${state.role === 'carrier' ? '내가 진행 중인 운송' : '내가 등록한 요청과 승인 현황'}</p>${state.role === 'carrier' ? `<div class="trust-temperature"><span>CONNEXT 신뢰온도</span><strong>${currentTrustTemperature.toFixed(1)}℃</strong><small>완료 운송 평가 ${rows.filter((item) => item.status === 'completed' && Number(item.connextTrustRating || 0)).length}건 반영</small></div>` : ''}</div>
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
      else if (state.role === 'carrier' && item?.status === 'reinspection') { state.selected = item; inspection(); }
      else if (item?.status === 'confirmed') transportTracking(item);
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
  const isReinspection = state.selected?.status === 'reinspection';
  root.innerHTML = `${header(isReinspection ? '컨테이너 재촬영' : '컨테이너 상태 촬영')}<section class="inspection">
    ${isReinspection ? `<div class="inspection-request"><b>재촬영 요청이 도착했습니다.</b><p>${escapeHtml(state.selected.inspectionReviewNote || '파손 의심 부위를 식별할 수 있도록 밝은 곳에서 다시 촬영해 주세요.')}</p></div>` : ''}
    <button type="button" class="capture-frame" id="capture"><span>＋</span><b>컨테이너 사진 촬영</b><small>카메라 또는 사진 보관함을 이용해 주세요.</small><img id="preview" class="hidden" alt="선택한 컨테이너 사진"></button>
    <input id="photo" type="file" accept="image/*" capture="environment" hidden>
    <p class="photo-policy">앱이 사진을 640px 이하로 압축해 전송합니다. 원본 사진은 Firestore에 저장하지 않습니다.</p>
    <button class="button main" id="sendReport">사진 및 검수 자료 전송</button>
  </section>`;
  bindHeader(isReinspection ? dashboard : approval);
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
      inspectionSentAt: new Date().toISOString(),
      inspectionReviewStatus: 'human_review_pending',
      inspectionRevisionCount: Number(state.selected.inspectionRevisionCount || 0) + (state.selected.status === 'reinspection' ? 1 : 0)
    }));
    state.photoData = '';
    state.photoName = '';
    say('검수 자료가 해당 공컨테이너 수요자에게 전송되었습니다.');
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
  const hasAiResult = typeof item.aiInspectionResult === 'string' && item.aiInspectionResult.trim();
  const aiResult = hasAiResult ? item.aiInspectionResult.trim() : 'AI 미분석';
  root.innerHTML = `${header('검수 사진 확인')}<section class="confirm review-view">
    <div class="confirm-head"><span>운반자 승인 요청</span><b>${escapeHtml(item.size)} ${escapeHtml(item.type)}</b><small>${escapeHtml(item.pickup)} → ${escapeHtml(item.returnPlace)}</small></div>
    <div class="carrier-trust-badge" id="carrierTrustBadge"><span>CONNEXT 신뢰온도</span><b>불러오는 중…</b></div>
    <h2>컨테이너 검수 사진</h2>
    <img class="review-photo" id="reviewPhoto" alt="운반자가 보낸 컨테이너 검수 사진">
    <div class="result"><span>${hasPhoto ? '✓' : '!'}</span><div><b>${hasPhoto ? (hasAiResult ? `AI 1차 분류: ${escapeHtml(aiResult)}` : 'AI 분석 결과 없음 · 사람 확인 필요') : '검수 사진 미도착'}</b><small>${hasPhoto ? 'AI 결과가 있더라도 보조 자료이며 아래 사람 확인이 최종 기록입니다.' : '사진이 도착하기 전에는 매칭을 최종 확정할 수 없습니다.'}</small></div></div>
    <section class="inspection-standard"><h3>판정 기준</h3><dl><div><dt>정상</dt><dd>구멍·균열·심한 변형이 없고 도어, 잠금장치, 코너캐스팅, 바닥에 운송을 방해하는 이상이 없음</dd></div><div><dt>재촬영 필요</dt><dd>사진이 흐리거나 사각지대가 있고, 경미한 찌그러짐·녹·누수 흔적의 범위를 사진만으로 확정하기 어려움</dd></div><div><dt>파손 의심</dt><dd>구멍·균열·심한 찌그러짐, 도어·잠금장치·코너캐스팅 손상, 누수 또는 바닥 파손이 식별됨</dd></div></dl></section>
    <section class="review-decision"><h3>사람의 최종 확인</h3><label>최종 상태<select id="humanInspectionResult"><option value="">선택해 주세요</option><option value="정상">정상</option><option value="재촬영 필요">재촬영 필요</option><option value="파손 의심">파손 의심</option></select></label><label>확인 메모<textarea id="inspectionReviewNote" rows="3" placeholder="AI 결과와 다르거나 재촬영·반려하는 이유를 기록해 주세요."></textarea></label></section>
    <label class="check"><input id="reviewChecked" type="checkbox"><span>사진과 판정 기준을 직접 확인했으며 최종 판단 책임이 사람에게 있음을 확인합니다.</span></label>
    <button class="button ghost" id="requestRetake">사진 재촬영 요청</button>
    <button class="button ghost danger" id="rejectRequest">매칭 반려</button>
    <button class="button main" id="acceptRequest">매칭 최종 확정</button>
  </section>`;
  bindHeader(dashboard);
  loadCarrierTrust(item.carrierAccount).then((trust) => {
    const badge = document.querySelector('#carrierTrustBadge');
    if (!badge) return;
    badge.innerHTML = trust
      ? `<span>CONNEXT 신뢰온도 · 완료 평가 ${trust.count}건</span><b>${trust.temperature.toFixed(1)}℃</b>`
      : '<span>CONNEXT 신뢰온도</span><b>평가 정보 없음</b>';
  });
  const photo = document.querySelector('#reviewPhoto');
  if (hasPhoto) photo.src = item.inspectionPhoto;
  else { photo.replaceWith(Object.assign(document.createElement('div'), { className: 'photo-missing', textContent: '운반자가 검수 사진을 아직 전송하지 않았습니다.' })); }
  document.querySelector('#requestRetake').onclick = () => requestReinspection(item, aiResult, hasAiResult);
  document.querySelector('#rejectRequest').onclick = () => reviewDecision(item, 'rejected', aiResult, hasAiResult, hasPhoto);
  document.querySelector('#acceptRequest').onclick = () => {
    reviewDecision(item, 'confirmed', aiResult, hasAiResult, hasPhoto);
  };
}

function reviewInputs(aiResult, hasAiResult) {
  const humanResult = document.querySelector('#humanInspectionResult').value;
  const note = document.querySelector('#inspectionReviewNote').value.trim();
  if (!document.querySelector('#reviewChecked').checked) { say('사진과 판정 기준을 직접 확인해 주세요.'); return null; }
  if (!humanResult) { say('사람의 최종 상태를 선택해 주세요.'); return null; }
  if (hasAiResult && humanResult !== aiResult && !note) { say('AI 결과와 다른 판단의 근거를 메모해 주세요.'); return null; }
  return { humanResult, note, aiResultAtDecision: aiResult, aiOverridden: Boolean(hasAiResult && humanResult !== aiResult) };
}

function reviewDecision(item, status, aiResult, hasAiResult, hasPhoto) {
  const review = reviewInputs(aiResult, hasAiResult);
  if (!review) return;
  if (status === 'confirmed' && !hasPhoto) return say('검수 사진이 도착한 뒤 최종 확정할 수 있습니다.');
  if (status === 'confirmed' && review.humanResult !== '정상') return say('최종 상태가 정상일 때만 매칭을 확정할 수 있습니다.');
  if (status === 'rejected' && review.humanResult !== '파손 의심') return say('파손 의심을 선택한 경우 매칭을 반려할 수 있습니다.');
  decideRequest(item, status, review);
}

async function requestReinspection(item, aiResult, hasAiResult) {
  const review = reviewInputs(aiResult, hasAiResult);
  if (!review) return;
  if (review.humanResult !== '재촬영 필요') return say('최종 상태에서 재촬영 필요를 선택해 주세요.');
  const buttons = document.querySelectorAll('#requestRetake, #rejectRequest, #acceptRequest');
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await waitLimit(updateDoc(doc(db, 'containerRequests', item.id), {
      status: 'reinspection',
      inspectionReviewStatus: 'retake_requested',
      humanInspectionResult: review.humanResult,
      aiInspectionResultAtDecision: review.aiResultAtDecision,
      inspectionReviewNote: review.note,
      aiResultOverridden: review.aiOverridden,
      humanInspectedBy: account(),
      humanInspectedAt: new Date().toISOString()
    }));
    say('운반자에게 사진 재촬영을 요청했습니다.');
    dashboard();
  } catch (error) {
    console.error(error);
    say('재촬영 요청을 저장하지 못했습니다.');
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function decideRequest(item, status, review) {
  const buttons = document.querySelectorAll('#requestRetake, #rejectRequest, #acceptRequest');
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await waitLimit(updateDoc(doc(db, 'containerRequests', item.id), {
      status,
      requesterDecisionAt: new Date().toISOString(),
      inspectionReviewStatus: status === 'confirmed' ? 'human_confirmed' : 'human_rejected',
      humanInspectionResult: review.humanResult,
      aiInspectionResultAtDecision: review.aiResultAtDecision,
      inspectionReviewNote: review.note,
      aiResultOverridden: review.aiOverridden,
      humanInspectedBy: account(),
      humanInspectedAt: new Date().toISOString(),
      transportStatus: status === 'confirmed' ? '운송 준비' : '매칭 반려',
      ...(status === 'confirmed' ? { locationRequestStatus: 'idle', locationSharingStatus: 'not_started' } : {})
    }));
    say(status === 'confirmed' ? '매칭이 최종 확정되었습니다.' : '매칭을 반려했습니다.');
    dashboard();
  } catch (error) {
    console.error(error);
    say('처리에 실패했습니다. Firebase 수정 권한을 확인해 주세요.');
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function transportTracking(item) {
  if (state.role === 'carrier') carrierLocationScreen(item);
  else requesterLocationScreen(item);
}

async function resolveTmapAppKey() {
  if (tmapKeyPromise) return tmapKeyPromise;
  tmapKeyPromise = (async () => {
    const savedKey = (localStorage.getItem('connext-tmap-app-key') || '').trim();
    if (savedKey) {
      try {
        await waitLimit(setDoc(doc(db, 'containerRequests', '_appConfigTmap'), {
          appKey: savedKey,
          updatedAt: new Date().toISOString()
        }, { merge: true }), 6000);
      } catch (error) {
        console.warn('기존 TMAP 키 공통 설정 이전 실패', error);
      }
      return savedKey;
    }
    try {
      const snapshot = await waitLimit(getDoc(doc(db, 'containerRequests', '_appConfigTmap')), 7000);
      const sharedKey = String(snapshot.data()?.appKey || '').trim();
      if (sharedKey) localStorage.setItem('connext-tmap-app-key', sharedKey);
      return sharedKey;
    } catch (error) {
      console.error('TMAP 공통 설정을 불러오지 못했습니다.', error);
      return '';
    }
  })();
  const key = await tmapKeyPromise;
  if (!key) tmapKeyPromise = null;
  return key;
}

function locationSummary(item) {
  const location = item.carrierLocation;
  if (!location?.latitude || !location?.longitude) return '<div class="tracking-empty"><b>아직 공유된 차량 위치가 없습니다.</b><small>운반자에게 최신 위치를 요청해 주세요.</small></div>';
  const recorded = location.recordedAt ? new Date(location.recordedAt).toLocaleString('ko-KR') : '기록 시각 없음';
  return `<div class="location-summary"><span>● 최신 GPS</span><b>${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}</b><small>${escapeHtml(recorded)} · 정확도 약 ${Math.round(Number(location.accuracy || 0))}m</small></div>`;
}

function requesterLocationScreen(item) {
  root.innerHTML = `${header('차량 위치 확인')}<section class="tracking-view">
    <div class="tracking-head"><span>운송 진행 중</span><b>${escapeHtml(item.pickup)} → ${escapeHtml(item.returnPlace)}</b><small>${escapeHtml(item.size)} ${escapeHtml(item.type)}</small></div>
    ${locationSummary(item)}
    <div id="tmapMap" class="tmap-map"><div class="map-placeholder"><b>TMAP 경로</b><small>${item.carrierLocation ? '경로와 남은 시간을 자동으로 계산하고 있습니다.' : '운반자가 위치를 전송하면 경로를 자동 계산합니다.'}</small></div></div>
    <div id="routeSummary" class="route-summary hidden"></div>
    <button type="button" class="button main" id="requestLocation">운반자에게 최신 위치 요청</button>
    <button type="button" class="button ghost" id="refreshLocation">위치 정보 새로고침</button>
    <button type="button" class="button complete-transport" id="completeTransport">운반 완료</button>
    <p class="location-notice">차량 위치는 확정된 이 거래의 공컨테이너 수요자에게만 표시됩니다. 위치 요청만으로 운반자의 GPS에 강제 접근할 수 없으며 운반자의 동의와 브라우저 위치 권한이 필요합니다.</p>
  </section>`;
  bindHeader(dashboard);
  document.querySelector('#requestLocation').onclick = () => requestCarrierLocation(item);
  document.querySelector('#refreshLocation').onclick = () => refreshTrackingItem(item.id, requesterLocationScreen);
  document.querySelector('#completeTransport').onclick = () => completeTransportScreen(item);
  if (item.carrierLocation) {
    resolveTmapAppKey().then((key) => {
      if (key) renderTmapRoute(item, key);
      else {
        const mapBox = document.querySelector('#tmapMap');
        if (mapBox) mapBox.innerHTML = '<div class="map-placeholder error"><b>경로 서비스 연결 준비 중</b><small>공통 TMAP 설정을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</small></div>';
      }
    });
  }
}

function completeTransportScreen(item) {
  root.innerHTML = `${header('운반 완료 확인')}<section class="completion-view">
    <div class="completion-head"><span>운반 완료</span><b>${escapeHtml(item.pickup)} → ${escapeHtml(item.returnPlace)}</b><small>${escapeHtml(item.size)} ${escapeHtml(item.type)}</small></div>
    <h2>CONNEXT 신뢰온도 평가</h2>
    <p class="completion-guide">공컨테이너 운반자의 시간 준수, 소통, 컨테이너 인계 상태를 종합해 평가해 주세요. 기본 온도는 36.5℃이며 완료된 평가에 따라 누적됩니다.</p>
    <div class="trust-options">${Object.entries(TRUST_RATINGS).reverse().map(([score, rating]) => `<button type="button" data-trust-score="${score}"><b>${rating.label}</b><span>${rating.delta > 0 ? '+' : ''}${rating.delta.toFixed(1)}℃</span></button>`).join('')}</div>
    <label class="completion-note">평가 메모 (선택)<textarea id="completionReview" maxlength="200" rows="3" placeholder="운반 과정에서 좋았던 점이나 개선이 필요한 점을 적어 주세요."></textarea></label>
    <label class="check"><input id="completionChecked" type="checkbox"><span>컨테이너가 반납지에 도착했고 운반이 완료된 것을 확인했습니다.</span></label>
    <p class="completion-warning">완료하면 이 거래는 진행 중 목록에서 사라지며, 평가 결과는 해당 운반자의 신뢰온도에 반영됩니다.</p>
    <button type="button" class="button main" id="confirmCompletion">평가하고 운반 완료</button>
  </section>`;
  bindHeader(() => requesterLocationScreen(item));
  let selectedScore = 0;
  document.querySelectorAll('[data-trust-score]').forEach((button) => {
    button.onclick = () => {
      selectedScore = Number(button.dataset.trustScore);
      document.querySelectorAll('[data-trust-score]').forEach((option) => option.classList.toggle('selected', option === button));
    };
  });
  document.querySelector('#confirmCompletion').onclick = () => finishTransport(item, selectedScore);
}

async function finishTransport(item, score) {
  const rating = TRUST_RATINGS[score];
  if (!rating) return say('운반자 평가를 선택해 주세요.');
  if (!document.querySelector('#completionChecked').checked) return say('운반 완료 확인에 체크해 주세요.');
  const button = document.querySelector('#confirmCompletion');
  button.disabled = true;
  button.textContent = '운반 완료 처리 중…';
  try {
    await waitLimit(updateDoc(doc(db, 'containerRequests', item.id), {
      status: 'completed',
      transportStatus: '운반 완료',
      completedAt: new Date().toISOString(),
      completedBy: account(),
      connextTrustRating: score,
      connextTrustLabel: rating.label,
      connextTrustDelta: rating.delta,
      connextTrustRatedBy: account(),
      connextTrustRatedAt: new Date().toISOString(),
      connextTrustReview: document.querySelector('#completionReview').value.trim(),
      locationRequestStatus: 'closed',
      locationSharingStatus: 'completed'
    }));
    say(`운반을 완료하고 신뢰온도 ${rating.delta > 0 ? '+' : ''}${rating.delta.toFixed(1)}℃를 반영했습니다.`);
    dashboard();
  } catch (error) {
    console.error(error);
    say('운반 완료를 저장하지 못했습니다. 다시 시도해 주세요.');
    button.disabled = false;
    button.textContent = '평가하고 운반 완료';
  }
}

async function requestCarrierLocation(item) {
  const button = document.querySelector('#requestLocation');
  button.disabled = true;
  button.textContent = '위치 요청 저장 중…';
  try {
    await waitLimit(updateDoc(doc(db, 'containerRequests', item.id), {
      locationRequestStatus: 'requested',
      locationRequestedAt: new Date().toISOString(),
      locationRequestedBy: account()
    }));
    say('운반자에게 최신 위치를 요청했습니다.');
    button.textContent = '위치 요청 완료';
  } catch (error) {
    console.error(error);
    say('위치 요청을 저장하지 못했습니다. Firebase 권한을 확인해 주세요.');
    button.disabled = false;
    button.textContent = '운반자에게 최신 위치 요청';
  }
}

function carrierLocationScreen(item) {
  const requested = item.locationRequestStatus === 'requested';
  root.innerHTML = `${header('차량 GPS 공유')}<section class="tracking-view carrier-tracking">
    <div class="tracking-head"><span>${requested ? '최신 위치 요청 도착' : '확정 운송'}</span><b>${escapeHtml(item.pickup)} → ${escapeHtml(item.returnPlace)}</b><small>${escapeHtml(item.size)} ${escapeHtml(item.type)}</small></div>
    ${locationSummary(item)}
    <div class="consent-box"><b>정밀 위치정보 공유 동의</b><p>현재 GPS 좌표와 정확도, 전송 시각이 이 거래의 공컨테이너 수요자에게 제공됩니다. 다른 사용자에게는 표시하지 않습니다.</p><label class="check"><input id="locationConsent" type="checkbox"><span>현재 운송 위치 공유에 동의합니다.</span></label></div>
    <button type="button" class="button main" id="shareLocation">현재 GPS 위치 전송</button>
    <button type="button" class="button ghost" id="enableAutoLocation">위치 요청 자동 응답 시작</button>
    <button type="button" class="button ghost" id="refreshCarrierRequest">위치 요청 확인</button>
    <p class="location-notice">자동 응답은 이 화면이 열려 있는 동안에만 작동하며, 공컨테이너 수요자가 새 위치를 요청할 때에만 GPS를 읽습니다. 화면을 닫으면 즉시 중단됩니다.</p>
  </section>`;
  bindHeader(dashboard);
  document.querySelector('#shareLocation').onclick = () => shareCarrierLocation(item);
  document.querySelector('#enableAutoLocation').onclick = () => enableAutoLocationResponse(item);
  document.querySelector('#refreshCarrierRequest').onclick = () => refreshTrackingItem(item.id, carrierLocationScreen);
}

function stopAutoLocationResponse() {
  if (stopLocationRequestListener) stopLocationRequestListener();
  stopLocationRequestListener = null;
  lastHandledLocationRequest = '';
}

function enableAutoLocationResponse(item) {
  if (!document.querySelector('#locationConsent').checked) return say('위치 공유 동의에 체크해 주세요.');
  if (!navigator.geolocation) return say('이 브라우저는 GPS 위치 기능을 지원하지 않습니다.');
  const button = document.querySelector('#enableAutoLocation');
  button.disabled = true;
  button.textContent = '위치 권한 확인 중…';
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const saved = await saveCarrierLocation(item, position, false);
      if (!saved) { button.disabled = false; button.textContent = '위치 요청 자동 응답 시작'; return; }
      startLocationRequestListener(item);
      button.textContent = '자동 응답 활성화됨';
      say('이 화면이 열려 있는 동안 위치 요청에 자동 응답합니다.');
    },
    (error) => {
      console.error(error);
      say(error.code === 1 ? '브라우저에서 위치 권한을 허용해 주세요.' : '현재 위치를 확인하지 못했습니다.');
      button.disabled = false;
      button.textContent = '위치 요청 자동 응답 시작';
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
  );
}

function startLocationRequestListener(item) {
  stopAutoLocationResponse();
  stopLocationRequestListener = onSnapshot(doc(db, 'containerRequests', item.id), (snapshot) => {
    if (!snapshot.exists()) return;
    const fresh = { id: snapshot.id, ...snapshot.data() };
    const requestedAt = fresh.locationRequestedAt || '';
    if (fresh.locationRequestStatus !== 'requested' || !requestedAt || requestedAt === lastHandledLocationRequest) return;
    lastHandledLocationRequest = requestedAt;
    navigator.geolocation.getCurrentPosition(
      (position) => saveCarrierLocation(fresh, position, false).then((saved) => { if (saved) say('새 위치 요청에 GPS를 자동 전송했습니다.'); }),
      (error) => console.error('자동 위치 응답 실패', error),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
  }, (error) => {
    console.error('위치 요청 감시 실패', error);
    say('자동 위치 응답 연결이 중단되었습니다.');
    stopAutoLocationResponse();
  });
}

async function refreshTrackingItem(id, renderer) {
  try {
    if (!await connect()) return;
    const snapshot = await waitLimit(getDoc(doc(db, 'containerRequests', id)));
    if (!snapshot.exists()) return say('거래 정보를 찾을 수 없습니다.');
    const fresh = { id: snapshot.id, ...snapshot.data() };
    state.selected = fresh;
    renderer(fresh);
  } catch (error) {
    console.error(error);
    say('최신 위치 정보를 불러오지 못했습니다.');
  }
}

function shareCarrierLocation(item) {
  if (!document.querySelector('#locationConsent').checked) return say('위치 공유 동의에 체크해 주세요.');
  if (!navigator.geolocation) return say('이 브라우저는 GPS 위치 기능을 지원하지 않습니다.');
  const button = document.querySelector('#shareLocation');
  button.disabled = true;
  button.textContent = 'GPS 확인 중…';
  navigator.geolocation.getCurrentPosition(
    (position) => saveCarrierLocation(item, position),
    (error) => {
      console.error(error);
      say(error.code === 1 ? '브라우저에서 위치 권한을 허용해 주세요.' : '현재 위치를 확인하지 못했습니다.');
      button.disabled = false;
      button.textContent = '현재 GPS 위치 전송';
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
  );
}

async function saveCarrierLocation(item, position, refresh = true) {
  const button = document.querySelector('#shareLocation');
  const recordedAt = new Date(position.timestamp || Date.now()).toISOString();
  try {
    await waitLimit(updateDoc(doc(db, 'containerRequests', item.id), {
      carrierLocation: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
        speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        recordedAt
      },
      locationRequestStatus: 'responded',
      locationSharingStatus: 'shared_once',
      locationSharingConsentAt: new Date().toISOString(),
      transportStatus: '운송 중'
    }));
    if (refresh) {
      say('현재 GPS 위치를 공컨테이너 수요자에게 전송했습니다.');
      refreshTrackingItem(item.id, carrierLocationScreen);
    }
    return true;
  } catch (error) {
    console.error(error);
    say('GPS 위치를 저장하지 못했습니다. Firebase 권한을 확인해 주세요.');
    if (button) { button.disabled = false; button.textContent = '현재 GPS 위치 전송'; }
    return false;
  }
}

function destinationCoordinates(item) {
  const latitude = Number(item.returnLat || 0);
  const longitude = Number(item.returnLon || 0);
  if (latitude && longitude) return { latitude, longitude };
  const normalized = String(item.returnPlace || '').replace(/\s/g, '').toLowerCase();
  const fallback = BUSAN_PLACES.find((place) => normalized.includes(place.name.replace(/\s/g, '').toLowerCase()));
  return fallback ? { latitude: fallback.lat, longitude: fallback.lon } : null;
}

async function loadTmapSdk(key) {
  if (window.Tmapv2) return;
  const existing = document.querySelector('#tmapSdk');
  if (existing) return new Promise((resolve, reject) => { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); });
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'tmapSdk';
    script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${encodeURIComponent(key)}`;
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error('TMAP 지도 SDK 로드 실패')); };
    document.head.append(script);
  });
}

async function renderTmapRoute(item, key) {
  const start = item.carrierLocation;
  const end = destinationCoordinates(item);
  if (!start || !end) return say('현재 위치 또는 목적지 좌표가 없습니다.');
  const mapBox = document.querySelector('#tmapMap');
  const summary = document.querySelector('#routeSummary');
  if (!mapBox || !summary) return;
  mapBox.innerHTML = '<div class="map-placeholder"><b>TMAP 경로 계산 중…</b></div>';
  try {
    const response = await waitLimit(fetch('https://apis.openapi.sk.com/tmap/routes?version=1&format=json', {
      method: 'POST',
      headers: { appKey: key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        startX: String(start.longitude), startY: String(start.latitude),
        endX: String(end.longitude), endY: String(end.latitude),
        startName: encodeURIComponent('차량 현재 위치'), endName: encodeURIComponent(item.returnPlace || '목적지'),
        reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
        searchOption: 0, trafficInfo: 'Y', carType: 4, totalValue: 1
      })
    }), 12000);
    if (!response.ok) throw new Error(`TMAP API 오류 ${response.status}`);
    const route = await response.json();
    const properties = route.features?.find((feature) => feature.properties?.totalTime)?.properties || route.features?.[0]?.properties || {};
    const lines = (route.features || []).filter((feature) => feature.geometry?.type === 'LineString').flatMap((feature) => feature.geometry.coordinates || []);
    await loadTmapSdk(key);
    const tmap = window.Tmapv2;
    if (!tmap) throw new Error('TMAP 지도 객체를 찾을 수 없습니다.');
    mapBox.innerHTML = '';
    const map = new tmap.Map('tmapMap', { center: new tmap.LatLng(start.latitude, start.longitude), width: '100%', height: '300px', zoom: 13 });
    new tmap.Marker({ position: new tmap.LatLng(start.latitude, start.longitude), map, title: '차량 현재 위치' });
    new tmap.Marker({ position: new tmap.LatLng(end.latitude, end.longitude), map, title: '목적지' });
    if (lines.length) new tmap.Polyline({ path: lines.map(([longitude, latitude]) => new tmap.LatLng(latitude, longitude)), strokeColor: '#1265f5', strokeWeight: 6, map });
    const seconds = Number(properties.totalTime || 0);
    const meters = Number(properties.totalDistance || 0);
    summary.classList.remove('hidden');
    summary.innerHTML = `<div><span>남은 거리</span><b>${(meters / 1000).toFixed(1)}km</b></div><div><span>예상 남은 시간</span><b>${Math.max(1, Math.round(seconds / 60))}분</b></div><small>TMAP 실시간 교통정보 기반 예상치</small>`;
  } catch (error) {
    console.error(error);
    mapBox.innerHTML = '<div class="map-placeholder error"><b>TMAP 경로를 불러오지 못했습니다.</b><small>appKey와 TMAP 앱의 웹 도메인 설정을 확인해 주세요.</small></div>';
    say('TMAP 경로 조회에 실패했습니다.');
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
      const response = await waitLimit(fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&accept-language=ko&countrycodes=kr&viewbox=124.5%2C39.5%2C131.0%2C33.0&bounded=1&q=${encodeURIComponent(keyword)}`), 7000);
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
      row.innerHTML = `<b>${escapeHtml(place.display_name)}</b><iframe title="대한민국 전도에서 선택 위치 확인" src="https://www.openstreetmap.org/export/embed.html?bbox=124.5%2C33.0%2C131.0%2C39.5&amp;layer=mapnik&amp;marker=${Number(place.lat)}%2C${Number(place.lon)}"></iframe><button type="button" class="address-confirm">이 주소로 선택</button>`;
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
