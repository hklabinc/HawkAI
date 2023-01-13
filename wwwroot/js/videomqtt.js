/* Gobally 사용을 위하여 아래 window.를 붙임 */

/* Video Play */
window.SendVideo = (userId) => {

    /* Paramter 설정 */
    const SERV_ADDR = "hawkai.hknu.ac.kr";
    const SERV_PORT = 8090;
    const TOPIC_SUB = "hawkai/from/" + userId;
    const TOPIC_PUB = "hawkai/to/" + userId;
    var isImage = false;
    var isEvent = false;
    var para_interval = 0.5;
    var para_scale = 1.0;
    const WIDTH = 320;
    const HEIGHT = 240;
    const THRESHOLD_MOTION_DETECTION = 50;  // TBD
    const camName = document.getElementById('cam_name').value;
    console.log("camName: " + camName);

    /* MQTT 설정 */
    var client_id = Math.random().toString(36).substring(2, 12);        // random client id
    console.log("client id: " + client_id);
    const client = new Paho.MQTT.Client(SERV_ADDR, Number(SERV_PORT), client_id);    // Create a client instance
    client.onConnectionLost = onConnectionLost; // set callback handlers
    client.onMessageArrived = onMessageArrived;
    //client.connect({ onSuccess: onConnect });   // connect the client
    client.connect({ useSSL: true, onSuccess: onConnect });   // connect the client using SSL 


    /* Video 화면 보여주기 */  // <- 아래 Motion Detection에서 겹쳐서 주석 처리함!
    //var video = document.querySelector("#canvas_video");
    //if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    //    navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
    //        video.srcObject = stream;
    //        video.play();            
    //    });
    //}

    
    /* Motion Detection */
    var video = document.getElementById('canvas_video');
    var canvas_motion = document.getElementById('canvas_motion');
    var score_motion = document.getElementById('score_motion');

    function initSuccess() {
        DiffCamEngine.start();
    }

    function initError() {
        alert('Something went wrong.');
    }

    function capture(payload) {
        score_motion.textContent = payload.score;
    }

    DiffCamEngine.init({
        video: video,
        motionCanvas: canvas_motion,
        initSuccessCallback: initSuccess,
        initErrorCallback: initError,
        captureCallback: capture
    });

    


    /* 주기적으로 이미지 전송 */
    //let timer;
    //timer = setInterval(clock, para_interval*1000);   // 1초마다 clock() 함수를 실행시킨다.

    setTimeout(clock, para_interval * 1000);
    function clock() {
        //console.log("This is executed every 1 second");
        //const div = document.getElementById('result');
        //div.innerText = new Date();

        //console.log("payload.score:" + score_motion.textContent);  // Threshold of Motion detected 값

        if (isImage || isEvent) {
            var canvas = document.getElementById('canvas_image');            
            canvas.width = WIDTH * para_scale;
            canvas.height = HEIGHT * para_scale;
            canvas.getContext('2d').drawImage(video, 0, 0, WIDTH * para_scale, HEIGHT * para_scale);       // 원래 기본값은 640, 480
            resultb64 = canvas.toDataURL("image/jpeg", 0.5).replace("data:image/jpeg;base64,", "");       // data:image/jpeg;base64, 문구 제거를 위해
            //resultb64 = canvas.toDataURL();       // default는 png로 저장됨
            //console.log("resultb64:" + resultb64);

            var data = new Object();
            data.addr = camName;
            data.time = new Date().toLocaleString();

            if (isImage && isEvent == false) {      // image만 전송하는 경우
                data.type = "image";
                data.label = "none";
                data.image = resultb64;
                //console.log("data:" + data);

                var jsonData = JSON.stringify(data);
                console.log("jsonData:" + jsonData.substring(0, 100));

                message = new Paho.MQTT.Message(jsonData);
                message.destinationName = TOPIC_SUB;
                client.send(message);       // image MQTT 메시지 전송   
            }      
            
            if (isEvent && score_motion.textContent > THRESHOLD_MOTION_DETECTION) {     // event만 전송하는 경우 (단 threshold가 넘었을때만) -> isImage 여부에 상관 없이 event만 전송
                console.log("Sending EVENT !! - payload.score:" + score_motion.textContent);  // Threshold of Motion detected 값
                data.type = "event";
                data.label = "motion";
                data.image = resultb64;
                //console.log("data:" + data);

                var jsonData = JSON.stringify(data);
                console.log("jsonData:" + jsonData.substring(0, 100));

                message = new Paho.MQTT.Message(jsonData);
                message.destinationName = TOPIC_SUB;
                client.send(message);       // image MQTT 메시지 전송 
            }

            if (isImage == true && isEvent && score_motion.textContent <= THRESHOLD_MOTION_DETECTION) {     // image는 전송해야 하고 event 발생 조건이 안되었을때 -> image 전송
                data.type = "image";
                data.label = "none";
                data.image = resultb64;
                //console.log("data:" + data);

                var jsonData = JSON.stringify(data);
                console.log("jsonData:" + jsonData.substring(0, 100));

                message = new Paho.MQTT.Message(jsonData);
                message.destinationName = TOPIC_SUB;
                client.send(message);       // image MQTT 메시지 전송 
            }
            if (isImage == false && isEvent && score_motion.textContent <= THRESHOLD_MOTION_DETECTION) {     // image는 전송안 하고 event 발생 조건이 안되었을때
                // Nothing to do
            }

                           
        }
        setTimeout(clock, para_interval * 1000);
    }     

    /* Stop 버튼 누르면 */
    document.getElementById("stop_video").addEventListener("click", () => {
        clearInterval(timer);   // timer의 반복실행을 종료
        video.pause();
    });

    // Send Snapshot 버튼 누를 때 - Snapshot 찍고 MQTT로 전송
    //var video = document.querySelector("#canvas_video");
    //var canvas = document.getElementById('canvas_image');
    //canvas.width = 320;
    //canvas.height = 240;
    //document.getElementById("stop_video").addEventListener("click", () => {
    //    canvas.getContext('2d').drawImage(video, 0, 0, 320, 240);       // 원래 기본값은 640, 480
    //    resultb64 = canvas.toDataURL("image/jpeg", 1).replace("data:image/jpeg;base64,", "");       // data:image/jpeg;base64, 문구 제거를 위해
    //    //resultb64 = canvas.toDataURL();       // default는 png로 저장됨
    //    //console.log("resultb64:" + resultb64);

    //    var data = new Object();
    //    data.time = new Date().toJSON();
    //    data.addr = "HK_ComCam01";
    //    data.type = "image";
    //    data.label = "none";
    //    data.image = resultb64;
    //    console.log("data:" + data);

    //    var jsonData = JSON.stringify(data);
    //    console.log("jsonData:" + jsonData);

    //    message = new Paho.MQTT.Message(jsonData);
    //    message.destinationName = TOPIC_SUB;
    //    client.send(message);
    //});
    

    // called when the client connects
    function onConnect() {
        // Once a connection has been made, make a subscription and send a message.
        console.log("MQTT onConnect !!");
        client.subscribe(TOPIC_PUB);

        //메시지 전송
        message = new Paho.MQTT.Message("Hello");        
        message.destinationName = TOPIC_SUB;
        client.send(message);
    }

    // called when the client loses its connection
    function onConnectionLost(responseObject) {
        if (responseObject.errorCode !== 0) {
            console.log("onConnectionLost:" + responseObject.errorMessage);
        }
    }

    // called when a message arrives
    function onMessageArrived(message) {
        console.log("onMessageArrived:" + message.payloadString);
        const div = document.getElementById('rx_msg');
        div.innerHTML += "<li>" + message.payloadString + "</li>";

        const words = message.payloadString.split('=');
        const para = words[0];
        const value = words[1];

        if (para === "isImage") {
            isImage = JSON.parse(value.toLowerCase());
        } else if (para === "isEvent") {
            isEvent = JSON.parse(value.toLowerCase());
        } else if (para === "interval") {
            para_interval = value;            
        } else if (para === "scale") {
            para_scale = value;
        } else {
            console.error("Rx message format error!")
        }

        //var rxMsg = message.payloadString;
        //var contact = JSON.parse(rxMsg);
        //var cameraId = contact.src;
        ////console.log("onMessage cameraId:" + cameraId);

        //var elem = document.getElementById(cameraId);
        //elem.style.color = "Red";
        //var t = setInterval(function () {
        //    elem.style.visibility = (elem.style.visibility == 'hidden' ? '' : 'hidden');
        //}, 500);
    }
}


window.StopVideo = () => {

}
