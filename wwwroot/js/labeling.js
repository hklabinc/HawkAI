window.initLabelingCanvas = (dotNetHelper, labelJson) => {
    window.dotNetHelper = dotNetHelper;

    let boxes = []; 
    let history = [];           // ✅ 박스 상태 히스토리 저장
    let redoStack = [];         // ✅ 복원할 미래 상태를 저장
    let multiSelectedIndexes = [];  // ✅ Shift+드래그로 선택된 박스 인덱스들
    let selectedBoxIndex = -1;  // ✅ 선택된 박스 인덱스
    let draggingHandle = null;
    let startX, startY, isDrawing = false;
    let isShiftSelecting = false; 
    let lastMouseX = null;
    let lastMouseY = null;
    let isMovingBox = false;
    let copiedBox = null;

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

        if (e.shiftKey) {
            startX = clickX;
            startY = clickY;
            isDrawing = true;
            isShiftSelecting = true;
            multiSelectedIndexes = [];
            redraw();
            return;
        }

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

                    // ✅ 상태 저장 (히스토리)
                    redoStack = [];
                    history.push(JSON.parse(JSON.stringify(boxes)));

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

                // ✅ 박스 이동 시작 - 상태 저장
                redoStack = [];
                history.push(JSON.parse(JSON.stringify(boxes)));

                isMovingBox = true;
                lastMouseX = e.offsetX;
                lastMouseY = e.offsetY;
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
        if (isShiftSelecting && isDrawing) {
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
            return;  // ✅ 박스 추가 로직 실행 안 함
        }

        if (isMovingBox) {
            isMovingBox = false;
            return;
        }

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
            redoStack = [];  // ⬅️ redo 비움
            history.push(JSON.parse(JSON.stringify(boxes)));
            boxes.push(correctedBox);
            selectedBoxIndex = boxes.length - 1;
            redraw();
        }

        if (e.shiftKey && isDrawing) {
            isDrawing = false;

            const endX = e.offsetX;
            const endY = e.offsetY;

            const { scaleX, scaleY } = getScaleFactors();

            let x1 = Math.min(startX, endX) * scaleX;
            let y1 = Math.min(startY, endY) * scaleY;
            let x2 = Math.max(startX, endX) * scaleX;
            let y2 = Math.max(startY, endY) * scaleY;

            multiSelectedIndexes = [];

            boxes.forEach((box, i) => {
                const bx1 = box.x;
                const by1 = box.y;
                const bx2 = box.x + box.w;
                const by2 = box.y + box.h;

                const isInside = bx1 >= x1 && bx2 <= x2 && by1 >= y1 && by2 <= y2;

                if (isInside) {
                    multiSelectedIndexes.push(i);
                }
            });

            redraw();
            return;
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
            ctx.strokeStyle = isShiftSelecting ? 'lightgreen' : '#505050';  // ✅ 선택 시 연녹색
            ctx.setLineDash([5, 3]);
            ctx.lineWidth = 1;
            ctx.strokeRect(startX, startY, tempW, tempH);
            ctx.setLineDash([]);
        }
        // ✅ 박스 이동 중일 때
        else if (isMovingBox && selectedBoxIndex !== -1) {
            const { scaleX, scaleY } = getScaleFactors();
            const deltaX = (moveX - lastMouseX) * scaleX;
            const deltaY = (moveY - lastMouseY) * scaleY;

            boxes[selectedBoxIndex].x += deltaX;
            boxes[selectedBoxIndex].y += deltaY;

            lastMouseX = moveX;
            lastMouseY = moveY;

            redraw();
        }
    });


    // ✅ Delete 키 이벤트 등록
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' && selectedBoxIndex !== -1) {
            redoStack = [];
            history.push(JSON.parse(JSON.stringify(boxes)));
            boxes.splice(selectedBoxIndex, 1);
            selectedBoxIndex = -1;
            draggingHandle = null;
            isMovingBox = false;
            isDrawing = false;
            redraw();
            e.preventDefault();
        }

        if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
            if (history.length > 0) {
                redoStack.push(JSON.parse(JSON.stringify(boxes)));  // 👉 현재 상태를 redo로 저장
                boxes = history.pop();  // 이전 상태 복원
                selectedBoxIndex = -1;
                redraw();
            }
            e.preventDefault();
        }

        if (e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey)) {
            if (redoStack.length > 0) {
                history.push(JSON.parse(JSON.stringify(boxes)));  // 👉 현재 상태를 다시 undo로 저장
                boxes = redoStack.pop();  // 👉 redo 스택에서 복원
                selectedBoxIndex = -1;
                redraw();
            }
            e.preventDefault();
        }

        // ✅ Ctrl+C 또는 Cmd+C (복사)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            if (selectedBoxIndex !== -1) {
                copiedBox = JSON.parse(JSON.stringify(boxes[selectedBoxIndex]));                
            }
            e.preventDefault(); // 브라우저 기본 복사 방지
        }

        // ✅ Ctrl+V 또는 Cmd+V (붙여넣기)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            if (copiedBox) {
                if (!copiedBox._pasteCount) copiedBox._pasteCount = 1;
                else copiedBox._pasteCount += 1;

                const OFFSET = 10;
                const newBox = {
                    ...copiedBox,
                    x: copiedBox.x + OFFSET * copiedBox._pasteCount,
                    y: copiedBox.y + OFFSET * copiedBox._pasteCount
                };

                redoStack = [];
                history.push(JSON.parse(JSON.stringify(boxes)));
                boxes.push(newBox);
                selectedBoxIndex = boxes.length - 1;
                redraw();
            }
            e.preventDefault();
        }

        // ✅ Ctrl+X 또는 Cmd+X (잘라내기)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
            if (selectedBoxIndex !== -1) {
                copiedBox = JSON.parse(JSON.stringify(boxes[selectedBoxIndex]));
                redoStack = [];
                history.push(JSON.parse(JSON.stringify(boxes)));
                boxes.splice(selectedBoxIndex, 1);
                selectedBoxIndex = -1;
                redraw();
            }
            e.preventDefault();
        }

        // ✅ C 키만 눌렀을 때 라벨 순환
        if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'c') {
            if (selectedBoxIndex !== -1) {
                const box = boxes[selectedBoxIndex];
                const labelSelector = document.getElementById('labelSelector');
                const options = Array.from(labelSelector.options);
                const currentIndex = options.findIndex(opt => opt.value === box.label);
                const nextIndex = (currentIndex + 1) % options.length;
                box.label = options[nextIndex].value;
                redraw();
            }
            e.preventDefault();  // 기본 동작 방지
        }

        // ✅ Shift + 방향키로 크기 조절
        if (selectedBoxIndex !== -1 && e.shiftKey && !e.ctrlKey && !e.metaKey) {
            const box = boxes[selectedBoxIndex];
            redoStack = [];
            history.push(JSON.parse(JSON.stringify(boxes)));

            switch (e.key) {
                case 'ArrowRight':
                    box.w += 1; break;
                case 'ArrowLeft':
                    box.w = Math.max(1, box.w - 1); break;
                case 'ArrowDown':
                    box.h += 1; break;
                case 'ArrowUp':
                    box.h = Math.max(1, box.h - 1); break;
            }

            redraw();
            e.preventDefault();
            return;
        }

        // ✅ 방향키로 박스 이동
        if (!e.ctrlKey && !e.metaKey) {
            const moveAmount = 1;

            // ✅ 다중 선택이 있는 경우
            if (multiSelectedIndexes.length > 0) {
                history.push(JSON.parse(JSON.stringify(boxes)));
                redoStack = [];

                multiSelectedIndexes.forEach(i => {
                    const box = boxes[i];
                    switch (e.key) {
                        case 'ArrowLeft': box.x -= moveAmount; break;
                        case 'ArrowRight': box.x += moveAmount; break;
                        case 'ArrowUp': box.y -= moveAmount; break;
                        case 'ArrowDown': box.y += moveAmount; break;
                    }

                    // 경계 조건 처리
                    if (box.x < 0) box.x = 0;
                    if (box.y < 0) box.y = 0;
                });

                redraw();
                e.preventDefault();
                return;
            }

            // ✅ 단일 선택일 경우
            if (selectedBoxIndex !== -1) {
                const box = boxes[selectedBoxIndex];
                history.push(JSON.parse(JSON.stringify(boxes)));
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
            }
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

            ctx.strokeStyle = (i === selectedBoxIndex) ? '#505050' : getColorForLabel(box.label);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(drawX, drawY, drawW, drawH);
            ctx.fillStyle = getColorForLabel(box.label);  // 라벨 색상은 항상 원래 색
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
            else if (multiSelectedIndexes.includes(i)) {
                const handles = getHandles(box);
                for (const { x, y } of Object.values(handles)) {
                    const hx = x * inverseScaleX;
                    const hy = y * inverseScaleY;
                    ctx.fillStyle = 'lightgreen';  // ✅ 다중 선택 박스는 연녹색 핸들
                    ctx.fillRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
                }
            }
        });
    }

    window.clearBoxes = () => {
        boxes = [];
        selectedBoxIndex = -1;
        multiSelectedIndexes = [];
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

    window.applyLabelToSelectedBox = () => {
        const labelSelector = document.getElementById('labelSelector');
        const selectedLabel = labelSelector.value;

        if (selectedBoxIndex === -1 && multiSelectedIndexes.length === 0) {
            console.log("No box selected. Skipping label apply.");
            return;
        }

        history.push(JSON.parse(JSON.stringify(boxes)));
        redoStack = [];

        if (selectedBoxIndex !== -1) {
            boxes[selectedBoxIndex].label = selectedLabel;
        }
        if (multiSelectedIndexes.length > 0) {
            multiSelectedIndexes.forEach(i => boxes[i].label = selectedLabel);
        }

        redraw();
    };


    function getColorForLabel(label) {
        const colors = ['blue', 'green', 'red', 'orange', 'purple'];
        const index = Array.from(document.getElementById('labelSelector').options)
            .findIndex(opt => opt.value === label);
        return colors[index % colors.length];
    }
};
