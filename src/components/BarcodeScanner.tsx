'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
}

export function BarcodeScanner({ onScan }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    async function startScanner() {
      if (!containerRef.current) return;

      try {
        const scanner = new Html5Qrcode('barcode-scanner');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 100 },
            aspectRatio: 1.333,
          },
          (decodedText) => {
            // Stop scanning after successful read
            scanner.stop().then(() => {
              if (mounted) {
                onScan(decodedText);
              }
            });
          },
          () => {
            // Ignore scan failures (no barcode in frame)
          }
        );

        if (mounted) {
          setIsStarted(true);
          setError(null);
        }
      } catch (err) {
        console.error('Scanner error:', err);
        if (mounted) {
          setError('Unable to access camera. Please allow camera permissions or enter barcode manually.');
        }
      }
    }

    startScanner();

    return () => {
      mounted = false;
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        if (scanner.getState() === Html5QrcodeScannerState.SCANNING) {
          scanner.stop().catch(console.error);
        }
      }
    };
  }, [onScan]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      onScan(manualBarcode.trim());
    }
  };

  return (
    <div className="space-y-6">
      {/* Camera preview */}
      <div
        ref={containerRef}
        className="relative aspect-[4/3] bg-black rounded-xl overflow-hidden"
      >
        <div id="barcode-scanner" className="w-full h-full" />
        
        {/* Scanning overlay */}
        {isStarted && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[250px] h-[100px] border-2 border-white/50 rounded-lg relative">
              {/* Corner accents */}
              <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-macro-calories rounded-tl-lg" />
              <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-macro-calories rounded-tr-lg" />
              <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-macro-calories rounded-bl-lg" />
              <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-macro-calories rounded-br-lg" />
              
              {/* Scanning line */}
              <div className="absolute inset-x-2 top-1/2 h-0.5 bg-macro-calories/50 animate-pulse-glow" />
            </div>
          </div>
        )}

        {/* Loading state */}
        {!isStarted && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-elevated">
            <div className="w-10 h-10 border-4 border-macro-calories border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-text-secondary">Starting camera...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-elevated p-6 text-center">
            <svg className="w-12 h-12 text-text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-text-secondary text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Instructions */}
      <p className="text-caption text-center text-text-secondary">
        Point your camera at a barcode
      </p>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-border-subtle" />
        <span className="text-text-muted text-sm">or</span>
        <div className="flex-1 h-px bg-border-subtle" />
      </div>

      {/* Manual entry */}
      <form onSubmit={handleManualSubmit} className="space-y-4">
        <input
          type="text"
          value={manualBarcode}
          onChange={(e) => setManualBarcode(e.target.value)}
          placeholder="Enter barcode manually..."
          className="input-field"
          pattern="[0-9]*"
          inputMode="numeric"
        />
        <button
          type="submit"
          disabled={!manualBarcode.trim()}
          className="btn-secondary w-full disabled:opacity-50"
        >
          Search
        </button>
      </form>
    </div>
  );
}
