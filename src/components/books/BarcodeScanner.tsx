import React, { useEffect, useRef, useState } from "react";
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Camera, Loader2 } from "lucide-react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useMediaQuery } from "@/hooks/use-media-query";
import "./barcode-scanner.css";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string>();
  const [isScanning, setIsScanning] = useState(false);
  const [codeDetected, setCodeDetected] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const isMobile = useMediaQuery("(max-width: 640px)");

  useEffect(() => {
    let mounted = true;

    const startScanner = async () => {
      try {
        if (!videoRef.current) return;
        setIsScanning(true);

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
                setCodeDetected(true);
                setTimeout(() => {
                  if (mounted) {
                    onScan(code);
                  }
                }, 800); // Kurze Verzögerung, damit der Nutzer die Erkennung sehen kann
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
            "Kamera konnte nicht gestartet werden. Bitte erteilen Sie die Kamerazugriffsberechtigung.",
          );
          setIsScanning(false);
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

  const dialogClass = isMobile 
    ? "!p-0 !pt-2 max-w-[95vw] sm:max-w-[425px] h-[90vh] sm:h-auto flex flex-col" 
    : "sm:max-w-[425px] !p-0 !pt-2";

  return (
    <DialogContent className={dialogClass}>
      <div className="flex justify-between items-center mb-2 px-4">
        <DialogTitle className="text-lg font-semibold">
          ISBN Scanner
        </DialogTitle>
      </div>
      <div className={`relative ${isMobile ? 'flex-1' : 'aspect-[4/3]'} bg-gray-100 rounded-lg overflow-hidden`}>
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
            <Camera className="w-12 h-12 mb-4 text-gray-400" />
            <p className="text-sm text-gray-600">{error}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            {codeDetected && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                <div className="bg-white rounded-lg p-6 text-center">
                  <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary mb-2" />
                  <p className="font-medium">Barcode erkannt!</p>
                  <p className="text-sm text-muted-foreground">Daten werden geladen...</p>
                </div>
              </div>
            )}
            {isScanning && !codeDetected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="relative border-2 border-primary/30 rounded w-64 h-64 sm:w-48 sm:h-48">
                  <div className="absolute inset-0 border-t-2 border-primary scanner-line"></div>
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary"></div>
                </div>
                <div className="absolute top-4 right-4">
                  <div className="bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full">
                    <p className="text-xs text-white flex items-center">
                      <span className="relative flex h-2 w-2 mr-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      Scanner aktiv
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex justify-between items-center p-4">
        <DialogDescription className="text-center text-sm">
          Positionieren Sie den Barcode im Kamerabild
        </DialogDescription>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose}
          className="ml-auto"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </DialogContent>
  );
}
