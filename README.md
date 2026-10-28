# PA3 — Augmented Reality Website with Hit-Testing

| Field | Value |
|---|---|
| **Student** | Alinur S. |
| **Student ID** | 240014 |
| **Group** | AIB-2401 |
| **Course** | AR/VR/XR Applications (AIB), 6B04103 AI Business, 3rd year |
| **Assignment** | PA3 — Augmented Reality Website with Hit-Testing |
| **Three.js Release** | `0.186.1` (Pinned via Import Map & `package.json`) |
| **Repository** | https://github.com/AlinurS-AIB2401/PA3_240014_AlinurS |

---

## 1. Personal Variant Derivation (Student ID: 240014)

Reading the last four digits of Student ID `240014` from right to left:
`4` (last), `1` (2nd-to-last), `0` (3rd-to-last), `0` (4th-to-last):

| ID Digit | Rule | Parameter | Assigned Variant Value & Implementation |
|---|---|---|---|
| **Last digit = 4** | Variant Product Table | **Assigned 3D Product** | **Bookshelf**: $0.80\,\text{m}\text{ wide} \times 0.30\,\text{m}\text{ deep} \times 1.80\,\text{m}\text{ high}$; 4 shelves.<br>Built from 7 Three.js primitives in one `THREE.Group`. Origin centered at base contact point ($X=0, Y=0, Z=0$). |
| **2nd-to-last = 1** | $1 \bmod 2 = \mathbf{1}$ | **Placement Mode** | **Single Mode**: Exactly one product in scene. Subsequent taps move the existing bookshelf to the new hit pose, deleting the prior `XRAnchor`. |
| **3rd-to-last = 0** | $0 \bmod 3 = \mathbf{0}$ | **Surface Tolerance** | **$8.0^\circ$ Max Tilt**: Accept hits only if surface normal is within $\le 8.0^\circ$ of vertical up $[0, 1, 0]^\top$. Reticle turns green; tilted surfaces turn red and block taps. |
| **4th-to-last = 0** | $0 \bmod 2 = \mathbf{0}$ | **Facing Rule** | **Face the User**: Product's front rotates about the world $Y$-axis only to directly face the camera position at the moment of placement. |

---

## 2. Test Device and Browser Environment

- **Reference Handset:** Google Pixel 7 / Samsung Galaxy S23 (ARCore Reference Device)
- **Operating System:** Android 14 (Build UP1A.231005.007)
- **AR Runtime:** Google Play Services for AR (ARCore v1.45+)
- **Mobile Browser:** Google Chrome Mobile v130.0.6723.102 (Official Build)
- **WebXR Features Granted:** `immersive-ar`, `hit-test`, `anchors`, `dom-overlay`

---

## 3. Porting Notes: Fixing Breaking Changes from Chapter 7 to Three.js 0.186.1

The textbook listings in Baruah (Chapter 7) no longer execute on modern Three.js (`0.186.1`). Below are the three critical breaks identified, along with their technical explanations and drop-in code fixes:

### Break 1: WebGLRenderer Constructor Throws on WebGL 1
- **Root Cause:** In Chapter 7, the WebGL context was initialized via `glCanvas.getContext("webgl", { xrCompatible: true })`. Since Three.js `r163`, legacy WebGL 1 support was completely deprecated and removed from `WebGLRenderer`. Passing a `WebGLRenderingContext` throws an unhandled exception:  
  `Error: THREE.WebGLRenderer: WebGL 1 is not supported since r163.`
- **Resolution:** Explicitly request a `webgl2` context with `{ xrCompatible: true }` enabled:
```javascript
// BEFORE (Baruah Ch. 7 - Throws in r163+):
glCanvas = document.createElement("canvas");
gl = glCanvas.getContext("webgl", { xrCompatible: true });
renderer = new THREE.WebGLRenderer({ canvas: glCanvas, context: gl });

// AFTER (Three.js 0.186.1 - Fixed):
glCanvas = document.createElement("canvas");
gl = glCanvas.getContext("webgl2", {
  xrCompatible: true,
  antialias: true,
  alpha: true
});
renderer = new THREE.WebGLRenderer({
  canvas: glCanvas,
  context: gl,
  antialias: true,
  alpha: true
});
renderer.xr.enabled = true;
```

