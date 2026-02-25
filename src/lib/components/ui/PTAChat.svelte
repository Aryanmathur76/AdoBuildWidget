<!--
  PTAChat.svelte — Integrated terminal-style chat panel for the PTA (Pipeline Triage Agent)
  Styled after Azure Cloud Shell / VS Code integrated terminal.

  Environment variables (Vite):
    VITE_PTA_API_BASE         API base URL, e.g. http://pta-api.internal:8000
    VITE_PTA_API_KEY          API key (leave unset if PTA_API_KEY not set on server)
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { marked } from 'marked';
  import { ptaOpen } from '$lib/stores/ptaStore';

  const API_BASE = import.meta.env.VITE_PTA_API_BASE || 'http://localhost:8000';
  const API_KEY  = import.meta.env.VITE_PTA_API_KEY  || '';

  // ── Types ──────────────────────────────────────────────────────────────────

  interface Message {
    role: 'user' | 'assistant';
    content: string;
    thinking: boolean;
    error: boolean;
  }

  interface ActiveTool {
    name: string;
    input: string;
    done: boolean;
  }

  type SaveStatus = null | 'saving' | 'ok' | 'error';

  // ── State ──────────────────────────────────────────────────────────────────

  let isOpen:       boolean     = false;
  $: ptaOpen.set(isOpen);   // keep store in sync so other components can react

  let sessionId:    string|null = null;
  let messages:     Message[]   = [];
  let activeTools:  ActiveTool[] = [];
  let inputText:    string      = '';
  let isLoading:    boolean     = false;
  let lastResponse: string|null = null;

  // Save modal
  let showSaveModal: boolean    = false;
  let saveType:      string     = 'release';
  let saveItemId:    string     = '';
  let saveEnv:       string     = '';
  let saveStatus:    SaveStatus = null;

  let messagesEl: HTMLDivElement;
  let inputEl:    HTMLTextAreaElement;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function apiHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (API_KEY) h['X-API-Key'] = API_KEY;
    return h;
  }

  function renderMarkdown(text: string): string {
    if (!text) return '';
    return marked(text, { breaks: true, gfm: true }) as string;
  }

  async function scrollToBottom(): Promise<void> {
    await tick();
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── Typewriter ─────────────────────────────────────────────────────────────

  async function typewrite(text: string, idx: number): Promise<void> {
    const charsPerTick = 6;
    let i = 0;
    while (i < text.length) {
      i = Math.min(i + charsPerTick, text.length);
      messages[idx] = { ...messages[idx], content: text.slice(0, i) };
      messages = [...messages];
      await tick();
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      await new Promise(r => setTimeout(r, 16));  // ~60fps
    }
    messages[idx] = { ...messages[idx], content: text };
    messages = [...messages];
  }

  // ── Session management ─────────────────────────────────────────────────────

  async function initSession(): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { session_id: string };
      sessionId = data.session_id;
    } catch (e) {
      console.error('[PTA] Session init failed:', e);
    }
  }

  async function newSession(): Promise<void> {
    if (sessionId) {
      try {
        await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
          method: 'DELETE',
          headers: apiHeaders(),
        });
      } catch (_) { /* ignore */ }
    }
    sessionId    = null;
    messages     = [];
    activeTools  = [];
    lastResponse = null;
    isLoading    = false;
    await initSession();
  }

  onMount(async () => {
    await initSession();
  });

  // ── Chat ──────────────────────────────────────────────────────────────────

  async function sendMessage(): Promise<void> {
    const text = inputText.trim();
    if (!text || isLoading || !sessionId) return;

    inputText   = '';
    isLoading   = true;
    activeTools = [];

    messages = [...messages, { role: 'user', content: text, thinking: false, error: false }];
    const assistantIdx = messages.length;
    messages = [...messages, { role: 'assistant', content: '', thinking: true, error: false }];
    await scrollToBottom();

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';   // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: { type: string; name?: string; input?: string; message?: string; response?: string };
          try { event = JSON.parse(line.slice(6)); } catch (_) { continue; }

          if (event.type === 'tool_start') {
            activeTools = [...activeTools, { name: event.name ?? '', input: event.input ?? '', done: false }];
            await scrollToBottom();

          } else if (event.type === 'tool_end') {
            let foundFirst = false;
            activeTools = activeTools.map(t => {
              if (!foundFirst && t.name === event.name && !t.done) {
                foundFirst = true;
                return { ...t, done: true };
              }
              return t;
            });

          } else if (event.type === 'done') {
            lastResponse = event.response ?? '';
            messages[assistantIdx] = { ...messages[assistantIdx], content: '', thinking: false, error: false };
            messages = [...messages];
            await typewrite(event.response ?? '', assistantIdx);
            activeTools = [];

          } else if (event.type === 'error') {
            messages[assistantIdx] = { ...messages[assistantIdx], content: `Error: ${event.message}`, thinking: false, error: true };
            messages = [...messages];
            activeTools = [];
          }
        }
      }

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      messages[assistantIdx] = { ...messages[assistantIdx], content: `Connection error: ${msg}`, thinking: false, error: true };
      messages = [...messages];
      activeTools = [];
    } finally {
      isLoading = false;
      await scrollToBottom();
      inputEl?.focus();
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ── Save RCA ──────────────────────────────────────────────────────────────

  function openSaveModal(): void {
    saveType      = 'release';
    saveItemId    = '';
    saveEnv       = '';
    saveStatus    = null;
    showSaveModal = true;
  }

  async function submitSave(): Promise<void> {
    if (!saveItemId.trim()) return;
    saveStatus = 'saving';
    try {
      const res = await fetch(`${API_BASE}/api/save`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          session_id:    sessionId,
          pipeline_type: saveType,
          item_id:       saveItemId.trim(),
          environment:   saveEnv.trim() || (saveType === 'build' ? 'build' : '—'),
          response_text: lastResponse,
        }),
      });
      saveStatus = res.ok ? 'ok' : 'error';
      if (res.ok) setTimeout(() => { showSaveModal = false; saveStatus = null; }, 1200);
    } catch (_) {
      saveStatus = 'error';
    }
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  function toggle(): void {
    isOpen = !isOpen;
    if (isOpen) tick().then(() => inputEl?.focus());
  }
