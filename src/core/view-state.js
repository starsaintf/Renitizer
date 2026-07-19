export function getViewFromHash(hash) {
  if (hash === '#app') return 'app';
  if (hash === '#decrypt') return 'decrypt';
  return 'home';
}
