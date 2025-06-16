window.initLabelingCanvas = (dotNetHelper, labelJson) => {
    window.dotNetHelper = dotNetHelper;

    let boxes = []; 
    let history = [];           // ✅ 박스 상태 히스토리 저장
    let selectedBoxIndex = -1; // ✅ 선택된 박스 인덱스
    let draggingHandle = null;
    let startX, startY, isDrawing = false;
    let lastMouseX = null;
    let lastMouseY = null;

    const HANDLE_SIZE = 8;
    const canvas = document.getElementById('labelCanvas');
    const img = document.getElementById('targetImage');
    const ctx = canvas.getContext('2d');

    const getScaleFactors = () => ({
        scaleX: img.naturalWidth / canvas.clientWidth,
        scaleY: img.naturalHeight / canvas.clientHeight
    });

    if (labelJson) {
        try {
            const parsed = JSON.parse(labelJson);
            boxes = Array.isArray(parsed) ? parsed : [];
        } catch {
            boxes = [];
        }
    }

    const resizeCanvas = () => {
        canvas.width = img.clientWidth;
        canvas.height = img.clientHeight;
        console.log(`[hhchoi] Canvas: ${canvas.width}x${canvas.height}, Image: ${img.naturalWidth}x${img.naturalHeight}`);
        redraw();
    };

    img.onload = resizeCanvas;
    if (img.complete && img.naturalWidth > 0) {
        resizeCanvas();
    }
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('mousedown', (e) => {
        const clickX = e.offsetX;
        const clickY = e.offsetY;

        const invX = img.naturalWidth / canvas.clientWidth;
        const invY = img.naturalHeight / canvas.clientHeight;
        const px = clickX * invX;
        const py = clickY * invY;

        selectedBoxIndex = -1;
        draggingHandle = null;

        for (let i = boxes.length - 1; i >= 0; i--) {
            const box = boxes[i];
            const handles = getHandles(box);

            // ✅ 1. 핸들 클릭 (모서리 핸들)
            for (const [key, { x, y }] of Object.entries(handles)) {
                const dx = clickX - (x * canvas.clientWidth / img.naturalWidth);
                const dy = clickY - (y * canvas.clientHeight / img.naturalHeight);
                if (Math.abs(dx) < HANDLE_SIZE && Math.abs(dy) < HANDLE_SIZE) {
                    selectedBoxIndex = i;
                    draggingHandle = key;

                    // ✅ 마우스 현재 좌표 저장 (정밀한 이동 계산용)
                    lastMouseX = e.offsetX;
                    lastMouseY = e.offsetY;
                    redraw();  // ✅ 선택되면 redraw
                    return;
                }
            }

            // ✅ 2. 박스 테두리 선 클릭
            const sx = box.x * canvas.clientWidth / img.naturalWidth;
            const sy = box.y * canvas.clientHeight / img.naturalHeight;
            const sw = box.w * canvas.clientWidth / img.naturalWidth;
            const sh = box.h * canvas.clientHeight / img.naturalHeight;

            const margin = 5;

            const onLeftEdge = Math.abs(clickX - sx) < margin && clickY >= sy && clickY <= sy + sh;
            const onRightEdge = Math.abs(clickX - (sx + sw)) < margin && clickY >= sy && clickY <= sy + sh;
            const onTopEdge = Math.abs(clickY - sy) < margin && clickX >= sx && clickX <= sx + sw;
            const onBottomEdge = Math.abs(clickY - (sy + sh)) < margin && clickX >= sx && clickX <= sx + sw;

            if (onLeftEdge || onRightEdge || onTopEdge || onBottomEdge) {
                selectedBoxIndex = i;
                redraw();
                return;
            }

            // ✅ 3. 라벨 텍스트 클릭 시 라벨 변경만
            const textWidth = ctx.measureText(box.label).width;
            const textHeight = 16;
            if (px >= box.x && px <= box.x + textWidth &&
                py >= box.y - textHeight && py <= box.y) {
                const labelSelector = document.getElementById('labelSelector');
                const options = Array.from(labelSelector.options);
                const currentIndex = options.findIndex(opt => opt.value === box.label);
                const nextIndex = (currentIndex + 1) % options.length;
                box.label = options[nextIndex].value;
                redraw();
                return;
            }
        }

        selectedBoxIndex = -1;
        startX = clickX;
        startY = clickY;
        isDrawing = true;
        redraw();
    });

    canvas.addEventListener('mouseup', (e) => {
        if (draggingHandle) {
            draggingHandle = null;
            return;
        }

        if (!isDrawing) return;
        const endX = e.offsetX;
        const endY = e.offsetY;
        isDrawing = false;

        const label = document.getElementById('labelSelector').value;
        const { scaleX, scaleY } = getScaleFactors();

        let x1 = startX * scaleX;
        let y1 = startY * scaleY;
        let x2 = endX * scaleX;
        let y2 = endY * scaleY;

        let boxX = Math.round(Math.min(x1, x2));
        let boxY = Math.round(Math.min(y1, y2));
        let boxW = Math.round(Math.abs(x2 - x1));
        let boxH = Math.round(Math.abs(y2 - y1));

        const correctedBox = {
            x: boxX,
            y: boxY,
            w: boxW,
            h: boxH,
            label
        };

        // ✅ w와 h가 0 이상일 때만 박스 추가
        if (correctedBox.w !== 0 && correctedBox.h !== 0) {
            history.push(JSON.parse(JSON.stringify(boxes)));
            boxes.push(correctedBox);
            selectedBoxIndex = boxes.length - 1;
            redraw();
        }
    });


    canvas.addEventListener('mousemove', (e) => {
        const moveX = e.offsetX;
        const moveY = e.offsetY;

        const invX = img.naturalWidth / canvas.clientWidth;
        const invY = img.naturalHeight / canvas.clientHeight;
        const px = moveX * invX;
        const py = moveY * invY;

        // ✅ 1. 핸들 위에 있는지 먼저 확인 (우선 적용)
        let hoveredHandle = null;
        if (selectedBoxIndex !== -1) {
            const box = boxes[selectedBoxIndex];
            const handles = getHandles(box);
            for (const [key, { x, y }] of Object.entries(handles)) {
                const hx = x * canvas.clientWidth / img.naturalWidth;
                const hy = y * canvas.clientHeight / img.naturalHeight;
                if (Math.abs(moveX - hx) < HANDLE_SIZE && Math.abs(moveY - hy) < HANDLE_SIZE) {
                    hoveredHandle = key;

                    // 커서 설정 후 즉시 return
                    switch (hoveredHandle) {
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

        // ✅ 2. 라벨 텍스트 위에 있는지 확인
        for (let i = boxes.length - 1; i >= 0; i--) {
            const box = boxes[i];
            const textWidth = ctx.measureText(box.label).width;
            const textHeight = 16;

            if (px >= box.x && px <= box.x + textWidth &&
                py >= box.y - textHeight && py <= box.y) {
                canvas.style.cursor = 'pointer';
                return;
            }
        }

        // ✅ 3. 박스 테두리 선 위에 있는지 확인
        const margin = 5;
        for (let i = boxes.length - 1; i >= 0; i--) {
            const box = boxes[i];
            const sx = box.x * canvas.clientWidth / img.naturalWidth;
            const sy = box.y * canvas.clientHeight / img.naturalHeight;
            const sw = box.w * canvas.clientWidth / img.naturalWidth;
            const sh = box.h * canvas.clientHeight / img.naturalHeight;

            const onLeftEdge = Math.abs(moveX - sx) < margin && moveY >= sy && moveY <= sy + sh;
            const onRightEdge = Math.abs(moveX - (sx + sw)) < margin && moveY >= sy && moveY <= sy + sh;
            const onTopEdge = Math.abs(moveY - sy) < margin && moveX >= sx && moveX <= sx + sw;
            const onBottomEdge = Math.abs(moveY - (sy + sh)) < margin && moveX >= sx && moveX <= sx + sw;

            if (onLeftEdge || onRightEdge || onTopEdge || onBottomEdge) {
                canvas.style.cursor = 'pointer';
                return;
            }
        }

        // ✅ 4. 기본 커서
        canvas.style.cursor = isDrawing ? 'crosshair' : 'default';

        // ✅ 박스 핸들 드래그 중일 때
        if (draggingHandle && selectedBoxIndex !== -1) {
            const { scaleX, scaleY } = getScaleFactors();
            const box = boxes[selectedBoxIndex];

            // 마우스 이동량만큼만 반영
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

            // 최소 크기 제어
            if (box.w < 1) box.w = 1;
            if (box.h < 1) box.h = 1;

            lastMouseX = moveX;
            lastMouseY = moveY;

            redraw();
        } else if (isDrawing) {
            redraw();
            const tempW = moveX - startX;
            const tempH = moveY - startY;
            ctx.strokeStyle = 'yellow';
            ctx.setLineDash([5, 3]);
            ctx.lineWidth = 1;
            ctx.strokeRect(startX, startY, tempW, tempH);
            ctx.setLineDash([]);
        }
    });


    // ✅ Delete 키 이벤트 등록
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' && selectedBoxIndex !== -1) {
            boxes.splice(selectedBoxIndex, 1);
            selectedBoxIndex = -1;
            redraw();
        }

        if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
            // Ctrl+Z 또는 Cmd+Z
            if (history.length > 0) {
                boxes = history.pop(); // 마지막 상태 복원
                selectedBoxIndex = -1;
                redraw();
            }
            e.preventDefault(); // 브라우저 기본 동작 방지
        }
    });

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



    function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const inverseScaleX = canvas.clientWidth / img.naturalWidth;
        const inverseScaleY = canvas.clientHeight / img.naturalHeight;

        boxes.forEach((box, i) => {
            const drawX = box.x * inverseScaleX;
            const drawY = box.y * inverseScaleY;
            const drawW = box.w * inverseScaleX;
            const drawH = box.h * inverseScaleY;

            ctx.strokeStyle = getColorForLabel(box.label);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(drawX, drawY, drawW, drawH);
            ctx.fillStyle = ctx.strokeStyle;
            ctx.font = '16px Arial';
            ctx.fillText(box.label, drawX + 2, drawY - 4);

            // ✅ 선택된 박스 강조
            if (i === selectedBoxIndex) {
                const handles = getHandles(box);
                for (const { x, y } of Object.values(handles)) {
                    const hx = x * inverseScaleX;
                    const hy = y * inverseScaleY;
                    ctx.fillStyle = 'cyan';
                    ctx.fillRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
                }
            }
        });
    }

    window.clearBoxes = () => {
        boxes = [];
        selectedBoxIndex = -1;
        redraw();
    };

    window.saveLabelData = () => {
        const cleanBoxes = boxes.map(box => ({
            x: parseFloat(box.x.toFixed(2)),
            y: parseFloat(box.y.toFixed(2)),
            w: parseFloat(box.w.toFixed(2)),
            h: parseFloat(box.h.toFixed(2)),
            label: box.label
        }));

        const json = JSON.stringify(cleanBoxes);
        window.dotNetHelper.invokeMethodAsync('SaveLabelWrapper', json);
    };

    function getColorForLabel(label) {
        const colors = ['red', 'green', 'blue', 'orange', 'purple'];
        const index = Array.from(document.getElementById('labelSelector').options)
            .findIndex(opt => opt.value === label);
        return colors[index % colors.length];
    }
};
