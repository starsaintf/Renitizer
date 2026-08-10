const locationClueCategories = new Set([
  'landmark', 'location', 'location-clue', 'street-sign', 'road-name', 'map',
  'route-display', 'dashboard-gps', 'place-name', 'business-name',
]);

const personalDocumentCategories = new Set([
  'id-card', 'passport', 'bank-card', 'document', 'mail', 'mail-label', 'shipping-label', 'boarding-pass',
]);

const distinctivePersonalCategories = new Set(['tattoo', 'birthmark', 'school-uniform']);

export function friendlyFinding(finding = {}) {
  const id = String(finding.id || '');
  const category = String(finding.category || '');

  if (id.includes('gps')) return { title: 'Location details found', detail: 'This file may include where it was made.' };
  if (id.includes('metadata') || id.includes('verify-')) return { title: 'File details found', detail: finding.resolved ? 'These details were removed from your clean copy.' : 'This file may include details added by a device or app.' };
  if (id.includes('barcode') || category === 'barcode' || category === 'qr') return { title: 'A scannable code was found', detail: 'A code in the image may share information when scanned.' };
  if (id.startsWith('face-') || category === 'face') return { title: 'A face was found', detail: 'You can blur, cover, crop it out, or keep it before you share.' };
  if (id.includes('ocr-email') || category === 'email') return { title: 'An email address was found', detail: 'Writing in this image may include an email address.' };
  if (id.includes('ocr-phone') || category === 'phone') return { title: 'A phone number was found', detail: 'Writing in this image may include a phone number.' };
  if (id.includes('ocr-visual-address') || category === 'address') return { title: 'An address may be visible', detail: 'Writing in this image may include part of an address.' };
  if (category === 'vehicle-plate' || category === 'license-plate') return { title: 'A vehicle plate was found', detail: 'A plate can help link this image to a vehicle.' };
  if (locationClueCategories.has(category)) return { title: 'A location clue was found', detail: 'This image may reveal where it was taken.' };
  if (personalDocumentCategories.has(category)) return { title: 'A personal document may be visible', detail: 'Review it before you share this image.' };
  if (distinctivePersonalCategories.has(category)) return { title: 'A distinctive personal detail may be visible', detail: 'A tattoo or similar detail can make someone easier to recognise.' };
  if (category === 'reflection') return { title: 'A reflection may reveal private details', detail: 'A mirror, window, or glasses reflection can show more than the main image.' };
  if (category === 'company-logo') return { title: 'An organisation clue may be visible', detail: 'A logo can reveal a workplace, school, or other connection.' };
  if (category === 'wifi-ssid') return { title: 'A network name may be visible', detail: 'A Wi-Fi name can reveal a home, workplace, or nearby location.' };
  if (category === 'calendar-event' || category === 'watch-display') return { title: 'A time or schedule detail may be visible', detail: 'A display can reveal when or where something is happening.' };
  if (category === 'key') return { title: 'A key may be visible', detail: 'A key can reveal an access detail or a place connected to it.' };
  if (category === 'screen') return { title: 'A screen may show private information', detail: 'Review it before you share this image.' };
  if (id === 'document-processor-unavailable') return { title: 'Document check needs a processor', detail: 'This browser cannot inspect or clean the inside of this document without a configured processor.' };
  if (id.includes('unavailable')) return { title: 'One extra check was not available', detail: 'Your browser could not run every optional check.' };
  if (id === 'file-facts') return { title: 'Your file was checked', detail: 'We looked at the file and the details that can travel with it.' };
  return { title: 'A private detail may need your attention', detail: 'This extra check found something worth reviewing before you share.' };
}

export function findingStatus(finding = {}) {
  if (finding.resolved) return 'addressed in clean copy';
  const planned = { blur: 'blurred', cover: 'covered', crop: 'cropped out', mute: 'muted', bleep: 'bleeped', remove: 'removed' };
  return planned[finding.redactionAction] ? `will be ${planned[finding.redactionAction]} in your clean copy` : 'may need your attention';
}
