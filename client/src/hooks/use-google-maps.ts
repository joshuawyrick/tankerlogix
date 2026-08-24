import { useState, useEffect } from "react";

interface GoogleMapsState {
  isLoaded: boolean;
  apiKey: string;
  error: string | null;
}

let globalApiKey: string | null = null;
let globalLoadPromise: Promise<void> | null = null;
let globalIsLoaded = false;
let globalLoadFailed = false;

export function useGoogleMaps() {
  const [state, setState] = useState<GoogleMapsState>({
    isLoaded: globalIsLoaded,
    apiKey: globalApiKey || '',
    error: null
  });

  useEffect(() => {
    if (globalIsLoaded && globalApiKey) {
      setState({ isLoaded: true, apiKey: globalApiKey, error: null });
      return;
    }

    const loadGoogleMaps = async () => {
      try {
        if (globalLoadFailed) {
          globalLoadPromise = null;
          globalLoadFailed = false;
        }

        if (!globalApiKey) {
          const res = await fetch('/api/google-maps-key');
          const data = await res.json();
          if (data.key) {
            globalApiKey = data.key;
          } else {
            throw new Error('No API key returned');
          }
        }

        if (!window.google?.maps?.importLibrary && !globalLoadPromise) {
          globalLoadPromise = (async () => {
            try {
              // Official Google Maps JS API inline bootstrap loader. It defines
              // google.maps.importLibrary, the supported entry point for the
              // async loader, and guarantees the namespace (including constants
              // like ControlPosition) is fully ready before the libraries
              // resolve. A plain <script ...&loading=async> tag does NOT
              // reliably expose importLibrary or the full namespace on `onload`.
              ((g: any) => {
                let h: any, a: any, k: any;
                const p = 'The Google Maps JavaScript API';
                const c = 'google';
                const l = 'importLibrary';
                const q = '__ib__';
                const m = document;
                let b: any = window;
                b = b[c] || (b[c] = {});
                const d = b.maps || (b.maps = {});
                const r = new Set<string>();
                const e = new URLSearchParams();
                const u = () =>
                  h ||
                  (h = new Promise<void>((f, n) => {
                    a = m.createElement('script');
                    e.set('libraries', Array.from(r).join(','));
                    for (k in g) {
                      e.set(
                        k.replace(/[A-Z]/g, (t: string) => '_' + t[0].toLowerCase()),
                        g[k],
                      );
                    }
                    e.set('callback', c + '.maps.' + q);
                    a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
                    d[q] = f;
                    a.onerror = () => (h = n(Error(p + ' could not load.')));
                    a.nonce = (m.querySelector('script[nonce]') as any)?.nonce || '';
                    m.head.append(a);
                  }));
                if (d[l]) {
                  console.warn(p + ' only loads once. Ignoring:', g);
                } else {
                  d[l] = (f: string, ...n: any[]) =>
                    r.add(f) && u().then(() => d[l](f, ...n));
                }
              })({ key: globalApiKey, v: 'weekly' });

              await window.google.maps.importLibrary('maps');
              await window.google.maps.importLibrary('marker');
              await window.google.maps.importLibrary('places');
              // Directions service/renderer used for draggable routes
              await window.google.maps.importLibrary('routes');
              globalIsLoaded = true;
              globalLoadFailed = false;
            } catch (err) {
              globalLoadFailed = true;
              globalLoadPromise = null;
              throw err instanceof Error
                ? err
                : new Error('Failed to load Google Maps libraries');
            }
          })();
        }

        if (globalLoadPromise) {
          await globalLoadPromise;
        }

        if (window.google?.maps?.Map) {
          globalIsLoaded = true;
        }

        setState({ isLoaded: globalIsLoaded, apiKey: globalApiKey || '', error: null });
      } catch (err) {
        globalLoadFailed = true;
        globalLoadPromise = null;
        setState(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to load Google Maps' }));
      }
    };

    loadGoogleMaps();
  }, []);

  return state;
}

export function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push({
      lat: lat / 1E5,
      lng: lng / 1E5
    });
  }

  return points;
}
