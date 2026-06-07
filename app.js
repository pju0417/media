'use strict';

// ================================================================
// CONSTANTS
// ================================================================
const COLORS = [
  '#e94560', '#4dabf7', '#51cf66', '#ff922b',
  '#cc5de8', '#20c997', '#ffd43b', '#ff6b9d'
];

const DEF_BALANCE      = 1_000_000;
const DEF_START        =   100_000;
const DEF_STEP         =    50_000;
const DEF_CORRECT_BONUS =  150_000;  // 정답 1개당 추가 보너스 기본값

// ================================================================
// STATE
// ================================================================
function freshState() {
  return {
    phase: 'home',
    mode: null,
    adminTab: 'players',
    players: Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      name: `모둠 ${i + 1}`,
      balance: DEF_BALANCE,
      history: [],
    })),
    news: [],                // [{ id, title, imageData, answer }]
    bundles: [],             // [{ id, name, newsIds:[] }]
    activeBundleId: null,
    expandedBundleId: null,
    initialBalance: DEF_BALANCE,
    auctionStartPrice: DEF_START,
    auctionStep: DEF_STEP,
    correctBonus: DEF_CORRECT_BONUS,  // 정답 1개당 추가 보너스
    playerBonuses: {},       // { playerId: { cnt, bonus } } — 결과 계산 후 저장
    browseIndex: 0,
    gameIndex: 0,
    auction: {
      price: DEF_START,
      activeBidders: [],
      status: 'bidding',
      winner: null,
    },
    investInputs: {},
    roundResults: [],
    gameOrder: [],          // 셔플된 뉴스 ID 순서 (게임 내내 유지)
    revealIndex: 0,
    revealAnswerShown: false, // 정답 확인 클릭 전/후
    playerRevealIndex: -1,  // -1=뉴스공개중, 0~=플레이어별 결과, players.length=최종
    resultsApplied: false,
  };
}

let state;
(function initState() {
  try {
    const raw = localStorage.getItem('fnd_v1');
    if (!raw) { state = freshState(); }
    else {
      state = JSON.parse(raw);
      if (!state.roundResults)           state.roundResults = [];
      if (!state.investInputs)           state.investInputs = {};
      if (!state.auction)                state.auction = { price: DEF_START, activeBidders: [], status: 'bidding', winner: null };
      if (state.revealIndex == null)     state.revealIndex = 0;
      if (state.resultsApplied == null)  state.resultsApplied = false;
      if (!state.bundles)                state.bundles = [];
      if (state.activeBundleId == null)  state.activeBundleId = null;
      if (state.expandedBundleId == null) state.expandedBundleId = null;
      if (state.correctBonus == null)    state.correctBonus = DEF_CORRECT_BONUS;
      if (!state.playerBonuses)          state.playerBonuses = {};
      if (!state.news)                   state.news = [];
      state.news.forEach(n => { delete n.weight; });
      if (!state.gameOrder)              state.gameOrder = [];
      if (state.revealAnswerShown == null) state.revealAnswerShown = false;
      if (state.playerRevealIndex == null) state.playerRevealIndex = -1;
      if (!state.players?.length) state = freshState();
    }
  } catch {
    state = freshState();
  }

  // ── 새로고침·재방문 시 항상 홈 화면에서 시작 ─────────────
  state.phase = 'home';
  state.players.forEach(p => { p.balance = state.initialBalance; p.history = []; });
  state.roundResults = []; state.resultsApplied = false; state.playerBonuses = {};
  state.gameOrder = []; state.revealIndex = 0;
  state.revealAnswerShown = false; state.playerRevealIndex = -1;
  state.gameIndex = 0; state.browseIndex = 0;
  state.auction = { price: state.auctionStartPrice, activeBidders: [], status: 'bidding', winner: null };

  // ── 기본 내장 뉴스 팩 주입 ──────────────────────────────
  // default-news.js 가 window.FND_BUILTIN 을 정의한 경우에만 실행
  if (window.FND_BUILTIN) {
    const builtin = window.FND_BUILTIN;

    // 1) 뉴스 목록에 내장 뉴스 추가 / imageData 복원
    //    (localStorage 절약을 위해 imageData는 저장하지 않고 매번 JS에서 주입)
    builtin.news.forEach(bn => {
      const existing = state.news.find(n => n.id === bn.id);
      if (existing) {
        existing.imageData = bn.imageData;   // 매번 JS에서 이미지 복원
        existing.builtin   = true;
      } else {
        // 목록 맨 앞에 삽입
        state.news.unshift({ id: bn.id, title: bn.title, imageData: bn.imageData, answer: bn.answer, builtin: true });
      }
    });

    // 2) 기본 꾸러미가 없으면 추가
    if (!state.bundles.find(b => b.id === builtin.bundle.id)) {
      state.bundles.unshift({ ...builtin.bundle });
    }
  }
})();

