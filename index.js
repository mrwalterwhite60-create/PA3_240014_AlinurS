/**
 * PA3 — Augmented Reality Website with Hit-Testing
 * Student: Alinur S.
 * Student ID: 240014
 * Group: AIB-2401
 * 
 * Variant Parameters (computed from ID: 240014):
 * - Last digit = 4 -> Product: Bookshelf (0.80m W × 0.30m D × 1.80m H, 4 shelves)
 * - 2nd-to-last digit = 1 -> 1 mod 2 = 1 -> Placement Mode: Single (one product; each tap moves it)
 * - 3rd-to-last digit = 0 -> 0 mod 3 = 0 -> Surface Tolerance: 8.0° (accept hits only within 8° of vertical up)
 * - 4th-to-last digit = 0 -> 0 mod 2 = 0 -> Facing Rule: Product's front faces the user (rotation about Y only)
 * 
 * Three.js 0.186.1 Porting Fixes applied:
 * 1. WebGL 2 Context: glCanvas.getContext('webgl2', { xrCompatible: true }) prevents r163+ constructor throw.
 * 2. Standard Geometries: THREE.RingGeometry and THREE.BoxGeometry replace deprecated *BufferGeometry.
 * 3. Hit-Test Source Lifecycle: Single request on session start, cancelled via hitTestSource.cancel() on end.
 */

import * as THREE from "three";

// Global DOM elements
const btnStart = document.getElementById("btn-start");
const btnStopOverlay = document.getElementById("btn-stop-overlay");
const btnClear = document.getElementById("clear");
const startContainer = document.getElementById("start-container");
const overlayElement = document.getElementById("overlay");
const fallbackBox = document.getElementById("fallback");
const fallbackReason = document.getElementById("fallback-reason");

// HUD status elements (Task E: 6 required elements)
const hudSessionState = document.getElementById("hud-session-state");
const hudReticleState = document.getElementById("hud-reticle-state");
const hudTiltValue = document.getElementById("hud-tilt-value");
const hudAnchorsState = document.getElementById("hud-anchors-state");
const hudProductCount = document.getElementById("hud-product-count");
const trackingWarning = document.getElementById("tracking-warning");
const hintStatus = document.getElementById("hint-status");

// Global Three.js scene elements
let glCanvas, gl, camera, scene, renderer, controller, reticle;

// Global WebXR tracking state
let xrSession = null;
let localSpace = null;
let viewerSpace = null;
let hitTestSource = null;
let hitTestSourceRequested = false;

// Interaction & Variant state
let placeRequested = false;
let canPlace = false;
let trackingLost = false;
let currentTiltDeg = 0.0;
let lastHitResult = null;
let lastHitPose = null;
let anchorsSupported = false;

// Placed products array: { object: THREE.Group, anchor: XRAnchor|null, yaw: number }
const placed = [];

// Configuration constants for Variant 240014
const VARIANT_CONFIG = {
  studentId: "240014",
  studentName: "Alinur S.",
  group: "AIB-2401",
  productName: "Bookshelf",
  mode: "single",               // 1 mod 2 = 1 -> single mode
  maxProducts: 1,
  surfaceToleranceDeg: 8.0,     // 0 mod 3 = 0 -> 8° tolerance
  faceUser: true                // 0 mod 2 = 0 -> face user (rotation about Y only)
};

// Bootstrap the application
loadScene();

/**
 * Task A & Task B: Initialize Three.js scene, renderer with WebGL2, lighting, reticle, and WebXR check.
 */
