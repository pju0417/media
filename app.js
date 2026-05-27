'use strict';

// ================================================================
// CONSTANTS
// ================================================================
const COLORS = [
  '#e94560', '#4dabf7', '#51cf66', '#ff922b',
  '#cc5de8', '#20c997', '#ffd43b', '#ff6b9d'
];

const DEF_BALANCE = 1_000_000;
const DEF_START   =   100_000;
const DEF_STEP    =    50_000;

// ================================================================
// STATE
// ================================================================
function freshState() {
  return {
    phase: 'home',           // home | admin | browse | game | results
    mode: null,              // 'auction' | 'investment'
    adminTab: 'players',
    players: Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      name: `모둠 ${i + 1}`,
      balance: DEF_BALANCE,
      history: [],
    })),
    news: [],                // [{ id, title, imageData, answer }]
    initialBalance: DEF_BALANCE,
    auctionStartPrice: DEF_START,
    auctionStep: DEF_STEP,
    browseIndex: 0,
    gameIndex: 0,
    auction: {
      price: DEF_START,
      activeBidders: [],
      status: 'bidding',     // bidding | selectWinner | awarded | passed
      winner: null,
    },
    investInputs: {},        // { playerId: { side, amount, confirmed } }
    roundResults: [],        // [{ purchase } | { investments }]
    revealIndex: 0,
    resultsApplied: false,
  };
}

let state;
(function initState() {
  try {
    const raw = localStorage.getItem('fnd_v1');
    if (!raw) { state = freshState(); return; }
    state = JSON.parse(raw);
    // Ensure new fields exist (back-compat)
    if (!state.roundResults)       state.roundResults = [];
    if (!state.investInputs)       state.investInputs = {};
    if (!state.auction)            state.auction = { price: DEF_START, activeBidders: [], status: 'bidding', winner: null };
    if (state.revealIndex == null) state.revealIndex = 0;
    if (state.resultsApplied == null) state.resultsApplied = false;
    if (!state.players?.length)    state = freshState();
  } catch {
    state = freshState();
  }
})();

function save() {
  try { localStorage.setItem('fnd_v1', JSON.stringify(state)); } catch (e) { /* storage full */ }
}

// ================================================================
// UTILITIES
// ================================================================
function won(n) {
  if (n == null) return '-';
  return Math.round(n).toLocaleString('ko-KR') + '원';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function color(playerOrIndex) {
  const i = typeof playerOrIndex === 'number'
    ? playerOrIndex
    : state.players.indexOf(playerOrIndex);
  return COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length];
}

function colorById(id) {
  return color(state.players.findIndex(p => p.id === id));
}

// ================================================================
// RENDER DISPATCHER
// ================================================================
function render() {
  const app = document.getElementById('app');
  if (!app) return;
  switch (state.phase) {
    case 'home':    app.innerHTML = viewHome();       break;
    case 'admin':   app.innerHTML = viewAdmin();      break;
    case 'browse':  app.innerHTML = viewBrowse();     break;
    case 'game':
      if (state.mode === 'auction') app.innerHTML = viewAuction();
      else                          app.innerHTML = viewInvestment();
      break;
    case 'results': app.innerHTML = viewResults();    break;
    default:        app.innerHTML = viewHome();
  }
  save();
}

// ================================================================
// VIEW: HOME
// ================================================================
function viewHome() {
  const ready = state.news.length >= 2 && state.mode;
  return `
<div class="home">
  <div class="home-hero">
    <div class="hero-eyebrow">Fake News Detective</div>
    <span class="hero-icon">🔍</span>
    <h1 class="hero-title">가짜뉴스 탐정단</h1>
    <p class="hero-sub">뉴스의 진위를 파악하라!</p>
  </div>

  <p class="mode-prompt">게임 모드를 선택하세요</p>
  <div class="mode-grid">
    <button class="mode-card ${state.mode === 'auction' ? 'selected' : ''}"
            data-action="select-mode" data-mode="auction">
      <span class="mc-icon">🏛️</span>
      <div class="mc-title">경매 모드</div>
      <p class="mc-desc">진짜라고 생각하는 뉴스를<br>경매로 구매하세요</p>
      <ul class="mc-rules">
        <li>진짜 뉴스 구매 → 투자금 × 2 수익</li>
        <li>가짜 뉴스 구매 → 투자금 손실</li>
      </ul>
    </button>
    <button class="mode-card ${state.mode === 'investment' ? 'selected' : ''}"
            data-action="select-mode" data-mode="investment">
      <span class="mc-icon">📈</span>
      <div class="mc-title">투자 모드</div>
      <p class="mc-desc">뉴스가 진짜인지 가짜인지<br>원하는 금액만큼 투자하세요</p>
      <ul class="mc-rules">
        <li>정답 방향 투자 → 투자금 × 2 수익</li>
        <li>오답 방향 투자 → 투자금 손실</li>
      </ul>
    </button>
  </div>

  <div class="home-btns">
    <button class="btn btn-outline" data-action="go-admin">⚙️ 관리자 패널</button>
    ${ready ? `<button class="btn btn-gold btn-lg" data-action="go-browse">▶ 게임 시작</button>` : ''}
  </div>
</div>`;
}

