<script>
  import { initWoff2, convertTtfToWoff2, readFileAsArrayBuffer, extractFontName, formatSize } from './lib/converter.js';
  import JSZip from 'jszip';

  // ---- State ----
  let woff2Ready = $state(false);
  let woff2Error = $state('');
  let files = $state([]);
  let activeDrag = $state(false);
  let previewFont = $state(null);
  let previewName = $state('');
  let previewBlobUrl = $state('');

  // Derived: files that are done (converted successfully)
  let convertedFiles = $derived(files.filter(f => f.status === 'done'));
  let hasConverted = $derived(convertedFiles.length > 0);
  let totalProgress = $derived(() => {
    if (files.length === 0) return 0;
    let sum = 0;
    for (const f of files) sum += f.progress;
    return Math.round(sum / files.length);
  });

  // ---- Init WASM on mount ----
  $effect(() => {
    initWoff2()
      .then(() => { woff2Ready = true; })
      .catch(err => { woff2Error = 'Impossibile inizializzare il modulo WOFF2. Ricarica la pagina.'; console.error(err); });
  });

  // ---- File handling ----
  function handleFiles(fileList) {
    for (const file of fileList) {
      if (!file.name.toLowerCase().endsWith('.ttf')) continue;
      // Avoid duplicates
      if (files.some(f => f.name === file.name && f.size === file.size)) continue;

      const id = crypto.randomUUID();
      const entry = {
        id,
        file,
        name: file.name,
        size: file.size,
        sizeFormatted: formatSize(file.size),
        fontName: file.name.replace(/\.ttf$/i, ''),
        status: 'pending', // pending | converting | done | error
        progress: 0,
        error: '',
        woff2Buffer: null,
        woff2Size: 0,
        woff2SizeFormatted: '',
      };
      files = [...files, entry];

      // Start conversion
      convertFile(entry);
    }
  }

  async function convertFile(entry) {
    entry.status = 'converting';
    entry.progress = 10;
    files = [...files]; // trigger reactivity

    try {
      const ttfBuffer = await readFileAsArrayBuffer(entry.file);
      entry.progress = 30;
      files = [...files];

      // Extract font name
      const fontName = extractFontName(ttfBuffer, entry.fontName);
      entry.fontName = fontName;

      entry.progress = 50;
      files = [...files];

      // Convert
      const woff2Buffer = convertTtfToWoff2(ttfBuffer);
      entry.progress = 90;
      entry.woff2Buffer = woff2Buffer;
      entry.woff2Size = woff2Buffer.byteLength;
      entry.woff2SizeFormatted = formatSize(woff2Buffer.byteLength);
      entry.status = 'done';
      entry.progress = 100;
      files = [...files];
    } catch (err) {
      entry.status = 'error';
      entry.error = err.message || 'Errore durante la conversione';
      entry.progress = 0;
      files = [...files];
    }
  }

  // ---- Preview ----
  function previewFile(entry) {
    if (!entry.woff2Buffer) return;
    // Revoke previous blob
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);

    const blob = new Blob([entry.woff2Buffer], { type: 'font/woff2' });
    previewBlobUrl = URL.createObjectURL(blob);
    previewFont = entry;
    previewName = entry.fontName;

    // Use FontFace to load preview
    const ff = new FontFace(`preview-${entry.id}`, `url(${previewBlobUrl})`);
    ff.load().then(f => {
      document.fonts.add(f);
    }).catch(() => {});
  }

  // ---- Download ----
  function downloadSingle(entry) {
    if (!entry.woff2Buffer) return;
    const blob = new Blob([entry.woff2Buffer], { type: 'font/woff2' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = entry.fontName.replace(/\s+/g, '-').toLowerCase() + '.woff2';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadZip() {
    if (convertedFiles.length === 0) return;
    const zip = new JSZip();
    for (const entry of convertedFiles) {
      const fname = entry.fontName.replace(/\s+/g, '-').toLowerCase() + '.woff2';
      zip.file(fname, entry.woff2Buffer);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'font-convertiti.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function removeFile(id) {
    if (previewFont?.id === id) {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
      previewFont = null;
      previewBlobUrl = '';
    }
    files = files.filter(f => f.id !== id);
  }

  function clearAll() {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    previewFont = null;
    previewBlobUrl = '';
    files = [];
  }

  // ---- Drag & drop ----
  function onDragOver(e) {
    e.preventDefault();
    activeDrag = true;
  }
  function onDragLeave(e) {
    e.preventDefault();
    activeDrag = false;
  }
  function onDrop(e) {
    e.preventDefault();
    activeDrag = false;
    if (e.dataTransfer?.files) {
      handleFiles(e.dataTransfer.files);
    }
  }
  function onFileInput(e) {
    if (e.target.files) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  }
</script>

<!-- ============ APP SHELL ============ -->
<div class="app" role="application" aria-label="Convertitore TTF a WOFF2">

  <!-- Header -->
  <header class="header">
    <p class="eyebrow">Strumento per il web</p>
    <h1>Converti i tuoi font<br />da <span class="ttf-badge">TTF</span> a <span class="woff2-badge">WOFF2</span></h1>
    <p class="subtitle">
      Trascina uno o più file TrueType. La conversione avviene interamente nel tuo browser —
      nessun file lascia il tuo computer.
    </p>
  </header>

  <main class="main">
    <!-- WASM loading / error -->
    {#if woff2Error}
      <div class="banner banner-error" role="alert">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>{woff2Error}</span>
      </div>
    {/if}

    {#if !woff2Ready && !woff2Error}
      <div class="banner banner-loading" role="status">
        <div class="spinner"></div>
        <span>Caricamento del motore di conversione WOFF2…</span>
      </div>
    {/if}

    <!-- Drop Zone -->
    <section class="dropzone-wrapper">
      <div
        class="dropzone"
        class:dropzone-active={activeDrag}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={onDrop}
        role="region"
        aria-label="Zona di trascinamento file TTF"
      >
        <!-- Glyph grid pattern (signature element) -->
        <div class="glyph-grid" aria-hidden="true">
          <span>a</span><span>g</span><span>R</span><span>f</span><span>k</span>
          <span>Q</span><span>w</span><span>z</span><span>M</span><span>&amp;</span>
          <span>t</span><span>B</span><span>e</span><span>@</span><span>p</span>
          <span>s</span><span>H</span><span>y</span><span>æ</span><span>3</span>
        </div>
        <div class="dropzone-content">
          <div class="drop-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <p class="drop-title">Trascina qui i tuoi file <code>.ttf</code></p>
          <p class="drop-hint">oppure</p>
          <label class="btn btn-primary" for="file-input">
            Sfoglia i file
            <input
              id="file-input"
              type="file"
              accept=".ttf"
              multiple
              onchange={onFileInput}
              class="sr-only"
            />
          </label>
        </div>
      </div>
    </section>

    <!-- Progress bar (global) -->
    {#if files.length > 0 && totalProgress() < 100}
      <div class="global-progress" role="progressbar" aria-valuenow={totalProgress()} aria-valuemin="0" aria-valuemax="100" aria-label="Progresso complessivo della conversione">
        <div class="global-progress-bar" style="width: {totalProgress()}%"></div>
        <span class="global-progress-label">{totalProgress()}%</span>
      </div>
    {/if}

    <!-- File List -->
    {#if files.length > 0}
      <section class="file-list" aria-label="Elenco file">
        <div class="file-list-header">
          <h2 class="file-list-title">{files.length} file {files.length === 1 ? 'caricato' : 'caricati'}</h2>
          {#if hasConverted}
            <button class="btn btn-download" onclick={downloadZip} type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Scarica ZIP ({convertedFiles.length} WOFF2)
            </button>
          {/if}
          <button class="btn btn-ghost" onclick={clearAll} type="button" aria-label="Rimuovi tutti i file">Cancella tutto</button>
        </div>

        <ul class="file-items">
          {#each files as entry (entry.id)}
            <li class="file-item" class:file-done={entry.status === 'done'} class:file-error={entry.status === 'error'} class:file-converting={entry.status === 'converting'}>
              <div class="file-info">
                <span class="file-icon" aria-hidden="true">
                  {#if entry.status === 'done'}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {:else if entry.status === 'error'}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  {:else if entry.status === 'converting'}
                    <div class="mini-spinner"></div>
                  {:else}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {/if}
                </span>
                <div class="file-details">
                  <span class="file-name">{entry.fontName}</span>
                  <span class="file-meta">
                    <code>{entry.sizeFormatted}</code>
                    {#if entry.status === 'done'}
                      <span class="file-meta-arrow">→</span>
                      <code class="file-woff2-size">{entry.woff2SizeFormatted}</code>
                      <span class="file-savings">({((1 - entry.woff2Size / entry.size) * 100).toFixed(0)}% più piccolo)</span>
                    {/if}
                    {#if entry.status === 'error'}
                      <span class="file-error-msg">{entry.error}</span>
                    {/if}
                  </span>
                </div>
              </div>
              <div class="file-actions">
                {#if entry.status === 'done'}
                  <button class="btn btn-sm btn-outline" onclick={() => previewFile(entry)} type="button" aria-label="Anteprima di {entry.fontName}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Anteprima
                  </button>
                  <button class="btn btn-sm btn-download" onclick={() => downloadSingle(entry)} type="button" aria-label="Scarica {entry.fontName} in WOFF2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    WOFF2
                  </button>
                {/if}
                <button class="btn btn-icon btn-ghost" onclick={() => removeFile(entry.id)} type="button" aria-label="Rimuovi {entry.fontName}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              {#if entry.status === 'converting'}
                <div class="file-progress" role="progressbar" aria-valuenow={entry.progress} aria-valuemin="0" aria-valuemax="100" aria-label="Conversione {entry.fontName}">
                  <div class="file-progress-bar" style="width: {entry.progress}%"></div>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- Preview -->
    {#if previewFont}
      <section class="preview-panel" aria-label="Anteprima font">
        <div class="preview-header">
          <h2 class="preview-title">Anteprima: <em>{previewName}</em></h2>
          <button class="btn btn-icon btn-ghost" onclick={() => { if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl); previewFont = null; previewBlobUrl = ''; }} type="button" aria-label="Chiudi anteprima">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="preview-specimen" style="font-family: 'preview-{previewFont.id}', serif">
          <p class="specimen-large">Aa</p>
          <p class="specimen-pangram">Pack my box with five dozen liquor jugs.</p>
          <p class="specimen-pangram-it">Sphinx of black quartz, judge my vow.</p>
          <p class="specimen-chars">0123456789 &amp;?!.,;: @#$%&amp;*() []{'{'}{'}'}«»</p>
          <div class="specimen-sizes">
            <span style="font-size: 12px;">12px</span>
            <span style="font-size: 18px;">18px</span>
            <span style="font-size: 24px;">24px</span>
            <span style="font-size: 36px;">36px</span>
            <span style="font-size: 48px;">48px</span>
          </div>
        </div>
      </section>
    {/if}
  </main>

  <!-- Footer -->
  <footer class="footer">
    <p>Tutte le conversioni avvengono nel browser. I tuoi file non vengono mai caricati su un server.</p>
  </footer>
</div>

<style>
  /* ========== DESIGN TOKENS ========== */
  :global(body) {
    background: #F8F6F1;
    color: #1E293B;
  }

  .app {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 16px 48px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  /* ========== TYPOGRAPHY ========== */
  h1, h2, .eyebrow {
    font-family: 'Fraunces', Georgia, 'Times New Roman', serif;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  h1 {
    font-size: clamp(1.75rem, 4vw, 2.375rem);
    line-height: 1.15;
    color: #1E293B;
  }

  .ttf-badge, .woff2-badge {
    display: inline-block;
    font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
    font-size: 0.75em;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    vertical-align: middle;
    position: relative;
    top: -1px;
  }
  .ttf-badge {
    background: #DBEAFE;
    color: #1E40AF;
  }
  .woff2-badge {
    background: #EDE9FE;
    color: #5B21B6;
  }

  .eyebrow {
    font-size: 0.8125rem;
    font-weight: 400;
    font-style: italic;
    color: #7C3AED;
    text-transform: none;
    letter-spacing: 0;
    margin-bottom: 4px;
  }

  .subtitle {
    font-size: 0.9375rem;
    color: #64748B;
    line-height: 1.6;
    margin-top: 8px;
    max-width: 52ch;
  }

  h2 {
    font-size: 1.125rem;
    font-weight: 600;
    color: #1E293B;
  }

  code {
    font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
    font-size: 0.8125rem;
    background: #F1F5F9;
    padding: 1px 6px;
    border-radius: 3px;
    color: #334155;
  }

  /* ========== HEADER ========== */
  .header {
    text-align: left;
    padding-top: 12px;
  }

  /* ========== BANNER ========== */
  .banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    border-radius: 10px;
    font-size: 0.875rem;
    line-height: 1.5;
  }
  .banner-error {
    background: #FEF2F2;
    color: #991B1B;
    border: 1px solid #FECACA;
  }
  .banner-loading {
    background: #F0F9FF;
    color: #0C4A6E;
    border: 1px solid #BAE6FD;
  }
  .spinner {
    width: 18px;
    height: 18px;
    border: 2.5px solid #BAE6FD;
    border-top-color: #0284C7;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ========== DROP ZONE ========== */
  .dropzone-wrapper { position: relative; }
  .dropzone {
    position: relative;
    border: 2px dashed #CBD5E1;
    border-radius: 14px;
    padding: 40px 24px;
    text-align: center;
    background: #FFFFFF;
    transition: border-color 0.2s, background 0.2s;
    overflow: hidden;
    cursor: pointer;
  }
  .dropzone:hover { border-color: #2563EB; background: #F8FAFC; }
  .dropzone-active {
    border-color: #2563EB;
    background: #EFF6FF;
    border-style: solid;
  }

  /* Glyph grid — signature element */
  .glyph-grid {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    grid-template-rows: repeat(4, 1fr);
    pointer-events: none;
    opacity: 0.06;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1;
    color: #2563EB;
    padding: 16px;
    justify-items: center;
    align-items: center;
  }

  .dropzone-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .drop-icon {
    color: #64748B;
    transition: color 0.2s;
  }
  .dropzone-active .drop-icon { color: #2563EB; }
  .drop-title {
    font-size: 1.0625rem;
    font-weight: 500;
    color: #1E293B;
  }
  .drop-title code {
    background: #F1F5F9;
    color: #2563EB;
    font-weight: 600;
    padding: 2px 8px;
  }
  .drop-hint {
    font-size: 0.8125rem;
    color: #94A3B8;
  }

  /* ========== BUTTONS ========== */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 0.875rem;
    font-weight: 500;
    padding: 10px 18px;
    border-radius: 8px;
    border: 1.5px solid transparent;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
    min-height: 44px;
    white-space: nowrap;
    text-decoration: none;
    line-height: 1.2;
  }
  .btn:focus-visible {
    outline: 2.5px solid #2563EB;
    outline-offset: 2px;
  }
  .btn-primary {
    background: #2563EB;
    color: #FFFFFF;
    border-color: #2563EB;
  }
  .btn-primary:hover { background: #1D4ED8; }
  .btn-primary:active { background: #1E40AF; }
  .btn-download {
    background: #059669;
    color: #FFFFFF;
    border-color: #059669;
  }
  .btn-download:hover { background: #047857; }
  .btn-ghost {
    background: transparent;
    color: #64748B;
    border-color: #E2E8F0;
  }
  .btn-ghost:hover { background: #F1F5F9; color: #475569; }
  .btn-outline {
    background: transparent;
    color: #2563EB;
    border-color: #2563EB;
  }
  .btn-outline:hover { background: #EFF6FF; }
  .btn-sm {
    padding: 6px 12px;
    font-size: 0.8125rem;
    min-height: 36px;
    border-radius: 6px;
  }
  .btn-icon {
    padding: 6px;
    min-height: 36px;
    min-width: 36px;
    justify-content: center;
    border-radius: 6px;
  }
  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
  }

  /* ========== GLOBAL PROGRESS ========== */
  .global-progress {
    position: relative;
    height: 6px;
    background: #E2E8F0;
    border-radius: 3px;
    overflow: hidden;
  }
  .global-progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #2563EB, #7C3AED);
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .global-progress-label {
    position: absolute;
    right: 0;
    top: -22px;
    font-size: 0.75rem;
    font-family: 'JetBrains Mono', monospace;
    color: #64748B;
  }

  /* ========== FILE LIST ========== */
  .file-list {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    overflow: hidden;
  }
  .file-list-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    border-bottom: 1px solid #F1F5F9;
    flex-wrap: wrap;
  }
  .file-list-title {
    margin-right: auto;
  }
  .file-items {
    list-style: none;
  }
  .file-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid #F8FAFC;
    transition: background 0.15s;
    flex-wrap: wrap;
  }
  .file-item:last-child { border-bottom: none; }
  .file-item:hover { background: #FAFBFC; }
  .file-done { background: #F0FDF4; }
  .file-error { background: #FFF5F5; }
  .file-info {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }
  .file-icon { flex-shrink: 0; margin-top: 2px; }
  .file-details { min-width: 0; flex: 1; }
  .file-name {
    font-weight: 500;
    font-size: 0.9375rem;
    color: #1E293B;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 0.8125rem;
    color: #64748B;
    margin-top: 2px;
  }
  .file-meta code { font-size: 0.75rem; }
  .file-meta-arrow { color: #94A3B8; }
  .file-woff2-size { color: #059669; background: #ECFDF5; }
  .file-savings {
    color: #059669;
    font-weight: 500;
    font-size: 0.75rem;
  }
  .file-error-msg {
    color: #EF4444;
    font-size: 0.8125rem;
  }
  .file-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .file-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: #E2E8F0;
  }
  .file-progress-bar {
    height: 100%;
    background: #2563EB;
    transition: width 0.25s ease;
  }
  .mini-spinner {
    width: 20px;
    height: 20px;
    border: 2.5px solid #E2E8F0;
    border-top-color: #2563EB;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  /* ========== PREVIEW ========== */
  .preview-panel {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    overflow: hidden;
  }
  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 18px;
    border-bottom: 1px solid #F1F5F9;
  }
  .preview-title {
    font-family: 'Inter', sans-serif;
    font-weight: 500;
    font-size: 1rem;
  }
  .preview-title em {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #2563EB;
  }
  .preview-specimen {
    padding: 24px 18px 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-x: auto;
  }
  .specimen-large {
    font-size: 4rem;
    line-height: 1;
    color: #1E293B;
    margin: 0;
  }
  .specimen-pangram {
    font-size: 1.125rem;
    line-height: 1.5;
    color: #334155;
    margin: 0;
  }
  .specimen-pangram-it {
    font-size: 1.125rem;
    line-height: 1.5;
    font-style: italic;
    color: #64748B;
    margin: 0;
  }
  .specimen-chars {
    font-size: 0.875rem;
    line-height: 1.6;
    color: #64748B;
    word-break: break-all;
    margin: 0;
    font-family: inherit;
  }
  .specimen-sizes {
    display: flex;
    align-items: baseline;
    gap: 16px;
    flex-wrap: wrap;
    color: #475569;
    padding-top: 8px;
    border-top: 1px solid #F1F5F9;
  }

  /* ========== FOOTER ========== */
  .footer {
    text-align: center;
    padding-top: 8px;
  }
  .footer p {
    font-size: 0.8125rem;
    color: #94A3B8;
  }

  /* ========== RESPONSIVE ========== */
  @media (max-width: 520px) {
    .app { padding: 16px 12px 32px; gap: 20px; }
    h1 { font-size: 1.5rem; }
    .dropzone { padding: 28px 16px; }
    .glyph-grid { font-size: 1.8rem; }
    .file-item { flex-direction: column; align-items: stretch; }
    .file-actions { justify-content: flex-start; }
    .file-list-header { flex-direction: column; align-items: flex-start; }
    .specimen-large { font-size: 2.5rem; }
  }

  /* ========== REDUCED MOTION ========== */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
