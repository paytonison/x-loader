# X-Loader

X-Loader is a userscript for the desktop X/Twitter website. It adds download
controls directly to images, videos, animated GIFs, and recognized media
thumbnails, then saves the underlying media with descriptive filenames. It
also includes an optional set of small browsing improvements such as direct
links, clearer visited-link styling, a cleaner page title, and hiding the
trends column.

The script runs on both `https://x.com/*` and `https://twitter.com/*` and is
implemented entirely in [`x-loader.user.js`](./x-loader.user.js).
The checked-in userscript version is **3.0.1**.

> [!IMPORTANT]
> The userscript header currently inherits its `@downloadURL` and `@updateURL`
> from the upstream Twitter Click'n'Save script on Greasy Fork. A userscript
> manager may therefore replace this fork with the upstream script during an
> automatic update. Disable automatic updates for X-Loader, or change those
> metadata entries in your installed copy, if you want to stay on this fork.
> The inherited `@homepageURL`, `@supportURL`, and icon also point upstream, so
> confirm that you are using this repository before reporting a fork-specific
> issue or publishing the script.

## What it does

### Downloads tweet media in place

X-Loader watches X's dynamically changing page and adds a circular download
control over recognized tweet media. It works on timeline posts, individual
post pages, photo/video viewers, and media-grid thumbnails when X exposes the
expected markup.

The media scanner is intentionally conservative. It looks inside tweet and
media-viewer containers, accepts known `pbs.twimg.com` tweet-media paths, and
filters out avatars, site chrome, emoji, SVG assets, age-restriction
placeholders, hidden elements, and very small images. This keeps download
buttons off most unrelated interface artwork.

Because X is a single-page application, a `MutationObserver` rescans after new
posts or viewers are inserted. No page refresh is normally needed as you
scroll, open a post, or move between routes.

### Fetches the best available image

For a photo, X-Loader uses this intended high-quality fallback order:

1. `orig`
2. `4096x4096`
3. progressively smaller variants such as `large`, `medium`, `900x900`,
   `small`, and `360x360`

It retries an original JPEG that returns 404 as PNG. When a fetch failure moves
the downloader into the smaller-size queue, the resulting filename receives a
`[sample]` marker. Sample downloads are not added to the image
history, so a later attempt can still retrieve and record the original.

This fallback is not a complete HTTP-status retry system: outside the special
original JPEG/PNG case, the current code does not reject every non-success HTTP
response. A nonempty error response can therefore stop the fallback sequence.

### Selects the highest-bitrate video variant

Videos require more than the poster image displayed in the page. X-Loader
queries X's own internal tweet API, reads the media variants, ignores entries
without a reported bitrate (including the usual HLS playlist entry), and
selects the direct variant with the highest reported bitrate. X normally
returns an MP4 here, but the code does not enforce a specific content type.

X animated GIFs are represented by the API as `animated_gif` media. X-Loader
treats them as video and downloads the direct video representation supplied by
X, normally an MP4.

The same API path is used to resolve mixed-media posts and some quoted-post
media. On recognized media-grid thumbnails, the multi-media control downloads
the post's photos and videos sequentially and displays overall item progress.
Each item is saved separately; X-Loader does not create a ZIP or other archive.

### Shows download state and progress

The 44-pixel translucent control communicates its current state:

| State | Meaning |
| --- | --- |
| Down arrow | The media has not been recorded as downloaded. |
| Blue progress ring | The current file is being fetched. Hover text shows transferred bytes when available. |
| Small item indicator | A multi-media post is moving through its media entries. |
| Check mark | The media was fetched and a browser save was initiated now, or its identifier appears in local history. It does not prove the file reached disk. |
| Warning/error mark | X-Loader fell back to a sample or could not resolve/fetch the media. Hover for the error text. |

The button styling responds to the operating system's reduced-transparency,
increased-contrast, and reduced-motion preferences.

## Download filenames