// ================================================================
// VIEW: ADMIN
// ================================================================
function viewAdmin() {
  const tab = state.adminTab || 'players';
  const allAnswered = state.news.length > 0 && state.news.every(n => n.answer);
  const canStart = state.news.length >= 2 && state.mode && allAnswered;

  return `
<div class="admin">
  <div class="admin-header">
    <button class="btn btn-ghost" data-action="go-home">← 홈</button>
    <h2>⚙️ 관리자 패널</h2>
    <span class="mode-badge">
      ${state.mode === 'auction' ? '🏛️ 경매 모드' : state.mode === 'investment' ? '📈 투자 모드' : '모드 미선택'}
    </span>
  </div>

  <div class="tabs">
    <button class="tab ${tab === 'players'  ? 'active' : ''}" data-action="tab" data-tab="players">👥 플레이어</button>
    <button class="tab ${tab === 'news'     ? 'active' : ''}" data-action="tab" data-tab="news">📰 뉴스 카드</button>
    <button class="tab ${tab === 'settings' ? 'active' : ''}" data-action="tab" data-tab="settings">⚙️ 설정</button>
  </div>

  <div class="tab-content">
    ${tab === 'players'  ? tabPlayers()  : ''}
    ${tab === 'news'     ? tabNews()     : ''}
    ${tab === 'settings' ? tabSettings() : ''}
  </div>

  <div class="admin-footer">
    ${canStart
      ? `<button class="btn btn-success btn-lg" data-action="start-browse">🎮 게임 시작 — 뉴스 ${state.news.length}개</button>`
      : `<p class="hint-footer">
           게임 시작 조건: 홈에서 모드 선택 &nbsp;·&nbsp; 뉴스 2개 이상 &nbsp;·&nbsp; 모든 뉴스 진위 설정
           ${state.news.some(n => !n.answer) ? '<br><span style="color:var(--red)">⚠️ 진위 미설정 뉴스가 있습니다</span>' : ''}
         </p>`}
  </div>
</div>`;
}

function tabPlayers() {
  return `
<div class="admin-sec">
  <div class="sec-hdr">
    <h3>플레이어 관리 (${state.players.length}명)</h3>
    <button class="btn btn-sm btn-primary" data-action="add-player"
            ${state.players.length >= 8 ? 'disabled' : ''}>+ 추가</button>
  </div>

  <div class="player-list">
    ${state.players.map((p, i) => `
    <div class="player-row" style="--c:${color(i)}">
      <div class="p-dot"></div>
      <input class="p-name-input" type="text" value="${esc(p.name)}"
             data-action="edit-name" data-id="${p.id}">
      <span class="p-bal">${won(p.balance)}</span>
      <button class="btn btn-sm btn-danger" data-action="remove-player" data-id="${p.id}"
              ${state.players.length <= 1 ? 'disabled' : ''}>✕</button>
    </div>`).join('')}
  </div>

  <div class="balance-box">
    <label class="balance-label">
      초기 잔액
      <input type="number" class="num-input" value="${state.initialBalance}"
             step="100000" min="10000" data-action="set-init-balance">
      원
    </label>
    <button class="btn btn-sm btn-outline" data-action="reset-balances">💰 잔액 초기화</button>
  </div>
</div>`;
}

