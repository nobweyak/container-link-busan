import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const root = document.querySelector('#app');
const toast = document.querySelector('#toast');
const firebase = initializeApp(firebaseConfig);
const auth = getAuth(firebase);
const db = getFirestore(firebase);
const state = { user: null, role: '', types: ['DRY'], sizes: ['20FT', '40FT'], condition: '정상', selected: null, photo: null, hidden: new Set() };

const say = (message) => { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400); };
async function connect() { if (state.user) return true; try { state.user = (await signInAnonymously(auth)).user; return true; } catch { say('Firebase 연결에 실패했습니다.'); return false; } }
const header = (title, back) => `<header><button id="back">‹</button><b>${title}</b><button id="home">⌂</button></header>`;
function bindHeader(back) { document.querySelector('#back').onclick = back; document.querySelector('#home').onclick = dashboard; }
function toggle(values, value) { return values.includes(value) ? (values.length > 1 ? values.filter((item) => item !== value) : values) : [...values, value]; }

function login() {
  root.innerHTML = `<section class="login-view"><div class="logo"><span>▣</span> CONTAINER LINK</div><div class="login-copy"><p>빈 컨테이너의 이동을 연결하다</p><h1>공컨 매칭부터<br>검수·승인까지</h1><p class="muted">부산항 공컨테이너 실시간 매칭 플랫폼</p></div><label>이메일<input value="demo@containerlink.kr" aria-label="이메일"></label><label>비밀번호<input type="password" value="1234" aria-label="비밀번호"></label><button class="button main" id="signin">시작하기</button><small>시연용 앱입니다. 실제 개인정보는 입력하지 마세요.</small></section>`;
  document.querySelector('#signin').onclick = async () => { sessionStorage.setItem('container-link-active-account', document.querySelector('input').value.trim()); if (await connect()) roleSelect(); };
  const signupButton=document.createElement('button');signupButton.type='button';signupButton.className='button ghost signup-link';signupButton.textContent='회원가입';document.querySelector('#signin').after(signupButton);signupButton.onclick=signup;
}

function signup(){root.innerHTML=header('회원가입',login)+'<section class="form-view signup-view"><h1>컨테이너링크 회원가입</h1><p class="muted">서비스 이용에 필요한 정보를 입력해 주세요.</p><label>이름<input id="signupName" required></label><label>이메일<input id="signupEmail" type="email" required></label><label>비밀번호<input id="signupPassword" type="password" minlength="4" required></label><label class="check"><input id="termsAgree" type="checkbox"> <span>이용약관·개인정보·위치정보 이용에 동의합니다. (필수)</span></label><button type="button" class="button ghost" id="viewTerms">약관 전문 보기</button><button type="button" class="button main" id="createAccount">동의하고 회원가입</button></section>';bindHeader(login);document.querySelector('#viewTerms').onclick=()=>window.open('terms.html','container-link-terms','width=760,height=760');document.querySelector('#createAccount').onclick=async()=>{const email=document.querySelector('#signupEmail').value.trim();if(!email||!document.querySelector('#signupPassword').value)return say('이메일과 비밀번호를 입력해 주세요.');if(!document.querySelector('#termsAgree').checked)return say('필수 약관에 동의해 주세요.');localStorage.setItem('container-link-member:'+email,JSON.stringify({name:document.querySelector('#signupName').value.trim(),email,consentedAt:new Date().toISOString()}));sessionStorage.setItem('container-link-active-account',email);say('회원가입이 완료되었습니다.');if(await connect())roleSelect()}}

