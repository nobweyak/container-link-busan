import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const db = getFirestore(getApps()[0] || initializeApp(firebaseConfig));
const FILTER_KEY = 'container-link-match-filters';
const defaults = { types: ['DRY'], sizes: ['20FT', '40FT'], conditions: ['정상'] };

function savedFilters() {
  try { return { ...defaults, ...JSON.parse(sessionStorage.getItem(FILTER_KEY) || '{}') }; }
  catch { return { ...defaults }; }
}
function saveFilters(filters) { sessionStorage.setItem(FILTER_KEY, JSON.stringify(filters)); }
function flip(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function installFilterPanel() {
  const form = document.querySelector('.form-view');
  if (!form || form.querySelector('.multi-filter-panel')) return;
  const filters = savedFilters();
  const isCarrier = document.body.textContent.includes('보유 컨테이너 등록');
  const title = isCarrier ? '찾고 싶은 요청 조건' : '요청에 허용할 컨테이너 조건';
  const panel = document.createElement('section');
  panel.className = 'multi-filter-panel';
  panel.innerHTML = `
    <div class="filter-head"><b>${title}</b><small>여러 항목을 함께 선택할 수 있어요</small></div>
    <div class="filter-row" data-filter="types"><span>타입</span>${['DRY','REEFER','OPEN TOP','FLAT RACK'].map((value) => `<button type="button" class="${filters.types.includes(value) ? 'on' : ''}" data-value="${value}">${value}</button>`).join('')}</div>
    <div class="filter-row" data-filter="sizes"><span>사이즈</span>${['20FT','40FT'].map((value) => `<button type="button" class="${filters.sizes.includes(value) ? 'on' : ''}" data-value="${value}">${value}</button>`).join('')}</div>
    ${isCarrier ? `<div class="filter-row" data-filter="conditions"><span>상태</span>${['정상','확인 필요'].map((value) => `<button type="button" class="${filters.conditions.includes(value) ? 'on' : ''}" data-value="${value}">${value}</button>`).join('')}</div>` : ''}
  `;
  form.querySelector('.sticky')?.before(panel);
  panel.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    const group = button.closest('.filter-row').dataset.filter;
    const next = savedFilters();
    const values = flip(next[group] || [], button.dataset.value);
    if (!values.length) return;
    next[group] = values;
    saveFilters(next);
    button.classList.toggle('on', values.includes(button.dataset.value));
  });
}

function installAllMyRequests() {
  const dashboard = document.querySelector('.dashboard');
  const list = dashboard?.querySelector('.mine-list');
  if (!list || list.dataset.allLoaded) return;
  const isRequester = dashboard.textContent.includes('공컨테이너 수요자');
  if (!isRequester) return;
  list.dataset.allLoaded = 'true';
  const account = sessionStorage.getItem('container-link-active-account') || '';
  getDocs(collection(db, 'containerRequests')).then((snapshot) => {
    const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => !account || item.requesterAccount === account);
    if (!rows.length) return;
    list.innerHTML = rows.map((item) => `<article class="mini-card"><div><b>${item.pickup || '인수 장소'} → ${item.returnPlace || '반납 장소'}</b><span>${item.size || ''} ${item.type || ''} · ${Number(item.price || 0).toLocaleString('ko-KR')}원</span></div><em class="state ${item.status || 'open'}">${({open:'매칭 대기',approval:'승인 대기',confirmed:'매칭 확정',rejected:'거절됨'})[item.status] || '진행 중'}</em></article>`).join('');
  }).catch(() => { list.dataset.allLoaded = ''; });
}

function installFilteredMatches() {
  const results = document.querySelector('#matchResults');
  if (!results || results.querySelector('.loading') || results.dataset.filterLoaded) return;
  results.dataset.filterLoaded = 'true';
  const filters = savedFilters();
  getDocs(collection(db, 'containerRequests')).then((snapshot) => {
    const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => item.status === 'open')
      .filter((item) => filters.types.includes(item.type) && filters.sizes.includes(item.size));
    if (!rows.length) return;
    results.innerHTML = rows.map((item, index) => `<button class="match-card" data-id="${item.id}"><span class="rank">${index + 1}</span><div><b>${item.pickup || '인수 장소'} <i>→</i> ${item.returnPlace || '반납 장소'}</b><small>${item.size} ${item.type} · ${Number(item.price || 0).toLocaleString('ko-KR')}원</small><em>${item.condition === '정상' ? '승인 가능' : '상태 확인 필요'}</em></div><strong>${Math.max(72, 96 - index * 3)}<small>매칭도</small></strong></button>`).join('');
  }).catch(() => { results.dataset.filterLoaded = ''; });
}

function enhanceFilters() {
  installFilterPanel();
  installAllMyRequests();
  installFilteredMatches();
}
new MutationObserver(enhanceFilters).observe(document.documentElement, { childList: true, subtree: true });
enhanceFilters();