function tabNews() {
  return `
<div class="admin-sec">
  <div class="sec-hdr">
    <h3>뉴스 카드 (${state.news.length}개)</h3>
  </div>

  <label class="upload-zone">
    <input type="file" accept="image/*" multiple data-action="upload-news" style="display:none">
    <div class="upload-inner">
      <div class="upload-icon">📷</div>
      <div class="upload-text">이미지 클릭하여 업로드</div>
      <div class="upload-sub">여러 장 동시 선택 가능 · JPG, PNG, GIF 등</div>
    </div>
  </label>

  ${state.news.length === 0
    ? `<p class="empty-msg">뉴스 카드가 없습니다. 이미지를 업로드해 주세요.</p>`
    : `<div class="news-grid">
        ${state.news.map((n, i) => `
        <div class="news-card-admin ${n.answer ? 'has-answer' : 'no-answer'}">
          <div class="nc-num">#${i + 1}</div>
          <img src="${n.imageData}" class="nc-img"
               data-action="zoom" data-src="${n.imageData}" alt="뉴스 ${i + 1}">
          <input class="nc-title-input" type="text" value="${esc(n.title || '')}"
                 placeholder="제목 (선택)" data-action="edit-title" data-id="${n.id}">
          <div class="nc-answer">
            <button class="ans-btn ${n.answer === 'real' ? 'ans-real' : ''}"
                    data-action="set-answer" data-id="${n.id}" data-val="real">✅ 진짜</button>
            <button class="ans-btn ${n.answer === 'fake' ? 'ans-fake' : ''}"
                    data-action="set-answer" data-id="${n.id}" data-val="fake">❌ 가짜</button>
          </div>
          <button class="btn btn-sm btn-danger" data-action="del-news" data-id="${n.id}">삭제</button>
        </div>`).join('')}
      </div>`}
</div>`;
}

function tabSettings() {
  return `
<div class="admin-sec">
  <h3 style="margin-bottom:20px">경매 설정</h3>

  <div class="setting-item">
    <label>경매 시작가</label>
    <div class="setting-row">
      <input type="number" class="num-input" value="${state.auctionStartPrice}"
             step="50000" min="0" data-action="set-auction-start">
      <span>원</span>
    </div>
  </div>

  <div class="setting-item">
    <label>가격 올리기 단위</label>
    <div class="setting-row">
      <input type="number" class="num-input" value="${state.auctionStep}"
             step="10000" min="1000" data-action="set-auction-step">
      <span>원</span>
    </div>
  </div>

  <div class="danger-zone">
    <h4>⚠️ 데이터 초기화</h4>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-danger" data-action="reset-game">게임 결과 초기화</button>
      <button class="btn btn-danger" data-action="reset-all">전체 초기화</button>
    </div>
  </div>
</div>`;
}

// ================================================================
// VIEW: BROWSE
// ================================================================
function viewBrowse() {
  const n = state.news[state.browseIndex];
  const total = state.news.length;
  const idx = state.browseIndex;

  return `
<div class="browse">
  <div class="browse-hdr">
    <button class="btn btn-ghost" data-action="go-admin">← 관리자</button>
    <div class="browse-counter">
      <span class="bc-text">${idx + 1} / ${total}</span>
      <div class="bc-dots">
        ${state.news.map((_, i) =>
          `<span class="dot ${i < idx ? 'seen' : i === idx ? 'cur' : ''}"></span>`
        ).join('')}
      </div>
    </div>
    <div style="width:80px"></div>
  </div>

  <div class="browse-body">
    <div class="browse-tag">📰 뉴스 #${idx + 1}</div>
    ${n.title ? `<h2 class="browse-title">${esc(n.title)}</h2>` : ''}
    <div class="browse-img-wrap">
      <img src="${n.imageData}" class="browse-img"
           data-action="zoom" data-src="${n.imageData}" alt="뉴스 ${idx + 1}">
    </div>
    <p class="browse-tip">💡 이 뉴스가 진짜인지 가짜인지 잘 생각해 보세요!</p>
  </div>

  <div class="browse-nav">
    <button class="btn btn-outline btn-lg" data-action="browse-prev"
            ${idx === 0 ? 'disabled' : ''}>◀ 이전</button>
    ${idx < total - 1
      ? `<button class="btn btn-primary btn-lg" data-action="browse-next">다음 ▶</button>`
      : `<button class="btn btn-gold btn-lg" data-action="begin-game">🎮 게임 시작!</button>`}
  </div>
</div>`;
}

// ================================================================
// COMPONENT: STATUS BAR
// ================================================================
function statusBar() {
  return `
<div class="status-bar">
  ${state.players.map((p, i) => `
  <div class="sp" style="--c:${color(i)}">
    <div class="sp-name">${esc(p.name)}</div>
    <div class="sp-bal">${won(p.balance)}</div>
  </div>`).join('')}
</div>`;
}

