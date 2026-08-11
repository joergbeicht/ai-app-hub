import { Injectable } from '@angular/core';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import type { IScannerControls } from '@zxing/browser';
import { Observable } from 'rxjs';

/**
 * Dünner Wrapper um `@zxing/browser` (siehe ADR-7, "Weg A" - vorhandene Mitarbeiterausweise per
 * Tablet-Kamera scannen statt neuer Hardware). Kapselt die Kamera-/Decoding-Mechanik in einem
 * eigenen Service, damit `LoginPageComponent` ohne echten Kamerazugriff testbar bleibt.
 */
@Injectable({ providedIn: 'root' })
export class BarcodeScannerService {
  /**
   * Emittiert den dekodierten Text jedes Mal, wenn im Kamerabild ein Barcode erkannt wird - läuft
   * weiter, bis der Subscriber sich abmeldet (dann wird die Kamera automatisch freigegeben).
   * Frames ohne erkennbaren Barcode sind der Normalfall (`NotFoundException`) und werden bewusst
   * ignoriert, nicht als Fehler weitergegeben.
   */
  startScanning(videoElement: HTMLVideoElement): Observable<string> {
    return new Observable<string>((subscriber) => {
      const reader = new BrowserMultiFormatReader();
      let controls: IScannerControls | undefined;

      reader
        .decodeFromVideoDevice(undefined, videoElement, (result, error) => {
          if (result) {
            subscriber.next(result.getText());
            return;
          }
          if (error && !(error instanceof NotFoundException)) {
            subscriber.error(error);
          }
        })
        .then((scannerControls) => {
          controls = scannerControls;
        })
        .catch((error: unknown) => subscriber.error(error));

      return () => controls?.stop();
    });
  }
}
