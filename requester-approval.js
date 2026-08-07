import { initializeApp,getApps } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth,onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore,collection,getDocs,updateDoc,doc,onSnapshot } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
const db=getFirestore(getApps()[0]||initializeApp(firebaseConfig));
const auth=getAuth(getApps()[0]);
let latest=[];
let subscribed=false;
const activeEmail=()=>sessionStorage.getItem('container-link-active-account')||'';
const pending=x=>x.status==='approval'||x.status==='review';
function draw(){
 const dashboard=document.querySelector('.dashboard');
 if(!dashboard||localStorage.getItem('container-link-role')!=='requester')return;
 dashboard.querySelector('.incoming-approvals')?.remove();
 const rows=latest.filter(x=>x.requesterAccount===activeEmail()&&pending(x));
 if(!rows.length)return;
 const section=document.createElement('section');section.className='incoming-approvals';
 section.innerHTML='<h2>승인 요청 <small>'+rows.length+'건</small></h2>'+rows.map(x=>'<button type="button" class="approval-card '+(x.inspectionPhoto?'ready':'waiting')+'" data-request="'+x.id+'">'+(x.inspectionPhoto?'<img src="'+x.inspectionPhoto+'" alt="컨테이너 검수 사진">':'<div class="photo-placeholder">사진<br>대기</div>')+'<span><b>'+x.size+' '+x.type+'</b><small>'+x.pickup+' → '+x.returnPlace+'</small><em>'+(x.inspectionPhoto?'사진 확인 후 수락·반려':'운반자 검수 사진 전송 대기')+'</em></span><strong>›</strong></button>').join('');
 dashboard.querySelector('.action-row')?.before(section);
 section.querySelectorAll('[data-request]').forEach(button=>button.onclick=()=>{const item=latest.find(x=>x.id===button.dataset.request);if(item?.inspectionPhoto)openReview(item);});
}
function openReview(item){
 const root=document.querySelector('#app');
 root.innerHTML='<header><button id="back">‹</button><b>검수 사진 확인</b><button id="home">⌂</button></header><section class="review-view"><div class="confirm-head"><span>✓ 운반자 승인 요청</span><b>'+item.size+' '+item.type+'</b><small>'+item.pickup+' → '+item.returnPlace+'</small></div><h2>컨테이너 검수 사진</h2><img class="review-photo" src="'+item.inspectionPhoto+'" alt="운반자가 전송한 컨테이너 사진"><div class="result"><span>✓</span><div><b>AI 검수 자료가 도착했습니다</b><small>사진을 확인한 후 최종 결정을 내려 주세요.</small></div></div><label class="check"><input id="reviewChecked" type="checkbox"> 사진과 상태 정보를 확인했습니다.</label><button class="button ghost danger" id="rejectRequest">매칭 거절</button><button class="button main" id="acceptRequest">매칭 최종 확정</button></section>';
 const goBack=()=>location.reload();
 document.querySelector('#back').onclick=goBack;document.querySelector('#home').onclick=goBack;
 document.querySelector('#rejectRequest').onclick=()=>decide(item.id,'rejected');
 document.querySelector('#acceptRequest').onclick=()=>{if(!document.querySelector('#reviewChecked').checked){alert('사진과 상태 정보를 확인해 주세요.');return;}decide(item.id,'confirmed')};
}
async function decide(id,status){
 try{await updateDoc(doc(db,'containerRequests',id),{status,requesterDecisionAt:new Date().toISOString()});alert(status==='confirmed'?'매칭을 최종 확정했습니다.':'매칭을 거절했습니다.');location.reload();}
 catch(error){console.error(error);alert('처리에 실패했습니다. Firebase 연결을 확인해 주세요.');}
}
function start(){
 if(subscribed)return;
 onAuthStateChanged(auth,user=>{if(!user||subscribed)return;subscribed=true;onSnapshot(collection(db,'containerRequests'),snapshot=>{latest=snapshot.docs.map(x=>Object.assign({id:x.id},x.data()));draw();},error=>console.error('승인 요청 조회 실패',error));});
}
document.addEventListener('click',event=>{const card=event.target.closest?.('.match-card[data-id]');if(card)localStorage.setItem('container-link-selected-request',card.dataset.id)},true);
document.addEventListener('click',event=>{if(!event.target.closest?.('#sendReport'))return;const file=document.querySelector('#photo')?.files?.[0];const id=localStorage.getItem('container-link-selected-request');if(!file||!id)return;const reader=new FileReader();reader.onload=()=>updateDoc(doc(db,'containerRequests',id),{status:'review',inspectionPhoto:reader.result,inspectionSentAt:new Date().toISOString()}).catch(error=>console.error('검수 사진 저장 실패',error));reader.readAsDataURL(file)},true);
new MutationObserver(draw).observe(document.documentElement,{childList:true,subtree:true});
start();