// ================================================================
// VIEW: AUCTION
// ================================================================
function viewAuction() {
  const { auction, gameIndex, news } = state;
  const n = news[gameIndex];
  const total = news.length;

  // ── Awarded / Passed result screen ──
  if (auction.status === 'awarded' || auction.status === 'passed') {
    const isLast = gameIndex >= total - 1;
    const nextBtn = `<button class="btn btn-primary btn-lg" data-action="auction-next">
                       ${isLast ? '결과 보기 →' : '다음 뉴스 →'}</button>`;
    if (auction.status === 'awarded') {
      const wp = state.players.find(p => p.id === auction.winner);
      const wi = state.players.indexOf(wp);
      return `
<div class="auction">
  ${statusBar()}
  <div class="awarded-screen">
    <div class="aw-badge">🔨</div>
    <div class="aw-name" style="color:${color(wi)}">${esc(wp?.name)}</div>
    <div class="aw-price">${won(auction.price)}</div>
    <img src="${n.imageData}" class="aw-thumb" alt="">
    ${nextBtn}
  </div>
</div>`;
    } else {
      return `
<div class="auction">
  ${statusBar()}
  <div class="awarded-screen">
    <div class="aw-badge" style="opacity:.6">🚫</div>
    <div class="aw-name" style="color:var(--text-dim)">유찰</div>
    <div class="aw-price" style="color:var(--text-dim)">구매자 없음</div>
    <img src="${n.imageData}" class="aw-thumb" style="opacity:.4" alt="">
    ${nextBtn}
  </div>
</div>`;
    }
  }

  // ── Multiple-bidder winner selection ──
  if (auction.status === 'selectWinner') {
    const candidates = state.players.filter(p => auction.activeBidders.includes(p.id));
    return `
<div class="auction">
  ${statusBar()}
  <div class="select-winner-screen">
    <div class="sw-title">🔨 낙찰자를 선택하세요</div>
    <div class="sw-price">${won(auction.price)}</div>
    <div class="sw-candidates">
      ${candidates.map(p => `
      <button class="sw-btn" style="--c:${colorById(p.id)}"
              data-action="award-to" data-id="${p.id}">
        ${esc(p.name)}
        <span>${won(p.balance)}</span>
      </button>`).join('')}
    </div>
    <button class="btn btn-ghost" data-action="cancel-select">← 취소</button>
  </div>
</div>`;
  }

  // ── Main bidding UI ──
  return `
<div class="auction">
  ${statusBar()}
  <div class="auction-body">
    <div class="game-info">
      <span class="news-badge">뉴스 ${gameIndex + 1} / ${total}</span>
      ${n.title ? `<span class="news-label">${esc(n.title)}</span>` : ''}
    </div>

    <div class="auction-layout">
      <!-- 뉴스 이미지 -->
      <div class="au-img-col">
        <img src="${n.imageData}" class="au-img"
             data-action="zoom" data-src="${n.imageData}" alt="뉴스">
      </div>

      <!-- 교사 조작 패널 -->
      <div class="au-ctrl-col">
        <div class="price-box">
          <div class="price-lbl">현재 입찰가</div>
          <div class="price-val">${won(auction.price)}</div>
          <div class="price-start">시작가: ${won(state.auctionStartPrice)}</div>
        </div>

        <div class="teacher-btns">
          <button class="btn btn-raise" data-action="raise-price">
            📈 가격 올리기<br>
            <small>+${won(state.auctionStep)}</small>
          </button>
          <div class="t-row">
            <button class="btn btn-success" data-action="finalize"
                    ${auction.activeBidders.length === 0 ? 'disabled' : ''}>
              🔨 낙찰!
            </button>
            <button class="btn btn-outline" data-action="pass-auction">유찰 (패스)</button>
          </div>
        </div>

        <div class="bidders-section">
          <div class="bidders-title">
            입찰자 선택 <span class="bidders-hint">(교사 조작)</span>
          </div>
          <div class="bidder-grid">
            ${state.players.map((p, i) => {
              const active = auction.activeBidders.includes(p.id);
              const broke  = p.balance < auction.price;
              return `
            <button class="bidder-btn ${active ? 'bidder-active' : ''} ${broke && !active ? 'bidder-broke' : ''}"
                    style="--c:${color(i)}"
                    data-action="toggle-bidder" data-id="${p.id}"
                    ${broke && !active ? 'disabled' : ''}>
              <span class="bd-name">${esc(p.name)}</span>
              <span class="bd-bal">${won(p.balance)}</span>
              ${active ? '<span class="bd-tag">입찰 중</span>' : ''}
            </button>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

// ================================================================
// VIEW: INVESTMENT
// ================================================================
function viewInvestment() {
  const { gameIndex, news, investInputs } = state;
  const n = news[gameIndex];
  const total = news.length;

  const confirmedCount = state.players.filter(p => {
    const inp = investInputs[p.id];
    return inp?.confirmed || p.balance <= 0;
  }).length;
  const allDone = confirmedCount === state.players.length;

  return `
<div class="investment">
  ${statusBar()}
  <div class="inv-info">
    <span class="news-badge">뉴스 ${gameIndex + 1} / ${total}</span>
    ${n.title ? `<span class="news-label">${esc(n.title)}</span>` : ''}
  </div>

  <div class="inv-layout">
    <!-- 뉴스 이미지 -->
    <div class="inv-img-col">
      <img src="${n.imageData}" class="inv-img"
           data-action="zoom" data-src="${n.imageData}" alt="뉴스">
      <div class="inv-tip">💡 이 뉴스가 진짜인지 가짜인지<br>확신하는 만큼 투자하세요!</div>
    </div>

    <!-- 플레이어 투자 패널 -->
    <div class="inv-players">
      ${state.players.map((p, i) => {
        const inp = investInputs[p.id] || {};
        const broke = p.balance <= 0;

        if (inp.confirmed) {
          const sideText = inp.side === 'real' ? '✅ 진짜' : inp.side === 'fake' ? '❌ 가짜' : '패스';
          const amtText  = inp.amount > 0 ? won(Number(inp.amount)) : '-';
          return `
        <div class="inv-row inv-confirmed" style="--c:${color(i)}">
          <div class="inv-row-hdr">
            <span class="inv-pname">${esc(p.name)}</span>
            <span class="inv-pbal">잔액: ${won(p.balance)}</span>
          </div>
          <div class="inv-done">✅ 투자 완료 — ${sideText} &nbsp;/&nbsp; ${amtText}</div>
        </div>`;
        }

        if (broke) {
          return `
        <div class="inv-row inv-confirmed" style="--c:${color(i)}">
          <div class="inv-row-hdr">
            <span class="inv-pname">${esc(p.name)}</span>
            <span class="inv-pbal">잔액: ${won(p.balance)}</span>
          </div>
          <div class="inv-done" style="color:var(--red)">⚠️ 잔액 없음 — 자동 패스</div>
        </div>`;
        }

        return `
        <div class="inv-row" style="--c:${color(i)}">
          <div class="inv-row-hdr">
            <span class="inv-pname">${esc(p.name)}</span>
            <span class="inv-pbal">잔액: ${won(p.balance)}</span>
          </div>
          <div class="inv-controls">
            <div class="side-row">
              <button class="side-btn ${inp.side === 'real' ? 'side-real' : ''}"
                      data-action="set-side" data-id="${p.id}" data-val="real">✅ 진짜</button>
              <button class="side-btn ${inp.side === 'fake' ? 'side-fake' : ''}"
                      data-action="set-side" data-id="${p.id}" data-val="fake">❌ 가짜</button>
            </div>
            <div class="amt-row">
              <input type="number" class="amt-input"
                     placeholder="투자 금액 (0 = 패스)"
                     value="${inp.amount || ''}"
                     min="0" step="50000" max="${p.balance}"
                     data-action="set-amount" data-id="${p.id}">
              <span>원</span>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-primary btn-sm" data-action="confirm-invest" data-id="${p.id}"
                      ${!inp.side ? 'disabled' : ''}>확인</button>
              <button class="btn btn-ghost btn-sm" data-action="pass-invest" data-id="${p.id}">패스</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>

  <div class="inv-footer">
    <button class="btn btn-success btn-lg" data-action="invest-next" ${!allDone ? 'disabled' : ''}>
      ${allDone
        ? (gameIndex >= total - 1 ? '결과 보기 →' : '다음 뉴스 →')
        : `⏳ 투자 대기 중 (${confirmedCount}/${state.players.length})`}
    </button>
  </div>
</div>`;
}

// ================================================================
// VIEW: RESULTS
// ================================================================
function viewResults() {
  const { revealIndex, news, players, initialBalance } = state;

  // ── Reveal individual news results ──
  if (revealIndex < news.length) {
    const n       = news[revealIndex];
    const isReal  = n.answer === 'real';
    const result  = state.roundResults[revealIndex];
    const isLast  = revealIndex >= news.length - 1;

    let rows = '';
    if (state.mode === 'auction') {
      if (result?.purchase) {
        const { playerId, price } = result.purchase;
        const buyer = players.find(p => p.id === playerId);
        const bi    = players.indexOf(buyer);
        const win   = isReal;
        rows = `
        <div class="result-row ${win ? 'r-win' : 'r-lose'}">
          <span style="color:${color(bi)};font-weight:700">${esc(buyer?.name)}</span>
          <span>${won(price)} 구매</span>
          <span>${win ? '✅ 진짜 구매 → +' + won(price) + ' 수익' : '❌ 가짜 구매 → ' + won(price) + ' 손실'}</span>
        </div>`;
      } else {
        rows = `<div class="result-row">🚫 유찰 — 구매자 없음</div>`;
      }
    } else {
      const invs = result?.investments || [];
      rows = invs.length === 0
        ? `<div class="result-row">투자자 없음</div>`
        : invs.map(inv => {
            const p   = players.find(x => x.id === inv.playerId);
            const pi  = players.indexOf(p);
            const win = inv.side === n.answer;
            return `
          <div class="result-row ${win ? 'r-win' : 'r-lose'}">
            <span style="color:${color(pi)};font-weight:700">${esc(p?.name)}</span>
            <span>${inv.side === 'real' ? '진짜' : '가짜'} ${won(inv.amount)} 투자</span>
            <span>${win ? '✅ 적중 → +' + won(inv.amount) + ' 수익' : '❌ 실패 → ' + won(inv.amount) + ' 손실'}</span>
          </div>`;
          }).join('');
    }

    return `
<div class="results">
  <div class="reveal-hdr">
    <h2>🔍 결과 공개</h2>
    <span class="reveal-count">${revealIndex + 1} / ${news.length}</span>
  </div>

  <div class="reveal-card">
    <img src="${n.imageData}" class="reveal-img" alt="">
    <div class="reveal-badge ${isReal ? 'rb-real' : 'rb-fake'}">
      <div class="rb-icon">${isReal ? '✅' : '❌'}</div>
      <div class="rb-text">${isReal ? '진짜 뉴스' : '가짜 뉴스'}</div>
    </div>
  </div>

  <div class="result-rows">${rows}</div>

  <button class="btn btn-primary btn-lg" data-action="reveal-next">
    ${isLast ? '🏆 최종 순위 보기' : '다음 공개 →'}
  </button>
</div>`;
  }

  // ── Final standings ──
  const sorted = [...players]
    .map((p, i) => ({ ...p, origIdx: i }))
    .sort((a, b) => b.balance - a.balance);

  return `
<div class="results">
  <div class="reveal-hdr">
    <h2>🏆 최종 결과</h2>
  </div>

  <div class="standings">
    ${sorted.map((p, rank) => {
      const diff  = p.balance - initialBalance;
      const medal = ['🥇', '🥈', '🥉'][rank] ?? `${rank + 1}위`;
      return `
    <div class="standing-row ${rank === 0 ? 'st-first' : ''}">
      <div class="st-medal">${medal}</div>
      <div class="st-name" style="color:${color(p.origIdx)}">${esc(p.name)}</div>
      <div class="st-bal">${won(p.balance)}</div>
      <div class="st-diff ${diff >= 0 ? 'diff-pos' : 'diff-neg'}">
        ${diff >= 0 ? '+' : ''}${won(diff)}
      </div>
    </div>`;
    }).join('')}
  </div>

  <div class="final-btns">
    <button class="btn btn-outline btn-lg" data-action="go-home">🏠 홈으로</button>
    <button class="btn btn-primary btn-lg" data-action="play-again">🔄 다시 하기</button>
  </div>
</div>`;
}

// ================================================================
// GAME LOGIC
// ================================================================
function initAuctionRound() {
  state.auction = {
    price: state.auctionStartPrice,
    activeBidders: [],
    status: 'bidding',
    winner: null,
  };
}

function initInvestRound() {
  state.investInputs = {};
  state.players.forEach(p => {
    state.investInputs[p.id] = {
      side: null,
      amount: '',
      confirmed: p.balance <= 0,   // auto-pass if broke
    };
  });
}

function awardTo(playerId) {
  const price  = state.auction.price;
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.balance < price) return;

  player.balance -= price;
  player.history.push({
    type: 'purchase',
    newsId: state.news[state.gameIndex].id,
    newsTitle: state.news[state.gameIndex].title || `뉴스 #${state.gameIndex + 1}`,
    price,
  });
  state.roundResults[state.gameIndex] = { purchase: { playerId, price } };
  state.auction.status = 'awarded';
  state.auction.winner = playerId;
}