function save() {
  try {
    // phase·게임 진행 상태는 저장하지 않음 → 새로고침 시 항상 홈+초기화 상태로 시작
    const toSave = {
      ...state,
      phase: 'home',
      gameIndex: 0, browseIndex: 0,
      roundResults: [], resultsApplied: false, playerBonuses: {},
      revealIndex: 0,
      revealAnswerShown: false, playerRevealIndex: -1,
      auction: { price: state.auctionStartPrice, activeBidders: [], status: 'bidding', winner: null },
      investInputs: {},
      players: state.players.map(p => ({
        ...p, balance: state.initialBalance, history: []
      })),
      // 내장 뉴스 imageData는 저장하지 않음 (용량 절약)
      news: state.news.map(n =>
        n.builtin ? { id: n.id, title: n.title, answer: n.answer, builtin: true } : n
      ),
    };
    localStorage.setItem('fnd_v1', JSON.stringify(toSave));
  } catch (e) {
    console.warn('localStorage 저장 실패:', e);
  }
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

// 셔플 순서는 state.gameOrder에 저장 (save/load와 함께 유지됨)
function getActiveNews() {
  if (state.gameOrder && state.gameOrder.length > 0) {
    return state.gameOrder.map(id => state.news.find(n => n.id === id)).filter(Boolean);
  }
  if (state.activeBundleId) {
    const bundle = state.bundles.find(b => b.id === state.activeBundleId);
    if (bundle) return bundle.newsIds.map(id => state.news.find(n => n.id === id)).filter(Boolean);
  }
  return state.news.slice();
}

// 뉴스를 섞어 state.gameOrder에 저장
function buildGameNews() {
  let ids;
  if (state.activeBundleId) {
    const bundle = state.bundles.find(b => b.id === state.activeBundleId);
    ids = bundle
      ? bundle.newsIds.filter(id => state.news.some(n => n.id === id))
      : state.news.map(n => n.id);
  } else {
    ids = state.news.map(n => n.id);
  }
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  state.gameOrder = a;   // state에 직접 저장 → render/save에 무관하게 유지
}

function clearGameNews() {
  state.gameOrder = [];
}

function checkStartable() {
  const activeNews = getActiveNews();
  if (!state.mode)             return { ok: false, reason: '홈에서 게임 모드를 선택하세요' };
  if (activeNews.length < 2)  return { ok: false, reason: '뉴스가 2개 이상 필요합니다' };
  if (activeNews.some(n => !n.answer))
    return { ok: false, reason: '⚠️ 진위 미설정 뉴스가 있습니다' };
  return { ok: true };
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
  const { ok } = checkStartable();
  const activeBundle = state.bundles.find(b => b.id === state.activeBundleId);

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
        <li>진짜 많이 맞출수록 추가 보너스!</li>
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
        <li>진짜 많이 맞출수록 추가 보너스!</li>
      </ul>
    </button>
  </div>

  ${activeBundle ? `
  <div class="active-bundle-display">
    <span class="abd-label">📦 선택된 꾸러미</span>
    <span class="abd-name">${esc(activeBundle.name)}</span>
    <span class="abd-count">${activeBundle.newsIds.length}개</span>
  </div>` : ''}

  ${state.correctBonus > 0 ? `
  <div class="bonus-rule-display">
    🎯 정답 1개당 <strong>${won(state.correctBonus)}</strong> 추가 보너스
  </div>` : ''}

  <div class="home-btns">
    <button class="btn btn-outline" data-action="go-admin">⚙️ 관리자 패널</button>
    ${ok ? `<button class="btn btn-gold btn-lg" data-action="go-browse">▶ 게임 시작</button>` : ''}
  </div>
</div>`;
}

// ================================================================
// VIEW: ADMIN
// ================================================================
function viewAdmin() {
  const tab = state.adminTab || 'players';
  const { ok, reason } = checkStartable();
  const activeBundle = state.bundles.find(b => b.id === state.activeBundleId);

  return `
<div class="admin">
  <div class="admin-header">
    <button class="btn btn-ghost" data-action="go-home">← 홈</button>
    <h2>⚙️ 관리자 패널</h2>
    <span class="mode-badge">
      ${state.mode === 'auction' ? '🏛️ 경매' : state.mode === 'investment' ? '📈 투자' : '모드 미선택'}
    </span>
  </div>

  <div class="tabs">
    <button class="tab ${tab === 'players'  ? 'active' : ''}" data-action="tab" data-tab="players">👥 플레이어</button>
    <button class="tab ${tab === 'news'     ? 'active' : ''}" data-action="tab" data-tab="news">📰 뉴스 카드</button>
    <button class="tab ${tab === 'bundles'  ? 'active' : ''}" data-action="tab" data-tab="bundles">
      📦 꾸러미${activeBundle ? ' ✅' : ''}
    </button>
    <button class="tab ${tab === 'settings' ? 'active' : ''}" data-action="tab" data-tab="settings">⚙️ 설정</button>
  </div>

  <div class="tab-content">
    ${tab === 'players'  ? tabPlayers()  : ''}
    ${tab === 'news'     ? tabNews()     : ''}
    ${tab === 'bundles'  ? tabBundles()  : ''}
    ${tab === 'settings' ? tabSettings() : ''}
  </div>

  <div class="admin-footer">
    ${ok
      ? `<button class="btn btn-success btn-lg" data-action="start-browse">
           🎮 게임 시작
           ${activeBundle
             ? `— ${esc(activeBundle.name)} (${getActiveNews().length}개)`
             : `— 전체 뉴스 (${state.news.length}개)`}
         </button>`
      : `<p class="hint-footer">${reason}</p>`}
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

function tabBundles() {
  const hasNews = state.news.length > 0;
  return `
<div class="admin-sec">
  <div class="sec-hdr">
    <h3>뉴스 꾸러미 (${state.bundles.length}개)</h3>
    <button class="btn btn-sm btn-primary" data-action="add-bundle"
            ${!hasNews ? 'disabled' : ''}>+ 새 꾸러미</button>
  </div>

  ${!hasNews
    ? `<p class="empty-msg">뉴스 카드를 먼저 등록하면 꾸러미를 만들 수 있습니다.</p>`
    : state.bundles.length === 0
      ? `<p class="empty-msg">꾸러미가 없습니다.<br>꾸러미 없이 게임하면 <strong>전체 뉴스(${state.news.length}개)</strong>가 사용됩니다.</p>`
      : ''}

  <div class="bundle-list">
    ${state.bundles.map(b => {
      const isActive   = state.activeBundleId === b.id;
      const isExpanded = state.expandedBundleId === b.id;
      const bundleNews = b.newsIds.map(nid => state.news.find(n => n.id === nid)).filter(Boolean);
      const canSelect  = bundleNews.length >= 2 && bundleNews.every(n => n.answer);

      return `
      <div class="bundle-card ${isActive ? 'bundle-active' : ''}">
        <div class="bundle-hdr">
          <div class="bundle-hdr-left">
            ${isActive ? '<span class="bundle-playing">🎮 게임 중</span>' : ''}
            <input class="bundle-name-input" type="text" value="${esc(b.name)}"
                   data-action="edit-bundle-name" data-id="${b.id}">
          </div>
          <div class="bundle-hdr-right">
            <span class="bundle-count">${bundleNews.length}개</span>
            ${!isActive
              ? `<button class="btn btn-sm ${canSelect ? 'btn-success' : 'btn-outline'}"
                         data-action="select-bundle" data-id="${b.id}"
                         ${!canSelect ? 'disabled' : ''}>선택</button>`
              : `<button class="btn btn-sm btn-outline" data-action="deselect-bundle">해제</button>`}
            <button class="btn btn-sm btn-ghost" data-action="expand-bundle" data-id="${b.id}">
              ${isExpanded ? '▲ 접기' : '▼ 편집'}
            </button>
            <button class="btn btn-sm btn-danger" data-action="del-bundle" data-id="${b.id}">✕</button>
          </div>
        </div>

        ${isExpanded ? `
        <div class="bundle-body">
          <div class="bundle-hint">클릭하여 뉴스를 추가/제거하세요</div>
          <div class="bundle-news-grid">
            ${state.news.map((n, ni) => {
              const included = b.newsIds.includes(n.id);
              return `
            <button class="bng-item ${included ? 'bng-included' : ''}"
                    data-action="toggle-bundle-news" data-id="${n.id}" data-bid="${b.id}">
              <img src="${n.imageData}" alt="">
              <div class="bng-overlay">
                ${included ? '<span class="bng-check">✅</span>' : '<span class="bng-plus">+</span>'}
              </div>
              <div class="bng-info">
                <span class="bng-num">#${ni + 1}</span>
                ${n.answer === 'real' ? '<span class="bng-tag bng-real">진짜</span>'
                  : n.answer === 'fake' ? '<span class="bng-tag bng-fake">가짜</span>'
                  : '<span class="bng-tag bng-none">미설정</span>'}
              </div>
            </button>`;
            }).join('')}
          </div>
          ${bundleNews.length > 0 ? `
          <div class="bundle-summary">
            <span>진짜: ${bundleNews.filter(n => n.answer === 'real').length}개</span>
            <span>가짜: ${bundleNews.filter(n => n.answer === 'fake').length}개</span>
            <span>미설정: ${bundleNews.filter(n => !n.answer).length}개</span>
          </div>` : ''}
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>
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

  <hr style="border-color:var(--border);margin:24px 0">
  <h3 style="margin-bottom:8px">🎯 정답 보너스 설정</h3>
  <p style="font-size:13px;color:var(--text-dim);margin-bottom:16px;line-height:1.7">
    진짜 뉴스를 정확히 구매하거나 투자할 때마다 추가 보너스를 지급합니다.<br>
    <strong style="color:var(--gold)">예시:</strong>
    정답 2개 × ${won(state.correctBonus)} = ${won(state.correctBonus * 2)} 보너스
  </p>

  <div class="setting-item">
    <label>정답 1개당 보너스</label>
    <div class="setting-row">
      <input type="number" class="num-input" value="${state.correctBonus}"
             step="50000" min="0" data-action="set-correct-bonus">
      <span>원</span>
      <span style="font-size:12px;color:var(--text-faint)">(0원 = 보너스 없음)</span>
    </div>
  </div>

  <div class="bonus-preview-box">
    <div class="bpb-title">정답 개수별 보너스 미리보기</div>
    <div class="bpb-rows">
      ${[1,2,3,4,5].map(cnt => `
      <div class="bpb-row">
        <span class="bpb-cnt">정답 ${cnt}개</span>
        <span class="bpb-arr">→</span>
        <span class="bpb-val">+${won(cnt * state.correctBonus)}</span>
      </div>`).join('')}
    </div>
  </div>

  <div class="danger-zone" style="margin-top:32px">
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
  const activeNews = getActiveNews();
  const n     = activeNews[state.browseIndex];
  const total = activeNews.length;
  const idx   = state.browseIndex;
  const activeBundle = state.bundles.find(b => b.id === state.activeBundleId);

  return `
<div class="browse">
  <div class="browse-hdr">
    <div style="display:flex;gap:6px">
      <button class="btn btn-ghost" data-action="go-home">🏠 홈</button>
      <button class="btn btn-ghost" data-action="go-admin">← 관리자</button>
    </div>
    <div class="browse-counter">
      <span class="bc-text">${idx + 1} / ${total}</span>
      ${activeBundle ? `<div style="font-size:11px;color:var(--gold-dim);margin-top:2px">📦 ${esc(activeBundle.name)}</div>` : ''}
      <div class="bc-dots">
        ${activeNews.map((_, i) =>
          `<span class="dot ${i < idx ? 'seen' : i === idx ? 'cur' : ''}"></span>`
        ).join('')}
      </div>
    </div>
    <div style="width:80px"></div>
  </div>

  <div class="browse-landscape">
    <!-- 좌: 뉴스 이미지 -->
    <div class="browse-img-col">
      <img src="${n.imageData}" class="browse-img-land"
           data-action="zoom" data-src="${n.imageData}" alt="뉴스 ${idx + 1}">
    </div>
    <!-- 우: 정보 + 탐색 -->
    <div class="browse-info-col">
      <div class="browse-tag">📰 뉴스 #${idx + 1}</div>
      ${n.title ? `<h2 class="browse-title">${esc(n.title)}</h2>` : ''}
      <div class="bc-dots bc-dots-side">
        ${activeNews.map((_, i) =>
          `<span class="dot ${i < idx ? 'seen' : i === idx ? 'cur' : ''}"></span>`
        ).join('')}
      </div>
      <p class="browse-tip">💡 이 뉴스가 진짜인지 가짜인지<br>잘 생각해 보세요!</p>
      <div class="browse-nav-side">
        <button class="btn btn-outline btn-lg" data-action="browse-prev"
                ${idx === 0 ? 'disabled' : ''}>◀ 이전</button>
        ${idx < total - 1
          ? `<button class="btn btn-primary btn-lg" data-action="browse-next">다음 ▶</button>`
          : `<button class="btn btn-gold btn-lg" data-action="begin-game">🎮 게임 시작!</button>`}
      </div>
    </div>
  </div>
</div>`;
}

// ================================================================
// COMPONENT: STATUS BAR
// ================================================================
function statusBar() {
  return `
<div class="status-bar">
  <button class="sp-home-btn" data-action="go-home" title="홈으로">🏠</button>
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
  const { auction, gameIndex } = state;
  const activeNews = getActiveNews();
  const n     = activeNews[gameIndex];
  const total = activeNews.length;

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

  return `
<div class="auction">
  ${statusBar()}
  <div class="auction-body">
    <div class="game-info">
      <span class="news-badge">뉴스 ${gameIndex + 1} / ${total}</span>
      ${n.title ? `<span class="news-label">${esc(n.title)}</span>` : ''}
    </div>
    <div class="auction-layout">
      <div class="au-img-col">
        <img src="${n.imageData}" class="au-img"
             data-action="zoom" data-src="${n.imageData}" alt="뉴스">
      </div>
      <div class="au-ctrl-col">
        <div class="price-box">
          <div class="price-lbl">현재 입찰가</div>
          <div class="price-val">${won(auction.price)}</div>
          <div class="price-start">시작가: ${won(state.auctionStartPrice)}</div>
        </div>
        <div class="teacher-btns">
          <button class="btn btn-raise" data-action="raise-price">
            📈 가격 올리기<br><small>+${won(state.auctionStep)}</small>
          </button>
          <div class="t-row">
            <button class="btn btn-success" data-action="finalize"
                    ${auction.activeBidders.length === 0 ? 'disabled' : ''}>🔨 낙찰!</button>
            <button class="btn btn-outline" data-action="pass-auction">유찰 (패스)</button>
          </div>
        </div>
        <div class="bidders-section">
          <div class="bidders-title">입찰자 선택 <span class="bidders-hint">(교사 조작)</span></div>
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
  const { gameIndex, investInputs } = state;
  const activeNews = getActiveNews();
  const n     = activeNews[gameIndex];
  const total = activeNews.length;

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
    <div class="inv-img-col">
      <img src="${n.imageData}" class="inv-img"
           data-action="zoom" data-src="${n.imageData}" alt="뉴스">
      <div class="inv-tip">
        💡 이 뉴스가 진짜인지 가짜인지<br>확신하는 만큼 투자하세요!
      </div>
    </div>
    <div class="inv-players">
      ${state.players.map((p, i) => {
        const inp   = investInputs[p.id] || {};
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
// VIEW: RESULTS  (3단계: 뉴스공개 → 플레이어별 결과 → 최종)
// ================================================================
function viewResults() {
  const { revealIndex, revealAnswerShown, playerRevealIndex, players } = state;
  const activeNews = getActiveNews();

  // ── 1단계: 뉴스별 정답 공개 ──
  if (playerRevealIndex < 0) {
    const n      = activeNews[revealIndex];
    const isReal = n.answer === 'real';
    const result = state.roundResults[revealIndex];

    // 정답 확인 버튼 누르기 전: 이미지만 보여줌
    if (!revealAnswerShown) {
      return `
<div class="results">
  <div class="reveal-hdr">
    <button class="btn btn-ghost btn-sm" data-action="go-home">🏠 홈</button>
    <h2>🔍 결과 공개</h2>
    <span class="reveal-count">${revealIndex + 1} / ${activeNews.length}</span>
  </div>
  <div class="reveal-landscape">
    <div class="reveal-img-col">
      <div class="reveal-card reveal-card-wait">
        <img src="${n.imageData}" class="reveal-img" alt="">
        <div class="reveal-wait-overlay">
          <div class="rwait-text">진짜일까요?<br>가짜일까요?</div>
        </div>
      </div>
    </div>
    <div class="reveal-side-col">
      ${n.title ? `<div class="reveal-news-title">${esc(n.title)}</div>` : '<div></div>'}
      <div class="reveal-wait-hint">모든 플레이어가 판단을 마쳤으면<br>정답을 확인하세요</div>
      <button class="btn btn-gold btn-lg reveal-check-btn" data-action="show-answer">
        🔍 정답 확인
      </button>
    </div>
  </div>
</div>`;
    }

    // 정답 공개 후: 정답 + 라운드 결과 표시
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
          <span>${win ? `✅ 진짜! × 2 → +${won(price)} 수익` : `❌ 가짜 → ${won(price)} 손실`}</span>
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
            <span>${inv.side === 'real' ? '진짜' : '가짜'} ${won(inv.amount)}</span>
            <span>${win ? `✅ 적중! × 2 → +${won(inv.amount)} 수익` : `❌ 실패 → ${won(inv.amount)} 손실`}</span>
          </div>`;
          }).join('');
    }

    const isLast = revealIndex >= activeNews.length - 1;
    return `
<div class="results">
  <div class="reveal-hdr">
    <button class="btn btn-ghost btn-sm" data-action="go-home">🏠 홈</button>
    <h2>🔍 결과 공개</h2>
    <span class="reveal-count">${revealIndex + 1} / ${activeNews.length}</span>
  </div>
  <div class="reveal-landscape">
    <div class="reveal-img-col">
      <div class="reveal-card">
        <img src="${n.imageData}" class="reveal-img" alt="">
        <div class="reveal-badge ${isReal ? 'rb-real' : 'rb-fake'}">
          <div class="rb-icon">${isReal ? '✅' : '❌'}</div>
          <div class="rb-text">${isReal ? '진짜 뉴스' : '가짜 뉴스'}</div>
        </div>
      </div>
    </div>
    <div class="reveal-side-col">
      ${n.title ? `<div class="reveal-news-title">${esc(n.title)}</div>` : ''}
      <div class="result-rows">${rows}</div>
      <button class="btn btn-primary btn-lg" data-action="reveal-next">
        ${isLast ? '📊 플레이어별 결과 보기 →' : '다음 뉴스 →'}
      </button>
    </div>
  </div>
</div>`;
  }

  // ── 2단계: 플레이어별 상세 결과 ──
  if (playerRevealIndex < players.length) {
    return viewPlayerResult(playerRevealIndex);
  }

  // ── 3단계: 최종 순위 ──
  return viewFinalSummary();
}

