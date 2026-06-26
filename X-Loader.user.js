// ==UserScript==
// @name        X-Loader
// @version     v1.1.1
// @namespace   gh.paytonison
// @description Userscript that adds compact media download buttons for images, videos, GIFs, and banners on X/Twitter.
// @match       https://twitter.com/*
// @match       https://x.com/*
// @homepageURL https://github.com/paytonison/x-loader
// @supportURL  https://github.com/paytonison/x-loader/issues
// @license     GPL-3.0
// @grant       GM.registerMenuCommand
// @grant       GM_registerMenuCommand
// @grant       GM.xmlHttpRequest
// @grant       GM_xmlhttpRequest
// @grant       GM.download
// @grant       GM_download
// @connect     pbs.twimg.com
// @connect     video.twimg.com
// @connect     abs.twimg.com
// @connect     twitter.com
// @connect     x.com
// @downloadURL https://raw.githubusercontent.com/paytonison/x-loader/main/X-Loader.user.js
// @updateURL   https://raw.githubusercontent.com/paytonison/x-loader/main/X-Loader.user.js
// ==/UserScript==
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------

// Please report bugs and suggestions on GitHub.
// --> https://github.com/paytonison/x-loader/issues <--

// ---------------------------------------------------------------------------------------------------------------------
const sitename = location.hostname.replace(".com", ""); // "twitter" | "x"
// ---------------------------------------------------------------------------------------------------------------------
// --- "Imports" --- //
const { StorageNames, StorageNamesOld } = getStorageNames();

const { verbose, debugPopup } = getDebugSettings(); // --- For debug --- //
// localStorage.setItem("ujs-twitter-click-n-save-verbose",  true); // To  enable the debug console log
// localStorage.setItem("ujs-twitter-click-n-save-verbose", false); // To disable the debug console log

const {
  sleep,
  fetchResource,
  downloadFile,
  downloadBlob,
  addCSS,
  getCookie,
  throttle,
  xpath,
  xpathAll,
  formatDate,
  toLineJSON,
  isFirefox,
  isFirefoxUserscriptContext,
  getBrowserName,
  removeSearchParams,
  renderTemplateString,
  formatSizeWinLike,
} = getUtils({ verbose });

const LS = hoistLS({ verbose });

const API = hoistAPI();
const Tweet = hoistTweet();
const Features = hoistFeatures();
const I18N = getLanguageConstants();

const {
  downloadedImages,
  downloadedImageTweetIds,
  downloadedVideoTweetIds,
  imagesHistoryBy,
} = getLocalStorages();

// ---------------------------------------------------------------------------------------------------------------------

function getStorageNames() {
  // New LocalStorage key names 2023.07.05
  const StorageNames = {
    settings: "ujs-twitter-click-n-save-settings",
    settingsImageHistoryBy:
      "ujs-twitter-click-n-save-settings-image-history-by",
    downloadedImageNames: "ujs-twitter-click-n-save-downloaded-image-names",
    downloadedImageTweetIds:
      "ujs-twitter-click-n-save-downloaded-image-tweet-ids",
    downloadedVideoTweetIds:
      "ujs-twitter-click-n-save-downloaded-video-tweet-ids",

    migrated: "ujs-twitter-click-n-save-migrated", // Currently unused
    browserName: "ujs-twitter-click-n-save-browser-name", // Hidden settings
    verbose: "ujs-twitter-click-n-save-verbose", // Hidden settings for debug
    debugPopup: "ujs-twitter-click-n-save-debug-popup", // Hidden settings for debug
  };
  const StorageNamesOld = {
    settings: "ujs-click-n-save-settings",
    settingsImageHistoryBy: "ujs-images-history-by",
    downloadedImageNames: "ujs-twitter-downloaded-images-names",
    downloadedImageTweetIds: "ujs-twitter-downloaded-image-tweet-ids",
    downloadedVideoTweetIds: "ujs-twitter-downloaded-video-tweet-ids",
  };
  return { StorageNames, StorageNamesOld };
}

function getDebugSettings() {
  let verbose = false;
  let debugPopup = false;
  try {
    verbose = Boolean(JSON.parse(localStorage.getItem(StorageNames.verbose)));
  } catch (err) {}
  try {
    debugPopup = Boolean(
      JSON.parse(localStorage.getItem(StorageNames.debugPopup)),
    );
  } catch (err) {}

  return { verbose, debugPopup };
}

const historyHelper = getHistoryHelper();
historyHelper.migrateLocalStore();

// ---------------------------------------------------------------------------------------------------------------------
/**
 * UTC time. Supports: (YYYY/YY).MM.DD hh:mm:ss.
 * The only recommended value order: Year -> Month -> Day -> hour -> minute -> second
 * OK: "YYYY.MM.DD", "YYYY-MM-DD", "YYYYMMDD_hhmmss".
 * Not OK: "DD-MM-YYYY", "MM-DD-YYYY".
 * @see formatDate
 */
const datePattern = "YYYY.MM.DD";

/**
 * I strongly do NOT recommend to change the filename pattern format.
 *
 * The filename may look a bit long, but here I wrote why the used filename pattern is the way it is:
 * Keep the date, author, tweet id, and media name in the filename so repeated downloads remain easy to identify.
 *
 * If you really need to change it, and you understand WHAT and WHY you do,
 * you can modify the follow lines in the source code.
 *
 * Note, that the script updating will overwrite the changes.
 * */
const imageFilenameTemplate = `[twitter]{sampleText} {author}—{lastModifiedDate}—{tweetId}—{name}.{extension}`;
const videoFilenameTemplate = `[twitter] {author}—{lastModifiedDate}—{tweetId}—{name}.{extension}`;
const backgroundFilenameTemplate = `[twitter][bg] {username}—{lastModifiedDate}—{id}—{seconds}.{extension}`;

// ---------------------------------------------------------------------------------------------------------------------

registerMenuCommand("Show settings", showSettings);

function registerMenuCommand(caption, handler) {
  if (
    typeof GM === "object" &&
    GM &&
    typeof GM.registerMenuCommand === "function"
  ) {
    void GM.registerMenuCommand(caption, handler);
    return;
  }
  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand(caption, handler);
  }
}

const settings = loadSettings();

if (verbose) {
  console.log("[ujs][settings]", settings);
}
if (debugPopup) {
  showSettings();
}

// ---------------------------------------------------------------------------------------------------------------------

const fetch = ujs_getGlobalFetch({
  verbose,
  strictTrackingProtectionFix: settings.strictTrackingProtectionFix,
});

/**
 * Returns a fetch function compatible with Firefox's Strict Tracking Protection
 * ("Enhanced Tracking Protection" - "Strict").
 * Fixes `TypeError: NetworkError when attempting to fetch resource.`.
 * @param {Object} [options]
 * @param {boolean} [options.verbose=false]
 * @param {boolean} [options.strictTrackingProtectionFix=true]
 * @returns {Function} A fetch function (either native or fixed for Firefox).
 */
function ujs_getGlobalFetch({
  verbose = false,
  strictTrackingProtectionFix = true,
} = {}) {
  // Note: `wrappedJSObject` is Firefox only object
  const hasWrappedFetch =
    isFirefoxUserscriptContext && typeof wrappedJSObject.fetch === "function";
  if (strictTrackingProtectionFix && hasWrappedFetch) {
    return function fixedFirefoxFetch(resource, init = {}) {
      verbose && console.log("[ujs][wrappedJSObject.fetch]", resource, init);
      if (init.headers instanceof Headers) {
        // `Headers` object is not allowed for structured cloning.
        init.headers = Object.fromEntries(init.headers.entries());
      }
      return wrappedJSObject.fetch(
        cloneInto(resource, document),
        cloneInto(init, document),
      );
    };
  }
  return globalThis.fetch;
}

// ---------------------------------------------------------------------------------------------------------------------
// --- Features to execute --- //

const doNotPlayVideosAutomatically = false; // Hidden settings

function execFeaturesOnce() {
  settings.goFromMobileToMainSite && Features.goFromMobileToMainSite();
  settings.addRequiredCSS && Features.addRequiredCSS();
  settings.hideSignUpBottomBarAndMessages &&
    Features.hideSignUpBottomBarAndMessages(doNotPlayVideosAutomatically);
  settings.hideTrends && Features.hideTrends();
  settings.highlightVisitedLinks && Features.highlightVisitedLinks();
  settings.hideLoginPopup && Features.hideLoginPopup();
}
function execFeaturesImmediately() {
  // settings.expandSpoilers     && Features.expandSpoilers(); // 2025.08.08 // "Scan to confirm your age" popup
}
function execFeatures() {
  settings.imagesHandler && Features.imagesHandler();
  settings.videoHandler && Features.videoHandler();
  // settings.expandSpoilers     && Features.expandSpoilers(); // 2025.08.08 // "Scan to confirm your age" popup
  settings.hideSignUpSection && Features.hideSignUpSection();
  settings.directLinks && Features.directLinks();
  settings.handleTitle && Features.handleTitle();
}

// ---------------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------
// --- Script runner --- //

(function starter(feats) {
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", () => starter(feats), {
      once: true,
    });
    return;
  }

  const { once, onChangeImmediate, onChange } = feats;

  once();
  onChangeImmediate();
  const onChangeThrottled = throttle(onChange, 250);
  onChangeThrottled();

  const targetNode = document.body;
  const observerOptions = {
    subtree: true,
    childList: true,
  };
  const observer = new MutationObserver(callback);
  observer.observe(targetNode, observerOptions);

  function callback(mutationList, _observer) {
    verbose && console.log("[ujs][mutationList]", mutationList);
    onChangeImmediate();
    onChangeThrottled();
  }
})({
  once: execFeaturesOnce,
  onChangeImmediate: execFeaturesImmediately,
  onChange: execFeatures,
});

// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------

