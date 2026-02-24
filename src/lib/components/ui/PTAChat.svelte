<!--
  PTAChat.svelte — Floating chat panel for the PTA (Pipeline Triage Agent)

  Environment variables (Vite):
    VITE_PTA_API_BASE         API base URL, e.g. http://pta-api.internal:8000
    VITE_PTA_API_KEY          API key (leave unset if PTA_API_KEY not set on server)
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { marked } from 'marked';

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

<!-- ── Floating button ─────────────────────────────────────────────────────── -->
<button class="pta-fab" class:pta-fab--open={isOpen} onclick={toggle} title="PTA — Pipeline Triage Agent">
  {#if isOpen}
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  {:else}
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  {/if}
  <span class="pta-fab__label">PTA</span>
</button>

<!-- ── Chat panel ─────────────────────────────────────────────────────────── -->
{#if isOpen}
<div class="pta-panel">

  <!-- Header -->
  <div class="pta-header">
    <div class="pta-header__left">
      <span class="pta-header__dot" class:pta-header__dot--ready={sessionId}></span>
      <span class="pta-header__title">Pipeline Triage Agent</span>
    </div>
    <div class="pta-header__actions">
      {#if lastResponse}
        <button class="pta-btn pta-btn--ghost" onclick={openSaveModal} title="Save RCA to Azure Storage">
          Save RCA
        </button>
      {/if}
      <button class="pta-btn pta-btn--ghost" onclick={newSession} title="Start a new session">
        New
      </button>
    </div>
  </div>

  <!-- Messages -->
  <div class="pta-messages" bind:this={messagesEl}>
    {#if messages.length === 0}
      <div class="pta-empty">
        <div class="pta-empty__icon">⚡</div>
        <div class="pta-empty__text">Ask about a pipeline failure</div>
        <div class="pta-empty__hint">e.g. "analyze why release 12345 failed"</div>
      </div>
    {/if}

    {#each messages as msg, i}
      <div class="pta-msg pta-msg--{msg.role}" class:pta-msg--error={msg.error}>

        {#if msg.role === 'user'}
          <div class="pta-msg__bubble">{msg.content}</div>

        {:else}
          <!-- Tool activity (shown above last assistant message while running) -->
          {#if i === messages.length - 1 && (isLoading || activeTools.length > 0)}
            <div class="pta-tools">
              {#each activeTools as tool}
                <div class="pta-tool" class:pta-tool--done={tool.done}>
                  <span class="pta-tool__icon">{tool.done ? '✓' : '⚡'}</span>
                  <span class="pta-tool__name">{tool.name}</span>
                  {#if !tool.done && tool.input}
                    <span class="pta-tool__input">{tool.input.slice(0, 60)}{tool.input.length > 60 ? '…' : ''}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <!-- Thinking dots (before first tool fires) -->
          {#if msg.thinking && activeTools.length === 0}
            <div class="pta-thinking"><span></span><span></span><span></span></div>
          {/if}

          <!-- Response -->
          {#if msg.content && !msg.error}
            <div class="pta-msg__markdown">{@html renderMarkdown(msg.content)}</div>
          {:else if msg.content && msg.error}
            <div class="pta-msg__bubble pta-msg__bubble--error">{msg.content}</div>
          {/if}
        {/if}

      </div>
    {/each}
  </div>

  <!-- Input -->
  <div class="pta-input-row">
    <textarea
      class="pta-input"
      bind:this={inputEl}
      bind:value={inputText}
      onkeydown={handleKeydown}
      placeholder="Ask about a pipeline failure…"
      rows={2}
      disabled={isLoading || !sessionId}
    ></textarea>
    <button
      class="pta-send"
      onclick={sendMessage}
      disabled={isLoading || !inputText.trim() || !sessionId}
      title="Send (Enter)"
    >
      {#if isLoading}
        <span class="pta-send__spinner"></span>
      {:else}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      {/if}
    </button>
  </div>

</div>
{/if}

<!-- ── Save RCA modal ─────────────────────────────────────────────────────── -->
{#if showSaveModal}
<div class="pta-overlay" role="dialog" aria-modal="true">
  <div class="pta-modal">
    <div class="pta-modal__header">Save RCA to Azure Storage</div>

    <label class="pta-modal__label">
      Type
      <select class="pta-modal__select" bind:value={saveType}>
        <option value="release">Release</option>
        <option value="build">Build</option>
      </select>
    </label>

    <label class="pta-modal__label">
      {saveType === 'release' ? 'Release ID' : 'Build ID'}
      <input
        class="pta-modal__input"
        bind:value={saveItemId}
        placeholder={saveType === 'release' ? '12345' : '67890'}
        type="text"
      />
    </label>

    {#if saveType === 'release'}
      <label class="pta-modal__label">
        Environment
        <input class="pta-modal__input" bind:value={saveEnv} placeholder="Production" type="text" />
      </label>
    {/if}

    <div class="pta-modal__actions">
      <button class="pta-btn pta-btn--ghost" onclick={() => showSaveModal = false}>Cancel</button>
      <button
        class="pta-btn pta-btn--primary"
        onclick={submitSave}
        disabled={!saveItemId.trim() || saveStatus === 'saving'}
      >
        {#if saveStatus === 'saving'}Saving…
        {:else if saveStatus === 'ok'}Saved ✓
        {:else if saveStatus === 'error'}Error — retry?
        {:else}Save
        {/if}
      </button>
    </div>
  </div>
</div>
{/if}

<style>
  /* ── CSS custom properties (all prefixed pta- to avoid collisions) ────────── */
  :root {
    --pta-bg:          #0f1117;
    --pta-bg2:         #161b26;
    --pta-bg3:         #1e2535;
    --pta-border:      #2a3040;
    --pta-accent:      #4f8ef7;
    --pta-accent2:     #3a6fd8;
    --pta-text:        #c9d1d9;
    --pta-text-dim:    #6e7681;
    --pta-text-bright: #e6edf3;
    --pta-green:       #3fb950;
    --pta-red:         #f85149;
    --pta-radius:      10px;
    --pta-font:        'Inter', 'Segoe UI', system-ui, sans-serif;
    --pta-mono:        'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  }

  /* ── FAB ─────────────────────────────────────────────────────────────────── */
  .pta-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px 10px 14px;
    background: var(--pta-accent);
    color: #fff;
    border: none;
    border-radius: 28px;
    cursor: pointer;
    font-family: var(--pta-font);
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 20px rgba(79, 142, 247, 0.35);
    transition: background 0.15s, transform 0.1s;
    user-select: none;
  }
  .pta-fab:hover  { background: var(--pta-accent2); transform: translateY(-1px); }
  .pta-fab:active { transform: translateY(0); }
  .pta-fab--open  { background: var(--pta-bg3); box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
  .pta-fab__label { letter-spacing: 0.04em; }

  /* ── Panel ───────────────────────────────────────────────────────────────── */
  .pta-panel {
    position: fixed;
    bottom: 84px;
    right: 24px;
    z-index: 8999;
    width: 520px;
    height: 680px;
    display: flex;
    flex-direction: column;
    background: var(--pta-bg);
    border: 1px solid var(--pta-border);
    border-radius: var(--pta-radius);
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    overflow: hidden;
    font-family: var(--pta-font);
    color: var(--pta-text);
    animation: pta-slide-up 0.18s ease-out;
  }
  @keyframes pta-slide-up {
    from { opacity: 0; transform: translateY(12px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .pta-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--pta-bg2);
    border-bottom: 1px solid var(--pta-border);
    flex-shrink: 0;
  }
  .pta-header__left   { display: flex; align-items: center; gap: 8px; }
  .pta-header__dot    { width: 8px; height: 8px; border-radius: 50%; background: var(--pta-text-dim); transition: background 0.3s; }
  .pta-header__dot--ready { background: var(--pta-green); }
  .pta-header__title  { font-size: 13px; font-weight: 600; color: var(--pta-text-bright); letter-spacing: 0.02em; }
  .pta-header__actions { display: flex; gap: 6px; }

  /* ── Buttons ─────────────────────────────────────────────────────────────── */
  .pta-btn {
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: background 0.12s;
  }
  .pta-btn--ghost   { background: transparent; color: var(--pta-text-dim); border: 1px solid var(--pta-border); }
  .pta-btn--ghost:hover { background: var(--pta-bg3); color: var(--pta-text); }
  .pta-btn--primary { background: var(--pta-accent); color: #fff; }
  .pta-btn--primary:hover:not(:disabled) { background: var(--pta-accent2); }
  .pta-btn:disabled { opacity: 0.45; cursor: default; }

  /* ── Messages ────────────────────────────────────────────────────────────── */
  .pta-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    scroll-behavior: smooth;
  }
  .pta-messages::-webkit-scrollbar       { width: 4px; }
  .pta-messages::-webkit-scrollbar-track { background: transparent; }
  .pta-messages::-webkit-scrollbar-thumb { background: var(--pta-border); border-radius: 2px; }

  .pta-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--pta-text-dim);
  }
  .pta-empty__icon { font-size: 28px; }
  .pta-empty__text { font-size: 14px; font-weight: 500; color: var(--pta-text); }
  .pta-empty__hint { font-size: 12px; }

  .pta-msg            { display: flex; flex-direction: column; }
  .pta-msg--user      { align-items: flex-end; }
  .pta-msg--assistant { align-items: flex-start; }

  .pta-msg__bubble {
    max-width: 88%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .pta-msg--user .pta-msg__bubble { background: var(--pta-accent); color: #fff; border-bottom-right-radius: 3px; }
  .pta-msg__bubble--error { background: rgba(248,81,73,0.12); color: var(--pta-red); border: 1px solid rgba(248,81,73,0.25); }

  /* ── Markdown ────────────────────────────────────────────────────────────── */
  .pta-msg__markdown { font-size: 13.5px; line-height: 1.65; color: var(--pta-text); max-width: 100%; word-break: break-word; }
  .pta-msg__markdown :global(h2) { font-size: 15px; font-weight: 700; color: var(--pta-text-bright); margin: 16px 0 6px; padding-bottom: 4px; border-bottom: 1px solid var(--pta-border); }
  .pta-msg__markdown :global(h3) { font-size: 13px; font-weight: 700; color: var(--pta-accent); margin: 12px 0 4px; text-transform: uppercase; letter-spacing: 0.06em; }
  .pta-msg__markdown :global(p)  { margin: 0 0 8px; }
  .pta-msg__markdown :global(ul), .pta-msg__markdown :global(ol) { margin: 4px 0 8px; padding-left: 18px; }
  .pta-msg__markdown :global(li) { margin-bottom: 3px; }
  .pta-msg__markdown :global(hr) { border: none; border-top: 1px solid var(--pta-border); margin: 14px 0; }
  .pta-msg__markdown :global(code) { font-family: var(--pta-mono); font-size: 12px; background: var(--pta-bg3); padding: 1px 5px; border-radius: 4px; color: #e2b96f; }
  .pta-msg__markdown :global(pre)  { background: var(--pta-bg2); border: 1px solid var(--pta-border); border-radius: 6px; padding: 10px 12px; overflow-x: auto; margin: 8px 0; }
  .pta-msg__markdown :global(pre code) { background: none; padding: 0; color: var(--pta-text); }
  .pta-msg__markdown :global(strong) { color: var(--pta-text-bright); font-weight: 700; }
  .pta-msg__markdown :global(blockquote) { border-left: 3px solid var(--pta-border); margin: 6px 0; padding: 4px 12px; color: var(--pta-text-dim); font-style: italic; }
  .pta-msg__markdown :global(table) { width: 100%; border-collapse: collapse; font-size: 12.5px; margin: 8px 0; }
  .pta-msg__markdown :global(th) { background: var(--pta-bg3); color: var(--pta-text-bright); padding: 6px 10px; text-align: left; font-weight: 600; border: 1px solid var(--pta-border); }
  .pta-msg__markdown :global(td) { padding: 5px 10px; border: 1px solid var(--pta-border); vertical-align: top; }
  .pta-msg__markdown :global(tr:nth-child(even) td) { background: rgba(255,255,255,0.02); }

  /* ── Tool activity ───────────────────────────────────────────────────────── */
  .pta-tools { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; width: 100%; }
  .pta-tool  { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--pta-text-dim); transition: color 0.2s; }
  .pta-tool--done  { color: var(--pta-green); }
  .pta-tool__icon  { width: 14px; text-align: center; }
  .pta-tool__name  { font-family: var(--pta-mono); color: inherit; }
  .pta-tool__input { color: var(--pta-text-dim); opacity: 0.6; font-family: var(--pta-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }

  /* ── Thinking dots ───────────────────────────────────────────────────────── */
  .pta-thinking { display: flex; gap: 5px; padding: 10px 0 4px; }
  .pta-thinking span { width: 7px; height: 7px; background: var(--pta-text-dim); border-radius: 50%; animation: pta-bounce 1.2s ease-in-out infinite; }
  .pta-thinking span:nth-child(2) { animation-delay: 0.2s; }
  .pta-thinking span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes pta-bounce {
    0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
    40%           { transform: scale(1.0); opacity: 1;   }
  }

  /* ── Input row ───────────────────────────────────────────────────────────── */
  .pta-input-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 12px 12px;
    background: var(--pta-bg2);
    border-top: 1px solid var(--pta-border);
    flex-shrink: 0;
  }
  .pta-input {
    flex: 1;
    background: var(--pta-bg3);
    border: 1px solid var(--pta-border);
    border-radius: 8px;
    padding: 10px 12px;
    color: var(--pta-text);
    font-family: var(--pta-font);
    font-size: 13.5px;
    line-height: 1.4;
    resize: none;
    outline: none;
    transition: border-color 0.15s;
  }
  .pta-input:focus        { border-color: var(--pta-accent); }
  .pta-input::placeholder { color: var(--pta-text-dim); }
  .pta-input:disabled     { opacity: 0.5; cursor: default; }

  .pta-send {
    width: 40px; height: 40px;
    border-radius: 8px;
    background: var(--pta-accent);
    color: #fff;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.12s, transform 0.1s;
  }
  .pta-send:hover:not(:disabled) { background: var(--pta-accent2); transform: translateY(-1px); }
  .pta-send:disabled { opacity: 0.4; cursor: default; transform: none; }
  .pta-send__spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: pta-spin 0.7s linear infinite; }
  @keyframes pta-spin { to { transform: rotate(360deg); } }

  /* ── Save modal ──────────────────────────────────────────────────────────── */
  .pta-overlay {
    position: fixed;
    inset: 0;
    z-index: 9100;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pta-fade 0.15s ease;
  }
  @keyframes pta-fade { from { opacity: 0; } to { opacity: 1; } }

  .pta-modal {
    background: var(--pta-bg2);
    border: 1px solid var(--pta-border);
    border-radius: var(--pta-radius);
    padding: 24px;
    width: 340px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
    font-family: var(--pta-font);
    color: var(--pta-text);
  }
  .pta-modal__header { font-size: 15px; font-weight: 700; color: var(--pta-text-bright); }
  .pta-modal__label  { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: var(--pta-text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
  .pta-modal__input,
  .pta-modal__select { background: var(--pta-bg3); border: 1px solid var(--pta-border); border-radius: 6px; padding: 8px 10px; color: var(--pta-text); font-family: var(--pta-font); font-size: 13.5px; outline: none; }
  .pta-modal__input:focus,
  .pta-modal__select:focus { border-color: var(--pta-accent); }
  .pta-modal__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
</style>
