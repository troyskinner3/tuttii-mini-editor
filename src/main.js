(function () {
  "use strict";

  // ---------- Timing model ----------
  // Everything positional (clip.position, clip.duration, playheadPos) is in BARS.
  // Bars convert to seconds only for audio scheduling, using the locked
  // project tempo -- every song's "matched" audio is pre-rendered to this
  // same BPM/key, so the whole timeline can share one BAR_SECONDS constant.
  const PROJECT_BPM = 120;
  const PROJECT_KEY = "G# maj";
  const BAR_SECONDS = (60 / PROJECT_BPM) * 4; // 4/4 time -> 2s per bar
  const BAR_PX = 28;
  const TOTAL_BARS = 32;
  const MIN_DUR_BARS = 1;

  // Resolves a stem path against wherever this build is actually being
  // served from (Vite's BASE_URL) rather than assuming the site's domain
  // root -- so the same build works unmodified from the local dev server,
  // a GitHub Pages project subpath, or a future production root domain.
  function audioUrl(path) { return import.meta.env.BASE_URL + path; }

  function barsToSeconds(b) { return b * BAR_SECONDS; }
  function barsToPx(b) { return b * BAR_PX; }
  function pxToBars(px) { return px / BAR_PX; }
  function snap(bars, step) { return Math.max(0, Math.round(bars / step) * step); }
  function roundStep(v, step) { return Math.round(v / step) * step; } // signed, no floor-at-zero

  // The single source of truth for position: always the running total of
  // everything before it in the track's order. Nothing ever sets .position
  // directly anymore — call this after any change to a track's order or
  // durations, and gaps/overlaps become structurally impossible.
  function layout(type) {
    let pos = 0;
    clips[type].forEach(c => { c.position = pos; pos += c.duration; });
  }

  // ---------- Song / section data ----------
  // Sections are stem-agnostic, matching the real app: a section carries a vocal root
  // pitch (for when it's dropped as a vocal) and works generically as a beat pattern
  // (for when it's dropped as beats). Which stem you get is decided entirely by which
  // lane it lands in, not by anything in this data.
  // Silence isn't tied to a song — it's a deliberate rest, droppable into
  // either lane just like a section, but it produces no audio.
  const SILENCE_OPTIONS = [
    { id: "sil-1", label: "Silence", durBars: 1, isSilence: true },
    { id: "sil-2", label: "Silence", durBars: 2, isSilence: true },
    { id: "sil-4", label: "Silence", durBars: 4, isSilence: true },
  ];

  const SONGS = [
    {
      id: "A", name: "Neon Drive", thumbColor: "linear-gradient(135deg, #4FD1E8, #A055D5)", thumbIcon: "🎵",
      sections: [
        { id: "A-1", label: "Intro 1",  durBars: 2, root: 349.23 },
        { id: "A-2", label: "Verse 1",  durBars: 4, root: 392.00 },
        { id: "A-3", label: "Chorus 1", durBars: 4, root: 440.00 },
      ],
    },
    {
      id: "B", name: "Afterglow", thumbColor: "linear-gradient(135deg, #E84BC6, #A055D5)", thumbIcon: "🎶",
      sections: [
        { id: "B-1", label: "Intro 1",  durBars: 2, root: 261.63 },
        { id: "B-2", label: "Verse 1",  durBars: 4, root: 293.66 },
        { id: "B-3", label: "Chorus 1", durBars: 4, root: 329.63 },
      ],
    },
    // Real audio: a continuous native-tempo stem pair for library preview,
    // plus a second pair already time/pitch-matched to the locked project
    // BPM/key for timeline playback. See the derivation pass just below --
    // durBars and the matched-timeline timestamps are both computed from
    // these native measurements, not stored separately.
    {
      id: "bwy", name: "Be With You", artist: "Duke Dylan",
      thumbColor: "linear-gradient(135deg, #FDBB2D, #FF6B6B)", thumbIcon: "🎧",
      isReal: true,
      nativeBpm: 117, nativeKey: "A maj",
      stems: {
        native: { vocal: audioUrl("audio/be-with-you/native-vocal.wav"), beats: audioUrl("audio/be-with-you/native-instrumental.wav") },
        matched: { vocal: audioUrl("audio/be-with-you/matched-vocal.wav"), beats: audioUrl("audio/be-with-you/matched-instrumental.wav") },
      },
      sections: [
        { id: "bwy-1",  label: "Intro 1",      nativeStart: 1.026,   nativeEnd: 17.436 },
        { id: "bwy-2",  label: "Verse 1",      nativeStart: 17.436,  nativeEnd: 33.846 },
        { id: "bwy-3",  label: "Pre-Chorus 1", nativeStart: 33.846,  nativeEnd: 42.051 },
        { id: "bwy-4",  label: "Chorus 1",     nativeStart: 42.051,  nativeEnd: 58.462 },
        { id: "bwy-5",  label: "Build 1",      nativeStart: 58.462,  nativeEnd: 74.872 },
        { id: "bwy-6",  label: "Drop 1",       nativeStart: 74.872,  nativeEnd: 91.282 },
        { id: "bwy-7",  label: "Verse 2",      nativeStart: 91.282,  nativeEnd: 107.692 },
        { id: "bwy-8",  label: "Pre-Chorus 2", nativeStart: 107.692, nativeEnd: 115.897 },
        { id: "bwy-9",  label: "Chorus 2",     nativeStart: 115.897, nativeEnd: 132.308 },
        { id: "bwy-10", label: "Build 2",      nativeStart: 132.308, nativeEnd: 148.718 },
        { id: "bwy-11", label: "Drop 2",       nativeStart: 148.718, nativeEnd: 165.128 },
        { id: "bwy-12", label: "Drop 3",       nativeStart: 165.128, nativeEnd: 181.538 },
        { id: "bwy-13", label: "Outro 1",      nativeStart: 181.538, nativeEnd: 197.949 },
      ],
      _audioState: "idle", _buffers: null, _loadPromise: null,
    },
    {
      id: "dyr", name: "Do You Remember", artist: "waitwhat",
      thumbColor: "linear-gradient(135deg, #4FD1E8, #E84BC6)", thumbIcon: "🌙",
      isReal: true,
      nativeBpm: 122, nativeKey: "G# maj",
      stems: {
        native: { vocal: audioUrl("audio/do-you-remember/native-vocal.wav"), beats: audioUrl("audio/do-you-remember/native-instrumental.wav") },
        matched: { vocal: audioUrl("audio/do-you-remember/matched-vocal.wav"), beats: audioUrl("audio/do-you-remember/matched-instrumental.wav") },
      },
      sections: [
        { id: "dyr-1",  label: "Intro 1",      nativeStart: 1.967,   nativeEnd: 5.902 },
        { id: "dyr-2",  label: "Verse 1",      nativeStart: 5.902,   nativeEnd: 21.639 },
        { id: "dyr-3",  label: "Pre-Chorus 1", nativeStart: 21.639,  nativeEnd: 37.377 },
        { id: "dyr-4",  label: "Chorus 1",     nativeStart: 37.377,  nativeEnd: 53.115 },
        { id: "dyr-5",  label: "Drop 1",       nativeStart: 53.115,  nativeEnd: 68.852 },
        { id: "dyr-6",  label: "Verse 2",      nativeStart: 68.852,  nativeEnd: 84.590 },
        { id: "dyr-7",  label: "Pre-Chorus 2", nativeStart: 84.590,  nativeEnd: 100.328 },
        { id: "dyr-8",  label: "Chorus 2",     nativeStart: 100.328, nativeEnd: 116.066 },
        { id: "dyr-9",  label: "Drop 2",       nativeStart: 116.066, nativeEnd: 131.803 },
        { id: "dyr-10", label: "Drop 3",       nativeStart: 131.803, nativeEnd: 147.541 },
        { id: "dyr-11", label: "Outro 1",      nativeStart: 147.541, nativeEnd: 151.475 },
      ],
      _audioState: "idle", _buffers: null, _loadPromise: null,
    },
  ];

  // A correct time-stretch preserves bar structure, so a real song's
  // section boundaries only ever need to be measured once, against its
  // native file -- durBars and the matched-timeline timestamps are both
  // derived here from that single measurement plus the tempo ratio.
  SONGS.forEach(song => {
    if (!song.isReal) return;
    const nativeBarSeconds = (60 / song.nativeBpm) * 4;
    const scale = song.nativeBpm / PROJECT_BPM;
    song.sections.forEach(sec => {
      sec.songId = song.id;
      sec.durBars = Math.round((sec.nativeEnd - sec.nativeStart) / nativeBarSeconds);
      sec.matchedStart = +(sec.nativeStart * scale).toFixed(3);
      sec.matchedEnd = +(sec.nativeEnd * scale).toFixed(3);
    });
  });

  // clip: {uid, track, label, songName, root, position(bars), duration(bars), volume}
  let clips = { vocal: [], beats: [] };
  let uidCounter = 1;
  let selectedUid = null;

  // Songs/Vocals/Inst all browse the same song -> section structure; only
  // the active tab changes what tapping a section previews (both stems /
  // vocal only / beats only). Dragging into a lane is unaffected by the
  // tab. Silence is a flat list, not part of the song browsing at all.
  let activeLibraryTab = "songs";
  // At most one song's sections are exposed at a time -- expanding a
  // different song collapses whichever one was open.
  let expandedSongId = null;

  let audioCtx = null;
  let audioUnlocked = false;
  let isPlaying = false;
  let playStartCtxTime = 0;
  let playStartBar = 0;
  let playheadBar = 0;
  let scheduledNodes = [];
  let rafId = null;

  let history = [];
  let historyIndex = -1;

  // ---------- DOM refs ----------
  const scrollArea = document.getElementById("scrollArea");
  const scrollInner = document.getElementById("scrollInner");
  const vocalRow = document.getElementById("vocalRow");
  const beatsRow = document.getElementById("beatsRow");
  const vocalLane = document.getElementById("vocalLane");
  const beatsLane = document.getElementById("beatsLane");
  const vocalEmpty = document.getElementById("vocalEmpty");
  const beatsEmpty = document.getElementById("beatsEmpty");
  const scrubLane = document.getElementById("scrubLane");
  const playhead = document.getElementById("playhead");
  const timeCur = document.getElementById("timeCur");
  const timeTotal = document.getElementById("timeTotal");
  const playBtn = document.getElementById("playBtn");
  const playIcon = document.getElementById("playIcon");
  const skipStartBtn = document.getElementById("skipStartBtn");
  const locateBtn = document.getElementById("locateBtn");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const resetBtn = document.getElementById("resetBtn");
  const inspector = document.getElementById("inspector");
  const closeInsp = document.getElementById("closeInsp");
  const duplicateClipBtn = document.getElementById("duplicateClip");
  const deleteClipBtn = document.getElementById("deleteClip");
  const volSlider = document.getElementById("volSlider");
  const volVal = document.getElementById("volVal");
  const songLibrary = document.getElementById("songLibrary");
  const libraryTabs = document.getElementById("libraryTabs");
  const exportWavBtn = document.getElementById("exportWavBtn");
  const exportMp3Btn = document.getElementById("exportMp3Btn");
  const errBanner = document.getElementById("errBanner");

  function showJsError(msg) {
    errBanner.textContent = "Something broke: " + msg + " — tap to dismiss.";
    errBanner.style.display = "block";
  }
  errBanner.addEventListener("click", () => { errBanner.style.display = "none"; });
  window.addEventListener("error", (e) => showJsError(e.message + " (line " + e.lineno + ")"));
  window.addEventListener("unhandledrejection", (e) => showJsError(String(e.reason)));

  const LABEL_W = 66;
  const contentWidth = barsToPx(TOTAL_BARS);
  scrollInner.style.width = (LABEL_W + contentWidth) + "px";
  [vocalLane, beatsLane, scrubLane].forEach(el => { el.style.width = contentWidth + "px"; });

  // Scrolls the timeline just enough to bring a clip fully into view, if it
  // isn't already — used after a drop or duplicate so a new clip landing
  // outside the visible area doesn't look like nothing happened.
  function scrollClipIntoView(clip) {
    const clipLeft = LABEL_W + barsToPx(clip.position);
    const clipRight = clipLeft + barsToPx(clip.duration);
    const viewLeft = scrollArea.scrollLeft;
    const viewRight = viewLeft + scrollArea.clientWidth;
    if (clipLeft >= viewLeft && clipRight <= viewRight) return; // already fully visible
    const target = clipRight > viewRight
      ? clipRight - scrollArea.clientWidth + 16
      : clipLeft - 16;
    scrollArea.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }

  // ---------- Build bar grid + ruler ----------
  for (let b = 0; b < TOTAL_BARS; b++) {
    [vocalLane, beatsLane].forEach(lane => {
      const gl = document.createElement("div");
      gl.className = "bar-line" + (b % 4 === 0 ? " major" : "");
      gl.style.left = barsToPx(b) + "px";
      lane.appendChild(gl);
    });
    if (b % 4 === 0) {
      const tick = document.createElement("div");
      tick.className = "scrub-tick";
      tick.style.left = barsToPx(b) + "px";
      tick.textContent = (b + 1);
      scrubLane.appendChild(tick);
    }
  }

  // The whole row is the scrub target — no need to hit the thin playhead line
  // exactly. Press anywhere in it and the playhead snaps to your finger, then
  // tracks it continuously as you drag, just like a normal seek bar.
  scrubLane.style.touchAction = "none";
  scrubLane.addEventListener("pointerdown", (e) => {
    const pointerId = e.pointerId;
    pause();
    document.body.style.touchAction = "none";

    function seekFromEvent(ev) {
      const rect = scrubLane.getBoundingClientRect();
      const bars = pxToBars(ev.clientX - rect.left);
      playheadBar = Math.max(0, Math.min(TOTAL_BARS, bars));
      updatePlayheadEl();
    }
    seekFromEvent(e);

    function onMove(ev) {
      if (ev.pointerId !== pointerId) return;
      ev.preventDefault();
      seekFromEvent(ev);
    }
    function onUp(ev) {
      if (ev.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.body.style.touchAction = "";
    }
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });

  // ---------- Library (tabbed: Songs / Vocals / Inst / Silence) ----------
  function previewModeForTab(tab) {
    return tab === "vocals" ? "vocal" : tab === "inst" ? "beats" : "both";
  }

  function renderLibrary() {
    if (previewChipEl) stopPreview(); // clear any preview tied to a chip we're about to remove
    songLibrary.innerHTML = "";

    if (activeLibraryTab === "silence") {
      const silHeader = document.createElement("div");
      silHeader.className = "song-header";
      silHeader.innerHTML = `
        <div class="song-thumb silence-thumb">🔇</div>
        <div class="song-info">
          <div class="song-title">Silence</div>
          <div class="song-sub">Add a deliberate pause</div>
        </div>
      `;
      songLibrary.appendChild(silHeader);

      const silRow = document.createElement("div");
      silRow.className = "chip-row";
      SILENCE_OPTIONS.forEach(sec => silRow.appendChild(makeChip(sec, "", "both", false)));
      songLibrary.appendChild(silRow);
      return;
    }

    const mode = previewModeForTab(activeLibraryTab);
    SONGS.forEach(song => {
      songLibrary.appendChild(
        song.id === expandedSongId ? buildExpandedSongRow(song, mode) : buildSongSummaryRow(song)
      );
    });
  }

  function buildSongSummaryRow(song) {
    const header = document.createElement("div");
    header.className = "song-header";
    header.innerHTML = `
      <div class="song-thumb" style="background:${song.thumbColor}">${song.thumbIcon}</div>
      <div class="song-info">
        <div class="song-title">${song.name}</div>
        <div class="song-sub">Tap to view sections</div>
      </div>
      <div class="song-meta">
        <div class="meta-line">${PROJECT_BPM} <span class="sep">·</span> ${PROJECT_KEY}</div>
        <div class="segments">${song.sections.length} segments</div>
      </div>
      <div class="song-check" title="Pre-matched, ready to drag">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <button class="song-expand-btn" title="View sections">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <div class="song-match-bar"></div>
    `;
    header.addEventListener("click", () => {
      expandedSongId = song.id;
      if (song.isReal && song._audioState !== "ready" && song._audioState !== "loading") {
        preloadSongAudio(song).finally(() => { if (expandedSongId === song.id) renderLibrary(); });
      }
      renderLibrary();
    });
    return header;
  }

  // Replaces the song's summary row in place with its sections -- not an
  // accordion insert below it. Only one song is ever expanded at a time;
  // the back button (or expanding a different song) collapses it again.
  function buildExpandedSongRow(song, mode) {
    const row = document.createElement("div");
    row.className = "chip-row";
    if (song.isReal && song._audioState !== "ready") {
      const loading = document.createElement("div");
      loading.className = "lib-loading";
      loading.textContent = song._audioState === "error"
        ? "Couldn't load audio for this song — tap back and try again."
        : "Loading audio…";
      row.appendChild(loading);
    } else {
      song.sections.forEach(sec => row.appendChild(makeChip(sec, song.name, mode, true)));
    }

    const back = document.createElement("button");
    back.className = "song-back-btn";
    back.title = "Back to " + song.name;
    back.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>`;
    back.addEventListener("click", () => {
      expandedSongId = null;
      renderLibrary();
    });
    row.appendChild(back);
    return row;
  }

  // A cheap deterministic hash so each section's decorative mini-waveform
  // looks distinct but never changes across re-renders.
  function seedFromId(id) {
    let s = 0;
    for (let i = 0; i < id.length; i++) s += id.charCodeAt(i);
    return s;
  }

  function miniWaveHtml(seed) {
    let html = '<div class="chip-wave">';
    for (let i = 0; i < 14; i++) {
      const h = 3 + Math.round(Math.abs(Math.sin(i * 1.7 + seed)) * 13);
      html += `<span style="height:${h}px"></span>`;
    }
    return html + "</div>";
  }

  // `compact` sections (revealed by expanding a song) show just a bar-count
  // badge + label + decorative waveform, matching the real app; the flat
  // Silence list keeps the fuller label/duration/preview-icon chip.
  function makeChip(sec, songName, mode, compact) {
    const chip = document.createElement("div");
    chip.className = "section-chip" + (compact ? " compact" : "");
    chip.style.touchAction = "none";
    if (compact) {
      chip.innerHTML = `<span class="chip-bars">${sec.durBars}</span><span class="label">${sec.label}</span>${miniWaveHtml(seedFromId(sec.id))}`;
    } else {
      const playIconHtml = sec.isSilence ? "" : `<span class="chip-play-icon">▶</span>`;
      chip.innerHTML = `<span class="label">${sec.label}</span>${songName ? `<span class="song">${songName}</span>` : ""}<span class="dur">${sec.durBars} bar${sec.durBars > 1 ? "s" : ""}</span>${playIconHtml}`;
    }
    chip.addEventListener("pointerdown", (e) => startChipDrag(e, sec, songName, chip, mode || "both"));
    return chip;
  }

  libraryTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".lib-tab");
    if (!btn || btn.classList.contains("active")) return;
    activeLibraryTab = btn.dataset.tab;
    libraryTabs.querySelectorAll(".lib-tab").forEach(b => b.classList.toggle("active", b === btn));
    renderLibrary();
  });

  // ---------- Drag-and-drop from library into timeline ----------
  // Sections carry no stem type of their own — whichever lane the chip is dropped
  // into (Vocal or Beats) decides which stem gets added. The ghost's color updates
  // live as you drag over each lane, previewing which stem you're about to place.
  function startChipDrag(e, sec, songName, chipEl, mode) {
    const startX = e.clientX, startY = e.clientY;
    const pointerId = e.pointerId;
    let dragging = false;
    let ghost = null;
    let hoverType = null;

    // Claim this touch fully, right away — don't wait for movement to decide.
    // Waiting and hoping the browser hands control back mid-gesture is exactly
    // the kind of handoff mobile Safari is unreliable about.
    document.body.style.touchAction = "none";
    const chipRow = e.currentTarget.closest(".chip-row");
    const startScrollLeft = chipRow ? chipRow.scrollLeft : 0;

    function positionGhost(x, y) {
      ghost.style.left = (x - ghost.offsetWidth / 2) + "px";
      ghost.style.top = (y - 30) + "px";
    }

    function updateHighlight(x, y) {
      [vocalLane, beatsLane].forEach(l => l.classList.remove("drop-valid"));
      const el = document.elementFromPoint(x, y);
      const lane = el && el.closest(".row-lane");
      const type = lane ? lane.dataset.track : null;
      if (type) lane.classList.add("drop-valid");
      if (type !== hoverType) {
        hoverType = type;
        ghost.classList.remove("vocal", "beats", "neutral");
        ghost.classList.add(hoverType || "neutral");
      }
    }

    function clearHighlight() {
      [vocalLane, beatsLane].forEach(l => l.classList.remove("drop-valid"));
    }

    function onMove(ev) {
      if (ev.pointerId !== pointerId) return;
      ev.preventDefault(); // safe unconditionally now — nothing native is relying on this gesture
      const dx = ev.clientX - startX, dy = ev.clientY - startY;

      if (!dragging) {
        if (startY - ev.clientY > 18) {
          dragging = true;
          ghost = document.createElement("div");
          ghost.className = "drag-ghost neutral";
          ghost.style.width = barsToPx(sec.durBars) + "px";
          ghost.innerHTML = `<div class="clip-name">${sec.label}</div><div class="clip-sub">${songName}</div>`;
          document.body.appendChild(ghost);
        } else {
          // Not lifted out yet — replicate the row's native horizontal scroll by hand,
          // since touch-action:none means the browser won't do it for us anymore.
          if (chipRow) chipRow.scrollLeft = startScrollLeft - dx;
          return;
        }
      }

      positionGhost(ev.clientX, ev.clientY);
      updateHighlight(ev.clientX, ev.clientY);
    }

    function onUp(ev) {
      if (ev.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.body.style.touchAction = "";
      clearHighlight();

      if (dragging) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const lane = el && el.closest(".row-lane");
        if (lane) {
          const type = lane.dataset.track;
          const rect = lane.getBoundingClientRect();
          const cursorBars = pxToBars(ev.clientX - rect.left);
          dropSectionAt(sec, type, songName, cursorBars);
        }
        if (ghost) ghost.remove();
      } else {
        // A tap with no meaningful movement — preview this section instead
        // of placing it. Silence has nothing to preview.
        if (!sec.isSilence) togglePreview(sec, chipEl, mode);
      }
    }

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }

  // Drops a new clip using cursor position (in bars) to decide placement:
  // - Dropped past the midpoint of an existing clip -> appended right after it.
  // - Dropped before the midpoint of an existing clip -> inserted before it,
  //   pushing that clip (and anything after it) forward by exactly enough bars.
  // - Dropped in open space -> placed centered under the cursor, snapped to grid.
  // A final left-to-right pass then closes any remaining overlaps that result.
  function dropSectionAt(sec, type, songName, cursorBars) {
    const clip = {
      uid: uidCounter++,
      track: type,
      label: sec.label,
      songName: songName,
      root: sec.root || 220,
      position: 0,
      duration: sec.durBars,
      volume: 1,
      isSilence: !!sec.isSilence,
    };
    // Real sections carry no synthesized pitch/pattern -- instead they point
    // at an offset range into the song's pre-rendered "matched" stem buffer
    // (already time/pitch-matched to the locked project BPM/key), which is
    // what actually gets scheduled for this clip everywhere on the timeline.
    if (sec.songId) {
      clip.songId = sec.songId;
      clip.sourceStart = sec.matchedStart;
      clip.sourceEnd = sec.matchedEnd;
    }

    const arr = clips[type];
    let insertIdx = arr.length; // default: append at the end
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (cursorBars < c.position + c.duration) {
        const midpoint = c.position + c.duration / 2;
        insertIdx = (cursorBars >= midpoint) ? i + 1 : i;
        break;
      }
    }

    arr.splice(insertIdx, 0, clip);
    layout(type);

    renderClips();
    selectClip(clip.uid);
    scrollClipIntoView(clip);
    commitHistory();
  }

  function createClip(sec, type, songName) {
    const clip = {
      uid: uidCounter++,
      track: type,
      label: sec.label,
      songName: songName,
      root: sec.root || 220,
      position: 0,
      duration: sec.durBars,
      volume: 1,
    };
    clips[type].push(clip);
    layout(type);
    renderClips();
    selectClip(clip.uid);
    commitHistory();
  }

  // ---------- Render clips ----------
  function renderClips() {
    vocalLane.querySelectorAll(".clip").forEach(el => el.remove());
    beatsLane.querySelectorAll(".clip").forEach(el => el.remove());
    vocalEmpty.style.display = clips.vocal.length ? "none" : "flex";
    beatsEmpty.style.display = clips.beats.length ? "none" : "flex";

    clips.vocal.forEach(c => vocalLane.appendChild(buildClipEl(c)));
    clips.beats.forEach(c => beatsLane.appendChild(buildClipEl(c)));

    const anyClips = clips.vocal.length > 0 || clips.beats.length > 0;
    exportWavBtn.disabled = !anyClips;
    exportMp3Btn.disabled = !anyClips;
    timeTotal.textContent = formatTime(barsToSeconds(timelineEndBars()));
  }

  function buildClipEl(clip) {
    const el = document.createElement("div");
    el.className = "clip " + clip.track + (clip.isSilence ? " silence" : "") + (clip.uid === selectedUid ? " selected" : "");
    el.style.left = barsToPx(clip.position) + "px";
    el.style.width = barsToPx(clip.duration) + "px";
    el.dataset.uid = clip.uid;

    let bodyHtml;
    if (clip.isSilence) {
      bodyHtml = `<div class="clip-name">Silence</div><div class="clip-sub">${clip.duration} bar${clip.duration > 1 ? "s" : ""}</div>`;
    } else {
      const widthPx = barsToPx(clip.duration);
      const barsCount = Math.max(5, Math.round(widthPx / 7));
      let waveHtml = '<div class="clip-wave">';
      for (let i = 0; i < barsCount; i++) {
        const h = 4 + Math.round(Math.abs(Math.sin(i * 1.7 + clip.uid)) * 20);
        waveHtml += `<span style="height:${h}px"></span>`;
      }
      waveHtml += "</div>";
      bodyHtml = `<div class="clip-name">${clip.label}</div><div class="clip-sub">${clip.songName}</div>${waveHtml}`;
    }

    el.innerHTML = `
      ${bodyHtml}
      <div class="handle left"></div>
      <div class="handle right"></div>
    `;

    el.addEventListener("pointerdown", (e) => {
      if (e.target.classList.contains("handle")) return;
      startClipMove(e, clip, el);
    });
    el.querySelector(".handle.left").addEventListener("pointerdown", (e) => startClipTrim(e, clip, el, "left"));
    el.querySelector(".handle.right").addEventListener("pointerdown", (e) => startClipTrim(e, clip, el, "right"));

    return el;
  }

  function startClipMove(e, clip, el) {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startCenterBars = clip.position + clip.duration / 2;
    let moved = false;
    let liveDx = 0;
    selectClip(clip.uid);

    function onMove(ev) {
      const dx = pxToBars(ev.clientX - startX);
      if (Math.abs(dx) > 0.05) moved = true;
      liveDx = dx;
      // Free visual drag only — the real array order (and therefore every
      // clip's actual position) is untouched until release, so nothing here
      // can produce a gap or overlap mid-gesture.
      el.style.left = barsToPx(clip.position + dx) + "px";
    }
    function onUp() {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      if (moved) {
        reorderClip(clip, startCenterBars + liveDx);
        commitHistory();
      } else {
        openInspector(clip.uid); // plain tap on an existing clip -> inspect it
      }
    }
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }

  // Figures out where a dragged clip's center point falls among its siblings
  // (laid out flush, as if the dragged clip weren't there) and splices it
  // into that slot. layout() then re-derives every position from scratch,
  // so the result is always gapless regardless of where exactly it was dropped.
  function reorderClip(clip, virtualCenterBars) {
    const type = clip.track;
    const arr = clips[type];
    const others = arr.filter(c => c !== clip);

    let pos = 0;
    const laidOut = others.map(c => {
      const item = { clip: c, position: pos, duration: c.duration };
      pos += c.duration;
      return item;
    });

    let targetIdx = laidOut.length; // default: last
    for (let i = 0; i < laidOut.length; i++) {
      const s = laidOut[i];
      if (virtualCenterBars < s.position + s.duration) {
        const midpoint = s.position + s.duration / 2;
        targetIdx = (virtualCenterBars >= midpoint) ? i + 1 : i;
        break;
      }
    }

    arr.splice(arr.indexOf(clip), 1);
    arr.splice(targetIdx, 0, clip);
    layout(type);
    renderClips();
    selectClip(clip.uid);
  }

  function startClipTrim(e, clip, el, side) {
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startDur = clip.duration;
    let finalDx = 0;
    selectClip(clip.uid);

    // Real clips are backed by a fixed-length buffer -- trimming past the
    // section's original bounds is allowed (up to the full stem), but not
    // past the buffer's actual start/end, so figure out how many bars of
    // headroom exist on whichever side is being dragged.
    const song = clip.songId ? SONGS.find(s => s.id === clip.songId) : null;
    const buf = song && song._buffers ? song._buffers.matched[clip.track] : null;
    let maxDurBars = Infinity;
    if (buf) {
      maxDurBars = side === "right"
        ? Math.floor((buf.duration - clip.sourceStart) / BAR_SECONDS)
        : Math.floor(clip.sourceEnd / BAR_SECONDS);
      maxDurBars = Math.max(MIN_DUR_BARS, maxDurBars);
    }

    function previewDuration() {
      const raw = side === "right"
        ? Math.max(MIN_DUR_BARS, roundStep(startDur + finalDx, 1))
        : Math.max(MIN_DUR_BARS, roundStep(startDur - finalDx, 1));
      return Math.min(raw, maxDurBars);
    }

    function onMove(ev) {
      finalDx = pxToBars(ev.clientX - startX);
      // The clip's start (its left edge) never moves for either handle —
      // only its width does. Dragging the left handle further left grows
      // the duration just like dragging the right handle further right
      // does; it's simply the mirrored direction. What's "backward" about
      // it is which part of the source stem gets revealed, not where the
      // clip sits on the timeline. Snapped to whole bars live, so it
      // notches into place as you drag rather than only on release.
      el.style.width = barsToPx(previewDuration()) + "px";
    }
    function onUp() {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);

      const type = clip.track;
      clip.duration = previewDuration();
      // Keep whichever edge wasn't dragged anchored in source-buffer time,
      // and derive the other edge from the new duration -- so extending a
      // handle reveals more of the real stem on that side, and shrinking
      // it gives that portion back, without ever touching the fixed edge.
      if (buf) {
        if (side === "right") clip.sourceEnd = clip.sourceStart + clip.duration * BAR_SECONDS;
        else clip.sourceStart = clip.sourceEnd - clip.duration * BAR_SECONDS;
      }
      // Same as the right handle: this clip's position is untouched, and
      // layout() pushes everything after it out to make room, guaranteeing
      // no overlap and no gap regardless of which handle changed the length.
      layout(type);

      renderClips();
      selectClip(clip.uid);
      commitHistory();
    }
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }

  // ---------- Selection / inspector ----------
  function findClip(uid) {
    return clips.vocal.find(c => c.uid === uid) || clips.beats.find(c => c.uid === uid);
  }

  function selectClip(uid) {
    selectedUid = uid;
    document.querySelectorAll(".clip").forEach(el => {
      el.classList.toggle("selected", Number(el.dataset.uid) === uid);
    });
  }

  // Opens the inspector panel — only called from a deliberate tap on an
  // already-placed clip, never automatically after a drop/move/trim. Those
  // actions still highlight the clip's border via selectClip(), but popping
  // the inspector open every time would repeatedly cover the library below
  // it (it floats as a fixed overlay) and block the next drag before the
  // user ever gets a chance to start it.
  function openInspector(uid) {
    selectClip(uid);
    const clip = findClip(uid);
    if (!clip) { inspector.classList.remove("show"); return; }
    volSlider.value = Math.round(clip.volume * 100);
    volVal.textContent = Math.round(clip.volume * 100) + "%";
    updateVolSliderFill();
    inspector.classList.add("show");
  }

  // Paints the filled (played) portion of the volume track up to the thumb,
  // matching the real app's solid-fill slider look instead of the browser's
  // flat default track.
  function updateVolSliderFill() {
    const pct = Number(volSlider.value);
    volSlider.style.background = `linear-gradient(to right, var(--pink) ${pct}%, var(--border) ${pct}%)`;
  }

  closeInsp.addEventListener("click", () => {
    selectedUid = null;
    document.querySelectorAll(".clip").forEach(el => el.classList.remove("selected"));
    inspector.classList.remove("show");
  });

  duplicateClipBtn.addEventListener("click", () => {
    if (selectedUid == null) return;
    const original = findClip(selectedUid);
    if (!original) return;
    const type = original.track;
    const arr = clips[type];
    const idx = arr.indexOf(original);
    const clone = { ...original, uid: uidCounter++ };
    arr.splice(idx + 1, 0, clone);
    layout(type);
    renderClips();
    openInspector(clone.uid);
    scrollClipIntoView(clone);
    commitHistory();
  });

  deleteClipBtn.addEventListener("click", () => {
    if (selectedUid == null) return;
    const original = findClip(selectedUid);
    const type = original ? original.track : null;
    ["vocal", "beats"].forEach(t => { clips[t] = clips[t].filter(c => c.uid !== selectedUid); });
    if (type) layout(type); // close the gap left behind, keep the track flush
    selectedUid = null;
    inspector.classList.remove("show");
    renderClips();
    commitHistory();
  });

  volSlider.addEventListener("input", () => {
    const clip = findClip(selectedUid);
    if (!clip) return;
    clip.volume = Number(volSlider.value) / 100;
    volVal.textContent = volSlider.value + "%";
    updateVolSliderFill();
  });
  volSlider.addEventListener("change", commitHistory);

  // ---------- Undo / redo ----------
  function snapshot() { return JSON.parse(JSON.stringify(clips)); }
  function commitHistory() {
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot());
    historyIndex++;
    updateHistoryButtons();
  }
  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    clips = JSON.parse(JSON.stringify(history[historyIndex]));
    renderClips();
    updateHistoryButtons();
  }
  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    clips = JSON.parse(JSON.stringify(history[historyIndex]));
    renderClips();
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    undoBtn.classList.toggle("disabled", historyIndex <= 0);
    redoBtn.classList.toggle("disabled", historyIndex >= history.length - 1);
  }
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);

  // Reset is itself a tracked history entry rather than a blocking confirm
  // dialog — if it was a mistake, Undo brings the arrangement right back.
  function resetArrangement() {
    stopPreview();
    pause();
    selectedUid = null;
    inspector.classList.remove("show");
    playheadBar = 0;

    const seedSec = SONGS[0].sections[0];
    const makeSeed = (type) => ({
      uid: uidCounter++, track: type, label: seedSec.label, songName: SONGS[0].name,
      root: seedSec.root, position: 0, duration: seedSec.durBars, volume: 1, isSilence: false,
    });
    clips.vocal = [makeSeed("vocal")];
    clips.beats = [makeSeed("beats")];
    layout("vocal");
    layout("beats");

    renderClips();
    updatePlayheadEl();
    commitHistory();
  }
  resetBtn.addEventListener("click", resetArrangement);

  // ---------- Audio synthesis ----------
  function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  // iOS/WKWebView unlock: must create + start a real buffer source inside a user gesture
  // before any subsequently-scheduled audio will be audible. Attempted silently in the
  // background (on first touch, and again on Play) — no visible UI for this in the real
  // product, so none here either. Audio itself isn't being worked on yet; this just gives
  // it its best shot without surfacing anything to the user.
  function unlockAudio() {
    const ctx = getCtx();
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (err) {
      return;
    }
    if (ctx.state === "suspended") {
      ctx.resume().then(() => { audioUnlocked = getCtx().state === "running"; }).catch(() => {});
    } else {
      audioUnlocked = ctx.state === "running";
    }
  }

  document.addEventListener("pointerdown", () => { if (!audioUnlocked) unlockAudio(); }, { once: true, passive: true });

  let noiseBufferCache = null;
  function noiseBuffer(ctx) {
    if (noiseBufferCache && noiseBufferCache.ctx === ctx) return noiseBufferCache.buf;
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    noiseBufferCache = { ctx, buf };
    return buf;
  }

  function scheduleClip(ctx, dest, clip, at, dur, offsetIntoClipSec) {
    if (clip.isSilence) return; // occupies time in the sequence, produces no sound
    if (clip.songId) { scheduleRealClip(ctx, dest, clip, at, dur, offsetIntoClipSec || 0); return; }
    if (clip.track === "vocal") scheduleVocal(ctx, dest, clip, at, dur);
    else scheduleBeats(ctx, dest, clip, at, dur);
  }

  // Plays a slice of the song's pre-rendered "matched" buffer for this
  // clip's track. clip.sourceStart/sourceEnd are offsets (seconds) into
  // that buffer, set when the section was dropped and adjusted by trimming;
  // offsetIntoClipSec additionally shifts the read point when playback
  // starts partway through the clip (e.g. the playhead was scrubbed into it).
  function scheduleRealClip(ctx, dest, clip, at, dur, offsetIntoClipSec) {
    const song = SONGS.find(s => s.id === clip.songId);
    const buf = song && song._buffers ? song._buffers.matched[clip.track] : null;
    if (!buf) return; // buffers not loaded (shouldn't happen -- clips only exist for loaded songs)
    const srcOffset = clip.sourceStart + offsetIntoClipSec;
    const playDur = Math.max(0, Math.min(dur, buf.duration - srcOffset));
    if (playDur <= 0) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = clip.volume;
    src.connect(gain).connect(dest);
    src.start(at, srcOffset, playDur);
    scheduledNodes.push(src);
  }

  function scheduleVocal(ctx, dest, clip, at, dur) {
    const cell = 0.5;
    const ratios = [1, 1.25, 1.5, 1.25];
    let t = 0, i = 0;
    while (t < dur) {
      const noteLen = Math.min(cell, dur - t);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = clip.root * ratios[i % ratios.length];
      const start = at + t;
      const peak = 0.2 * clip.volume;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.03);
      gain.gain.linearRampToValueAtTime(peak * 0.6, start + noteLen * 0.6);
      gain.gain.linearRampToValueAtTime(0, start + noteLen);
      osc.connect(gain).connect(dest);
      osc.start(start);
      osc.stop(start + noteLen + 0.02);
      scheduledNodes.push(osc);
      t += cell; i++;
    }
  }

  function scheduleBeats(ctx, dest, clip, at, dur) {
    const cell = 0.5;
    let t = 0;
    while (t < dur) {
      const start = at + t;
      const kOsc = ctx.createOscillator();
      const kGain = ctx.createGain();
      kOsc.type = "sine";
      kOsc.frequency.setValueAtTime(120, start);
      kOsc.frequency.exponentialRampToValueAtTime(45, start + 0.12);
      const peak = 0.35 * clip.volume;
      kGain.gain.setValueAtTime(peak, start);
      kGain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      kOsc.connect(kGain).connect(dest);
      kOsc.start(start);
      kOsc.stop(start + 0.18);
      scheduledNodes.push(kOsc);

      if (t + cell / 2 < dur) {
        const hatStart = start + cell / 2;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx);
        const hGain = ctx.createGain();
        const hPeak = 0.12 * clip.volume;
        hGain.gain.setValueAtTime(hPeak, hatStart);
        hGain.gain.exponentialRampToValueAtTime(0.001, hatStart + 0.05);
        src.connect(hGain).connect(dest);
        src.start(hatStart);
        src.stop(hatStart + 0.06);
        scheduledNodes.push(src);
      }
      t += cell;
    }
  }

  // ---------- Real-song audio loading ----------
  // Fetches + decodes one stem file into an AudioBuffer. Decoding doesn't
  // require the context to be running (unlock happens separately, on first
  // touch/Play), so this can safely start before any user gesture.
  function loadAudioBuffer(ctx, url) {
    return fetch(url)
      .then(res => {
        if (!res.ok) throw new Error("Couldn't fetch " + url);
        return res.arrayBuffer();
      })
      .then(ab => ctx.decodeAudioData(ab));
  }

  // Loads all four stems (native + matched, vocal + beats) for a real song,
  // once, lazily -- kicked off the first time its row is expanded in the
  // library, not eagerly for every song on page load. Cached on the song
  // object itself so re-expanding it is instant.
  function preloadSongAudio(song) {
    if (song._loadPromise) return song._loadPromise;
    song._audioState = "loading";
    const ctx = getCtx();
    song._loadPromise = Promise.all([
      loadAudioBuffer(ctx, song.stems.native.vocal),
      loadAudioBuffer(ctx, song.stems.native.beats),
      loadAudioBuffer(ctx, song.stems.matched.vocal),
      loadAudioBuffer(ctx, song.stems.matched.beats),
    ]).then(([nativeVocal, nativeBeats, matchedVocal, matchedBeats]) => {
      song._buffers = {
        native: { vocal: nativeVocal, beats: nativeBeats },
        matched: { vocal: matchedVocal, beats: matchedBeats },
      };
      song._audioState = "ready";
    }).catch(err => {
      song._audioState = "error";
      song._loadPromise = null; // allow retry
      showJsError("Couldn't load audio for " + song.name + ": " + err.message);
    });
    return song._loadPromise;
  }

  // Plays a slice of a song's native-tempo buffer directly at native pitch —
  // used only for library previews, so a section sounds like the real song
  // before it's matched to the project BPM/key.
  function scheduleNativeSlice(ctx, dest, buffer, sec, at, volume) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(dest);
    const dur = Math.max(0, Math.min(sec.nativeEnd - sec.nativeStart, buffer.duration - sec.nativeStart));
    if (dur <= 0) return;
    src.start(at, sec.nativeStart, dur);
    scheduledNodes.push(src);
  }

  // ---------- Section preview (tap a chip in the Preview Area) ----------
  // A section is stem-agnostic until it's actually dropped, so previewing it
  // plays both the vocal-style and beats-style synthesis together — the best
  // representation of "what this part of the song sounds like" before you've
  // committed it to a lane.
  let previewChipEl = null;
  let previewTimeoutId = null;

  function stopPreview() {
    if (previewChipEl) {
      previewChipEl.classList.remove("playing");
      const icon = previewChipEl.querySelector(".chip-play-icon");
      if (icon) icon.textContent = "▶";
    }
    previewChipEl = null;
    if (previewTimeoutId) { clearTimeout(previewTimeoutId); previewTimeoutId = null; }
    pause(); // also halts main timeline playback if it happened to be running
  }

  // mode: "both" (Songs tab -- reconstructs the full mix from both stems),
  // "vocal" (Vocals tab), or "beats" (Inst tab). Drag-and-drop into a lane
  // is unaffected by this -- only what tapping previews.
  function togglePreview(sec, chipEl, mode) {
    const wasThisOne = previewChipEl === chipEl;
    stopPreview();
    if (wasThisOne) return; // tapping the already-playing chip just stops it

    unlockAudio();
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const startAt = ctx.currentTime + 0.05;
    let durSec;
    if (sec.songId) {
      // Real section: play the song's own native-tempo/key buffers so the
      // preview sounds like the original, before any project matching.
      const song = SONGS.find(s => s.id === sec.songId);
      durSec = sec.nativeEnd - sec.nativeStart;
      if (song && song._buffers) {
        if (mode !== "beats") scheduleNativeSlice(ctx, ctx.destination, song._buffers.native.vocal, sec, startAt, 0.9);
        if (mode !== "vocal") scheduleNativeSlice(ctx, ctx.destination, song._buffers.native.beats, sec, startAt, 0.9);
      }
    } else {
      const fakeClip = { root: sec.root || 220, volume: 0.9 };
      durSec = barsToSeconds(sec.durBars);
      if (mode !== "beats") scheduleVocal(ctx, ctx.destination, fakeClip, startAt, durSec);
      if (mode !== "vocal") scheduleBeats(ctx, ctx.destination, fakeClip, startAt, durSec);
    }

    chipEl.classList.add("playing");
    const icon = chipEl.querySelector(".chip-play-icon");
    if (icon) icon.textContent = "⏸";
    previewChipEl = chipEl;
    previewTimeoutId = setTimeout(() => {
      if (previewChipEl === chipEl) stopPreview();
    }, durSec * 1000 + 80);
  }

  function timelineEndBars() {
    return Math.max(0.01, ...clips.vocal.map(c => c.position + c.duration), ...clips.beats.map(c => c.position + c.duration));
  }

  function formatTime(sec) {
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  // ---------- Transport ----------
  function stopAllNodes() {
    scheduledNodes.forEach(n => { try { n.stop(); } catch (e) {} });
    scheduledNodes = [];
  }

  async function play() {
    if (!audioUnlocked) unlockAudio();
    const ctx = getCtx();
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch (err) {}
    }
    stopAllNodes();
    const end = timelineEndBars();
    if (playheadBar >= end) playheadBar = 0;

    playStartCtxTime = ctx.currentTime + 0.06;
    playStartBar = playheadBar;

    [...clips.vocal, ...clips.beats].forEach(clip => {
      const clipEndBar = clip.position + clip.duration;
      if (clipEndBar <= playheadBar) return;
      const offsetIntoClipBars = Math.max(0, playheadBar - clip.position);
      const startDelaySec = Math.max(0, barsToSeconds(clip.position - playheadBar));
      const playDurSec = barsToSeconds(clip.duration - offsetIntoClipBars);
      scheduleClip(ctx, ctx.destination, clip, playStartCtxTime + startDelaySec, playDurSec, barsToSeconds(offsetIntoClipBars));
    });

    isPlaying = true;
    playIcon.innerHTML = '<rect x="6" y="5" width="4" height="14" rx="1" fill="white"></rect><rect x="14" y="5" width="4" height="14" rx="1" fill="white"></rect>';
    tick();
  }

  function pause() {
    isPlaying = false;
    stopAllNodes();
    playIcon.innerHTML = '<path d="M8 5v14l11-7z" fill="white"></path>';
    if (rafId) cancelAnimationFrame(rafId);
  }

  function seekTo(bar) {
    pause();
    playheadBar = bar;
    updatePlayheadEl();
  }

  function tick() {
    if (!isPlaying) return;
    const ctx = getCtx();
    const elapsedSec = ctx.currentTime - playStartCtxTime;
    playheadBar = playStartBar + Math.max(0, elapsedSec) / BAR_SECONDS;
    updatePlayheadEl();
    if (playheadBar >= timelineEndBars()) {
      pause();
      playheadBar = timelineEndBars();
      updatePlayheadEl();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function updatePlayheadEl() {
    // Offset by the sticky label column width so the playhead starts at the
    // beginning of the actual lane content, not the left edge of the screen.
    playhead.style.left = (LABEL_W + barsToPx(playheadBar)) + "px";
    timeCur.textContent = formatTime(barsToSeconds(playheadBar));
  }

  playBtn.addEventListener("click", () => { isPlaying ? pause() : play(); });
  skipStartBtn.addEventListener("click", () => seekTo(0));
  locateBtn.addEventListener("click", () => {
    const target = LABEL_W + barsToPx(playheadBar) - scrollArea.clientWidth / 2;
    scrollArea.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  });

  // ---------- Export ----------
  // Renders the full arrangement offline (not real-time) into a single AudioBuffer.
  // Both WAV and MP3 export start from this same buffer — only the encoding differs.
  async function renderArrangement() {
    const endBars = timelineEndBars();
    if (endBars <= 0.02) return null;
    const endSec = barsToSeconds(endBars);
    const sampleRate = 44100;
    const offline = new OfflineAudioContext(2, Math.ceil((endSec + 0.5) * sampleRate), sampleRate);

    [...clips.vocal, ...clips.beats].forEach(clip => {
      scheduleClip(offline, offline.destination, clip, barsToSeconds(clip.position) + 0.05, barsToSeconds(clip.duration));
    });

    return offline.startRendering();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function exportWav() {
    exportWavBtn.textContent = "Rendering…";
    exportWavBtn.disabled = true;
    try {
      const rendered = await renderArrangement();
      if (rendered) downloadBlob(audioBufferToWav(rendered), "tuttii-demo-mashup.wav");
    } catch (err) {
      console.error(err);
      alert("Export hit a snag in this browser preview — try again.");
    }
    exportWavBtn.textContent = "WAV";
    exportWavBtn.disabled = false;
  }

  // MP3 needs a real encoder — the browser has no built-in one, so this pulls in
  // lamejs (a small, well-established pure-JS encoder) from a CDN the first time
  // it's needed, rather than loading it unconditionally on every page load.
  let lamejsLoading = null;
  function loadLamejs() {
    if (window.lamejs) return Promise.resolve();
    if (lamejsLoading) return lamejsLoading;
    lamejsLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.0/lame.min.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Couldn't load the MP3 encoder — check your connection and try again."));
      document.head.appendChild(script);
    });
    return lamejsLoading;
  }

  function floatTo16BitPCM(floatArray) {
    const out = new Int16Array(floatArray.length);
    for (let i = 0; i < floatArray.length; i++) {
      const s = Math.max(-1, Math.min(1, floatArray[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out;
  }

  async function exportMp3() {
    exportMp3Btn.textContent = "Loading…";
    exportMp3Btn.disabled = true;
    try {
      await loadLamejs();
      exportMp3Btn.textContent = "Rendering…";
      const buffer = await renderArrangement();
      if (!buffer) { exportMp3Btn.textContent = "MP3"; exportMp3Btn.disabled = false; return; }

      const left = floatTo16BitPCM(buffer.getChannelData(0));
      const right = buffer.numberOfChannels > 1 ? floatTo16BitPCM(buffer.getChannelData(1)) : null;
      const encoder = new lamejs.Mp3Encoder(buffer.numberOfChannels, buffer.sampleRate, 128);
      const blockSize = 1152;
      const chunks = [];
      for (let i = 0; i < left.length; i += blockSize) {
        const leftChunk = left.subarray(i, i + blockSize);
        const buf = right
          ? encoder.encodeBuffer(leftChunk, right.subarray(i, i + blockSize))
          : encoder.encodeBuffer(leftChunk);
        if (buf.length > 0) chunks.push(buf);
      }
      const tail = encoder.flush();
      if (tail.length > 0) chunks.push(tail);

      downloadBlob(new Blob(chunks, { type: "audio/mp3" }), "tuttii-demo-mashup.mp3");
    } catch (err) {
      console.error(err);
      showJsError(err.message || "MP3 export failed — try again.");
    }
    exportMp3Btn.textContent = "MP3";
    exportMp3Btn.disabled = false;
  }

  function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataLength = buffer.length * blockAlign;
    const bufferOut = new ArrayBuffer(44 + dataLength);
    const view = new DataView(bufferOut);

    function writeString(offset, str) {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, "data");
    view.setUint32(40, dataLength, true);

    const channelData = [];
    for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = Math.max(-1, Math.min(1, channelData[ch][i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }
    return new Blob([bufferOut], { type: "audio/wav" });
  }

  exportWavBtn.addEventListener("click", exportWav);
  exportMp3Btn.addEventListener("click", exportMp3);

  // ---------- Init ----------
  renderLibrary();
  createClip(SONGS[0].sections[0], "vocal", SONGS[0].name);
  createClip(SONGS[0].sections[0], "beats", SONGS[0].name);
  selectedUid = null;
  document.querySelectorAll(".clip").forEach(el => el.classList.remove("selected"));
  inspector.classList.remove("show");
  updateVolSliderFill();
  updateHistoryButtons();
  updatePlayheadEl();

})();
