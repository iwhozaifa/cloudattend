import { Scanner, setZXingModuleOverrides, type IDetectedBarcode, type IScannerError } from '@yudiel/react-qr-scanner';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { extractToken } from '@/lib/qr';

// Serve the decoder from our own origin instead of the library's default CDN (CSP + privacy).
setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) });

function describe(error: IScannerError) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError') return 'Camera access was blocked. Allow camera access in your browser settings, or enter the code manually.';
  if (name === 'NotFoundError') return 'No camera was found on this device. Enter the code manually instead.';
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close it and try again, or enter the code manually.';
  return 'The camera could not be started. Enter the code manually instead.';
}

export default function QrScannerImpl({ paused, onToken, onError }: { paused: boolean; onToken: (token: string) => void; onError: (message: string) => void }) {
  return (
    <Scanner
      formats={['qr_code']}
      paused={paused}
      sound={false}
      constraints={{ facingMode: 'environment' }}
      components={{ finder: true, torch: true }}
      onScan={(codes: IDetectedBarcode[]) => {
        for (const code of codes) {
          const token = extractToken(code.rawValue);
          if (token) { onToken(token); return; }
        }
      }}
      onError={(error) => onError(describe(error))}
    />
  );
}
