/**
 * ProfileImageUpload
 *
 * Drop-in profile-image control for the Profile page. Features:
 *
 *   - Click OR drag-and-drop to pick a file
 *   - Local preview via `URL.createObjectURL()` BEFORE the actual
 *     upload — so the user sees what they're about to commit
 *   - Client-side validation matching the backend's rules:
 *       JPG / JPEG / PNG / WEBP, max 2MB
 *   - Real upload progress bar via axios `onUploadProgress`
 *   - Cache-busting query string appended to the server URL so a
 *     fresh upload OVERWRITES the visible image instead of showing
 *     the previously-cached one (the static server sets
 *     `immutable` headers so without busting the browser sticks)
 *   - `<img>` with an `onError` handler that falls back to the
 *     initials avatar — handles broken/missing files gracefully
 *   - Replace + remove actions when an image already exists
 *   - "Drop image here" overlay during drag
 *
 * The component is "uncontrolled" w.r.t. the server URL: it accepts
 * the current `imageUrl` from the parent and calls
 * `onChange(nextUrl | null)` after a successful upload / remove so
 * the parent can update its own state in one place.
 */
import { useEffect, useRef, useState } from 'react';
import { api, call } from '../api/client.js';
import { candidatesApi } from '../api/index.js';

const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024;

function initialsFromName(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '··';
}

/**
 * Append a cache-busting `v=<ts>` query string so the browser doesn't
 * keep serving the previously-cached avatar after a replace upload.
 * The static server sends `Cache-Control: immutable` on these paths
 * (good for repeat views of the SAME file) so this is the right
 * mechanism to override on a fresh write.
 */
