window.trainStatusStream = {
    source: null,

    start: function (sessionId, dotNetHelper) {
        console.log("🚀 [SSE] Starting new stream for session:", sessionId);

        // 이전 소스가 있다면 종료
        if (this.source) {
            console.log("🔁 [SSE] Existing stream found, closing it first.");
            this.source.close();
        }

        const url = `http://localhost:9002/api/progress/${sessionId}`;
        console.log("🌐 [SSE] Connecting to:", url);
        this.source = new EventSource(url);

        this.source.onopen = function () {
            console.log("✅ [SSE] Connection opened.");
        };

        this.source.onmessage = function (event) {
            console.log("📢 [SSE] Message received:", event.data);
            dotNetHelper.invokeMethodAsync("UpdateTrainStatus", event.data)
                .then(() => {
                    console.log("✅ [Blazor] UpdateTrainStatus invoked successfully.");
                })
                .catch(err => {
                    console.error("❌ [Blazor] Failed to invoke UpdateTrainStatus:", err);
                });
        };

        this.source.onerror = (e) => {
            console.error("❌ [SSE] Error occurred:", e);
            window.trainStatusStream.stop();
        };
    },

    stop: function () {
        if (this.source) {
            console.log("🛑 [SSE] Stopping stream.");
            this.source.close();
            this.source = null;
        } else {
            console.log("⚠️ [SSE] No active stream to stop.");
        }
    }
};



/* Gobally 사용을 위하여 아래 window.를 붙임 */
window.ShowToastr = (type, message) => {
    if (type === "success") {        
        //confirm(message);
        // Override global options
        toastr.success(message, 'Operation Successful', { timeOut: 5000 });
    }

    if (type === "error") {        
        //confirm(message);
        // Display an error toast, with a title
        toastr.error(message, 'Operation Failed', { timeOut: 5000 });
    }

    if (type === "warning") {
        // Display a warning toast, with no title
        toastr.warning('This is warning')
    }

    if (type === "success2") {
        // Display a success toast, with a title
        toastr.success(message, 'Operation Successful2')
    }

    if (type === "remove") {
        // Immediately remove current toasts without using animation
        toastr.remove()
    }

    if (type === "clear") {
        // Remove current toasts using animation
        toastr.clear()
    }
}


window.ShowSweetAlert = (type, message) => {
    if (type === "success") {        
        Swal.fire(
            'Success Notification!',
            message,
            'success'
        )
    }

    if (type === "error") {
        Swal.fire(
            'Error Notification!',
            message,
            'error'
        )
    }

}

function ShowDeleteConfirmationModal() {
    $('#deleteConfirmationModal').modal('show');
}

function HideDeleteConfirmationModal() {
    $('#deleteConfirmationModal').modal('hide');
}
