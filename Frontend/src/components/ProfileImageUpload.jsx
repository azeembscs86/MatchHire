/**
 * ProfileImageUpload
 *
 * Drop-in profile-image control for the Profile page. Supports:
 *
 *   - Click (or drop) to pick a file
 *   - Local preview via `URL.createObjectURL()` BEFORE the actual
 *     upload — so the user sees what they're about to commit
 *   - Client-side validation matching the backend's rules:
 *       JPG / JPEG / PNG / WEBP, max 2MB
 *   - Replace + remove actions when an image already exists
 *   - Default initials avatar when no image is set
 *
 * The component is "uncontrolled" w.r.t. the actual storage URL —
 * it accepts the current `imageUrl` from the parent and calls
 * `onChange(nextUrl | null)` after a successful upload / remove
 * so the parent can update its own state in one place.
 */
import { useEffect, useRef, useState } from 'react';
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

export default function ProfileImageUpload({
  imageUrl,
  fullName = '',
  onChange,
  size = 120,
  showActions = true,
}) {
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Release the object URL when preview changes so we don't leak.
  useEffect(() => {
    if (!preview) return undefined;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function openPicker() {
    if (busy) return;
    setError(null);
    fileInputRef.current?.click();
  }

  function onFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    if (!ALLOWED.has(file.type)) {
      setError('Use a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be 2MB or smaller.');
      return;
    }
    setError(null);
    // Show the local preview immediately, then upload.
    setPreview(URL.createObjectURL(file));
    upload(file);
  }

  async function upload(file) {
    setBusy(true);
    try {
      const data = await candidatesApi.uploadProfileImage(file);
      onChange?.(data?.image_url || null);
      // Drop the local preview — the server URL is the source of truth now.
      setPreview(null);
    } catch (err) {
      setError(err.message || 'Could not upload image.');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await candidatesApi.deleteProfileImage();
      onChange?.(null);
      setPreview(null);
    } catch (err) {
      setError(err.message || 'Could not remove image.');
    } finally {
      setBusy(false);
    }
  }

  const displayed = preview || imageUrl;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <button
        type="button"
        onClick={openPicker}
        disabled={busy}
        aria-label={displayed ? 'Replace profile image' : 'Upload profile image'}
        title={displayed ? 'Click to replace' : 'Click to upload'}
        style={{
          width: size, height: size, borderRadius: '50%',
          background: displayed ? `center / cover no-repeat url("${displayed}")` : 'var(--coral, #E85D3C)',
          color: '#fff', fontFamily: "'Fraunces', serif", fontSize: size * 0.34,
          fontWeight: 500, border: '3px solid var(--paper, #fff)',
          boxShadow: '0 2px 8px rgba(26,26,26,0.08)',
          display: 'grid', placeItems: 'center',
          cursor: busy ? 'wait' : 'pointer', position: 'relative',
          overflow: 'hidden', padding: 0,
        }}
      >
        {!displayed && <span>{initialsFromName(fullName)}</span>}
        {/* small camera badge so the click target is obvious */}
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
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={onFileChosen}
        style={{ display: 'none' }}
      />

      {error && (
        <div role="alert" style={{
          fontSize: 12, color: '#b3361b', background: '#fde9e3',
          padding: '6px 10px', borderRadius: 8, textAlign: 'center', maxWidth: 240,
        }}>{error}</div>
      )}

      {showActions && (
        <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
          <button
            type="button"
            onClick={openPicker}
            disabled={busy}
            className="btn btn-ghost"
            style={{ padding: '4px 10px', fontSize: 12 }}
          >
            {displayed ? 'Replace' : 'Upload'}
          </button>
          {imageUrl && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="btn btn-ghost"
              style={{ padding: '4px 10px', fontSize: 12, color: '#b3361b' }}
            >
              Remove
            </button>
          )}
        </div>
      )}
      <small style={{ fontSize: 11, color: 'var(--muted, #6b6b6b)' }}>
        JPG, PNG, WEBP · max 2MB
      </small>
    </div>
  );
}