// 플레이어 한 명의 상세 결과
function viewPlayerResult(pidx) {
  const player    = state.players[pidx];
  const activeNews = getActiveNews();
  const pb        = state.playerBonuses[player.id] || { cnt: 0, bonus: 0 };
  const initial   = state.initialBalance;
  const diff      = player.balance - initial;
  const pi        = pidx;
  const isLast    = pidx >= state.players.length - 1;

  // 뉴스별 행동 정리
  const breakdown = activeNews.map((n, idx) => {
    const result = state.roundResults[idx];
    if (state.mode === 'auction') {
      if (result?.purchase?.playerId === player.id) {
        const win = n.answer === 'real';
        return { n, idx, label: `${won(result.purchase.price)} 구매`, win, participated: true };
      }
    } else {
      const inv = result?.investments?.find(i => i.playerId === player.id);
      if (inv && Number(inv.amount) > 0) {
        const win = inv.side === n.answer;
        return { n, idx, label: `${inv.side === 'real' ? '진짜' : '가짜'} ${won(inv.amount)} 투자`, win, participated: true };
      }
    }
    return { n, idx, label: '패스', win: null, participated: false };
  });

  const correctCnt = breakdown.filter(b => b.win === true).length;
  const wrongCnt   = breakdown.filter(b => b.win === false).length;

  return `
<div class="results">
  <div class="pr-screen">
    <div class="pr-top-nav"><button class="btn btn-ghost btn-sm" data-action="go-home">🏠 홈</button></div>
    <div class="pr-player-badge" style="--c:${color(pi)}">
      <span class="pr-num">${pidx + 1} / ${state.players.length}</span>
      <span class="pr-name">${esc(player.name)}</span>
    </div>

    <div class="pr-breakdown">
      ${breakdown.map(b => `
      <div class="pr-row ${b.win === true ? 'pr-win' : b.win === false ? 'pr-lose' : 'pr-pass'}">
        <div class="pr-row-left">
          <span class="pr-news-num">#${b.idx + 1}</span>
          <span class="pr-news-title">${esc(b.n.title || `뉴스 ${b.idx + 1}`)}</span>
        </div>
        <div class="pr-row-right">
          <span class="pr-action">${b.label}</span>
          <span class="pr-result-icon">
            ${b.win === true ? '✅' : b.win === false ? '❌' : '—'}
          </span>
        </div>
      </div>`).join('')}
    </div>

    <div class="pr-summary">
      <div class="pr-sum-row">
        <span class="pr-sum-label">✅ 정답</span>
        <span class="pr-sum-val pr-correct">${correctCnt}개</span>
        <span class="pr-sum-label">❌ 오답</span>
        <span class="pr-sum-val pr-wrong">${wrongCnt}개</span>
      </div>
      ${pb.bonus > 0 ? `
      <div class="pr-bonus-row">
        🎯 정답 보너스 ${pb.cnt}개 × ${won(state.correctBonus)} =
        <strong>+${won(pb.bonus)}</strong>
      </div>` : ''}
      <div class="pr-balance-row">
        <span>최종 잔액</span>
        <span class="pr-balance">${won(player.balance)}</span>
        <span class="pr-diff ${diff >= 0 ? 'diff-pos' : 'diff-neg'}">
          (${diff >= 0 ? '+' : ''}${won(diff)})
        </span>
      </div>
    </div>

    <button class="btn btn-primary btn-lg" data-action="player-next">
      ${isLast ? '🏆 최종 순위 보기' : `다음 — ${esc(state.players[pidx + 1]?.name)} →`}
    </button>
  </div>
</div>`;
}