function applyAllResults() {
  if (state.resultsApplied) return;
  state.resultsApplied = true;

  state.roundResults.forEach((result, idx) => {
    const n = state.news[idx];
    if (!n) return;

    if (state.mode === 'auction') {
      if (!result?.purchase) return;
      const { playerId, price } = result.purchase;
      const p = state.players.find(x => x.id === playerId);
      if (p && n.answer === 'real') p.balance += price * 2;  // 2× return

    } else {
      (result?.investments || []).forEach(inv => {
        const p = state.players.find(x => x.id === inv.playerId);
        if (p && inv.side === n.answer) p.balance += inv.amount * 2;  // 2× return
      });
    }
  });
}

// ================================================================
// EVENT HANDLERS
// ================================================================
function handleClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;

  const action = el.dataset.action;
  const id     = el.dataset.id ? Number(el.dataset.id) : null;

  switch (action) {

    // ── Navigation ──────────────────────────────────────
    case 'go-home':
      state.phase = 'home';
      break;
    case 'go-admin':
      state.phase = 'admin';
      break;
    case 'go-browse':
      if (!state.news.length || !state.mode) break;
      state.browseIndex = 0;
      state.phase = 'browse';
      break;

    // ── Home ────────────────────────────────────────────
    case 'select-mode':
      state.mode     = el.dataset.mode;
      state.adminTab = 'news';
      state.phase    = 'admin';
      break;

    // ── Admin ────────────────────────────────────────────
    case 'tab':
      state.adminTab = el.dataset.tab;
      break;
    case 'add-player':
      if (state.players.length < 8) {
        const newId = Date.now();
        const n     = state.players.length + 1;
        state.players.push({ id: newId, name: `모둠 ${n}`, balance: state.initialBalance, history: [] });
      }
      break;
    case 'remove-player':
      if (state.players.length > 1)
        state.players = state.players.filter(p => p.id !== id);
      break;
    case 'reset-balances':
      state.players.forEach(p => { p.balance = state.initialBalance; });
      break;
    case 'set-answer': {
      const ni = state.news.find(n => n.id === id);
      if (ni) ni.answer = el.dataset.val;
      break;
    }
    case 'del-news':
      state.news = state.news.filter(n => n.id !== id);
      break;
    case 'start-browse': {
      const allAnswered = state.news.every(n => n.answer);
      if (!allAnswered) { alert('모든 뉴스의 진위를 설정해 주세요.'); return; }
      state.players.forEach(p => { p.balance = state.initialBalance; p.history = []; });
      state.roundResults   = [];
      state.resultsApplied = false;
      state.gameIndex      = 0;
      state.browseIndex    = 0;
      state.revealIndex    = 0;
      state.phase = 'browse';
      break;
    }
    case 'reset-game':
      if (!confirm('게임 결과를 초기화하시겠습니까?')) return;
      state.players.forEach(p => { p.balance = state.initialBalance; p.history = []; });
      state.roundResults   = [];
      state.resultsApplied = false;
      state.gameIndex      = 0;
      state.phase = 'admin';
      break;
    case 'reset-all':
      if (!confirm('모든 데이터를 초기화하시겠습니까?\n(뉴스 카드도 삭제됩니다)')) return;
      state = freshState();
      break;

    // ── Browse ───────────────────────────────────────────
    case 'browse-prev':
      if (state.browseIndex > 0) state.browseIndex--;
      break;
    case 'browse-next':
      if (state.browseIndex < state.news.length - 1) state.browseIndex++;
      break;
    case 'begin-game':
      state.phase     = 'game';
      state.gameIndex = 0;
      if (state.mode === 'auction') initAuctionRound();
      else                          initInvestRound();
      break;

    // ── Auction ──────────────────────────────────────────
    case 'raise-price':
      state.auction.price += state.auctionStep;
      state.auction.activeBidders = [];   // reset on every raise
      break;
    case 'toggle-bidder': {
      const list = state.auction.activeBidders;
      const idx2 = list.indexOf(id);
      if (idx2 >= 0) list.splice(idx2, 1);
      else list.push(id);
      break;
    }
    case 'finalize': {
      const { activeBidders } = state.auction;
      if (!activeBidders.length) break;
      if (activeBidders.length === 1) {
        awardTo(activeBidders[0]);
      } else {
        state.auction.status = 'selectWinner';
      }
      break;
    }
    case 'award-to':
      awardTo(id);
      break;
    case 'cancel-select':
      state.auction.status = 'bidding';
      break;
    case 'pass-auction':
      state.roundResults[state.gameIndex] = { purchase: null };
      state.auction.status = 'passed';
      break;
    case 'auction-next':
      if (state.gameIndex >= state.news.length - 1) {
        applyAllResults();
        state.phase       = 'results';
        state.revealIndex = 0;
      } else {
        state.gameIndex++;
        initAuctionRound();
      }
      break;

    // ── Investment ───────────────────────────────────────
    case 'set-side':
      if (!state.investInputs[id]) state.investInputs[id] = {};
      state.investInputs[id].side = el.dataset.val;
      break;
    case 'confirm-invest': {
      const inp    = state.investInputs[id] || {};
      const amount = Number(inp.amount);
      const pp     = state.players.find(p => p.id === id);
      if (!inp.side)              { alert('진짜 또는 가짜를 선택하세요.'); return; }
      if (amount < 0)             { alert('금액은 0 이상이어야 합니다.'); return; }
      if (amount > pp.balance)    { alert(`잔액(${won(pp.balance)})을 초과했습니다.`); return; }
      if (amount > 0) {
        pp.balance -= amount;
        pp.history.push({
          type: 'invest',
          newsId: state.news[state.gameIndex].id,
          side: inp.side,
          amount,
        });
      }
      inp.amount    = amount;
      inp.confirmed = true;
      break;
    }
    case 'pass-invest': {
      if (!state.investInputs[id]) state.investInputs[id] = {};
      Object.assign(state.investInputs[id], { side: 'pass', amount: 0, confirmed: true });
      break;
    }
    case 'invest-next': {
      // Record this round's investments
      const invs = state.players
        .filter(p => {
          const inp = state.investInputs[p.id];
          return inp?.confirmed && inp.side !== 'pass' && Number(inp.amount) > 0;
        })
        .map(p => {
          const inp = state.investInputs[p.id];
          return { playerId: p.id, side: inp.side, amount: Number(inp.amount) };
        });
      state.roundResults[state.gameIndex] = { investments: invs };

      if (state.gameIndex >= state.news.length - 1) {
        applyAllResults();
        state.phase       = 'results';
        state.revealIndex = 0;
      } else {
        state.gameIndex++;
        initInvestRound();
      }
      break;
    }

    // ── Results ──────────────────────────────────────────
    case 'reveal-next':
      state.revealIndex++;
      break;
    case 'go-home':
      state.phase = 'home';
      break;
    case 'play-again':
      state.players.forEach(p => { p.balance = state.initialBalance; p.history = []; });
      state.roundResults   = [];
      state.resultsApplied = false;
      state.gameIndex      = 0;
      state.browseIndex    = 0;
      state.revealIndex    = 0;
      state.phase = 'browse';
      break;

    // ── Image zoom ───────────────────────────────────────
    case 'zoom':
      showZoom(el.dataset.src || el.src);
      return;   // no re-render needed

    default:
      return;
  }

  render();
}

