// Namespace
window.ImageTool = (function () {
    // Canvas & DOM
    let canvas, ctx;
    let fileImg1Input, fileImg2Input, reload1Input, reload2Input;

    // Core state
    const state = {
        // Original HTMLImageElement for each side
        img1: null,
        img2: null,
        img1Loaded: false,
        img2Loaded: false,

        // Natural-size offscreen canvas for img2 (editable) + undo buffer
        work2: null,
        w2ctx: null,
        undoImageData: null,

        // Zoom/pan
        zoom1: 1.0,
        zoom2: 1.0,
        pan1: { x: 0, y: 0 },
        pan2: { x: 0, y: 0 },

        // Crops in IMAGE coordinates (x1,y1,x2,y2)
        crop1: null,
        crop2: null,

        // Drag interaction
        dragging: false,
        dragStart: null,   // canvas coords
        dragEnd: null,     // canvas coords
        dragOnLeft: true,

        // Filenames + save index
        name1: "",
        name2: "",
        saveIndex: 1
    };

    // ---------- Utility ----------
    function baseNameNoExt(filename) {
        if (!filename) return "image2";
        const just = filename.split(/[\\/]/).pop();
        const idx = just.lastIndexOf(".");
        return idx >= 0 ? just.slice(0, idx) : just;
    }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    // 화면상의 좌표 → 캔버스 내부 좌표로 변환 (CSS 스케일/테두리 등 보정)
    function getCanvasPointer(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        return { x, y };
    }

    // HTMLImageElement 또는 HTMLCanvasElement 모두 지원
    function getImageDims(obj) {
        if (!obj) return { w: 0, h: 0 };
        // <img>
        if (typeof obj.naturalWidth === "number" && obj.naturalWidth > 0) {
            return { w: obj.naturalWidth, h: obj.naturalHeight };
        }
        // <canvas>
        if (typeof obj.width === "number" && obj.width > 0) {
            return { w: obj.width, h: obj.height };
        }
        return { w: 0, h: 0 };
    }

    // Compute source rect from zoom/pan
    function computeViewRect(img, zoom, pan) {
        const { w, h } = getImageDims(img);
        const cx = (w / 2) + pan.x;
        const cy = (h / 2) + pan.y;
        const newW = Math.floor(w / zoom);
        const newH = Math.floor(h / zoom);
        let x1 = Math.floor(cx - newW / 2);
        let y1 = Math.floor(cy - newH / 2);

        x1 = clamp(x1, 0, Math.max(0, w - newW));
        y1 = clamp(y1, 0, Math.max(0, h - newH));
        return { x: x1, y: y1, w: Math.min(newW, w), h: Math.min(newH, h) };
    }

    // Image->Canvas mapping (left or right half)
    function imageToCanvasCoords(xImg, yImg, side /*1|2*/) {
        const img = (side === 1) ? state.img1 : (state.work2 ?? state.img2);
        const zoom = (side === 1) ? state.zoom1 : state.zoom2;
        const pan = (side === 1) ? state.pan1 : state.pan2;

        const view = computeViewRect(img, zoom, pan);
        const cw = 800, ch = 700;
        const relX = (xImg - view.x) / view.w; // 0..1
        const relY = (yImg - view.y) / view.h; // 0..1
        const cx = Math.round(relX * cw) + ((side === 2) ? 800 : 0);
        const cy = Math.round(relY * ch);
        return { x: cx, y: cy };
    }

    // Canvas->Image mapping
    function canvasToImageCoords(xCanvas, yCanvas, side /*1|2*/) {
        const img = (side === 1) ? state.img1 : (state.work2 ?? state.img2);
        const zoom = (side === 1) ? state.zoom1 : state.zoom2;
        const pan = (side === 1) ? state.pan1 : state.pan2;

        const cw = 800, ch = 700;
        const localX = (side === 2) ? (xCanvas - 800) : xCanvas; // 0..800
        const localY = yCanvas;                                   // 0..700
        const view = computeViewRect(img, zoom, pan);
        const xImg = Math.round(view.x + (localX / cw) * view.w);
        const yImg = Math.round(view.y + (localY / ch) * view.h);
        const { w, h } = getImageDims(img);
        return { x: clamp(xImg, 0, w), y: clamp(yImg, 0, h) };
    }

    // Draw dashed rectangle + size label
    function drawRectWithSize(x1c, y1c, x2c, y2c, wpx, hpx, dashed = false) {
        ctx.save();
        ctx.strokeStyle = "red";
        ctx.lineWidth = 1;
        if (dashed) ctx.setLineDash([3, 2]);
        ctx.strokeRect(x1c, y1c, x2c - x1c, y2c - y1c);
        ctx.setLineDash([]);
        ctx.fillStyle = "red";
        ctx.font = "10px Arial";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${wpx}x${hpx}`, x1c, y1c - 3);
        ctx.restore();
    }

    // ---------- Rendering ----------
    function redraw() {
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Left: img1
        if (state.img1Loaded) {
            const v1 = computeViewRect(state.img1, state.zoom1, state.pan1);
            ctx.drawImage(state.img1, v1.x, v1.y, v1.w, v1.h, 0, 0, 800, 700);
        } else {
            // placeholder
            ctx.fillStyle = "#fafafa";
            ctx.fillRect(0, 0, 800, 700);
        }

        // Right: img2 (from working canvas if loaded)
        if (state.img2Loaded && state.work2) {
            const v2 = computeViewRect(state.work2, state.zoom2, state.pan2);
            ctx.drawImage(state.work2, v2.x, v2.y, v2.w, v2.h, 800, 0, 800, 700);
        } else {
            ctx.fillStyle = "#f5f5f5";
            ctx.fillRect(800, 0, 800, 700);
        }

        // Titles (file name + natural size)
        ctx.save();
        ctx.fillStyle = "black";
        ctx.font = "bold 12px Arial";
        if (state.img1Loaded) {
            ctx.textAlign = "center";
            ctx.fillText(
                `${state.name1} (${state.img1.naturalWidth}x${state.img1.naturalHeight})`,
                400, 20
            );
        }
        if (state.img2Loaded) {
            ctx.textAlign = "center";
            const w = state.work2 ? state.work2.width : (state.img2 ? state.img2.naturalWidth : 0);
            const h = state.work2 ? state.work2.height : (state.img2 ? state.img2.naturalHeight : 0);
            ctx.fillText(`${state.name2} (${w}x${h})`, 1200, 20);
        }
        ctx.restore();

        // Persistent crop rectangles (solid red)
        if (state.img1Loaded && state.crop1) {
            const [x1, y1, x2, y2] = state.crop1;
            const p1 = imageToCanvasCoords(x1, y1, 1);
            const p2 = imageToCanvasCoords(x2, y2, 1);
            drawRectWithSize(p1.x, p1.y, p2.x, p2.y, x2 - x1, y2 - y1, false);
        }
        if (state.img2Loaded && state.crop2) {
            const [x1, y1, x2, y2] = state.crop2;
            const p1 = imageToCanvasCoords(x1, y1, 2);
            const p2 = imageToCanvasCoords(x2, y2, 2);
            drawRectWithSize(p1.x, p1.y, p2.x, p2.y, x2 - x1, y2 - y1, false);
        }

        // Drag rectangle (dashed)
        if (state.dragging && state.dragStart && state.dragEnd) {
            const x1 = Math.min(state.dragStart.x, state.dragEnd.x);
            const y1 = Math.min(state.dragStart.y, state.dragEnd.y);
            const x2 = Math.max(state.dragStart.x, state.dragEnd.x);
            const y2 = Math.max(state.dragStart.y, state.dragEnd.y);

            // Translate canvas rect to image rect (for size label)
            const side = (x1 < 800) ? 1 : 2;
            const p1 = canvasToImageCoords(x1, y1, side);
            const p2 = canvasToImageCoords(x2, y2, side);
            drawRectWithSize(x1, y1, x2, y2, Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y), true);
        }
    }

    // ---------- Image loading ----------
    function loadFromFileInput(input, onImageReady) {
        const file = input.files && input.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            onImageReady(img, file.name || "");
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }

    function setupWorkCanvas2() {
        if (!state.img2Loaded) return;
        state.work2 = document.createElement("canvas");
        state.work2.width = state.img2.naturalWidth;
        state.work2.height = state.img2.naturalHeight;
        state.w2ctx = state.work2.getContext("2d");
        state.w2ctx.drawImage(state.img2, 0, 0);
    }

    // ---------- Public API functions (called from Razor) ----------
    function init(canvasSelector, file1Sel, file2Sel, reload1Sel, reload2Sel) {
        canvas = document.querySelector(canvasSelector);
        ctx = canvas.getContext("2d");

        fileImg1Input = document.querySelector(file1Sel);
        fileImg2Input = document.querySelector(file2Sel);
        reload1Input = document.querySelector(reload1Sel);
        reload2Input = document.querySelector(reload2Sel);

        // First-load buttons: choose files then click "Load Both"
        // Alternatively, you can wire "change" directly:
        // but keeping identical to the Python: we prompt both images first.

        // Reloads
        reload1Input.addEventListener("change", () => {
            loadFromFileInput(reload1Input, (img, name) => {
                state.img1 = img;
                state.name1 = name;
                state.img1Loaded = true;
                state.zoom1 = 1.0; state.pan1 = { x: 0, y: 0 };
                state.crop1 = null;
                redraw();
                console.log(`✅ Image1 reloaded: ${name}`);
            });
        });
        reload2Input.addEventListener("change", () => {
            loadFromFileInput(reload2Input, (img, name) => {
                state.img2 = img;
                state.name2 = name;
                state.img2Loaded = true;
                setupWorkCanvas2();
                state.zoom2 = 1.0; state.pan2 = { x: 0, y: 0 };
                state.crop2 = null;
                redraw();
                console.log(`✅ Image2 reloaded: ${name}`);
            });
        });

        fileImg1Input.addEventListener("change", () => {
            loadFromFileInput(fileImg1Input, (img, name) => {
                state.img1 = img;
                state.name1 = name;
                state.img1Loaded = true;
                state.zoom1 = 1.0;
                state.pan1 = { x: 0, y: 0 };
                state.crop1 = null;
                redraw();
                canvas.focus();
                console.log(`✅ Image1 loaded (direct): ${name}`);
            });
        });

        fileImg2Input.addEventListener("change", () => {
            loadFromFileInput(fileImg2Input, (img, name) => {
                state.img2 = img;
                state.name2 = name;
                state.img2Loaded = true;
                setupWorkCanvas2();
                state.zoom2 = 1.0;
                state.pan2 = { x: 0, y: 0 };
                state.crop2 = null;
                redraw();
                canvas.focus();
                console.log(`✅ Image2 loaded (direct): ${name}`);
            });
        });


        // Mouse interactions (drag to select)
        canvas.addEventListener("mousedown", (e) => {
            const { x, y } = getCanvasPointer(e);
            state.dragging = true;
            state.dragStart = { x, y };
            state.dragEnd = { x, y };
            state.dragOnLeft = x < 800;
            redraw();
        });
        canvas.addEventListener("mousemove", (e) => {
            if (!state.dragging) return;
            const { x, y } = getCanvasPointer(e);
            state.dragEnd = { x, y };
            redraw();
        });

        canvas.addEventListener("mouseup", (e) => {
            if (!state.dragging) return;
            const { x, y } = getCanvasPointer(e);
            state.dragEnd = { x, y };
            state.dragging = false;

            const x1 = Math.min(state.dragStart.x, state.dragEnd.x);
            const y1 = Math.min(state.dragStart.y, state.dragEnd.y);
            const x2 = Math.max(state.dragStart.x, state.dragEnd.x);
            const y2 = Math.max(state.dragStart.y, state.dragEnd.y);

            const side = (x1 < 800) ? 1 : 2;
            const p1 = canvasToImageCoords(x1, y1, side);
            const p2 = canvasToImageCoords(x2, y2, side);

            // Ensure at least 1px
            const xi1 = Math.min(p1.x, p2.x), yi1 = Math.min(p1.y, p2.y);
            const xi2 = Math.max(p1.x, p2.x), yi2 = Math.max(p1.y, p2.y);
            if (xi2 - xi1 < 1 || yi2 - yi1 < 1) { redraw(); return; }

            if (side === 1) state.crop1 = [xi1, yi1, xi2, yi2];
            else state.crop2 = [xi1, yi1, xi2, yi2];

            redraw();
        });

        // Keyboard shortcuts + crop move/resize for Image2
        canvas.addEventListener("keydown", (e) => {
            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;

            if (ctrl) {
                const k = e.key.toLowerCase();
                if (k === "z") { e.preventDefault(); undoApply(); return; }
                if (k === "y") { e.preventDefault(); applyReplace(); return; }
                if (k === "s") { e.preventDefault(); saveImage(); return; }
            }

            if (!state.crop2 || !state.img2Loaded) return;

            let [x1, y1, x2, y2] = state.crop2;
            let moved = false, resized = false;

            if (shift) {
                // Resize with Shift+Arrows
                if (e.key === "ArrowDown") { y2 += 1; resized = true; }
                else if (e.key === "ArrowUp") { if (y2 > y1 + 1) { y2 -= 1; resized = true; } }
                else if (e.key === "ArrowRight") { x2 += 1; resized = true; }
                else if (e.key === "ArrowLeft") { if (x2 > x1 + 1) { x2 -= 1; resized = true; } }
            } else {
                // Move with Arrows
                if (e.key === "ArrowUp") { y1 -= 1; y2 -= 1; moved = true; }
                else if (e.key === "ArrowDown") { y1 += 1; y2 += 1; moved = true; }
                else if (e.key === "ArrowLeft") { x1 -= 1; x2 -= 1; moved = true; }
                else if (e.key === "ArrowRight") { x1 += 1; x2 += 1; moved = true; }
            }

            // Clamp to Image2 bounds
            const W = state.work2 ? state.work2.width : state.img2.naturalWidth;
            const H = state.work2 ? state.work2.height : state.img2.naturalHeight;

            x1 = clamp(x1, 0, W - 1);
            y1 = clamp(y1, 0, H - 1);
            x2 = clamp(x2, x1 + 1, W);
            y2 = clamp(y2, y1 + 1, H);

            if (moved || resized) {
                state.crop2 = [x1, y1, x2, y2];
                redraw();
            }
        });

        // Initial paint
        redraw();
    }

    function loadBoth() {
        if (!fileImg1Input.files?.length || !fileImg2Input.files?.length) {
            alert("Please choose both Image 1 and Image 2.");
            return;
        }
        loadFromFileInput(fileImg1Input, (img, name) => {
            state.img1 = img;
            state.name1 = name;
            state.img1Loaded = true;
            state.zoom1 = 1.0; state.pan1 = { x: 0, y: 0 };
            state.crop1 = null;
            redraw();
        });
        loadFromFileInput(fileImg2Input, (img, name) => {
            state.img2 = img;
            state.name2 = name;
            state.img2Loaded = true;
            state.zoom2 = 1.0; state.pan2 = { x: 0, y: 0 };
            state.crop2 = null;
            setupWorkCanvas2();
            redraw();
        });

        // Focus the canvas to receive keyboard events
        setTimeout(() => { canvas.focus(); }, 200);
    }

    function zoom(side, factor) {
        if (side === 1) state.zoom1 *= factor;
        else state.zoom2 *= factor;
        redraw();
    }

    function pan(side, dx, dy) {
        if (side === 1) { state.pan1.x += dx; state.pan1.y += dy; }
        else { state.pan2.x += dx; state.pan2.y += dy; }
        redraw();
    }

    function resetView(side) {
        if (side === 1) { state.zoom1 = 1.0; state.pan1 = { x: 0, y: 0 }; }
        else { state.zoom2 = 1.0; state.pan2 = { x: 0, y: 0 }; }
        redraw();
    }

    function applyReplace() {
        if (!state.crop1 || !state.crop2) {
            console.log("양쪽 crop을 먼저 지정해주세요.");
            return;
        }
        if (!state.work2) setupWorkCanvas2();
        if (!state.w2ctx) return;

        // Save undo
        state.undoImageData = state.w2ctx.getImageData(0, 0, state.work2.width, state.work2.height);

        const [sx1, sy1, sx2, sy2] = state.crop1; // from img1
        const [dx1, dy1, dx2, dy2] = state.crop2; // to img2 (work2)
        const sw = sx2 - sx1, sh = sy2 - sy1;
        const dw = dx2 - dx1, dh = dy2 - dy1;

        // Draw from img1 (source rect) into work2 (dest rect) with scaling
        state.w2ctx.drawImage(
            state.img1,
            sx1, sy1, sw, sh,
            dx1, dy1, dw, dh
        );

        redraw();
    }

    function undoApply() {
        if (!state.undoImageData || !state.w2ctx) {
            console.log("⛔ 이전 상태가 존재하지 않습니다. Apply 후에만 Undo 가능합니다.");
            return;
        }
        state.w2ctx.putImageData(state.undoImageData, 0, 0);
        redraw();
        console.log("✅ Undo Apply 완료");
    }

    function saveImage() {
        if (!state.work2) setupWorkCanvas2();
        if (!state.work2) return;

        const a = document.createElement("a");
        const base = baseNameNoExt(state.name2);
        const idx = state.saveIndex++;
        const fname = `${base}_${String(idx).padStart(2, "0")}.jpg`;
        a.download = fname;

        // JPEG, quality = 1.0 (max)
        a.href = state.work2.toDataURL("image/jpeg", 1.0);
        a.click();
        console.log(`이미지 저장 완료 (최대 품질 JPG): ${fname}`);
    }

    // Expose
    return {
        init,
        loadBoth,
        zoom,
        pan,
        resetView,
        applyReplace,
        undoApply,
        saveImage
    };
})();