// 최종 순위 화면
function viewFinalSummary() {
  const { players, initialBalance, playerBonuses, correctBonus } = state;
  const sorted = [...players]
    .map((p, i) => ({ ...p, origIdx: i }))
    .sort((a, b) => b.balance - a.balance);

  return `
<div class="results">
  <div class="reveal-hdr">
    <button class="btn btn-ghost btn-sm" data-action="go-home">🏠 홈</button>
    <h2>🏆 최종 결과</h2>
    <div></div>
  </div>
  <div class="standings">
    ${sorted.map((p, rank) => {
      const diff  = p.balance - initialBalance;
      const medal = ['🥇', '🥈', '🥉'][rank] ?? `${rank + 1}위`;
      const pb    = playerBonuses[p.id];
      return `
    <div class="standing-row ${rank === 0 ? 'st-first' : ''}">
      <div class="st-medal">${medal}</div>
      <div class="st-main">
        <div class="st-name" style="color:${color(p.origIdx)}">${esc(p.name)}</div>
        ${pb?.cnt > 0 ? `<div class="st-bonus-line">🎯 정답 ${pb.cnt}개 +${won(pb.bonus)}</div>` : ''}
      </div>
      <div class="st-right">
        <div class="st-bal">${won(p.balance)}</div>
        <div class="st-diff ${diff >= 0 ? 'diff-pos' : 'diff-neg'}">
          ${diff >= 0 ? '+' : ''}${won(diff)}
        </div>
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
  state.auction = { price: state.auctionStartPrice, activeBidders: [], status: 'bidding', winner: null };
}