X-Loader builds filenames from the media type, author, server-provided
last-modified date, post ID, original media name, and detected MIME extension.
When the response headers are present, the date comes from `Last-Modified`, the
extension comes from `Content-Type`, and the date is formatted as `YYYY.MM.DD`
in UTC.

```text
Image: [twitter] AUTHOR—YYYY.MM.DD—POST_ID—MEDIA_NAME.EXT
Sample: [twitter][sample] AUTHOR—YYYY.MM.DD—POST_ID—MEDIA_NAME.EXT
Video: [twitter] AUTHOR—YYYY.MM.DD—POST_ID—MEDIA_NAME.EXT
```

Examples:

```text
[twitter] example—2026.07.10—1901234567890123456—AbCdEf123.jpg
[twitter][sample] example—2026.07.10—1901234567890123456—AbCdEf123.jpg
[twitter] example—2026.07.10—1901234567890123456—1234567890.mp4
```

The browser still controls the destination folder, duplicate-name behavior,
and whether a Save dialog appears.

## Additional page enhancements

The download tools are the main feature, but several optional enhancements are
enabled by default:

- **Direct Links** rewrites many visible `t.co` links to their displayed
  destination and preserves safe `rel` attributes. It can use X's user API to
  resolve a truncated profile website.
- **Enhance Title** cleans up the document title on an opened post and expands
  recognized short-link information.
- **Highlight Visited Links** colors visited links dark orange. By default it
  limits this to absolute links, which are commonly external destinations.
- **Hide Trends** removes the right-column trends region when its localized
  label is recognized.

The language-dependent enhancements currently contain labels for English,
Russian, Spanish, Chinese, and Japanese. Media downloading itself is not tied
to those labels.

## Installation

### Requirements

- A modern desktop browser with a userscript manager, such as Tampermonkey or
  Violentmonkey.
- Access to `x.com` or `twitter.com`. Some media also requires an X session that
  can view the post.

Safari users can use a Safari-compatible userscript manager. The script uses
browser-native `fetch`, `Blob`, object URLs, and a temporary `<a download>`
element rather than `GM_download` or `GM_xmlhttpRequest`.

### Install from this repository

