import regularUrl from '../assets/fonts/DejaVuSans.ttf?url';
import boldUrl from '../assets/fonts/DejaVuSans-Bold.ttf?url';
import type { jsPDF } from 'jspdf';
let fontData: Promise<[string, string]> | undefined;
async function encoded(url: string) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error('The PDF font could not be loaded. Reconnect once to prepare offline exports.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}
export async function preparePdfFont(document: jsPDF) {
  fontData ??= Promise.all([encoded(regularUrl), encoded(boldUrl)]).catch((error) => {
    fontData = undefined;
    throw error;
  });
  const [regular, bold] = await fontData;
  document.addFileToVFS('DejaVuSans.ttf', regular);
  document.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  document.addFileToVFS('DejaVuSans-Bold.ttf', bold);
  document.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');
  document.setFont('DejaVuSans', 'normal');
}
