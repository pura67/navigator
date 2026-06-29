// Runs in the page's main world (contextIsolation:false) BEFORE the site's own
// scripts — so Instagram's anti-automation JS sees a plain Chrome, not Electron.
// Pairs with the sec-ch-ua header rewrite in session-config.js (that covers the
// server side; this covers what page JS reads). CommonJS (.cjs) so it loads
// regardless of the package's "type":"module".
(() => {
  const BRANDS = [
    { brand: 'Not A(Brand', version: '99' },
    { brand: 'Google Chrome', version: '132' },
    { brand: 'Chromium', version: '132' },
  ];
  const set = (obj, prop, value) => {
    try { Object.defineProperty(obj, prop, { get: () => value, configurable: true }); } catch { /* noop */ }
  };

  // 1. navigator.webdriver must be false (automation tell).
  set(navigator, 'webdriver', false);

  // 2. navigator.userAgentData — strip the "Electron" brand; match the UA + the
  //    sec-ch-ua header we send (Chrome 132 on macOS).
  try {
    const uaData = {
      brands: BRANDS,
      mobile: false,
      platform: 'macOS',
      getHighEntropyValues: (hints) => Promise.resolve({
        architecture: 'arm',
        bitness: '64',
        brands: BRANDS,
        fullVersionList: BRANDS.map((b) => ({ brand: b.brand, version: `${b.version}.0.0.0` })),
        mobile: false,
        model: '',
        platform: 'macOS',
        platformVersion: '15.0.0',
        uaFullVersion: '132.0.0.0',
        wow64: false,
      }),
      toJSON: () => ({ brands: BRANDS, mobile: false, platform: 'macOS' }),
    };
    set(navigator, 'userAgentData', uaData);
  } catch { /* noop */ }
})();