function initInvestRound() {
  state.investInputs = {};
  state.players.forEach(p => {
    state.investInputs[p.id] = { side: null, amount: '', confirmed: p.balance <= 0 };
  });
}

function awardTo(playerId) {
  const price  = state.auction.price;
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.balance < price) return;
  player.balance -= price;
  player.history.push({ type: 'purchase', newsId: getActiveNews()[state.gameIndex]?.id, price });
  state.roundResults[state.gameIndex] = { purchase: { playerId, price } };
  state.auction.status = 'awarded';
  state.auction.winner = playerId;
}

function applyAllResults() {
  if (state.resultsApplied) return;
  state.resultsApplied = true;

  const activeNews = getActiveNews();

  // 플레이어별 정답 카운트 추적
  const correctCount = {};
  state.players.forEach(p => { correctCount[p.id] = 0; });

  state.roundResults.forEach((result, idx) => {
    const n = activeNews[idx];
    if (!n) return;

    if (state.mode === 'auction') {
      if (!result?.purchase) return;
      const { playerId, price } = result.purchase;
      const p = state.players.find(x => x.id === playerId);
      if (!p) return;
      if (n.answer === 'real') {
        p.balance += price * 2;   // 2× 수익 (이미 차감된 price 포함 환급)
        correctCount[playerId]++;
      }
      // 가짜 구매: 이미 balance에서 차감됨 → 추가 처리 없음

    } else {
      (result?.investments || []).forEach(inv => {
        const p = state.players.find(x => x.id === inv.playerId);
        if (!p || inv.amount <= 0) return;
        if (inv.side === n.answer) {
          p.balance += inv.amount * 2;  // 2× 수익
          correctCount[p.id]++;
        }
        // 오답: 이미 차감됨 → 추가 처리 없음
      });
    }
  });

  // 정답 개수 보너스 계산 및 지급
  const bonus = state.correctBonus || 0;
  state.playerBonuses = {};
  state.players.forEach(p => {
    const cnt = correctCount[p.id] || 0;
    const bonusAmt = cnt * bonus;
    state.playerBonuses[p.id] = { cnt, bonus: bonusAmt };
    if (bonusAmt > 0) p.balance += bonusAmt;
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
    case 'go-home':
      clearGameNews();
      state.players.forEach(p => { p.balance = state.initialBalance; p.history = []; });
      state.roundResults = []; state.resultsApplied = false; state.playerBonuses = {};
      state.revealIndex = 0; state.revealAnswerShown = false; state.playerRevealIndex = -1;
      state.gameIndex = 0; state.browseIndex = 0;
      state.phase = 'home';
      break;
    case 'go-admin':  state.phase = 'admin'; break;
    case 'go-browse':
      if (!checkStartable().ok) break;
      buildGameNews();          // 반드시 여기서 셔플
      state.browseIndex = 0; state.phase = 'browse'; break;

    case 'select-mode':
      state.mode = el.dataset.mode; break;

    case 'tab': state.adminTab = el.dataset.tab; break;

    // Players
    case 'add-player':
      if (state.players.length < 8)
        state.players.push({ id: Date.now(), name: `모둠 ${state.players.length + 1}`, balance: state.initialBalance, history: [] });
      break;
    case 'remove-player':
      if (state.players.length > 1) state.players = state.players.filter(p => p.id !== id);
      break;
    case 'reset-balances':
      state.players.forEach(p => { p.balance = state.initialBalance; }); break;

    // News
    case 'set-answer': {
      const ni = state.news.find(n => n.id === id);
      if (ni) ni.answer = el.dataset.val; break;
    }
    case 'del-news':
      state.news = state.news.filter(n => n.id !== id);
      state.bundles.forEach(b => { b.newsIds = b.newsIds.filter(nid => nid !== id); });
      break;

    // Bundles
    case 'add-bundle':
      state.bundles.push({ id: Date.now(), name: '새 꾸러미', newsIds: [] });
      state.expandedBundleId = state.bundles[state.bundles.length - 1].id;
      break;
    case 'del-bundle':
      if (!confirm('이 꾸러미를 삭제하시겠습니까?')) return;
      state.bundles = state.bundles.filter(b => b.id !== id);
      if (state.activeBundleId === id)   state.activeBundleId = null;
      if (state.expandedBundleId === id) state.expandedBundleId = null;
      break;
    case 'select-bundle':   state.activeBundleId = id; break;
    case 'deselect-bundle': state.activeBundleId = null; break;
    case 'expand-bundle':
      state.expandedBundleId = state.expandedBundleId === id ? null : id; break;
    case 'toggle-bundle-news': {
      const bid = Number(el.dataset.bid);
      const b   = state.bundles.find(x => x.id === bid);
      if (!b) break;
      const idx2 = b.newsIds.indexOf(id);
      if (idx2 >= 0) b.newsIds.splice(idx2, 1); else b.newsIds.push(id);
      break;
    }

    // Admin start/reset
    case 'start-browse': {
      const { ok, reason } = checkStartable();
      if (!ok) { alert(reason); return; }
      state.players.forEach(p => { p.balance = state.initialBalance; p.history = []; });
      buildGameNews();  // 게임 시작 시 즉시 셔플 (탐색 단계부터 섞인 순서)
      state.roundResults = []; state.resultsApplied = false; state.playerBonuses = {};
      state.revealIndex = 0; state.revealAnswerShown = false; state.playerRevealIndex = -1;
      state.gameIndex = 0; state.browseIndex = 0;
      state.phase = 'browse'; break;
    }
    case 'reset-game':
      if (!confirm('게임 결과를 초기화하시겠습니까?')) return;
      state.players.forEach(p => { p.balance = state.initialBalance; p.history = []; });
      clearGameNews();
      state.roundResults = []; state.resultsApplied = false; state.playerBonuses = {};
      state.gameIndex = 0; state.phase = 'admin'; break;
    case 'reset-all':
      if (!confirm('모든 데이터를 초기화하시겠습니까?')) return;
      state = freshState(); break;

    // Browse
    case 'browse-prev': if (state.browseIndex > 0) state.browseIndex--; break;
    case 'browse-next': {
      const an = getActiveNews();
      if (state.browseIndex < an.length - 1) state.browseIndex++; break;
    }
    case 'begin-game': {
      // _gameNewsCache는 start-browse 때 이미 셔플됨
      // 캐시가 없는 경우(직접 접근 등) 안전망으로 다시 빌드
      if (!state.gameOrder || state.gameOrder.length === 0) buildGameNews();
      state.phase = 'game';
      state.gameIndex = 0;
      state.revealIndex = 0;
      state.revealAnswerShown = false;
      state.playerRevealIndex = -1;
      if (state.mode === 'auction') initAuctionRound(); else initInvestRound();
      break;
    }

    // Auction
    case 'raise-price':
      state.auction.price += state.auctionStep; state.auction.activeBidders = []; break;
    case 'toggle-bidder': {
      const list = state.auction.activeBidders;
      const idx2 = list.indexOf(id);
      if (idx2 >= 0) list.splice(idx2, 1); else list.push(id); break;
    }
    case 'finalize': {
      const { activeBidders } = state.auction;
      if (!activeBidders.length) break;
      if (activeBidders.length === 1) awardTo(activeBidders[0]);
      else state.auction.status = 'selectWinner';
      break;
    }
    case 'award-to': awardTo(id); break;
    case 'cancel-select': state.auction.status = 'bidding'; break;
    case 'pass-auction':
      state.roundResults[state.gameIndex] = { purchase: null };
      state.auction.status = 'passed'; break;
    case 'auction-next': {
      const an = getActiveNews();
      if (state.gameIndex >= an.length - 1) {
        applyAllResults(); state.phase = 'results'; state.revealIndex = 0; state.revealAnswerShown = false; state.playerRevealIndex = -1;
      } else { state.gameIndex++; initAuctionRound(); }
      break;
    }

    // Investment
    case 'set-side':
      if (!state.investInputs[id]) state.investInputs[id] = {};
      state.investInputs[id].side = el.dataset.val; break;
    case 'confirm-invest': {
      const inp = state.investInputs[id] || {};
      const amount = Number(inp.amount);
      const pp = state.players.find(p => p.id === id);
      if (!inp.side)           { alert('진짜 또는 가짜를 선택하세요.'); return; }
      if (amount < 0)          { alert('금액은 0 이상이어야 합니다.'); return; }
      if (amount > pp.balance) { alert(`잔액(${won(pp.balance)})을 초과했습니다.`); return; }
      if (amount > 0) { pp.balance -= amount; }
      inp.amount = amount; inp.confirmed = true; break;
    }
    case 'pass-invest':
      if (!state.investInputs[id]) state.investInputs[id] = {};
      Object.assign(state.investInputs[id], { side: 'pass', amount: 0, confirmed: true }); break;
    case 'invest-next': {
      const an = getActiveNews();
      const invs = state.players
        .filter(p => { const inp = state.investInputs[p.id]; return inp?.confirmed && inp.side !== 'pass' && Number(inp.amount) > 0; })
        .map(p => { const inp = state.investInputs[p.id]; return { playerId: p.id, side: inp.side, amount: Number(inp.amount) }; });
      state.roundResults[state.gameIndex] = { investments: invs };
      if (state.gameIndex >= an.length - 1) {
        applyAllResults(); state.phase = 'results'; state.revealIndex = 0; state.revealAnswerShown = false; state.playerRevealIndex = -1;
      } else { state.gameIndex++; initInvestRound(); }
      break;
    }

    // Results
    case 'show-answer': state.revealAnswerShown = true; break;
    case 'reveal-next': {
      const an = getActiveNews();
      if (state.revealIndex < an.length - 1) {
        state.revealIndex++;
        state.revealAnswerShown = false;
      } else {
        // 모든 뉴스 공개 완료 → 플레이어별 결과 시작
        state.playerRevealIndex = 0;
      }
      break;
    }
    case 'player-next': {
      if (state.playerRevealIndex < state.players.length - 1) {
        state.playerRevealIndex++;
      } else {
        state.playerRevealIndex = state.players.length; // 최종 화면
      }
      break;
    }
    case 'play-again':
      state.players.forEach(p => { p.balance = state.initialBalance; p.history = []; });
      buildGameNews();  // 다시 하기 → 새로운 셔플
      state.roundResults = []; state.resultsApplied = false; state.playerBonuses = {};
      state.revealIndex = 0; state.revealAnswerShown = false; state.playerRevealIndex = -1;
      state.gameIndex = 0; state.browseIndex = 0;
      state.phase = 'browse'; break;

    case 'zoom': showZoom(el.dataset.src || el.src); return;
    default: return;
  }
  render();
}

function handleInput(e) {
  const el = e.target, action = el.dataset.action;
  const id = el.dataset.id ? Number(el.dataset.id) : null;
  switch (action) {
    case 'edit-name': { const p = state.players.find(x => x.id === id); if (p) p.name = el.value; break; }
    case 'edit-title': { const n = state.news.find(x => x.id === id); if (n) n.title = el.value; break; }
    case 'edit-bundle-name': { const b = state.bundles.find(x => x.id === id); if (b) b.name = el.value; break; }
    case 'set-init-balance':   state.initialBalance    = Math.max(10000, Number(el.value) || DEF_BALANCE); break;
    case 'set-auction-start':  state.auctionStartPrice = Math.max(0, Number(el.value) || 0); break;
    case 'set-auction-step':   state.auctionStep       = Math.max(1000, Number(el.value) || DEF_STEP); break;
    case 'set-correct-bonus':  state.correctBonus      = Math.max(0, Number(el.value) || 0); break;
    case 'set-amount': if (!state.investInputs[id]) state.investInputs[id] = {}; state.investInputs[id].amount = el.value; break;
  }
  save();
}

async function handleChange(e) {
  try {
    const el = e.target;
    if (el.dataset.action === 'upload-news' && el.files?.length) await uploadNews(el.files);
  } catch (err) { console.error('Upload error:', err); alert('이미지 업로드 중 오류가 발생했습니다.'); }
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
    r.onload = e => res(e.target.result);
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
  modal.id = 'zoom-modal'; modal.className = 'zoom-modal';
  modal.innerHTML = `<img src="${src}" class="zoom-img" alt=""><button class="zoom-close" title="닫기">✕</button>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.classList.contains('zoom-close')) modal.remove();
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
