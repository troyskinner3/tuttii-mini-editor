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
  app screenshots (visual only, structure unchanged), mobile layout fixed
  (timeline pinned, library scrolls independently, compacted so ~2 songs
  are visible on a phone screen).
- **Pass 2 (in progress):** swap the placeholder oscillator audio for real
  stem playback. Data model decided: one vocal stem + one instrumental
  stem per song (WAV, not MP3 — avoids MP3 encoder lead-in silence, which
  would break bar-accurate scheduling), plus a shared per-song sections
  list (`startSec`/`endSec`) used for both lanes. Trim can pull into the
  full stem length on either edge (not bounded to neighboring sections).
  BPM/Key stay locked — the source audio must already be pre-matched to a
  single common BPM/key before export; the app does no time-stretching or
  pitch-shifting.

  **Song 1 — "Be With You" (Duke Dylan), BPM 117:**
  - Section timestamps: received and verified (all sections divide into
    clean 4- or 8-bar lengths at 117 BPM — format is minutes:seconds:ms).
  - **Key: still needed** — user will provide.
  - **Audio files: not yet received.** GitHub's browser uploader caps at
    25MB and the stems are ~36.7MB each; agreed to switch to Google
    Drive instead (already connected in this session) rather than a git
    command-line workaround.
  - Not yet built: the `src/data/songs/*.json` schema, `src/audio/engine.js`
    (preload + real `AudioBufferSourceNode` playback), or the swap in
    `scheduleVocal()`/`scheduleBeats()`. Waiting on the audio files before
    starting this, since it needs real files to test against.

  **Songs 2 & 3:** not yet sent (user is preparing song 2 alongside song 1).

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
