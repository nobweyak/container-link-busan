import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, collection, getDocs, query, where, updateDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const firebaseApp = getApps()[0] || initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const activeAccount = () => sessionStorage.getItem('container-link-active-account') || '';

async function sendApprovalRequest() {
  const trips = JSON.parse(localStorage.getItem(`container-link-carrier-trips:${activeAccount()}`) || '[]');
  const trip = trips[0];
  if (!trip?.requestId) return;
  await updateDoc(doc(db, 'containerRequests', trip.requestId), {
    status: 'approval', carrierAccount: activeAccount(), approvalRequestedAt: serverTimestamp()
  });
  trip.status = '필요자 승인 대기';
  localStorage.setItem(`container-link-carrier-trips:${activeAccount()}`, JSON.stringify(trips));
}

async function renderApprovalInbox() {
  if (localStorage.getItem('container-link-role') !== 'requester' || !auth.currentUser) return;
  const account = activeAccount();
  const box = document.querySelector('.dashboard');
  if (!box || box.querySelector('.approval-inbox')) return;
  const snapshot = await getDocs(query(collection(db, 'containerRequests'), where('status', '==', 'approval')));
  const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.requesterAccount === account);
  if (!rows.length) return;
  const inbox = document.createElement('section');
  inbox.className = 'approval-inbox';
  inbox.innerHTML = `<h2>운반자 승인 요청 <small>${rows.length}건</small></h2>${rows.map((item) => `<article data-request-id="${item.id}"><b>${item.pickup} → ${item.returnPlace}</b><small>${item.size} ${item.type} · ${Number(item.price || 0).toLocaleString('ko-KR')}원</small><div><button data-answer="confirmed">승인</button><button data-answer="rejected">반려</button></div></article>`).join('')}`;
  box.querySelector('.action-row')?.before(inbox);
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest?.('button');
  if (button?.id === 'sendApproval') {
    try { await sendApprovalRequest(); } catch (error) { console.error('승인 요청 저장 실패', error); }
  }
  if (!button?.dataset.answer) return;
  const row = button.closest('[data-request-id]');
  if (!row) return;
  await updateDoc(doc(db, 'containerRequests', row.dataset.requestId), { status: button.dataset.answer, requesterDecisionAt: serverTimestamp() });
  row.remove();
}, true);

new MutationObserver(() => { renderApprovalInbox().catch(console.error); }).observe(document.documentElement, { childList: true, subtree: true });
renderApprovalInbox().catch(console.error);