function withCacheBust(url) {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${Date.now()}`;
}

export default function ProfileImageUpload({
  imageUrl,
  fullName = '',
  onChange,
  size = 120,
  showActions = true,
}) {
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);     // local objectURL during upload
  const [serverUrl, setServerUrl] = useState(imageUrl); // current authoritative URL (cache-busted)
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Sync local state when parent passes a new imageUrl (e.g. after a
  // refresh from /candidates/profile that returned a different URL).
  useEffect(() => { setServerUrl(imageUrl); setImgFailed(false); }, [imageUrl]);

  // Release object-URL when preview changes so we don't leak.
  useEffect(() => {
    if (!preview) return undefined;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function validate(file) {
    if (!ALLOWED.has(file.type)) return 'Use a JPG, PNG, or WEBP image.';
    if (file.size > MAX_BYTES) return 'Image must be 2MB or smaller.';
    return null;
  }

  function openPicker() { if (!busy) { setError(null); fileInputRef.current?.click(); } }

  function onFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) handleFile(file);
  }

  /** Drag-and-drop handlers — bound to the avatar circle. */
  function onDragOver(e) { e.preventDefault(); e.stopPropagation(); setDragOver(true); }
  function onDragLeave(e) { e.preventDefault(); e.stopPropagation(); setDragOver(false); }
  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }

  async function handleFile(file) {
    const v = validate(file);
    if (v) { setError(v); return; }
    setError(null);
    setPreview(URL.createObjectURL(file));
    await upload(file);
  }

  async function upload(file) {
    setBusy(true);
    setProgress(0);
    try {
      // Use the raw axios client so we can wire `onUploadProgress`
      // — `candidatesApi.uploadProfileImage` doesn't expose it.
      const fd = new FormData();
      fd.append('image', file);
      const data = await call(api.post('/candidates/profile-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (!e.total) return;
          setProgress(Math.round((e.loaded * 100) / e.total));
        },
      }));
      const nextUrl = data?.image_url || null;
      // Cache-bust the URL going into the <img> so the new file
      // replaces the prior one in-browser without a hard reload.
      const busted = withCacheBust(nextUrl);
      setServerUrl(busted);
      setImgFailed(false);
      onChange?.(busted);
      setPreview(null); // local objectURL no longer needed
    } catch (err) {
      setError(err.message || 'Could not upload image.');
      setPreview(null);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await candidatesApi.deleteProfileImage();
      setServerUrl(null);
      setPreview(null);
      setImgFailed(false);
      onChange?.(null);
    } catch (err) {
      setError(err.message || 'Could not remove image.');
    } finally {
      setBusy(false);
    }
  }

  // `displayed` resolves to local preview while uploading, then the
  // cache-busted server URL once done. `imgFailed` is set by the
  // <img> onError handler when the server URL fails to load, in
  // which case we fall back to the initials avatar.
  const displayed = preview || (!imgFailed ? serverUrl : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div
        role="button"
        tabIndex={0}
        aria-label={displayed ? 'Replace profile image' : 'Upload profile image'}
        title={displayed ? 'Click or drag a file to replace' : 'Click or drag a file to upload'}
        onClick={openPicker}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPicker(); }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          width: size, height: size, borderRadius: '50%',
          background: 'var(--coral, #E85D3C)',
          color: '#fff', fontFamily: "'Fraunces', serif", fontSize: size * 0.34,
          fontWeight: 500,
          border: dragOver ? '3px dashed var(--ink, #1A1A1A)' : '3px solid var(--paper, #fff)',
          boxShadow: '0 2px 8px rgba(26,26,26,0.08)',
          display: 'grid', placeItems: 'center',
          cursor: busy ? 'wait' : 'pointer', position: 'relative',
          overflow: 'hidden', userSelect: 'none', outline: 'none',
        }}
      >
        {/* Image layer — only mounts when there's a URL. onError falls back to initials. */}
        {displayed && (
          <img
            key={displayed} /* re-mount on URL change so onError re-runs */
            src={displayed}
            alt="Profile"
            onError={() => setImgFailed(true)}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', display: 'block',
            }}
          />
        )}

        {/* Initials fallback — visible when displayed is null (no upload, or onError fired). */}
        {!displayed && <span>{initialsFromName(fullName)}</span>}

        {/* Drop overlay during drag. */}
        {dragOver && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(26,26,26,0.6)', color: '#fff',
              display: 'grid', placeItems: 'center', fontSize: 13,
            }}
          >
            Drop to upload
          </div>
        )}

        {/* Camera badge — makes the click target obvious + shows busy state. */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 32, height: 32, borderRadius: '50%',
            background: '#fff', color: 'var(--ink, #1A1A1A)',
            display: 'grid', placeItems: 'center', fontSize: 15,
            border: '3px solid var(--paper, #fff)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
          }}
        >
          {busy ? '⏳' : displayed ? '✎' : '+'}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={onFileChosen}
        style={{ display: 'none' }}
      />

      {/* Upload progress bar — only while uploading. */}
      {busy && progress > 0 && (
        <div style={{ width: size + 40, marginTop: -6 }}>
          <div style={{ height: 4, borderRadius: 2, background: '#ede7da', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--coral, #E85D3C)', transition: 'width .15s' }} />
          </div>
          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--muted, #6b6b6b)', marginTop: 2 }}>
            Uploading… {progress}%
          </div>
        </div>
      )}

      {error && (
        <div role="alert" style={{
          fontSize: 12, color: '#b3361b', background: '#fde9e3',
          padding: '6px 10px', borderRadius: 8, textAlign: 'center', maxWidth: 240,
        }}>{error}</div>
      )}

      {showActions && (
        <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
          <button type="button" onClick={openPicker} disabled={busy}
                  className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}>
            {displayed ? 'Replace' : 'Upload'}
          </button>
          {serverUrl && (
            <button type="button" onClick={remove} disabled={busy}
                    className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: '#b3361b' }}>
              Remove
            </button>
          )}
        </div>
      )}
      <small style={{ fontSize: 11, color: 'var(--muted, #6b6b6b)' }}>
        JPG, PNG, WEBP · max 2MB · drag &amp; drop supported
      </small>
    </div>
  );
}
