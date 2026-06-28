// Registry of destination backends + the field metadata the UI builds forms from.
// Adding a backend = drop a file next to this one and register it here.
import { webhookDestination } from './webhook.js';
import { s3Destination } from './s3.js';
import { folderDestination } from './folder.js';

const FACTORIES = {
  webhook: webhookDestination,
  s3: s3Destination,
  folder: folderDestination,
};

// Drives the "Add destination" form. type: text | password | textarea | checkbox.
export const TYPES = [
  {
    id: 'webhook', label: 'Webhook / HTTP API',
    blurb: 'POST your data to any endpoint that accepts JSON. Records go as JSON batches; media files as raw bytes.',
    fields: [
      { key: 'url', label: 'Endpoint URL', type: 'text', placeholder: 'https://example.com/ingest', required: true },
      { key: 'token', label: 'Bearer token', type: 'password', placeholder: 'optional — sent as Authorization: Bearer …' },
      { key: 'headers', label: 'Extra headers', type: 'textarea', placeholder: 'X-Api-Key: abc123\nX-Source: navigator' },
      { key: 'sendMedia', label: 'Also upload media files', type: 'checkbox', default: true },
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
      { key: 'sendMedia', label: 'Also upload media files', type: 'checkbox', default: true },
    ],
  },
  {
    id: 'folder', label: 'Folder',
    blurb: 'Write a copy to a local or mounted folder (external drive, NAS, synced folder…).',
    fields: [
      { key: 'path', label: 'Folder path', type: 'text', placeholder: '/Volumes/Backup/navigator', required: true },
    ],
  },
];

export function makeDestination({ type, config }) {
  const factory = FACTORIES[type];
  if (!factory) throw new Error(`unknown destination type: ${type}`);
  return factory(config || {});
}