function handleInput(e) {
  const el     = e.target;
  const action = el.dataset.action;
  const id     = el.dataset.id ? Number(el.dataset.id) : null;

  switch (action) {
    case 'edit-name': {
      const p = state.players.find(x => x.id === id);
      if (p) p.name = el.value;
      break;
    }
    case 'edit-title': {
      const n = state.news.find(x => x.id === id);
      if (n) n.title = el.value;
      break;
    }
    case 'set-init-balance':
      state.initialBalance = Math.max(10000, Number(el.value) || DEF_BALANCE);
      break;
    case 'set-auction-start':
      state.auctionStartPrice = Math.max(0, Number(el.value) || 0);
      break;
    case 'set-auction-step':
      state.auctionStep = Math.max(1000, Number(el.value) || DEF_STEP);
      break;
    case 'set-amount':
      if (!state.investInputs[id]) state.investInputs[id] = {};
      state.investInputs[id].amount = el.value;
      break;
  }
  save();   // persist without re-render (avoids focus loss)
}

async function handleChange(e) {
  try {
    const el = e.target;
    if (el.dataset.action === 'upload-news' && el.files?.length) {
      await uploadNews(el.files);
    }
  } catch (err) {
    console.error('Upload error:', err);
    alert('이미지 업로드 중 오류가 발생했습니다.');
  }
}

// ================================================================
// IMAGE UPLOAD
// ================================================================
async function uploadNews(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const imageData = await fileToB64(file);
    state.news.push({ id: Date.now() + Math.random(), title: '', imageData, answer: null });
  }
  render();
}

function fileToB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ================================================================
// ZOOM MODAL
// ================================================================
function showZoom(src) {
  document.getElementById('zoom-modal')?.remove();

  const modal = document.createElement('div');
  modal.id        = 'zoom-modal';
  modal.className = 'zoom-modal';
  modal.innerHTML = `
    <img src="${src}" class="zoom-img" alt="">
    <button class="zoom-close" title="닫기">✕</button>`;
  document.body.appendChild(modal);

  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.classList.contains('zoom-close')) {
      modal.remove();
    }
  });
}

// ================================================================
// INIT
// ================================================================
function init() {
  const app = document.getElementById('app');
  app.addEventListener('click',  handleClick);
  app.addEventListener('input',  handleInput);
  app.addEventListener('change', handleChange);
  render();
}

document.addEventListener('DOMContentLoaded', init);
