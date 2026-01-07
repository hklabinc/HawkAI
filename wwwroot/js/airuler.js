// wwwroot/js/airulerCanvasInterop.js
window.airulerCanvas = (() => {
    let dotNet = null;

    let canvas = null;
    let ctx = null;
    let img = null;
    let hoverEl = null;

    let viewerHost = null;      // resizable host
    let transformHost = null;   // element to apply translate/scale
    let splitter = null;

    // CSS px size for canvas (to handle dpr correctly)
    let cssW = 0;
    let cssH = 0;

    // draw state (from C#)
    let state = {
        rois: [],
        measures: [],
        selectedRoiId: null,
        selectedMeasureId: null,
        selectedMeasureRoiIds: []
    };

    // drag ROI create
    let isDragging = false;
    let dragStart = null; // {px,py,cx,cy}
    let dragCur = null;
    let dragMoved = false;

    // focus
    let hasCanvasFocus = false;

    // resize
    let isResizing = false;
    let resizeStartY = 0;
    let resizeStartH = 0;
    let resizeLastH = 0;
    let userResized = false;
    const LS_KEY_VIEWER_H = "airuler.viewerHeightPx";

    // event cleanup
    const handlers = [];
    function on(el, evt, fn, opts) {
        el.addEventListener(evt, fn, opts);
        handlers.push([el, evt, fn, opts]);
    }
    function offAll() {
        for (const [el, evt, fn, opts] of handlers) {
            el.removeEventListener(evt, fn, opts);
        }
        handlers.length = 0;
    }

    function safeNaturalW() { return (img && img.naturalWidth) ? img.naturalWidth : 1; }
    function safeNaturalH() { return (img && img.naturalHeight) ? img.naturalHeight : 1; }

    function normalizeKey(e) {
        let k = e.key;
        if (k === "Add" || k === "NumpadAdd") k = "+";
        if (k === "Subtract" || k === "NumpadSubtract") k = "-";
        return k;
    }

    function resizeCanvasToImage() {
        if (!canvas || !ctx || !img) return;
        if (!img.complete) return;

        const w = img.clientWidth || 0;
        const h = img.clientHeight || 0;
        if (w <= 0 || h <= 0) return;

        cssW = w;
        cssH = h;

        const dpr = window.devicePixelRatio || 1;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));

        // draw in CSS pixels
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    function eventToImagePoint(e) {
        const rect = canvas.getBoundingClientRect();
        const vx = (e.clientX - rect.left);
        const vy = (e.clientY - rect.top);

        const nx = rect.width > 0 ? (vx / rect.width) : 0;
        const ny = rect.height > 0 ? (vy / rect.height) : 0;

        const px = nx * safeNaturalW();
        const py = ny * safeNaturalH();

        // canvas CSS px
        const cx = nx * cssW;
        const cy = ny * cssH;

        return { px, py, cx, cy };
    }

    function clampRect(x, y, w, h) {
        let rx = x, ry = y, rw = w, rh = h;
        if (rw < 0) { rx += rw; rw = -rw; }
        if (rh < 0) { ry += rh; rh = -rh; }

        rw = Math.max(1, rw);
        rh = Math.max(1, rh);

        const W = safeNaturalW();
        const H = safeNaturalH();

        rx = Math.max(0, Math.min(rx, W - 1));
        ry = Math.max(0, Math.min(ry, H - 1));
        if (rx + rw > W) rw = Math.max(1, W - rx);
        if (ry + rh > H) rh = Math.max(1, H - ry);

        return { x: rx, y: ry, w: rw, h: rh };
    }

    function setState(json) {
        try { state = JSON.parse(json); } catch { /* ignore */ }
        draw();
    }

    function setTransform(panX, panY, zoom) {
        if (!transformHost) return;
        const z = (typeof zoom === "number") ? zoom : 1.0;
        const x = (typeof panX === "number") ? panX : 0;
        const y = (typeof panY === "number") ? panY : 0;
        transformHost.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    }

    function getFitTransform() {
        const fallback = { zoom: 1.0, panX: 0, panY: 0 };

        if (!viewerHost || !transformHost || !img) return fallback;

        const vw = viewerHost.clientWidth || 0;
        const vh = viewerHost.clientHeight || 0;

        const iw = img.clientWidth || img.naturalWidth || 0;
        const ih = img.clientHeight || img.naturalHeight || 0;

        if (vw <= 0 || vh <= 0 || iw <= 0 || ih <= 0) return fallback;

        // ✅ "짤리지 않게 전체가 보이도록" = contain
        let zoom = Math.min(vw / iw, vh / ih);

        if (!Number.isFinite(zoom) || zoom <= 0) zoom = 1.0;

        // (권장) 아주 미세한 여유를 줘서 1px 오차로 스크롤/잘림 방지
        zoom = zoom * 0.999;

        // ✅ 원하는 정렬:
        // - 가운데 정렬(권장)
        const targetLeft = Math.round((vw - iw * zoom) / 2);
        const targetTop = Math.round((vh - ih * zoom) / 2);

        // - 만약 "무조건 좌상단(왼쪽 붙이기)" 원하면 위 2줄을 아래로 교체:
        // const targetLeft = 0;
        // const targetTop  = 0;

        // transformHost가 레이아웃 상 어디에 놓여있는지(기본 위치) 측정
        const prevTransform = transformHost.style.transform;
        const prevOrigin = transformHost.style.transformOrigin;

        transformHost.style.transformOrigin = "0 0";
        transformHost.style.transform = "translate(0px, 0px) scale(1)";

        const vRect = viewerHost.getBoundingClientRect();
        const tRect = transformHost.getBoundingClientRect();
        const baseLeft = Math.round(tRect.left - vRect.left);
        const baseTop = Math.round(tRect.top - vRect.top);

        // 원복(측정 중 화면 튐 최소화)
        transformHost.style.transform = prevTransform;
        transformHost.style.transformOrigin = prevOrigin || "0 0";

        // ✅ 최종적으로 원하는 위치(target)로 맞추는 pan
        const panX = targetLeft - baseLeft;
        const panY = targetTop - baseTop;

        return { zoom, panX, panY };
    }

    function draw() {
        if (!ctx || !canvas || !img) return;

        // clear (in CSS px coords because ctx scaled by dpr)
        ctx.clearRect(0, 0, cssW, cssH);

        const nW = safeNaturalW();
        const nH = safeNaturalH();

        // measures (lines)
        if (state.measures && state.measures.length) {
            for (const m of state.measures) {
                const s = (state.rois || []).find(rr => rr.id === m.startId);
                const e = (state.rois || []).find(rr => rr.id === m.endId);
                if (!s || !e) continue;

                const sx = ((s.x + s.w / 2) / nW) * cssW;
                const sy = ((s.y + s.h / 2) / nH) * cssH;
                const ex = ((e.x + e.w / 2) / nW) * cssW;
                const ey = ((e.y + e.h / 2) / nH) * cssH;

                const isSel = (state.selectedMeasureId === m.id);
                ctx.strokeStyle = isSel ? "red" : "yellow";
                ctx.lineWidth = isSel ? 3 : 2;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            }
        }

        // rois
        for (const r of (state.rois || [])) {
            const sx = (r.x / nW) * cssW;
            const sy = (r.y / nH) * cssH;
            const sw = (r.w / nW) * cssW;
            const sh = (r.h / nH) * cssH;

            const selectedByMeasure = (state.selectedMeasureRoiIds || []).includes(r.id);
            const isRed = (state.selectedRoiId === r.id) || selectedByMeasure;

            ctx.strokeStyle = isRed ? "red" : "lime";
            ctx.lineWidth = isRed ? 3 : 2;
            ctx.setLineDash([]);
            ctx.strokeRect(sx, sy, sw, sh);

            ctx.fillStyle = isRed ? "red" : "lime";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(r.id), sx + sw / 2, sy + sh / 2);
        }

        // drag temp rect
        if (isDragging && dragStart && dragCur) {
            ctx.strokeStyle = "white";
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 3]);
            ctx.strokeRect(dragStart.cx, dragStart.cy, dragCur.cx - dragStart.cx, dragCur.cy - dragStart.cy);
            ctx.setLineDash([]);
        }
    }

    function autoFitViewerHeightIfNeeded() {
        if (!viewerHost || !img) return;
        if (userResized) return; // user already chose a height

        // if there is a stored height, respect it
        const stored = localStorage.getItem(LS_KEY_VIEWER_H);
        if (stored) {
            const v = parseInt(stored, 10);
            if (Number.isFinite(v) && v >= 200) {
                viewerHost.style.height = v + "px";
                resizeCanvasToImage();
                return;
            }
        }

        // suggestion based on current rendered image height
        // (image is scaled to viewer width, so clientHeight is meaningful)
        const imgH = img.clientHeight || 0;
        const minH = 320;
        const maxH = Math.floor(window.innerHeight * 0.80);
        const desired = Math.max(minH, Math.min(maxH, imgH + 40));

        viewerHost.style.height = desired + "px";
        resizeCanvasToImage();
    }

    function initResizeSplitter() {
        if (!viewerHost || !splitter) return;

        // restore stored height at init
        const stored = localStorage.getItem(LS_KEY_VIEWER_H);
        if (stored) {
            const v = parseInt(stored, 10);
            if (Number.isFinite(v) && v >= 200) {
                viewerHost.style.height = v + "px";
            }
        }

        on(splitter, "mousedown", (e) => {
            isResizing = true;
            userResized = true;

            const rect = viewerHost.getBoundingClientRect();
            resizeStartH = rect.height;
            resizeLastH = rect.height;
            resizeStartY = e.clientY;

            e.preventDefault();
        });

        on(window, "mousemove", (e) => {
            if (!isResizing) return;

            const dy = e.clientY - resizeStartY;
            const minH = 260;
            const maxH = Math.floor(window.innerHeight * 0.90);

            let newH = resizeStartH + dy;
            newH = Math.max(minH, Math.min(maxH, newH));

            viewerHost.style.height = Math.floor(newH) + "px";
            resizeLastH = newH;

            resizeCanvasToImage();
            e.preventDefault();
        });

        on(window, "mouseup", () => {
            if (!isResizing) return;
            isResizing = false;

            // store height
            localStorage.setItem(LS_KEY_VIEWER_H, String(Math.floor(resizeLastH)));
        });
    }

    function init(dotNetHelper, canvasId, imgId, hoverId, viewerHostId, transformHostId, splitterId) {
        dispose();

        dotNet = dotNetHelper;
        canvas = document.getElementById(canvasId);
        img = document.getElementById(imgId);
        hoverEl = hoverId ? document.getElementById(hoverId) : null;

        viewerHost = viewerHostId ? document.getElementById(viewerHostId) : null;
        transformHost = transformHostId ? document.getElementById(transformHostId) : null;
        if (transformHost) {
            transformHost.style.transformOrigin = "0 0";
        }
        splitter = splitterId ? document.getElementById(splitterId) : null;

        if (!canvas || !img) return;
        ctx = canvas.getContext("2d");

        // focus tracking
        on(canvas, "focus", () => { hasCanvasFocus = true; });
        on(canvas, "blur", () => { hasCanvasFocus = false; });

        // resize listeners
        on(window, "resize", () => {
            resizeCanvasToImage();
        });

        // image load
        on(img, "load", () => {
            requestAnimationFrame(() => {
                resizeCanvasToImage();
                autoFitViewerHeightIfNeeded();

                // ✅ layout 안정화 후 콜백
                try {
                    dotNet?.invokeMethodAsync("OnImageLoaded", img.naturalWidth || 0, img.naturalHeight || 0);
                } catch { /* ignore */ }
            });
        });

        // ROI drag create
        on(canvas, "mousedown", (e) => {
            if (e.button !== 0) return;

            // focus canvas so keyboard shortcuts work
            canvas.focus();

            isDragging = true;
            dragMoved = false;
            dragStart = eventToImagePoint(e);
            dragCur = dragStart;
            draw();
            e.preventDefault();
        });

        on(window, "mousemove", (e) => {
            if (!isDragging) return;
            dragCur = eventToImagePoint(e);

            const dx = dragCur.cx - dragStart.cx;
            const dy = dragCur.cy - dragStart.cy;
            if ((dx * dx + dy * dy) > 9) dragMoved = true;

            if (hoverEl) {
                hoverEl.textContent = `x=${dragCur.px.toFixed(1)}, y=${dragCur.py.toFixed(1)}`;
            }

            draw();
        });

        on(window, "mouseup", async (e) => {
            if (!isDragging) return;

            isDragging = false;
            const endPt = eventToImagePoint(e);
            dragCur = endPt;

            if (dragMoved) {
                const rect = clampRect(
                    dragStart.px,
                    dragStart.py,
                    endPt.px - dragStart.px,
                    endPt.py - dragStart.py
                );

                if (rect.w >= 2 && rect.h >= 2) {
                    try {
                        await dotNet?.invokeMethodAsync("OnNewRoiRect", rect.x, rect.y, rect.w, rect.h);
                    } catch { /* ignore */ }
                }
            } else {
                try {
                    await dotNet?.invokeMethodAsync("OnCanvasClicked", endPt.px, endPt.py);
                } catch { /* ignore */ }
            }

            dragStart = null;
            dragCur = null;
            draw();
        });

        // keyboard handler (핵심)
        on(window, "keydown", async (e) => {
            if (!hasCanvasFocus) return;

            // 입력칸에 포커스면 ROI 단축키가 아니라 텍스트 편집이 우선
            const ae = document.activeElement;
            if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || ae.isContentEditable)) {
                return;
            }

            const key = normalizeKey(e);
            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;
            const alt = e.altKey;

            // 브라우저 기본 동작(페이지 줌/스크롤) 방지: 먼저 막아두고, C# 처리 여부에 따라 최종 결정
            const prePrevent =
                (ctrl && (key === "+" || key === "=" || key === "-" || key.startsWith("Arrow"))) ||
                key.startsWith("Arrow") ||
                key === "Delete";

            if (prePrevent) e.preventDefault();

            let handled = false;
            try {
                handled = await dotNet?.invokeMethodAsync("OnKeyDown", key, ctrl, shift, alt);
            } catch {
                handled = false;
            }

            if (handled) e.preventDefault();
        }, { capture: true });

        // splitter resize
        initResizeSplitter();

        // initial sizing
        requestAnimationFrame(() => {
            resizeCanvasToImage();
            autoFitViewerHeightIfNeeded();
        });
    }

    function dispose() {
        offAll();
        dotNet = null;
        canvas = null;
        ctx = null;
        img = null;
        hoverEl = null;
        viewerHost = null;
        transformHost = null;
        splitter = null;

        cssW = 0;
        cssH = 0;

        state = { rois: [], measures: [], selectedRoiId: null, selectedMeasureId: null, selectedMeasureRoiIds: [] };

        isDragging = false;
        dragStart = null;
        dragCur = null;
        dragMoved = false;

        hasCanvasFocus = false;

        isResizing = false;
        resizeStartY = 0;
        resizeStartH = 0;
        resizeLastH = 0;
        userResized = false;
    }

    return { init, setState, setTransform, getFitTransform, draw, dispose };
})();
