# X-Loader

X-Loader is a userscript for X/Twitter that adds compact download controls to
media on `x.com` and `twitter.com`.

It is focused on saving images, videos, animated GIFs, multi-media posts, and
profile banners directly from the page. The script also includes a small set of
quality-of-life tweaks for browsing X/Twitter, such as direct `t.co` link
expansion, visited-link highlighting, title cleanup, and optional hiding of
some noisy page sections.

## What it does

X-Loader watches the X/Twitter page for media as the timeline changes. When it
finds supported media, it adds a small overlay download button near the top-left
of the media area.

The button is intentionally compact:

- red means the item has not been downloaded yet
- blue means the item is already in local download history
- green means the item was downloaded during the current session
- progress is shown on the button while a download is running
- multi-media posts show a small progress marker for batch downloads

The script handles dynamically loaded content with a `MutationObserver`, so it
continues to work as X/Twitter inserts new timeline items without a full page
reload.

## Supported media

X-Loader can download:

- tweet images
- tweet videos
- animated GIFs, saved through the video path
- multi-image and mixed-media tweets
- media thumbnails in `/media` style views
- profile banners/background images when detected

For images, the script tries to fetch the best available version first. It
starts with `orig`, falls back through larger preview sizes, and marks fallback
downloads with a `[sample]` prefix in the filename when the original cannot be
retrieved.

For videos and animated GIFs, the script asks X/Twitter's internal tweet API for
the post media list and chooses the highest bitrate downloadable variant.

## Filename format

Downloads are named from tweet and media metadata so files remain searchable
after they leave the browser.

Image files use:

```text
[twitter]{sampleText} {author}—{lastModifiedDate}—{tweetId}—{name}.{extension}
```

Video files use:

```text
[twitter] {author}—{lastModifiedDate}—{tweetId}—{name}.{extension}
```

Profile banner files use:

```text
[twitter][bg] {username}—{lastModifiedDate}—{id}—{seconds}.{extension}
```

The date is based on the media response's `Last-Modified` header, not the local
download time.

## Extra page features

Several non-download features are enabled by default:

- **Direct Links** replaces visible `t.co` redirect links with the expanded URL
  when the destination can be reconstructed from the page.
- **Enhanced Title** cleans up open-tweet page titles and expands shortened
  links where possible.
- **Highlight Visited Links** colors visited links, defaulting to absolute
  external links only.
- **Hide Trends** hides the Trends section in the right column when the current
  page language is supported.

Some older or more fragile options remain in the settings UI but are disabled by
default, including hiding sign-up sections, hiding login popups, expanding some
sensitive-content prompts, and redirecting from mobile Twitter URLs.

## Settings menu

Open the userscript manager menu and choose **Show settings**.

The settings modal lets you toggle:

- image download buttons
- video download buttons
- direct links
- enhanced title handling
- visited-link highlighting
- trends hiding
- download button border
- Firefox strict tracking protection workaround

The settings modal also includes history tools:

- **Export** downloads a JSON backup of X-Loader settings and download history.
- **Import** replaces local settings/history from a JSON backup.
- **Merge** combines a backup with the existing local history.

Reload the page after changing settings. The script stores settings and download
history in `localStorage`.

## Download history

X-Loader keeps local history to avoid presenting already saved media as new.

Image history is tracked by image name by default. A hidden setting can switch
image history to tweet ID, but that mode treats all images in the same tweet as
the same saved item. Video history is tracked by tweet ID plus media index.

History only lives in the browser profile where the userscript runs unless you
export and import it manually.

## Browser notes

The script is intended to run in userscript managers such as Tampermonkey,
Violentmonkey, or a Safari userscript extension that supports standard
userscript metadata.

Current compatibility work includes:

- no regex lookbehind dependency in the userscript code path
- deferred startup until `document.body` exists
- attached temporary anchor elements for blob downloads
- Safari-safe response progress handling
- Firefox strict tracking protection support through the settings option

The script grants only:

```text
GM.registerMenuCommand
```

Media downloads are performed through page `fetch`, blob URLs, and browser
downloads.

## Installation

Install the userscript from:

```text
https://raw.githubusercontent.com/paytonison/x-loader/main/X-Loader.user.js
```

The metadata block also points `@downloadURL` and `@updateURL` at that file.

## Development

The project is intentionally small:

```text
X-Loader.user.js
README.md
```

Useful local checks:

```sh
node --check X-Loader.user.js
git diff --check
```

Because X/Twitter changes its DOM and internal API shapes frequently, behavior
should be tested in the browser after any selector, API, or media-handling
change.