1. Install and enable a userscript manager.
2. Open the
   [raw userscript](https://raw.githubusercontent.com/paytonison/x-loader/main/x-loader.user.js),
   or import [`x-loader.user.js`](./x-loader.user.js) as a local file.
3. Review the userscript manager's installation screen and save the script.
4. Disable automatic updates for this installed script unless you have changed
   the inherited upstream `@downloadURL` and `@updateURL` values.
5. Open or reload `https://x.com/` or `https://twitter.com/`.

If opening the raw file does not launch the installer, create a new script in
the manager, replace its template with the complete contents of
`x-loader.user.js`, and save it.

## Using X-Loader

1. Open a timeline, post, media tab, or photo/video viewer on X/Twitter.
2. Find the download control in the upper-right area of recognized media.
3. Click it once and wait for the progress ring to complete.
4. Check the browser's normal downloads list or configured download folder.

Clicking a check-marked control downloads the media again; the history is a
visual reminder and does not block repeat downloads.

For a multi-media thumbnail, one click can start several browser downloads.
Your browser may ask for permission to allow multiple automatic downloads from
X/Twitter.

## Settings

Open the userscript manager's menu while on X/Twitter and choose **Show
settings**. Changes are saved immediately to local storage, but the page must
be reloaded before all of them take effect.

| Setting | Default | Behavior |
| --- | :---: | --- |
| Add a white border to the download button | On | Increases the button rim contrast over busy media. |
| Hide Messages and Cookies bottom UI (beta) | Off | Makes the lower overlay non-interactive/hidden; may interfere with logged-out or login pages. |
| Hide Trends | On | Hides the recognized trends region in the right column. |
| Highlight Visited Links | On | Colors matching visited links dark orange. |
| Highlight Only Absolute Visited Links | On | Limits visited styling to links whose `href` starts with `http`. |
| Direct Links | On | Replaces many `t.co` wrappers with direct destinations. |
| Enhance Title | On | Rewrites the title of an opened post when the current language is supported. |
| Strict Tracking Protection Fix | On | Firefox-only page-context fetch workaround for Enhanced Tracking Protection set to Strict. |
| Image Download Button | On | Enables photo detection and download controls. |
| Video Download Button | On | Enables video/poster detection and download controls. |

The modal also exposes an **Outdated** group. Those controls depend on old X
markup and should be considered experimental or nonfunctional; in particular,
the spoiler-expansion handler is not currently executed by the script runner.

## Download history

X-Loader keeps a lightweight record in the current site's `localStorage`:

- images are recorded by media filename stem (without the extension) by
  default;
- videos are recorded by post ID and per-post video index;
- settings are stored alongside the history under
  `ujs-twitter-click-n-save-*` keys.

History only changes button appearance. It does not inspect the browser's
Downloads folder and cannot know whether a file was later moved or deleted.

The settings modal provides three history actions:

- **Export** downloads a dated JSON file containing settings and available
  image/video history.
- **Import** writes every top-level value whose key starts with
  `ujs-twitter-click-n-save`, replacing an existing value with the same key.
- **Merge** unions array-based history from an export with existing history;
  it does not replace non-array settings.

Import only JSON that you exported yourself or otherwise trust. Import checks
the storage-key prefix, but it does not restrict input to a known key list or
validate each value's schema.

`x.com` and `twitter.com` are separate browser origins, so their local history
stores are separate even though the key names are the same. Use Export and
Import/Merge if you switch domains or browsers and want the same recorded
state in both places.

An exported JSON file can reveal media names, post/video identifiers, settings,
and which media was recorded for download. The stored values are page
`localStorage`, not isolated userscript-manager storage, so scripts running in
the same X/Twitter origin can technically read or change them.

A hidden `TWEET_ID` image-history mode can be selected through local storage.
In that mode, downloading one photo causes every image from the same post to
appear downloaded later. On startup, X-Loader also merges recognized legacy
`ujs-click-n-save-*` history keys into the current key names.

## How downloads work

The script does not send media to an intermediary service. Its normal download
path is:

1. Identify a tweet-media URL in X's rendered page.
2. For video or mixed media, call X's internal GraphQL endpoint with the
   script's fixed public guest bearer token plus the `gt`/`ct0` cookie values
   available to the page.
3. Fetch the selected `pbs.twimg.com` or `video.twimg.com` resource in the
   browser and stream progress when the response exposes it.
4. Convert the response to a `Blob` and create a temporary object URL.
5. Click a hidden `<a download>` element, then remove it and revoke the object
   URL.
6. After the fetch completes and the browser save is initiated, record the
   media identifier in local storage. This does not confirm that the browser
   ultimately wrote the file to disk.

The userscript requests only `GM.registerMenuCommand`. It has no `@require`,
`@connect`, `GM_download`, or `GM_xmlhttpRequest` grant. The script does read
X's `gt` and `ct0` cookies when preparing X API requests. The code contains no
separate analytics or telemetry endpoint.

Do not enable the hidden verbose-debug setting in an ordinary or shared
session. Debug mode logs the page-visible cookie string and copies bearer,
CSRF, and guest-token values into that tab's `sessionStorage` to aid inspection.

## Browser compatibility

X-Loader is intended for current desktop browsers and userscript managers. The
code contains a Firefox-specific Strict Tracking Protection workaround and
avoids a dependency on manager-specific download APIs, which keeps the core
download path usable across more managers.

Compatibility is still affected by browser download policy, cross-origin
fetch behavior, content blockers, X account state, and userscript-manager
injection settings. A successful install does not guarantee every X media
surface will work. The metadata does not declare a minimum browser version or a
tested compatibility matrix. These are source-level compatibility notes, not
proof from a live Safari/Tampermonkey or cross-browser test run.

The script requires modern platform features including `fetch`, async/await,
class fields, named regular-expression capture groups, `MutationObserver`,
Blob/object URLs, and response streams.

## Limitations

- X-Loader depends on undocumented X DOM structure and internal GraphQL query
  IDs. An X site update can make buttons disappear or break video metadata
  lookup without any userscript change.
- Deleted, protected, age-gated, region-restricted, suspended, or otherwise
  unavailable posts cannot be downloaded unless the current X session can
  access the media.
- API rate limits and stale guest/session tokens can prevent video and
  multi-media downloads even while direct image downloads still work.
- The media filter deliberately ignores avatars, emoji, interface assets,
  profile artwork, hidden media, very small images, and the known
  age-restriction placeholder.
- Expanded/full-screen video resolution is incomplete and may fail even when
  the same video works from its normal post. Open the original post and retry.
- There is no filename fallback for missing `Last-Modified` or `Content-Type`
  response headers; the current output can contain an epoch date or a `.null`
  extension in that edge case.
- The script matches `x.com` and `twitter.com`, not subdomains such as
  `mobile.twitter.com`.
- The injected download control is click/pointer driven and is not currently a
  native keyboard-focusable `<button>`.
- Automatic updates currently point to the upstream project, not this fork.

## Troubleshooting

### No download button appears

- Confirm the userscript is enabled for the exact domain currently open.
- Reload the page after installing the script or changing settings.
- Check that **Image Download Button** and **Video Download Button** are on.
- Disable another X userscript temporarily to rule out DOM or style conflicts.
- Try the individual post or media viewer; X may be rendering an unsupported
  card, placeholder, or compact media surface in the timeline.

### Images download with `[sample]`

X-Loader could not fetch `orig` or another original-size candidate and used a
smaller X image variant. This is a successful fallback, not a completed
original, so it is intentionally omitted from image history.

### A video shows an error

- Open the post normally and confirm the video plays in the current session.
- Reload the page to refresh X's guest/CSRF token state.
- On Firefox with Enhanced Tracking Protection set to Strict, leave **Strict
  Tracking Protection Fix** enabled.
- Wait before retrying if X is returning a rate-limit response.

Video downloads depend on X's internal response shape and current GraphQL
query ID, so this is usually the first feature affected by an X update.

### A completed item is not marked, or a missing file is marked complete

The check mark reflects only X-Loader's local history. It is not synchronized
with the browser's download database or filesystem. Also check whether you
switched between `x.com` and `twitter.com`, used a private window, cleared site
data, or installed the script in another browser profile.

### The wrong script appears after an update

The current metadata points to the upstream Greasy Fork update URLs. Reinstall
this repository's `x-loader.user.js`, then disable automatic updates for it or
replace those metadata URLs with URLs controlled by this fork.

## Development

There is no build step, package manager, or generated bundle. Edit
`x-loader.user.js` directly and import that same file into the userscript
manager for manual testing.

Useful static checks:

```sh
node --check x-loader.user.js
git diff --check
```

A practical manual smoke test should cover:

1. one original image;
2. one video and one animated GIF;
3. a post containing multiple media entries;
4. an already-downloaded item after reload;
5. progress, success, warning, and error states;
6. both a timeline card and the full-screen media viewer;
7. settings persistence and a history export/import round trip.

Static syntax checks cannot prove that X's live selectors, API query IDs, and
download responses still work.

## Project history and license

The userscript retains upstream metadata and implementation lineage from
[AlttiRi's Twitter Click'n'Save](https://github.com/AlttiRi/twitter-click-and-save).
X-Loader adds its own compatibility, media-scoping, and interface work on top
of that base.

The repository currently contains a [BSD 3-Clause license](./LICENSE), while
the userscript metadata declares `@license GPL-3.0`. These declarations should
be reconciled before redistribution or publication; this README does not
attempt to resolve that licensing mismatch.

X-Loader is an independent project and is not affiliated with X Corp.
