window.initLabelingCanvas = (dotNetHelper, labelJson) => {
    window.dotNetHelper = dotNetHelper;

    let boxes = []; 
    let history = [];           // ✅ 박스 상태 히스토리 저장
    let selectedBoxIndex = -1; // ✅ 선택된 박스 인덱스
    let draggingHandle = null;
    let startX, startY, isDrawing = false;

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
            for (const [key, { x, y }] of Object.entries(handles)) {
                const dx = clickX - (x * canvas.clientWidth / img.naturalWidth);
                const dy = clickY - (y * canvas.clientHeight / img.naturalHeight);
                if (Math.abs(dx) < HANDLE_SIZE && Math.abs(dy) < HANDLE_SIZE) {
                    selectedBoxIndex = i;
                    draggingHandle = key;
                    return;
                }
            }

            const textWidth = ctx.measureText(box.label).width;
            const textHeight = 16; // 기본 폰트 크기
            if (px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h) {
                selectedBoxIndex = i;
                redraw();
                return;
            }
            else if (px >= box.x && px <= box.x + textWidth && py >= box.y - textHeight && py <= box.y) {
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

        const correctedBox = {
            x: Math.round(startX * scaleX),
            y: Math.round(startY * scaleY),
            w: Math.round((endX - startX) * scaleX),
            h: Math.round((endY - startY) * scaleY),
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

    const round6 = (v) => parseFloat(v.toFixed(6));

    canvas.addEventListener('mousemove', (e) => {
        const moveX = e.offsetX;
        const moveY = e.offsetY;

        const invX = img.naturalWidth / canvas.clientWidth;
        const invY = img.naturalHeight / canvas.clientHeight;
        const px = moveX * invX;
        const py = moveY * invY;

        // ✅ 1. 라벨 텍스트 영역 위에 있는지 모든 박스에 대해 확인
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

        // ✅ 2. 핸들 위에 있는지 확인하고 커서 변경
        let hoveredHandle = null;
        if (selectedBoxIndex !== -1) {
            const box = boxes[selectedBoxIndex];
            const handles = getHandles(box);
            for (const [key, { x, y }] of Object.entries(handles)) {
                const hx = x * canvas.clientWidth / img.naturalWidth;
                const hy = y * canvas.clientHeight / img.naturalHeight;
                if (Math.abs(moveX - hx) < HANDLE_SIZE && Math.abs(moveY - hy) < HANDLE_SIZE) {
                    hoveredHandle = key;
                    break;
                }
            }
        }

        // ✅ 커서 모양 지정
        switch (hoveredHandle) {
            case 'tl':
            case 'br':
                canvas.style.cursor = 'nwse-resize';
                break;
            case 'tr':
            case 'bl':
                canvas.style.cursor = 'nesw-resize';
                break;
            case 'tm':
            case 'bm':
                canvas.style.cursor = 'ns-resize';
                break;
            case 'ml':
            case 'mr':
                canvas.style.cursor = 'ew-resize';
                break;
            default:
                canvas.style.cursor = isDrawing ? 'crosshair' : 'default';
                break;
        }


        if (draggingHandle && selectedBoxIndex !== -1) {
            const { scaleX, scaleY } = getScaleFactors();
            const box = boxes[selectedBoxIndex];
            const newX = moveX * scaleX;
            const newY = moveY * scaleY;

            switch (draggingHandle) {
                case 'tl': box.w += box.x - newX; box.h += box.y - newY; box.x = newX; box.y = newY; break;
                case 'tr': box.w = newX - box.x; box.h += box.y - newY; box.y = newY; break;
                case 'bl': box.w += box.x - newX; box.x = newX; box.h = newY - box.y; break;
                case 'br': box.w = newX - box.x; box.h = newY - box.y; break;
                case 'tm': box.h += box.y - newY; box.y = newY; break;
                case 'bm': box.h = newY - box.y; break;
                case 'ml': box.w += box.x - newX; box.x = newX; break;
                case 'mr': box.w = newX - box.x; break;
            }
            box.x = round6(box.x);
            box.y = round6(box.y);
            box.w = round6(box.w);
            box.h = round6(box.h);
            redraw();
        } else if (isDrawing) {
            redraw();
            const tempW = moveX - startX;
            const tempH = moveY - startY;
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
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
        const json = JSON.stringify(boxes);
        window.dotNetHelper.invokeMethodAsync('SaveLabelWrapper', json);
    };

    function getColorForLabel(label) {
        const colors = ['red', 'green', 'blue', 'orange', 'purple'];
        const index = Array.from(document.getElementById('labelSelector').options)
            .findIndex(opt => opt.value === label);
        return colors[index % colors.length];
    }
};
