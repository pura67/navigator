import { contextBridge, ipcRenderer } from 'electron';

// The renderer's only bridge to the main process. Thin: each method maps to one
// IPC channel. Account-scoped calls pass an accountId (the active account).
contextBridge.exposeInMainWorld('api', {
  listPlatforms: () => ipcRenderer.invoke('platforms:list'),
  accountStatus: (platform) => ipcRenderer.invoke('account:status', platform),
  accountsList: (platform) => ipcRenderer.invoke('accounts:list', platform),
  login: (platform, fresh) => ipcRenderer.invoke('login:start', { platform, fresh }),
  disconnect: (platform, accountId) => ipcRenderer.invoke('account:disconnect', { platform, accountId }),

  sync: (platform, scope, accountId) => ipcRenderer.invoke('sync:start', { platform, scope, accountId }),
  summary: (platform, accountId) => ipcRenderer.invoke('data:summary', { platform, accountId }),
  listItems: (platform, category, accountId) => ipcRenderer.invoke('data:list', { platform, category, accountId }),
  creators: (platform, accountId) => ipcRenderer.invoke('data:creators', { platform, accountId }),
  byCreator: (platform, accountId, username) => ipcRenderer.invoke('data:byCreator', { platform, accountId, username }),
  exportData: (platform, accountId) => ipcRenderer.invoke('export:run', { platform, accountId }),
  dmThreads: (platform, accountId) => ipcRenderer.invoke('dm:threads', { platform, accountId }),
  dmSync: (platform, accountId, threadIds) => ipcRenderer.invoke('dm:sync', { platform, accountId, threadIds }),

  openDataDir: () => ipcRenderer.invoke('open:dataDir'),
  openUrl: (url) => ipcRenderer.invoke('open:url', url),
  openPath: (rel) => ipcRenderer.invoke('open:path', rel),
  fetchImage: (platform, accountId, url) => ipcRenderer.invoke('media:dataUrl', { platform, accountId, url }),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),

  destinationTypes: () => ipcRenderer.invoke('destinations:types'),
  destinations: () => ipcRenderer.invoke('destinations:list'),
  saveDestination: (payload) => ipcRenderer.invoke('destinations:save', payload),
  deleteDestination: (id) => ipcRenderer.invoke('destinations:delete', { id }),
  testDestination: (payload) => ipcRenderer.invoke('destinations:test', payload),
  connectDrive: (clientId, clientSecret) => ipcRenderer.invoke('drive:connect', { clientId, clientSecret }),
  pushTo: (platform, accountId, destinationId, opts = {}) => ipcRenderer.invoke('push:run', { platform, accountId, destinationId, ...opts }),

  onProgress: (cb) => ipcRenderer.on('sync:progress', (_e, p) => cb(p)),
  onPushProgress: (cb) => ipcRenderer.on('push:progress', (_e, p) => cb(p)),
  onConnected: (cb) => ipcRenderer.on('account:connected', (_e, p) => cb(p)),
});