</script>

<!-- ── FAB — only visible when panel is closed ────────────────────────────── -->
{#if !isOpen}
<button class="pta-fab" onclick={toggle} title="PTA — Pipeline Triage Agent">
  <span class="pta-fab__icon">&gt;_</span>
  <span class="pta-fab__label">PTA</span>
</button>
{/if}

<!-- ── Side panel wrapper — always in DOM, CSS drives width ───────────────── -->
<div class="pta-side-wrapper" class:pta-side-wrapper--open={isOpen}>
<div class="pta-panel">

  <!-- Title bar -->
  <div class="pta-titlebar">
    <div class="pta-titlebar__controls">
      <button type="button" class="pta-dot pta-dot--close" onclick={toggle} title="Close" aria-label="Close"></button>
      <span class="pta-dot pta-dot--min" title="Minimize"></span>
      <span class="pta-dot pta-dot--max" title="Maximize"></span>
    </div>
    <div class="pta-titlebar__tab">
      <span class="pta-titlebar__tab-icon">&gt;_</span>
      Pipeline Triage Agent
      <span class="pta-titlebar__tab-status" class:pta-titlebar__tab-status--ready={sessionId}></span>
    </div>
    <div class="pta-titlebar__actions">
      {#if lastResponse}
        <button class="pta-tbtn" onclick={openSaveModal} title="Save RCA to Azure Storage">
          &#x2191; Save RCA
        </button>
      {/if}
      <button class="pta-tbtn" onclick={newSession} title="Start a new session">
        &#x2295; New
      </button>
    </div>
  </div>

  <!-- Terminal output -->
  <div class="pta-terminal" bind:this={messagesEl}>
    {#if messages.length === 0}
      <div class="pta-welcome">
        <div class="pta-welcome__banner">Pipeline Triage Agent</div>
        <div class="pta-welcome__meta">
          {#if sessionId}
            <span class="pta-welcome__ok">● connected</span> &nbsp;· session {sessionId.slice(0, 8)}
          {:else}
            <span class="pta-welcome__err">● connecting…</span>
          {/if}
        </div>
        <div class="pta-welcome__rule">────────────────────────────────────────────────</div>
        <div class="pta-welcome__hint">Ask about a pipeline failure to get started.</div>
        <div class="pta-welcome__hint pta-welcome__hint--dim">e.g. "analyze why release 12345 failed"</div>
      </div>
    {/if}

    {#each messages as msg, i}
      {#if msg.role === 'user'}
        <!-- User command line -->
        <div class="pta-line pta-line--cmd">
          <span class="pta-prompt-glyph">❯</span>
          <span class="pta-line__cmd-text">{msg.content}</span>
        </div>

      {:else}
        <!-- Tool activity (shown while running) -->
        {#if i === messages.length - 1 && (isLoading || activeTools.length > 0)}
          <div class="pta-toolblock">
            {#each activeTools as tool}
              <div class="pta-line pta-line--tool" class:pta-line--tool-done={tool.done}>
                <span class="pta-tool__badge" class:pta-tool__badge--done={tool.done}>
                  {tool.done ? '✓' : '⟳'}
                </span>
                <span class="pta-tool__name">{tool.name}</span>
                {#if !tool.done && tool.input}
                  <span class="pta-tool__args">{tool.input.slice(0, 60)}{tool.input.length > 60 ? '…' : ''}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <!-- Thinking indicator (before first tool fires) -->
        {#if msg.thinking && activeTools.length === 0}
          <div class="pta-line pta-line--thinking">
            <span class="pta-thinking-dot"></span>
            <span class="pta-thinking-dot"></span>
            <span class="pta-thinking-dot"></span>
          </div>
        {/if}

        <!-- Response output -->
        {#if msg.content && !msg.error}
          <div class="pta-line pta-line--output">
            <div class="pta-output-md">{@html renderMarkdown(msg.content)}</div>
          </div>
        {:else if msg.content && msg.error}
          <div class="pta-line pta-line--error">
            <span class="pta-error-badge">[ERROR]</span>
            <span class="pta-error-text">{msg.content}</span>
          </div>
        {/if}
      {/if}
    {/each}
  </div>

  <!-- Input row -->
  <div class="pta-input-row" class:pta-input-row--busy={isLoading}>
    <span class="pta-prompt-glyph pta-prompt-glyph--input">❯</span>
    <textarea
      class="pta-input"
      bind:this={inputEl}
      bind:value={inputText}
      onkeydown={handleKeydown}
      placeholder="type a question and press Enter…"
      rows={2}
      disabled={isLoading || !sessionId}
    ></textarea>
  </div>

  <!-- Status bar -->
  <div class="pta-statusbar">
    <span class="pta-status__left">
      {#if sessionId}
        <span class="pta-status__dot pta-status__dot--ok"></span>
        session&nbsp;{sessionId.slice(0, 8)}
      {:else}
        <span class="pta-status__dot pta-status__dot--err"></span>
        connecting…
      {/if}
    </span>
    <span class="pta-status__right">Enter&nbsp;·&nbsp;send &nbsp;|&nbsp; Shift+Enter&nbsp;·&nbsp;newline</span>
  </div>

</div>
</div><!-- /.pta-side-wrapper -->

<!-- ── Save RCA modal ─────────────────────────────────────────────────────── -->
{#if showSaveModal}
<div class="pta-overlay" role="dialog" aria-modal="true">
  <div class="pta-modal">
    <div class="pta-modal__titlebar">
      <span class="pta-modal__icon">&gt;_</span>
      <span class="pta-modal__title">save-rca&nbsp;—&nbsp;Azure Storage</span>
    </div>

    <div class="pta-modal__body">
      <label class="pta-modal__label">
        <span class="pta-modal__key">type</span>
        <select class="pta-modal__select" bind:value={saveType}>
          <option value="release">release</option>
          <option value="build">build</option>
        </select>
      </label>

      <label class="pta-modal__label">
        <span class="pta-modal__key">{saveType === 'release' ? 'release_id' : 'build_id'}</span>
        <input
          class="pta-modal__input"
          bind:value={saveItemId}
          placeholder={saveType === 'release' ? '12345' : '67890'}
          type="text"
        />
      </label>

      {#if saveType === 'release'}
        <label class="pta-modal__label">
          <span class="pta-modal__key">environment</span>
          <input class="pta-modal__input" bind:value={saveEnv} placeholder="Production" type="text" />
        </label>
      {/if}
    </div>

    <div class="pta-modal__footer">
      <button class="pta-tbtn pta-tbtn--cancel" onclick={() => showSaveModal = false}>cancel</button>
      <button
        class="pta-tbtn pta-tbtn--confirm"
        onclick={submitSave}
        disabled={!saveItemId.trim() || saveStatus === 'saving'}
      >
        {#if saveStatus === 'saving'}saving…
        {:else if saveStatus === 'ok'}saved ✓
        {:else if saveStatus === 'error'}error — retry?
        {:else}save
        {/if}
      </button>
    </div>
  </div>
</div>
{/if}

<style>
  /* ── Design tokens ────────────────────────────────────────────────────────── */
  :root {
    --pta-bg:          #1e1e1e;
    --pta-bg2:         #252526;
    --pta-bg3:         #2d2d2d;
    --pta-border:      #474747;
    --pta-border-dim:  #3a3a3a;
    --pta-text:        #cccccc;
    --pta-text-dim:    #6a6a6a;
    --pta-text-bright: #ffffff;
    --pta-prompt:      #569cd6;    /* Azure blue */
    --pta-green:       #4ec9b0;    /* Terminal teal-green */
    --pta-yellow:      #dcdcaa;    /* Terminal yellow */
    --pta-orange:      #ce9178;    /* Tool args */
    --pta-red:         #f44747;
    --pta-cyan:        #9cdcfe;
    --pta-mono:        'Cascadia Code', 'Cascadia Mono', 'Fira Code', 'Consolas', 'Courier New', monospace;
    --pta-ui-font:     'Segoe UI', system-ui, sans-serif;
  }

  /* ── FAB — shown only when panel is closed ───────────────────────────────── */
  .pta-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px 8px 12px;
    background: var(--pta-bg2);
    color: var(--pta-prompt);
    border: 1px solid var(--pta-border);
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--pta-mono);
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    transition: background 0.12s, border-color 0.12s, color 0.12s;
    user-select: none;
  }
  .pta-fab:hover   { background: var(--pta-bg3); border-color: var(--pta-prompt); color: var(--pta-text-bright); }
  .pta-fab__icon   { font-size: 15px; font-weight: 700; letter-spacing: -0.03em; }
  .pta-fab__label  { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; }

  /* ── Side-panel wrapper — flex item, animates width ─────────────────────── */
  .pta-side-wrapper {
    width: 0;
    overflow: hidden;
    flex-shrink: 0;
    transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .pta-side-wrapper--open {
    width: 420px;
  }

  /* ── Panel — full-height flex column inside the wrapper ──────────────────── */
  .pta-panel {
    width: 420px;
    min-width: 420px;   /* prevents reflow while wrapper animates */
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--pta-bg);
    border-left: 1px solid var(--pta-border);
    overflow: hidden;
    font-family: var(--pta-mono);
    font-size: 13px;
    color: var(--pta-text);
  }

  /* ── Title bar ───────────────────────────────────────────────────────────── */
  .pta-titlebar {
    display: flex;
    align-items: center;
    gap: 0;
    height: 34px;
    background: var(--pta-bg2);
    border-bottom: 1px solid var(--pta-border);
    flex-shrink: 0;
    padding: 0 10px;
  }

  .pta-titlebar__controls {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: 12px;
  }
  .pta-dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    cursor: pointer;
    transition: opacity 0.12s;
  }
  .pta-dot:hover { opacity: 0.75; }
  .pta-dot--close { background: #ff5f57; }
  .pta-dot--min   { background: #febc2e; }
  .pta-dot--max   { background: #28c840; }

  .pta-titlebar__tab {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 14px;
    height: 100%;
    background: var(--pta-bg);
    border-right: 1px solid var(--pta-border);
    border-left: 1px solid var(--pta-border);
    color: var(--pta-text);
    font-size: 12px;
    font-family: var(--pta-ui-font);
    font-weight: 500;
  }
  .pta-titlebar__tab-icon {
    font-family: var(--pta-mono);
    color: var(--pta-prompt);
    font-size: 13px;
    font-weight: 700;
  }
  .pta-titlebar__tab-status {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--pta-text-dim);
    margin-left: 2px;
    transition: background 0.3s;
  }
  .pta-titlebar__tab-status--ready { background: var(--pta-green); }

  .pta-titlebar__actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  /* ── Toolbar buttons ─────────────────────────────────────────────────────── */
  .pta-tbtn {
    padding: 4px 10px;
    border-radius: 3px;
    font-size: 11px;
    font-family: var(--pta-ui-font);
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--pta-border-dim);
    background: transparent;
    color: var(--pta-text-dim);
    transition: background 0.1s, color 0.1s, border-color 0.1s;
    letter-spacing: 0.02em;
  }
  .pta-tbtn:hover:not(:disabled)        { background: var(--pta-bg3); color: var(--pta-text); border-color: var(--pta-border); }
  .pta-tbtn--confirm                     { color: var(--pta-green); border-color: var(--pta-green); }
  .pta-tbtn--confirm:hover:not(:disabled){ background: rgba(78,201,176,0.1); }
  .pta-tbtn--cancel                      { color: var(--pta-text-dim); }
  .pta-tbtn:disabled                     { opacity: 0.35; cursor: default; }

  /* ── Terminal output area ────────────────────────────────────────────────── */
  .pta-terminal {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    scroll-behavior: smooth;
    line-height: 1.55;
  }
  .pta-terminal::-webkit-scrollbar       { width: 5px; }
  .pta-terminal::-webkit-scrollbar-track { background: transparent; }
  .pta-terminal::-webkit-scrollbar-thumb { background: var(--pta-border); border-radius: 2px; }

  /* Welcome screen */
  .pta-welcome {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 10px;
  }
  .pta-welcome__banner    { font-size: 15px; font-weight: 700; color: var(--pta-prompt); letter-spacing: 0.04em; }
  .pta-welcome__meta      { font-size: 12px; color: var(--pta-text-dim); margin-top: 2px; }
  .pta-welcome__ok        { color: var(--pta-green); }
  .pta-welcome__err       { color: var(--pta-red); }
  .pta-welcome__rule      { color: var(--pta-border); font-size: 11px; margin: 6px 0 4px; letter-spacing: 0.02em; }
  .pta-welcome__hint      { font-size: 12.5px; color: var(--pta-text); }
  .pta-welcome__hint--dim { color: var(--pta-text-dim); font-size: 12px; }

  /* ── Lines ───────────────────────────────────────────────────────────────── */
  .pta-line {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 8px;
    min-height: 20px;
  }

  /* User command */
  .pta-line--cmd {
    margin-top: 10px;
    padding-top: 6px;
    border-top: 1px solid var(--pta-border-dim);
  }
  .pta-line--cmd:first-child { border-top: none; margin-top: 0; }
  .pta-line__cmd-text { color: var(--pta-text-bright); word-break: break-word; }

  /* Prompt glyph */
  .pta-prompt-glyph {
    color: var(--pta-prompt);
    font-size: 13px;
    flex-shrink: 0;
    user-select: none;
    margin-top: 1px;
    font-weight: 700;
  }

  /* Tool block */
  .pta-toolblock { display: flex; flex-direction: column; gap: 1px; margin: 4px 0; }
  .pta-line--tool { gap: 6px; font-size: 12px; }
  .pta-tool__badge {
    color: var(--pta-yellow);
    font-size: 11px;
    flex-shrink: 0;
    width: 16px;
    text-align: center;
    transition: color 0.2s;
  }
  .pta-tool__badge--done { color: var(--pta-green); }
  .pta-tool__name   { color: var(--pta-cyan); }
  .pta-tool__args   { color: var(--pta-orange); opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; }

  /* Thinking indicator */
  .pta-line--thinking { padding: 6px 0 4px; gap: 5px; align-items: center; }
  .pta-thinking-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--pta-text-dim);
    animation: pta-dot-pulse 1.4s ease-in-out infinite;
    flex-shrink: 0;
  }
  .pta-thinking-dot:nth-child(2) { animation-delay: 0.2s; }
  .pta-thinking-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes pta-dot-pulse {
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.75); background: var(--pta-text-dim); }
    40%           { opacity: 1;   transform: scale(1.1);  background: var(--pta-prompt); }
  }

  /* Output */
  .pta-line--output { flex-direction: column; padding-left: 0; margin: 4px 0 6px; }

  /* Error */
  .pta-line--error     { gap: 8px; font-size: 12.5px; }
  .pta-error-badge     { color: var(--pta-red); flex-shrink: 0; font-size: 11px; }
  .pta-error-text      { color: var(--pta-red); opacity: 0.85; }

  /* ── Markdown output ─────────────────────────────────────────────────────── */
  .pta-output-md { font-size: 13px; line-height: 1.65; color: var(--pta-text); word-break: break-word; max-width: 100%; }

  .pta-output-md :global(h2) {
    font-size: 14px; font-weight: 700; color: var(--pta-text-bright);
    margin: 14px 0 5px; padding-bottom: 3px;
    border-bottom: 1px solid var(--pta-border-dim);
    font-family: var(--pta-ui-font);
  }
  .pta-output-md :global(h3) {
    font-size: 12px; font-weight: 700; color: var(--pta-cyan);
    margin: 10px 0 4px; text-transform: uppercase; letter-spacing: 0.06em;
    font-family: var(--pta-ui-font);
  }
  .pta-output-md :global(p)  { margin: 0 0 6px; }
  .pta-output-md :global(ul), .pta-output-md :global(ol) { margin: 4px 0 6px; padding-left: 18px; }
  .pta-output-md :global(li) { margin-bottom: 2px; }
  .pta-output-md :global(hr) { border: none; border-top: 1px solid var(--pta-border-dim); margin: 10px 0; }
  .pta-output-md :global(code) {
    font-family: var(--pta-mono); font-size: 12px;
    background: var(--pta-bg3); padding: 1px 5px; border-radius: 3px; color: var(--pta-yellow);
  }
  .pta-output-md :global(pre)  {
    background: var(--pta-bg2); border: 1px solid var(--pta-border-dim);
    border-radius: 3px; padding: 10px 12px; overflow-x: auto; margin: 6px 0;
  }
  .pta-output-md :global(pre code) { background: none; padding: 0; color: var(--pta-text); }
  .pta-output-md :global(strong)   { color: var(--pta-text-bright); font-weight: 700; }
  .pta-output-md :global(blockquote) {
    border-left: 2px solid var(--pta-border); margin: 4px 0;
    padding: 3px 10px; color: var(--pta-text-dim); font-style: italic;
  }
  .pta-output-md :global(table) { width: 100%; border-collapse: collapse; font-size: 12px; margin: 6px 0; }
  .pta-output-md :global(th) { background: var(--pta-bg3); color: var(--pta-text-bright); padding: 5px 10px; text-align: left; font-weight: 600; border: 1px solid var(--pta-border-dim); }
  .pta-output-md :global(td) { padding: 4px 10px; border: 1px solid var(--pta-border-dim); vertical-align: top; }
  .pta-output-md :global(tr:nth-child(even) td) { background: rgba(255,255,255,0.02); }

  /* ── Input row ───────────────────────────────────────────────────────────── */
  .pta-input-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 14px 10px;
    background: var(--pta-bg);
    border-top: 1px solid var(--pta-border);
    flex-shrink: 0;
  }
  .pta-prompt-glyph--input {
    margin-top: 10px;
    font-size: 14px;
    transition: color 0.15s;
  }

  /* Input row greyed out while agent is generating */
  .pta-input-row--busy {
    opacity: 0.45;
    pointer-events: none;
  }
  .pta-input-row--busy .pta-prompt-glyph { color: var(--pta-text-dim); }

  .pta-input {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--pta-border-dim);
    border-radius: 0;
    padding: 8px 0;
    color: var(--pta-text-bright);
    font-family: var(--pta-mono);
    font-size: 13px;
    line-height: 1.5;
    resize: none;
    outline: none;
    transition: border-color 0.15s;
    caret-color: var(--pta-prompt);
  }
  .pta-input:focus        { border-bottom-color: var(--pta-prompt); }
  .pta-input::placeholder { color: var(--pta-text-dim); }
  .pta-input:disabled     { opacity: 0.4; cursor: default; }

  /* ── Status bar ──────────────────────────────────────────────────────────── */
  .pta-statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 14px;
    background: var(--pta-prompt);
    color: var(--pta-bg);
    font-size: 11px;
    font-family: var(--pta-ui-font);
    flex-shrink: 0;
  }
  .pta-status__left  { display: flex; align-items: center; gap: 5px; font-weight: 600; }
  .pta-status__right { opacity: 0.75; font-size: 10.5px; }
  .pta-status__dot   { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .pta-status__dot--ok  { background: var(--pta-bg); }
  .pta-status__dot--err { background: var(--pta-red); }

  /* ── Save modal ──────────────────────────────────────────────────────────── */
  .pta-overlay {
    position: fixed;
    inset: 0;
    z-index: 9100;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pta-fade 0.12s ease;
  }
  @keyframes pta-fade { from { opacity: 0; } to { opacity: 1; } }

  .pta-modal {
    background: var(--pta-bg);
    border: 1px solid var(--pta-border);
    border-radius: 6px;
    width: 360px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.7);
    font-family: var(--pta-mono);
    color: var(--pta-text);
  }
  .pta-modal__titlebar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    background: var(--pta-bg2);
    border-bottom: 1px solid var(--pta-border);
    font-size: 12px;
    font-family: var(--pta-ui-font);
  }
  .pta-modal__icon  { color: var(--pta-prompt); font-family: var(--pta-mono); font-weight: 700; }
  .pta-modal__title { color: var(--pta-text); }
  .pta-modal__body  { display: flex; flex-direction: column; gap: 12px; padding: 16px 14px; }
  .pta-modal__label { display: flex; flex-direction: column; gap: 4px; }
  .pta-modal__key   { font-size: 11px; color: var(--pta-cyan); letter-spacing: 0.04em; }
  .pta-modal__input,
  .pta-modal__select {
    background: var(--pta-bg3); border: 1px solid var(--pta-border-dim);
    border-radius: 3px; padding: 7px 10px;
    color: var(--pta-text-bright); font-family: var(--pta-mono); font-size: 13px; outline: none;
  }
  .pta-modal__input:focus,
  .pta-modal__select:focus { border-color: var(--pta-prompt); }
  .pta-modal__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 14px;
    background: var(--pta-bg2);
    border-top: 1px solid var(--pta-border);
  }
</style>
