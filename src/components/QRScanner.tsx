import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface Props {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: Props) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Initialize scanner
    scannerRef.current = new Html5QrcodeScanner(
      "qr-reader",
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
        showZoomSliderIfSupported: true,
      },
      /* verbose= */ false
    );

    scannerRef.current.render(
      (decodedText) => {
        // Success callback
        if (scannerRef.current) {
          scannerRef.current.clear().then(() => {
            onScan(decodedText);
          }).catch(err => {
            console.error("Failed to clear scanner", err);
            onScan(decodedText);
          });
        }
      },
      (errorMessage) => {
        // Error callback (usually just "no QR code found in frame")
        // We don't want to log this as it happens every frame
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error("Cleanup error", err));
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-[32px] overflow-hidden relative">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-serif font-bold">Scan QR Code</h3>
            <p className="text-xs text-[#5A5A40] italic">Position the QR code within the frame</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6">
          <div id="qr-reader" className="overflow-hidden rounded-2xl border-2 border-dashed border-gray-200"></div>
        </div>

        <div className="p-6 bg-gray-50 text-center">
          <p className="text-xs text-gray-400 uppercase font-bold tracking-widest">
            New Era University Laboratory Portal
          </p>
        </div>
      </div>
    </div>
  );
}
