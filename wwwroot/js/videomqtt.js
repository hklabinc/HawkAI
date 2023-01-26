/* Gobally 사용을 위하여 아래 window.를 붙임 */

/*'use strict';*/
let isImage = false;
let isEvent = false;
let isQuery = true;
let para_scale = 1;
let para_interval = 0.5;
let para_threshold = 50;

window.InitVideo = () => {    
    isImage = $('#check-image').is(':checked');
    isEvent = $('#check-event').is(':checked');
    isQuery = $('#check-query').is(':checked');
    para_scale = $("#select-scale").val();
    para_interval = $("#select-interval").val();
    para_threshold = $("#select-threshold").val();
    
    $("#check-image").click(function () {
        isImage = document.getElementById('check-image').checked;
        document.getElementById("valImage").textContent = isImage ? "On" : "Off";               
    });
    $("#check-event").click(function () {
        isEvent = document.getElementById('check-event').checked;
        document.getElementById("valEvent").textContent = isEvent ? "On" : "Off";        
    });
    $("#check-query").click(function () {
        isQuery = document.getElementById('check-query').checked;
        document.getElementById("valQuery").textContent = isQuery ? "On" : "Off";        
    });
    $("#select-scale").click(function () {
        para_scale = $("#select-scale").val();
    });  
    $("#select-interval").click(function () {
        para_interval = $("#select-interval").val();
    });
    $("#select-threshold").click(function () {
        para_threshold = $("#select-threshold").val();
    });

    console.log('InitVideo() - para: %s, %s, %s, %f, %f, %f', isImage, isEvent, isQuery, para_scale, para_interval, para_threshold);
}

window.DefaultParameter = () => {   
    isImage = false;
    document.getElementById('check-image').checked = isImage;    
    document.getElementById("valImage").textContent = isImage ? "On" : "Off";
    isEvent = false;
    document.getElementById('check-event').checked = isEvent;
    document.getElementById("valEvent").textContent = isEvent ? "On" : "Off";
    isQuery = true;
    document.getElementById('check-query').checked = isQuery;
    document.getElementById("valQuery").textContent = isQuery ? "On" : "Off";
    para_scale = 1;
    document.getElementById('select-scale').value = para_scale;
    para_interval = 0.5;
    document.getElementById('select-interval').value = para_interval;
    para_threshold = 50;
    document.getElementById('select-threshold').value = para_threshold;

    console.log('DefaultParameter() - para: %s, %s, %s, %f, %f, %f', isImage, isEvent, isQuery, para_scale, para_interval, para_threshold);
}


/* Video Play */
window.SendVideo = (userId) => {   
    /* Paramter 설정 */
    const SERV_ADDR = "hawkai.hknu.ac.kr";
    const SERV_PORT = 8090;
    const TOPIC_PUB = "hawkai/from/" + userId;
    const TOPIC_SUB = "hawkai/to/" + userId;
    const TOPIC_QUERY = "hawkai/query";    
    const WIDTH = 320;
    const HEIGHT = 240;    
    const CAM_NAME = document.getElementById('cam_name').value;    

    /* MQTT 설정 */
    var client_id = Math.random().toString(36).substring(2, 12);                    // Random client id
    //console.log("client id: " + client_id);
    const client = new Paho.MQTT.Client(SERV_ADDR, Number(SERV_PORT), client_id);   // Create a client instance
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
        //const div = document.getElementById('result');
        //div.innerText = new Date();
                
        console.log('clock() - para: %s, %s, %s, %f, %f, %f', isImage, isEvent, isQuery, para_scale, para_interval, para_threshold);        
        var curr_threshold = Number(score_motion.textContent);
                
        if (isEvent && curr_threshold > para_threshold) {     // isEvent=true이면서 이벤트 발생시    
            SendMqttMessage("event", "motion");               
        } else if (isImage) {                       // 이벤트 발생 안했지만 isImage=true인 경우
            SendMqttMessage("image", "none");            
        } else { }        
        
        // TOPIC_QUERY로 Query 전송
        if (isQuery && curr_threshold > para_threshold) {     
            SendMqttMessage("query", "motion");
        }                           
        
        setTimeout(clock, para_interval * 1000);
    }     

    // called when the client connects - make a subscription
    function onConnect() {        
        console.log("MQTT connected!");
        client.subscribe(TOPIC_SUB);
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
            document.getElementById('check-image').checked = isImage;
            document.getElementById("valImage").textContent = isImage ? "On" : "Off";            
        } else if (para === "isEvent") {
            isEvent = JSON.parse(value.toLowerCase());
            document.getElementById('check-event').checked = isEvent;
            document.getElementById("valEvent").textContent = isEvent ? "On" : "Off";  
        } else if (para === "isQuery") {
            isQuery = JSON.parse(value.toLowerCase());
            document.getElementById('check-query').checked = isQuery;
            document.getElementById("valQuery").textContent = isQuery ? "On" : "Off";  
        } else if (para === "scale") {
            para_scale = value;
            document.getElementById('select-scale').value = para_scale;
        } else if (para === "interval") {
            para_interval = value;          
            document.getElementById('select-interval').value = para_interval;
        } else if (para === "threshold") {
            para_threshold = value;
            document.getElementById('select-threshold').value = para_threshold;
        } else if (para === "ping") {
            // Make the control parameters
            SendMqttMessage("pong", "control parameters");      // Send pong
        } else {
            console.error("Rx message format error!")
        }        
    }

    function SendMqttMessage(type, label) {        
        var canvas = document.getElementById('canvas_image');
        canvas.getContext('2d').drawImage(video, 0, 0, WIDTH * para_scale, HEIGHT * para_scale);       // 원래 기본값은 640, 480            
        
        var data = {
            addr: CAM_NAME,
            time: new Date().toLocaleString(),
            type: (type == "query") ? userId : type,
            label: label,
            image: canvas.toDataURL("image/jpeg", 0.5).replace("data:image/jpeg;base64,", "")   // data:image/jpeg;base64, 문구 제거를 위해
        };
        
        var jsonData = JSON.stringify(data);
        var mqttMsg = new Paho.MQTT.Message(jsonData);
        mqttMsg.destinationName = (type == "query") ? TOPIC_QUERY : TOPIC_PUB;
        client.send(mqttMsg);       // image MQTT 메시지 전송                     
        console.log("Tx Mqtt Msg:" + jsonData.substring(0, 100));
    }
}

