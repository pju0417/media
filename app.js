'use strict';
/* ════════════════════════════════════════════════════════════════
   가짜뉴스 탐정단 — app.js
   made by 박선생
════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'fnd_v1';

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════
function defaultState() {
  return {
    phase: 'setup',      // setup | preview | auction | invest | results
    mode: null,          // 'auction' | 'invest'
    settings: {
      initialBalance: 100,
      auctionStart:    10,
      auctionStep:      5,
      auctionReward:   50,  // coins returned for correctly buying real news
    },
    players: [],   // [{ id, name, balance, initialBalance }]
    news:    [],   // [{ id, title, imageData, isReal }]
    previewIndex: 0,
    round: 0,      // current news index during game
    history: [],   // completed rounds [{newsId, winner?, winPrice?, bets?}]
    auc: { price: 0, bidder: null, bidderName: '' },
    inv: { bets: {} }, // {playerId:{choice,amount,done}}
    revealCount: 0,    // for results reveal one-by-one
  };
}

let S;
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    S = raw ? JSON.parse(raw) : defaultState();
    // ensure all fields exist
    const def = defaultState();
    for (const k of Object.keys(def)) {
      if (S[k] === undefined) S[k] = def[k];
    }
  } catch { S = defaultState(); }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); }
  catch(e) { console.warn('저장 실패(용량 초과 가능성):', e.message); }
}

// ═══════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════
function uid() { return '_' + Math.random().toString(36).slice(2, 9); }
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function currentNews() { return S.news[S.round] || null; }
function coin(n) { return `${n}<span style="font-size:.65em;margin-left:2px">🪙</span>`; }

// ═══════════════════════════════════════════════
//  RENDER ENGINE
// ═══════════════════════════════════════════════
const $app = () => document.getElementById('app');

function render() {
  const el = $app();
  if (!el) return;
  const views = { setup: vSetup, preview: vPreview, auction: vAuction, invest: vInvest, results: vResults };
  if (views[S.phase]) el.innerHTML = views[S.phase]();
}

// ═══════════════════════════════════════════════
//  SETUP VIEW
// ═══════════════════════════════════════════════
function vSetup() {
  const canStart = S.mode && S.players.length > 0 && S.news.length > 0;
  return `
<div class="view setup-view">
  <header class="hero">
    <span class="hero-badge">🔍</span>
    <h1>가짜뉴스 <span>탐정단</span></h1>
    <p>진짜와 가짜를 구별하는 뉴스 분석 게임</p>
    <div class="hero-line"></div>
  </header>

  <!-- MODE -->
  <div class="card">
    <h2>🎮 게임 모드 선택</h2>
    <div class="mode-grid">
      <button class="mode-btn ${S.mode==='auction'?'active':''}" data-action="set-mode" data-val="auction">
        <span class="mode-icon">🏷️</span>
        <strong>경매 모드</strong>
        <small>진짜 뉴스를 코인으로 경매해 구매하는 방식</small>
      </button>
      <button class="mode-btn ${S.mode==='invest'?'active':''}" data-action="set-mode" data-val="invest">
        <span class="mode-icon">📈</span>
        <strong>투자 모드</strong>
        <small>진짜·가짜에 코인을 베팅하는 방식</small>
      </button>
    </div>
  </div>

  <!-- PLAYERS -->
  <div class="card">
    <div class="card-header">
      <h2>👥 플레이어 설정</h2>
      <button class="btn btn-sm btn-outline" data-action="add-player">+ 추가</button>
    </div>
    <div id="players-list">
      ${renderPlayersList()}
    </div>
  </div>

  <!-- SETTINGS -->
  <div class="card">
    <h2>⚙️ 게임 설정</h2>
    <div class="settings-grid">
      <div class="setting-row">
        <label>초기 코인</label>
        <div class="num-input-group">
          <button data-action="adj-setting" data-key="initialBalance" data-delta="-10">−</button>
          <span>${S.settings.initialBalance}</span>
          <button data-action="adj-setting" data-key="initialBalance" data-delta="10">+</button>
        </div>
      </div>
      ${S.mode==='auction' ? `
      <div class="setting-row">
        <label>경매 시작가</label>
        <div class="num-input-group">
          <button data-action="adj-setting" data-key="auctionStart" data-delta="-5">−</button>
          <span>${S.settings.auctionStart}</span>
          <button data-action="adj-setting" data-key="auctionStart" data-delta="5">+</button>
        </div>
      </div>
      <div class="setting-row">
        <label>입찰 단위</label>
        <div class="num-input-group">
          <button data-action="adj-setting" data-key="auctionStep" data-delta="-5">−</button>
          <span>${S.settings.auctionStep}</span>
          <button data-action="adj-setting" data-key="auctionStep" data-delta="5">+</button>
        </div>
      </div>
      <div class="setting-row">
        <label>진짜 뉴스 가치</label>
        <div class="num-input-group">
          <button data-action="adj-setting" data-key="auctionReward" data-delta="-10">−</button>
          <span>${S.settings.auctionReward}</span>
          <button data-action="adj-setting" data-key="auctionReward" data-delta="10">+</button>
        </div>
      </div>
      ` : ''}
    </div>
    ${S.mode==='auction' ? `
    <p style="margin-top:12px;font-size:12px;color:var(--text-faint)">
      💡 진짜 뉴스를 낙찰받으면 [가치 - 낙찰가]만큼 코인을 얻습니다. 가짜 뉴스는 낙찰가만큼 잃습니다.
    </p>` : `
    <p style="margin-top:12px;font-size:12px;color:var(--text-faint)">
      💡 올바르게 투자하면 투자액만큼 코인을 얻고, 틀리면 잃습니다.
    </p>`}
  </div>

  <!-- NEWS -->
  <div class="card">
    <div class="card-header">
      <h2>📰 뉴스 카드 <span class="badge">${S.news.length}</span></h2>
      <button class="btn btn-sm btn-outline" data-action="open-news-mgr">뉴스 관리</button>
    </div>
    ${S.news.length === 0
      ? '<p class="empty">뉴스 카드가 없습니다.<br>「뉴스 관리」를 눌러 추가하세요.</p>'
      : `<div class="news-thumb-grid">
          ${S.news.map(n => `
            <div class="news-thumb">
              ${n.imageData
                ? `<img src="${esc(n.imageData)}" alt="">`
                : '<div class="thumb-placeholder">📰</div>'}
              <span>${esc(n.title || '제목없음')}</span>
            </div>
          `).join('')}
        </div>`
    }
  </div>

  <!-- START -->
  <div class="start-area">
    ${!S.mode ? '<p class="hint">📌 게임 모드를 선택하세요</p>' : ''}
    ${S.players.length === 0 ? '<p class="hint">📌 플레이어를 추가하세요</p>' : ''}
    ${S.news.length === 0 ? '<p class="hint">📌 뉴스 카드를 추가하세요</p>' : ''}
    <button class="btn btn-primary btn-xl" data-action="start-game" ${canStart?'':'disabled'}>
      게임 시작 🚀
    </button>
    ${S.history.length > 0 ? `<button class="btn btn-ghost btn-sm" data-action="go-results">이전 결과 보기</button>` : ''}
  </div>
</div>`;
}

function renderPlayersList() {
  if (S.players.length === 0) return '<p class="empty">아직 플레이어가 없습니다</p>';
  return S.players.map((p, i) => `
    <div class="player-row">
      <input type="text" class="player-name-input"
        value="${esc(p.name)}"
        placeholder="플레이어 ${i+1}"
        data-action="rename-player"
        data-idx="${i}">
      <span class="coin-badge">${p.balance}🪙</span>
      <button class="btn-icon danger" data-action="remove-player" data-idx="${i}">🗑</button>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════
//  NEWS MANAGER MODAL
// ═══════════════════════════════════════════════
function openNewsManager() {
  const list = S.news.length === 0
    ? '<p class="empty">아직 등록된 뉴스가 없습니다</p>'
    : S.news.map((n, i) => `
        <div class="news-list-item">
          <div class="news-list-thumb">
            ${n.imageData
              ? `<img src="${esc(n.imageData)}" alt="">`
              : '<div class="thumb-placeholder">📰</div>'}
          </div>
          <div class="news-list-info">
            <strong>${esc(n.title || '(제목없음)')}</strong>
            <span class="${n.isReal?'badge-real':'badge-fake'}">${n.isReal?'✅ 진짜':'❌ 가짜'}</span>
          </div>
          <button class="btn-icon danger" data-action="remove-news" data-idx="${i}">🗑</button>
        </div>
      `).join('');

  showModal('📰 뉴스 관리', `
    <div class="news-manager">
      <div class="add-news-form">
        <h3>뉴스 추가</h3>
        <input type="text" id="nm-title" class="text-input" placeholder="뉴스 제목을 입력하세요">
        <div class="img-upload-area">
          <label class="btn btn-outline btn-sm" for="nm-file">🖼️ 이미지 파일 선택</label>
          <input type="file" id="nm-file" accept="image/*" style="display:none">
          <input type="text" id="nm-url" class="text-input" placeholder="또는 이미지 URL 입력">
          <div id="nm-preview" class="img-preview-box">미리보기</div>
        </div>
        <div class="real-fake-toggle">
          <span>종류:</span>
          <button id="nm-real" class="toggle-btn real-toggle active">✅ 진짜</button>
          <button id="nm-fake" class="toggle-btn fake-toggle">❌ 가짜</button>
        </div>
        <button class="btn btn-primary btn-full" data-action="add-news">+ 뉴스 추가</button>
      </div>
      <div class="news-list">
        <h3>등록된 뉴스 (${S.news.length}개)</h3>
        ${list}
      </div>
    </div>
  `);

  // Attach local handlers after modal render
  setTimeout(() => {
    const fileEl = document.getElementById('nm-file');
    const urlEl  = document.getElementById('nm-url');
    const prev   = document.getElementById('nm-preview');
    const btnR   = document.getElementById('nm-real');
    const btnF   = document.getElementById('nm-fake');

    fileEl?.addEventListener('change', () => {
      const f = fileEl.files[0];
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) {
        alert('이미지 파일이 2MB를 초과합니다. 더 작은 이미지를 사용하거나 URL을 이용하세요.');
        return;
      }
      const r = new FileReader();
      r.onload = e => { prev.innerHTML = `<img src="${e.target.result}" alt="">`; prev.dataset.b64 = e.target.result; };
      r.readAsDataURL(f);
    });

    urlEl?.addEventListener('blur', () => {
      if (urlEl.value.trim()) {
        prev.innerHTML = `<img src="${esc(urlEl.value.trim())}" alt="" onerror="this.parentElement.textContent='이미지를 불러올 수 없습니다'">`;
        prev.dataset.b64 = '';
      }
    });

    btnR?.addEventListener('click', () => { btnR.classList.add('active'); btnF.classList.remove('active'); });
    btnF?.addEventListener('click', () => { btnF.classList.add('active'); btnR.classList.remove('active'); });
  }, 0);
}

function doAddNews() {
  const title = document.getElementById('nm-title')?.value?.trim() || '';
  const prev  = document.getElementById('nm-preview');
  const urlEl = document.getElementById('nm-url');
  const btnR  = document.getElementById('nm-real');
  let imageData = '';
  if (prev?.dataset?.b64) imageData = prev.dataset.b64;
  else if (urlEl?.value?.trim()) imageData = urlEl.value.trim();
  const isReal = btnR?.classList.contains('active') ?? true;
  S.news.push({ id: uid(), title, imageData, isReal });
  saveState();
  openNewsManager();
}

// ═══════════════════════════════════════════════
//  PREVIEW VIEW
// ═══════════════════════════════════════════════
function vPreview() {
  const n     = S.news[S.previewIndex];
  const total = S.news.length;
  const isLast = S.previewIndex >= total - 1;

  return `
<div class="view preview-view">
  <div class="preview-topbar">
    <button class="btn btn-ghost btn-sm" data-action="back-setup">← 돌아가기</button>
    <div class="progress-dots">
      ${S.news.map((_,i) => `<span class="dot ${i<S.previewIndex?'seen':''} ${i===S.previewIndex?'current':''}"></span>`).join('')}
    </div>
    <span class="preview-count">${S.previewIndex+1} / ${total}</span>
  </div>

  <div class="preview-hero">
    <h2>📋 뉴스 분석 시간</h2>
    <p>모든 뉴스를 살펴본 뒤 게임이 시작됩니다</p>
  </div>

  <div class="news-card-large">
    ${n.imageData
      ? `<div class="news-card-img"><img src="${esc(n.imageData)}" alt="뉴스 이미지"></div>`
      : '<div class="news-card-img placeholder">📰</div>'}
    <div class="news-card-body">
      <div class="news-card-num">뉴스 #${S.previewIndex+1}</div>
      <h3 class="news-card-title">${esc(n.title || '(제목 없음)')}</h3>
    </div>
  </div>

  <div class="preview-nav">
    <button class="btn btn-outline btn-lg" data-action="prev-preview" ${S.previewIndex===0?'disabled':''}>← 이전</button>
    ${isLast
      ? `<button class="btn btn-primary btn-xl" data-action="start-rounds">게임 시작! 🎯</button>`
      : `<button class="btn btn-primary btn-lg" data-action="next-preview">다음 →</button>`
    }
  </div>
</div>`;
}

// ═══════════════════════════════════════════════
//  AUCTION VIEW
// ═══════════════════════════════════════════════
function vAuction() {
  const n = currentNews();
  if (!n) { S.phase = 'results'; saveState(); return vResults(); }

  const step = S.settings.auctionStep;
  const steps = [step, step*2, step*5];

  return `
<div class="auction-view" style="min-height:100vh;display:flex;flex-direction:column;">
  <div class="game-topbar">
    <div class="round-indicator">라운드 ${S.round+1} / ${S.news.length}</div>
    <div class="mode-badge auction">🏷️ 경매 모드</div>
    <button class="btn btn-ghost btn-sm" data-action="end-game">종료</button>
  </div>

  <div class="auction-layout" style="flex:1">
    <!-- Left: News -->
    <div class="auction-left">
      <div class="news-card-game">
        ${n.imageData
          ? `<div class="news-img-wrap"><img src="${esc(n.imageData)}" alt="뉴스"></div>`
          : '<div class="news-img-placeholder">📰</div>'}
        <div class="news-label">#${S.round+1} — ${esc(n.title||'(제목없음)')}</div>
      </div>
    </div>

    <!-- Right: Controls -->
    <div class="auction-right">
      <!-- Bid Display -->
      <div class="bid-display">
        <div class="bid-label">현재 입찰가</div>
        <div class="bid-price">${S.auc.price} <span>🪙</span></div>
        ${S.auc.bidder
          ? `<div class="bid-winner">현재 입찰자: <strong>${esc(S.auc.bidderName)}</strong></div>`
          : `<div class="bid-winner no-bidder">아직 입찰자 없음</div>`}
      </div>

      <!-- Price Increment (Teacher) -->
      <div>
        <div class="price-label">가격 올리기 <span style="color:var(--text-faint);font-weight:400">(교사 조작)</span></div>
        <div class="price-btn-grid">
          ${steps.map(s=>`<button class="btn btn-outline price-btn" data-action="raise-price" data-amount="${s}">+${s}🪙</button>`).join('')}
          <button class="btn btn-outline price-btn" data-action="set-price-direct">직접 입력</button>
          <button class="btn btn-ghost price-btn" data-action="reset-price">초기화</button>
        </div>
      </div>

      <!-- Player Bid Buttons -->
      <div class="player-bid-area">
        <div class="player-bid-label">입찰자 클릭 <span style="color:var(--text-faint);font-weight:400">(손 든 플레이어 선택)</span></div>
        <div class="player-bid-grid">
          ${S.players.map(p=>`
            <button class="player-bid-btn ${S.auc.bidder===p.id?'active':''}"
                    data-action="set-bidder" data-pid="${p.id}" data-pname="${esc(p.name)}"
                    ${p.balance < S.auc.price ? 'disabled title="코인 부족"' : ''}>
              ${esc(p.name)}
              <small>${p.balance}🪙</small>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Confirm -->
      <div class="auction-actions">
        <button class="btn btn-success btn-lg" data-action="sold" ${S.auc.bidder?'':'disabled'}>🔨 낙찰!</button>
        <button class="btn btn-ghost btn-lg" data-action="pass-auction">패스 →</button>
      </div>
    </div>
  </div>

  <!-- Balance Bar -->
  <div class="balance-bar">
    ${S.players.map(p=>`
      <div class="balance-item ${S.auc.bidder===p.id?'active-bidder':''}">
        <div class="balance-name">${esc(p.name)}</div>
        <div class="balance-amount">${p.balance}🪙</div>
      </div>
    `).join('')}
  </div>
</div>`;
}

// ═══════════════════════════════════════════════
//  INVEST VIEW
// ═══════════════════════════════════════════════
function vInvest() {
  const n = currentNews();
  if (!n) { S.phase = 'results'; saveState(); return vResults(); }

  const bets   = S.inv.bets;
  const allDone = S.players.every(p => bets[p.id]?.done);

  return `
<div class="invest-view" style="min-height:100vh;display:flex;flex-direction:column;">
  <div class="game-topbar">
    <div class="round-indicator">라운드 ${S.round+1} / ${S.news.length}</div>
    <div class="mode-badge invest">📈 투자 모드</div>
    <button class="btn btn-ghost btn-sm" data-action="end-game">종료</button>
  </div>

  <div class="invest-layout" style="flex:1;align-items:start">
    <!-- Left: News -->
    <div class="invest-left">
      <div class="news-card-game">
        ${n.imageData
          ? `<div class="news-img-wrap"><img src="${esc(n.imageData)}" alt="뉴스"></div>`
          : '<div class="news-img-placeholder">📰</div>'}
        <div class="news-label">#${S.round+1} — ${esc(n.title||'(제목없음)')}</div>
      </div>
    </div>

    <!-- Right: Invest Panels -->
    <div class="invest-right">
      <div class="invest-panels">
        ${S.players.map(p => {
          const bet = bets[p.id] || { choice:null, amount:0, done:false };
          return `
          <div class="invest-panel ${bet.done?'done':''}">
            <div class="invest-panel-header">
              <strong>${esc(p.name)}</strong>
              <span class="coin-small">${p.balance}🪙</span>
              ${bet.done ? `
                <span class="done-badge">✅ 완료</span>
                <button class="btn btn-ghost btn-sm" data-action="unlock-bet" data-pid="${p.id}" style="padding:3px 8px;font-size:11px">수정</button>
              ` : ''}
            </div>
            ${!bet.done ? `
              <div class="bet-choice">
                <button class="choice-btn real ${bet.choice==='real'?'selected':''}"
                        data-action="set-choice" data-pid="${p.id}" data-choice="real">✅ 진짜</button>
                <button class="choice-btn fake ${bet.choice==='fake'?'selected':''}"
                        data-action="set-choice" data-pid="${p.id}" data-choice="fake">❌ 가짜</button>
              </div>
              <div class="bet-amount">
                <button class="btn-sm-icon" data-action="adj-bet" data-pid="${p.id}" data-delta="-10">−10</button>
                <button class="btn-sm-icon" data-action="adj-bet" data-pid="${p.id}" data-delta="-5">−5</button>
                <span class="bet-amt-display">${bet.amount}🪙</span>
                <button class="btn-sm-icon" data-action="adj-bet" data-pid="${p.id}" data-delta="5">+5</button>
                <button class="btn-sm-icon" data-action="adj-bet" data-pid="${p.id}" data-delta="10">+10</button>
                <button class="btn-sm-icon" data-action="adj-bet" data-pid="${p.id}" data-delta="${p.balance}">전액</button>
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-sm btn-primary" style="flex:1" data-action="lock-bet" data-pid="${p.id}"
                        ${bet.choice&&bet.amount>0?'':'disabled'}>투자 확정</button>
                <button class="btn btn-sm btn-ghost" data-action="pass-invest" data-pid="${p.id}">패스</button>
              </div>
            ` : `
              <div class="bet-summary">
                <span class="${bet.choice==='real'?'real-text':'fake-text'}">${bet.choice==='real'?'✅ 진짜':'❌ 가짜'}</span>에
                <strong style="color:var(--amber)">${bet.amount}🪙</strong> 투자
              </div>
            `}
          </div>`;
        }).join('')}
      </div>

      <button class="btn btn-primary btn-xl btn-full" data-action="next-invest-round" ${allDone?'':'disabled'}>
        ${S.round+1 < S.news.length ? '다음 뉴스 →' : '결과 보기 🎉'}
      </button>
    </div>
  </div>
</div>`;
}

// ═══════════════════════════════════════════════
//  RESULTS VIEW
// ═══════════════════════════════════════════════
function vResults() {
  const revealed = S.revealCount;

  // Build per-player cumulative scores from history
  const scores = {};
  S.players.forEach(p => { scores[p.id] = p.initialBalance; });
  S.history.forEach(h => {
    const news = S.news.find(n => n.id === h.newsId);
    if (!news) return;
    if (S.mode === 'auction') {
      if (h.winner) {
        const profit = news.isReal ? S.settings.auctionReward - h.winPrice : -h.winPrice;
        if (scores[h.winner] !== undefined) scores[h.winner] += profit;
      }
    } else {
      Object.entries(h.bets || {}).forEach(([pid, bet]) => {
        const correct = (bet.choice==='real') === news.isReal;
        if (scores[pid] !== undefined) scores[pid] += correct ? bet.amount : -bet.amount;
      });
    }
  });

  const sorted = [...S.players].sort((a,b) => (scores[b.id]||0) - (scores[a.id]||0));
  const medals = ['🥇','🥈','🥉'];

  return `
<div class="view results-view">
  <div class="results-header">
    <h1>🎉 결과 발표!</h1>
    <p>${S.mode==='auction'?'경매':'투자'} 게임이 모두 종료되었습니다</p>
  </div>

  <!-- Reveal Controls -->
  <div class="reveal-controls">
    ${revealed < S.news.length
      ? `<button class="btn btn-primary btn-lg" data-action="reveal-next">
          다음 공개 (${revealed}/${S.news.length}) →
        </button>`
      : `<p style="color:var(--green);font-weight:700;font-size:15px">✅ 모든 결과가 공개되었습니다</p>`
    }
  </div>

  <!-- News Reveal Grid -->
  <section class="results-news">
    <h2>📰 뉴스 진위 결과</h2>
    <div class="results-news-grid">
      ${S.news.map((n, i) => {
        const isRevealed = i < revealed;
        const h = S.history.find(r => r.newsId === n.id);
        return `
          <div class="result-news-card ${!isRevealed?'hidden-result':''}">
            ${n.imageData?`<img src="${esc(n.imageData)}" alt="">` : '<div class="no-img">📰</div>'}
            <div class="result-news-info">
              <div class="result-news-num">#${i+1}</div>
              <div class="result-news-title">${esc(n.title||'(제목없음)')}</div>
              ${isRevealed?`<div class="result-stamp ${n.isReal?'stamp-real':'stamp-fake'}">${n.isReal?'✅ 진짜':'❌ 가짜'}</div>`:''}
            </div>
            ${isRevealed ? renderRoundDetail(h, n) : ''}
          </div>`;
      }).join('')}
    </div>
  </section>

  <!-- Rankings -->
  <section class="results-ranking">
    <h2>🏆 최종 순위</h2>
    <div class="ranking-table">
      ${sorted.map((p, i) => {
        const final  = scores[p.id] !== undefined ? scores[p.id] : p.balance;
        const change = final - p.initialBalance;
        return `
          <div class="ranking-row ${i===0?'first':i===1?'second':i===2?'third':''}">
            <div class="rank-num">${medals[i] || i+1}</div>
            <div class="rank-name">${esc(p.name)}</div>
            <div class="rank-balance">${final}🪙</div>
            <div class="rank-change ${change>=0?'positive':'negative'}">${change>=0?'+':''}${change}</div>
          </div>`;
      }).join('')}
    </div>
  </section>

  <div class="results-actions">
    <button class="btn btn-primary btn-xl" data-action="new-game">🔄 새 게임</button>
    <button class="btn btn-outline" data-action="back-setup">설정으로</button>
  </div>
</div>`;
}

function renderRoundDetail(h, news) {
  if (!h) return '';
  if (S.mode === 'auction') {
    if (!h.winner) return `<div class="round-result"><em>패스</em></div>`;
    const winner = S.players.find(p => p.id === h.winner);
    const profit = news.isReal ? S.settings.auctionReward - h.winPrice : -h.winPrice;
    return `
      <div class="round-result">
        <span class="winner-name">${esc(winner?.name||'?')}</span> 낙찰 (${h.winPrice}🪙)
        <span class="${profit>=0?'positive':'negative'}">${profit>=0?'+':''}${profit}🪙</span>
      </div>`;
  } else {
    if (!h.bets) return '';
    const lines = Object.entries(h.bets).map(([pid, bet]) => {
      const player  = S.players.find(p => p.id === pid);
      const skipped = bet.skipped || bet.amount === 0;
      if (skipped) return `<div class="bet-result">${esc(player?.name||'?')}: 패스</div>`;
      const correct = (bet.choice==='real') === news.isReal;
      const profit  = correct ? bet.amount : -bet.amount;
      return `
        <div class="bet-result ${correct?'correct':'wrong'}">
          ${esc(player?.name||'?')}: ${bet.choice==='real'?'진짜':'가짜'} ${bet.amount}🪙
          <span>${correct?'✅':'❌'} ${profit>=0?'+':''}${profit}</span>
        </div>`;
    });
    return `<div class="round-result invest-result">${lines.join('')}</div>`;
  }
}

// ═══════════════════════════════════════════════
//  MODAL
// ═══════════════════════════════════════════════
function showModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('overlay').classList.add('hidden');
}

// ═══════════════════════════════════════════════
//  GAME HELPERS
// ═══════════════════════════════════════════════
function initAuction() {
  S.auc = { price: S.settings.auctionStart, bidder: null, bidderName: '' };
}
function initInvest() {
  S.inv = { bets: {} };
  S.players.forEach(p => { S.inv.bets[p.id] = { choice: null, amount: 0, done: false }; });
}

// ═══════════════════════════════════════════════
//  EVENT DELEGATION
// ═══════════════════════════════════════════════
document.addEventListener('click', e => {
  // Modal overlay click
  if (e.target === document.getElementById('overlay')) { closeModal(); return; }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  switch(action) {

    // ── SETUP ──
    case 'set-mode':
      S.mode = btn.dataset.val;
      saveState(); render(); break;

    case 'add-player':
      S.players.push({ id:uid(), name:`${S.players.length+1}모둠`, balance:S.settings.initialBalance, initialBalance:S.settings.initialBalance });
      saveState(); render(); break;

    case 'remove-player': {
      const idx = +btn.dataset.idx;
      S.players.splice(idx, 1);
      saveState(); render(); break;
    }

    case 'adj-setting': {
      const key = btn.dataset.key;
      const delta = +btn.dataset.delta;
      S.settings[key] = Math.max(1, (S.settings[key]||0) + delta);
      saveState(); render(); break;
    }

    case 'open-news-mgr': openNewsManager(); break;
    case 'close-modal': closeModal(); break;

    case 'add-news': doAddNews(); break;

    case 'remove-news': {
      S.news.splice(+btn.dataset.idx, 1);
      saveState(); openNewsManager(); break;
    }

    case 'start-game':
      if (S.mode && S.players.length > 0 && S.news.length > 0) {
        S.players.forEach(p => { p.balance = S.settings.initialBalance; p.initialBalance = S.settings.initialBalance; });
        S.round = 0; S.history = []; S.previewIndex = 0; S.revealCount = 0;
        S.phase = 'preview';
        saveState(); render();
      }
      break;

    case 'go-results':
      S.phase = 'results';
      saveState(); render(); break;

    // ── PREVIEW ──
    case 'back-setup':
      S.phase = 'setup'; saveState(); render(); break;

    case 'prev-preview':
      if (S.previewIndex > 0) { S.previewIndex--; saveState(); render(); }
      break;

    case 'next-preview':
      if (S.previewIndex < S.news.length-1) { S.previewIndex++; saveState(); render(); }
      break;

    case 'start-rounds':
      S.round = 0;
      if (S.mode === 'auction') { S.phase = 'auction'; initAuction(); }
      else { S.phase = 'invest'; initInvest(); }
      saveState(); render(); break;

    // ── AUCTION ──
    case 'raise-price':
      S.auc.price += +btn.dataset.amount;
      S.auc.bidder = null; S.auc.bidderName = ''; // reset bidder on price raise
      saveState(); render(); break;

    case 'set-price-direct': {
      const val = prompt('입찰가를 직접 입력하세요:', S.auc.price);
      if (val !== null && !isNaN(val) && +val >= 0) {
        S.auc.price = +val;
        S.auc.bidder = null; S.auc.bidderName = '';
        saveState(); render();
      }
      break;
    }

    case 'reset-price':
      initAuction(); saveState(); render(); break;

    case 'set-bidder': {
      const pid   = btn.dataset.pid;
      const pname = btn.dataset.pname;
      S.auc.bidder     = (S.auc.bidder === pid) ? null : pid;
      S.auc.bidderName = (S.auc.bidder === pid) ? '' : pname;
      // re-assign correctly
      if (S.auc.bidder) S.auc.bidderName = pname;
      saveState(); render(); break;
    }

    case 'sold': {
      if (!S.auc.bidder) break;
      const winner = S.players.find(p => p.id === S.auc.bidder);
      const n = currentNews();
      if (!winner || !n) break;
      const profit = n.isReal ? S.settings.auctionReward - S.auc.price : -S.auc.price;
      winner.balance += profit;
      S.history.push({ newsId:n.id, winner:S.auc.bidder, winPrice:S.auc.price });
      S.round++;
      if (S.round >= S.news.length) { S.phase = 'results'; S.revealCount = 0; }
      else initAuction();
      saveState(); render(); break;
    }

    case 'pass-auction': {
      const n = currentNews();
      if (n) S.history.push({ newsId:n.id, winner:null, winPrice:0 });
      S.round++;
      if (S.round >= S.news.length) { S.phase = 'results'; S.revealCount = 0; }
      else initAuction();
      saveState(); render(); break;
    }

    case 'end-game':
      if (confirm('게임을 종료하고 결과를 확인하시겠습니까?')) {
        S.phase = 'results'; S.revealCount = 0; saveState(); render();
      }
      break;

    // ── INVEST ──
    case 'set-choice': {
      const pid = btn.dataset.pid;
      if (!S.inv.bets[pid]) S.inv.bets[pid] = { choice:null, amount:0, done:false };
      S.inv.bets[pid].choice = btn.dataset.choice;
      saveState(); render(); break;
    }

    case 'adj-bet': {
      const pid   = btn.dataset.pid;
      const delta = +btn.dataset.delta;
      const player = S.players.find(p => p.id === pid);
      if (!player) break;
      if (!S.inv.bets[pid]) S.inv.bets[pid] = { choice:null, amount:0, done:false };
      const cur = S.inv.bets[pid].amount || 0;
      S.inv.bets[pid].amount = Math.max(0, Math.min(player.balance, cur + delta));
      saveState(); render(); break;
    }

    case 'lock-bet': {
      const pid = btn.dataset.pid;
      const bet = S.inv.bets[pid];
      if (bet?.choice && bet?.amount > 0) { bet.done = true; saveState(); render(); }
      break;
    }

    case 'pass-invest': {
      const pid = btn.dataset.pid;
      if (!S.inv.bets[pid]) S.inv.bets[pid] = { choice:null, amount:0, done:false };
      S.inv.bets[pid] = { choice: null, amount: 0, done: true, skipped: true };
      saveState(); render(); break;
    }

    case 'unlock-bet': {
      const pid = btn.dataset.pid;
      if (S.inv.bets[pid]) { S.inv.bets[pid].done = false; S.inv.bets[pid].skipped = false; }
      saveState(); render(); break;
    }

    case 'next-invest-round': {
      const allDone = S.players.every(p => S.inv.bets[p.id]?.done);
      if (!allDone) break;
      const n = currentNews();
      if (!n) break;
      // Apply bets
      S.players.forEach(p => {
        const bet = S.inv.bets[p.id];
        if (!bet?.done || bet?.skipped || !bet?.choice) return;
        const correct = (bet.choice==='real') === n.isReal;
        p.balance += correct ? bet.amount : -bet.amount;
      });
      S.history.push({ newsId: n.id, bets: JSON.parse(JSON.stringify(S.inv.bets)) });
      S.round++;
      if (S.round >= S.news.length) { S.phase = 'results'; S.revealCount = 0; }
      else initInvest();
      saveState(); render(); break;
    }

    // ── RESULTS ──
    case 'reveal-next':
      if (S.revealCount < S.news.length) { S.revealCount++; saveState(); render(); }
      break;

    case 'new-game': {
      const keptNews    = JSON.parse(JSON.stringify(S.news));
      const keptPlayers = JSON.parse(JSON.stringify(S.players.map(p => ({ id:p.id, name:p.name, balance:p.initialBalance, initialBalance:p.initialBalance }))));
      S = defaultState();
      S.news    = keptNews;
      S.players = keptPlayers;
      saveState(); render(); break;
    }

    case 'back-setup':
      S.phase = 'setup'; saveState(); render(); break;
  }
});

// Player name input handler
document.addEventListener('input', e => {
  if (e.target.dataset.action === 'rename-player') {
    const idx = +e.target.dataset.idx;
    if (S.players[idx]) { S.players[idx].name = e.target.value; saveState(); }
  }
});

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
loadState();
render();
