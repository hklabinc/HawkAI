/* airuler.js - ROI/Measure JSON editor (web) */

window.airuler = (() => {
    const S = {
        modelName: "",
        serverModels: [],
        serverImages: [],
        currentImageUrl: "",
        img: null,
        imgW: 0,
        imgH: 0,

        // ROI: {id, x, y, w, h, method, parameter}
        rois: [],
        selectedRoiId: null,

        // measure: id -> {start, end, direction, gt, margin}
        measures: {},
        selectedMeasureId: null,

        // drawing state
        isDrawing: false,
        drawStart: { x: 0, y: 0 },
        drawEnd: { x: 0, y: 0 },

        // zoom/pan
        zoom: 1.0,
        panX: 0.0,
        panY: 0.0,

        // clipboard
        clipboard: null, // {rect:{x,y,w,h}, method, parameter}

        // canvas
        canvas: null,
        ctx: null,
        rafPending: false,
    };

    // ---------- DOM helpers ----------
    const $ = (id) => document.getElementById(id);

    function log(msg) {
        const ta = $("airulerStatusLog");
        if (!ta) return;
        ta.value += (ta.value ? "\n" : "") + msg;
        ta.scrollTop = ta.scrollHeight;
    }

    function setHover(text) {
        const el = $("airulerHoverLabel");
        if (el) el.textContent = text || "";
    }

    function escapeHtml(s) {
        return String(s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    // ---------- server APIs ----------
    async function apiGet(url) {
        const r = await fetch(url, { method: "GET" });
        if (!r.ok) throw new Error(await r.text());
        return await r.json();
    }

    async function apiPost(url, bodyObj) {
        const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyObj),
        });
        if (!r.ok) throw new Error(await r.text());
        return await r.json();
    }

    async function refreshModels() {
        try {
            S.serverModels = await apiGet("/api/airuler/models");
            const sel = $("airulerModelSelect");
            if (!sel) return;

            sel.innerHTML = `<option value="">(모델 선택)</option>` +
                S.serverModels.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

            await refreshJsonFilesList();
        } catch (e) {
            log(`[ERR] 모델 목록 로드 실패: ${e.message}`);
        }
    }

    async function createModel(nameRaw) {
        const name = (nameRaw || "").trim();
        if (!name) {
            alert("모델명을 입력하세요.");
            return;
        }
        try {
            const res = await apiPost("/api/airuler/models", { modelName: name });
            log(`모델 생성/확인: ${res.modelName}`);
            await refreshModels();
            selectModel(res.modelName);
        } catch (e) {
            log(`[ERR] 모델 생성 실패: ${e.message}`);
            alert(e.message);
        }
    }

    async function selectModel(modelName) {
        S.modelName = modelName || "";
        $("airulerCurrentModel").textContent = S.modelName ? S.modelName : "(없음)";

        // 다운로드 링크 표시
        const link = $("airulerCurrentJsonLink");
        if (link && S.modelName) {
            link.href = `/airuler/models/${encodeURIComponent(S.modelName)}.json`;
            link.textContent = `/airuler/models/${S.modelName}.json`;
        } else if (link) {
            link.href = "#";
            link.textContent = "";
        }

        // 이미지 목록 로드
        await refreshImages();

        // 서버 JSON이 있으면 “불러오기” 버튼 활성화
        $("airulerBtnLoadServerJson").disabled = !S.modelName;
    }

    async function refreshImages() {
        S.serverImages = [];
        const list = $("airulerImageList");
        if (list) list.innerHTML = "";

        if (!S.modelName) return;

        try {
            S.serverImages = await apiGet(`/api/airuler/images/${encodeURIComponent(S.modelName)}`);
            if (!list) return;

            if (S.serverImages.length === 0) {
                list.innerHTML = `<div class="text-muted">이미지가 없습니다. 업로드하세요.</div>`;
                return;
            }

            list.innerHTML = S.serverImages.map((it, idx) => {
                const fn = it.fileName || "";
                const url = it.url || "";
                return `
          <button type="button" class="airuler-img-item" data-url="${escapeHtml(url)}" title="${escapeHtml(fn)}">
            ${escapeHtml(fn)}
          </button>`;
            }).join("");

            // click bind
            list.querySelectorAll(".airuler-img-item").forEach(btn => {
                btn.addEventListener("click", () => {
                    const url = btn.getAttribute("data-url");
                    loadImageFromUrl(url);
                });
            });

        } catch (e) {
            log(`[ERR] 이미지 목록 로드 실패: ${e.message}`);
        }
    }

    async function uploadImagesToServer(fileList) {
        if (!S.modelName) {
            alert("먼저 모델을 선택/생성하세요.");
            return;
        }
        if (!fileList || fileList.length === 0) {
            alert("업로드할 이미지를 선택하세요.");
            return;
        }

        const fd = new FormData();
        fd.append("modelName", S.modelName);
        for (const f of fileList) fd.append("files", f);

        try {
            const r = await fetch("/api/airuler/upload-images", { method: "POST", body: fd });
            if (!r.ok) throw new Error(await r.text());
            const res = await r.json();
            log(`이미지 업로드 완료: model=${res.modelName}, saved=${res.saved}`);
            $("airulerUploadInput").value = "";
            await refreshImages();
        } catch (e) {
            log(`[ERR] 이미지 업로드 실패: ${e.message}`);
            alert(e.message);
        }
    }

    async function loadServerJson() {
        if (!S.modelName) return;
        if (!S.img) {
            alert("먼저 이미지를 불러오세요. (python 버전과 동일: JSON 불러오기 전에 이미지 필요)");
            return;
        }
        try {
            const res = await apiGet(`/api/airuler/json/${encodeURIComponent(S.modelName)}`);
            applyJsonText(res.json);
            log(`서버 JSON 불러오기: ${S.modelName}.json`);
        } catch (e) {
            log(`[WARN] 서버 JSON 없음/불러오기 실패: ${e.message}`);
            alert("서버에 저장된 JSON이 없거나 읽기 실패했습니다.");
        }
    }

    async function refreshJsonFilesList() {
        const box = $("airulerSavedJsonList");
        if (!box) return;

        try {
            const list = await apiGet("/api/airuler/json-files");
            if (!list || list.length === 0) {
                box.innerHTML = `<div class="text-muted">저장된 JSON이 없습니다.</div>`;
                return;
            }

            box.innerHTML = list.map(it => {
                const fn = it.fileName;
                const url = it.url;
                return `<div><a href="${escapeHtml(url)}" target="_blank" download>${escapeHtml(fn)}</a></div>`;
            }).join("");
        } catch (e) {
            box.innerHTML = `<div class="text-danger">JSON 목록 로드 실패: ${escapeHtml(e.message)}</div>`;
        }
    }

    // ---------- canvas + geometry ----------
    function ensureCanvasSize() {
        const c = S.canvas;
        const host = $("airulerCanvasHost");
        if (!c || !host) return;

        // devicePixelRatio 대응
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(300, host.clientWidth);
        const h = Math.max(300, host.clientHeight);

        c.style.width = w + "px";
        c.style.height = h + "px";
        c.width = Math.floor(w * dpr);
        c.height = Math.floor(h * dpr);

        S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        requestRedraw();
    }

    function getTransform() {
        if (!S.img || S.imgW <= 0 || S.imgH <= 0) {
            return { scale: 1.0, ox: 0.0, oy: 0.0 };
        }
        const c = S.canvas;
        const host = $("airulerCanvasHost");
        const cw = host.clientWidth;
        const ch = host.clientHeight;

        const base = Math.min(cw / S.imgW, ch / S.imgH);
        const scale = base * S.zoom;

        const dispW = S.imgW * scale;
        const dispH = S.imgH * scale;

        const baseOx = (cw - dispW) / 2;
        const baseOy = (ch - dispH) / 2;

        const ox = baseOx + S.panX;
        const oy = baseOy + S.panY;

        return { scale, ox, oy };
    }

    function canvasToImage(pt) {
        const { scale, ox, oy } = getTransform();
        return {
            x: (pt.x - ox) / scale,
            y: (pt.y - oy) / scale,
        };
    }

    function imageRectToCanvasRect(r) {
        const { scale, ox, oy } = getTransform();
        return {
            x: ox + r.x * scale,
            y: oy + r.y * scale,
            w: r.w * scale,
            h: r.h * scale,
        };
    }

    function clampRoiToImage(roi) {
        if (!S.img) return;
        roi.x = Math.max(0, Math.min(roi.x, S.imgW - 1));
        roi.y = Math.max(0, Math.min(roi.y, S.imgH - 1));
        roi.w = Math.max(1, Math.min(roi.w, S.imgW - roi.x));
        roi.h = Math.max(1, Math.min(roi.h, S.imgH - roi.y));
    }

    function suggestNextRoiId(excludeId = null) {
        const ids = new Set();
        for (const r of S.rois) {
            if (excludeId != null && r.id === excludeId) continue;
            ids.add(r.id);
        }
        if (ids.size === 0) return 1;
        return Math.max(...Array.from(ids)) + 1;
    }

    function getRoiById(id) {
        return S.rois.find(r => r.id === id) || null;
    }

    function getRoiAtImagePoint(ix, iy) {
        for (let i = S.rois.length - 1; i >= 0; i--) {
            const r = S.rois[i];
            if (ix >= r.x && ix <= r.x + r.w && iy >= r.y && iy <= r.y + r.h) return r;
        }
        return null;
    }

    function parseRoiNameToId(name) {
        if (typeof name !== "string") return null;
        const t = name.trim();
        if (t.startsWith("roi_")) {
            const n = parseInt(t.split("_")[1], 10);
            return Number.isFinite(n) ? n : null;
        }
        const n = parseInt(t, 10);
        return Number.isFinite(n) ? n : null;
    }

    function pointSegDist(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
        t = Math.max(0, Math.min(1, t));
        const sx = x1 + t * dx;
        const sy = y1 + t * dy;
        return Math.hypot(px - sx, py - sy);
    }

    function getMeasureAtCanvasPoint(cx, cy) {
        const keys = Object.keys(S.measures).map(x => parseInt(x, 10)).filter(Number.isFinite);
        keys.sort((a, b) => b - a); // python처럼 역순 탐색

        for (const mid of keys) {
            const m = S.measures[mid];
            const sid = parseRoiNameToId(m.start);
            const eid = parseRoiNameToId(m.end);
            const sr = getRoiById(sid);
            const er = getRoiById(eid);
            if (!sr || !er) continue;

            const sc = imageRectToCanvasRect({ x: sr.x + sr.w / 2, y: sr.y + sr.h / 2, w: 0, h: 0 });
            const ec = imageRectToCanvasRect({ x: er.x + er.w / 2, y: er.y + er.h / 2, w: 0, h: 0 });

            const d = pointSegDist(cx, cy, sc.x, sc.y, ec.x, ec.y);
            if (d <= 6.0) return mid;
        }
        return null;
    }

    // ---------- render ----------
    function requestRedraw() {
        if (S.rafPending) return;
        S.rafPending = true;
        requestAnimationFrame(() => {
            S.rafPending = false;
            redraw();
        });
    }

    function redraw() {
        const ctx = S.ctx;
        const host = $("airulerCanvasHost");
        if (!ctx || !S.canvas || !host) return;

        const cw = host.clientWidth;
        const ch = host.clientHeight;

        // bg
        ctx.clearRect(0, 0, cw, ch);
        ctx.fillStyle = "#202020";
        ctx.fillRect(0, 0, cw, ch);

        if (!S.img) return;

        const { scale, ox, oy } = getTransform();

        // image
        ctx.drawImage(S.img, ox, oy, S.imgW * scale, S.imgH * scale);

        // selected-measure rois set
        const selectedMeasureRoiIds = new Set();
        if (S.selectedMeasureId != null && S.measures[S.selectedMeasureId]) {
            const m = S.measures[S.selectedMeasureId];
            const sid = parseRoiNameToId(m.start);
            const eid = parseRoiNameToId(m.end);
            if (sid != null) selectedMeasureRoiIds.add(sid);
            if (eid != null) selectedMeasureRoiIds.add(eid);
        }

        // measures (lines): yellow, selected red
        const mids = Object.keys(S.measures).map(x => parseInt(x, 10)).filter(Number.isFinite).sort((a, b) => a - b);
        ctx.lineCap = "round";
        for (const mid of mids) {
            const m = S.measures[mid];
            const sid = parseRoiNameToId(m.start);
            const eid = parseRoiNameToId(m.end);
            const sr = getRoiById(sid);
            const er = getRoiById(eid);
            if (!sr || !er) continue;

            const sc = imageRectToCanvasRect({ x: sr.x + sr.w / 2, y: sr.y + sr.h / 2, w: 0, h: 0 });
            const ec = imageRectToCanvasRect({ x: er.x + er.w / 2, y: er.y + er.h / 2, w: 0, h: 0 });

            const isSel = (S.selectedMeasureId === mid);
            ctx.strokeStyle = isSel ? "red" : "yellow";
            ctx.lineWidth = isSel ? 3 : 2;

            ctx.beginPath();
            ctx.moveTo(sc.x, sc.y);
            ctx.lineTo(ec.x, ec.y);
            ctx.stroke();
        }

        // rois: green, selected red (python과 동일)
        ctx.font = "bold 16px Segoe UI, Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (const r of S.rois) {
            const cr = imageRectToCanvasRect(r);

            const isSelected = (S.selectedRoiId === r.id);
            const isSelectedByMeasure = selectedMeasureRoiIds.has(r.id);
            const isRed = isSelected || isSelectedByMeasure;

            ctx.strokeStyle = isRed ? "red" : "lime";
            ctx.lineWidth = isRed ? 3 : 2;

            ctx.strokeRect(cr.x, cr.y, cr.w, cr.h);

            // id text
            ctx.fillStyle = isRed ? "red" : "lime";
            ctx.fillText(String(r.id), cr.x + cr.w / 2, cr.y + cr.h / 2);
        }

        // drawing temp rect
        if (S.isDrawing) {
            const sx = S.drawStart.x;
            const sy = S.drawStart.y;
            const ex = S.drawEnd.x;
            const ey = S.drawEnd.y;

            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = "white";
            ctx.lineWidth = 1;
            ctx.strokeRect(sx, sy, ex - sx, ey - sy);
            ctx.restore();
        }
    }

    // ---------- JSON build/view ----------
    function buildFullJsonObj() {
        const data = {};

        if (!S.img) {
            data["n_roi"] = 0;
        } else {
            data["n_roi"] = S.rois.length;

            const sorted = [...S.rois].sort((a, b) => a.id - b.id);
            for (const r of sorted) {
                data[`roi_${r.id}`] = {
                    x: r.x / S.imgW,
                    y: r.y / S.imgH,
                    w: r.w / S.imgW,
                    h: r.h / S.imgH,
                    method: r.method || "",
                    parameter: (r.parameter === undefined ? null : r.parameter),
                };
            }
        }

        const mids = Object.keys(S.measures).map(x => parseInt(x, 10)).filter(Number.isFinite).sort((a, b) => a - b);
        data["n_measure"] = mids.length;
        for (const mid of mids) {
            const m = S.measures[mid];
            data[`measure_${mid}`] = {
                start: m.start || "",
                end: m.end || "",
                direction: m.direction || "",
                gt: (m.gt === undefined ? null : m.gt),
                margin: (m.margin === undefined ? null : m.margin),
            };
        }

        return data;
    }

    function refreshMeasureListView() {
        const pre = $("airulerMeasureList");
        if (!pre) return;

        const mids = Object.keys(S.measures).map(x => parseInt(x, 10)).filter(Number.isFinite).sort((a, b) => a - b);
        const lines = [];
        for (const mid of mids) {
            const m = S.measures[mid];
            lines.push(`measure_${mid}: start=${m.start || ""}, end=${m.end || ""}, dir=${m.direction || ""}, gt=${m.gt ?? ""}, margin=${m.margin ?? ""}`);
        }
        pre.textContent = lines.join("\n");
    }

    function setJsonViewer(text, highlightPattern = null) {
        const box = $("airulerJsonViewer");
        const host = $("airulerJsonViewerHost");
        if (!box || !host) return;

        if (!highlightPattern) {
            box.innerHTML = `<pre class="airuler-pre">${escapeHtml(text)}</pre>`;
            host.scrollTop = 0;
            return;
        }

        const idx = text.indexOf(highlightPattern);
        if (idx < 0) {
            box.innerHTML = `<pre class="airuler-pre">${escapeHtml(text)}</pre>`;
            return;
        }

        const before = escapeHtml(text.slice(0, idx));
        const hit = escapeHtml(text.slice(idx, idx + highlightPattern.length));
        const after = escapeHtml(text.slice(idx + highlightPattern.length));

        box.innerHTML = `<pre class="airuler-pre">${before}<span class="airuler-hit">${hit}</span>${after}</pre>`;

        // scroll to hit within host
        const hitEl = box.querySelector(".airuler-hit");
        if (hitEl) {
            const top = hitEl.offsetTop;
            host.scrollTop = Math.max(0, top - host.clientHeight / 2);
        }
    }

    function showFullJson(highlightPattern = null) {
        const obj = buildFullJsonObj();
        const txt = JSON.stringify(obj, null, 4);
        setJsonViewer(txt, highlightPattern);
    }

    function highlightRoiInJson(roiId) {
        if (roiId == null) {
            showFullJson(null);
            return;
        }
        showFullJson(`"roi_${roiId}":`);
    }

    function highlightMeasureInJson(mid) {
        if (mid == null) return;
        showFullJson(`"measure_${mid}":`);
    }

    // ---------- ROI modal ----------
    function openRoiModal({ title, idValue, methodValue, paramValue }, onOk) {
        $("airulerRoiModalTitle").textContent = title || "ROI 정보 입력 / 수정";
        $("airulerRoiId").value = String(idValue ?? "");
        $("airulerRoiMethod").value = String(methodValue ?? "");
        $("airulerRoiParam").value = (paramValue == null ? "" : String(paramValue));

        const modal = $("airulerRoiModal");
        modal.style.display = "flex";

        const okBtn = $("airulerRoiOk");
        const cancelBtn = $("airulerRoiCancel");

        const cleanup = () => {
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            modal.style.display = "none";
        };

        cancelBtn.onclick = () => cleanup();

        okBtn.onclick = () => {
            const idText = $("airulerRoiId").value.trim();
            if (!idText) { alert("ROI 번호를 입력하세요."); return; }
            const id = parseInt(idText, 10);
            if (!Number.isFinite(id) || id <= 0) { alert("ROI 번호는 1 이상의 정수여야 합니다."); return; }

            const method = $("airulerRoiMethod").value.trim();
            const pRaw = $("airulerRoiParam").value.trim();
            let parameter = null;
            if (pRaw !== "") {
                const f = parseFloat(pRaw);
                if (!Number.isFinite(f)) { alert(`Parameter 값을 숫자로 변환할 수 없습니다: '${pRaw}'`); return; }
                parameter = f;
            }

            cleanup();
            onOk({ id, method, parameter });
        };
    }

    // ---------- apply JSON ----------
    function applyJsonText(jsonText) {
        if (!S.img) {
            alert("먼저 이미지를 불러오세요.");
            return;
        }
        let data = null;
        try {
            data = JSON.parse(jsonText);
        } catch (e) {
            alert("JSON 파싱 실패: " + e.message);
            return;
        }

        S.rois = [];
        S.measures = {};
        S.selectedRoiId = null;
        S.selectedMeasureId = null;

        // ROI load
        for (const [k, v] of Object.entries(data)) {
            if (!k.startsWith("roi_")) continue;
            const id = parseInt(k.split("_")[1], 10);
            if (!Number.isFinite(id)) continue;

            const x = parseFloat(v.x) * S.imgW;
            const y = parseFloat(v.y) * S.imgH;
            const w = parseFloat(v.w) * S.imgW;
            const h = parseFloat(v.h) * S.imgH;

            S.rois.push({
                id,
                x, y, w, h,
                method: (v.method ?? ""),
                parameter: (v.parameter ?? null),
            });
        }

        // measure load
        for (const [k, v] of Object.entries(data)) {
            if (!k.startsWith("measure_")) continue;
            const id = parseInt(k.split("_")[1], 10);
            if (!Number.isFinite(id)) continue;

            S.measures[id] = {
                start: v.start ?? "",
                end: v.end ?? "",
                direction: v.direction ?? "",
                gt: (v.gt ?? null),
                margin: (v.margin ?? null),
            };
        }

        refreshMeasureListView();
        showFullJson(null);
        requestRedraw();
    }

    // ---------- image load ----------
    function resetForNewImage() {
        // python과 동일: 새 이미지 로드 시 ROI/measure 초기화
        S.rois = [];
        S.measures = {};
        S.selectedRoiId = null;
        S.selectedMeasureId = null;
        S.zoom = 1.0;
        S.panX = 0.0;
        S.panY = 0.0;

        $("airulerMeasureIndex").value = "";
        $("airulerMeasureStart").value = "";
        $("airulerMeasureEnd").value = "";
        $("airulerMeasureDirection").value = "";
        $("airulerMeasureGt").value = "";
        $("airulerMeasureMargin").value = "0.15";

        refreshMeasureListView();
        setJsonViewer("", null);
        setHover("");
    }

    function loadImageFromUrl(url) {
        if (!url) return;

        resetForNewImage();

        S.currentImageUrl = url;
        $("airulerCurrentImage").textContent = url;

        const img = new Image();
        img.onload = () => {
            S.img = img;
            S.imgW = img.naturalWidth;
            S.imgH = img.naturalHeight;
            log(`이미지 불러오기: ${url} (${S.imgW}x${S.imgH})`);
            requestRedraw();
        };
        img.onerror = () => {
            log(`[ERR] 이미지 로드 실패: ${url}`);
            alert("이미지 로드 실패");
        };
        img.src = url;
    }

    function loadImageFromLocalFile(file) {
        if (!file) return;

        resetForNewImage();

        const url = URL.createObjectURL(file);
        loadImageFromUrl(url);
        log(`로컬 이미지 불러오기: ${file.name}`);
    }

    // ---------- measure form ----------
    function normalizeRoiName(text) {
        const t = (text || "").trim();
        if (!t) return "";
        if (t.startsWith("roi_")) return t;
        if (/^\d+$/.test(t)) return `roi_${parseInt(t, 10)}`;
        return t;
    }

    function addOrUpdateMeasureFromForm() {
        const idxText = $("airulerMeasureIndex").value.trim();
        if (!idxText) { alert("Measure 번호를 입력하세요."); return; }
        const mid = parseInt(idxText, 10);
        if (!Number.isFinite(mid) || mid <= 0) { alert("Measure 번호는 1 이상의 정수여야 합니다."); return; }

        const start = normalizeRoiName($("airulerMeasureStart").value);
        const end = normalizeRoiName($("airulerMeasureEnd").value);
        const direction = $("airulerMeasureDirection").value.trim();
        const gtText = $("airulerMeasureGt").value.trim();
        const marginText = $("airulerMeasureMargin").value.trim();

        // ROI 존재 체크
        const roiNames = new Set(S.rois.map(r => `roi_${r.id}`));
        if (start && !roiNames.has(start)) { alert(`시작 ROI '${start}' 가 존재하지 않습니다.`); return; }
        if (end && !roiNames.has(end)) { alert(`끝 ROI '${end}' 가 존재하지 않습니다.`); return; }

        const toFloatOrNull = (t) => {
            const s = (t || "").trim();
            if (s === "") return null;
            const f = parseFloat(s);
            if (!Number.isFinite(f)) return NaN;
            return f;
        };

        const gt = toFloatOrNull(gtText);
        if (Number.isNaN(gt)) { alert(`GT 값을 숫자로 변환할 수 없습니다: '${gtText}'`); return; }

        const margin = toFloatOrNull(marginText);
        if (Number.isNaN(margin)) { alert(`Margin 값을 숫자로 변환할 수 없습니다: '${marginText}'`); return; }

        if (S.measures[mid]) {
            const ok = confirm(`measure 번호 ${mid} 는 이미 존재합니다. 덮어쓰시겠습니까?`);
            if (!ok) return;
            log(`measure_${mid} 수정`);
        } else {
            log(`measure_${mid} 추가`);
        }

        S.measures[mid] = { start, end, direction, gt, margin };
        refreshMeasureListView();
        requestRedraw();

        // 선택 상태는 measure로
        S.selectedMeasureId = mid;
        S.selectedRoiId = null;
        highlightMeasureInJson(mid);
    }

    function deleteMeasureFromForm() {
        const idxText = $("airulerMeasureIndex").value.trim();
        if (!idxText) { alert("삭제할 Measure 번호를 입력하세요."); return; }
        const mid = parseInt(idxText, 10);
        if (!Number.isFinite(mid)) { alert("Measure 번호는 정수여야 합니다."); return; }
        if (!S.measures[mid]) { alert(`measure_${mid} 가 존재하지 않습니다.`); return; }

        const ok = confirm(`measure_${mid} 를 삭제하시겠습니까?`);
        if (!ok) return;

        delete S.measures[mid];
        refreshMeasureListView();
        requestRedraw();
        log(`measure_${mid} 삭제`);

        if (S.selectedMeasureId === mid) S.selectedMeasureId = null;
        showFullJson(null);
    }

    // ---------- save/load json ----------
    async function saveJsonToServerAndDownload() {
        if (!S.img) {
            alert("이미지를 먼저 불러오세요.");
            return;
        }
        if (!S.modelName) {
            alert("먼저 모델을 선택/생성하세요. (서버 저장 파일명이 모델명.json 입니다)");
            return;
        }

        const obj = buildFullJsonObj();
        const txt = JSON.stringify(obj, null, 4);

        // 1) 서버 저장
        try {
            const res = await apiPost(`/api/airuler/json/${encodeURIComponent(S.modelName)}`, { json: txt });
            log(`JSON 저장: ${res.savedPath}`);
            await refreshJsonFilesList();
        } catch (e) {
            log(`[ERR] JSON 서버 저장 실패: ${e.message}`);
            alert(e.message);
            return;
        }

        // 2) 브라우저 다운로드(파일 저장 동작 대체)
        const blob = new Blob([txt], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${S.modelName}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function loadJsonFromLocalFile(file) {
        if (!file) return;
        if (!S.img) {
            alert("먼저 이미지를 불러오세요. (python 버전과 동일: JSON 불러오기 전에 이미지 필요)");
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const txt = String(reader.result || "");
            applyJsonText(txt);
            log(`JSON 불러오기(로컬): ${file.name}`);
        };
        reader.readAsText(file, "utf-8");
    }

    // ---------- ROI actions ----------
    function onCanvasMouseDown(e) {
        if (!S.img) return;

        const rect = S.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        // 1) ROI hit
        const ip = canvasToImage({ x: cx, y: cy });
        const roi = getRoiAtImagePoint(ip.x, ip.y);
        if (roi) {
            S.selectedRoiId = roi.id;
            S.selectedMeasureId = null;
            highlightRoiInJson(roi.id);
            requestRedraw();
            return;
        }

        // 2) Measure hit
        const mid = getMeasureAtCanvasPoint(cx, cy);
        if (mid != null) {
            S.selectedMeasureId = mid;
            S.selectedRoiId = null;

            // measure 폼 채우기
            const m = S.measures[mid];
            $("airulerMeasureIndex").value = String(mid);
            $("airulerMeasureStart").value = (m.start || "").replace("roi_", "");
            $("airulerMeasureEnd").value = (m.end || "").replace("roi_", "");
            $("airulerMeasureDirection").value = m.direction || "";
            $("airulerMeasureGt").value = (m.gt == null ? "" : String(m.gt));
            $("airulerMeasureMargin").value = (m.margin == null ? "" : String(m.margin));

            highlightMeasureInJson(mid);
            requestRedraw();
            return;
        }

        // 3) start draw
        S.isDrawing = true;
        S.drawStart = { x: cx, y: cy };
        S.drawEnd = { x: cx, y: cy };
        requestRedraw();
    }

    function onCanvasMouseMove(e) {
        if (!S.img) return;

        const rect = S.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        if (S.isDrawing) {
            S.drawEnd = { x: cx, y: cy };
            requestRedraw();
            return;
        }

        // hover roi
        const ip = canvasToImage({ x: cx, y: cy });
        const roi = getRoiAtImagePoint(ip.x, ip.y);
        if (roi) {
            const txt = `roi_${roi.id}, method=${roi.method || ""}, parameter=${roi.parameter ?? ""}, rect=(${roi.x.toFixed(1)},${roi.y.toFixed(1)},${roi.w.toFixed(1)},${roi.h.toFixed(1)})`;
            setHover(txt);
        } else {
            setHover("");
        }
    }

    function onCanvasMouseUp(e) {
        if (!S.img) return;
        if (!S.isDrawing) return;

        S.isDrawing = false;

        const rect = S.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        S.drawEnd = { x: cx, y: cy };

        const ip1 = canvasToImage(S.drawStart);
        const ip2 = canvasToImage(S.drawEnd);

        const x = Math.min(ip1.x, ip2.x);
        const y = Math.min(ip1.y, ip2.y);
        const w = Math.abs(ip2.x - ip1.x);
        const h = Math.abs(ip2.y - ip1.y);

        // 거의 움직이지 않았으면: 선택 해제
        if (w < 1 || h < 1) {
            S.selectedRoiId = null;
            S.selectedMeasureId = null;
            showFullJson(null);
            requestRedraw();
            return;
        }

        // clamp
        const newRect = { x, y, w, h };
        const suggested = suggestNextRoiId();

        openRoiModal(
            { title: "ROI 정보 입력 / 수정", idValue: suggested, methodValue: "", paramValue: "" },
            (info) => {
                // duplicate check
                if (S.rois.some(r => r.id === info.id)) {
                    alert(`ROI 번호 ${info.id} 는 이미 존재합니다.`);
                    return;
                }

                const roi = {
                    id: info.id,
                    x: newRect.x,
                    y: newRect.y,
                    w: newRect.w,
                    h: newRect.h,
                    method: info.method || "",
                    parameter: info.parameter,
                };
                clampRoiToImage(roi);

                S.rois.push(roi);
                S.selectedRoiId = roi.id;
                S.selectedMeasureId = null;

                log(`ROI 생성: roi_${roi.id} rect=(${roi.x.toFixed(1)},${roi.y.toFixed(1)},${roi.w.toFixed(1)},${roi.h.toFixed(1)}), method=${roi.method}, parameter=${roi.parameter}`);
                highlightRoiInJson(roi.id);
                refreshMeasureListView();
                requestRedraw();
            }
        );
    }

    function editSelectedRoi() {
        if (S.selectedRoiId == null) {
            alert("선택된 ROI가 없습니다.");
            return;
        }
        const roi = getRoiById(S.selectedRoiId);
        if (!roi) return;

        openRoiModal(
            {
                title: "ROI 정보 입력 / 수정",
                idValue: roi.id,
                methodValue: roi.method || "",
                paramValue: roi.parameter,
            },
            (info) => {
                // id duplicate check (excluding self)
                if (info.id !== roi.id && S.rois.some(r => r.id === info.id)) {
                    alert(`ROI 번호 ${info.id} 는 이미 존재합니다.`);
                    return;
                }

                roi.id = info.id;
                roi.method = info.method || "";
                roi.parameter = info.parameter;

                S.selectedRoiId = roi.id;
                S.selectedMeasureId = null;

                log(`ROI 수정: roi_${roi.id}`);
                highlightRoiInJson(roi.id);
                requestRedraw();
            }
        );
    }

    function deleteSelectedRoi() {
        if (S.selectedRoiId == null) return;
        const id = S.selectedRoiId;
        const idx = S.rois.findIndex(r => r.id === id);
        if (idx >= 0) {
            S.rois.splice(idx, 1);
            log(`ROI 삭제: roi_${id}`);
        }
        S.selectedRoiId = null;
        S.selectedMeasureId = null;
        showFullJson(null);
        requestRedraw();
    }

    function copySelectedRoi() {
        if (S.selectedRoiId == null) return;
        const roi = getRoiById(S.selectedRoiId);
        if (!roi) return;
        S.clipboard = {
            rect: { x: roi.x, y: roi.y, w: roi.w, h: roi.h },
            method: roi.method || "",
            parameter: roi.parameter ?? null,
        };
        log("ROI 복사");
    }

    function cutSelectedRoi() {
        copySelectedRoi();
        deleteSelectedRoi();
        log("ROI 잘라내기");
    }

    function pasteRoiOffset() {
        if (!S.clipboard) return;
        const nextId = suggestNextRoiId();
        const base = S.clipboard.rect;
        const roi = {
            id: nextId,
            x: base.x + 10,
            y: base.y + 10,
            w: base.w,
            h: base.h,
            method: S.clipboard.method || "",
            parameter: S.clipboard.parameter ?? null,
        };
        clampRoiToImage(roi);

        S.rois.push(roi);
        S.selectedRoiId = roi.id;
        S.selectedMeasureId = null;

        log(`ROI 붙여넣기: roi_${roi.id}`);
        highlightRoiInJson(roi.id);
        requestRedraw();
    }

    function moveOrResizeSelectedRoi(key, shift) {
        if (S.selectedRoiId == null) return false;
        const roi = getRoiById(S.selectedRoiId);
        if (!roi) return false;

        if (shift) {
            // resize (python: 좌상단 기준)
            if (key === "ArrowRight") roi.w += 1;
            if (key === "ArrowLeft") roi.w = Math.max(1, roi.w - 1);
            if (key === "ArrowDown") roi.h += 1;
            if (key === "ArrowUp") roi.h = Math.max(1, roi.h - 1);
        } else {
            // move
            if (key === "ArrowLeft") roi.x -= 1;
            if (key === "ArrowRight") roi.x += 1;
            if (key === "ArrowUp") roi.y -= 1;
            if (key === "ArrowDown") roi.y += 1;
        }

        clampRoiToImage(roi);
        requestRedraw();
        highlightRoiInJson(roi.id);
        return true;
    }

    function handleKeyDown(e) {
        // Ctrl+S: save
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            saveJsonToServerAndDownload();
            return;
        }

        // Ctrl+E: edit ROI
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
            e.preventDefault();
            editSelectedRoi();
            return;
        }

        // zoom/pan: Ctrl + +/- / arrows
        if (e.ctrlKey || e.metaKey) {
            if (e.key === "+" || e.key === "=") {
                e.preventDefault();
                S.zoom = Math.min(10.0, S.zoom * 1.1);
                requestRedraw();
                return;
            }
            if (e.key === "-") {
                e.preventDefault();
                S.zoom = Math.max(0.1, S.zoom / 1.1);
                requestRedraw();
                return;
            }
            const step = 20;
            if (e.key === "ArrowLeft") { e.preventDefault(); S.panX += step; requestRedraw(); return; }
            if (e.key === "ArrowRight") { e.preventDefault(); S.panX -= step; requestRedraw(); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); S.panY += step; requestRedraw(); return; }
            if (e.key === "ArrowDown") { e.preventDefault(); S.panY -= step; requestRedraw(); return; }

            // ROI clipboard
            if (e.key.toLowerCase() === "c") { e.preventDefault(); copySelectedRoi(); return; }
            if (e.key.toLowerCase() === "x") { e.preventDefault(); cutSelectedRoi(); return; }
            if (e.key.toLowerCase() === "v") { e.preventDefault(); pasteRoiOffset(); return; }
        }

        // delete ROI
        if (e.key === "Delete") {
            if (S.selectedRoiId != null) {
                e.preventDefault();
                deleteSelectedRoi();
            }
            return;
        }

        // ROI move/resize with arrows
        if (e.key.startsWith("Arrow")) {
            const handled = moveOrResizeSelectedRoi(e.key, e.shiftKey);
            if (handled) e.preventDefault();
            return;
        }
    }

    // ---------- help modal ----------
    function openHelpModal() {
        $("airulerHelpModal").style.display = "flex";
    }
    function closeHelpModal() {
        $("airulerHelpModal").style.display = "none";
    }

    // ---------- init ----------
    function bindUi() {
        // model
        $("airulerBtnCreateModel").addEventListener("click", () => createModel($("airulerModelNameInput").value));
        $("airulerBtnRefreshModels").addEventListener("click", () => refreshModels());

        $("airulerModelSelect").addEventListener("change", async (e) => {
            await selectModel(e.target.value);
        });

        // server json
        $("airulerBtnLoadServerJson").addEventListener("click", () => loadServerJson());

        // upload images
        $("airulerBtnUploadImages").addEventListener("click", () => {
            const files = $("airulerUploadInput").files;
            uploadImagesToServer(files);
        });

        // toolbar: local image/json
        $("airulerBtnLoadImage").addEventListener("click", () => $("airulerLocalImageInput").click());
        $("airulerLocalImageInput").addEventListener("change", (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) loadImageFromLocalFile(f);
            e.target.value = "";
        });

        $("airulerBtnLoadJson").addEventListener("click", () => $("airulerLocalJsonInput").click());
        $("airulerLocalJsonInput").addEventListener("change", (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) loadJsonFromLocalFile(f);
            e.target.value = "";
        });

        $("airulerBtnShowJson").addEventListener("click", () => showFullJson(null));
        $("airulerBtnSaveJson").addEventListener("click", () => saveJsonToServerAndDownload());
        $("airulerBtnEditRoi").addEventListener("click", () => editSelectedRoi());
        $("airulerBtnHelp").addEventListener("click", () => openHelpModal());
        $("airulerHelpClose").addEventListener("click", () => closeHelpModal());

        // measure
        $("airulerBtnAddMeasure").addEventListener("click", () => addOrUpdateMeasureFromForm());
        $("airulerBtnDeleteMeasure").addEventListener("click", () => deleteMeasureFromForm());

        // canvas
        S.canvas = $("airulerCanvas");
        S.ctx = S.canvas.getContext("2d");

        S.canvas.addEventListener("mousedown", onCanvasMouseDown);
        S.canvas.addEventListener("mousemove", onCanvasMouseMove);
        S.canvas.addEventListener("mouseup", onCanvasMouseUp);

        // keyboard
        document.addEventListener("keydown", handleKeyDown);

        // resize
        window.addEventListener("resize", ensureCanvasSize);
        new ResizeObserver(() => ensureCanvasSize()).observe($("airulerCanvasHost"));

        ensureCanvasSize();
    }

    async function init() {
        bindUi();
        await refreshModels();
        log("AIRuler Web Editor ready.");
    }

    return { init };
})();
