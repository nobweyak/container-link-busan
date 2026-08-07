const ROUTE_DISTANCE_CACHE = new Map();

function kmText(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

async function findCoordinates(input) {
  if (input.dataset.latitude && input.dataset.longitude) {
    return [Number(input.dataset.latitude), Number(input.dataset.longitude)];
  }
  const query = input.value.trim();
  if (!query) return null;
  if (ROUTE_DISTANCE_CACHE.has(query)) return ROUTE_DISTANCE_CACHE.get(query);
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ko&q=${encodeURIComponent(query)}`);
  const [place] = await response.json();
  if (!place) return null;
  const coords = [Number(place.lat), Number(place.lon)];
  ROUTE_DISTANCE_CACHE.set(query, coords);
  input.dataset.latitude = coords[0];
  input.dataset.longitude = coords[1];
  return coords;
}

function installRouteDistance() {
  const form = document.querySelector('#requestForm');
  if (!form || form.querySelector('.route-distance')) return;
  const pickup = form.querySelector('#pickup');
  const destination = form.querySelector('#returnPlace');
  if (!pickup || !destination) return;
  const result = document.createElement('aside');
  result.className = 'route-distance';
  result.innerHTML = '<span>⌖</span><div><b>예상 운반 거리</b><small>인수·반납 장소를 선택하면 계산합니다.</small></div><strong>–</strong>';
  destination.closest('label')?.insertAdjacentElement('afterend', result);
  let requestNumber = 0;
  const calculate = async () => {
    const current = ++requestNumber;
    if (!pickup.value.trim() || !destination.value.trim()) return;
    result.classList.add('loading');
    result.querySelector('small').textContent = '도로 이동 거리를 계산하고 있습니다.';
    try {
      const [start, end] = await Promise.all([findCoordinates(pickup), findCoordinates(destination)]);
      if (!start || !end || current !== requestNumber) throw new Error('coordinates not found');
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=false`);
      const data = await response.json();
      const meters = data.routes?.[0]?.distance;
      if (!meters) throw new Error('route not found');
      form.dataset.routeDistance = String(Math.round(meters));
      result.querySelector('strong').textContent = kmText(meters);
      result.querySelector('small').textContent = '일반 도로 기준 예상 이동 거리';
    } catch (error) {
      if (current !== requestNumber) return;
      result.querySelector('strong').textContent = '확인 필요';
      result.querySelector('small').textContent = '지도에서 장소를 선택하면 거리 계산이 가능합니다.';
    } finally { if (current === requestNumber) result.classList.remove('loading'); }
  };
  pickup.addEventListener('change', calculate);
  destination.addEventListener('change', calculate);
  let timer;
  [pickup, destination].forEach((input) => input.addEventListener('input', () => {
    clearTimeout(timer); timer = setTimeout(calculate, 900);
  }));
  calculate();
}

new MutationObserver(installRouteDistance).observe(document.documentElement, { childList: true, subtree: true });
installRouteDistance();
