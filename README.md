# Tuttii Mini Editor

A browser-based mini music editor prototype — drag stem-agnostic song sections
into Vocal/Beats lanes, trim/reorder/duplicate clips, and export the
arrangement as WAV or MP3.

Originally built as a single self-contained HTML file (`tuttii-mini-editor.html`,
kept at the repo root for reference); this is that same app restructured into
a real Vite project. See `tuttii-editor-claude-code-guide.md` for the full
design spec and decision log.

## Status

- **Pass 1 (done):** scaffolded into Vite, restyled to match the production
  app screenshots, mobile layout fixed (timeline pinned, library scrolls
  independently, compacted so ~2 songs are visible on a phone screen).
  Since revisited with a deeper fidelity pass: pill chevrons, custom
  volume slider, redesigned inspector, and the library rebuilt as a real
  Songs/Vocals/Inst/Silence tab structure (tap a song to expose its
  sections in place, tab controls what previewing plays) — matching the
  production app's actual structure, not just its colors.
- **Pass 2 (real audio wired for 2 of 3 songs):** placeholder oscillator
  audio replaced with real stem playback for real songs, alongside the
  original two synth demo songs (Neon Drive, Afterglow), which are
  untouched and still fully synthesized. **Project settings are locked
  at BPM 120, Key G# major.**

  **Dual-buffer model (implemented):** each real song ships four WAV
  files — native vocal/instrumental (the song's own BPM/key, used for
  library preview) and matched vocal/instrumental (pre-rendered
  externally to the locked project BPM/key, used for anything placed
  on the timeline). No live time-stretching or pitch-shifting happens
  in the browser. A section's matched-timeline timestamps are derived
  from its native timestamps × (nativeBPM / 120) — measured once,
  against the native file only.
  - `SONGS[].isReal`, `.nativeBpm/.nativeKey`, `.stems.native/.matched`,
    and per-section `.nativeStart/.nativeEnd` (raw, user-supplied) plus
    derived `.durBars/.matchedStart/.matchedEnd` — all in `src/main.js`.
  - Lazy per-song preload (`preloadSongAudio`): fetch + `decodeAudioData`
    for all 4 stems, kicked off the first time a song's row is expanded
    in the library, cached on the song object. A `.lib-loading` state
    shows while decoding; sections aren't interactive until ready.
  - Library preview (tap a chip) plays a native-buffer slice at the
    song's real BPM/key. Dropping a section on the timeline tags the
    clip with `songId` + a `sourceStart/sourceEnd` offset into the
    matched buffer; `scheduleRealClip()` plays that slice via
    `AudioBufferSourceNode.start(at, offset, duration)`. Trimming a real
    clip's handles adjusts `sourceStart`/`sourceEnd` (anchoring the
    untouched edge), clamped to the matched buffer's actual length —
    so a trim can reveal more of the real stem on either side, same as
    the design called for. Playback resuming mid-clip (after a scrub)
    passes the correct offset into the buffer.
  - WAV export renders real clips into the offline mix same as before —
    `scheduleClip` transparently branches on `clip.songId`.

  **Song 1 — "Be With You" (Duke Dylan):** BPM 117, Key A major.
  13 sections. Audio in `public/audio/be-with-you/`. Working end-to-end
  (preview, drop, trim, playback, export) — verified with Playwright.

  **Song 2 — "Do You Remember" (waitwhat):** BPM 122, Key G# major.
  11 sections. Audio in `public/audio/do-you-remember/`. Working
  end-to-end — verified with Playwright.

  **Song 3:** not yet sent.

  **Stem format: MP3, not WAV.** Originally shipped as WAV specifically to
  avoid MP3 encoder lead-in silence breaking bar-accurate scheduling.
  Switched to 192kbps MP3 after empirically verifying (via ffmpeg +
  Playwright/Chromium `decodeAudioData` on the actual stem files, not
  just a short test clip) that decoded duration and native/matched
  ratios match the mathematically-derived scale factor to within
  0.0002s across full ~3-minute files — no meaningful drift. Cut total
  stem size from ~390MB to ~34MB (roughly 11x). **Caveat:** only
  verified in Chromium; Safari has a documented history of MP3 gapless
  decode quirks, so worth a spot-check on a real iPhone before final
  launch, though not blocking for internal review. Stem paths live at
  `public/audio/<song>/*.mp3`, mirrored (same content, git-deduped) at
  a top-level `audio/` for GitHub Pages' raw-tree serving — see below.

  **Preview deploy:** this branch is directly servable as a static
  site with no build step — `index.html` and the stem paths in
  `src/main.js` use plain relative paths (no leading slash), which
  browsers resolve against the page's own URL, so the exact same
  source works from the dev server, a normal root deploy, or a GitHub
  Pages project subpath. GitHub Pages needs either a public repo or a
  paid plan for a private one — the repo currently holds real licensed
  stems, so that's a call for Troy, not something to flip on
  unilaterally. Also: the Artifact preview link (used for quick visual
  iteration in chat) serves from a different origin than this repo, so
  it can't reach `/audio/...` at all — that channel is visual-only,
  not for hearing audio.

- **Pass 3 (optional):** split `src/main.js` into smaller modules.

## Develop

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
npm run preview
```