function loadScene() {
  console.log(`[PA3] Initializing AR Application for ${VARIANT_CONFIG.studentName} (${VARIANT_CONFIG.studentId})`);

  // Fix 1: Use WebGL 2 with xrCompatible attribute to prevent Three.js r163+ WebGL1 deprecation throw
  glCanvas = document.createElement("canvas");
  gl = glCanvas.getContext("webgl2", {
    xrCompatible: true,
    antialias: true,
    alpha: true,
    depth: true,
    stencil: false
  });

  if (!gl) {
    showFallback("WebGL 2 context creation failed. Your browser may not support WebGL 2 with WebXR.");
    return;
  }

  // Camera (Three.js will sync projection/transform with WebXR in immersive mode)
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  // Scene
  scene = new THREE.Scene();

  // Task C: Lighting - HemisphereLight + DirectionalLight
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.2);
  hemiLight.position.set(0, 10, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.5);
  dirLight.position.set(2, 5, 3);
  dirLight.castShadow = false;
  scene.add(dirLight);

  // Renderer setup
  renderer = new THREE.WebGLRenderer({
    canvas: glCanvas,
    context: gl,
    antialias: true,
    alpha: true
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Task B: Reticle creation using RingGeometry (Fix 2: use RingGeometry, not deprecated RingBufferGeometry)
  // Rotate -90° around X so normal points along +Y, lying flat on detected horizontal surfaces
  const reticleGeometry = new THREE.RingGeometry(0.15, 0.20, 32).rotateX(-Math.PI / 2);
  const reticleMaterial = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85
  });
  reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Task D: Controller setup for tap-to-place
  controller = renderer.xr.getController(0);
  controller.addEventListener("select", onSelect);
  scene.add(controller);

  // Task E: DOM overlay event prevention & UI wiring
  setupOverlayListeners();

  // Test product dimensions immediately in code for Task C verification
  const testBookshelf = buildProduct();
  const bbox = new THREE.Box3().setFromObject(testBookshelf);
  const size = bbox.getSize(new THREE.Vector3());
  console.log(`[Task C Verification] Bookshelf Dimensions: W = ${size.x.toFixed(4)}m, H = ${size.y.toFixed(4)}m, D = ${size.z.toFixed(4)}m`);
  console.log(`[Task C Verification] Base origin contact: Y_min = ${bbox.min.y.toFixed(4)}m (Must be 0.0000m)`);

  // Window resize handler for non-AR view
  window.addEventListener("resize", onWindowResize);

  // Check WebXR immersive-ar support
  checkXRSupport();
}

/**
 * Task C: Build the Bookshelf variant from >= 3 primitives in one THREE.Group.
 * Key dimensions: 0.80m wide (X) × 0.30m deep (Z) × 1.80m high (Y); 4 shelves.
 * Base origin: centered at base (X=0, Y=0, Z=0).
 */
function buildProduct() {
  const group = new THREE.Group();
  group.name = "Bookshelf_Variant4";

  // Realistic wood material with physical shading
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c3a21, // Rich walnut brown
    roughness: 0.55,
    metalness: 0.08
  });

  const shelfWoodMaterial = new THREE.MeshStandardMaterial({
    color: 0x6e472a, // Slightly lighter interior shelves
    roughness: 0.5,
    metalness: 0.08
  });

  const totalW = 0.80; // 80 cm wide
  const totalH = 1.80; // 180 cm high
  const totalD = 0.30; // 30 cm deep
  const boardT = 0.025; // 2.5 cm board thickness

  // Primitive 1: Left vertical upright panel
  const sideGeo = new THREE.BoxGeometry(boardT, totalH, totalD);
  const leftSide = new THREE.Mesh(sideGeo, woodMaterial);
  leftSide.position.set(-totalW / 2 + boardT / 2, totalH / 2, 0);
  group.add(leftSide);

  // Primitive 2: Right vertical upright panel
  const rightSide = new THREE.Mesh(sideGeo, woodMaterial);
  rightSide.position.set(totalW / 2 - boardT / 2, totalH / 2, 0);
  group.add(rightSide);

  // Primitive 3: Top cover board
  const topGeo = new THREE.BoxGeometry(totalW, boardT, totalD);
  const topBoard = new THREE.Mesh(topGeo, woodMaterial);
  topBoard.position.set(0, totalH - boardT / 2, 0);
  group.add(topBoard);

  // Primitives 4, 5, 6, 7: 4 horizontal shelves
  // Bottom shelf at base + 3 evenly spaced interior shelves
  const shelfInnerW = totalW - 2 * boardT; // 0.75m between side uprights
  const shelfGeo = new THREE.BoxGeometry(shelfInnerW, boardT, totalD);
  const shelfHeights = [
    boardT / 2, // Bottom base shelf (y = 0.0125m)
    0.46,       // Shelf 2
    0.91,       // Shelf 3
    1.36        // Shelf 4
  ];

  shelfHeights.forEach((yPos) => {
    const shelfMesh = new THREE.Mesh(shelfGeo, shelfWoodMaterial);
    shelfMesh.position.set(0, yPos, 0);
    group.add(shelfMesh);
  });

  // Primitive 8: Back panel (adds structural realism and depth)
  const backT = 0.006;
  const backGeo = new THREE.BoxGeometry(totalW, totalH, backT);
  const backMat = new THREE.MeshStandardMaterial({
    color: 0x3e2716,
    roughness: 0.8
  });
  const backPanel = new THREE.Mesh(backGeo, backMat);
  backPanel.position.set(0, totalH / 2, -totalD / 2 + backT / 2);
  group.add(backPanel);

  // Optional decorative books on middle shelf (shelf at y = 0.91m)
  const bookColors = [0xb91c1c, 0x1d4ed8, 0x047857, 0xb45309];
  bookColors.forEach((color, idx) => {
    const bookGeo = new THREE.BoxGeometry(0.04, 0.22, 0.18);
    const bookMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    const bookMesh = new THREE.Mesh(bookGeo, bookMat);
    bookMesh.position.set(-0.25 + idx * 0.046, 0.91 + boardT / 2 + 0.11, 0.02);
    group.add(bookMesh);
  });

  return group;
}

