import { describe, expect, it } from 'vitest';
import { rawPlayer, sanitizePictureUrl } from './match-detail-schema';

/**
 * CR-11 — Validate `PictureUrl` before it becomes an `<img src>`.
 *
 * The schema boundary must accept ONLY `https:` absolute URLs (any scheme
 * casing) or relative URLs, and degrade everything else — `http:`,
 * `javascript:`, `data:`, and any other non-https absolute scheme, in any
 * casing — to `null` WITHOUT throwing, preserving the tolerant-but-validating
 * posture. Covers acceptance #1–#6 in the plan.
 */

const FIFA_HTTPS_URL = 'https://digitalhub.fifa.com/transform/abc/X.png';

/** Build a raw FIFA player payload around a single `PictureUrl` plus extras. */
function rawPlayerPayloadWith(
  pictureUrl: string | null | undefined,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    IdPlayer: '12345',
    ShirtNumber: 10,
    PlayerPicture: { PictureUrl: pictureUrl },
    ...extras,
  };
}

describe('sanitizePictureUrl (CR-11 boundary helper)', () => {
  describe('acceptance #1 — https URLs pass through unchanged, scheme casing ignored', () => {
    it.each([
      ['lowercase https', FIFA_HTTPS_URL],
      ['lowercase https with query', 'https://example.com/players/10.png?v=2'],
      ['uppercase HTTPS scheme', 'HTTPS://example.com/players/10.png'],
      ['mixed-case HtTpS scheme', 'HtTpS://example.com/players/10.png'],
    ])('returns a %s URL unchanged', (_label, url) => {
      expect(sanitizePictureUrl(url)).toBe(url);
    });
  });

  describe('acceptance #2 — relative URLs pass through unchanged', () => {
    it.each([
      ['root-relative', '/players/10.png'],
      ['same-dir', './x.png'],
      ['parent-dir', '../x.png'],
      ['bare filename', 'x.png'],
      ['query-only relative', '?id=10'],
      ['fragment-only relative', '#anchor'],
    ])('keeps a %s relative URL unchanged', (_label, url) => {
      expect(sanitizePictureUrl(url)).toBe(url);
    });
  });

  describe('acceptance #3 — non-https absolute URLs degrade to null (never thrown)', () => {
    it.each([
      ['http', 'http://example.com/x.png'],
      ['mixed-case HtTp', 'HtTp://example.com/x.png'],
      ['javascript', 'javascript:alert(1)'],
      ['mixed-case JavaScript', 'JavaScript:alert(document.cookie)'],
      ['data', 'data:image/png;base64,AAAA'],
      ['ftp', 'ftp://host/x.png'],
      ['file', 'file:///etc/passwd'],
      ['vbscript', 'vbscript:msgbox(1)'],
      ['mailto', 'mailto:attacker@example.com'],
      ['blob', 'blob:https://example.com/uuid'],
      ['tel', 'tel:+15551234567'],
    ])('degrades a %s: URL to null without throwing', (_label, url) => {
      expect(() => sanitizePictureUrl(url)).not.toThrow();
      expect(sanitizePictureUrl(url)).toBeNull();
    });
  });

  describe('acceptance #5 — nullish, empty, and whitespace-only inputs map to null', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['spaces only', '   '],
      ['tab/newline only', '\t\n '],
    ])('maps %s to null', (_label, value) => {
      expect(sanitizePictureUrl(value)).toBeNull();
    });
  });

  describe('acceptance #6 — protocol-relative URLs are accepted unchanged (pinned decision)', () => {
    it.each([
      ['simple host', '//host/x.png'],
      ['attacker host (//evil)', '//evil.com/steal.png'],
    ])('accepts a protocol-relative %s URL unchanged', (_label, url) => {
      expect(sanitizePictureUrl(url)).toBe(url);
    });
  });
});

/**
 * Acceptance #4 — the surrounding payload still parses when a `PictureUrl` is
 * degraded. The boundary downgrades the offending field but never rejects the
 * whole object: `.passthrough()` extras and sibling fields survive intact.
 */
describe('rawPlayer.parse boundary (acceptance #1 + #4)', () => {
  it('passes a valid https PictureUrl through a full parse unchanged (good data not corrupted)', () => {
    const parsed = rawPlayer.parse(rawPlayerPayloadWith(FIFA_HTTPS_URL));

    expect(parsed.PlayerPicture?.PictureUrl).toBe(FIFA_HTTPS_URL);
    expect(parsed.IdPlayer).toBe('12345');
    expect(parsed.ShirtNumber).toBe(10);
  });

  it('degrades a rejected http scheme to null while preserving siblings and passthrough extras', () => {
    const parsed = rawPlayer.parse(
      rawPlayerPayloadWith('http://insecure.example.com/x.png', { PositionX: 42 }),
    );

    expect(parsed.PlayerPicture?.PictureUrl).toBeNull();
    expect(parsed.IdPlayer).toBe('12345');
    expect(parsed.ShirtNumber).toBe(10);
    // Unknown extra key survives via .passthrough().
    expect((parsed as Record<string, unknown>).PositionX).toBe(42);
  });

  it('degrades a javascript: PictureUrl to null in a single tolerant parse (no throw)', () => {
    let parsed: ReturnType<typeof rawPlayer.parse> | undefined;

    expect(() => {
      parsed = rawPlayer.parse(rawPlayerPayloadWith('javascript:alert(1)'));
    }).not.toThrow();

    expect(parsed?.PlayerPicture?.PictureUrl).toBeNull();
    expect(parsed?.IdPlayer).toBe('12345');
  });

  it('leaves a missing PlayerPicture absent (boundary only touches the URL field)', () => {
    const parsed = rawPlayer.parse({ IdPlayer: '999' });

    expect(parsed.IdPlayer).toBe('999');
    expect(parsed.PlayerPicture).toBeUndefined();
  });
});
