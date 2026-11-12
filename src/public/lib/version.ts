// App version shown in the page headers, as MAJOR.MINOR.DEV.
// MAJOR.MINOR = the last Wix release (`wix release`). DEV = changes built since then.
// On a release: set MAJOR.MINOR to the new Wix version and DEV back to 0.
// Between releases: add 1 to DEV for each change.
export const APP_VERSION = { major: 6, minor: 3, dev: 0 };

export const APP_VERSION_TEXT = `v${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.dev}`;
