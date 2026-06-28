// Registry of destination backends + the field metadata the UI builds forms from.
// Adding a backend = drop a file next to this one and register it here.
import { webhookDestination } from './webhook.js';
import { azureDestination } from './azure.js';
import { s3Destination } from './s3.js';
import { folderDestination } from './folder.js';
import { googleDriveDestination } from './google-drive.js';

const FACTORIES = {
  webhook: webhookDestination,
  azure: azureDestination,
  s3: s3Destination,
  folder: folderDestination,
  'google-drive': googleDriveDestination,
};

const CONTENT_OPTS = [
  { value: 'all', label: 'Everything (records + all media)' },
  { value: 'videos', label: 'Videos only (video file + JSON sidecar)' },
];

// Drives the "Add destination" form. type: text | password | textarea | checkbox | select.
export const TYPES = [
  {
    id: 'auto', label: 'Paste a link — auto-detect',
    blurb: 'Paste an Azure SAS URL, an S3/GCS/R2/B2 URL (https://key:secret@host/bucket), or any HTTP endpoint. The provider is detected for you.',
    fields: [
      { key: 'connection', label: 'Connection URL or SAS', type: 'text', placeholder: 'https://acct.blob.core.windows.net/container?sv=…&sig=…', required: true },
      { key: 'prefix', label: 'Path prefix', type: 'text', placeholder: 'optional folder, e.g. exports/' },
      { key: 'content', label: 'What to send', type: 'select', default: 'all', options: CONTENT_OPTS },
    ],
  },
  {
    id: 'webhook', label: 'Webhook / HTTP API',
    blurb: 'POST your data to any endpoint that accepts JSON. Records go as JSON batches; media files as raw bytes.',
    fields: [
      { key: 'url', label: 'Endpoint URL', type: 'text', placeholder: 'https://example.com/ingest', required: true },
      { key: 'token', label: 'Bearer token', type: 'password', placeholder: 'optional — sent as Authorization: Bearer …' },
      { key: 'headers', label: 'Extra headers', type: 'textarea', placeholder: 'X-Api-Key: abc123\nX-Source: navigator' },
      { key: 'content', label: 'What to send', type: 'select', default: 'all', options: CONTENT_OPTS },
      { key: 'sendMedia', label: 'Also upload media files', type: 'checkbox', default: true },
    ],
  },
  {
    id: 'azure', label: 'Azure Blob Storage',
    blurb: 'Upload to an Azure Blob container with a SAS URL — the standard scoped, time-limited, revocable Azure credential. No keys to manage.',
    fields: [
      { key: 'sasUrl', label: 'Container SAS URL', type: 'password', placeholder: 'https://<acct>.blob.core.windows.net/<container>?sv=…&sig=…', required: true },
      { key: 'prefix', label: 'Path prefix', type: 'text', placeholder: 'optional folder, e.g. exports/' },
      { key: 'content', label: 'What to send', type: 'select', default: 'all', options: CONTENT_OPTS },
    ],
  },
  {
    id: 's3', label: 'Cloud storage (S3-compatible)',
    blurb: 'Push to any S3-compatible object store. Works with the major cloud providers and self-hosted servers.',
    fields: [
      { key: 'endpoint', label: 'Endpoint URL', type: 'text', placeholder: 'https://s3.region.example.com', required: true },
      { key: 'bucket', label: 'Bucket', type: 'text', required: true },
      { key: 'region', label: 'Region', type: 'text', placeholder: 'auto' },
      { key: 'accessKeyId', label: 'Access key ID', type: 'text', required: true },
      { key: 'secretAccessKey', label: 'Secret access key', type: 'password', required: true },
      { key: 'prefix', label: 'Key prefix', type: 'text', placeholder: 'optional folder, e.g. exports/' },
      { key: 'content', label: 'What to send', type: 'select', default: 'all', options: CONTENT_OPTS },
    ],
  },
  {
    id: 'google-drive', label: 'Google Drive',
    blurb: 'Back up to your own Google Drive (like WhatsApp). Connect once with Google sign-in; whoever you grant access reads the same folder.',
    fields: [
      { key: 'clientId', label: 'Google OAuth client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'Google OAuth client secret', type: 'password', required: true },
      { key: 'refreshToken', label: '', type: 'connect' },
      { key: 'folderId', label: 'Target folder ID', type: 'text', placeholder: 'optional — a Drive folder ID; blank = My Drive root' },
      { key: 'content', label: 'What to send', type: 'select', default: 'all', options: CONTENT_OPTS },
    ],
  },
  {
    id: 'folder', label: 'Folder',
    blurb: 'Write a copy to a local or mounted folder (external drive, NAS, synced folder…).',
    fields: [
      { key: 'path', label: 'Folder path', type: 'text', placeholder: '/Volumes/Backup/navigator', required: true },
      { key: 'content', label: 'What to send', type: 'select', default: 'all', options: CONTENT_OPTS },
    ],
  },
];

export function makeDestination({ type, config }) {
  const factory = FACTORIES[type];
  if (!factory) throw new Error(`unknown destination type: ${type}`);
  return factory(config || {});
}
