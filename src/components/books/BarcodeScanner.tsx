import React, { useEffect, useRef, useState } from "react";
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Camera } from "lucide-react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    let mounted = true;

    const startScanner = async () => {
      try {
        if (!videoRef.current) return;

        // Configure hints for EAN-13 barcodes
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        // Create reader instance with hints
        const reader = new BrowserMultiFormatReader(hints);
        readerRef.current = reader;

        // Start continuous scanning
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: "environment",
              width: { min: 640, ideal: 1280, max: 1920 },
              height: { min: 480, ideal: 720, max: 1080 },
            },
          },
          videoRef.current,
          (result, error) => {
            if (!mounted) return;
            if (result?.getText()) {
              const code = result.getText();
              console.log("Scanned code:", code);
              if (code.length === 13) {
                onScan(code);
                onClose();
              }
            }
            if (error) {
              console.log("Scanning error:", error);
            }
          },
        );

        controlsRef.current = controls;

        console.log("Scanner started successfully");
      } catch (err) {
        console.error("Scanner error:", err);
        if (mounted) {
          setError(
            "Failed to start camera. Please ensure camera permissions are granted.",
          );
        }
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(startScanner, 100);

    return () => {
      mounted = false;
      clearTimeout(timer);
      if (controlsRef.current) {
        try {
          controlsRef.current.stop();
          controlsRef.current = null;
        } catch (err) {
          console.error("Error stopping scanner:", err);
        }
      }
      if (readerRef.current) {
        try {
          readerRef.current = null;
        } catch (err) {
          console.error("Error cleaning up reader:", err);
        }
      }
    };
  }, [onScan, onClose]);

  return (
    <DialogContent className="sm:max-w-[425px] !p-0 !pt-2">
      <div className="flex justify-between items-center mb-4 px-4">
        <DialogTitle className="text-lg font-semibold">
          ISBN Scanner
        </DialogTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="relative aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
            <Camera className="w-12 h-12 mb-4 text-gray-400" />
            <p className="text-sm text-gray-600">{error}</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
        )}
      </div>
      <DialogDescription className="text-center mt-4 px-4 pb-4">
        Positionieren Sie den Barcode im Kamerabild
      </DialogDescription>
    </DialogContent>
  );
}