function loadSettings() {
  const defaultSettings = {
    hideTrends: true,
    hideSignUpSection: false,
    hideSignUpBottomBarAndMessages: false,
    doNotPlayVideosAutomatically: false,
    goFromMobileToMainSite: false,

    highlightVisitedLinks: true,
    highlightOnlySpecialVisitedLinks: true,
    expandSpoilers: false,

    directLinks: true,
    handleTitle: true,

    imagesHandler: true,
    videoHandler: true,
    addRequiredCSS: true,

    hideLoginPopup: false,
    addBorder: true,

    strictTrackingProtectionFix: true,
  };

  let savedSettings;
  try {
    savedSettings =
      JSON.parse(localStorage.getItem(StorageNames.settings)) || {};
  } catch (err) {
    console.error("[ujs][parse-settings]", err);
    localStorage.removeItem(StorageNames.settings);
    savedSettings = {};
  }
  savedSettings = Object.assign(defaultSettings, savedSettings);
  return savedSettings;
}
function showSettings() {
  closeSetting();
  if (window.scrollY > 0) {
    document.querySelector("html").classList.add("ujs-scroll-initial");
    document.body.classList.add("ujs-scrollbar-width-margin-right");
  }
  document.body.classList.add("ujs-no-scroll");

  const modalWrapperStyle = `
    color-scheme: light;
    width: 100%;
    height: 100%;
    position: fixed;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 99999;
    backdrop-filter: blur(4px);
    background-color: rgba(255, 255, 255, 0.5);
  `;
  const modalSettingsStyle = `
    background-color: white;
    min-width: 320px;
    min-height: 320px;
    border: 1px solid darkgray;
    padding: 8px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  `;
  const s = settings;
  const strictTrackingProtectionFixFFTitle = `Choose this if you use Firefox with "Enhanced Tracking Protection" set to "Strict".`;
  document.body.insertAdjacentHTML(
    "afterbegin",
    `
  <div class="ujs-modal-wrapper" style="${modalWrapperStyle}">
      <div class="ujs-modal-settings" style="${modalSettingsStyle}">
          <fieldset>
              <legend>Optional</legend>
              <label title="Makes the button more visible"><input type="checkbox" ${s.addBorder ? "checked" : ""} name="addBorder">Add a white border to the download button<br/></label>
              <label title="WARNING: It may broke the login page, but it works fine if you logged in and want to hide 'Messages'"><input type="checkbox" ${s.hideSignUpBottomBarAndMessages ? "checked" : ""} name="hideSignUpBottomBarAndMessages">Hide <strike><b>Sign Up Bar</b> and</strike> <b>Messages</b> and <b>Cookies</b> (in the bottom). <span title="WARNING: It may broke the login page!">(beta)</span><br/></label>
              <label><input type="checkbox" ${s.hideTrends ? "checked" : ""} name="hideTrends">Hide <b>Trends</b> (in the right column)*<br/></label>
              <label hidden><input type="checkbox" ${s.doNotPlayVideosAutomatically ? "checked" : ""} name="doNotPlayVideosAutomatically">Do <i>Not</i> Play Videos Automatically</b><br/></label>
              <label hidden><input type="checkbox" ${s.goFromMobileToMainSite ? "checked" : ""} name="goFromMobileToMainSite">Redirect from Mobile version (beta)<br/></label>
          </fieldset>
          <fieldset>
              <legend>Recommended</legend>
              <label><input type="checkbox" ${s.highlightVisitedLinks ? "checked" : ""} name="highlightVisitedLinks">Highlight Visited Links<br/></label>
              <label title="In most cases absolute links are 3rd-party links"><input type="checkbox" ${s.highlightOnlySpecialVisitedLinks ? "checked" : ""} name="highlightOnlySpecialVisitedLinks">Highlight Only Absolute Visited Links<br/></label>
          </fieldset>
          <fieldset>
              <legend>Highly Recommended</legend>
              <label><input type="checkbox" ${s.directLinks ? "checked" : ""} name="directLinks">Direct Links</label><br/>
              <label><input type="checkbox" ${s.handleTitle ? "checked" : ""} name="handleTitle">Enchance Title*<br/></label>
          </fieldset>
          <fieldset ${isFirefox ? "" : 'style="display: none"'}>
              <legend>Firefox only</legend>
              <label title='${strictTrackingProtectionFixFFTitle}'><input type="checkbox" ${s.strictTrackingProtectionFix ? "checked" : ""} name="strictTrackingProtectionFix">Strict Tracking Protection Fix<br/></label>
          </fieldset>
          <fieldset>
              <legend>Main</legend>
              <label><input type="checkbox" ${s.imagesHandler ? "checked" : ""} name="imagesHandler">Image Download Button<br/></label>
              <label><input type="checkbox" ${s.videoHandler ? "checked" : ""} name="videoHandler">Video Download Button<br/></label>
              <label hidden><input type="checkbox" ${s.addRequiredCSS ? "checked" : ""} name="addRequiredCSS">Add Required CSS*<br/></label><!-- * Only for the image download button in /photo/1 mode -->
          </fieldset>
          <fieldset>
              <legend title="Outdated due to Twitter's updates, or impossible to reimplement">Outdated</legend>
              <strike>

              <label><input type="checkbox" ${s.hideSignUpSection ? "checked" : ""} name="hideSignUpSection">Hide <b title='"New to Twitter?" (If yoy are not logged in)'>Sign Up</b> section (in the right column)*<br/></label>
              <label title="Hides the modal login pop up. Useful if you have no account. \nWARNING: Currently it will close any popup, not only the login one.\nIt's recommended to use only if you do not have an account to hide the annoiyng login popup."><input type="checkbox" ${s.hideLoginPopup ? "checked" : ""} name="hideLoginPopup">Hide <strike>Login</strike> Popups. (beta)<br/></label>
              <label title="Note: since the recent update the most NSFW spoilers are impossible to expand without an account"><input type="checkbox" ${s.expandSpoilers ? "checked" : ""} name="expandSpoilers">Expand Spoilers (if possible)*<br/></label>

              </strike>
          </fieldset>
          <hr>
          <div style="display: flex; justify-content: space-around;">
              <div>
                History:
                <button class="ujs-reload-export-button" style="padding: 5px" >Export</button>
                <button class="ujs-reload-import-button" style="padding: 5px" >Import</button>
                <button class="ujs-reload-merge-button"  style="padding: 5px" >Merge</button>
              </div>
              <div>
                <button class="ujs-reload-setting-button" style="padding: 5px" title="Reload the web page to apply changes">Reload page</button>
                <button class="ujs-close-setting-button" style="padding: 5px" title="Just close this popup.\nNote: You need to reload the web page to apply changes.">Close popup</button>
              </div>
          </div>
          <hr>
          <h4 style="margin: 0; padding-left: 8px; color: #444;">Notes:</h4>
          <ul style="margin: 2px; padding-left: 16px; color: #444;">
            <li><b>Reload the page</b> to apply changes.</li>
            <li><b>*</b>-marked settings are language dependent. Currently, the follow languages are supported:<br/> "en", "ru", "es", "zh", "ja".</li>
            <li hidden>The extension downloads only from twitter.com, not from <b>mobile</b>.twitter.com</li>
          </ul>
      </div>
  </div>`,
  );

  async function onDone(button) {
    button.classList.remove("ujs-btn-error");
    button.classList.add("ujs-btn-done");
    await sleep(900);
    button.classList.remove("ujs-btn-done");
  }
  async function onError(button, err) {
    button.classList.remove("ujs-btn-done");
    button.classList.add("ujs-btn-error");
    button.title = err.message;
    await sleep(1800);
    button.classList.remove("ujs-btn-error");
  }

  const exportButton = document.querySelector(
    "body > .ujs-modal-wrapper .ujs-reload-export-button",
  );
  const importButton = document.querySelector(
    "body > .ujs-modal-wrapper .ujs-reload-import-button",
  );
  const mergeButton = document.querySelector(
    "body > .ujs-modal-wrapper .ujs-reload-merge-button",
  );

  exportButton.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await historyHelper.exportHistory(
      () => onDone(button),
      (err) => onError(button, err),
    );
  });
  sleep(50).then(() => {
    const infoObj = getStoreInfo();
    exportButton.title = Object.entries(infoObj).reduce((acc, [key, value]) => {
      acc += `${key}: ${value}\n`;
      return acc;
    }, "");
  });

  importButton.addEventListener("click", (event) => {
    const button = event.currentTarget;
    historyHelper.importHistory(
      () => onDone(button),
      (err) => onError(button, err),
    );
  });
  mergeButton.addEventListener("click", (event) => {
    const button = event.currentTarget;
    historyHelper.mergeHistory(
      () => onDone(button),
      (err) => onError(button, err),
    );
  });

  document
    .querySelector("body > .ujs-modal-wrapper .ujs-reload-setting-button")
    .addEventListener("click", () => {
      location.reload();
    });

  const checkboxList = document.querySelectorAll(
    "body > .ujs-modal-wrapper input[type=checkbox], body > .ujs-modal-wrapper input[type=radio]",
  );
  checkboxList.forEach((checkbox) => {
    checkbox.addEventListener("change", saveSetting);
  });

  document
    .querySelector("body > .ujs-modal-wrapper .ujs-close-setting-button")
    .addEventListener("click", closeSetting);

  function saveSetting() {
    const entries = [
      ...document.querySelectorAll(
        "body > .ujs-modal-wrapper input[type=checkbox]",
      ),
    ].map((checkbox) => [checkbox.name, checkbox.checked]);
    const radioEntries = [
      ...document.querySelectorAll(
        "body > .ujs-modal-wrapper input[type=radio]",
      ),
    ].map((checkbox) => [checkbox.value, checkbox.checked]);
    const settings = Object.fromEntries([entries, radioEntries].flat());
    // verbose && console.log("[ujs][save-settings]", settings);
    localStorage.setItem(StorageNames.settings, JSON.stringify(settings));
  }

  function closeSetting() {
    document.body.classList.remove("ujs-no-scroll");
    document.body.classList.remove("ujs-scrollbar-width-margin-right");
    document.querySelector("html").classList.remove("ujs-scroll-initial");
    document.querySelector("body > .ujs-modal-wrapper")?.remove();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
// --- Twitter Specific code --- //

function getLocalStorages() {
  const downloadedImages = new LS(StorageNames.downloadedImageNames);
  const downloadedImageTweetIds = new LS(StorageNames.downloadedImageTweetIds);
  const downloadedVideoTweetIds = new LS(StorageNames.downloadedVideoTweetIds);

  // --- That to use for the image history --- //
  /** @type {"TWEET_ID" | "IMAGE_NAME"} */
  const imagesHistoryBy = LS.getItem(
    StorageNames.settingsImageHistoryBy,
    "IMAGE_NAME",
  ); // Hidden settings
  // With "TWEET_ID" downloading of 1 image of 4 will mark all 4 images as "already downloaded"
  // on the next time when the tweet will appear.
  // "IMAGE_NAME" will count each image of a tweet, but it will take more data to store.

  return {
    downloadedImages,
    downloadedImageTweetIds,
    downloadedVideoTweetIds,
    imagesHistoryBy,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// --- Twitter.Features --- //
function hoistFeatures() {
  // ❌ image
  const errorStyle = `background-image: url("https://abs-0.twimg.com/emoji/v2/svg/274c.svg"); background-size: 1.5em; background-position: center; background-repeat: no-repeat;`;
  // ⚠  image
  const warningStyle = `background-image: url("https://abs-0.twimg.com/emoji/v2/svg/26a0.svg"); background-size: 1.5em; background-position: center; background-repeat: no-repeat;`;

  class Btn {
    /**
     * @example
     *   Btn.error({
     *      btn, err,
     *      text: "Something failed.",
     *   });
     * @param {object}  opts
     * @param {HTMLElement} opts.btn
     * @param {Error}       opts.err
     * @param {string}  [opts.text = ""]
     */
    static error({ btn, err, text = "" } = {}) {
      if (verbose) {
        console.error(err);
      }
      const btnErrorTextElem = btn.querySelector(".ujs-btn-error-text");
      Btn.finishDownloading(btn);
      btn.classList.add("ujs-error");
      btnErrorTextElem.textContent = "";
      btnErrorTextElem.style.cssText = errorStyle;
      let title = err.message;
      if (text) {
        title = text + "\n" + err.message;
      }
      if (title.includes("{ffHint}")) {
        title = title.replace("{ffHint}", Btn.getFFHint());
      }
      btn.title = title;
      err.message = title;
      return err;
    }
    static warning({ btn, text = "" } = {}) {
      const btnErrorTextElem = btn.querySelector(".ujs-btn-error-text");
      btn.classList.add("ujs-error");
      btnErrorTextElem.textContent = "";
      btnErrorTextElem.style.cssText = warningStyle;
      btn.title = "[warning] " + text;
    }
    static getFFHint() {
      const needFFHint =
        (isFirefox || isFirefoxUserscriptContext) &&
        !settings.strictTrackingProtectionFix;
      const ffHint = needFFHint
        ? "\nTry to enable 'Strict Tracking Protection Fix' in the userscript settings."
        : "";
      return ffHint;
    }
    static clearState(btn) {
      const btnErrorTextElem = btn.querySelector(".ujs-btn-error-text");
      if (btn.textContent !== "") {
        btnErrorTextElem.textContent = "";
      }
      btn.classList.remove("ujs-error");
    }
    static alreadyDownloaded(btn) {
      btn.classList.add("ujs-already-downloaded");
    }
    static startDownloading(btn) {
      // on the button click, let's start do things
      btn.classList.add("ujs-downloading");
    }
    static finishDownloading(btn) {
      btn.classList.remove("ujs-downloading");
    }
    static connectionWaiting(btn) {
      // the resource request was sent, waiting for the response
      btn.title = "Downloading... (waiting for connection)";
    }
    /**
     * @param {MouseEvent} event
     * @return HTMLElement
     */
    static getBtnElemFromEvent(event) {
      /** @type HTMLElement */
      const btn = event.currentTarget;
      if (!btn.classList.contains("ujs-btn-download")) {
        if (verbose) {
          console.error("[ujs][warning] Download button element not found");
        }
        throw new Error("Download button element not found");
      }
      return btn;
    }
    static getOnProgress(btn) {
      const btnProgress = btn.querySelector(".ujs-progress");
      const onProgress = ({ loaded, total }) => {
        const loadedNumber = Number(loaded) || 0;
        const totalNumber = Number(total) || 0;
        const progress =
          totalNumber > 0
            ? Math.min(90, (loadedNumber / totalNumber) * 90)
            : loadedNumber > 0
              ? 12
              : 6;
        btnProgress.style.cssText = "--progress: " + progress + "%";
        btnProgress.dataset.downloaded = loadedNumber;
        btnProgress.dataset.total = totalNumber;
        if (totalNumber <= 0) {
          btn.title = `Downloading: ${formatSizeWinLike(loadedNumber)}`;
        } else {
          btn.title = `Downloading: ${formatSizeWinLike(loadedNumber)} / ${formatSizeWinLike(totalNumber)}`;
        }
      };
      return onProgress;
    }
    static completeProgress(btn) {
      const btnProgress = btn.querySelector(".ujs-progress");
      btnProgress.style.cssText = "--progress: 100%";
      if (btn.title.startsWith("Downloading:")) {
        btn.title = `Downloaded: ${formatSizeWinLike(Number(btnProgress.dataset.downloaded))}`;
      }
    }
    static resetProgress(btn) {
      const btnProgress = btn.querySelector(".ujs-progress");
      btnProgress.style.cssText = "--progress: 0%";
    }

    static resetMediaProgress(btn) {
      const mediaProgress = btn.querySelector(".ujs-media-progress");
      mediaProgress.style.cssText = "--media-progress: 0%";
      btn.classList.remove("ujs-media-progress-complete");
    }
    static setMediaProgress(btn, downloaded, total) {
      const mediaProgress = btn.querySelector(".ujs-media-progress");
      const progress =
        total > 0 ? Math.min(100, (downloaded / total) * 100 + 10) : 0;
      mediaProgress.style.cssText =
        "--media-progress: " + progress + "%";
      btn.classList.toggle("ujs-media-progress-complete", progress >= 100);
    }
    static isDownloaded(btn) {
      return (
        btn.classList.contains("ujs-already-downloaded") ||
        btn.classList.contains("ujs-downloaded")
      );
    }
    static markAsNotDownloaded(btn) {
      btn.classList.remove("ujs-downloaded");
      btn.classList.remove("ujs-recently-downloaded");
    }
    static markAsDownloaded(btn) {
      btn.classList.remove("ujs-downloading");
      btn.classList.remove("ujs-recently-downloaded");
      btn.classList.add("ujs-downloaded");
      btn.addEventListener(
        "pointerenter",
        (_) => {
          btn.classList.add("ujs-recently-downloaded");
        },
        { once: true },
      );
    }
    static createButton({ url, downloaded, isVideo, isThumb, isMultiMedia }) {
      const btn = document.createElement("div");
      btn.innerHTML = `
<div class="ujs-btn-common ujs-btn-background">
  <div class="ujs-dot ujs-multimedia-icon ujs-media-progress" style="--media-progress: 0%"></div>
  <div class="ujs-dot ujs-multimedia-icon ujs-back"></div>
</div>
<div class="ujs-btn-common ujs-hover"></div>
<div class="ujs-btn-common ujs-shadow"></div>
<div class="ujs-btn-common ujs-progress" style="--progress: 0%"></div>
<div class="ujs-btn-common ujs-btn-error-text"></div>`.trimStart();
      btn.classList.add("ujs-btn-download");
      if (!downloaded) {
        btn.classList.add("ujs-not-downloaded");
      } else {
        btn.classList.add("ujs-already-downloaded");
      }
      if (isVideo) {
        btn.classList.add("ujs-video");
      }
      if (url) {
        btn.dataset.url = url;
      }
      if (isThumb) {
        btn.dataset.thumb = "true";
      }
      if (isMultiMedia) {
        btn.dataset.isMultiMedia = "true";
      }
      return btn;
    }
  }

  class ImageHistory {
    static _getImageNameFromUrl(url) {
      const _url = new URL(url);
      const filename = _url.pathname.slice(_url.pathname.lastIndexOf("/") + 1);
      return filename.split(".")[0]; // remove extension
    }
    static isDownloaded({ id, url }) {
      if (imagesHistoryBy === "TWEET_ID") {
        return downloadedImageTweetIds.hasItem(id);
      } else if (imagesHistoryBy === "IMAGE_NAME") {
        const name = ImageHistory._getImageNameFromUrl(url);
        return downloadedImages.hasItem(name);
      }
    }
    static async markDownloaded({ id, url }) {
      if (imagesHistoryBy === "TWEET_ID") {
        await downloadedImageTweetIds.pushItem(id);
      } else if (imagesHistoryBy === "IMAGE_NAME") {
        const name = ImageHistory._getImageNameFromUrl(url);
        await downloadedImages.pushItem(name);
      }
    }
  }

  class VideoHistory {
    static _getHistoryId(tweetId, videoIndex) {
      return videoIndex /* not 0 */ ? tweetId + "-" + videoIndex : tweetId;
    }
    static isDownloaded({ tweetId, videoIndex = 0 } = {}) {
      return downloadedVideoTweetIds.hasItem(
        this._getHistoryId(tweetId, videoIndex),
      );
    }
    static async markDownloaded({ tweetId, videoIndex }) {
      await downloadedVideoTweetIds.pushItem(
        this._getHistoryId(tweetId, videoIndex),
      );
    }
  }

  /** @param {HTMLImageElement} img */
  function getImgParentElem(img) {
    // find the parent "a"
    // - for an image in a tweet ("expanded_url" - "/_/status/123456/photo/1")
    // - or for an image/video on "/media" page (".../photo/1" / ".../video/1").
    let parentElem = img.closest("a");
    if (!parentElem) {
      // for video posters, or when `location.href` is "expanded_url"
      verbose &&
        console.log(
          `[ujs][getImgParentElem] No parent "expanded_url" link`,
          img,
        );
      parentElem = img.parentElement;
    }
    return parentElem;
  }
  /** @param {HTMLImageElement} img */
  function isImageThumb(img) {
    const listItemEl = img.closest(`li[role="listitem"]`); // The image on "/media" page
    return Boolean(listItemEl);
  }
  const AGE_RESTRICTED_PLACEHOLDER_IMAGE_URL =
    "https://pbs.twimg.com/media/GxJIrSUagAAK-ZP?format=jpg&name=240x240";

  /** @param {HTMLImageElement} img */
  async function skipImage(img) {
    // X serves this placeholder instead of user media for some age-restricted posts.
    if (img.src === AGE_RESTRICTED_PLACEHOLDER_IMAGE_URL) {
      return true;
    }
    if (img.width === 0) {
      const imgOnload = new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
      });
      await Promise.race([imgOnload, sleep(500)]);
      await sleep(10); // to get updated img.width
    }
    return img.width < 140;
  }

  class Core {
    static async imagesHandler() {
      verbose && console.log("[ujs][imagesHandler]");
      const images = document.querySelectorAll(
        `img:not([data-handled]):not([src$=".svg"])`,
      );
      for (const img of images) {
        // let's mark them first, since handling is one by one with `await`
        img.dataset.handled = "true";
      }
      for (const img of images) {
        if (await skipImage(img)) {
          continue;
        }
        verbose &&
          console.log("[ujs][imagesHandler]", { img, img_width: img.width });

        const parentElem = getImgParentElem(img);
        const isThumb = isImageThumb(img);
        const isVideoThumb = Core._isVideoPoster(img);
        if (isThumb && parentElem.querySelector("svg")) {
          Core._multiMediaThumbHandler(img, isThumb, parentElem, isVideoThumb);
          continue;
        }
        const isVideoPoster = isVideoThumb || Core._isVideoTweet(img);
        if (isVideoPoster) {
          Core._videoPosterHandler(img, isThumb, parentElem);
          continue;
        }
        Core._imagesHandler(img, isThumb, parentElem);
      }
    }
    static _imagesHandler(img, isThumb, btnPlace) {
      const btn = Btn.createButton({ url: img.src, isThumb });
      btn.addEventListener("click", Core._imageClickHandler);
      btnPlace.append(btn);

      const downloaded = ImageHistory.isDownloaded({
        id: Tweet.of(btn).id,
        url: btn.dataset.url,
      });
      if (downloaded) {
        Btn.alreadyDownloaded(btn);
      }
      void sleep(50).then(() => {
        if (location.href.includes("/status/")) {
          const rect = btn.getBoundingClientRect();
          if (rect.x < 55 && rect.y < 55) {
            btn.style.marginLeft = "2.5%";
            btn.style.marginTop = "0.5%";
          }
        }
      });
    }

    /** @param {HTMLImageElement} img */
    static _isVideoPoster(img) {
      const result =
        img.src.includes("ext_tw_video_thumb") ||
        img.src.includes("amplify_video_thumb") ||
        img.src.includes("tweet_video_thumb"); /* GIF thumb */
      return result;
    }
    /** @param {HTMLImageElement} img */ // seems outdated // todo: delete
    static _isVideoTweet(img) {
      const result =
        img.alt === "Animated Text GIF" ||
        img.alt === "Embedded video" ||
        img.closest(`a[aria-label="Embedded video"]`);
      verbose && console.log("[ujs][_isVideoTweet]", result, img);
      return result;
    }

    static tweetVidWeakMapPoster = new WeakMap();
    static tweetVidWeakMap = new WeakMap();
    static async videoHandler() {
      const videos = document.querySelectorAll("video:not([data-handled])");
      for (const video of videos) {
        if (video.dataset.handled) {
          continue;
        }
        video.dataset.handled = "true";
        verbose && console.log("[ujs][videoHandler][video]", video);

        const poster = video.getAttribute("poster");

        const btn = Btn.createButton({ url: poster, isVideo: true });
        btn.addEventListener("click", Core._videoClickHandler);

        const videoComponentElem = video.closest(
          `[data-testid="videoComponent"]`,
        );
        if (videoComponentElem) {
          videoComponentElem.parentElement.append(btn);
        } else {
          // just in case
          video.parentElement.parentElement.parentElement.after(btn);
        }

        const tweet = Tweet.of(btn);
        const tweetId = tweet.id;
        const tweetElem = tweet.elem;
        let videoIndex = 0;

        if (tweetElem) {
          const map = Core.tweetVidWeakMap;
          if (map.has(tweetElem)) {
            videoIndex = map.get(tweetElem) + 1;
            map.set(tweetElem, videoIndex);
          } else {
            map.set(tweetElem, videoIndex); // can throw an error for null
          }
        } else {
          // expanded_url
          await sleep(10);
          const match = location.pathname.match(/\/video\/(\d)/);
          if (!match) {
            verbose &&
              console.log("[ujs][videoHandler] missed match for match");
          }
          videoIndex = Number(match?.[1] || 1) - 1;

          console.warn("[ujs][videoHandler] videoIndex", videoIndex);
          // todo: add support for expanded_url video downloading
        }

        const downloaded = VideoHistory.isDownloaded({ tweetId, videoIndex });
        if (downloaded) {
          Btn.alreadyDownloaded(btn);
        }
      }
    }

    static _videoPosterHandler(imgElem, isThumb, btnPlace) {
      verbose && console.log("[ujs][_thumbVideoHandler][vid]", imgElem);

      const btn = Btn.createButton({
        url: imgElem.src,
        isVideo: true,
        isThumb,
      });
      btn.addEventListener("click", Core._videoClickHandler);
      btnPlace.append(btn);

      const tweet = Tweet.of(btn);
      const tweetId = tweet.id;
      const tweetElem = tweet.elem || btn.closest(`[data-testid="tweet"]`);
      let videoIndex = 0;

      if (tweetElem) {
        const map = Core.tweetVidWeakMapPoster;
        if (map.has(tweetElem)) {
          videoIndex = map.get(tweetElem) + 1;
          map.set(tweetElem, videoIndex);
        } else {
          map.set(tweetElem, videoIndex); // can throw an error for null
        }
      } // else thumbnail

      const downloaded = VideoHistory.isDownloaded({ tweetId, videoIndex });
      if (downloaded) {
        Btn.alreadyDownloaded(btn);
      }
    }

    static _multiMediaThumbHandler(imgElem, isThumb, btnPlace, isVideo) {
      verbose && console.log("[ujs][_multiMediaThumbHandler]", imgElem);

      const btn = Btn.createButton({
        url: imgElem.src,
        isVideo,
        isThumb,
        isMultiMedia: true,
      });
      btn.addEventListener("click", Core._multiMediaThumbClickHandler);
      btnPlace.append(btn);

      let downloaded;
      const tweetId = Tweet.of(btn).id;
      if (isVideo) {
        downloaded = VideoHistory.isDownloaded({ tweetId });
      } else {
        downloaded = ImageHistory.isDownloaded({
          id: tweetId,
          url: btn.dataset.url,
        });
      }
      if (downloaded) {
        Btn.alreadyDownloaded(btn);
      }
    }

    static async _imageClickHandler(event) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const btn = Btn.getBtnElemFromEvent(event);
      let url = btn.dataset.url;

      const isBanner = url.includes("/profile_banners/");
      try {
        if (isBanner) {
          await Core._downloadBanner(url, btn);
          return;
        }

        const { id, author } = Tweet.of(btn);
        verbose && console.log("[ujs][_imageClickHandler]", { id, author });
        await Core._downloadPhotoMediaEntry(id, author, url, btn);
      } catch (err) {
        const text = isBanner
          ? "Failed to download the profile banner."
          : "Failed to download the image.";
        throw Btn.error({ btn, err, text });
      }
    }

    static async _downloadBanner(url, btn) {
      // Banner/Background // todo: catch the error // add progress
      Btn.clearState(btn);
      Btn.startDownloading(btn);

      const { blob, lastModifiedDate, extension, name } =
        await fetchResource(url);
      Core._verifyBlob(blob, url);

      const username = location.pathname.slice(1).split("/")[0];
      const bannerMatch = url.match(
        /\/profile_banners\/(\d+)\/(\d+)\/(\d+x\d+)/,
      );
      const [, id, seconds] = bannerMatch || [];
      // https://pbs.twimg.com/profile_banners/34743251/1596331248/1500x500

      const filename = renderTemplateString(backgroundFilenameTemplate, {
        username,
        lastModifiedDate,
        id,
        seconds,
        extension,
      }).value;
      await downloadBlob(blob, filename, url);

      Btn.markAsDownloaded(btn);
    }

    static async _downloadPhotoMediaEntry(id, author, url, btn) {
      Btn.clearState(btn);
      Btn.startDownloading(btn);
      const onProgress = Btn.getOnProgress(btn);

      const originals = ["orig", "4096x4096"];
      const samples = [
        "large",
        "medium",
        "900x900",
        "small",
        "360x360" /*"240x240", "120x120", "tiny"*/,
      ];
      let isSample = false;
      const previewSize = new URL(url).searchParams.get("name");
      if (!samples.includes(previewSize)) {
        samples.push(previewSize);
      }

      function handleImgUrl(url) {
        const urlObj = new URL(url);
        if (originals.length) {
          urlObj.searchParams.set("name", originals.shift());
        } else if (samples.length) {
          isSample = true;
          urlObj.searchParams.set("name", samples.shift());
        } else {
          throw new Error("All fallback URLs are failed to download.");
        }
        if (urlObj.searchParams.get("format") === "webp") {
          urlObj.searchParams.set("format", "jpg");
        }
        const urlStr = urlObj.toString();
        verbose && console.log("[ujs][handleImgUrl][url]", urlStr);
        return urlStr;
      }

      let currentUrl = url;

      async function safeFetchResource(urlStr) {
        while (true) {
          const newUrl = handleImgUrl(urlStr);
          currentUrl = newUrl;
          try {
            return await fetchResource(newUrl, onProgress);
          } catch (err) {
            if (err.status === 404) {
              const urlObj = new URL(newUrl);
              const params = urlObj.searchParams;
              if (
                params.get("name") === "orig" &&
                params.get("format") === "jpg"
              ) {
                params.set("format", "png");
                const newPngUrl = urlObj.toString();
                try {
                  currentUrl = newPngUrl;
                  return await fetchResource(newPngUrl, onProgress);
                } catch (pngErr) {
                  if (pngErr.status !== 404) {
                    throw pngErr;
                  }
                }
              }
            }
            if (!originals.length) {
              Btn.warning({ btn, text: "Original images are not available." });
            }
            if (!samples.length) {
              throw Btn.error({
                btn,
                err,
                text: "All fallback URLs are failed.{ffHint}",
              });
            }
          }
        }
      }

      Btn.connectionWaiting(btn);
      const { blob, lastModifiedDate, extension, name } =
        await safeFetchResource(currentUrl);
      Core._verifyBlob(blob, currentUrl); // throws an error for 503 http status code
      Btn.completeProgress(btn);

      const sampleText = isSample ? "[sample]" : ""; // "[sample]" prefix, when the original image is not available to download
      const filename = renderTemplateString(imageFilenameTemplate, {
        author,
        lastModifiedDate,
        tweetId: id,
        name,
        extension,
        sampleText,
      }).value;
      await downloadBlob(blob, filename, currentUrl);

      const downloaded = Btn.isDownloaded(btn);
      if (!downloaded && !isSample) {
        await ImageHistory.markDownloaded({ id, url: currentUrl });
      }

      if (btn.dataset.isMultiMedia && !isSample) {
        // dirty fix
        const isDownloaded = ImageHistory.isDownloaded({ id, url: currentUrl });
        if (!isDownloaded) {
          await ImageHistory.markDownloaded({ id, url: currentUrl });
        }
      }

      await sleep(40);
      Btn.resetProgress(btn);
      Btn.markAsDownloaded(btn);
    }

    static async _multiMediaThumbClickHandler(event) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const btn = Btn.getBtnElemFromEvent(event);
      Btn.clearState(btn);
      Btn.startDownloading(btn);
      const { id } = Tweet.of(btn);

      /** @type {TweetMediaEntry[]} */
      let medias;
      try {
        medias = await API.getTweetMedias(id);
        medias = medias.filter((mediaEntry) => mediaEntry.tweet_id === id);
      } catch (err) {
        throw Btn.error({
          btn,
          err,
          text: "API.getTweetMedias failed.{ffHint}",
        });
      }
      if (!medias.length) {
        throw Btn.error({
          btn,
          err: new Error("API.getTweetMedias returned no media for tweet " + id),
          text: "No downloadable media found.",
        });
      }

      Btn.resetMediaProgress(btn);
      const total = medias.length;
      let downloaded = 0;

      try {
        for (const mediaEntry of medias) {
          Btn.markAsNotDownloaded(btn);

          if (mediaEntry.type === "video") {
            await Core._downloadVideoMediaEntry(mediaEntry, btn, id);
          } else {
            // "photo"
            const {
              screen_name: author,
              download_url: url,
              tweet_id: id,
            } = mediaEntry;
            await Core._downloadPhotoMediaEntry(id, author, url, btn);
          }

          downloaded++;
          Btn.setMediaProgress(btn, downloaded, total);

          await sleep(50);
        }
      } catch (err) {
        throw Btn.error({
          btn,
          err,
          text: "Failed to download one of the media entries.",
        });
      }
      Btn.markAsDownloaded(btn);
    }

    static async _videoClickHandler(event) {
      // todo: parse the URL from HTML for "GIF"s // https://video.twimg.com/tweet_video/12345Abc.mp4
      event.preventDefault();
      event.stopImmediatePropagation();

      const btn = Btn.getBtnElemFromEvent(event);
      Btn.clearState(btn);
      Btn.startDownloading(btn);

      const { id } = Tweet.of(btn);

      let mediaEntry;
      try {
        const medias = await API.getTweetMedias(id);
        const posterUrl = btn.dataset.url; // [note] if `posterUrl` has `searchParams`, it will have no extension at the end of `pathname`.
        const posterUrlClear = removeSearchParams(posterUrl);
        mediaEntry = medias.find((media) =>
          media.preview_url.startsWith(posterUrlClear),
        );
        verbose &&
          console.log("[ujs][_videoClickHandler] mediaEntry", mediaEntry);
      } catch (err) {
        throw Btn.error({ btn, err, text: "API.getVideoInfo failed.{ffHint}" });
      }

      try {
        await Core._downloadVideoMediaEntry(mediaEntry, btn, id);
      } catch (/** @type Error */ err) {
        throw Btn.error({ btn, err });
      }

      Btn.markAsDownloaded(btn);
    }

    static async _downloadVideoMediaEntry(
      mediaEntry,
      btn,
      id /* of original tweet */,
    ) {
      if (!mediaEntry) {
        throw new Error("No mediaEntry found");
      }
      const {
        screen_name: author,
        tweet_id: videoTweetId,
        download_url: url,
        type_index: videoIndex,
      } = mediaEntry;
      if (!url) {
        throw new Error("No video URL found");
      }

      async function fetchResourceErrWrap(url, onProgress) {
        try {
          return await fetchResource(url, onProgress);
        } catch (err) {
          err.message = "Video download failed.{ffHint}\n" + err.message;
          throw err;
        }
      }

      const onProgress = Btn.getOnProgress(btn);
      Btn.connectionWaiting(btn);
      const { blob, lastModifiedDate, extension, name } =
        await fetchResourceErrWrap(url, onProgress);
      Core._verifyBlob(blob, url);
      Btn.completeProgress(btn);

      const filename = renderTemplateString(videoFilenameTemplate, {
        author,
        lastModifiedDate,
        tweetId: videoTweetId,
        name,
        extension,
      }).value;
      await downloadBlob(blob, filename, url);

      const downloaded = Btn.isDownloaded(btn);
      if (!downloaded) {
        await VideoHistory.markDownloaded({
          tweetId: videoTweetId,
          videoIndex,
        });
        if (videoTweetId !== id) {
          // if QRT // note: a new QRT tweet will not be marked // todo: keep poster url
          await VideoHistory.markDownloaded({ tweetId: id, videoIndex });
        }
      }
      if (btn.dataset.isMultiMedia) {
        // dirty fix
        const isDownloaded = VideoHistory.isDownloaded({
          tweetId: videoTweetId,
          videoIndex,
        });
        if (!isDownloaded) {
          await VideoHistory.markDownloaded({
            tweetId: videoTweetId,
            videoIndex,
          });
          if (videoTweetId !== id) {
            // if QRT
            await VideoHistory.markDownloaded({ tweetId: id, videoIndex });
          }
        }
      }

      await sleep(40);
      Btn.resetProgress(btn);
    }

    static _verifyBlob(blob, url) {
      if (!blob.size) {
        throw new Error("Zero size blob: " + url);
      }
    }

    static addRequiredCSS() {
      const code = getUserScriptCSS();
      addCSS(code);
    }
  }

  class Features extends Core {
    // it depends on `directLinks()` use only it after `directLinks()` // todo: handleTitleNew
    static handleTitle(title) {
      if (!I18N.QUOTES) {
        // Unsupported lang, no QUOTES, ON_TWITTER, TWITTER constants
        return;
      }

      // Handle only an opened tweet
      if (!location.href.match(/(twitter|x)\.com\/[^\/]+\/status\/\d+/)) {
        return;
      }

      let titleText = title || document.title;
      if (titleText === Features.lastHandledTitle) {
        return;
      }
      Features.originalTitle = titleText;

      const [OPEN_QUOTE, CLOSE_QUOTE] = I18N.QUOTES;
      const urlsToReplace = [];
      const titleUrlRegex = new RegExp(
        `https:\\/\\/t\\.co\\/[^ ${CLOSE_QUOTE}]+`,
        "g",
      );
      let titleUrlMatch;
      while ((titleUrlMatch = titleUrlRegex.exec(titleText)) !== null) {
        urlsToReplace.push(titleUrlMatch[0]);
      }
      // the last one may be the URL to the tweet // or to an embedded shared URL

      const map = new Map();
      const anchors = document.querySelectorAll(
        `a[data-redirect^="https://t.co/"]`,
      );
      for (const anchor of anchors) {
        if (urlsToReplace.includes(anchor.dataset.redirect)) {
          map.set(anchor.dataset.redirect, anchor.href);
        }
      }

      const lastUrl = urlsToReplace.slice(-1)[0];
      let lastUrlIsAttachment = false;
      let attachmentDescription = "";
      if (!map.has(lastUrl)) {
        const a = document.querySelector(`a[href="${lastUrl}?amp=1"]`);
        if (a) {
          lastUrlIsAttachment = true;
          attachmentDescription = document.querySelectorAll(
            `a[href="${lastUrl}?amp=1"]`,
          )[1].innerText;
          attachmentDescription = attachmentDescription.split("\n").join(" — ");
        }
      }

      for (const [key, value] of map.entries()) {
        titleText = titleText.split(key).join(value + ` (${key})`);
      }

      titleText = titleText.replace(
        new RegExp(`${I18N.ON_TWITTER}(?= ${OPEN_QUOTE})`),
        ":",
      );
      titleText = titleText.replace(
        new RegExp(`${CLOSE_QUOTE} \\\/ ${I18N.TWITTER}$`),
        CLOSE_QUOTE,
      );
      if (!lastUrlIsAttachment) {
        const regExp = new RegExp(
          `( https:\\/\\/t\\.co\\/.{6,14})${CLOSE_QUOTE}$`,
        );
        titleText = titleText.replace(
          regExp,
          (_match, shortUrl) => `${CLOSE_QUOTE} —${shortUrl}`,
        );
      } else {
        titleText = titleText.replace(
          lastUrl,
          `${lastUrl} (${attachmentDescription})`,
        );
      }
      document.title = titleText; // Note: some characters will be removed automatically (`\n`, extra spaces)
      Features.lastHandledTitle = document.title;
    }
    static lastHandledTitle = "";
    static originalTitle = "";

    static profileUrlCache = new Map();
    static async directLinks() {
      verbose && console.log("[ujs][directLinks]");
      const hasHttp = (url) => Boolean(url.match(/^https?:\/\//));
      const anchors = xpathAll(
        `.//a[starts-with(@href, "https://t.co/") and @dir="ltr" and child::span and not(@data-handled)]`,
      );
      for (const anchor of anchors) {
        const redirectUrl = new URL(anchor.href);
        const shortUrl = redirectUrl.origin + redirectUrl.pathname; // remove "?amp=1"

        const hrefAttr = anchor.getAttribute("href");
        verbose &&
          console.log("[ujs][directLinks]", {
            hrefAttr,
            redirectUrl_href: redirectUrl.href,
            shortUrl,
          });

        anchor.dataset.redirect = shortUrl;
        anchor.dataset.handled = "true";
        anchor.rel = "nofollow noopener noreferrer";

        if (Features.profileUrlCache.has(shortUrl)) {
          anchor.href = Features.profileUrlCache.get(shortUrl);
          continue;
        }

        const nodes = xpathAll(`.//span[text() != "…"] | ./text()`, anchor);
        let url = nodes.map((node) => node.textContent).join("");

        const doubleProtocolPrefix = url.match(/^(https?:\/\/)(?=https?:)/)?.[1];
        if (doubleProtocolPrefix) {
          url = url.slice(doubleProtocolPrefix.length);
          const span = anchor.querySelector(`[aria-hidden="true"]`);
          if (hasHttp(span.textContent)) {
            // Fix Twitter's bug related to text copying
            span.style.cssText = "display: none;";
          }
        }

        anchor.href = url;

        if (anchor.dataset?.testid === "UserUrl") {
          const href = anchor.getAttribute("href");
          const profileUrl = hasHttp(href) ? href : "https://" + href;
          anchor.href = profileUrl;
          verbose && console.log("[ujs][directLinks][profileUrl]", profileUrl);

          // Restore if URL's text content is too long
          if (anchor.textContent.endsWith("…")) {
            anchor.href = shortUrl;

            try {
              const author = location.pathname.slice(1).match(/[^\/]+/)[0];
              const expanded_url = await API.getUserInfo(author); // todo: make lazy
              anchor.href = expanded_url;
              Features.profileUrlCache.set(shortUrl, expanded_url);
            } catch (err) {
              verbose && console.error("[ujs]", err);
            }
          }
        }
      }
      if (anchors.length) {
        Features.handleTitle(Features.originalTitle);
      }
    }

    // Do NOT throttle it
    static expandSpoilers() {
      const main = document.querySelector("main[role=main]");
      if (!main) {
        return;
      }

      if (!I18N.YES_VIEW_PROFILE) {
        // Unsupported lang, no YES_VIEW_PROFILE, SHOW_NUDITY, VIEW constants
        return;
      }

      const a = main.querySelectorAll(
        "[data-testid=primaryColumn] [role=button]",
      );
      if (a) {
        const elems = [...a];
        const button = elems.find(
          (el) => el.textContent === I18N.YES_VIEW_PROFILE,
        );
        if (button) {
          button.click();
        }

        // "Content warning: Nudity"
        // "The Tweet author flagged this Tweet as showing sensitive content."
        // "Show"
        const buttonShow = elems.find(
          (el) => el.textContent === I18N.SHOW_NUDITY,
        );
        if (buttonShow) {
          // const verifying = a.previousSibling.textContent.includes("Nudity"); // todo?
          // if (verifying) {
          buttonShow.click();
          // }
        }
      }

      // todo: expand spoiler commentary in photo view mode (.../photo/1)
      const b = main.querySelectorAll(
        "article [role=presentation] div[role=button]",
      );
      if (b) {
        const elems = [...b];
        const buttons = elems.filter((el) => el.textContent === I18N.VIEW);
        if (buttons.length) {
          buttons.forEach((el) => el.click());
        }
      }
    }

    static hideSignUpSection() {
      // "New to Twitter?"
      if (!I18N.SIGNUP) {
        // Unsupported lang, no SIGNUP constant
        return;
      }
      const elem = document.querySelector(
        `section[aria-label="${I18N.SIGNUP}"][role=region]`,
      );
      if (elem) {
        elem.parentElement.classList.add("ujs-hidden");
      }
    }

    // Call it once.
    // "Don’t miss what’s happening" if you are not logged in.
    // It looks that `#layers` is used only for this bar.
    static hideSignUpBottomBarAndMessages(doNotPlayVideosAutomatically) {
      if (doNotPlayVideosAutomatically) {
        addCSS(`
                    #layers > div:nth-child(1) {
                        display: none;
                    }
                `);
      } else {
        addCSS(`
                    #layers > div:nth-child(1) {
                        height: 1px;
                        opacity: 0;
                    }
                `);
      }
      // "Did someone say … cookies?" // fix invisible bottom bar
      addCSS(`[data-testid="BottomBar"] {
                pointer-events: none;
            }`);
    }

    // "Trends for you"
    static hideTrends() {
      if (!I18N.TRENDS) {
        // Unsupported lang, no TRENDS constant
        return;
      }
      addCSS(`
                [aria-label="${I18N.TRENDS}"]
                {
                    display: none;
                }
            `);
    }

    static highlightVisitedLinks() {
      if (settings.highlightOnlySpecialVisitedLinks) {
        addCSS(`
                    a[href^="http"]:visited {
                        color: darkorange !important;
                    }
                `);
        return;
      }
      addCSS(`
                a:visited {
                    color: darkorange !important;
                }
            `);
    }

    // todo split to two methods
    // todo fix it, currently it works questionably
    // not tested with non eng languages
    static footerHandled = false;
    static hideAndMoveFooter() {
      // "Terms of Service   Privacy Policy   Cookie Policy"
      let footer = document.querySelector(
        `main[role=main] nav[aria-label=${I18N.FOOTER}][role=navigation]`,
      );
      const nav = document.querySelector(
        "nav[aria-label=Primary][role=navigation]",
      ); // I18N."Primary" [?]

      if (footer) {
        footer = footer.parentNode;
        const separatorLine = footer.previousSibling;

        if (Features.footerHandled) {
          footer.remove();
          separatorLine.remove();
          return;
        }

        nav.append(separatorLine);
        nav.append(footer);
        footer.classList.add("ujs-show-on-hover");
        separatorLine.classList.add("ujs-show-on-hover");

        Features.footerHandled = true;
      }
    }

    static hideLoginPopup() {
      // When you are not logged in
      const targetNode = document.querySelector("html");
      const observerOptions = {
        attributes: true,
      };
      const observer = new MutationObserver(callback);
      observer.observe(targetNode, observerOptions);

      function callback(mutationList, _observer) {
        const html = document.querySelector("html");
        verbose &&
          console.log("[ujs][hideLoginPopup][mutationList]", mutationList);
        // overflow-y: scroll; overscroll-behavior-y: none; font-size: 15px;                     // default
        // overflow: hidden; overscroll-behavior-y: none; font-size: 15px; margin-right: 15px;   // popup
        if (html.style["overflow"] === "hidden") {
          html.style["overflow"] = "";
          html.style["overflow-y"] = "scroll";
          html.style["margin-right"] = "";
        }
        const popup = document.querySelector(
          `#layers div[data-testid="sheetDialog"]`,
        );
        if (popup) {
          popup.closest(`div[role="dialog"]`).remove();
          verbose && (document.title = "⚒" + document.title);
          // observer.disconnect();
        }
      }
    }

    static goFromMobileToMainSite() {
      // uncompleted
      if (location.href.startsWith("https://mobile.twitter.com/")) {
        location.href = location.href.replace(
          "https://mobile.twitter.com/",
          "https://twitter.com/",
        );
      }
      // TODO: add #redirected, remove by timer // to prevent a potential infinity loop
    }
  }

  return Features;
}

function getStoreInfo() {
  const resultObj = {
    total: 0,
  };
  for (const [name, lsKey] of Object.entries(StorageNames)) {
    const valueStr = localStorage.getItem(lsKey);
    if (valueStr) {
      try {
        const value = JSON.parse(valueStr);
        if (Array.isArray(value)) {
          const size = new Set(value).size;
          resultObj[name] = size;
          resultObj.total += size;
        }
      } catch (err) {
        // ...
      }
    }
  }
  return resultObj;
}

// --- Twitter.RequiredCSS --- //
function getUserScriptCSS() {
  const labelText = I18N.IMAGE || "Image";

  // By default, the scroll is shown all time, since <html style="overflow-y: scroll;>,
  // so it works — no need to use `getScrollbarWidth` function from SO (13382516).
  const scrollbarWidth = window.innerWidth - document.body.offsetWidth;

  // language=CSS
  const cssText = `
.ujs-modal-wrapper .ujs-modal-settings {
  color: black;
}
.ujs-hidden {
    display: none;
}
.ujs-no-scroll {
    overflow-y: hidden;
}
.ujs-scroll-initial {
    overflow-y: initial!important;
}
.ujs-scrollbar-width-margin-right {
    margin-right: ${scrollbarWidth}px;
}

.ujs-show-on-hover:hover {
    opacity: 1;
    transition: opacity 1s ease-out 0.1s;
}
.ujs-show-on-hover {
    opacity: 0;
    transition: opacity 0.5s ease-out;
}

:root {
    --ujs-btn-size: 24px;
    --ujs-btn-radius: 9px;
    --ujs-btn-offset: 6px;
    --ujs-dot-size: 5px;
    --ujs-red:   #e0245e;
    --ujs-blue:  #1da1f2;
    --ujs-green: #4caf50;
    --ujs-gray:  #c2cbd0;
    --ujs-error: white;
}

.ujs-progress {
  background:
    linear-gradient(to right, rgba(68, 217, 102, 0.70) var(--progress), transparent 0%),
    radial-gradient(120% 70% at 24% 0%, rgba(255, 255, 255, 0.32), transparent 62%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.02) 46%, rgba(0, 0, 0, 0.10));
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    inset 0 -1px 1px rgba(0, 0, 0, 0.18);
  opacity: 0;
  mix-blend-mode: screen;
  transition: opacity 160ms ease;
}

.ujs-shadow {
  background: transparent;
  border: 0;
  box-shadow: var(--x-loader-glass-shadow);
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.26));
  transition: box-shadow 160ms ease;
}
.ujs-shadow::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(110% 90% at 10% 0%, rgba(255, 255, 255, 0.34), transparent 46%),
    radial-gradient(95% 95% at 92% 100%, rgba(255, 255, 255, 0.16), transparent 58%),
    var(--x-loader-glass-sheen);
  box-shadow: inset 0 0 0 0.5px var(--x-loader-glass-edge);
  opacity: 0.62;
  pointer-events: none;
}
.ujs-btn-download:hover .ujs-hover {
  opacity: 1;
}
.ujs-btn-download.ujs-downloading .ujs-shadow {
  box-shadow:
    0 10px 22px rgba(0, 0, 0, 0.34),
    0 2px 6px rgba(0, 0, 0, 0.25),
    0 0 0 0.5px rgba(255, 255, 255, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.26);
}
.ujs-btn-download.ujs-downloading .ujs-progress {
  opacity: 0.84;
}
.ujs-btn-download:active .ujs-shadow {
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.36),
    0 1px 2px rgba(0, 0, 0, 0.26),
    inset 0 1px 1px rgba(255, 255, 255, 0.12);
}

.ujs-btn-download.ujs-downloaded.ujs-recently-downloaded {
    opacity: 0;
}

li[role="listitem"]:hover .ujs-btn-download {
    opacity: 1;
}
article[role=article]:hover .ujs-btn-download {
    opacity: 1;
}
div[aria-label="${labelText}"]:hover .ujs-btn-download {
    opacity: 1;
}
.ujs-btn-download.ujs-downloaded {
    opacity: 1;
}
.ujs-btn-download.ujs-downloading {
    opacity: 1;
}
[data-testid="videoComponent"]:hover + .ujs-btn-download {
    opacity: 1;
}
[data-testid="videoComponent"] + .ujs-btn-download:hover {
    opacity: 1;
}

.ujs-btn-download {
  cursor: pointer;
  top: var(--ujs-btn-offset);
  left: var(--ujs-btn-offset);
  width: var(--ujs-btn-size);
  height: var(--ujs-btn-size);
  position: absolute;
  opacity: 0;
  z-index: 2;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transform: translateY(0);
  transition:
    opacity 180ms ease,
    transform 160ms ease;
  /* 24px macOS-style squircle shared by all button paint layers. */
  --ujs-btn-radius: 9px;
  border-radius: var(--ujs-btn-radius);
  isolation: isolate;
  --x-loader-glass-bg: rgba(10, 12, 15, 0.42);
  --x-loader-glass-bg-fallback: rgba(17, 19, 22, 0.88);
  --x-loader-glass-border: ${settings.addBorder ? "rgba(255, 255, 255, 0.50)" : "rgba(223, 233, 239, 0.28)"};
  --x-loader-glass-edge: rgba(255, 255, 255, 0.34);
  --x-loader-glass-highlight: rgba(255, 255, 255, 0.58);
  --x-loader-glass-caustic: rgba(255, 255, 255, 0.20);
  --x-loader-glass-inner-rim: rgba(255, 255, 255, 0.18);
  --x-loader-glass-bottom-shadow: rgba(0, 0, 0, 0.38);
  --x-loader-glass-shadow:
    0 10px 24px rgba(0, 0, 0, 0.30),
    0 2px 7px rgba(0, 0, 0, 0.24),
    0 0 0 0.5px rgba(255, 255, 255, 0.12);
  --x-loader-glass-text: rgba(255, 255, 255, 0.94);
  --x-loader-glass-dot: rgba(255, 255, 255, 0.62);
  --x-loader-glass-sheen:
    linear-gradient(135deg, rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0.05) 34%, rgba(255, 255, 255, 0) 48%),
    radial-gradient(120% 80% at 18% -12%, rgba(255, 255, 255, 0.56), rgba(255, 255, 255, 0.10) 44%, rgba(255, 255, 255, 0) 66%);
}
.ujs-btn-download:hover {
  transform: translateY(-1px);
  --x-loader-glass-bg: rgba(13, 15, 18, 0.48);
  --x-loader-glass-border: ${settings.addBorder ? "rgba(255, 255, 255, 0.58)" : "rgba(223, 233, 239, 0.36)"};
  --x-loader-glass-edge: rgba(255, 255, 255, 0.44);
  --x-loader-glass-highlight: rgba(255, 255, 255, 0.68);
  --x-loader-glass-caustic: rgba(255, 255, 255, 0.26);
  --x-loader-glass-shadow:
    0 12px 26px rgba(0, 0, 0, 0.34),
    0 3px 9px rgba(0, 0, 0, 0.25),
    0 0 0 0.5px rgba(255, 255, 255, 0.16);
}
.ujs-btn-download:active {
  transform: translateY(0);
  --x-loader-glass-bg: rgba(8, 10, 13, 0.54);
  --x-loader-glass-border: ${settings.addBorder ? "rgba(255, 255, 255, 0.34)" : "rgba(223, 233, 239, 0.22)"};
  --x-loader-glass-highlight: rgba(255, 255, 255, 0.36);
  --x-loader-glass-caustic: rgba(255, 255, 255, 0.12);
}
.ujs-btn-download:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.58);
  outline-offset: 3px;
}
.ujs-btn-common {
  width: var(--ujs-btn-size);
  height: var(--ujs-btn-size);
  border-radius: var(--ujs-btn-radius);
  top: 0;
  left: 0;
  position: absolute;
  box-sizing: border-box;
  border: 0;
}
.ujs-btn-background,
.ujs-hover,
.ujs-progress,
.ujs-btn-error-text {
  overflow: hidden;
}
.ujs-btn-background {
  color: var(--x-loader-glass-text);
  background:
    radial-gradient(90% 72% at 22% -8%, var(--x-loader-glass-highlight), rgba(255, 255, 255, 0.10) 46%, rgba(255, 255, 255, 0) 68%),
    radial-gradient(96% 82% at 86% 108%, var(--x-loader-glass-caustic), rgba(255, 255, 255, 0) 62%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.06) 22%, rgba(255, 255, 255, 0) 50%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.04) 44%, rgba(0, 0, 0, 0.22)),
    var(--x-loader-glass-bg);
  border: 1px solid var(--x-loader-glass-border);
  background-clip: padding-box;
  -webkit-backdrop-filter: blur(24px) saturate(190%) contrast(1.08) brightness(1.08);
  backdrop-filter: blur(24px) saturate(190%) contrast(1.08) brightness(1.08);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.52),
    inset 1px 0 0 rgba(255, 255, 255, 0.18),
    inset 0 0 0 1px var(--x-loader-glass-inner-rim),
    inset 0 -1px 1px var(--x-loader-glass-bottom-shadow);
  transition:
    background 160ms ease,
    border-color 160ms ease,
    filter 160ms ease,
    box-shadow 160ms ease;
}
.ujs-btn-background::before,
.ujs-btn-background::after {
  content: "";
  position: absolute;
  border-radius: inherit;
  pointer-events: none;
}
.ujs-btn-background::before {
  inset: 1px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.09) 28%, rgba(255, 255, 255, 0) 52%),
    radial-gradient(70% 60% at 62% 72%, rgba(255, 255, 255, 0.16), transparent 66%);
  mix-blend-mode: screen;
  opacity: 0.74;
}
.ujs-btn-background::after {
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.28), transparent 20%, transparent 63%, rgba(255, 255, 255, 0.10)),
    radial-gradient(90% 70% at 50% 115%, rgba(0, 0, 0, 0.30), transparent 62%);
  opacity: 0.72;
}
.ujs-hover {
  background:
    radial-gradient(95% 75% at 28% -8%, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0) 64%),
    radial-gradient(90% 85% at 82% 100%, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.20), rgba(255, 255, 255, 0.02));
  border: 0;
  mix-blend-mode: screen;
  opacity: 0;
  transition: opacity 160ms ease;
}
.ujs-btn-download:hover .ujs-btn-background {
  filter: brightness(1.06) saturate(1.08);
}
.ujs-btn-download:active .ujs-btn-background {
  filter: brightness(0.92) saturate(1.04);
}
.ujs-btn-download:active .ujs-hover {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.18));
  opacity: 1;
}
.ujs-btn-download:focus-visible .ujs-btn-background {
  border-color: rgba(255, 255, 255, 0.58);
}
.ujs-btn-download.ujs-already-downloaded,
.ujs-btn-download.ujs-downloaded {
  --x-loader-glass-bg: rgba(205, 214, 219, 0.54);
  --x-loader-glass-bg-fallback: rgba(204, 213, 218, 0.90);
  --x-loader-glass-border: ${settings.addBorder ? "rgba(255, 255, 255, 0.62)" : "rgba(255, 255, 255, 0.34)"};
  --x-loader-glass-edge: rgba(255, 255, 255, 0.46);
  --x-loader-glass-highlight: rgba(255, 255, 255, 0.82);
  --x-loader-glass-caustic: rgba(255, 255, 255, 0.28);
  --x-loader-glass-inner-rim: rgba(255, 255, 255, 0.34);
  --x-loader-glass-bottom-shadow: rgba(0, 0, 0, 0.16);
  --x-loader-glass-shadow:
    0 8px 18px rgba(0, 0, 0, 0.23),
    0 2px 5px rgba(0, 0, 0, 0.16),
    0 0 0 0.5px rgba(255, 255, 255, 0.18);
  --x-loader-glass-text: rgba(13, 16, 18, 0.9);
  --x-loader-glass-dot: rgba(13, 16, 18, 0.38);
}
.ujs-btn-download.ujs-error {
  --x-loader-glass-bg: rgba(255, 255, 255, 0.82);
  --x-loader-glass-bg-fallback: rgba(255, 255, 255, 0.96);
  --x-loader-glass-border: rgba(255, 69, 58, 0.42);
  --x-loader-glass-highlight: rgba(255, 255, 255, 0.72);
  --x-loader-glass-inner-rim: rgba(255, 255, 255, 0.34);
  --x-loader-glass-bottom-shadow: rgba(0, 0, 0, 0.16);
  --x-loader-glass-shadow:
    0 8px 16px rgba(0, 0, 0, 0.26),
    0 2px 5px rgba(0, 0, 0, 0.20),
    0 0 0 1px rgba(255, 69, 58, 0.14);
  --x-loader-glass-text: rgba(0, 0, 0, 0.9);
  --x-loader-glass-dot: rgba(0, 0, 0, 0.34);
}
@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .ujs-btn-download .ujs-btn-background {
    background:
      radial-gradient(90% 72% at 22% -8%, var(--x-loader-glass-highlight), rgba(255, 255, 255, 0.10) 46%, rgba(255, 255, 255, 0) 68%),
      radial-gradient(96% 82% at 86% 108%, var(--x-loader-glass-caustic), rgba(255, 255, 255, 0) 62%),
      linear-gradient(145deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.06) 22%, rgba(255, 255, 255, 0) 50%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.04) 44%, rgba(0, 0, 0, 0.22)),
      var(--x-loader-glass-bg-fallback);
  }
}

.ujs-btn-done {
  box-shadow:
    0 0 0 1px rgba(76, 175, 80, 0.42),
    0 0 10px rgba(76, 175, 80, 0.50);
}
.ujs-btn-error {
  box-shadow:
    0 0 0 1px rgba(224, 36, 94, 0.40),
    0 0 10px rgba(224, 36, 94, 0.48);
}

.ujs-btn-error-text {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--x-loader-glass-text);
  font-size: 100%;
}
.ujs-modal-settings fieldset {
    border: 1px solid grey;
    margin: 1px;
    padding: 4px;
    border-radius: 2px;
}
.ujs-modal-settings fieldset input {
    margin: 4px;
}
.ujs-modal-settings hr {
    margin: 4px;
    color: grey;
}
.ujs-modal-settings button {
    border: 1px solid grey;
    border-radius: 2px;
}
.ujs-modal-settings button {
    background-color: #FFF;
}
.ujs-modal-settings button:hover {
    background-color: #EEE;
}
.ujs-modal-settings button:active {
    background-color: #DDD;
}


.ujs-btn-download[data-is-multi-media] .ujs-dot {
    position: absolute;
    width: var(--ujs-dot-size);
    height: var(--ujs-dot-size);
    background: var(--x-loader-glass-dot) linear-gradient(to right, var(--x-loader-glass-text) var(--media-progress), transparent 0%);
    border-radius: 25%;

    bottom: 2px;
    right: 2px;
}
.ujs-btn-download[data-is-multi-media] .ujs-dot.ujs-back {
    bottom: 3px;
    right: 1px;

    background: transparent;
    border-top:   1px solid var(--x-loader-glass-dot);
    border-right: 1px solid var(--x-loader-glass-dot);
}

.ujs-btn-download[data-is-multi-media].ujs-media-progress-complete .ujs-dot.ujs-back {
    border-top:   1px solid var(--x-loader-glass-text);
    border-right: 1px solid var(--x-loader-glass-text);
}

`;
  return cssText.trimStart();
}

/*
Features depend on:

addRequiredCSS:     IMAGE

expandSpoilers:     YES_VIEW_PROFILE, SHOW_NUDITY, VIEW
handleTitle:        QUOTES,           ON_TWITTER,  TWITTER
hideSignUpSection:  SIGNUP
hideTrends:         TRENDS

[unused]
hideAndMoveFooter:  FOOTER
*/

// --- Twitter.LangConstants --- //
function getLanguageConstants() {
  // todo: "de", "fr"
  const defaultQuotes = [`"`, `"`];

  const SUPPORTED_LANGUAGES = ["en", "ru", "es", "zh", "ja"];

  // texts
  const VIEW = ["View", "Посмотреть", "Ver", "查看", "表示"];
  const YES_VIEW_PROFILE = [
    "Yes, view profile",
    "Да, посмотреть профиль",
    "Sí, ver perfil",
    "是，查看个人资料",
    "プロフィールを表示する",
  ];
  const SHOW_NUDITY = ["Show", "Показать", "Mostrar", "显示", "表示"];

  // aria-label texts
  const IMAGE = ["Image", "Изображение", "Imagen", "图像", "画像"];
  const SIGNUP = [
    "Sign up",
    "Зарегистрироваться",
    "Regístrate",
    "注册",
    "アカウント作成",
  ];
  const TRENDS = [
    "Timeline: Trending now",
    "Лента: Актуальные темы",
    "Cronología: Tendencias del momento",
    "时间线：当前趋势",
    "タイムライン: トレンド",
  ];
  const FOOTER = [
    "Footer",
    "Нижний колонтитул",
    "Pie de página",
    "页脚",
    "フッター",
  ];

  // document.title "{AUTHOR}{ON_TWITTER} {QUOTES[0]}{TEXT}{QUOTES[1]} / {TWITTER}"
  const QUOTES = [
    defaultQuotes,
    [`«`, `»`],
    defaultQuotes,
    defaultQuotes,
    [`「`, `」`],
  ];
  const ON_TWITTER = [
    " on X:",
    " в X:",
    " en X:",
    " 在 X:",
    "さんはXを使っています",
  ];
  const TWITTER = ["X", "X", "X", "X", "X"];

  const lang = document.querySelector("html").getAttribute("lang");
  const langIndex = SUPPORTED_LANGUAGES.indexOf(lang);

  return {
    SUPPORTED_LANGUAGES,
    VIEW: VIEW[langIndex],
    YES_VIEW_PROFILE: YES_VIEW_PROFILE[langIndex],
    SHOW_NUDITY: SHOW_NUDITY[langIndex],
    IMAGE: IMAGE[langIndex],
    SIGNUP: SIGNUP[langIndex],
    TRENDS: TRENDS[langIndex],
    FOOTER: FOOTER[langIndex],
    QUOTES: QUOTES[langIndex],
    ON_TWITTER: ON_TWITTER[langIndex],
    TWITTER: TWITTER[langIndex],
  };
}

// --- Twitter.Tweet --- //
function hoistTweet() {
  class Tweet {
    constructor({ elem, url }) {
      if (url) {
        this.elem = null;
        this.url = url;
      } else {
        this.elem = elem;
        this.url = Tweet.getUrl(elem);
      }
    }

    // QRT photo (only!) has a link to the original tweet https://x.com/User/status/1234567890/photo/1
    static of(innerElem) {
      // Workaround for media from a quoted tweet
      const url = innerElem.closest(`a[href^="/"]`)?.href;
      if (url && url.includes("/status/")) {
        return new Tweet({ url });
      }

      const elem = innerElem.closest(`[data-testid="tweet"]`);
      if (!elem) {
        // === null // opened image or bg image
        verbose && console.log("[ujs][Tweet.of]", "No-tweet elem");
      }
      return new Tweet({ elem });
    }

    static getUrl(elem) {
      if (!elem) {
        verbose &&
          console.log("[ujs][Tweet.getUrl]", "Opened full screen image");
        return location.href;
      }
      const quotedTweetAnchorEl = [...elem.querySelectorAll("a")].find((el) => {
        return el.childNodes[0]?.nodeName === "TIME";
      });
      if (quotedTweetAnchorEl) {
        verbose && console.log("[ujs][Tweet.getUrl]", "Quoted/Re Tweet");
        return quotedTweetAnchorEl.href;
      }
      verbose && console.log("[ujs][Tweet.getUrl]", "Unreachable"); // Is it used?
      return location.href;
    }

    get author() {
      try {
        return new URL(this.url).pathname.split("/").filter(Boolean)[0];
      } catch (err) {
        return this.url.match(/(?:twitter|x)\.com\/([^\/]+)/)?.[1];
      }
    }

    get id() {
      return this.url.match(/\/status\/(\d+)/)?.[1];
    }
  }

  return Tweet;
}

// --- Twitter.API --- //
function hoistAPI() {
  class API {
    static guestToken = getCookie("gt");
    static csrfToken = getCookie("ct0"); // todo: lazy — not available at the first run
    // Guest/Suspended account Bearer token
    static guestAuthorization =
      "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
    // todo: keep query IDs updated
    // https://github.com/fa0311/TwitterInternalAPIDocument/blob/master/docs/json/API.json
    static QueryConfig = {
      TweetDetail: {
        queryId: "_8aYOgEDz35BrBcBal1-_w",
        operationName: "TweetDetail",
      },
      UserByScreenName: {
        queryId: "1VOOyvKkiI3FMmkeDNxM9A",
        operationName: "UserByScreenName",
      },
      TweetResultByRestId: {
        queryId: "zAz9764BcLZOJ0JU2wrd1A",
        operationName: "TweetResultByRestId",
      },
    };

    // Seems to be outdated at 2022.05
    static async _requestBearerToken() {
      const scriptSrc = [...document.querySelectorAll("script")].find((el) =>
        el.src.match(
          /https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main[\w.]*\.js/,
        ),
      ).src;

      let text;
      try {
        text = await (await fetch(scriptSrc)).text();
      } catch (err) {
        /* verbose && */ console.error(
          "[ujs][_requestBearerToken][scriptSrc]",
          scriptSrc,
        );
        /* verbose && */ console.error("[ujs][_requestBearerToken]", err);
        throw err;
      }

      const authorizationKey = text.match(
        /"(AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D.+?)"/,
      )?.[1];
      if (!authorizationKey) {
        throw new Error("Authorization key not found");
      }
      const authorization = `Bearer ${authorizationKey}`;

      return authorization;
    }

    static async getAuthorization() {
      if (!API.authorization) {
        API.authorization = await API._requestBearerToken();
      }
      return API.authorization;
    }

    static requestCache = new Map();
    static vacuumCache() {
      if (API.requestCache.size > 16) {
        API.requestCache.delete(API.requestCache.keys().next().value);
      }
    }

    static getOperationNameFromUrl(url) {
      try {
        return new URL(url).pathname.split("/").pop() || "Twitter API";
      } catch (err) {
        return "Twitter API";
      }
    }

    static getApiErrorMessage(operationName, json) {
      const errors = Array.isArray(json?.errors) ? json.errors : [];
      if (!errors.length) {
        return "";
      }
      return errors
        .map((err) => {
          const code = err.code === undefined ? "" : ` [${err.code}]`;
          return `${err.message || "Unknown error"}${code}`;
        })
        .join("; ");
    }

    static async apiRequest(url) {
      const _url = url.toString();
      const operationName = API.getOperationNameFromUrl(_url);
      verbose && console.log("[ujs][apiRequest]", _url);

      if (API.requestCache.has(_url)) {
        verbose &&
          console.log("[ujs][apiRequest] Use cached API request", _url);
        return API.requestCache.get(_url);
      }

      // Hm... it is always the same. Even for a logged user.
      // const authorization = API.guestToken ? API.guestAuthorization : await API.getAuthorization();
      const authorization = API.guestAuthorization;

      // for debug
      verbose &&
        sessionStorage.setItem("guestAuthorization", API.guestAuthorization);
      verbose && sessionStorage.setItem("authorization", API.authorization);
      verbose && sessionStorage.setItem("x-csrf-token", API.csrfToken);
      verbose && sessionStorage.setItem("x-guest-token", API.guestToken);

      const headers = new Headers({
        authorization,
        "x-csrf-token": API.csrfToken,
        "x-twitter-client-language": "en",
        "x-twitter-active-user": "yes",
        // "x-client-transaction-id": "", // todo?
        "content-type": "application/json",
      });
      if (API.guestToken) {
        headers.append("x-guest-token", API.guestToken);
      } else {
        // may be skipped
        headers.append("x-twitter-auth-type", "OAuth2Session");
      }

      let json;
      try {
        const response = await fetch(_url, { headers });
        try {
          json = await response.json();
        } catch (err) {
          throw new Error(
            `${operationName} API returned non-JSON response: ${response.status} ${response.statusText}`,
          );
        }
        const apiErrorMessage = API.getApiErrorMessage(operationName, json);
        if (!response.ok || apiErrorMessage) {
          const statusText = response.statusText
            ? " " + response.statusText
            : "";
          const details = apiErrorMessage ? `: ${apiErrorMessage}` : "";
          throw new Error(
            `${operationName} API request failed: ${response.status}${statusText}${details}`,
          );
        }
        verbose &&
          console.log("[ujs][apiRequest]", "Cache API request", _url);
        API.vacuumCache();
        API.requestCache.set(_url, json);
      } catch (err) {
        /* verbose && */ console.error("[ujs][apiRequest]", _url);
        /* verbose && */ console.error("[ujs][apiRequest]", err);
        throw err;
      }

      verbose &&
        console.log("[ujs][apiRequest][json]", JSON.stringify(json, null, " "));
      // 429 - [{code: 88, message: "Rate limit exceeded"}] — for suspended accounts

      return json;
    }

    static responseShapeError(operationName, path) {
      return new Error(
        `${operationName} response shape changed: missing ${path}`,
      );
    }

    static requireShape(value, operationName, path) {
      if (value === undefined || value === null) {
        throw API.responseShapeError(operationName, path);
      }
      return value;
    }

    static requireArray(value, operationName, path) {
      API.requireShape(value, operationName, path);
      if (!Array.isArray(value)) {
        throw API.responseShapeError(operationName, path);
      }
      return value;
    }

    static unwrapTweetResult(tweetResult, operationName, path) {
      const result = API.requireShape(tweetResult, operationName, path);
      if (typeof result !== "object") {
        throw API.responseShapeError(operationName, path);
      }
      if ("tweet" in result) {
        return API.requireShape(result.tweet, operationName, `${path}.tweet`);
      }
      return result;
    }

    static parseTweetResultParts(tweetResult, operationName, path) {
      const tweetLegacy = API.requireShape(
        tweetResult.legacy,
        operationName,
        `${path}.legacy`,
      );
      const tweetUser = API.requireShape(
        tweetResult.core?.user_results?.result,
        operationName,
        `${path}.core.user_results.result`,
      );
      return { tweetResult, tweetLegacy, tweetUser };
    }

    /** return {tweetResult, tweetLegacy, tweetUser} */
    static parseTweetJsonFrom_TweetDetail(json, tweetId) {
      const instruction =
        json.data.threaded_conversation_with_injections_v2.instructions.find(
          (ins) => ins.type === "TimelineAddEntries",
        );
      const tweetEntry = instruction.entries.find(
        (ins) => ins.entryId === "tweet-" + tweetId,
      );
      let tweetResult = tweetEntry.content.itemContent.tweet_results.result; // {"__typename": "Tweet"} // or {"__typename": "TweetWithVisibilityResults", tweet: {...}} (1641596499351212033)
      if ("tweet" in tweetResult) {
        tweetResult = tweetResult.tweet;
      }
      verbose &&
        console.log(
          "[ujs][parseTweetJsonFrom_TweetDetail] tweetResult",
          tweetResult,
          JSON.stringify(tweetResult),
        );
      const tweetUser = tweetResult.core.user_results.result; // {"__typename": "User"}
      const tweetLegacy = tweetResult.legacy;
      verbose &&
        console.log(
          "[ujs][parseTweetJsonFrom_TweetDetail] tweetLegacy",
          tweetLegacy,
          JSON.stringify(tweetLegacy),
        );
      verbose &&
        console.log(
          "[ujs][parseTweetJsonFrom_TweetDetail] tweetUser",
          tweetUser,
          JSON.stringify(tweetUser),
        );
      return { tweetResult, tweetLegacy, tweetUser };
    }

    /** return {tweetResult, tweetLegacy, tweetUser} */
    static parseTweetJsonFrom_TweetResultByRestId(json, tweetId) {
      const operationName = API.QueryConfig.TweetResultByRestId.operationName;
      const tweetResult = API.unwrapTweetResult(
        json?.data?.tweetResult?.result,
        operationName,
        "data.tweetResult.result",
      );
      return API.parseTweetResultParts(
        tweetResult,
        operationName,
        "data.tweetResult.result",
      );
    }

    /**
     * @typedef {Object} TweetMediaEntry
     * @property {string} screen_name - "kreamu"
     * @property {string} tweet_id - "1687962620173733890"
     * @property {string} download_url - "https://pbs.twimg.com/media/FWYvXNMXgAA7se2?format=jpg&name=orig"
     * @property {"photo" | "video"} type - "photo"
     * @property {"photo" | "video" | "animated_gif"} type_original - "photo"
     * @property {number} index - 0
     * @property {number} type_index - 0
     * @property {number} type_index_original - 0
     * @property {string} preview_url - "https://pbs.twimg.com/media/FWYvXNMXgAA7se2.jpg"
     * @property {string} media_id  -   "1687949851516862464"
     * @property {string} media_key - "7_1687949851516862464"
     * @property {string} expanded_url - "https://twitter.com/kreamu/status/1687962620173733890/video/1"
     * @property {string} short_expanded_url - "pic.twitter.com/KeXR8T910R"
     * @property {string} short_tweet_url - "https://t.co/KeXR8T910R"
     * @property {string} tweet_text - "Tracer providing some In-flight entertainment"
     */
    /** @returns {TweetMediaEntry[]} */
    static parseTweetLegacyMedias(
      tweetResult,
      tweetLegacy,
      tweetUser,
      operationName = API.QueryConfig.TweetResultByRestId.operationName,
    ) {
      let sourceMedias = [];
      let sourceMediaPath = "tweetLegacy.extended_entities.media";

      if (tweetLegacy.extended_entities !== undefined) {
        sourceMedias = API.requireArray(
          tweetLegacy.extended_entities?.media,
          operationName,
          "tweetLegacy.extended_entities.media",
        );
      } else if (tweetResult.card !== undefined) {
        const bindingValues = API.requireArray(
          tweetResult.card?.legacy?.binding_values,
          operationName,
          "tweetResult.card.legacy.binding_values",
        );
        const unified_card = bindingValues.find(
          (bv) => bv.key === "unified_card",
        );
        if (!unified_card) {
          return [];
        }
        const stringValue = API.requireShape(
          unified_card.value?.string_value,
          operationName,
          "tweetResult.card.legacy.binding_values.unified_card.value.string_value",
        );
        verbose &&
          console.log(
            "[ujs][getTweetMedias] unified_card",
            unified_card,
            stringValue,
          );
        let value;
        try {
          value = JSON.parse(stringValue);
        } catch (err) {
          throw new Error(
            `${operationName} response shape changed: invalid tweetResult.card.legacy.binding_values unified_card JSON`,
          );
        }
        verbose &&
          console.log("[ujs][getTweetMedias] unified_card value", value);
        sourceMedias = Object.values(
          API.requireShape(
            value.media_entities,
            operationName,
            "tweetResult.card.legacy.binding_values.unified_card.media_entities",
          ),
        );
        sourceMediaPath =
          "tweetResult.card.legacy.binding_values.unified_card.media_entities";
      } else {
        return [];
      }

      const medias = [];
      const typeIndex = {}; // "photo", "video", "animated_gif"
      let index = -1;

      for (const media of sourceMedias) {
        index++;
        const mediaPath = `${sourceMediaPath}[${index}]`;
        API.requireShape(media, operationName, mediaPath);
        let type = API.requireShape(
          media.type,
          operationName,
          `${mediaPath}.type`,
        );
        const type_original = type;
        typeIndex[type] =
          (typeIndex[type] === undefined ? -1 : typeIndex[type]) + 1;
        if (type === "animated_gif") {
          type = "video";
          typeIndex[type] =
            (typeIndex[type] === undefined ? -1 : typeIndex[type]) + 1;
        }

        let download_url;
        if (media.video_info) {
          const variants = API.requireArray(
            media.video_info.variants,
            operationName,
            "media.video_info.variants",
          );
          const mp4Variants = variants.filter((el) => el.bitrate !== undefined); // if content_type: "application/x-mpegURL" // .m3u8
          if (!mp4Variants.length) {
            throw API.responseShapeError(
              operationName,
              "media.video_info.variants.bitrate",
            );
          }
          const videoInfo = mp4Variants.reduce((acc, cur) =>
            cur.bitrate > acc.bitrate ? cur : acc,
          );
          download_url = API.requireShape(
            videoInfo.url,
            operationName,
            "media.video_info.variants.url",
          );
        } else {
          const mediaUrl = API.requireShape(
            media.media_url_https,
            operationName,
            "media.media_url_https",
          );
          if (mediaUrl.includes("?format=")) {
            download_url = mediaUrl;
          } else {
            // "https://pbs.twimg.com/media/FWYvXNMXgAA7se2.jpg" -> "https://pbs.twimg.com/media/FWYvXNMXgAA7se2?format=jpg&name=orig"
            const parts = mediaUrl.split(".");
            const ext = parts[parts.length - 1];
            const urlPart = parts.slice(0, -1).join(".");
            download_url = `${urlPart}?format=${ext}&name=orig`;
          }
        }

        const screen_name = API.requireShape(
          tweetUser.legacy?.screen_name,
          operationName,
          "tweetResult.core.user_results.result.legacy.screen_name",
        ); // "kreamu"
        const tweet_id = API.requireShape(
          tweetResult.rest_id || tweetLegacy.id_str,
          operationName,
          "tweetResult.rest_id",
        ); // "1687962620173733890"

        const type_index = typeIndex[type]; // 0
        const type_index_original = typeIndex[type_original]; // 0

        const preview_url = API.requireShape(
          media.media_url_https,
          operationName,
          "media.media_url_https",
        ); // "https://pbs.twimg.com/ext_tw_video_thumb/1687949851516862464/pu/img/mTBjwz--nylYk5Um.jpg"
        const media_id = media.id_str; //   "1687949851516862464"
        const media_key = media.media_key; // "7_1687949851516862464"

        const expanded_url = media.expanded_url; // "https://twitter.com/kreamu/status/1687962620173733890/video/1"
        const short_expanded_url = media.display_url; // "pic.twitter.com/KeXR8T910R"
        const short_tweet_url = media.url; // "https://t.co/KeXR8T910R"
        const tweet_text = API.requireShape(
          tweetLegacy.full_text,
          operationName,
          "tweetLegacy.full_text",
        ) // "Tracer providing some In-flight entertainment https://t.co/KeXR8T910R"
          .replace(` ${media.url}`, "");

        // {screen_name, tweet_id, download_url, preview_url, type_index}
        /** @type {TweetMediaEntry} */
        const mediaEntry = {
          screen_name,
          tweet_id,
          download_url,
          type,
          type_original,
          index,
          type_index,
          type_index_original,
          preview_url,
          media_id,
          media_key,
          expanded_url,
          short_expanded_url,
          short_tweet_url,
          tweet_text,
        };
        medias.push(mediaEntry);
      }

      verbose && console.log("[ujs][parseTweetLegacyMedias] medias", medias);
      return medias;
    }

    /**
         * Returns an array like this (https://x.com/kirachem/status/1805456475893928166):
         * [
             {
              "screen_name": "kirachem",
              "tweet_id": "1805456475893928166",
              "download_url": "https://video.twimg.com/amplify_video/1805450004041285634/vid/avc1/1080x1080/2da-wiS9XJ42-9rv.mp4?tag=16",
              "type": "video",
              "type_original": "video",
              "index": 0,
              "type_index": 0,
              "type_index_original": 0,
              "preview_url": "https://pbs.twimg.com/media/GQ4_SPoakAAnW8e.jpg",
              "media_id": "1805450004041285634",
              "media_key": "13_1805450004041285634",
              "expanded_url": "https://twitter.com/kirachem/status/1805456475893928166/video/1",
              "short_expanded_url": "pic.twitter.com/VnOcUSsGaC",
              "short_tweet_url": "https://t.co/VnOcUSsGaC",
              "tweet_text": "Bunny Tifa (Cloud's POV)"
             }
            ]
         */
    static async getTweetMedias(tweetId) {
      /* "old" (no more works / requires "x-client-transaction-id" header) and "new" API selection */
      const operationName = API.QueryConfig.TweetResultByRestId.operationName;

      // const url = API.createTweetJsonEndpointUrl(tweetId); // old 2025.04
      const url = API.createTweetJsonEndpointUrlByRestId(tweetId);

      const json = await API.apiRequest(url);
      verbose &&
        console.log("[ujs][getTweetMedias]", json, JSON.stringify(json));

      // const {tweetResult, tweetLegacy, tweetUser} = API.parseTweetJsonFrom_TweetDetail(json, tweetId); // [old] used before 2025.04
      const { tweetResult, tweetLegacy, tweetUser } =
        API.parseTweetJsonFrom_TweetResultByRestId(json, tweetId);

      let result = API.parseTweetLegacyMedias(
        tweetResult,
        tweetLegacy,
        tweetUser,
        operationName,
      );

      if (
        tweetResult.quoted_status_result &&
        tweetResult.quoted_status_result
          .result /* check is the qouted tweet not deleted */
      ) {
        const tweetResultQuoted = API.unwrapTweetResult(
          tweetResult.quoted_status_result.result,
          operationName,
          "data.tweetResult.result.quoted_status_result.result",
        );
        const {
          tweetLegacy: tweetLegacyQuoted,
          tweetUser: tweetUserQuoted,
        } = API.parseTweetResultParts(
          tweetResultQuoted,
          operationName,
          "data.tweetResult.result.quoted_status_result.result",
        );
        result = [
          ...result,
          ...API.parseTweetLegacyMedias(
            tweetResultQuoted,
            tweetLegacyQuoted,
            tweetUserQuoted,
            operationName,
          ),
        ];
      }

      return result;
    }

    /*  // dev only snippet (to extract params):
            a = new URL(`https://x.com/i/api/graphql/VwKJcAd7zqlBOitPLUrB8A/TweetDetail?...`);
            console.log("variables",    JSON.stringify(JSON.parse(Object.fromEntries(a.searchParams).variables),    null, "    "))
            console.log("features",     JSON.stringify(JSON.parse(Object.fromEntries(a.searchParams).features),     null, "    "))
            console.log("fieldToggles", JSON.stringify(JSON.parse(Object.fromEntries(a.searchParams).fieldToggles), null, "    "))
        */

    // get a URL for TweetResultByRestId endpoint
    static createTweetJsonEndpointUrlByRestId(tweetId) {
      const variables = {
        tweetId: tweetId,
        withCommunity: false,
        includePromotedContent: false,
        withVoice: false,
      };
      const features = {
        creator_subscriptions_tweet_preview_api_enabled: true,
        premium_content_api_read_enabled: false,
        communities_web_enable_tweet_community_results_fetch: true,
        c9s_tweet_anatomy_moderator_badge_enabled: true,
        responsive_web_grok_analyze_button_fetch_trends_enabled: false,
        responsive_web_grok_analyze_post_followups_enabled: false,
        responsive_web_jetfuel_frame: false,
        responsive_web_grok_share_attachment_enabled: true,
        articles_preview_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        tweet_awards_web_tipping_enabled: false,
        responsive_web_grok_show_grok_translated_post: false,
        responsive_web_grok_analysis_button_from_backend: false,
        creator_subscriptions_quote_tweet_preview_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        profile_label_improvements_pcf_label_in_post_enabled: true,
        rweb_tipjar_consumption_enabled: true,
        verified_phone_label_enabled: false,
        responsive_web_grok_image_annotation_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_enhance_cards_enabled: false,
      };
      const fieldToggles = {
        withArticleRichContentState: true,
        withArticlePlainText: false,
        withGrokAnalyze: false,
        withDisallowedReplyControls: false,
      };

      const queryConfig = API.QueryConfig.TweetResultByRestId;
      const urlBase = `https://${sitename}.com/i/api/graphql/${queryConfig.queryId}/${queryConfig.operationName}`;
      const urlObj = new URL(urlBase);
      urlObj.searchParams.set("variables", JSON.stringify(variables));
      urlObj.searchParams.set("features", JSON.stringify(features));
      urlObj.searchParams.set("fieldToggles", JSON.stringify(fieldToggles));
      const url = urlObj.toString();
      return url;
    }

    // get a URL for TweetDetail endpoint
    static createTweetJsonEndpointUrl(tweetId) {
      const variables = {
        focalTweetId: tweetId,
        rankingMode: "Relevance",
        includePromotedContent: true,
        withCommunity: true,
        withQuickPromoteEligibilityTweetFields: true,
        withBirdwatchNotes: true,
        withVoice: true,
      };
      const features = {
        rweb_video_screen_enabled: false,
        profile_label_improvements_pcf_label_in_post_enabled: true,
        rweb_tipjar_consumption_enabled: true,
        verified_phone_label_enabled: false,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        premium_content_api_read_enabled: false,
        communities_web_enable_tweet_community_results_fetch: true,
        c9s_tweet_anatomy_moderator_badge_enabled: true,
        responsive_web_grok_analyze_button_fetch_trends_enabled: false,
        responsive_web_grok_analyze_post_followups_enabled: true,
        responsive_web_jetfuel_frame: false,
        responsive_web_grok_share_attachment_enabled: true,
        articles_preview_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        tweet_awards_web_tipping_enabled: false,
        responsive_web_grok_show_grok_translated_post: false,
        responsive_web_grok_analysis_button_from_backend: true,
        creator_subscriptions_quote_tweet_preview_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        responsive_web_grok_image_annotation_enabled: true,
        responsive_web_enhance_cards_enabled: false,
      };
      const fieldToggles = {
        withArticleRichContentState: true,
        withArticlePlainText: false,
        withGrokAnalyze: false,
        withDisallowedReplyControls: false,
      };

      const queryConfig = API.QueryConfig.TweetDetail;
      const urlBase = `https://${sitename}.com/i/api/graphql/${queryConfig.queryId}/${queryConfig.operationName}`;
      const urlObj = new URL(urlBase);
      urlObj.searchParams.set("variables", JSON.stringify(variables));
      urlObj.searchParams.set("features", JSON.stringify(features));
      urlObj.searchParams.set("fieldToggles", JSON.stringify(fieldToggles));
      const url = urlObj.toString();
      return url;
    }

    // get data from UserByScreenName endpoint
    static async getUserInfo(username) {
      const variables = {
        screen_name: username,
      };
      const features = {
        hidden_profile_subscriptions_enabled: true,
        profile_label_improvements_pcf_label_in_post_enabled: true,
        rweb_tipjar_consumption_enabled: true,
        verified_phone_label_enabled: false,
        subscriptions_verification_info_is_identity_verified_enabled: true,
        subscriptions_verification_info_verified_since_enabled: true,
        highlights_tweets_tab_ui_enabled: true,
        responsive_web_twitter_article_notes_tab_enabled: true,
        subscriptions_feature_can_gift_premium: true,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
      };
      const fieldToggles = {
        withAuxiliaryUserLabels: true,
      };

      const queryConfig = API.QueryConfig.UserByScreenName;
      const urlBase = `https://${sitename}.com/i/api/graphql/${queryConfig.queryId}/${queryConfig.operationName}?`;
      const urlObj = new URL(urlBase);
      urlObj.searchParams.set("variables", JSON.stringify(variables));
      urlObj.searchParams.set("features", JSON.stringify(features));
      urlObj.searchParams.set("fieldToggles", JSON.stringify(fieldToggles));
      const url = urlObj.toString();

      const json = await API.apiRequest(url);
      verbose && console.log("[ujs][getUserInfo][json]", json);
      return json.data.user.result.legacy.entities.url?.urls[0].expanded_url;
    }
  }

  return API;
}

function getHistoryHelper() {
  function migrateLocalStore() {
    // 2023.07.05 // todo: uncomment after two+ months
    // Currently I disable it for cases if some browser's tabs uses the old version of the script.
    // const migrated = localStorage.getItem(StorageNames.migrated);
    // if (migrated === "true") {
    //     return;
    // }

    const newToOldNameMap = [
      [StorageNames.settings, StorageNamesOld.settings],
      [
        StorageNames.settingsImageHistoryBy,
        StorageNamesOld.settingsImageHistoryBy,
      ],
      [StorageNames.downloadedImageNames, StorageNamesOld.downloadedImageNames],
      [
        StorageNames.downloadedImageTweetIds,
        StorageNamesOld.downloadedImageTweetIds,
      ],
      [
        StorageNames.downloadedVideoTweetIds,
        StorageNamesOld.downloadedVideoTweetIds,
      ],
    ];

    /**
     * @param {string} newName
     * @param {string} oldName
     * @param {string} value
     */
    function setValue(newName, oldName, value) {
      try {
        localStorage.setItem(newName, value);
      } catch (err) {
        localStorage.removeItem(oldName); // if there is no space ("exceeded the quota")
        localStorage.setItem(newName, value);
      }
      localStorage.removeItem(oldName);
    }

    function mergeOldWithNew({ newName, oldName }) {
      const oldValueStr = localStorage.getItem(oldName);
      if (oldValueStr === null) {
        return;
      }
      const newValueStr = localStorage.getItem(newName);
      if (newValueStr === null) {
        setValue(newName, oldName, oldValueStr);
        return;
      }
      try {
        const oldValue = JSON.parse(oldValueStr);
        const newValue = JSON.parse(newValueStr);
        if (Array.isArray(oldValue) && Array.isArray(newValue)) {
          const resultArray = [...new Set([...newValue, ...oldValue])];
          const resultArrayStr = JSON.stringify(resultArray);
          setValue(newName, oldName, resultArrayStr);
        }
      } catch (err) {
        // return;
      }
    }

    for (const [newName, oldName] of newToOldNameMap) {
      mergeOldWithNew({ newName, oldName });
    }
    // localStorage.setItem(StorageNames.migrated, "true");
  }

  async function exportHistory(onDone, onError) {
    const exportObject = [
      StorageNames.settings,
      StorageNames.settingsImageHistoryBy,
      StorageNames.downloadedImageNames, // only if "settingsImageHistoryBy" === "IMAGE_NAME" (by default)
      StorageNames.downloadedImageTweetIds, // only if "settingsImageHistoryBy" === "TWEET_ID" (need to set manually with DevTools)
      StorageNames.downloadedVideoTweetIds,
    ].reduce((acc, name) => {
      const valueStr = localStorage.getItem(name);
      if (valueStr === null) {
        return acc;
      }
      let value = JSON.parse(valueStr);
      if (Array.isArray(value)) {
        value = [...new Set(value)];
      }
      acc[name] = value;
      return acc;
    }, {});
    const browserName =
      localStorage.getItem(StorageNames.browserName) || getBrowserName();
    const browserLine = browserName ? "-" + browserName : "";

    try {
      await downloadBlob(
        new Blob([toLineJSON(exportObject, true)]),
        `ujs-twitter-click-n-save-export-${formatDate(new Date(), datePattern)}${browserLine}.json`,
      );
      await onDone();
    } catch (err) {
      if (onError) {
        await onError(err);
        return;
      }
      throw err;
    }
  }

  function verify(jsonObject) {
    if (Array.isArray(jsonObject)) {
      throw new Error("Wrong object! JSON contains an array.");
    }
    if (
      Object.keys(jsonObject).some(
        (key) => !key.startsWith("ujs-twitter-click-n-save"),
      )
    ) {
      throw new Error(
        "Wrong object! The keys should start with 'ujs-twitter-click-n-save'.",
      );
    }
  }

  function importHistory(onDone, onError) {
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = "application/json";
    importInput.style.display = "none";
    document.body.prepend(importInput);
    importInput.addEventListener("change", async (_event) => {
      let json;
      try {
        json = JSON.parse(await importInput.files[0].text());
        verify(json);

        Object.entries(json).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value = [...new Set(value)];
          }
          localStorage.setItem(key, JSON.stringify(value));
        });
        onDone();
      } catch (err) {
        onError(err);
      } finally {
        await sleep(1000);
        importInput.remove();
      }
    });
    importInput.click();
  }

  function mergeHistory(onDone, onError) {
    // Only merges arrays
    const mergeInput = document.createElement("input");
    mergeInput.type = "file";
    mergeInput.accept = "application/json";
    mergeInput.style.display = "none";
    document.body.prepend(mergeInput);
    mergeInput.addEventListener("change", async (_event) => {
      let json;
      try {
        json = JSON.parse(await mergeInput.files[0].text());
        verify(json);
        Object.entries(json).forEach(([key, value]) => {
          if (!Array.isArray(value)) {
            return;
          }
          const existedValue = JSON.parse(localStorage.getItem(key));
          if (Array.isArray(existedValue)) {
            const resultValue = [...new Set([...existedValue, ...value])];
            localStorage.setItem(key, JSON.stringify(resultValue));
          } else {
            localStorage.setItem(key, JSON.stringify(value));
          }
        });
        onDone();
      } catch (err) {
        onError(err);
      } finally {
        await sleep(1000);
        mergeInput.remove();
      }
    });
    mergeInput.click();
  }

  return { exportHistory, importHistory, mergeHistory, migrateLocalStore };
}

// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
// --- Common Utils --- //

// --- LocalStorage util class --- //
function hoistLS(settings = {}) {
  const {
    verbose, // debug "messages" in the document.title
  } = settings;

  class LS {
    constructor(name) {
      this.name = name;
    }
    getItem(defaultValue) {
      return LS.getItem(this.name, defaultValue);
    }
    setItem(value) {
      LS.setItem(this.name, value);
    }
    removeItem() {
      LS.removeItem(this.name);
    }
    async pushItem(value) {
      // array method
      await LS.pushItem(this.name, value);
    }
    async popItem(value) {
      // array method
      await LS.popItem(this.name, value);
    }
    hasItem(value) {
      // array method
      return LS.hasItem(this.name, value);
    }

    static getItem(name, defaultValue) {
      const value = localStorage.getItem(name);
      if (value === undefined) {
        return undefined;
      }
      if (value === null) {
        // when there is no such item
        LS.setItem(name, defaultValue);
        return defaultValue;
      }
      return JSON.parse(value);
    }
    static setItem(name, value) {
      localStorage.setItem(name, JSON.stringify(value));
    }
    static removeItem(name) {
      localStorage.removeItem(name);
    }
    static async pushItem(name, value) {
      const array = LS.getItem(name, []);
      array.push(value);
      LS.setItem(name, array);

      //sanity check
      await sleep(50);
      if (!LS.hasItem(name, value)) {
        if (verbose) {
          document.title = "🟥" + document.title;
        }
        await LS.pushItem(name, value);
      }
    }
    static async popItem(name, value) {
      // remove from an array
      const array = LS.getItem(name, []);
      if (array.indexOf(value) !== -1) {
        array.splice(array.indexOf(value), 1);
        LS.setItem(name, array);

        //sanity check
        await sleep(50);
        if (LS.hasItem(name, value)) {
          if (verbose) {
            document.title = "🟨" + document.title;
          }
          await LS.popItem(name, value);
        }
      }
    }
    static hasItem(name, value) {
      // has in array
      const array = LS.getItem(name, []);
      return array.indexOf(value) !== -1;
    }
  }

  return LS;
}

