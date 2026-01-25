/*
 * wwwroot/js/labeling_kp.js
 *
 * YOLO Pose(Keypoint) labeling canvas helper.
 * - Keeps the existing labeling.js intact.
 * - Stores boxes + keypoints per box as JSON:
 *   [{ x, y, w, h, label, keypoints: [{x,y,v,name}, ...] }, ...]
 *
 * Notes
 * - All coordinates stored in LabelData JSON are in ORIGINAL IMAGE PIXELS (not normalized).
 * - Export 단계에서 YOLO 포맷(정규화)으로 변환.
 */

window.initLabelingCanvasKP = (dotNetHelper, labelJson) => {
    window.dotNetHelperKP = dotNetHelper;

    let boxes = [];
    let history = [];               // undo
    let redoStack = [];             // redo
    let multiSelectedIndexes = [];

    let selectedBoxIndex = -1;
    let selectedKeypointIndex = -1; // within selected box

    let draggingHandle = null;
    let isMovingBox = false;
    let draggingKeypoint = false;

    let startX, startY;
    let isDrawing = false;
    let isShiftSelecting = false;

    let lastMouseX = null;
    let lastMouseY = null;

    let copiedBox = null;

    // keypoint placement state
    let potentialKeypointPlacement = false;
    let keypointPlacementBoxIndex = -1;

    const HANDLE_SIZE = 8;

    // Keypoint rendering / hit-test
    // - Draw size: 1px (user request)
    // - Hit area stays larger so it's still easy to click/drag
    const KEYPOINT_DRAW_SIZE_PX = 1;          // on-canvas pixel size
    const KEYPOINT_HIT_RADIUS_CANVAS_PX = 8;  // on-canvas hit radius
    const KEYPOINT_TEXT_OFFSET = 8;

    const canvas = document.getElementById('labelCanvas');
    const img = document.getElementById('targetImage');
    const ctx = canvas.getContext('2d');

    const getScaleFactors = () => ({
        scaleX: img.naturalWidth / canvas.clientWidth,
        scaleY: img.naturalHeight / canvas.clientHeight
    });

    const getInverseScaleFactors = () => ({
        invScaleX: canvas.clientWidth / img.naturalWidth,
        invScaleY: canvas.clientHeight / img.naturalHeight
    });

    const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

    // Load label JSON
    if (labelJson) {
        try {
            const parsed = JSON.parse(labelJson);
            boxes = Array.isArray(parsed) ? parsed : [];
        } catch {
            boxes = [];
        }
    }

    // Ensure keypoints field
    boxes.forEach(b => {
        if (!Array.isArray(b.keypoints)) b.keypoints = [];
    });

    const resizeCanvas = () => {
        canvas.width = img.clientWidth;
        canvas.height = img.clientHeight;
        redraw();
    };

    img.onload = resizeCanvas;
    if (img.complete && img.naturalWidth > 0) {
        resizeCanvas();
    }
    window.addEventListener('resize', resizeCanvas);

    function getHandles(box) {
        const x = box.x, y = box.y, w = box.w, h = box.h;
        return {
            tl: { x: x, y: y },
            tr: { x: x + w, y: y },
            bl: { x: x, y: y + h },
            br: { x: x + w, y: y + h },
            tm: { x: x + w / 2, y: y },
            bm: { x: x + w / 2, y: y + h },
            ml: { x: x, y: y + h / 2 },
            mr: { x: x + w, y: y + h / 2 }
        };
    }

    function getColorForLabel(label) {
        const colors = ['blue', 'green', 'red', 'orange', 'purple'];
        const labelSelector = document.getElementById('labelSelector');
        const options = labelSelector ? Array.from(labelSelector.options) : [];
        const index = options.findIndex(opt => opt.value === label);
        return colors[(index < 0 ? 0 : index) % colors.length];
    }

    // 특정 라벨(예: film 박스)은 실수로 선택/이동되지 않도록 조작 방식을 제한
    const CORNER_HANDLE_KEYS = ['tl', 'tr', 'bl', 'br'];
    function isFilmBox(box) {
        const lbl = (box?.label ?? '').toString().trim().toLowerCase();
        return lbl === 'film';
    }

    function isPointNear(px, py, x, y, radiusPx) {
        const dx = px - x;
        const dy = py - y;
        return (dx * dx + dy * dy) <= radiusPx * radiusPx;
    }

    function findKeypointHit(clickX_canvas, clickY_canvas) {
        // Return { boxIndex, kpIndex } if hit, else null
        const { invScaleX, invScaleY } = getInverseScaleFactors();
        const px = clickX_canvas / invScaleX; // convert to image pixel
        const py = clickY_canvas / invScaleY;

        // Keep hit-test radius consistent in *screen/canvas* pixels
        const hitRadiusImgPx = KEYPOINT_HIT_RADIUS_CANVAS_PX / Math.min(invScaleX, invScaleY);

        // Prefer selected box first
        const boxOrder = [];
        if (selectedBoxIndex !== -1) boxOrder.push(selectedBoxIndex);
        for (let i = boxes.length - 1; i >= 0; i--) {
            if (i !== selectedBoxIndex) boxOrder.push(i);
        }

        for (const bi of boxOrder) {
            const box = boxes[bi];
            if (!box || !Array.isArray(box.keypoints)) continue;
            for (let ki = 0; ki < box.keypoints.length; ki++) {
                const kp = box.keypoints[ki];
                if (!kp) continue;
                const kpx = kp.x;
                const kpy = kp.y;
                if (isPointNear(px, py, kpx, kpy, hitRadiusImgPx)) {
                    return { boxIndex: bi, kpIndex: ki };
                }
            }
        }
        return null;
    }

    function ensureBoxKeypoints(box) {
        if (!Array.isArray(box.keypoints)) box.keypoints = [];
        box.keypoints.forEach((kp, idx) => {
            if (kp.name === undefined || kp.name === null || kp.name === "") {
                kp.name = `P${idx + 1}`;
            }
            if (kp.v === undefined || kp.v === null) {
                kp.v = 2;
            }
        });
    }

    function addKeypointToBox(boxIndex, x_img, y_img) {
        if (boxIndex < 0 || boxIndex >= boxes.length) return;
        const box = boxes[boxIndex];
        ensureBoxKeypoints(box);

        const nextIdx = box.keypoints.length + 1;
        box.keypoints.push({
            x: Math.round(x_img),
            y: Math.round(y_img),
            v: 2,
            name: `P${nextIdx}`
        });
        selectedBoxIndex = boxIndex;
        selectedKeypointIndex = box.keypoints.length - 1;
    }

    function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const { invScaleX, invScaleY } = getInverseScaleFactors();

        // boxes
        boxes.forEach((box, i) => {
            const drawX = box.x * invScaleX;
            const drawY = box.y * invScaleY;
            const drawW = box.w * invScaleX;
            const drawH = box.h * invScaleY;

            ctx.strokeStyle = (i === selectedBoxIndex) ? '#505050' : getColorForLabel(box.label);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(drawX, drawY, drawW, drawH);

            // label
            ctx.fillStyle = getColorForLabel(box.label);
            ctx.font = '16px Arial';
            ctx.fillText(box.label ?? '', drawX + 2, drawY - 4);

            // handles
            if (i === selectedBoxIndex) {
                const handles = getHandles(box);
                const keys = isFilmBox(box) ? CORNER_HANDLE_KEYS : Object.keys(handles);
                for (const key of keys) {
                    const { x, y } = handles[key];
                    const hx = x * invScaleX;
                    const hy = y * invScaleY;
                    ctx.fillStyle = 'cyan';
                    ctx.fillRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
                }
            } else if (multiSelectedIndexes.includes(i)) {
                const handles = getHandles(box);
                const keys = isFilmBox(box) ? CORNER_HANDLE_KEYS : Object.keys(handles);
                for (const key of keys) {
                    const { x, y } = handles[key];
                    const hx = x * invScaleX;
                    const hy = y * invScaleY;
                    ctx.fillStyle = 'lightgreen';
                    ctx.fillRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
                }
            }

            // keypoints
            ensureBoxKeypoints(box);
            if (Array.isArray(box.keypoints) && box.keypoints.length > 0) {
                box.keypoints.forEach((kp, ki) => {
                    const kx = kp.x * invScaleX;
                    const ky = kp.y * invScaleY;

                    const isSel = (i === selectedBoxIndex) && (ki === selectedKeypointIndex);

                    // point (1px)
                    const px1 = Math.round(kx);
                    const py1 = Math.round(ky);
                    ctx.fillStyle = isSel ? 'red' : 'yellow';
                    ctx.fillRect(px1, py1, KEYPOINT_DRAW_SIZE_PX, KEYPOINT_DRAW_SIZE_PX);

                    // name + (x,y) in original image pixels
                    const name = (kp.name && kp.name.trim().length > 0) ? kp.name : `P${ki + 1}`;
                    const ix = Math.round(kp.x);
                    const iy = Math.round(kp.y);
                    const nameWithCoord = `${name}(${ix},${iy})`;
                    ctx.font = '14px Arial';
                    ctx.fillStyle = isSel ? 'red' : 'yellow';
                    ctx.fillText(nameWithCoord, kx + KEYPOINT_TEXT_OFFSET, ky - KEYPOINT_TEXT_OFFSET);
                });
            }
        });
    }

    // Mouse events
    canvas.addEventListener('mousedown', (e) => {
        const clickX = e.offsetX;
        const clickY = e.offsetY;

        const { scaleX, scaleY } = getScaleFactors();
        const px = clickX * scaleX;
        const py = clickY * scaleY;

        // reset state
        draggingHandle = null;
        isMovingBox = false;
        draggingKeypoint = false;
        potentialKeypointPlacement = false;
        keypointPlacementBoxIndex = -1;

        if (e.shiftKey) {
            startX = clickX;
            startY = clickY;
            isDrawing = true;
            isShiftSelecting = true;
            multiSelectedIndexes = [];
            redraw();
            return;
        }

        // 0) keypoint hit test
        const kpHit = findKeypointHit(clickX, clickY);
        if (kpHit) {
            selectedBoxIndex = kpHit.boxIndex;
            selectedKeypointIndex = kpHit.kpIndex;

            // save history
            redoStack = [];
            history.push(deepClone(boxes));

            draggingKeypoint = true;
            lastMouseX = clickX;
            lastMouseY = clickY;
            redraw();
            return;
        }

        // 1) handle / edge / label / inside-box detection
        selectedKeypointIndex = -1;

        for (let i = boxes.length - 1; i >= 0; i--) {
            const box = boxes[i];
            ensureBoxKeypoints(box);

            // handles
            const handles = getHandles(box);
            const handleKeys = isFilmBox(box) ? CORNER_HANDLE_KEYS : Object.keys(handles);
            for (const key of handleKeys) {
                const { x, y } = handles[key];
                const hx = x * (canvas.clientWidth / img.naturalWidth);
                const hy = y * (canvas.clientHeight / img.naturalHeight);
                const dx = clickX - hx;
                const dy = clickY - hy;
                if (Math.abs(dx) < HANDLE_SIZE && Math.abs(dy) < HANDLE_SIZE) {
                    selectedBoxIndex = i;
                    selectedKeypointIndex = -1;
                    draggingHandle = key;

                    redoStack = [];
                    history.push(deepClone(boxes));

                    lastMouseX = clickX;
                    lastMouseY = clickY;
                    redraw();
                    return;
                }
            }

            // edges (move box)
            // - film 박스는 실수로 움직이지 않도록: 모서리로만 선택/조작 (edge 이동 비활성)
            if (!isFilmBox(box)) {
                const sx = box.x * (canvas.clientWidth / img.naturalWidth);
                const sy = box.y * (canvas.clientHeight / img.naturalHeight);
                const sw = box.w * (canvas.clientWidth / img.naturalWidth);
                const sh = box.h * (canvas.clientHeight / img.naturalHeight);

                const margin = 5;
                const onLeftEdge = Math.abs(clickX - sx) < margin && clickY >= sy && clickY <= sy + sh;
                const onRightEdge = Math.abs(clickX - (sx + sw)) < margin && clickY >= sy && clickY <= sy + sh;
                const onTopEdge = Math.abs(clickY - sy) < margin && clickX >= sx && clickX <= sx + sw;
                const onBottomEdge = Math.abs(clickY - (sy + sh)) < margin && clickX >= sx && clickX <= sx + sw;

                if (onLeftEdge || onRightEdge || onTopEdge || onBottomEdge) {
                    selectedBoxIndex = i;
                    selectedKeypointIndex = -1;

                    redoStack = [];
                    history.push(deepClone(boxes));

                    isMovingBox = true;
                    lastMouseX = clickX;
                    lastMouseY = clickY;
                    redraw();
                    return;
                }
            }

            // label text click -> cycle label
            const text = box.label ?? '';
            ctx.font = '16px Arial';
            const textWidth = ctx.measureText(text).width;
            const textHeight = 16;
            const insideText = (px >= box.x && px <= box.x + textWidth && py >= box.y - textHeight && py <= box.y);
            if (insideText) {
                const labelSelector = document.getElementById('labelSelector');
                const options = labelSelector ? Array.from(labelSelector.options) : [];
                const currentIndex = options.findIndex(opt => opt.value === box.label);
                const nextIndex = options.length > 0 ? (currentIndex + 1) % options.length : -1;
                if (nextIndex >= 0) box.label = options[nextIndex].value;
                // film 박스는 모서리로만 선택되도록: 라벨 클릭으로는 선택 상태를 바꾸지 않음
                if (!isFilmBox(box)) selectedBoxIndex = i;
                redraw();
                return;
            }

            // inside box -> allow keypoint placement
            const insideBox = (px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h);
            if (insideBox) {
                // film 박스는 내부 클릭으로 선택되지 않게 (모서리로만 선택)
                if (!isFilmBox(box)) selectedBoxIndex = i;
                selectedKeypointIndex = -1;

                // potential keypoint placement
                potentialKeypointPlacement = true;
                keypointPlacementBoxIndex = i;
                startX = clickX;
                startY = clickY;
                lastMouseX = clickX;
                lastMouseY = clickY;

                redraw();
                return;
            }
        }

        // click on empty area -> start drawing new box
        selectedBoxIndex = -1;
        selectedKeypointIndex = -1;
        draggingHandle = null;
        isMovingBox = false;
        draggingKeypoint = false;
        multiSelectedIndexes = [];

        startX = clickX;
        startY = clickY;
        isDrawing = true;
        redraw();
    });

    canvas.addEventListener('mouseup', (e) => {
        if (isShiftSelecting && isDrawing) {
            // selection rectangle
            isDrawing = false;
            isShiftSelecting = false;

            const endX = e.offsetX;
            const endY = e.offsetY;

            const { scaleX, scaleY } = getScaleFactors();
            const x1 = Math.min(startX, endX) * scaleX;
            const y1 = Math.min(startY, endY) * scaleY;
            const x2 = Math.max(startX, endX) * scaleX;
            const y2 = Math.max(startY, endY) * scaleY;

            multiSelectedIndexes = [];
            boxes.forEach((box, i) => {
                const bx1 = box.x;
                const by1 = box.y;
                const bx2 = box.x + box.w;
                const by2 = box.y + box.h;
                const isInside = bx1 >= x1 && bx2 <= x2 && by1 >= y1 && by2 <= y2;
                if (isInside) multiSelectedIndexes.push(i);
            });

            redraw();
            return;
        }

        if (draggingKeypoint) {
            draggingKeypoint = false;
            return;
        }

        if (isMovingBox) {
            isMovingBox = false;
            return;
        }

        if (draggingHandle) {
            draggingHandle = null;
            return;
        }

        // keypoint placement click
        if (potentialKeypointPlacement && keypointPlacementBoxIndex !== -1) {
            potentialKeypointPlacement = false;

            const endX = e.offsetX;
            const endY = e.offsetY;

            const dx = Math.abs(endX - startX);
            const dy = Math.abs(endY - startY);

            // treat as click (not drag)
            if (dx <= 3 && dy <= 3) {
                const { scaleX, scaleY } = getScaleFactors();
                const px = endX * scaleX;
                const py = endY * scaleY;

                redoStack = [];
                history.push(deepClone(boxes));

                addKeypointToBox(keypointPlacementBoxIndex, px, py);
                redraw();
            }
            return;
        }

        if (!isDrawing) return;

        const endX = e.offsetX;
        const endY = e.offsetY;
        isDrawing = false;

        const labelSelector = document.getElementById('labelSelector');
        const label = labelSelector ? labelSelector.value : (boxes[selectedBoxIndex]?.label ?? '');

        const { scaleX, scaleY } = getScaleFactors();
        let x1 = startX * scaleX;
        let y1 = startY * scaleY;
        let x2 = endX * scaleX;
        let y2 = endY * scaleY;

        let boxX = Math.round(Math.min(x1, x2));
        let boxY = Math.round(Math.min(y1, y2));
        let boxW = Math.round(Math.abs(x2 - x1));
        let boxH = Math.round(Math.abs(y2 - y1));

        const newBox = {
            x: boxX,
            y: boxY,
            w: boxW,
            h: boxH,
            label: label,
            keypoints: []
        };

        // only add if big enough
        if (newBox.w >= 5 && newBox.h >= 5) {
            redoStack = [];
            history.push(deepClone(boxes));
            boxes.push(newBox);
            selectedBoxIndex = boxes.length - 1;
            selectedKeypointIndex = -1;
            redraw();
        } else {
            redraw();
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const moveX = e.offsetX;
        const moveY = e.offsetY;

        const { scaleX, scaleY } = getScaleFactors();
        const { invScaleX, invScaleY } = getInverseScaleFactors();

        // If dragging keypoint
        if (draggingKeypoint && selectedBoxIndex !== -1 && selectedKeypointIndex !== -1) {
            const dx = (moveX - lastMouseX) * scaleX;
            const dy = (moveY - lastMouseY) * scaleY;

            const box = boxes[selectedBoxIndex];
            ensureBoxKeypoints(box);
            const kp = box.keypoints[selectedKeypointIndex];
            if (kp) {
                kp.x += dx;
                kp.y += dy;
                // clamp to image bounds
                kp.x = Math.max(0, Math.min(img.naturalWidth - 1, kp.x));
                kp.y = Math.max(0, Math.min(img.naturalHeight - 1, kp.y));
                kp.v = 2;
            }

            lastMouseX = moveX;
            lastMouseY = moveY;
            redraw();
            return;
        }

        // Cursor (handle first)
        if (selectedBoxIndex !== -1) {
            const box = boxes[selectedBoxIndex];
            const handles = getHandles(box);
            const handleKeys = isFilmBox(box) ? CORNER_HANDLE_KEYS : Object.keys(handles);
            for (const key of handleKeys) {
                const { x, y } = handles[key];
                const hx = x * invScaleX;
                const hy = y * invScaleY;
                if (Math.abs(moveX - hx) < HANDLE_SIZE && Math.abs(moveY - hy) < HANDLE_SIZE) {
                    switch (key) {
                        case 'tl':
                        case 'br':
                            canvas.style.cursor = 'nwse-resize';
                            return;
                        case 'tr':
                        case 'bl':
                            canvas.style.cursor = 'nesw-resize';
                            return;
                        case 'tm':
                        case 'bm':
                            canvas.style.cursor = 'ns-resize';
                            return;
                        case 'ml':
                        case 'mr':
                            canvas.style.cursor = 'ew-resize';
                            return;
                    }
                }
            }
        }

        // keypoint hover cursor
        const kpHit = findKeypointHit(moveX, moveY);
        if (kpHit) {
            canvas.style.cursor = 'move';
            return;
        }

        // label hover cursor
        const px = moveX * scaleX;
        const py = moveY * scaleY;
        for (let i = boxes.length - 1; i >= 0; i--) {
            const box = boxes[i];
            const text = box.label ?? '';
            ctx.font = '16px Arial';
            const textWidth = ctx.measureText(text).width;
            const textHeight = 16;
            if (px >= box.x && px <= box.x + textWidth && py >= box.y - textHeight && py <= box.y) {
                canvas.style.cursor = 'pointer';
                return;
            }
        }

        // edge hover cursor
        const margin = 5;
        for (let i = boxes.length - 1; i >= 0; i--) {
            const box = boxes[i];
            if (isFilmBox(box)) continue;
            const sx = box.x * invScaleX;
            const sy = box.y * invScaleY;
            const sw = box.w * invScaleX;
            const sh = box.h * invScaleY;

            const onLeftEdge = Math.abs(moveX - sx) < margin && moveY >= sy && moveY <= sy + sh;
            const onRightEdge = Math.abs(moveX - (sx + sw)) < margin && moveY >= sy && moveY <= sy + sh;
            const onTopEdge = Math.abs(moveY - sy) < margin && moveX >= sx && moveX <= sx + sw;
            const onBottomEdge = Math.abs(moveY - (sy + sh)) < margin && moveX >= sx && moveX <= sx + sw;

            if (onLeftEdge || onRightEdge || onTopEdge || onBottomEdge) {
                canvas.style.cursor = 'pointer';
                return;
            }
        }

        canvas.style.cursor = isDrawing ? 'crosshair' : 'default';

        // resize box via handle
        if (draggingHandle && selectedBoxIndex !== -1) {
            const box = boxes[selectedBoxIndex];

            const deltaX = (moveX - lastMouseX) * scaleX;
            const deltaY = (moveY - lastMouseY) * scaleY;

            switch (draggingHandle) {
                case 'tl': box.x += deltaX; box.y += deltaY; box.w -= deltaX; box.h -= deltaY; break;
                case 'tr': box.y += deltaY; box.w += deltaX; box.h -= deltaY; break;
                case 'bl': box.x += deltaX; box.w -= deltaX; box.h += deltaY; break;
                case 'br': box.w += deltaX; box.h += deltaY; break;
                case 'tm': box.y += deltaY; box.h -= deltaY; break;
                case 'bm': box.h += deltaY; break;
                case 'ml': box.x += deltaX; box.w -= deltaX; break;
                case 'mr': box.w += deltaX; break;
            }

            if (box.w < 1) box.w = 1;
            if (box.h < 1) box.h = 1;

            lastMouseX = moveX;
            lastMouseY = moveY;
            redraw();
            return;
        }

        // move box
        if (isMovingBox && selectedBoxIndex !== -1) {
            const dx = (moveX - lastMouseX) * scaleX;
            const dy = (moveY - lastMouseY) * scaleY;

            boxes[selectedBoxIndex].x += dx;
            boxes[selectedBoxIndex].y += dy;

            lastMouseX = moveX;
            lastMouseY = moveY;
            redraw();
            return;
        }

        // drawing new box preview
        if (isDrawing) {
            redraw();
            const tempW = moveX - startX;
            const tempH = moveY - startY;
            ctx.strokeStyle = isShiftSelecting ? 'lightgreen' : '#505050';
            ctx.setLineDash([5, 3]);
            ctx.lineWidth = 1;
            ctx.strokeRect(startX, startY, tempW, tempH);
            ctx.setLineDash([]);
        }
    });

    // Rename keypoint (double click)
    canvas.addEventListener('dblclick', (e) => {
        const clickX = e.offsetX;
        const clickY = e.offsetY;

        const hit = findKeypointHit(clickX, clickY);
        if (!hit) return;

        const box = boxes[hit.boxIndex];
        ensureBoxKeypoints(box);
        const kp = box.keypoints[hit.kpIndex];
        if (!kp) return;

        const currentName = (kp.name && kp.name.trim().length > 0) ? kp.name : `P${hit.kpIndex + 1}`;
        const newName = prompt('Keypoint name', currentName);
        if (newName === null) return; // cancelled

        redoStack = [];
        history.push(deepClone(boxes));

        kp.name = newName.trim().length === 0 ? currentName : newName.trim();
        selectedBoxIndex = hit.boxIndex;
        selectedKeypointIndex = hit.kpIndex;
        redraw();
    });

    // Keyboard events
    document.addEventListener('keydown', (e) => {
        // Backspace deletes selected keypoint (safer than Delete which is used for boxes)
        if (e.key === 'Backspace') {
            if (selectedBoxIndex !== -1 && selectedKeypointIndex !== -1) {
                const box = boxes[selectedBoxIndex];
                ensureBoxKeypoints(box);
                if (box.keypoints && box.keypoints[selectedKeypointIndex]) {
                    redoStack = [];
                    history.push(deepClone(boxes));
                    box.keypoints.splice(selectedKeypointIndex, 1);
                    selectedKeypointIndex = -1;
                    redraw();
                    e.preventDefault();
                    return;
                }
            }
        }

        // Delete key: delete selected box(es)
        if (e.key === 'Delete') {
            const hasSingle = selectedBoxIndex !== -1;
            const hasMulti = multiSelectedIndexes.length > 0;
            if (hasSingle || hasMulti) {
                history.push(deepClone(boxes));
                redoStack = [];

                if (hasMulti) {
                    multiSelectedIndexes.sort((a, b) => b - a).forEach(i => boxes.splice(i, 1));
                    multiSelectedIndexes = [];
                }
                if (hasSingle) {
                    boxes.splice(selectedBoxIndex, 1);
                    selectedBoxIndex = -1;
                    selectedKeypointIndex = -1;
                }

                draggingHandle = null;
                isMovingBox = false;
                isDrawing = false;
                redraw();
                e.preventDefault();
                return;
            }
        }

        // Undo / Redo
        if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
            if (history.length > 0) {
                redoStack.push(deepClone(boxes));
                boxes = history.pop();
                selectedBoxIndex = -1;
                selectedKeypointIndex = -1;
                redraw();
            }
            e.preventDefault();
            return;
        }
        if (e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey)) {
            if (redoStack.length > 0) {
                history.push(deepClone(boxes));
                boxes = redoStack.pop();
                selectedBoxIndex = -1;
                selectedKeypointIndex = -1;
                redraw();
            }
            e.preventDefault();
            return;
        }

        // Copy / Paste
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            if (selectedBoxIndex !== -1) {
                copiedBox = deepClone(boxes[selectedBoxIndex]);
            }
            e.preventDefault();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            if (copiedBox) {
                if (!copiedBox._pasteCount) copiedBox._pasteCount = 1;
                else copiedBox._pasteCount += 1;

                const OFFSET = 10;
                const dx = OFFSET * copiedBox._pasteCount;
                const dy = OFFSET * copiedBox._pasteCount;

                const newBox = deepClone(copiedBox);
                newBox.x = copiedBox.x + dx;
                newBox.y = copiedBox.y + dy;
                if (Array.isArray(newBox.keypoints)) {
                    newBox.keypoints = newBox.keypoints.map(kp => ({
                        ...kp,
                        x: (kp.x ?? 0) + dx,
                        y: (kp.y ?? 0) + dy
                    }));
                }

                redoStack = [];
                history.push(deepClone(boxes));
                boxes.push(newBox);
                selectedBoxIndex = boxes.length - 1;
                selectedKeypointIndex = -1;
                redraw();
            }
            e.preventDefault();
            return;
        }

        // Cut
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
            if (selectedBoxIndex !== -1) {
                copiedBox = deepClone(boxes[selectedBoxIndex]);
                redoStack = [];
                history.push(deepClone(boxes));
                boxes.splice(selectedBoxIndex, 1);
                selectedBoxIndex = -1;
                selectedKeypointIndex = -1;
                redraw();
            }
            e.preventDefault();
            return;
        }

        // 'C' cycles label on selected box
        if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'c') {
            if (selectedBoxIndex !== -1) {
                const box = boxes[selectedBoxIndex];
                const labelSelector = document.getElementById('labelSelector');
                const options = labelSelector ? Array.from(labelSelector.options) : [];
                const currentIndex = options.findIndex(opt => opt.value === box.label);
                const nextIndex = options.length > 0 ? (currentIndex + 1) % options.length : -1;
                if (nextIndex >= 0) box.label = options[nextIndex].value;
                redraw();
            }
            e.preventDefault();
            return;
        }

        const isArrowKey = (
            e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
            e.key === 'ArrowUp' || e.key === 'ArrowDown'
        );

        // ✅ Arrows = move selected keypoint (when keypoint is selected)
        if (isArrowKey && !e.ctrlKey && !e.metaKey && selectedBoxIndex !== -1 && selectedKeypointIndex !== -1) {
            const moveAmount = 1;
            const box = boxes[selectedBoxIndex];
            ensureBoxKeypoints(box);
            const kp = box.keypoints?.[selectedKeypointIndex];
            if (kp) {
                redoStack = [];
                history.push(deepClone(boxes));

                switch (e.key) {
                    case 'ArrowLeft': kp.x -= moveAmount; break;
                    case 'ArrowRight': kp.x += moveAmount; break;
                    case 'ArrowUp': kp.y -= moveAmount; break;
                    case 'ArrowDown': kp.y += moveAmount; break;
                }

                // clamp to image bounds
                kp.x = Math.max(0, Math.min(img.naturalWidth - 1, kp.x));
                kp.y = Math.max(0, Math.min(img.naturalHeight - 1, kp.y));
                kp.v = 2;

                redraw();
                e.preventDefault();
                return;
            }
        }

        // Shift + arrows = resize box (only when no keypoint selected)
        if (isArrowKey && selectedBoxIndex !== -1 && selectedKeypointIndex === -1 && e.shiftKey && !e.ctrlKey && !e.metaKey) {
            const box = boxes[selectedBoxIndex];
            redoStack = [];
            history.push(deepClone(boxes));

            switch (e.key) {
                case 'ArrowRight': box.w += 1; break;
                case 'ArrowLeft': box.w = Math.max(1, box.w - 1); break;
                case 'ArrowDown': box.h += 1; break;
                case 'ArrowUp': box.h = Math.max(1, box.h - 1); break;
            }
            redraw();
            e.preventDefault();
            return;
        }

        // Arrows = move box(es) (only when no keypoint selected)
        if (isArrowKey && selectedKeypointIndex === -1 && !e.ctrlKey && !e.metaKey) {
            const moveAmount = 1;

            if (multiSelectedIndexes.length > 0) {
                history.push(deepClone(boxes));
                redoStack = [];
                multiSelectedIndexes.forEach(i => {
                    const box = boxes[i];
                    switch (e.key) {
                        case 'ArrowLeft': box.x -= moveAmount; break;
                        case 'ArrowRight': box.x += moveAmount; break;
                        case 'ArrowUp': box.y -= moveAmount; break;
                        case 'ArrowDown': box.y += moveAmount; break;
                    }
                    if (box.x < 0) box.x = 0;
                    if (box.y < 0) box.y = 0;
                });
                redraw();
                e.preventDefault();
                return;
            }

            if (selectedBoxIndex !== -1) {
                const box = boxes[selectedBoxIndex];
                history.push(deepClone(boxes));
                redoStack = [];

                switch (e.key) {
                    case 'ArrowLeft': box.x -= moveAmount; break;
                    case 'ArrowRight': box.x += moveAmount; break;
                    case 'ArrowUp': box.y -= moveAmount; break;
                    case 'ArrowDown': box.y += moveAmount; break;
                }

                if (box.x < 0) box.x = 0;
                if (box.y < 0) box.y = 0;

                redraw();
                e.preventDefault();
                return;
            }
        }
    });

    // Public helpers for Blazor buttons
    window.clearBoxesKP = () => {
        boxes = [];
        selectedBoxIndex = -1;
        selectedKeypointIndex = -1;
        multiSelectedIndexes = [];
        redraw();
    };

    window.saveLabelDataKP = () => {
        const cleanBoxes = boxes.map(box => {
            ensureBoxKeypoints(box);
            return {
                x: parseFloat(Number(box.x).toFixed(2)),
                y: parseFloat(Number(box.y).toFixed(2)),
                w: parseFloat(Number(box.w).toFixed(2)),
                h: parseFloat(Number(box.h).toFixed(2)),
                label: box.label,
                keypoints: (box.keypoints || []).map((kp, idx) => ({
                    x: parseFloat(Number(kp.x).toFixed(2)),
                    y: parseFloat(Number(kp.y).toFixed(2)),
                    v: (kp.v === undefined || kp.v === null) ? 2 : kp.v,
                    name: (kp.name && kp.name.trim().length > 0) ? kp.name.trim() : `P${idx + 1}`
                }))
            };
        });

        const json = JSON.stringify(cleanBoxes);
        window.dotNetHelperKP.invokeMethodAsync('SaveLabelWrapperKP', json);
    };

    window.applyLabelToSelectedBoxKP = () => {
        const labelSelector = document.getElementById('labelSelector');
        const selectedLabel = labelSelector ? labelSelector.value : '';

        if (selectedBoxIndex === -1 && multiSelectedIndexes.length === 0) {
            console.log('No box selected.');
            return;
        }

        history.push(deepClone(boxes));
        redoStack = [];

        if (selectedBoxIndex !== -1) {
            boxes[selectedBoxIndex].label = selectedLabel;
        }
        if (multiSelectedIndexes.length > 0) {
            multiSelectedIndexes.forEach(i => boxes[i].label = selectedLabel);
        }
        redraw();
    };

    // initial draw
    redraw();
};
