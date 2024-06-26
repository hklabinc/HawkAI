﻿/* Gobally 사용을 위하여 아래 window.를 붙임 */
window.OpenCVSelectFile = () => {
    let imgElement = document.getElementById("imageSrc")
    let inputElement = document.getElementById("fileInput");

    imgElement.src = URL.createObjectURL(inputElement.files[0]);

    imgElement.onload = function () {
        let mat = cv.imread(imgElement);
        cv.imshow('canvasOutput', mat);
        mat.delete();
    };

    const status = document.getElementById('opencv_status');
    status.innerHTML = 'OpenCV.js is ready.';
}


window.OpenCVMotionDetection = () => {
    //var camera = new cv.VideoCapture(0); //open camera

    ////set the video size to 512x288
    //camera.setWidth(512);
    //camera.setHeight(288);
    //var window = new cv.NamedWindow('Camera');
    //var firstFrame, frameDelta, gray, thresh;
}


//function ShowDeleteConfirmationModal() {
//    $('#deleteConfirmationModal').modal('show');
//}