function roleSelect() {
  root.innerHTML = `<section class="role-view"><div class="logo"><span>▣</span> CONTAINER LINK</div><div class="progress"><i></i><i class="on"></i><i></i></div><p class="eyebrow">업무 선택</p><h1>어떤 업무를<br>하시나요?</h1><button class="role-card carrier" id="carrier"><span class="role-icon">▣</span><b>공컨테이너 운반자</b><em>›</em></button><button class="role-card requester" id="requester"><span class="role-icon">⌁</span><b>컨테이너가 필요해요</b><em>›</em></button></section>`;
  document.querySelector('#carrier').onclick = () => { state.role = 'carrier'; localStorage.setItem('container-link-role', 'carrier'); dashboard(); };
  document.querySelector('#requester').onclick = () => { if(sessionStorage.getItem('container-link-active-account')==='demo@containerlink.kr')sessionStorage.setItem('container-link-active-account','requester-demo@containerlink.kr'); state.role = 'requester'; localStorage.setItem('container-link-role', 'requester'); dashboard(); };
}

async function mine() { if (!await connect()) return []; try { const activeAccount=sessionStorage.getItem('container-link-active-account')||''; const rows = await getDocs(collection(db, 'containerRequests')); return rows.docs.map((row) => ({ id: row.id, ...row.data() })).filter((item)=>item.requesterAccount===activeAccount); } catch { return []; } }
function stateName(status) { return ({ open: '매칭 대기', approval: '승인 대기', confirmed: '매칭 확정', rejected: '거절됨' })[status] || '진행 중'; }
function requestCard(item) { return `<article class="mini-card"><div><b>${item.size || ''} ${item.type || ''}</b><span>${item.pickup || ''} → ${item.returnPlace || ''}</span></div><em class="state ${item.status || 'open'}">${stateName(item.status)}</em></article>`; }
async function dashboard() {
  const rows = state.role==='carrier' ? [] : await mine();
  if(state.role==='requester'){const rank={confirmed:0,approval:1,review:1,open:2};rows.sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9));}
  root.innerHTML = `<section class="dashboard"><div class="top"><div><p class="eyebrow">${state.role === 'carrier' ? '공컨테이너 운반자' : '컨테이너 필요자'}</p><h1>안녕하세요,<br>김기사님</h1></div><button id="switch">역할 변경</button></div><div class="hero"><span>오늘의 공차 절감 예상</span><b>12.4 <small>km</small></b><p>추천 매칭을 통해 줄일 수 있는 이동거리</p></div><h2>진행 중인 매칭과 운송</h2><div class="mine-list">${rows.length ? rows.map(requestCard).join('') : '<div class="empty">아직 진행 중인 요청이 없습니다.</div>'}</div><button class="action-row" id="action"><span>▣</span><div><b>${state.role === 'carrier' ? '매칭 찾기' : '공컨테이너 요청 등록'}</b><small>${state.role === 'carrier' ? '선택한 조건으로 요청을 검색합니다' : '필요한 컨테이너 조건을 등록합니다'}</small></div><em>›</em></button></section>`;
  document.querySelector('#switch').onclick = roleSelect;
  document.querySelector('#action').onclick = () => spec(state.role);
}

function spec(role) {
  const carrier = role === 'carrier';
  const typeButtons = ['DRY', 'REEFER', 'OPEN TOP', 'FLAT RACK'].map((type) => `<button class="option ${state.types.includes(type) ? 'selected' : ''}" data-type="${type}">${type}</button>`).join('');
  const sizeButtons = ['20FT', '40FT'].map((size) => `<button class="option ${state.sizes.includes(size) ? 'selected' : ''}" data-size="${size}">${size}</button>`).join('');
  root.innerHTML = header(carrier ? '보유 컨테이너 조건' : '필요 컨테이너 조건', dashboard) + `<section class="form-view"><div class="step">2 / 3 <span></span></div><h1>${carrier ? '찾고 싶은' : '필요한'} 컨테이너를<br>선택해 주세요</h1><p class="muted">타입과 사이즈는 여러 개를 동시에 선택할 수 있습니다.</p><h3>컨테이너 타입 <small class="multi-hint">복수 선택</small></h3><div class="option-grid type-grid">${typeButtons}</div><h3>사이즈 <small class="multi-hint">복수 선택</small></h3><div class="option-grid two">${sizeButtons}</div>${carrier ? `<h3>컨테이너 상태</h3><div class="option-grid two"><button class="option ${state.condition === '정상' ? 'selected good' : ''}" data-condition="정상">정상</button><button class="option ${state.condition === '확인 필요' ? 'selected warn' : ''}" data-condition="확인 필요">확인 필요</button></div>` : ''}<div class="sticky"><button class="button main" id="next">${carrier ? '선택 조건으로 매칭 찾기' : '이 조건으로 요청 등록'}</button></div></section>`;
  bindHeader(dashboard);
  document.querySelectorAll('[data-type]').forEach((button) => button.onclick = () => { state.types = toggle(state.types, button.dataset.type); spec(role); });
  document.querySelectorAll('[data-size]').forEach((button) => button.onclick = () => { state.sizes = toggle(state.sizes, button.dataset.size); spec(role); });
  document.querySelectorAll('[data-condition]').forEach((button) => button.onclick = () => { state.condition = button.dataset.condition; spec(role); });
  document.querySelector('#next').onclick = () => carrier ? matchList() : requestForm();
}

