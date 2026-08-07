import { initializeApp,getApps } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getFirestore,updateDoc,doc,serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
const db=getFirestore(getApps()[0]||initializeApp(firebaseConfig));
const account=()=>sessionStorage.getItem('container-link-active-account')||'';
const selected=()=>localStorage.getItem('container-link-selected-request');
async function saveTransport(fields){const id=selected();if(!id)return;try{await updateDoc(doc(db,'containerRequests',id),Object.assign({carrierAccount:account(),transportUpdatedAt:serverTimestamp()},fields))}catch(error){console.error('운송 상태 저장 실패',error)}}
document.addEventListener('click',event=>{const card=event.target.closest?.('.match-card[data-id]');if(card)localStorage.setItem('container-link-selected-request',card.dataset.id)},true);
document.addEventListener('click',event=>{const button=event.target.closest?.('button');if(!button)return;if(button.id==='requestMatch')saveTransport({transportStatus:'매칭 요청'});if(button.id==='sendApproval')saveTransport({transportStatus:'선사 승인 요청'});if(button.id==='sendReport')saveTransport({transportStatus:'검수 사진 전송'});},true);
