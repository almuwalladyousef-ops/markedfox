// Trimming the ends off a clip and changing how loud it is.
//
// No platform API accepts either of these — there is no "start at 4 seconds"
// field on Instagram's container or TikTok's init — so the file itself has to
// be different before it is uploaded. That happens in the browser, because the
// alternative is transcoding video on a 1 vCPU droplet, which is the one thing
// the whole media path is arranged to avoid.
//
// This module is the part with no ffmpeg in it: what the edit is, whether it
// amounts to anything, and the exact argument list to run. Keeping that pure
// means the decisions can be tested without loading 32MB of WebAssembly, and
// the one place that knows about `-c:v copy` is covered by a test rather than
// by hoping.

export type MediaEdit = {
  /** Seconds from the start of the source. */
  startSec: number;
  /** Seconds from the start of the source. `null` means "run to the end". */
  endSec: number | null;
  /** 0–1, where 1 is the file's own level. Not above 1: raising the gain on a
   *  track that is already peaking clips it, and the result sounds broken in a
   *  way the person cannot undo. */
  volume: number;
};

export const NO_EDIT: MediaEdit = { startSec: 0, endSec: null, volume: 1 };

/** Two frames at 30fps. Below this a trim is somebody nudging the handle, not
 *  asking for anything, and it is not worth a re-mux to honour it. */
const TRIM_EPSILON = 0.07;
/** Half a percent. Same reasoning. */
const VOLUME_EPSILON = 0.005;

export function clampEdit(edit: MediaEdit, durationSec: number): MediaEdit {
  const duration = Number.isFinite(durationSec) && durationSec > 0
    ? durationSec
    : 0;
  const start = Math.min(Math.max(0, edit.startSec), duration);
  const rawEnd = edit.endSec === null ? duration : edit.endSec;
  const end = Math.min(Math.max(start, rawEnd), duration || rawEnd);
  return {
    startSec: start,
    endSec: edit.endSec === null && duration === 0 ? null : end,
    volume: Math.min(1, Math.max(0, edit.volume)),
  };
}

/** Does this edit change the file at all? The common case is no, and the
 *  common case must not pay for ffmpeg — an untouched clip uploads as it is. */
export function hasEdits(edit: MediaEdit, durationSec: number): boolean {
  if (edit.volume < 1 - VOLUME_EPSILON) return true;
  if (edit.startSec > TRIM_EPSILON) return true;
  if (edit.endSec === null) return false;
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    // Duration unknown, but an explicit end was set: trust the end.
    return true;
  }
  return edit.endSec < durationSec - TRIM_EPSILON;
}

/** Seconds of output this edit produces, or null when it cannot be known. */
export function trimmedDuration(
  edit: MediaEdit,
  durationSec: number,
): number | null {
  const end = edit.endSec ?? (Number.isFinite(durationSec) ? durationSec : null);
  if (end === null) return null;
  return Math.max(0, end - edit.startSec);
}

/**
 * The ffmpeg argument list.
 *
 * Two rules decide everything here:
 *
 * - **The video stream is never re-encoded.** `-c:v copy` keeps the original
 *   picture bit for bit and turns a two-minute transcode into a remux that
 *   finishes in about a second. The cost is that `-ss` can only cut on a
 *   keyframe, so a trim lands on the keyframe at or before the chosen point —
 *   up to a second or two early on phone footage. Frame-exact cutting means
 *   re-encoding, and paying minutes of the user's battery to move a cut by
 *   half a second is the wrong trade for trimming the ends off a clip.
 * - **Audio is only re-encoded when the volume actually changed**, because
 *   `volume` is a filter and a filtered stream cannot be copied. Audio is
 *   small, so this costs little; when the volume is untouched it copies too.
 */
export function buildFfmpegArgs(
  edit: MediaEdit,
  input: string,
  output: string,
  durationSec: number,
): string[] {
  const args: string[] = [];

  // Before -i, so ffmpeg seeks rather than decoding and discarding.
  if (edit.startSec > TRIM_EPSILON) {
    args.push("-ss", edit.startSec.toFixed(3));
  }
  args.push("-i", input);

  const length = trimmedDuration(edit, durationSec);
  const trimsTail =
    edit.endSec !== null &&
    (!Number.isFinite(durationSec) ||
      durationSec <= 0 ||
      edit.endSec < durationSec - TRIM_EPSILON);
  if (trimsTail && length !== null) {
    // -t rather than -to: with -ss ahead of -i the timeline has already been
    // shifted, and a duration is unambiguous where an absolute end is not.
    args.push("-t", length.toFixed(3));
  }

  args.push("-c:v", "copy");

  if (edit.volume < 1 - VOLUME_EPSILON) {
    args.push("-af", `volume=${edit.volume.toFixed(3)}`);
    args.push("-c:a", "aac", "-b:a", "192k");
  } else {
    args.push("-c:a", "copy");
  }

  // Puts the index at the front so the platforms can start reading before the
  // whole file has arrived. Cheap, and every one of them prefers it.
  args.push("-movflags", "+faststart");
  args.push(output);
  return args;
}

/** ffmpeg picks the muxer from the extension, so the output keeps one it
 *  knows. MOV in, MP4 out is deliberate: every platform takes MP4. */
export function outputNameFor(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "clip";
  return `${base}-edited.mp4`;
}

/** mm:ss, for the handles and the readout beside them. */
export function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
