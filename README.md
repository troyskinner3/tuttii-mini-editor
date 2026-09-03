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
  Switched to MP3 after empirically verifying (via ffmpeg +
  Playwright/Chromium `decodeAudioData` on the actual stem files, not
  just a short test clip) that decoded duration and native/matched
  ratios match the mathematically-derived scale factor to within
  0.0002s across full ~3-minute files — no meaningful drift. **Caveat:**
  only verified in Chromium; Safari has a documented history of MP3
  gapless decode quirks, so worth a spot-check on a real iPhone before
  final launch, though not blocking for internal review.

  **Loading model — per-section preview slices.** Preloading the whole
  native stem pair per song (even after switching to MP3) still meant
  several MB before any section could be previewed — measured ~58s to
  ready on a throttled ~1.5Mbps connection. Since library preview always
  plays a section's exact, never-trimmed window, there was never a real
  reason to need the whole song for it: each section is now pre-sliced
  (at build time, from the original masters) into its own tiny MP3 —
  `public/audio/<song>/sections/<sectionId>-<vocal|beats>.mp3`, a few
  hundred KB — fetched and decoded lazily, only on first tap of that
  chip. Measured result on the same throttled connection: ~2.8s for the
  longest section, ~280ms on a normal connection. The matched (timeline)
  pair is unchanged — one whole-file pair per song at 128kbps
  (`<song>/matched-{vocal,beats}.mp3`), still lazy-loaded on first drop,
  since trimming can extend a clip into the full matched stem. Total
  repo audio: ~22MB (down from ~390MB as WAV). All of it is mirrored
  (same content, git-deduped so no extra data) at a top-level `audio/`
  for GitHub Pages' raw-tree serving — see below.

  **Playback pauses on edit.** Editing the timeline (drop, move, trim,
  duplicate, delete, volume, undo, redo) while playback is running used
  to leave audio playing against a stale snapshot of the timeline, out
  of sync with what's now on screen. Live-updating in-progress playback
  to match was the other option; pausing (via a single `pause()` call
  inside `commitHistory()`, `undo()`, and `redo()`) was simpler and
  avoids the whole bug class.

  **Mobile audio (resolved, real device confirmed).** iPhone Chrome
  (WebKit under the hood, same audio rules as Safari) produced no sound
  at all, from the very first load, no error banner. Diagnosed with a
  temporary on-screen debug readout showing the live `AudioContext`
  state directly off the real device (since none of this is
  reproducible in Chromium/Playwright — WebKit-specific behavior).
  Turned out to be two separate, real bugs, both now fixed and confirmed
  working on-device:
  - `togglePreview()` fired `ctx.resume()` without awaiting it before
    scheduling (unlike `play()`, which already did this correctly) —
    could schedule nodes on a context not yet actually running.
    `ensureAudioReady()` now centralizes this for both call sites, and
    also recreates the context outright after it comes back "zombified"
    from being backgrounded (resume() claims success, but the clock
    never actually resumes) rather than trusting resume() to work.
  - The real, deeper cause of total silence: a raw `AudioContext`'s
    default output is "ambient" audio on iOS, which the ring/silent
    switch is allowed to mute outright — confirmed via the debug
    readout showing a healthy running context, a genuinely scheduled
    node, and decoded buffers carrying real (non-silent, peak ~0.3-1.0)
    samples, yet still nothing audible. Real `<audio>`/`<video>`
    playback isn't subject to that. First fix (routing the whole graph
    through a `MediaStreamAudioDestinationNode` into an `<audio>`
    element) produced real sound but glitched/stuttered consistently —
    a known WebKit instability with that combination. Final fix:
    `ensureSilentLoop()` leaves the main graph on `ctx.destination`
    entirely untouched, and separately loops a tiny silent WAV through
    an independent `<audio src>` element purely to claim the page's
    audio session as "playback" category — iOS applies that page-wide,
    not per-source, so the main graph benefits without its signal path
    ever touching the fragile bridge.
  - Also stops iOS's native text-selection UI (the blue circle-handle)
    from hijacking drags on `.clip`/`.section-chip`/`.handle` —
    `touch-action: none` alone doesn't block that; needs
    `-webkit-touch-callout: none` + `user-select: none` too.

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

  **Real waveforms on placed clips.** `computeWaveformBars()` samples real
  per-bin peak amplitude from a clip's actual range of its song's matched
  buffer, so a quiet or silent stretch in a vocal genuinely shows as
  low/flat bars — not the old decorative sine pattern (still used as a
  brief placeholder before a freshly-dropped clip's matched audio finishes
  loading). Scoped to the timeline only, not library preview chips, since
  those load lazily per-tap and prefetching every section's audio just for
  thumbnails would undo the near-instant preview fix above.

  **Scroll vs. reorder on filled lanes.** Once clips fill a lane, a swipe
  meant to scroll the timeline was getting caught as a clip-reorder drag —
  both are horizontal gestures on `.clip`, with no axis to tell them apart
  (unlike the library's chip-row drag-out, which uses a vertical lift for
  exactly this reason). Fixed with a brief hold (160ms) that "commits" a
  press to a reorder; moving more than a few px before that elapses commits
  it to a scroll instead, replicated by hand via `scrollArea.scrollLeft`
  since `touch-action: none` (needed for the reorder drag itself) means
  native scrolling was never going to kick in regardless.

  **Pinch-to-zoom on the mobile timeline.** Two-finger pinch inside
  `#scrollArea` rescales `BAR_PX` (pixels per bar) between 0.5x and 2x of
  its base value, so clips shrink/grow accordingly; desktop is untouched —
  the whole feature is gated on `e.pointerType === "touch"`. `BAR_PX` went
  from a `const` to a `let`; zooming tears down and rebuilds the bar grid
  (`buildTimelineGrid()`) and re-renders clips/playhead against the new
  scale, then adjusts `scrollLeft` to keep the pinch midpoint anchored to
  the same bar on screen rather than snapping to the left edge. The one
  real complication: a pinch's first finger can already be mid-gesture
  (dragging a clip, trimming a handle, scrubbing) by the time the second
  finger lands. Each of those three gesture-starters now registers a
  `cancelActiveGesture` callback that a second touchdown calls once —
  detaching the in-progress gesture's listeners and re-rendering from the
  untouched clip data, without committing whatever move/trim/seek was
  underway — before pinch tracking takes over. Verified with real
  multi-touch simulation (CDP `Input.dispatchTouchEvent`, since Playwright's
  regular mouse/touchscreen APIs can't drive two independent touch points):
  pinch-out clamps to 2x, pinch-in clamps to 0.5x, and every other timeline
  gesture (tap-to-inspect, drag-to-reorder, trim, scrub) still works
  correctly after zooming.

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
