/* MS마켓 플로팅 챗봇 위젯 — 순수 JS, 프레임워크 없음 */
(function () {
  'use strict';

  var BOT_NAME = '마케';
  var WELCOME = '안녕하세요! MS마켓 상담 도우미 ' + BOT_NAME + '예요 🙂\n서비스·요금·진행 방식 등 궁금한 점을 편하게 물어보세요.';
  var MAX_HISTORY = 10;            // 최근 10개(5턴) 유지
  var API_URL = '/api/chat';

  // 랜딩페이지 accent 색상 가져오기(테마 스위처 반영), 기본 MS 오렌지
  function getAccent() {
    var root = document.getElementById('dc-root') || document.documentElement;
    var c = getComputedStyle(root).getPropertyValue('--accent').trim();
    return c || '#FF6B35';
  }

  var history = [];      // {role, content}
  var open = false;
  var loading = false;
  var welcomed = false;

  // ---------- 스타일 ----------
  var css = `
  .cb-root{position:fixed;right:24px;bottom:24px;z-index:2147483000;
    font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,sans-serif;
    --cb-accent:#FF6B35}
  .cb-launcher{width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;
    background:var(--cb-accent);color:#fff;box-shadow:0 12px 30px -8px rgba(0,0,0,.4);
    display:flex;align-items:center;justify-content:center;transition:transform .2s,filter .2s;
    position:relative}
  .cb-launcher:hover{filter:brightness(.95);transform:translateY(-2px)}
  .cb-launcher svg{width:28px;height:28px}
  .cb-teaser{position:absolute;right:0;bottom:74px;width:240px;background:#fff;color:#1C1C1E;
    border:1px solid #E5E5EA;border-radius:14px;padding:14px 36px 14px 14px;font-size:14px;line-height:1.5;
    box-shadow:0 16px 40px -16px rgba(0,0,0,.35);cursor:pointer;white-space:pre-line;
    opacity:0;transform:translateY(8px);transition:opacity .3s,transform .3s;pointer-events:none}
  .cb-teaser.show{opacity:1;transform:none;pointer-events:auto}
  .cb-teaser-x{position:absolute;top:6px;right:8px;border:none;background:none;font-size:16px;
    color:#9a9aa0;cursor:pointer;line-height:1;padding:4px}
  .cb-panel{position:absolute;right:0;bottom:74px;width:min(380px,calc(100vw - 40px));
    height:min(560px,calc(100vh - 120px));background:#fff;border-radius:18px;overflow:hidden;
    display:flex;flex-direction:column;box-shadow:0 24px 60px -16px rgba(0,0,0,.45);
    border:1px solid #E5E5EA;opacity:0;transform:translateY(16px) scale(.98);
    transform-origin:bottom right;transition:opacity .25s,transform .25s;pointer-events:none}
  .cb-panel.show{opacity:1;transform:none;pointer-events:auto}
  .cb-head{background:var(--cb-accent);color:#fff;padding:16px 18px;display:flex;align-items:center;gap:10px}
  .cb-head .cb-dot{width:9px;height:9px;border-radius:50%;background:#7CF0B0;box-shadow:0 0 0 3px rgba(255,255,255,.25)}
  .cb-head .cb-title{font-weight:800;font-size:16px;letter-spacing:-.01em}
  .cb-head .cb-sub{font-size:12px;opacity:.9;font-weight:500}
  .cb-head .cb-close{margin-left:auto;background:none;border:none;color:#fff;font-size:22px;
    cursor:pointer;line-height:1;padding:2px 4px;opacity:.9}
  .cb-head .cb-close:hover{opacity:1}
  .cb-body{flex:1;overflow-y:auto;padding:16px;background:#F7F8FA;display:flex;flex-direction:column;gap:10px}
  .cb-msg{max-width:82%;padding:11px 14px;border-radius:14px;font-size:14.5px;line-height:1.55;
    white-space:pre-wrap;word-break:break-word}
  .cb-msg.bot{align-self:flex-start;background:#fff;color:#1C1C1E;border:1px solid #ECECF0;border-bottom-left-radius:5px}
  .cb-msg.user{align-self:flex-end;background:var(--cb-accent);color:#fff;border-bottom-right-radius:5px}
  .cb-msg.err{align-self:flex-start;background:#FFF1F0;color:#C0392B;border:1px solid #F6D5D2}
  .cb-typing{align-self:flex-start;background:#fff;border:1px solid #ECECF0;border-radius:14px;
    border-bottom-left-radius:5px;padding:13px 16px;display:flex;gap:5px}
  .cb-typing span{width:7px;height:7px;border-radius:50%;background:#B8BCC6;animation:cb-bounce 1.2s infinite}
  .cb-typing span:nth-child(2){animation-delay:.15s}
  .cb-typing span:nth-child(3){animation-delay:.3s}
  @keyframes cb-bounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-6px);opacity:1}}
  .cb-foot{border-top:1px solid #ECECF0;background:#fff;padding:10px;display:flex;gap:8px;align-items:flex-end}
  .cb-input{flex:1;border:1px solid #D5DAE3;border-radius:12px;padding:10px 12px;font-size:14.5px;
    font-family:inherit;resize:none;max-height:96px;outline:none;line-height:1.4}
  .cb-input:focus{border-color:var(--cb-accent)}
  .cb-send{flex:none;width:42px;height:42px;border-radius:12px;border:none;cursor:pointer;
    background:var(--cb-accent);color:#fff;display:flex;align-items:center;justify-content:center;
    transition:filter .2s}
  .cb-send:hover{filter:brightness(.95)}
  .cb-send:disabled{opacity:.5;cursor:not-allowed}
  .cb-send svg{width:20px;height:20px}
  @media (max-width:480px){
    .cb-root{right:16px;bottom:16px}
    .cb-panel{bottom:70px}
  }`;

  // ---------- DOM 빌드 ----------
  var root, panel, body, input, sendBtn, teaser, launcher, typingEl = null;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function build() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    root = el('div', 'cb-root');
    root.style.setProperty('--cb-accent', getAccent());

    // 패널
    panel = el('div', 'cb-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'MS마켓 상담 챗봇');

    var head = el('div', 'cb-head');
    head.appendChild(el('span', 'cb-dot'));
    var titleWrap = el('div');
    titleWrap.appendChild(el('div', 'cb-title', BOT_NAME));
    titleWrap.appendChild(el('div', 'cb-sub', 'MS마켓 상담 도우미'));
    head.appendChild(titleWrap);
    var closeBtn = el('button', 'cb-close', '&times;');
    closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.onclick = toggle;
    head.appendChild(closeBtn);
    panel.appendChild(head);

    body = el('div', 'cb-body');
    panel.appendChild(body);

    var foot = el('div', 'cb-foot');
    input = el('textarea', 'cb-input');
    input.rows = 1;
    input.placeholder = '메시지를 입력하세요…';
    input.setAttribute('aria-label', '메시지 입력');
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    foot.appendChild(input);

    sendBtn = el('button', 'cb-send');
    sendBtn.setAttribute('aria-label', '보내기');
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/></svg>';
    sendBtn.onclick = submit;
    foot.appendChild(sendBtn);
    panel.appendChild(foot);

    // 런처 버튼
    launcher = el('button', 'cb-launcher');
    launcher.setAttribute('aria-label', '상담 챗봇 열기');
    launcher.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 4v-4H6a2 2 0 0 1-2-2V5z" fill="currentColor"/><circle cx="9" cy="9.5" r="1.2" fill="#fff"/><circle cx="12" cy="9.5" r="1.2" fill="#fff"/><circle cx="15" cy="9.5" r="1.2" fill="#fff"/></svg>';
    launcher.onclick = toggle;

    // 환영 티저
    teaser = el('div', 'cb-teaser');
    teaser.textContent = WELCOME;
    var tx = el('button', 'cb-teaser-x', '&times;');
    tx.setAttribute('aria-label', '닫기');
    tx.onclick = function (e) { e.stopPropagation(); hideTeaser(); };
    teaser.appendChild(tx);
    teaser.addEventListener('click', function () { hideTeaser(); if (!open) toggle(); });

    root.appendChild(panel);
    root.appendChild(teaser);
    root.appendChild(launcher);
    document.body.appendChild(root);
  }

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 96) + 'px';
  }

  function hideTeaser() {
    teaser.classList.remove('show');
  }

  function toggle() {
    open = !open;
    panel.classList.toggle('show', open);
    launcher.setAttribute('aria-expanded', String(open));
    if (open) {
      hideTeaser();
      root.style.setProperty('--cb-accent', getAccent());
      if (!welcomed) seedWelcome();
      setTimeout(function () { input.focus(); }, 250);
      scrollDown();
    }
  }

  function seedWelcome() {
    welcomed = true;
    addBubble('bot', WELCOME);
    history.push({ role: 'assistant', content: WELCOME });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 안전한 경량 마크다운: 먼저 이스케이프 후 **굵게** 만 변환
  function renderLite(s) {
    return escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function addBubble(kind, text) {
    var m = el('div', 'cb-msg ' + kind);
    if (kind === 'bot') m.innerHTML = renderLite(text);
    else m.textContent = text;
    body.appendChild(m);
    scrollDown();
    return m;
  }

  function showTyping() {
    typingEl = el('div', 'cb-typing', '<span></span><span></span><span></span>');
    body.appendChild(typingEl);
    scrollDown();
  }
  function hideTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
  }

  function scrollDown() {
    requestAnimationFrame(function () { body.scrollTop = body.scrollHeight; });
  }

  function setLoading(on) {
    loading = on;
    sendBtn.disabled = on;
    input.disabled = on;
  }

  async function submit() {
    var text = input.value.trim();
    if (!text || loading) return;

    if (!welcomed) seedWelcome();
    addBubble('user', text);
    history.push({ role: 'user', content: text });
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

    input.value = '';
    autoGrow();
    setLoading(true);
    showTyping();

    try {
      var res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-MAX_HISTORY) }),
      });
      var data = await res.json().catch(function () { return {}; });
      hideTyping();
      if (!res.ok || !data.reply) {
        addBubble('err', data.error || '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
      } else {
        addBubble('bot', data.reply);
        history.push({ role: 'assistant', content: data.reply });
        if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
      }
    } catch (e) {
      hideTyping();
      if (location.protocol === 'file:') {
        addBubble('err', '⚠️ 페이지를 파일로 직접 열어(file://) 챗봇 서버에 연결할 수 없어요.\n터미널에서 "node server.js" 실행 후 http://localhost:3000 으로 접속해 주세요.');
      } else {
        addBubble('err', '서버에 연결하지 못했어요. 백엔드(node server.js)가 실행 중인지 확인하고 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setLoading(false);
      input.focus();
    }
  }

  function init() {
    build();
    // 페이지 로드 1초 후 환영 메시지(티저) 자동 표시
    setTimeout(function () {
      if (!open) teaser.classList.add('show');
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