function requestForm() {
  root.innerHTML = header('공컨테이너 요청 등록', () => spec('requester')) + `<form class="form-view" id="requestForm"><div class="request-summary"><b>${state.sizes.join(', ')} / ${state.types.join(', ')}</b><span>선택한 컨테이너 조건</span></div><h2>운송 조건을 입력해 주세요</h2><label>희망 인수 장소<input id="pickup" value="부산신항" required></label><label>반납지<input id="returnPlace" value="감만CY" required></label><label>희망 인수 시간<input id="time" type="datetime-local" required></label><label>필요 수량<input id="quantity" type="number" min="1" value="1" required></label><label>희망 매칭 가격 (원)<input id="price" type="number" min="0" placeholder="예: 80000" required></label><div class="sticky"><button class="button main">Firebase에 요청 등록</button></div></form>`;
  bindHeader(() => spec('requester'));
  document.querySelector('#requestForm').onsubmit = saveRequest;
}
async function saveRequest(event) {
  event.preventDefault(); if (!await connect()) return;
  const form = event.currentTarget;
  try { await addDoc(collection(db, 'containerRequests'), { ownerId: state.user.uid, requesterAccount: sessionStorage.getItem('container-link-active-account') || '', type: state.types[0], size: state.sizes[0], acceptableTypes: state.types, acceptableSizes: state.sizes, condition: '미검수', pickup: form.querySelector('#pickup').value.trim(), returnPlace: form.querySelector('#returnPlace').value.trim(), time: form.querySelector('#time').value, quantity: form.querySelector('#quantity').value, price: Number(form.querySelector('#price').value), status: 'open', createdAt: serverTimestamp() }); say('요청이 Firebase에 등록되었습니다.'); dashboard(); } catch { say('요청 저장에 실패했습니다.'); }
}

async function matchList() {
  root.innerHTML = header('매칭 찾기', () => spec('carrier')) + `<section class="match-view"><div class="filters"><button class="active">${state.types.join(' · ')}</button><button>${state.sizes.join(' · ')}</button><button>거리순</button></div><div class="map"><div class="pin a">부산신항</div><div class="line"></div><div class="pin b">감만CY</div><small>선택한 복수 조건 기준 추천</small></div><div id="matchResults" class="results"><p class="loading">Firebase 요청을 불러오는 중…</p></div></section>`;
  bindHeader(() => spec('carrier'));
  let rows = [];
  try { const result = await getDocs(query(collection(db, 'containerRequests'), where('status', '==', 'open'))); rows = result.docs.map((row) => ({ id: row.id, ...row.data() })).filter((item) => !state.hidden.has(item.id) && state.types.includes(item.type) && state.sizes.includes(item.size)); } catch { say('요청을 불러오지 못했습니다.'); }
  const box = document.querySelector('#matchResults');
  box.innerHTML = rows.length ? rows.map((item, index) => `<button class="match-card" data-id="${item.id}"><span class="rank">${index + 1}</span><div><b>${item.pickup} <i>→</i> ${item.returnPlace}</b><small>${item.size} ${item.type} · ${Number(item.price || 0).toLocaleString('ko-KR')}원</small><em>매칭 가능</em></div><strong>${Math.max(70, 96 - index * 3)}<small>매칭도</small></strong></button>`).join('') : '<div class="empty">선택한 조건에 맞는 요청이 없습니다.</div>';
  document.querySelectorAll('.match-card').forEach((button) => button.onclick = () => { state.selected = rows.find((item) => item.id === button.dataset.id); detail(); });
}