/**
 * Check if immersive-ar is supported on this browser/hardware.
 */
function checkXRSupport() {
  if (navigator.xr) {
    navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
      if (supported) {
        btnStart.disabled = false;
        btnStart.addEventListener("click", onRequestSession);
        console.log("[WebXR] immersive-ar is supported on this device.");
      } else {
        showFallback("WebXR 'immersive-ar' mode is not supported on this device/browser.");
      }
    }).catch((err) => {
      showFallback(`Error querying WebXR support: ${err.message}`);
    });
  } else {
    showFallback("WebXR Device API is not available in this browser. Please use Chrome on Android.");
  }
}

/**
 * Display a visible fallback warning if immersive-ar is unsupported.
 */
function showFallback(message) {
  btnStart.disabled = true;
  btnStart.style.opacity = "0.5";
  btnStart.style.cursor = "not-allowed";
  fallbackReason.textContent = message;
  fallbackBox.style.display = "block";
  console.warn("[WebXR Fallback]", message);
}

/**
 * Task A: Request the immersive-ar session with required/optional features and dom-overlay.
 */
function onRequestSession() {
  if (!navigator.xr) return;

  const sessionInit = {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["local-floor", "anchors", "dom-overlay"],
    domOverlay: { root: overlayElement }
  };

  navigator.xr.requestSession("immersive-ar", sessionInit)
    .then(onSessionStarted)
    .catch((err) => {
      console.error("[WebXR] Failed to start immersive-ar session:", err);
      alert(`Could not start AR session: ${err.message}`);
    });
}

/**
 * Task A & Task B: Session started handler.
 * Attaches end listener, sets up reference spaces, initializes hit testing, and starts animate loop.
 */
