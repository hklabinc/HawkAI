/* Gobally 사용을 위하여 아래 window.를 붙임 */
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

    
    // 아래 코드는 동작 안함!
    //var Module = {
    //    // https://emscripten.org/docs/api_reference/module.html#Module.onRuntimeInitialized
    //    onRuntimeInitialized() {
    //        document.getElementById('opencv_status').innerHTML = 'OpenCV.js is ready.';
    //    }
    //};
}



//function ShowDeleteConfirmationModal() {
//    $('#deleteConfirmationModal').modal('show');
//}

