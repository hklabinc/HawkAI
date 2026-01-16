/* Gobally 사용을 위하여 아래 window.를 붙임 */


// ---- AIRuler Calibration (preview/apply) ----
window.hkAiruler = window.hkAiruler || {};

// Returns: response text (JSON)
window.hkAiruler.calibrationPreview = async (modelName) => {
    const url = `/api/airuler/calibration-preview/${encodeURIComponent(modelName)}`;
    const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    });

    const text = await res.text();
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}\n${text}`);
    }
    return text;
};

// Returns: response text (JSON)
window.hkAiruler.calibrationApply = async (modelName) => {
    const url = `/api/airuler/calibration/${encodeURIComponent(modelName)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    });

    const text = await res.text();
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}\n${text}`);
    }
    return text;
};



window.bootstrapModalShow = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    modal.show();
};

window.bootstrapModalHide = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    modal.hide();
};

function ShowDeleteConfirmationModal() {
    $('#deleteConfirmationModal').modal('show');
}

function HideDeleteConfirmationModal() {
    $('#deleteConfirmationModal').modal('hide');
}
