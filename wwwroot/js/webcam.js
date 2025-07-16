/* Gobally 사용을 위하여 아래 window.를 붙임 */
window.captureWebcamImage = async function () {
    const video = document.createElement('video');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    stream.getTracks().forEach(track => track.stop());

    return canvas.toDataURL('image/jpeg');
}

/* WebCam Play */
window.ShowVideo = () => {
    // WebCam Video 화면 보여주기
    let video = document.querySelector("#webcam_video");

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
            video.srcObject = stream;
            video.play();
        });
    }

    // WebCam Snapshot 찍기
    let canvas = document.querySelector("#webcam_canvas");
    let context = canvas.getContext("2d");

    document.getElementById("webcam_snapshot").addEventListener("click", () => {
        context.drawImage(video, 0, 0, 640, 480);
    });    
}