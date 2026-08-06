import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, collection, addDoc, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = getApps()[0] || initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let lastMatchId = '';

async function userId() {
  if (auth.currentUser) return auth.currentUser.uid;
  return (await signInAnonymously(auth)).user.uid;
}

function addPriceInput(form) {
  if (!form || form.querySelector('#price')) return;
  const label = document.createElement('label');
  label.className = 'price-field';
  label.innerHTML = '희망 매칭 가격 (원)<input id="price" inputmode="numeric" type="number" min="0" step="1000" placeholder="예: 80000" required><small>예상 운송·인수 비용을 입력해 주세요.</small>';
  const sticky = form.querySelector('.sticky');
  form.insertBefore(label, sticky || null);
}

function keepOnePriceInput() {
  document.querySelectorAll('.form-view:not(#requestForm) .price-field, .form-view:not(#requestForm) [name="price"], .form-view:not(#requestForm) #price').forEach((element) => element.closest('.price-field')?.remove() || element.remove());
  const form = document.querySelector('#requestForm');
  if (!form) return;
  const fields = form.querySelectorAll('.price-field');
  fields.forEach((field, index) => { if (index > 0) field.remove(); });
}

function simplifyCarrierDashboard() {
  const dashboard = document.querySelector('.dashboard');
  const actionTitle = dashboard?.querySelector('.action-row b')?.textContent || '';
  if (!dashboard || !actionTitle.includes('매칭')) return;
  dashboard.classList.add('carrier-dashboard');
  const heading = dashboard.querySelector('.mine-list')?.previousElementSibling;
  dashboard.querySelector('.mine-list')?.remove();
  heading?.remove();
  if (!dashboard.querySelector('.carrier-guide')) {
    const guide = document.createElement('p');
    guide.className = 'carrier-guide';
    guide.textContent = '보유한 공컨테이너 조건을 등록하고, 주변의 실제 요청을 바로 찾아보세요.';
    dashboard.querySelector('.action-row')?.before(guide);
  }
}

async function showPrices() {
  for (const card of document.querySelectorAll('.match-card[data-id]')) {
    if (card.querySelector('.match-price')) continue;
    try {
      const snap = await getDoc(doc(db, 'containerRequests', card.dataset.id));
      const price = snap.data()?.price;
      if (Number.isFinite(price)) {
        const badge = document.createElement('span');
        badge.className = 'match-price';
        badge.textContent = `${price.toLocaleString('ko-KR')}원`;
        card.querySelector('div')?.append(badge);
      }
    } catch (error) { console.warn('가격을 불러오지 못했습니다.', error); }
  }
  const route = document.querySelector('.route');
  if (route && lastMatchId && !route.querySelector('.price-detail')) {
    try {
      const snap = await getDoc(doc(db, 'containerRequests', lastMatchId));
      const price = snap.data()?.price;
      if (Number.isFinite(price)) {
        const priceEl = document.createElement('span');
        priceEl.className = 'price-detail';
        priceEl.textContent = `희망 가격  ${price.toLocaleString('ko-KR')}원`;
        route.append(priceEl);
      }
    } catch (error) { console.warn(error); }
  }
}

document.addEventListener('click', (event) => {
  const card = event.target.closest?.('.match-card[data-id]');
  if (card) lastMatchId = card.dataset.id;
}, true);

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (form?.id !== 'requestForm' || form.dataset.priceHandled) return;
  const price = Number(form.querySelector('#price')?.value);
  if (!Number.isFinite(price) || price < 0) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  form.dataset.priceHandled = 'true';
  const [size = '20FT', type = 'DRY'] = form.querySelector('.request-summary b')?.textContent.trim().split(/\s+/) || [];
  try {
    await addDoc(collection(db, 'containerRequests'), {
      ownerId: await userId(), type, size, condition: '미검수',
      pickup: form.querySelector('#pickup').value.trim(),
      returnPlace: form.querySelector('#returnPlace').value.trim(),
      time: form.querySelector('#time').value,
      quantity: form.querySelector('#quantity').value,
      price, status: 'open', createdAt: serverTimestamp()
    });
    form.innerHTML = '<div class="price-success"><b>✓ 요청이 등록되었습니다</b><p>희망 가격을 포함해 운반자에게 매칭 요청을 보냈습니다.</p></div>';
  } catch (error) {
    console.error(error);
    form.dataset.priceHandled = '';
    alert('요청 저장에 실패했습니다. Firebase 설정을 확인해 주세요.');
  }
}, true);

new MutationObserver(() => {
  addPriceInput(document.querySelector('#requestForm'));
  keepOnePriceInput();
  simplifyCarrierDashboard();
  showPrices();
}).observe(document.documentElement, { childList: true, subtree: true });

addPriceInput(document.querySelector('#requestForm'));
keepOnePriceInput();
simplifyCarrierDashboard();
showPrices();