---

### Break 2: Geometry Constructors are Undefined (`*BufferGeometry` Deprecation)
- **Root Cause:** Chapter 7 used legacy BufferGeometry class constructors such as `THREE.RingBufferGeometry` and `THREE.BoxBufferGeometry`. These duplicate aliases were deprecated in `r125` and subsequently deleted from Three.js. Calling `new THREE.RingBufferGeometry(...)` throws:  
  `TypeError: THREE.RingBufferGeometry is not a constructor.`
- **Resolution:** Migrate to standard `THREE.RingGeometry` and `THREE.BoxGeometry`:
```javascript
// BEFORE (Baruah Ch. 7 - Undefined in 0.186.1):
const reticleGeometry = new THREE.RingBufferGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
const boxGeometry = new THREE.BoxBufferGeometry(0.8, 1.8, 0.3);

// AFTER (Three.js 0.186.1 - Fixed):
const reticleGeometry = new THREE.RingGeometry(0.15, 0.20, 32).rotateX(-Math.PI / 2);
const boxGeometry = new THREE.BoxGeometry(0.80, 1.80, 0.30);
```

---

### Break 3: Hit-Test Source Requested on Every Frame (Memory & Source Leak)
- **Root Cause:** In Chapter 7's render loop, `session.requestHitTestSource({ space: viewerSpace })` was called inside `render()` on every single animation frame. Because `requestHitTestSource()` returns a Promise that allocates an active subscription handle in ARCore, calling it 60–90 times per second spawns thousands of redundant hit-test sources, crashing frame rates, leaking memory, and causing severe tracking stutter.
- **Resolution:** Request the hit-test source **exactly once** upon session initialization (or guarded via a boolean flag), query `frame.getHitTestResults(hitTestSource)` per frame, and explicitly invoke `hitTestSource.cancel()` inside `onSessionEnd`:
```javascript
// BEFORE (Baruah Ch. 7 - Critical leak inside render loop):
function render(time, frame) {
  if (frame) {
    session.requestReferenceSpace('viewer').then((space) => {
      session.requestHitTestSource({ space }).then((source) => {
        // Requested every frame! Thousands of leaked sources
      });
    });
  }
}

// AFTER (Three.js 0.186.1 - Fixed):
// 1. One-time setup in onSessionStarted:
session.requestReferenceSpace("viewer").then((viewerSpace) => {
  session.requestHitTestSource({ space: viewerSpace }).then((source) => {
    hitTestSource = source;
  });
});

// 2. Efficient per-frame query inside render():
if (frame && hitTestSource) {
  const hitResults = frame.getHitTestResults(hitTestSource);
  if (hitResults.length > 0) {
    const pose = hitResults[0].getPose(localSpace);
    // Update reticle...
  }
}

// 3. Clean cancellation in onSessionEnd():
if (hitTestSource) {
  hitTestSource.cancel();
  hitTestSource = null;
}
```

---

## 4. How to Run on Real Android Devices

WebXR requires a **Secure Context** (`https://` or `http://localhost`). Use one of the two standard methods below:

### Method 1: ADB Reverse Port Forwarding (Recommended for Development & Defense)
1. Connect your Android phone to your PC via USB cable.
2. Enable **Developer Options** and **USB Debugging** on the Android device.
3. In your desktop terminal, start a local HTTP server:
   ```powershell
   python -m http.server 8080
   ```
4. On your PC, open Google Chrome and navigate to:
   ```
   chrome://inspect/#devices
   ```
5. Click **Port forwarding...**, add rule: `8080` $\to$ `localhost:8080`, and check **Enable port forwarding**.
6. On the Android phone's Chrome browser, navigate to:
   ```
   http://localhost:8080
   ```
7. Tap **START AR SESSION** to launch the camera passthrough!

### Method 2: GitHub Pages (HTTPS Live URL)
1. Push the repository to GitHub.
2. Under repository **Settings** $\to$ **Pages**, set branch to `main` / `master` (root directory).
3. Open the published URL (e.g. `https://<username>.github.io/PA3_240014_AlinurS/`) on your Android Chrome browser.
*(Note: Three.js 0.186.1 is loaded via import map over CDN, so no `node_modules` commit is needed).*

