window.InitializeWebGL = (canvasId) => {
    console.log("[HHCHOI] ==> " + THREE.OBJLoader); // 이 코드를 실행하여 브라우저 콘솔에서 확인

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    var renderer = new THREE.WebGLRenderer({ canvas: document.getElementById(canvasId) });
    renderer.setSize(window.innerWidth * 0.5, window.innerHeight * 0.5);

    var ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    var directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 0);
    scene.add(directionalLight);

    // OBJLoader를 전역 변수에서 생성자로 사용
    var loader = new THREE.OBJLoader();

    loader.load(
        'model/Frank.obj', // obj 파일이 있는 경로
        function (object) {
            scene.add(object);
            object.position.set(0, -3, 0);
            object.scale.set(0.5, 0.5, 0.5);  // 객체의 크기를 모든 축에서 절반으로 줄입니다.
        },
        function (xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function (error) {
            console.log('An error happened');
        }
    );

    camera.position.z = 5;

    var animate = function () {
        requestAnimationFrame(animate);
        scene.traverse(function (object) {
            if (object.isMesh) {
                //object.rotation.x += 0.01;
                object.rotation.y += 0.01;
            }
        });
        renderer.render(scene, camera);
    };

    animate();
}
