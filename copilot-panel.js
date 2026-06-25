/**
 * Copilot-Style Injectable Chatbot Panel
 * ----------------------------------------
 * Drop one <script> tag on any website.
 * The panel lives in a Shadow DOM — zero style conflicts.
 * Opens as a right-side split that PUSHES the page (no overlay).
 *
 * Usage:
 *   <script
 *     src="copilot-panel.js"
 *     data-api-url="/api/financial-chat"
 *     data-transactions-var="myTransactionsArray"
 *   ></script>
 *
 * data-api-url         — (required) your backend endpoint URL
 * data-transactions-var — (optional) name of the global JS variable
 *                         holding transactions (e.g. window.transactions)
 *
 * Public API (all optional):
 *   window.CopilotPanel.open()
 *   window.CopilotPanel.close()
 *   window.CopilotPanel.toggle()
 *   window.CopilotPanel.send('Hello')
 *   window.CopilotPanel.clear()
 *   window.CopilotPanel.setTransactions([...])  ← update transactions at runtime
 */

(function () {
  'use strict';

  const PANEL_WIDTH = '380px';
  const TRANSITION  = 'margin-right 0.3s cubic-bezier(0.4,0,0.2,1)';
  const HOST_TAG    = 'copilot-chat-panel';

  /* Prevent double-injection */
  if (document.querySelector(HOST_TAG)) return;

  /* ── READ CONFIG FROM SCRIPT TAG ── */
  const currentScript =
    document.currentScript ||
    document.querySelector('script[data-api-url]');

  const API_URL           = currentScript?.getAttribute('data-api-url') || null;
  const TRANSACTIONS_VAR  = currentScript?.getAttribute('data-transactions-var') || 'transactions';

  if (!API_URL) {
    console.warn('[CopilotPanel] No data-api-url provided. Add data-api-url="/your/endpoint" to the script tag.');
  }

  /* Helper to get transactions from the host page's global variable */
  const getTransactions = () => {
    try {
      return window[TRANSACTIONS_VAR] ?? [];
    } catch {
      return [];
    }
  };

  /* ── 1. HOST ELEMENT (fixed to right edge) ── */
  const host = document.createElement(HOST_TAG);
  Object.assign(host.style, {
    position:   'fixed',
    top:        '0',
    right:      '0',
    width:      PANEL_WIDTH,
    height:     '100vh',
    zIndex:     '2147483647',
    transform:  'translateX(380px)',
    transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
    display:    'block',
  });
  document.body.appendChild(host);

  /* ── 2. SHADOW ROOT ── */
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; display: block; }
    * { box-sizing: border-box; margin: 0; padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

    #panel {
      width: 100%; height: 100vh; background: #ffffff;
      border-left: 1px solid #e2e8f0; display: flex;
      flex-direction: column; box-shadow: -4px 0 24px rgba(0,0,0,0.08);
    }

    /* Header */
    #header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 16px; height: 52px; border-bottom: 1px solid #e2e8f0;
      background: #f8fafc; flex-shrink: 0;
    }
    #header-left { display: flex; align-items: center; gap: 10px; }
    #logo {
      width: 28px; height: 28px; border-radius: 8px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; color: #fff;
    }
    #title   { font-size: 14px; font-weight: 600; color: #0f172a; }
    #subtitle { font-size: 11px; color: #64748b; margin-top: 1px; }
    #close-btn {
      width: 28px; height: 28px; border-radius: 6px; border: none;
      background: transparent; cursor: pointer; display: flex;
      align-items: center; justify-content: center; color: #64748b;
      transition: background 0.15s;
    }
    #close-btn:hover { background: #f1f5f9; color: #0f172a; }
    #close-btn svg { width: 16px; height: 16px; }

    /* API badge */
    #api-badge {
      font-size: 10px; padding: 2px 7px; border-radius: 10px;
      background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;
      white-space: nowrap; max-width: 120px; overflow: hidden;
      text-overflow: ellipsis;
    }
    #api-badge.no-api {
      background: #fff7ed; color: #d97706; border-color: #fcd34d;
    }

    /* Messages */
    #messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth;
    }
    #messages::-webkit-scrollbar { width: 4px; }
    #messages::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

    .msg { display: flex; flex-direction: column; gap: 4px; max-width: 88%; }
    .msg.user { align-self: flex-end; align-items: flex-end; }
    .msg.bot  { align-self: flex-start; align-items: flex-start; }

    .bubble {
      padding: 10px 14px; border-radius: 16px;
      font-size: 13.5px; line-height: 1.55; word-break: break-word;
    }
    .user .bubble { background: #6366f1; color: #fff; border-bottom-right-radius: 4px; }
    .bot  .bubble {
      background: #f1f5f9; color: #1e293b;
      border-bottom-left-radius: 4px; border: 1px solid #e2e8f0;
    }
    .sender { font-size: 11px; color: #94a3b8; padding: 0 4px; }

    /* Typing indicator */
    .typing-bubble {
      background: #f1f5f9; border: 1px solid #e2e8f0;
      border-radius: 16px; border-bottom-left-radius: 4px;
      padding: 12px 16px; display: flex; gap: 5px; align-items: center;
    }
    .dot {
      width: 7px; height: 7px; border-radius: 50%; background: #94a3b8;
      animation: bounce 1.2s infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%,60%,100% { transform: translateY(0); }
      30%          { transform: translateY(-5px); }
    }

    /* Input area */
    #input-area {
      padding: 12px 16px; border-top: 1px solid #e2e8f0;
      background: #f8fafc; flex-shrink: 0;
    }
    #input-row {
      display: flex; gap: 8px; align-items: flex-end;
      background: #fff; border: 1px solid #e2e8f0;
      border-radius: 12px; padding: 8px 8px 8px 14px; transition: border-color 0.15s;
    }
    #input-row:focus-within { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
    #input {
      flex: 1; border: none; outline: none; background: transparent;
      font-size: 13.5px; color: #1e293b; resize: none;
      max-height: 140px; min-height: 22px; line-height: 1.5; font-family: inherit;
    }
    #input::placeholder { color: #94a3b8; }
    #send-btn {
      width: 32px; height: 32px; border-radius: 8px; border: none;
      background: #6366f1; color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, transform 0.1s; flex-shrink: 0;
    }
    #send-btn:hover  { background: #4f46e5; }
    #send-btn:active { transform: scale(0.93); }
    #send-btn:disabled { background: #c7d2fe; cursor: default; }
    #send-btn svg { width: 15px; height: 15px; }
    #footer-hint { font-size: 11px; color: #94a3b8; text-align: center; margin-top: 8px; }

    /* Empty state */
    #empty-state {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 8px; padding: 32px;
    }
    #empty-icon {
      width: 52px; height: 52px; border-radius: 14px;
      background: #eef2ff;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; margin-bottom: 4px;
    }
    #empty-title { font-size: 15px; font-weight: 600; color: #0f172a; }
    #empty-sub   { font-size: 13px; color: #64748b; text-align: center; line-height: 1.5; }

    .suggestion-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 13px; border: 1px solid #e2e8f0; border-radius: 20px;
      background: #fff; cursor: pointer; font-size: 12.5px; color: #475569;
      transition: border-color 0.15s, background 0.15s; font-family: inherit;
    }
    .suggestion-chip:hover { border-color: #6366f1; color: #6366f1; background: #eef2ff; }
    #chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }
  `;

  /* ── 3. PANEL HTML ── */
  const panel = document.createElement('div');
  panel.id = 'panel';

  const apiBadgeText  = API_URL ? API_URL.replace(/^https?:\/\/[^/]+/, '') : 'No API configured';
  const apiBadgeClass = API_URL ? '' : 'no-api';

  panel.innerHTML = `
    <div id="header">
      <div id="header-left">
        <div id="logo">✦</div>
        <div>
          <div id="title">AI Assistant</div>
          <div id="subtitle"><span id="api-badge" class="${apiBadgeClass}" title="${API_URL || ''}">${apiBadgeText}</span></div>
        </div>
      </div>
      <button id="close-btn" aria-label="Close panel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div id="messages">
      <div id="empty-state">
        <div id="empty-icon">✦</div>
        <div id="empty-title">How can I help?</div>
        <div id="empty-sub">Ask me anything about this page,<br>or start a conversation below.</div>
        <div id="chips">
          <button class="suggestion-chip">Summarize my finances</button>
          <button class="suggestion-chip">Show spending trends</button>
          <button class="suggestion-chip">What should I do next?</button>
        </div>
      </div>
    </div>

    <div id="input-area">
      <div id="input-row">
        <textarea id="input" rows="1" placeholder="Ask anything…" aria-label="Chat input"></textarea>
        <button id="send-btn" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
          </svg>
        </button>
      </div>
      <div id="footer-hint">Enter to send · Shift+Enter for new line</div>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(panel);

  /* ── FAB button (real DOM, always visible when panel closed) ── */
  const fab = document.createElement('button');
  fab.setAttribute('aria-label', 'Open AI assistant');
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>`;
  Object.assign(fab.style, {
    position:       'fixed',
    bottom:         '24px',
    right:          '24px',
    width:          '52px',
    height:         '52px',
    borderRadius:   '50%',
    background:     'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    border:         'none',
    cursor:         'pointer',
    color:          '#fff',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    boxShadow:      '0 4px 20px rgba(99,102,241,0.4)',
    transition:     'transform 0.2s, box-shadow 0.2s',
    zIndex:         '2147483646',
  });
  document.body.appendChild(fab);

  /* ── 4. STATE ── */
  const $ = (sel) => shadow.querySelector(sel);
  let isOpen = false;
  let isBusy = false;
  const messages = [];

  /* Runtime override for transactions */
  let _transactionsOverride = null;
  const resolveTransactions = () => _transactionsOverride ?? getTransactions();

  /* Auto-resize textarea */
  const inputEl = $('#input');
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
  });

  const scrollBottom = () => {
    const m = $('#messages');
    requestAnimationFrame(() => { m.scrollTop = m.scrollHeight; });
  };

  const escapeHtml = (str) =>
    str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
       .replace(/\n/g,'<br>');

  /* ── 5. RENDER ── */
  const renderMessages = () => {
    const container = $('#messages');

    if (messages.length === 0) {
      container.innerHTML = `
        <div id="empty-state">
          <div id="empty-icon">✦</div>
          <div id="empty-title">How can I help?</div>
          <div id="empty-sub">Ask me anything about this page,<br>or start a conversation below.</div>
          <div id="chips">
            <button class="suggestion-chip">Summarize my finances</button>
            <button class="suggestion-chip">Show spending trends</button>
            <button class="suggestion-chip">What should I do next?</button>
          </div>
        </div>`;
      bindChips();
      return;
    }

    const empty = $('#empty-state');
    if (empty) empty.remove();

    const existing = container.querySelectorAll('.msg').length;
    for (let i = existing; i < messages.length; i++) {
      const { role, text } = messages[i];
      const div = document.createElement('div');
      div.className = `msg ${role}`;
      div.innerHTML = `
        <span class="sender">${role === 'user' ? 'You' : 'Assistant'}</span>
        <div class="bubble">${escapeHtml(text)}</div>`;
      container.appendChild(div);
    }
    scrollBottom();
  };

  let typingEl = null;
  const showTyping = () => {
    const m = $('#messages');
    typingEl = document.createElement('div');
    typingEl.className = 'msg bot';
    typingEl.innerHTML = `
      <span class="sender">Assistant</span>
      <div class="typing-bubble">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
      </div>`;
    m.appendChild(typingEl);
    scrollBottom();
  };
  const hideTyping = () => { if (typingEl) { typingEl.remove(); typingEl = null; } };

  /* ── 6. API CALL ── */
  const sendToAPI = async (message) => {
    if (!API_URL) throw new Error('No API URL configured. Add data-api-url to the script tag.');

    const transactions = resolveTransactions();

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, transactions }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || err.message || `HTTP ${res.status}`);
    }

    const data = await res.json();

    /* Support common response shapes: { reply }, { message }, { response }, { content }, { answer } */
    return (
      data.reply    ??
      data.message  ??
      data.response ??
      data.content  ??
      data.answer   ??
      data.text     ??
      '(No response)'
    );
  };

  /* ── 7. SEND FLOW ── */
  const sendMessage = async (text) => {
    text = text.trim();
    if (!text || isBusy) return;

    isBusy = true;
    $('#send-btn').disabled = true;
    inputEl.value = '';
    inputEl.style.height = 'auto';

    messages.push({ role: 'user', text });
    renderMessages();
    showTyping();

    try {
      const reply = await sendToAPI(text);
      hideTyping();
      messages.push({ role: 'bot', text: reply });
      renderMessages();
    } catch (err) {
      hideTyping();
      messages.push({ role: 'bot', text: `⚠️ ${err.message}` });
      renderMessages();
    } finally {
      isBusy = false;
      $('#send-btn').disabled = false;
      inputEl.focus();
    }
  };

  /* ── 8. OPEN / CLOSE ── */
  const open = () => {
    if (isOpen) return;
    isOpen = true;
    document.body.style.transition = TRANSITION;
    document.body.style.marginRight = PANEL_WIDTH;
    setTimeout(() => { document.body.style.transition = ''; }, 320);
    host.style.transform = 'translateX(0)';
    fab.style.display = 'none';
    setTimeout(() => inputEl.focus(), 350);
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    document.body.style.transition = TRANSITION;
    document.body.style.marginRight = '';
    setTimeout(() => { document.body.style.transition = ''; }, 320);
    host.style.transform = 'translateX(380px)';
    fab.style.display = 'flex';
  };

  const toggle = () => (isOpen ? close() : open());

  /* ── 9. EVENTS ── */
  const bindChips = () => {
    shadow.querySelectorAll('.suggestion-chip').forEach((chip) => {
      chip.addEventListener('click', () => sendMessage(chip.textContent.trim()));
    });
  };
  bindChips();

  $('#close-btn').addEventListener('click', close);
  fab.addEventListener('click', open);
  $('#send-btn').addEventListener('click', () => sendMessage(inputEl.value));
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputEl.value); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) close(); });

  /* ── 10. PUBLIC API ── */
  window.CopilotPanel = {
    open,
    close,
    toggle,
    send: sendMessage,
    clear() { messages.length = 0; renderMessages(); },
    /** Override transactions at runtime: CopilotPanel.setTransactions([...]) */
    setTransactions(txns) { _transactionsOverride = txns; },
  };

})();