export function getViewFromHash(hash) {
  if (hash === '#decrypt') return 'decrypt';
  return 'app';
}