async function onSessionStarted(session) {
  xrSession = session;
  console.log("[WebXR] immersive-ar session started successfully.");

  // Check if anchors feature was granted
  anchorsSupported = session.enabledFeatures && session.enabledFeatures.includes("anchors");
  hudAnchorsState.textContent = anchorsSupported ? "on" : "off";
  hudAnchorsState.className = `hud-val ${anchorsSupported ? "valid" : "warn"}`;
  console.log(`[WebXR] Anchors module status: ${anchorsSupported ? "ENABLED" : "OFF (fallback active)"}`);

  // Both STOP button and system back gesture trigger session 'end' event
  session.addEventListener("end", onSessionEnd);

  // Switch UI to AR overlay mode
  startContainer.style.display = "none";
  overlayElement.style.display = "flex";
  hudSessionState.textContent = "active";
  hudSessionState.className = "hud-val valid";

  // Critical fix for mobile ARCore (Samsung, Pixel, etc.):
  // Three.js r186 defaults to 'local-floor'. Android Chrome throws unsupported reference space
  // unless explicitly set to 'local' before calling setSession() (as instructed in assignment skeleton).
  try {
    renderer.xr.setReferenceSpaceType("local");
  } catch (e) {
    console.warn("[WebXR] setReferenceSpaceType notice:", e);
  }

  try {
    await renderer.xr.setSession(session);
  } catch (err) {
    console.error("[WebXR] setSession failed with 'local', trying fallback:", err);
    try {
      renderer.xr.setReferenceSpaceType("viewer");
      await renderer.xr.setSession(session);
    } catch (err2) {
      alert(`Could not start AR session: ${err.message}`);
      return;
    }
  }

  // Get local reference space (world coordinate frame)
  localSpace = renderer.xr.getReferenceSpace();

  // Fix 3: Request viewer reference space and hit-test source ONCE, not on every frame
  session.requestReferenceSpace("viewer").then((refSpace) => {
    viewerSpace = refSpace;
    session.requestHitTestSource({ space: viewerSpace }).then((source) => {
      hitTestSource = source;
      hitTestSourceRequested = true;
      console.log("[WebXR Hit-Test] Hit test source established from viewer reference space.");
    }).catch((err) => {
      console.error("[WebXR Hit-Test] Failed to request hit test source:", err);
    });
  }).catch((err) => {
    console.error("[WebXR] Failed to request viewer reference space:", err);
  });

  // Start animation loop
  animate();
}

/**
 * Three.js animation loop registration.
 */
function animate() {
  renderer.setAnimationLoop(render);
}

/**
 * Core per-frame render loop (Task B, D, E).
 * Performs hit testing, tilt calculation, placement, anchor matrix updates, and overlay rendering.
 */
function render(time, frame) {
  if (frame && localSpace) {
    // Task E: Viewer pose check & tracking loss detection
    const viewerPose = frame.getViewerPose(localSpace);

    if (!viewerPose || viewerPose.emulatedPosition) {
      // Tracking lost: display warning, hide reticle, block placement
      trackingLost = true;
      trackingWarning.style.display = "block";
      reticle.visible = false;
      hudReticleState.textContent = "tracking lost";
      hudReticleState.className = "hud-val invalid";
      hintStatus.textContent = "Tracking lost — move phone slowly";
      hintStatus.className = "hint-highlight invalid";
      placeRequested = false; // Block pending tap
      renderer.render(scene, camera);
      return;
    } else {
      trackingLost = false;
      trackingWarning.style.display = "none";
    }

    // Task B: Perform Hit Testing if source is active
    if (hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);

      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(localSpace);

        if (pose) {
          reticle.visible = true;
          // Set reticle matrix directly from hit pose in local space
          reticle.matrix.fromArray(pose.transform.matrix);

          lastHitResult = hit;
          lastHitPose = pose;

          // Surface filter: read surface normal from pose matrix column 1 (indices 4, 5, 6)
          const m = pose.transform.matrix;
          const nx = m[4];
          const ny = m[5];
          const nz = m[6];
          const normalLen = Math.hypot(nx, ny, nz) || 1.0;
          const cosTheta = Math.min(Math.max(ny / normalLen, -1.0), 1.0);
          currentTiltDeg = Math.acos(cosTheta) * (180.0 / Math.PI);

          hudTiltValue.textContent = `${currentTiltDeg.toFixed(1)}° (max ${VARIANT_CONFIG.surfaceToleranceDeg.toFixed(1)}°)`;

          // Surface tolerance evaluation for Variant 240014: 8.0°
          if (currentTiltDeg <= VARIANT_CONFIG.surfaceToleranceDeg) {
            canPlace = true;
            reticle.material.color.setHex(0x22c55e); // Green
            hudReticleState.textContent = `valid (${currentTiltDeg.toFixed(1)}°)`;
            hudReticleState.className = "hud-val valid";
            hintStatus.textContent = "Surface ready — Tap to place";
            hintStatus.className = "hint-highlight";
          } else {
            canPlace = false;
            reticle.material.color.setHex(0xef4444); // Red
            hudReticleState.textContent = `too tilted (${currentTiltDeg.toFixed(1)}°)`;
            hudReticleState.className = "hud-val invalid";
            hintStatus.textContent = "Too tilted (>8°) — Tap blocked";
            hintStatus.className = "hint-highlight invalid";
          }
        } else {
          hideReticle();
        }
      } else {
        hideReticle();
      }
    }

    // Task D: Handle product placement triggered in controller select event
    if (placeRequested && canPlace && lastHitPose && lastHitResult) {
      placeRequested = false;
      handlePlacement(frame, lastHitPose, lastHitResult);
    }

    // Task D: Update every anchored product each frame
    updateAnchoredProducts(frame);
  }

  // Render 3D scene through WebXR camera
  renderer.render(scene, camera);
}

