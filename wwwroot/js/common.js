/* Gobally 사용을 위하여 아래 window.를 붙임 */

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

