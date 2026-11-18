import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** QR generado en el navegador (mismo contenido que el del PDF: solo el código). */
export function QrImage({ value, size = 180 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#1f1b4d', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [value, size]);
  return src ? (
    <img src={src} width={size} height={size} alt={`Código QR de la entrada ${value}`} className="block" />
  ) : (
    <div style={{ width: size, height: size }} className="animate-pulse rounded bg-tinta/5" />
  );
}