// --- Just groups them in a function for the convenient code looking --- //
function getUtils({ verbose }) {
  function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }

  class ResourceFetchError extends Error {
    constructor(message, props) {
      super(message);
      this.name = "ResourceFetchError";
      Object.assign(this, props);
    }
  }

  function getResponseInfo(response, requestUrl) {
    const contentType = response.headers.get("content-type");
    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      contentType,
      headers: response.headers,
      url: response.url || requestUrl,
      requestUrl,
    };
  }

  function createResponseInfo({
    status,
    statusText = "",
    ok,
    headers = new Headers(),
    url,
    requestUrl,
  }) {
    const statusNumber = Number(status) || 0;
    const contentType = headers.get("content-type");
    return {
      status: statusNumber,
      statusText,
      ok:
        ok === undefined
          ? statusNumber >= 200 && statusNumber < 300
          : Boolean(ok),
      contentType,
      headers,
      url: url || requestUrl,
      requestUrl,
    };
  }

  function getResourceErrorMessage(prefix, responseInfo) {
    const statusText = responseInfo.statusText
      ? " " + responseInfo.statusText
      : "";
    const contentType = responseInfo.contentType
      ? ` (${responseInfo.contentType})`
      : "";
    return `${prefix}: ${responseInfo.status}${statusText}${contentType} ${responseInfo.url}`;
  }

  function isExpectedMediaContentType(contentType) {
    if (!contentType) {
      return true;
    }
    const mime = contentType.split(";")[0].trim().toLowerCase();
    return (
      mime.startsWith("image/") ||
      mime.startsWith("video/") ||
      mime === "application/octet-stream"
    );
  }

  function validateResourceResponse(
    responseInfo,
    { allowHttpError = false, allowUnexpectedContentType = false } = {},
  ) {
    if (!responseInfo.ok && !allowHttpError) {
      throw new ResourceFetchError(
        getResourceErrorMessage("Resource fetch failed", responseInfo),
        responseInfo,
      );
    }
    if (
      !allowUnexpectedContentType &&
      responseInfo.ok &&
      !isExpectedMediaContentType(responseInfo.contentType)
    ) {
      throw new ResourceFetchError(
        getResourceErrorMessage(
          "Unexpected resource content type",
          responseInfo,
        ),
        responseInfo,
      );
    }
  }

  function parseRawResponseHeaders(rawHeaders = "") {
    const headers = new Headers();
    rawHeaders
      .trim()
      .split(/\r?\n/)
      .forEach((line) => {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex <= 0) {
          return;
        }
        headers.append(
          line.slice(0, separatorIndex).trim(),
          line.slice(separatorIndex + 1).trim(),
        );
      });
    return headers;
  }

  function getUserscriptRequest() {
    if (
      typeof GM === "object" &&
      GM &&
      typeof GM.xmlHttpRequest === "function"
    ) {
      return { name: "GM.xmlHttpRequest", fn: GM.xmlHttpRequest.bind(GM) };
    }
    if (typeof GM_xmlhttpRequest === "function") {
      return { name: "GM_xmlhttpRequest", fn: GM_xmlhttpRequest };
    }
    return null;
  }

  function getUserscriptProgressProps(event, requestUrl) {
    const loaded = Number(event.loaded) || 0;
    const eventTotal = Number(event.total) || 0;
    const total = event.lengthComputable ? eventTotal : 0;
    return {
      loaded,
      total,
      gmTotal: eventTotal > 0 ? eventTotal : -1,
      lengthComputable: Boolean(event.lengthComputable),
      compressed: false,
      contentLength: eventTotal > 0 ? eventTotal : null,
      headers: new Headers(),
      status: 0,
      statusText: "",
      url: requestUrl,
      redirected: false,
      ok: false,
    };
  }

  function responseBlobFromUserscript(response, contentType) {
    const type = contentType ? contentType.split(";")[0].trim() : "";
    const value = response.response ?? response.responseText ?? "";
    if (
      value &&
      typeof value === "object" &&
      typeof value.size === "number" &&
      typeof value.slice === "function"
    ) {
      return value;
    }
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      return new Blob([value], { type });
    }
    return new Blob([value], { type });
  }

  async function requestResourceWithUserscript(requestUrl, onProgress) {
    const userscriptRequest = getUserscriptRequest();
    if (!userscriptRequest) {
      throw new Error("No userscript request API available");
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        callback(value);
      };
      const finish = (response) => {
        const headers = parseRawResponseHeaders(response.responseHeaders || "");
        const responseInfo = createResponseInfo({
          status: response.status,
          statusText: response.statusText || "",
          headers,
          url: response.finalUrl || response.responseURL || requestUrl,
          requestUrl,
        });
        const blob = responseBlobFromUserscript(
          response,
          responseInfo.contentType,
        );
        settle(resolve, { blob, responseInfo });
      };
      const fail = (err, fallbackMessage) => {
        settle(reject, toDownloadError(err, fallbackMessage));
      };
      const details = {
        method: "GET",
        url: requestUrl,
        responseType: "blob",
        onprogress: (event) => {
          if (!onProgress) {
            return;
          }
          try {
            onProgress(getUserscriptProgressProps(event, requestUrl));
          } catch (err) {
            console.error("[ujs][onProgress]:", err);
          }
        },
        onload: finish,
        onerror: (err) =>
          fail(err, `${userscriptRequest.name} failed to fetch ${requestUrl}`),
        ontimeout: (err) =>
          fail(err, `${userscriptRequest.name} timed out fetching ${requestUrl}`),
        onabort: (err) =>
          fail(err, `${userscriptRequest.name} aborted fetching ${requestUrl}`),
      };

      try {
        const result = userscriptRequest.fn(details);
        if (result && typeof result.then === "function") {
          result.then(
            finish,
            (err) =>
              fail(
                err,
                `${userscriptRequest.name} failed to fetch ${requestUrl}`,
              ),
          );
        }
      } catch (err) {
        fail(err, `${userscriptRequest.name} failed to fetch ${requestUrl}`);
      }
    });
  }

  async function requestResourceWithFetch(requestUrl, onProgress) {
    const response = await fetch(requestUrl, {
      // cache: "force-cache",
    });
    const responseInfo = getResponseInfo(response, requestUrl);
    const blob = await readResponseBlob(
      response,
      onProgress,
      responseInfo.contentType,
    );
    return { blob, responseInfo };
  }

  async function requestResourcePayload(requestUrl, onProgress) {
    const userscriptRequest = getUserscriptRequest();
    let userscriptRequestFailed = false;

    if (isSafari && userscriptRequest) {
      try {
        return await requestResourceWithUserscript(requestUrl, onProgress);
      } catch (err) {
        userscriptRequestFailed = true;
        verbose && console.warn("[ujs][fetchResource][userscript]", err);
      }
    }

    try {
      return await requestResourceWithFetch(requestUrl, onProgress);
    } catch (fetchErr) {
      if (!userscriptRequest || userscriptRequestFailed) {
        throw fetchErr;
      }
      try {
        return await requestResourceWithUserscript(requestUrl, onProgress);
      } catch (userscriptErr) {
        verbose && console.warn("[ujs][fetchResource][userscript]", userscriptErr);
        throw fetchErr;
      }
    }
  }

  function getResourceFilenameParts(url) {
    const fallback = {
      filename: "download",
      name: "download",
      extension: "",
    };
    try {
      const urlObj = new URL(url);
      const filename =
        urlObj.pathname.slice(urlObj.pathname.lastIndexOf("/") + 1) ||
        fallback.filename;
      const dotIndex = filename.lastIndexOf(".");
      const name = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
      let extension =
        dotIndex > -1 && dotIndex < filename.length - 1
          ? filename.slice(dotIndex + 1)
          : "";
      extension = urlObj.searchParams.get("format") || extension;
      return { filename, name, extension };
    } catch (err) {
      return fallback;
    }
  }

  async function fetchResource(
    url,
    onProgress = (props) => console.log(props),
    { allowHttpError = false, allowUnexpectedContentType = false } = {},
  ) {
    const requestUrl = url.toString();
    try {
      const { blob, responseInfo } = await requestResourcePayload(
        requestUrl,
        onProgress,
      );
      validateResourceResponse(responseInfo, {
        allowHttpError,
        allowUnexpectedContentType,
      });
      const lastModifiedDateSeconds =
        responseInfo.headers.get("last-modified");
      const contentType = responseInfo.contentType;

      const lastModifiedDate = formatDate(lastModifiedDateSeconds, datePattern);
      const filenameParts = getResourceFilenameParts(responseInfo.url);
      const extension = contentType
        ? extensionFromMime(contentType)
        : filenameParts.extension;
      return {
        blob,
        lastModifiedDate,
        contentType,
        extension,
        name: filenameParts.name,
        status: responseInfo.status,
        statusText: responseInfo.statusText,
        ok: responseInfo.ok,
        url: responseInfo.url,
      };
    } catch (error) {
      verbose && console.error("[ujs][fetchResource]", requestUrl);
      verbose && console.error("[ujs][fetchResource]", error);
      throw error;
    }
  }

  function extensionFromMime(mimeType) {
    const cleanMimeType = mimeType.split(";")[0].trim();
    let extension = cleanMimeType.split("/")[1] || "";
    extension = extension === "jpeg" ? "jpg" : extension;
    return extension;
  }

  // the original download url will be posted as hash of the blob url, so you can check it in the download manager's history
  async function downloadBlob(blob, name, url) {
    return downloadFile({ url, blob, filename: name, sourceUrl: url });
  }

  function getGMDownload() {
    if (typeof GM === "object" && GM && typeof GM.download === "function") {
      return { name: "GM.download", fn: GM.download.bind(GM) };
    }
    if (typeof GM_download === "function") {
      return { name: "GM_download", fn: GM_download };
    }
    return null;
  }

  function toDownloadError(err, fallbackMessage) {
    if (err instanceof Error) {
      return err;
    }
    return new Error(err?.message || String(err || fallbackMessage));
  }

  async function tryGMDownload({ url, filename }) {
    const gmDownload = getGMDownload();
    if (!gmDownload) {
      return false;
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(triggerTimer);
        callback(value);
      };
      const triggerTimer = setTimeout(() => settle(resolve, true), 2000);
      const details = {
        url,
        name: filename || "",
        onload: () => settle(resolve, true),
        onerror: (err) =>
          settle(
            reject,
            toDownloadError(err, `${gmDownload.name} failed to download ${url}`),
          ),
        ontimeout: (err) =>
          settle(
            reject,
            toDownloadError(err, `${gmDownload.name} timed out downloading ${url}`),
          ),
      };

      try {
        const result = gmDownload.fn(details);
        if (result && typeof result.then === "function") {
          result.then(
            () => settle(resolve, true),
            (err) =>
              settle(
                reject,
                toDownloadError(
                  err,
                  `${gmDownload.name} failed to download ${url}`,
                ),
              ),
          );
        }
      } catch (err) {
        clearTimeout(triggerTimer);
        try {
          const result = gmDownload.fn(url, filename || "");
          if (result && typeof result.then === "function") {
            result.then(resolve, reject);
            return;
          }
          resolve(true);
        } catch (fallbackErr) {
          reject(toDownloadError(fallbackErr, `${gmDownload.name} failed`));
        }
      }
    });
  }

  async function downloadFile({ url, blob, filename, sourceUrl } = {}) {
    if (!url && !blob) {
      throw new Error("downloadFile requires a url or blob");
    }

    const directUrl = url ? url.toString() : "";
    if (directUrl) {
      try {
        const gmDownloadStarted = await tryGMDownload({
          url: directUrl,
          filename,
        });
        if (gmDownloadStarted) {
          return;
        }
      } catch (err) {
        verbose && console.warn("[ujs][downloadFile][GM]", err);
      }
    }

    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      let revokeTimeout = setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      const originalUrl = sourceUrl || directUrl;
      const href = blobUrl + (originalUrl ? "#" + originalUrl : "");
      try {
        if (!directUrl) {
          try {
            const gmDownloadStarted = await tryGMDownload({ url: href, filename });
            if (gmDownloadStarted) {
              return;
            }
          } catch (err) {
            verbose && console.warn("[ujs][downloadFile][GM blob]", err);
          }
        }
        await downloadByAnchor({ href, filename });
      } catch (err) {
        clearTimeout(revokeTimeout);
        revokeTimeout = null;
        URL.revokeObjectURL(blobUrl);
        throw err;
      }
      return;
    }

    await downloadByAnchor({ href: directUrl, filename });
  }

  async function downloadByAnchor({ href, filename }) {
    const anchor = document.createElement("a");
    anchor.setAttribute("download", filename || "");
    anchor.href = href;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    await sleep(0);
  }

  /**
   * Formats date. Supports: YY.YYYY.MM.DD hh:mm:ss.
   * Default format: "YYYY.MM.DD".
   * formatDate() -> "2022.01.07"
   * @param {Date | string | number} [dateValue]
   * @param {string}  [pattern = "YYYY.MM.DD"]
   * @param {boolean} [utc = true]
   * @return {string}
   */
  function formatDate(
    dateValue = new Date(),
    pattern = "YYYY.MM.DD",
    utc = true,
  ) {
    dateValue = firefoxDateFix(dateValue);
    const date = new Date(dateValue);
    if (date.toString() === "Invalid Date") {
      console.warn("Invalid Date value: ", dateValue);
    }
    const formatter = new DateFormatter(date, utc);
    return pattern.replace(/YYYY|YY|MM|DD|hh|mm|ss/g, (...args) => {
      const property = args[0];
      return formatter[property];
    });
  }
  function firefoxDateFix(dateValue) {
    if (isString(dateValue)) {
      return dateValue.replace(
        /(\d{4})\.(\d{2})\.(\d{2})/,
        "$1-$2-$3",
      );
    }
    return dateValue;
  }
  function isString(value) {
    return typeof value === "string";
  }
  function pad0(value, count = 2) {
    return value.toString().padStart(count, "0");
  }
  class DateFormatter {
    constructor(date = new Date(), utc = true) {
      this.date = date;
      this.utc = utc ? "UTC" : "";
    }
    get ss() {
      return pad0(this.date[`get${this.utc}Seconds`]());
    }
    get mm() {
      return pad0(this.date[`get${this.utc}Minutes`]());
    }
    get hh() {
      return pad0(this.date[`get${this.utc}Hours`]());
    }
    get DD() {
      return pad0(this.date[`get${this.utc}Date`]());
    }
    get MM() {
      return pad0(this.date[`get${this.utc}Month`]() + 1);
    }
    get YYYY() {
      return pad0(this.date[`get${this.utc}FullYear`](), 4);
    }
    get YY() {
      return this.YYYY.slice(2);
    }
  }

  function addCSS(css) {
    const styleElem = document.createElement("style");
    styleElem.textContent = css;
    const styleRoot = document.head || document.body || document.documentElement;
    styleRoot.append(styleElem);
    return styleElem;
  }

  function getCookie(name) {
    verbose && console.log("[ujs][getCookie]", document.cookie);
    const prefix = name + "=";
    const cookie = document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(prefix));
    return cookie?.slice(prefix.length);
  }

  function throttle(runnable, time = 50) {
    let waiting = false;
    let queued = false;
    let context;
    let args;

    return function () {
      if (!waiting) {
        waiting = true;
        setTimeout(function () {
          if (queued) {
            runnable.apply(context, args);
            context = args = undefined;
          }
          waiting = queued = false;
        }, time);
        return runnable.apply(this, arguments);
      } else {
        queued = true;
        context = this;
        args = arguments;
      }
    };
  }

  function throttleWithResult(func, time = 50) {
    let waiting = false;
    let args;
    let context;
    let timeout;
    let promise;

    return async function () {
      if (!waiting) {
        waiting = true;
        timeout = new Promise(async (resolve) => {
          await sleep(time);
          waiting = false;
          resolve();
        });
        return func.apply(this, arguments);
      } else {
        args = arguments;
        context = this;
      }

      if (!promise) {
        promise = new Promise(async (resolve) => {
          await timeout;
          const result = func.apply(context, args);
          args = context = promise = undefined;
          resolve(result);
        });
      }
      return promise;
    };
  }

  function xpath(path, node = document) {
    let xPathResult = document.evaluate(
      path,
      node,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    return xPathResult.singleNodeValue;
  }
  function xpathAll(path, node = document) {
    let xPathResult = document.evaluate(
      path,
      node,
      null,
      XPathResult.ORDERED_NODE_ITERATOR_TYPE,
      null,
    );
    const nodes = [];
    try {
      let node = xPathResult.iterateNext();

      while (node) {
        nodes.push(node);
        node = xPathResult.iterateNext();
      }
      return nodes;
    } catch (err) {
      // todo need investigate it
      console.error(err); // "The document has mutated since the result was returned."
      return [];
    }
  }

  const identityContentEncodings = new Set([null, "identity", "no encoding"]);
  /** @param {Response} response */
  function getOnProgressProps(response) {
    const { headers, status, statusText, url, redirected, ok } = response;
    const isIdentity = identityContentEncodings.has(
      headers.get("Content-Encoding"),
    );
    const compressed = !isIdentity;
    const _contentLength = parseInt(headers.get("Content-Length")); // `get()` returns `null` if no header present
    const contentLength = isNaN(_contentLength) ? null : _contentLength;
    const lengthComputable = isIdentity && contentLength !== null;

    // Original XHR behaviour; in TM it equals to `contentLength`, or `-1` if `contentLength` is `null` (and `0`?).
    const total = lengthComputable ? contentLength : 0;
    const gmTotal = contentLength > 0 ? contentLength : -1; // Like `total` is in TM and GM.

    return {
      gmTotal,
      total,
      lengthComputable,
      compressed,
      contentLength,
      headers,
      status,
      statusText,
      url,
      redirected,
      ok,
    };
  }

  async function readResponseBlob(response, onProgress, contentType) {
    const onProgressProps = getOnProgressProps(response);
    let loaded = 0;
    if (
      !onProgress ||
      !response.body ||
      typeof response.body.getReader !== "function"
    ) {
      return response.blob();
    }
    const reader = response.body.getReader();
    const chunks = [];
    try {
      while (true) {
        const { done, /** @type {Uint8Array} */ value } = await reader.read();
        if (done) {
          break;
        }
        loaded += value.length;
        chunks.push(value);
        try {
          onProgress({ loaded, ...onProgressProps });
        } catch (err) {
          console.error("[ujs][onProgress]:", err);
        }
      }
    } finally {
      reader.releaseLock();
    }
    const type = contentType ? contentType.split(";")[0].trim() : "";
    return new Blob(chunks, { type });
  }

  function toLineJSON(object, prettyHead = false) {
    let result = "{\n";
    const entries = Object.entries(object);
    const length = entries.length;
    if (prettyHead && length > 0) {
      result += `"${entries[0][0]}":${JSON.stringify(entries[0][1], null, " ")}`;
      if (length > 1) {
        result += `,\n\n`;
      }
    }
    for (let i = 1; i < length - 1; i++) {
      result += `"${entries[i][0]}":${JSON.stringify(entries[i][1])},\n`;
    }
    if ((length > 0 && !prettyHead) || length > 1) {
      result += `"${entries[length - 1][0]}":${JSON.stringify(entries[length - 1][1])}`;
    }
    result += `\n}`;
    return result;
  }

  // Sometimes it's `false` for unknown reason in FF.
  const isFirefoxUserscriptContext =
    typeof wrappedJSObject === "object" && wrappedJSObject !== null;
  const userAgent = navigator.userAgent.toLowerCase();
  const isFirefox = userAgent.indexOf("firefox") !== -1;
  const isSafari =
    userAgent.indexOf("safari") !== -1 &&
    userAgent.indexOf("chrome") === -1 &&
    userAgent.indexOf("crios") === -1 &&
    userAgent.indexOf("fxios") === -1 &&
    userAgent.indexOf("edg") === -1 &&
    userAgent.indexOf("opr") === -1;
  verbose &&
    console.log("[ujs] isFirefoxUserscriptContext", isFirefoxUserscriptContext);

  function getBrowserName() {
    return userAgent.indexOf("edge") > -1
      ? "edge-legacy"
      : userAgent.indexOf("edg") > -1
        ? "edge"
        : userAgent.indexOf("opr") > -1 && !!window.opr
          ? "opera"
          : userAgent.indexOf("chrome") > -1 && !!window.chrome
            ? "chrome"
            : userAgent.indexOf("firefox") > -1
              ? "firefox"
              : userAgent.indexOf("safari") > -1
                ? "safari"
                : "";
  }

  function removeSearchParams(url) {
    const urlObj = new URL(url);
    const keys = []; // FF + VM fix // Instead of [...urlObj.searchParams.keys()]
    urlObj.searchParams.forEach((v, k) => {
      keys.push(k);
    });
    for (const key of keys) {
      urlObj.searchParams.delete(key);
    }
    return urlObj.toString();
  }

  /**
   * @param {string} template
   * @param {Record<string, any>} props
   * @returns {{value: string, hasUndefined: boolean}}
   */
  function renderTemplateString(template, props) {
    let hasUndefined = false;
    const value = template.replace(/{[^{}]+?}/g, (match, index, string) => {
      const key = match.slice(1, -1);
      const propValue = props[key];
      if (propValue === undefined) {
        hasUndefined = true;
      }
      return propValue;
    });
    return { value, hasUndefined };
  }

  /**
   * Formats bytes mostly like Windows does,
   * but in some rare cases the result is different.
   * @param {number} bytes
   * @return {string}
   */
  function formatSizeWinLike(bytes) {
    if (bytes < 1024) {
      return bytes + " B";
    }
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    let i = Math.floor(Math.log(bytes) / Math.log(1024));
    let result = bytes / Math.pow(1024, i);
    if (result >= 1000) {
      i++;
      result /= 1024;
    }
    return toTruncPrecision3(result) + " " + sizes[i];
  }

  /**
   * @example
   * 10.1005859375 -> "10.1"
   * 9.99902343750 -> "9.99"
   * 836.966796875 -> "836"
   * 0.08   -> "0.08"
   * 0.099  -> "0.09"
   * 0.0099 -> "0"
   * @param {number} number
   * @return {string}
   */
  function toTruncPrecision3(number) {
    let result;
    if (number < 10) {
      result = Math.trunc(number * 100) / 100;
    } else if (number < 100) {
      result = Math.trunc(number * 10) / 10;
    } else if (number < 1000) {
      result = Math.trunc(number);
    } else {
      return Math.trunc(number).toString();
    }
    if (number < 0.1) {
      return result.toPrecision(1);
    } else if (number < 1) {
      return result.toPrecision(2);
    }
    return result.toPrecision(3);
  }

  return {
    sleep,
    fetchResource,
    extensionFromMime,
    downloadFile,
    downloadBlob,
    formatDate,
    addCSS,
    getCookie,
    throttle,
    throttleWithResult,
    xpath,
    xpathAll,
    toLineJSON,
    isFirefox,
    isFirefoxUserscriptContext,
    getBrowserName,
    removeSearchParams,
    renderTemplateString,
    formatSizeWinLike,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
