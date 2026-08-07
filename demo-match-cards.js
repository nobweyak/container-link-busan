const demoMatches = [
  ['부산신항', '감만CY', '오늘 14:30', '96'],
  ['부산신항', '부산 북항', '오늘 15:00', '93'],
  ['부산신항', '감만CY', '오늘 15:30', '91']
];

function ensureThreeMatches() {
  const results = document.querySelector('#matchResults');
  if (!results || results.querySelector('.loading') || results.dataset.demoFilled) return;
  const cards = [...results.querySelectorAll('.match-card')];
  const needed = Math.max(0, 3 - cards.length);
  for (let index = 0; index < needed; index++) {
    const [from, to, time, score] = demoMatches[(cards.length + index) % demoMatches.length];
    const card = document.createElement('article');
    card.className = 'match-card demo-match';
    card.innerHTML = `<span class="rank">${cards.length + index + 1}</span><div><b>${from} <i>→</i> ${to}</b><small>20FT DRY · ${time}</small><em>시연 예시 매칭</em></div><strong>${score}<small>매칭도</small></strong>`;
    results.append(card);
  }
  results.dataset.demoFilled = 'true';
}

new MutationObserver(ensureThreeMatches).observe(document.documentElement, { childList: true, subtree: true });
ensureThreeMatches();
