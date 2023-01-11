using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using HawkAI.Data;
using HawkAI.Data.CameraService;
using HawkAI.Data.EventService;
using HawkAI.Hubs;
using MQTTnet;
using MQTTnet.Client;
using Newtonsoft.Json.Linq;
using System.Net;
using System.Text.Json;

namespace HawkAI.Hubs
{
    public class MqttHub : IMqttHub, IDisposable
    {
        private readonly IEventService _event;
        private readonly ILogger<MqttHub> _logger;
        private readonly MqttFactory _mqttFactory;

        public MqttHub(ILogger<MqttHub> logger, IEventService eventService, MqttFactory mqttFactory            )
        {
            _logger = logger;
            _event = eventService;
            _mqttFactory = mqttFactory;
        }

        private IMqttClient? mqttClient = null;

        public async Task DoWork(CancellationToken stoppingToken)
        {
            using (mqttClient = _mqttFactory.CreateMqttClient())
            {
                // Build
                var mqttClientOptions = new MqttClientOptionsBuilder()
                    .WithTcpServer("hawkai.hknu.ac.kr", 8085)
                    .WithClientId("HkPlatform")
                    .Build();

                // Handler
                mqttClient.ApplicationMessageReceivedAsync += async e =>
                {
                    var jsonUtf8Bytes = e.ApplicationMessage.Payload;
                    if (jsonUtf8Bytes is not null)
                    {
                        //_logger.LogInformation($"Received json message: {jsonUtf8Bytes}");

                        //string jsonMessage = e.ApplicationMessage.ConvertPayloadToString(); // by hhchoi
                        //_logger.LogInformation($"Received json message: {jsonMessage}");
                        //Console.WriteLine("[HHCHOI] RxMqttMsg: " + e.ApplicationMessage.ConvertPayloadToString().Substring(0, 110));
                        string topic = e.ApplicationMessage.Topic;
                        //_logger.LogInformation($"[HHCHOI] Topic: {topic}");
                        Console.WriteLine($"[HHCHOI] Rx MqttMsg with Topic: {topic}");

                        if (topic == "hawkai/fromCam")
                        {
                            MqttMsg? mqttmsg = JsonSerializer.Deserialize<MqttMsg>(jsonUtf8Bytes);
                            if (mqttmsg is not null)
                            {                                
                                Console.WriteLine($"[HHCHOI] Rx Event: {mqttmsg.type}, {mqttmsg.time}, {mqttmsg.addr}, {mqttmsg.label}, {mqttmsg.image.Substring(0, Math.Min(60, mqttmsg.image.Length))}");

                                if (mqttmsg.type == "event")
                                {
                                    bool isFCM = false;     // TBD!
                                    // FCM 전송 
                                    if (isFCM)
                                    {
                                        string projectPath = AppDomain.CurrentDomain.BaseDirectory.Split(new string[] { @"bin\" }, StringSplitOptions.None)[0];
                                        FirebaseApp app = null;
                                        Console.WriteLine("[HHCHOI] projectPath: " + projectPath);
                                        try
                                        {
                                            app = FirebaseApp.Create(new AppOptions()
                                            {
                                                Credential = GoogleCredential.FromFile(projectPath + "Auth.json")       // projectPath 안쓰고 절대경로로 하면 publish 했을 경우 동작 안함!
                                            }, "myApp"); ;
                                        }
                                        catch (Exception)
                                        {
                                            app = FirebaseApp.GetInstance("myApp");
                                        }

                                        var fcm = FirebaseAdmin.Messaging.FirebaseMessaging.GetMessaging(app);
                                        // This resgistration token comes from the client FCM SDKs.
                                        //var registrationToken = "ekJh5yUcSSi3u59xViOyJx:APA91bGPs6XNCYK6nOIh9_obajTE1XLEzWwg7uAdRyaADkEslBvTFxdFNSnVvbhJcIfWAkLun4lfXggXBo2VGlHLrbs6qke2tOQ3th4CKokmQDlZLW_Tpr_-Fzcuzut-B7Bj13uXDPxT";
                                        var registrationToken = "ddEJzTQCRV2tr9ycx2rfKe:APA91bFSGMEMLWgDilIb5LqUE9pmWIQMj2C1co8QjlCzA4sDK_72kSaSxBVIROsAqFnd8ANLr82RHt4Fq-4maN3lbVyc3TG_MjLBY35cbb-Pzzd3f4lHX7ooHnG393CCGabarhtIB0tp";


                                        // Defining a message payload
                                        Message message = new Message()     // 여러개의 Token에게 메시지를 보내려면 MulticcastMessage()로 변경해야 
                                        {
                                            Data = new Dictionary<string, string>()
                                        {
                                            { "hhData", "1234" },
                                        },
                                            Token = registrationToken,
                                            Notification = new Notification()
                                            {
                                                Title = mqttmsg.label,
                                                Body = mqttmsg.addr + " at " + mqttmsg.time
                                            }
                                        };

                                        // Send a message to the device corresponding to the provided registration token.
                                        //string response = await fcm.SendAsync(message).Result;
                                        //Console.WriteLine("Successfully sent message: " + response);
                                        string result = await fcm.SendAsync(message);
                                        Console.WriteLine("[HHCHOI] Successfully sent message via FCM: " + result);
                                    }
                                    

                                    // DB Create (DB에 저장) - FCM보다 뒤에 있어야!! - DB 저장하고 되돌아 오지 않음!!
                                    Event savedEvent = new Event
                                    {
                                        Addr = mqttmsg.addr,
                                        Time = mqttmsg.time,
                                        Label = mqttmsg.label,
                                        Image = mqttmsg.image
                                    };
                                    await _event.CreateEvent(savedEvent);
                                    Console.WriteLine("[HHCHOI] SAVE MqttMsg to DB");
                                }
                            }
                        }                        
                    }
                    await Task.CompletedTask;
                };

                // Connect
                await mqttClient.ConnectAsync(mqttClientOptions, CancellationToken.None);

                // Subscribe
                var mqttSubscribeOptions = _mqttFactory.CreateSubscribeOptionsBuilder()
                    .WithTopicFilter(f => { f.WithTopic("hawkai/fromCam"); })
                    .Build();
                await mqttClient.SubscribeAsync(mqttSubscribeOptions, CancellationToken.None);

                // Subscribe (두번째 토픽 가입)
                //var mqttSubscribeOptions2 = _mqttFactory.CreateSubscribeOptionsBuilder()
                //    .WithTopicFilter(f => { f.WithTopic("hawkai/fromCam"); })
                //    .Build();
                //await mqttClient.SubscribeAsync(mqttSubscribeOptions2, CancellationToken.None);

                SpinWait.SpinUntil(() => !((mqttClient is not null) && (mqttClient.IsConnected)));

                var mqttClientDisconnectOptions = _mqttFactory.CreateClientDisconnectOptionsBuilder().Build();
                await mqttClient.DisconnectAsync(mqttClientDisconnectOptions, CancellationToken.None);

                await Task.CompletedTask;
            }
        }


        // Dispose
        #region
        ~MqttHub()
        {
            this.Dispose(false);
        }

        private bool disposed = false;
        public void Dispose()
        {
            this.Dispose(true);
            GC.SuppressFinalize(this);
        }

        protected virtual void Dispose(bool disposing)
        {
            if (this.disposed)
            {
                return;
            }

            if (disposing)
            {

                mqttClient?.Dispose();

            }

            this.disposed = true;
        }
        #endregion
    }
}
