const carrierTripsKey = () => `container-link-carrier-trips:${sessionStorage.getItem('container-link-active-account') || 'carrier-demo@containerlink.kr'}`;
const readTrips = () => JSON.parse(localStorage.getItem(carrierTripsKey()) || '[]');
const writeTrips = (trips) => localStorage.setItem(carrierTripsKey(), JSON.stringify(trips));

function rememberCarrierTrip(card) {
  if (localStorage.getItem('container-link-role') !== 'carrier' || !card) return;
  const route = card.querySelector('b')?.textContent.trim() || '매칭 운송';
  const meta = card.querySelector('small')?.textContent.trim() || '';
  const trips = readTrips();
  if (trips.some((trip) => trip.route === route)) return;
  trips.unshift({ requestId: card.dataset.id, route, meta, status: '선사 승인 요청 전' });
  writeTrips(trips);
}

function renderCarrierTrips() {
  const dashboard = document.querySelector('.dashboard');
  if (!dashboard || localStorage.getItem('container-link-role') !== 'carrier' || dashboard.querySelector('.carrier-transport-list')) return;
  const trips = readTrips();
  const section = document.createElement('section');
  section.className = 'carrier-transport-list';
  section.innerHTML = `<h2>진행 중 운송 <small>${trips.length}건</small></h2>${trips.length ? trips.map((trip) => `<article><span>▤</span><div><b>${trip.route}</b><small>${trip.meta || '검수 사진 전송 대기'}</small></div><em>${trip.status}</em></article>`).join('') : '<p>진행 중인 운송이 없습니다.<br>주변 요청을 찾아 운송을 시작해 보세요.</p>'}`;
  dashboard.querySelector('.carrier-guide, .action-row')?.before(section);
}

function replaceCarrierConfirmation() {
  if (localStorage.getItem('container-link-role') !== 'carrier') return;
  const confirm = document.querySelector('.confirm');
  if (!confirm || confirm.dataset.carrierView) return;
  confirm.dataset.carrierView = 'true';
  const trips = readTrips();
  if (trips[0]) { trips[0].status = '검수 자료 전송 완료'; writeTrips(trips); }
  confirm.innerHTML = `<div class="carrier-complete"><span>✓</span><h2>검수 자료를 전송했습니다</h2><p>공컨테이너 수요자가 사진과 AI 상태 정보를 확인하면 운송이 최종 확정됩니다.</p><div><b>현재 상태</b><em>공컨테이너 수요자 확인 대기</em></div><button class="button main" id="carrierHome">진행 중 운송 보기</button></div>`;
  confirm.querySelector('#carrierHome').onclick = () => document.querySelector('#home')?.click();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('button');
  if (button?.id === 'carrier') localStorage.setItem('container-link-role', 'carrier');
  if (button?.id === 'requester') localStorage.setItem('container-link-role', 'requester');
  if (button?.id === 'requestMatch' || button?.id === 'sendReport') localStorage.setItem('container-link-role', 'carrier');
  if (button?.classList.contains('match-card')) rememberCarrierTrip(button);
}, true);

new MutationObserver(() => { renderCarrierTrips(); replaceCarrierConfirmation(); }).observe(document.documentElement, { childList: true, subtree: true });
renderCarrierTrips();
replaceCarrierConfirmation();
