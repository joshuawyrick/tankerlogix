---
name: Google Maps JS loader
description: How the shared useGoogleMaps hook must load the Maps API, and why the plain script-tag approach fails.
---

# Google Maps JS API loading

The shared hook `client/src/hooks/use-google-maps.ts` must load the Maps API with
Google's **official inline bootstrap loader** (the `(g => {...})({key, v})` snippet
that defines `google.maps.importLibrary`), then `await importLibrary('maps' | 'marker' | 'places')`.

**Why:** A plain `<script src=".../js?key=...&libraries=...&loading=async">` tag does
NOT reliably expose `google.maps.importLibrary` (seen failing as
`importLibrary is not a function`) nor fully populate the namespace on `onload` —
e.g. `google.maps.ControlPosition` was `undefined` (`reading 'TOP_RIGHT'`) even
after `onload` fired. The inline bootstrap + awaited `importLibrary` guarantees the
namespace (Map, ControlPosition, AdvancedMarkerElement, Polyline, LatLngBounds,
places) is fully ready before `isLoaded` flips true.

**How to apply:** Any new map feature should consume `useGoogleMaps()` and only
touch `window.google.maps.*` after `isLoaded` is true. Don't revert to the plain
script-tag loader. Spread of a `Set` in the bootstrap needs `Array.from(set)` to
satisfy the project's TS target.