/**
 * Hide reticle when no surface is detected.
 */
function hideReticle() {
  reticle.visible = false;
  canPlace = false;
  hudReticleState.textContent = "searching...";
  hudReticleState.className = "hud-val warn";
  hudTiltValue.textContent = "--° (max 8.0°)";
  hintStatus.textContent = "Scanning for surface...";
  hintStatus.className = "hint-highlight";
}

/**
 * Controller select event listener (Task D).
 * Only sets the flag; actual placement happens in the next frame callback.
 */
function onSelect() {
  if (canPlace && !trackingLost) {
    placeRequested = true;
  } else {
    console.log(`[PA3 Tap Ignored] canPlace = ${canPlace}, trackingLost = ${trackingLost}, tilt = ${currentTiltDeg.toFixed(1)}°`);
  }
}

/**
 * Task D: Place the variant product with facing rule and anchor management.
 */
function handlePlacement(frame, hitPose, hitResult) {
  // Variant rule: Single placement mode -> each tap moves the existing product
  if (placed.length >= VARIANT_CONFIG.maxProducts) {
    const existing = placed.pop();
    if (existing.anchor && typeof existing.anchor.delete === "function") {
      try {
        existing.anchor.delete();
        console.log("[WebXR Anchors] Deleted prior anchor on product move.");
      } catch (err) {
        console.warn("[WebXR Anchors] Anchor delete failed:", err);
      }
    }
    scene.remove(existing.object);
  }

  // Build the bookshelf
  const product = buildProduct();
  product.matrixAutoUpdate = false;

  // Calculate Facing Rule: Front turns to face the user at placement (rotation about Y only)
  let yaw = 0;
  if (VARIANT_CONFIG.faceUser) {
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);

    const hitMatrix = new THREE.Matrix4().fromArray(hitPose.transform.matrix);
    const hitPos = new THREE.Vector3().setFromMatrixPosition(hitMatrix);

    const dx = camPos.x - hitPos.x;
    const dz = camPos.z - hitPos.z;
    yaw = Math.atan2(dx, dz);
    console.log(`[Task D Facing Rule] Calculated user facing yaw: ${(yaw * 180 / Math.PI).toFixed(1)}°`);
  }

  // Anchor creation if supported by WebXR session
  if (anchorsSupported && typeof hitResult.createAnchor === "function") {
    hitResult.createAnchor().then((anchor) => {
      console.log("[WebXR Anchors] Created spatial anchor for placed product.");
      const item = { object: product, anchor, yaw };
      placed.push(item);
      scene.add(product);
      updateProductCount();
    }).catch((err) => {
      console.warn("[WebXR Anchors] createAnchor rejected, using hit pose fallback:", err);
      fallbackPlace(product, hitPose, yaw);
    });
  } else {
    // Fallback: place directly with hit pose matrix
    fallbackPlace(product, hitPose, yaw);
  }
}

/**
 * Fallback placement when Spatial Anchors module is not available.
 */
function fallbackPlace(product, hitPose, yaw) {
  const hitMatrix = new THREE.Matrix4().fromArray(hitPose.transform.matrix);
  const hitPos = new THREE.Vector3().setFromMatrixPosition(hitMatrix);

  // Set rotation around Y and position
  product.matrix.makeRotationY(yaw);
  product.matrix.setPosition(hitPos.x, hitPos.y, hitPos.z);

  placed.push({ object: product, anchor: null, yaw });
  scene.add(product);
  updateProductCount();
  console.log(`[Task D Fallback] Placed product at (${hitPos.x.toFixed(3)}, ${hitPos.y.toFixed(3)}, ${hitPos.z.toFixed(3)}) without anchor.`);
}

