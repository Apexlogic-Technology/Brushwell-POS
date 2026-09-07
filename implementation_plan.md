# Barcode & QR Scanner Feature Parity, Stacking Fix, and List-View Barcode Update Plan

Implement the high-performance camera scanner from the Sell feature (`FullscreenCameraScanner`) into Product Management (`BarcodeScannerModal`), fix the z-index modal stacking issue where the scanner loads behind the edit book form, and allow updating product barcodes directly from the barcode button in the product list view.

## User Review Required

> [!IMPORTANT]
> - **Scanner Engine Replacement**: Replacing `Html5Qrcode` inside `BarcodeScannerModal.jsx` with the exact direct `<video>` + `navigator.mediaDevices.getUserMedia` + WebAssembly `zxing-wasm` / hardware `BarcodeDetector` engine used in `FullscreenCameraScanner.jsx`. This eliminates black-box bugs and WebKit camera blocking on iOS Safari and Android PWAs.
> - **List View Barcode Button Behavior**: The barcode button beside the Edit button currently opens the print generator only. We will provide an action modal where users can choose to **Scan & Update Barcode** (camera scan and instant DB save), **Print Barcode Label**, or manually assign/generate a barcode.

---

## Proposed Changes

### 1. Barcode Scanner Component

#### [MODIFY] [BarcodeScannerModal.jsx](file:///c:/Users/HP%20450%20G5/Documents/GitHub/Brushwell%20POS/src/components/BarcodeScannerModal.jsx)
- Remove `Html5Qrcode` library usage which causes black boxes and initialization failures on iOS Safari / mobile web apps.
- Implement direct HTML5 `<video>` element with mobile attributes:
  - `playsInline`, `webkit-playsinline="true"`, `muted`, `defaultMuted`, `autoPlay`.
- Integrate dual-engine detection loop matching `FullscreenCameraScanner.jsx`:
  - Hardware accelerated `detectFromVideoFrame` (native `BarcodeDetector` API for ~5ms scans on Android).
  - High-speed `decodeLiveVideoFrameFast` (`zxing-wasm` WebAssembly C++ engine for ~8-15ms scans on iOS & Android).
- Add Sell-feature visual effects:
  - Holographic reticle with glowing green corner brackets.
  - Animated sweeping laser scan line (`@keyframes sweepLaser`).
  - Emerald green flash feedback on successful decode.
  - Torch / flashlight toggle via track capabilities.
  - Camera flip (environment back camera vs user front camera) and camera selector.
  - Audio beep (`playBeep(false)`) and haptic vibration (`navigator.vibrate(80)`).
  - Scan cooldowns (900ms same code, 80ms distinct code, reset when clear).
  - Fullscreen toggle button to allow switching between modal dialog and full-screen camera HUD.
- **Fix z-index Stacking Bug**:
  - Replace `style={{ zIndex: 1000 }}` with `style={{ zIndex: 11000 }}` so the scanner is guaranteed to render in front of the Add/Edit Product modal (`z-index: 10000`).

---

### 2. Product Management Interface

#### [MODIFY] [ProductManagement.jsx](file:///c:/Users/HP%20450%20G5/Documents/GitHub/Brushwell%20POS/src/components/ProductManagement.jsx)
- **Barcode Action Modal for List View**:
  - When clicking the barcode icon button near the Edit button (in both Table list view and Card grid view), open a sleek **Barcode Actions Modal** for that specific product instead of only opening the print modal.
  - Options provided:
    1. **📷 Scan & Update Barcode**: Launches the camera scanner with a badge showing "Updating barcode for: [Product Name]". Scanning a barcode updates the product's barcode directly in Supabase (`saveProductToDB`), refreshes inventory (`onRefreshProducts()`), and shows a success toast.
    2. **🖨️ Print Barcode Label**: Opens `onOpenBarcodeGen(product)` for sticker printing.
    3. **⌨️ Manual / Auto Barcode**: Lets users type a barcode or auto-generate a random one and save it directly.
- **Scan Mode Handling**:
  - Support `scanMode === 'update_product'` in addition to `'new'` and `'form'`.
  - Handle duplicate barcode warnings if a scanned code is already assigned to a different product.
- **Edit Modal Scanner Stacking Confirmation**:
  - Ensure scanning from within the Add/Edit Product modal (`scanMode === 'form'`) opens the scanner cleanly above the edit modal, captures the barcode into `formData.barcode`, and returns seamlessly to the edit form.

---

## Verification Plan

### Automated Verification
- Run `npm run build` to verify that there are no syntax errors, import errors, or build issues.
- Run `npm run lint` or `npx oxlint` to check code quality.

### Manual Verification
1. **Edit Product Scanner Overlay Test**:
   - Open Product Management.
   - Click **Edit** on any book.
   - Click **Scan Barcode** next to the Barcode/ISBN field.
   - Verify that the camera scanner loads clearly **in front of** the edit form (not behind it).
   - Scan or enter a code: verify it fills the `barcode` input field and the edit modal remains open and intact.
2. **List View Barcode Button Test**:
   - In Product Management (table view and card view), click the barcode icon beside the Edit button.
   - Verify the Barcode Actions modal opens showing the product name and current barcode.
   - Click **Scan & Update Barcode**: camera scanner opens for that product.
   - Scan a new code: verify it saves to database, updates the inventory list, and displays a success toast.
   - Click **Print Barcode Label**: verify it opens the existing print dialog properly.
3. **Android & iOS Compatibility Verification**:
   - Verify video element has all required WebKit inline attributes (`playsinline`, `muted`, etc.).
   - Verify dual detection fallback (`detectFromVideoFrame` -> `decodeLiveVideoFrameFast`).
