const ADDRESS_FIELDS = [
  { id: 'pickup', title: '희망 인수 장소 선택' },
  { id: 'returnPlace', title: '반납지 선택' }
];

function roadAddress(result) {
  const a = result.address || {};
  const street = [a.road, a.house_number].filter(Boolean).join(' ');
  const region = [a.city || a.town || a.village || a.county, a.state].filter(Boolean).join(' ');
  return [region, street].filter(Boolean).join(' ') || result.display_name;
}

function addAddressButtons() {
  for (const field of ADDRESS_FIELDS) {
    const input = document.querySelector(`#${field.id}`);
    if (!input || input.parentElement?.querySelector(`[data-address-for="${field.id}"]`)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'address-search-button';
    button.dataset.addressFor = field.id;
    button.textContent = '지도에서 장소 검색';
    button.onclick = () => openAddressPicker(field, input);
    input.insertAdjacentElement('afterend', button);
  }
}

function openAddressPicker(field, target) {
  document.querySelector('.address-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'address-modal';
  modal.innerHTML = `<section role="dialog" aria-modal="true" aria-label="${field.title}"><header><b>${field.title}</b><button type="button" class="address-close">×</button></header><form class="address-query"><input aria-label="장소명 검색" value="${target.value.replace(/"/g, '&quot;')}" placeholder="예: 부산신항, 감만CY"><button>검색</button></form><div class="address-results"><p>장소명 또는 주소를 입력해 검색해 주세요.</p></div></section>`;
  document.body.append(modal);
  const close = () => modal.remove();
  modal.querySelector('.address-close').onclick = close;
  modal.onclick = (event) => { if (event.target === modal) close(); };
  const form = modal.querySelector('.address-query');
  const results = modal.querySelector('.address-results');
  const search = async () => {
    const query = form.querySelector('input').value.trim();
    if (!query) return;
    results.innerHTML = '<p>장소와 도로명 주소를 찾는 중…</p>';
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&accept-language=ko&q=${encodeURIComponent(query)}`);
      const places = await response.json();
      results.innerHTML = places.length ? places.map((place, index) => `<article data-index="${index}"><b>${roadAddress(place)}</b><small>${place.display_name}</small><button type="button">지도에서 확인</button></article>`).join('') : '<p>검색 결과가 없습니다. 더 구체적인 장소명이나 주소를 입력해 주세요.</p>';
      results.querySelectorAll('article').forEach((row) => row.querySelector('button').onclick = () => showMap(row, places[Number(row.dataset.index)], target, close));
    } catch (error) {
      results.innerHTML = '<p>장소 검색에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.</p>';
      console.error(error);
    }
  };
  form.onsubmit = (event) => { event.preventDefault(); search(); };
  if (target.value) search();
}

function showMap(row, place, target, close) {
  const address = roadAddress(place);
  row.innerHTML = `<b>${address}</b><small>${place.display_name}</small><iframe title="선택 위치 지도" src="https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=${place.lat}%2C${place.lon}&bbox=${Number(place.lon) - .015}%2C${Number(place.lat) - .01}%2C${Number(place.lon) + .015}%2C${Number(place.lat) + .01}"></iframe><button type="button" class="address-confirm">이 도로명 주소로 선택</button>`;
  row.querySelector('.address-confirm').onclick = () => { target.value = address; target.dataset.latitude = place.lat; target.dataset.longitude = place.lon; target.dispatchEvent(new Event('change', { bubbles: true })); close(); };
}

new MutationObserver(addAddressButtons).observe(document.documentElement, { childList: true, subtree: true });
addAddressButtons();
