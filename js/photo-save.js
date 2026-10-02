/* 写真はボタンを押す前に File にしておく。共有に必要なタップの権限を保つ。 */
(function (root) {
  'use strict';
  function createFile(dataUrl, name) {
    const match = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(dataUrl);
    if (!match) throw new Error('写真の形式が正しくありません');
    const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
    const safeName = String(name).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
    return new File([bytes], safeName, { type: match[1] });
  }
  async function share(file) {
    try {
      if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' ||
          !navigator.canShare({ files: [file] })) return 'unavailable';
      // この呼び出しより前に await を入れない（スマホの一時的な共有権限が切れる）。
      await navigator.share({ files: [file], title: 'レオパといっしょ' });
      return 'shared';
    } catch (e) {
      return e && e.name === 'AbortError' ? 'cancelled' : 'failed';
    }
  }
  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    try { document.body.appendChild(a); a.click(); }
    finally {
      a.remove();
      // ダウンロード開始後もブラウザが画像を読み込めるよう、すぐには解放しない。
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }
  const api = { createFile, share, download };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LeopaPhotoSave = api;
})(typeof window !== 'undefined' ? window : globalThis);