/**
 * Task D: Update every product's transform from its anchor pose combined with facing rotation.
 */
function updateAnchoredProducts(frame) {
  for (let i = 0; i < placed.length; i++) {
    const item = placed[i];
    if (item.anchor && item.anchor.anchorSpace) {
      const anchorPose = frame.getPose(item.anchor.anchorSpace, localSpace);
      if (anchorPose) {
        const anchorMatrix = new THREE.Matrix4().fromArray(anchorPose.transform.matrix);
        const anchorPos = new THREE.Vector3().setFromMatrixPosition(anchorMatrix);

        // Combine anchor position with facing yaw rotation around Y
        item.object.matrix.makeRotationY(item.yaw);
        item.object.matrix.setPosition(anchorPos.x, anchorPos.y, anchorPos.z);
      }
    }
  }
}

/**
 * Task E: Update HUD product counter.
 */
function updateProductCount() {
  hudProductCount.textContent = `${placed.length} / ${VARIANT_CONFIG.maxProducts}`;
}

/**
 * Task E: Clear button handler. Removes all placed objects and deletes their anchors.
 */
function clearAllProducts() {
  console.log(`[PA3 Clear] Removing ${placed.length} placed product(s).`);
  while (placed.length > 0) {
    const item = placed.pop();
    if (item.anchor && typeof item.anchor.delete === "function") {
      try {
        item.anchor.delete();
      } catch (err) {
        console.warn("[WebXR Anchors] Error deleting anchor during clear:", err);
      }
    }
    scene.remove(item.object);
  }
  updateProductCount();
}

/**
 * Task E: Wire up DOM overlay controls and prevent beforexrselect event bubbling.
 */
function setupOverlayListeners() {
  // Prevent touches on overlay elements from triggering WebXR select event
  overlayElement.addEventListener("beforexrselect", (event) => {
    event.preventDefault();
  });

  btnClear.addEventListener("click", (event) => {
    event.stopPropagation();
    clearAllProducts();
  });

  btnStopOverlay.addEventListener("click", (event) => {
    event.stopPropagation();
    endXRSession();
  });
}

/**
 * Task A: Terminate the active WebXR session.
 */
function endXRSession() {
  if (xrSession) {
    console.log("[WebXR] User requested session termination via STOP button.");
    xrSession.end();
  }
}

/**
 * Task A: Session end listener (handles BOTH STOP button and system back gesture).
 * Ensures full reset of buttons, hit-test source, anchors, and application state.
 */
function onSessionEnd() {
  console.log("[WebXR] Session ended. Cleaning up resources...");

  // Cancel active hit-test source
  if (hitTestSource) {
    try {
      hitTestSource.cancel();
      console.log("[WebXR Hit-Test] Hit test source cancelled successfully.");
    } catch (err) {
      console.warn("[WebXR Hit-Test] Error cancelling hit-test source:", err);
    }
    hitTestSource = null;
  }
  hitTestSourceRequested = false;

  // Clean up anchors and clear scene
  clearAllProducts();

  // Reset reticle
  reticle.visible = false;
  lastHitResult = null;
  lastHitPose = null;
  placeRequested = false;
  canPlace = false;

  // Reset WebXR references
  xrSession = null;
  localSpace = null;
  viewerSpace = null;

  // Stop animation loop
  renderer.setAnimationLoop(null);

  // Restore non-AR DOM UI
  overlayElement.style.display = "none";
  startContainer.style.display = "block";
  btnStart.textContent = "START AR SESSION";
  hudSessionState.textContent = "ended";
  hudSessionState.className = "hud-val invalid";

  console.log("[WebXR] Reset complete. Application ready for new AR session.");
}

/**
 * Window resize handler for 2D browser canvas.
 */
function onWindowResize() {
  if (camera && renderer && !xrSession) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// Export for testing / inspection if running under Node or automated test runners
export { VARIANT_CONFIG, buildProduct, loadScene };
