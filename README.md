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
- **Pass 2 (in progress):** swap the placeholder oscillator audio for real
  stem playback. Data model decided: one vocal stem + one instrumental
  stem per song (WAV, not MP3 — avoids MP3 encoder lead-in silence, which
  would break bar-accurate scheduling), plus a shared per-song sections
  list used for both lanes. Trim can pull into the full stem length on
  either edge (not bounded to neighboring sections). BPM/Key stay
  locked in the toolbar — the app itself still does zero live
  time-stretching or pitch-shifting.

  **Preview-vs-timeline audio (new decision):** each song's library
  preview should sound like its own native BPM/key, while placing a
  section on the timeline should sound matched to the project's locked
  BPM/key — so users can hear the "before/after" of Tuttii's matching.
  Achieved with **two pre-rendered exports per stem** (native + already
  matched-to-project), not live DSP: preview plays the native buffer,
  the timeline plays the matched buffer. Section timestamps only need
  to be measured once, against the native file — matched-version
  timestamps are derived from bar counts × the project's bar length,
  since a correct time-stretch preserves bar structure. This roughly
  doubles the stem files needed per song (native pair + matched pair)
  but adds no real engineering risk.

  **Song 1 — "Be With You" (Duke Dylan):**
  - Native: BPM 117, **Key: A major** (confirmed).
  - Section timestamps: received and verified against the native file
    (all sections divide into clean 4- or 8-bar lengths at 117 BPM).
  - **Project BPM likely 120** (not finalized). **Project key: TBD**,
    depends on songs 2 & 3.
  - **Audio files: not yet received** (now need native + matched pairs
    per the decision above). Hand-off is via Google Drive (GitHub's
    browser uploader caps at 25MB; stems run ~36.7MB each).
  - Not yet built: the `src/data/songs/*.json` schema (now needs native
    + matched stem paths per song), `src/audio/engine.js` (preload +
    real `AudioBufferSourceNode` playback, dual-buffer aware), or the
    swap in `scheduleVocal()`/`scheduleBeats()`. Waiting on the audio
    files before starting, since it needs real files to test against.

  **Songs 2 & 3:** not yet sent (user is preparing them alongside song 1;
  project key depends on what they turn out to be).

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
