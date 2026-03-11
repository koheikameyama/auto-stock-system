/**
 * cron タスクの動的停止/再開を制御する共有モジュール
 *
 * worker.ts が起動時に register() で関数を登録し、
 * api.ts の /trading/toggle から stop()/start() を呼ぶ。
 * 循環参照を避けるための中間レイヤー。
 */

let _stop: (() => void) | null = null;
let _start: (() => void) | null = null;

export const cronControl = {
  /** worker.ts から呼び出して停止/再開関数を登録 */
  register(stop: () => void, start: () => void) {
    _stop = stop;
    _start = start;
  },

  stop() {
    _stop?.();
  },

  start() {
    _start?.();
  },
};