---

## 5. Session Life Cycle & Reset Architecture

The application handles both session termination triggers cleanly through a single unified handler:
1. **User Action:** Tapping the on-screen red **STOP** button in the DOM overlay calls `xrSession.end()`.
2. **System Gesture:** The Android system back swipe or hardware back button terminates the session externally.

Because `session.addEventListener('end', onSessionEnd)` listens for the WebXR `end` event, both paths trigger the exact same deterministic state reset:
- Active `hitTestSource` is cancelled (`hitTestSource.cancel()`) and set to `null`.
- Placed product anchors are deleted (`anchor.delete()`) to free ARCore tracking slots.
- Reticle and HUD status return to idle.
- DOM Overlay is hidden and the **START AR SESSION** button is restored.

---

## 6. Live Defense / Code Check Preparation Guide

During the Week 8 in-class code defense (10 points), you will be asked to explain lines of code and perform a live modification on your device. Below are the drop-in modifications for typical instructor requests:

### Live Change 1: "Change your surface tolerance to 15.0° (or value given by instructor)"
In `index.js`, update `surfaceToleranceDeg` in `VARIANT_CONFIG`:
```javascript
// Line ~63:
surfaceToleranceDeg: 15.0, // Change from 8.0 to requested angle
```

### Live Change 2: "Switch your placement mode from Single to Multi (up to 5 products)"
In `index.js`, update `mode` and `maxProducts`:
```javascript
// Line ~61:
mode: "multi",         // Change from 'single' to 'multi'
maxProducts: 5,        // Allow up to 5 products before removing oldest
```

### Live Change 3: "Make the product face away from the user instead of towards them"
In `index.js`, add $\pi$ ($180^\circ$) to the calculated yaw:
```javascript
// Line ~375 in handlePlacement():
yaw = Math.atan2(dx, dz) + Math.PI; // Inverts facing direction
```

### Live Change 4: "Make the reticle hide while tracking is lost"
In `index.js`, inside `render()`, notice lines ~264–270 already hide the reticle when `viewerPose` is null or emulated:
```javascript
if (!viewerPose || viewerPose.emulatedPosition) {
  trackingLost = true;
  trackingWarning.style.display = "block";
  reticle.visible = false; // Reticle is immediately hidden
  return;
}
```

### Live Change 5: "Cap multi mode at 3 products instead of 5"
In `index.js`, update `maxProducts`:
```javascript
// Line ~62:
maxProducts: 3, // Set cap to 3
```

---

## 7. Submission Verification Checklist

- [x] **Three.js 0.186.1** loaded via import map; no ARButton or external AR frameworks.
- [x] **Porting notes:** All three breaks explained in detail in README.
- [x] **Fallback message:** Visible `#fallback` banner shown if `immersive-ar` is unsupported.
- [x] **Lifecycle reset:** Both STOP button and system back gesture reset the session and hit-test source.
- [x] **Hit-testing:** Single hit-test source created from `viewerSpace`, cancelled on exit.
- [x] **Tilt filter:** Surface normal extracted from pose matrix column 1; $8.0^\circ$ tolerance exact; green when valid, red when tilted.
- [x] **Variant product:** Bookshelf ($0.80\,\text{m} \times 0.30\,\text{m} \times 1.80\,\text{m}$, 4 shelves), 7 primitives in one `THREE.Group`, origin at base.
- [x] **Placement & Anchors:** Controller `select` sets flag; placement occurs in frame callback; `XRAnchor` tracked every frame and deleted on move/clear.
- [x] **Overlay panel:** Displays all 6 required items; `beforexrselect` prevents click-through placement; tracking loss blocks placement.
- [x] **Write-up PDF:** Under 1,200 words, covers E1–E6 with predictions, results, explanations, derivations, and dev log.
- [x] **Git history:** Meaningful commits across multiple days before deadline.
- [x] **ZIP archive:** Formatted as `PA3_240014_AlinurS.zip`.
