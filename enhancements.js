let demoRole = '';

function installLogo() {
  for (const logo of document.querySelectorAll('.logo')) {
    if (logo.dataset.enhanced) continue;
    logo.dataset.enhanced = 'true';
    logo.innerHTML = '<img src="assets/logo.jpg" alt="컨테이너 링크 로고"><span>컨테이너 링크</span>';
  }
}

function installDemoAccounts() {
  const view = document.querySelector('.login-view');
  if (!view || view.querySelector('.demo-accounts')) return;
  const box = document.createElement('section');
  box.className = 'demo-accounts';
  box.innerHTML = `
    <b>시연용 테스트 계정</b>
    <button type="button" data-demo-role="carrier"><span>공컨 운반자</span><small>carrier-demo@containerlink.kr · 1234</small></button>
    <button type="button" data-demo-role="requester"><span>컨테이너 필요자</span><small>requester-demo@containerlink.kr · 1234</small></button>`;
  view.querySelector('#signin')?.before(box);
  box.querySelectorAll('[data-demo-role]').forEach((button) => {
    button.onclick = () => {
      demoRole = button.dataset.demoRole;
      const inputs = view.querySelectorAll('input');
      if (inputs.length >= 2) {
        inputs[0].value = demoRole === 'carrier' ? 'carrier-demo@containerlink.kr' : 'requester-demo@containerlink.kr';
        inputs[1].value = '1234';
        sessionStorage.setItem('container-link-active-account', inputs[0].value);
      }
      view.querySelector('#signin')?.click();
    };
  });
}

function applyDemoRole() {
  if (!demoRole) return;
  const id = demoRole === 'carrier' ? '#carrier' : '#requester';
  const choice = document.querySelector(id);
  if (choice) {
    const next = choice;
    localStorage.setItem('container-link-role', demoRole);
    demoRole = '';
    next.click();
  }
}

function replaceQuantitySelect() {
  const select = document.querySelector('#quantity');
  if (!select || select.tagName !== 'SELECT') return;
  const input = document.createElement('input');
  input.id = 'quantity';
  input.type = 'number';
  input.min = '1';
  input.step = '1';
  input.value = select.value || '1';
  input.inputMode = 'numeric';
  input.placeholder = '필요 수량 입력';
  input.setAttribute('aria-label', '필요 수량');
  select.replaceWith(input);
}

function enhance() {
  installLogo();
  installDemoAccounts();
  applyDemoRole();
  replaceQuantitySelect();
}

document.addEventListener('click', (event) => {
  if (event.target.closest?.('#signin')) {
    const email = document.querySelector('.login-view input')?.value.trim();
    if (email) sessionStorage.setItem('container-link-active-account', email);
  }
}, true);

new MutationObserver(enhance).observe(document.documentElement, { childList: true, subtree: true });
enhance();
