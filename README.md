# X-Loader

X-Loader is a single-file userscript for X/Twitter that adds download controls to tweet media and keeps a local history of what you have already saved.

The script runs on:

- `https://x.com/*`
- `https://twitter.com/*`

It is based on the older Twitter Click'n'Save script, but this checkout is maintained as a local `X-Loader` userscript in `x-loader.user.js`.

## What It Does

X-Loader watches the X/Twitter page as the timeline changes and adds a circular download button to supported media. Clicking the button downloads the media file through the browser's normal download handling.

Main behavior:

- Adds download buttons to tweet images.
- Adds download buttons to videos and animated GIFs when the media metadata can be resolved.
- Adds a multi-media button on compact media grids so a single click can download every media item in that tweet.
- Adds download support for profile banner/background images when the script can identify the banner image URL.
- Shows progress while the resource is being fetched.
- Marks media as already downloaded using local browser storage.
- Provides a settings panel from the userscript manager menu.
- Can export, import, or merge download history.
- Can apply a few page cleanup helpers, such as hiding trends, highlighting visited links, expanding direct links, and improving tweet page titles.

## Install

This repository contains one userscript file:

```text
x-loader.user.js
```

The most reliable install path for this checkout is manual installation:

1. Install a userscript manager, such as Tampermonkey.
2. Create a new userscript or import/open `x-loader.user.js`.
3. Save it in the userscript manager.
4. Open or reload `x.com` or `twitter.com`.

The current userscript metadata still contains inherited upstream `@homepageURL`, `@supportURL`, `@downloadURL`, and `@updateURL` values. If you publish this fork or rely on automatic updates, update those metadata fields first so your userscript manager does not point back to the upstream Twitter Click'n'Save listing.

## Usage

Open X/Twitter normally. When X-Loader sees supported media, it adds a glass-style circular download button over or beside the media.

Button states:

- Default: media has not been marked as downloaded.
- Progress ring: the script is fetching the media blob.
- Downloaded: the media is already present in local X-Loader history.
- Warning/error: the script could not fetch the original media or could not resolve the media metadata.
- Multi-media dot: the button represents multiple media items in one tweet.

Click the button once to download. The script does not choose a folder itself; the final save location is controlled by your browser and userscript manager download settings.

## Downloads

### Images

For tweet images, X-Loader tries to fetch the best available image URL. It starts with original-size variants such as `name=orig` and `4096x4096`, then falls back through smaller sizes if the original is unavailable.

If only a sample-size image is available, the filename is prefixed with `[sample]` and the script shows a warning rather than silently treating it as a full original download.

### Videos And GIFs

For videos and animated GIFs, X-Loader queries X/Twitter's GraphQL media metadata for the tweet and chooses the highest bitrate MP4 variant it can find.

This depends on X/Twitter's current internal API shape, guest/session cookies, and the page exposing enough tweet context. If X changes its GraphQL query IDs or media structure, video downloads can break until the script is updated.

### Multi-Media Tweets

On compact media grids, the button can represent a whole tweet instead of one visible thumbnail. Clicking it asks X/Twitter for the tweet media list and downloads each media entry in order. The small media-progress dot tracks how far through the batch it is.

### Profile Banners

Profile banner downloads use a separate filename template and are handled when the visible image URL includes X/Twitter's `profile_banners` path.

## Filename Format

The filename templates are defined near the top of `x-loader.user.js`:

```js
const imageFilenameTemplate      = `[twitter]{sampleText} {author}—{lastModifiedDate}—{tweetId}—{name}.{extension}`;
const videoFilenameTemplate      = `[twitter] {author}—{lastModifiedDate}—{tweetId}—{name}.{extension}`;
const backgroundFilenameTemplate = `[twitter][bg] {username}—{lastModifiedDate}—{id}—{seconds}.{extension}`;
```

The date uses the media response's `Last-Modified` header and is formatted as UTC `YYYY.MM.DD`.

The long filename format is intentional: it keeps the author, tweet ID, source media name, and modified date together so files remain traceable after download.

## Settings

Open your userscript manager's menu on X/Twitter and choose `Show settings`.

Available settings include:

- `Image Download Button`: enables image buttons.
- `Video Download Button`: enables video buttons.
- `Add a white border to the download button`: makes the button easier to see.
- `Hide Trends`: hides the trends column when the current page language is supported.
- `Hide Messages and Cookies`: hides the bottom messages/cookies layer. This is marked beta in the script.
- `Highlight Visited Links`: colors visited links.
- `Highlight Only Absolute Visited Links`: limits visited-link styling mostly to external links.
- `Direct Links`: replaces visible `t.co` links with their expanded visible destination when possible.
- `Enhance Title`: rewrites opened-tweet document titles to include more useful expanded-link context.
- `Strict Tracking Protection Fix`: Firefox-only option for Firefox strict tracking protection.

Some older options are still present in the settings UI but are marked outdated or disabled in the script because X/Twitter changed those surfaces.

After changing settings, reload the page from the settings panel or manually refresh X/Twitter.

## Download History

X-Loader stores downloaded-state history in `localStorage` under `ujs-twitter-click-n-save-*` keys. This keeps compatibility with the script family it came from.

History is used only to decide whether a media button should appear as already downloaded. It does not inspect your downloads folder.

The settings panel provides:

- `Export`: downloads a JSON file containing settings and download history.
- `Import`: loads settings/history values from a JSON export.
- `Merge`: merges array-based history from an export into the current browser profile.

Image history defaults to tracking by image name. A hidden storage setting can switch image history to tweet ID, but that can mark every image in a multi-image tweet as downloaded after only one image is saved.

## Storage And Privacy

X-Loader runs only on `x.com` and `twitter.com` according to the userscript metadata.

The script:

- Reads X/Twitter page content and media URLs.
- Reads X/Twitter cookies such as `gt` and `ct0` when making GraphQL requests for media metadata.
- Fetches media from X/Twitter media URLs.
- Stores settings and downloaded-history locally in your browser's `localStorage`.
- Does not upload your history to a separate service.

The userscript manager may also use the metadata icon, download URL, and update URL declared in the userscript header.

## Known Limits

X-Loader depends on X/Twitter's live DOM and internal GraphQL API. The script can break when X changes selectors, tweet JSON structure, query IDs, or media URL formats.

Known fragile areas:

- Video downloads depend on resolving tweet media metadata.
- Some opened `expanded_url` video pages are not fully supported.
- Private, deleted, age-restricted, or account-gated media may fail.
- Some spoiler/login-popup helpers are outdated or intentionally disabled.
- The browser controls the final save location and may prompt depending on its download settings.
- The downloaded state is local history, not proof that the file still exists on disk.

## Development

There is no build step. Edit `x-loader.user.js` directly.

Useful local checks:

```sh
node --check x-loader.user.js
git diff --check
```

For behavior changes, also test in the target browser/userscript manager because static checks do not prove that X/Twitter's current DOM, API responses, or browser download behavior still work.

When releasing a new local version, update the metadata line at the top of `x-loader.user.js`:

```js
// @version     3.1.0
```

## License

The userscript metadata declares `GPL-3.0`.