function detail() { const item = state.selected; root.innerHTML = header('매칭 적합도 상세', matchList) + `<section class="detail"><div class="route"><span>⌖ ${item.pickup} → ${item.returnPlace}</span><b>${item.size} ${item.type}</b><div><strong>92<small>점</small></strong><em>매우 적합</em></div></div><div class="sticky"><button class="button main" id="requestMatch">이 조건으로 매칭 요청</button><button class="button ghost" id="other">다른 매칭 보기</button></div></section>`; bindHeader(matchList); document.querySelector('#requestMatch').onclick = approval; document.querySelector('#other').onclick = matchList; }
function approval() { const item = state.selected; root.innerHTML = header('재사용 승인 요청', detail) + `<section class="approval"><div class="approval-hero"><span>재사용 승인 요청</span><b>${item.pickup} → ${item.returnPlace}</b><small>${item.size} ${item.type}</small></div><h2>선사 제출 정보</h2><p class="notice">승인 전에는 배차가 최종 확정되지 않습니다.</p><button class="button main" id="sendApproval">선사에 승인 요청 보내기</button></section>`; bindHeader(detail); document.querySelector('#sendApproval').onclick = async () => { await updateDoc(doc(db, 'containerRequests', item.id), { status: 'approval' }); inspection(); }; }
function inspection() { root.innerHTML = header('컨테이너 상태 촬영', approval) + `<section class="inspection"><div class="capture-frame" id="capture"><span>◉</span><b>컨테이너 사진 촬영</b><small>사진을 선택해 주세요.</small><img id="preview" class="hidden" alt="컨테이너 사진"></div><input id="photo" type="file" accept="image/*" capture="environment" hidden><button class="button main" id="sendReport">사진 및 AI 리포트 전송</button></section>`; bindHeader(approval); document.querySelector('#capture').onclick = () => document.querySelector('#photo').click(); document.querySelector('#photo').onchange = (event) => { state.photo = event.target.files[0]; const image = document.querySelector('#preview'); image.src = URL.createObjectURL(state.photo); image.classList.remove('hidden'); }; document.querySelector('#sendReport').onclick = () => { if (!state.photo) return say('먼저 사진을 선택해 주세요.'); confirmation(); }; }
function confirmation() { root.innerHTML = header('상태 확인 및 최종 결정', inspection) + `<section class="confirm"><div class="confirm-head"><span>✓ 검수 자료 전송 완료</span><b>${state.selected.size} ${state.selected.type}</b><small>${state.selected.pickup} → ${state.selected.returnPlace}</small></div><label class="check"><input type="checkbox" id="checked"> 사진과 상태 정보를 확인했습니다.</label><button class="button ghost danger" id="reject">매칭 거절</button><button class="button main" id="confirm">매칭 최종 확정</button></section>`; bindHeader(matchList); document.querySelector('#reject').onclick = () => finish('rejected'); document.querySelector('#confirm').onclick = () => document.querySelector('#checked').checked ? finish('confirmed') : say('사진과 상태 정보를 확인해 주세요.'); }
async function finish(status) { await updateDoc(doc(db, 'containerRequests', state.selected.id), { status }); if (status === 'rejected') state.hidden.add(state.selected.id); say(status === 'confirmed' ? '매칭이 확정되었습니다.' : '매칭을 거절했습니다.'); matchList(); }

login();
