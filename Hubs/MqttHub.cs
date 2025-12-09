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

        public MqttHub(ILogger<MqttHub> logger, IEventService eventService, MqttFactory mqttFactory)
        {
            _logger = logger;
            _event = eventService;
            _mqttFactory = mqttFactory;
        }

        private IMqttClient? mqttClient = null;

        public async Task DoWork(CancellationToken stoppingToken)
        {
            // stoppingToken 이 취소될 때까지 계속 재접속을 시도하는 메인 루프
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using (mqttClient = _mqttFactory.CreateMqttClient())
                    {
                        var mqttClientOptions = new MqttClientOptionsBuilder()
                            .WithTcpServer("hawkai.hknu.ac.kr", 8085)   // 기존 설정 유지
                            .WithClientId("HkPlatform")
                            .Build();

                        // 메시지 핸들러 등록
                        mqttClient.ApplicationMessageReceivedAsync += async e =>
                        {
                            try
                            {
                                var jsonUtf8Bytes = e.ApplicationMessage.Payload;
                                if (jsonUtf8Bytes is not null)
                                {
                                    string topic = e.ApplicationMessage.Topic;
                                    string[] parts = topic.Split('/');
                                    if (parts.Length >= 3)
                                    {
                                        string user = parts[2];
                                        Console.WriteLine($"[HHCHOI] Rx MqttMsg with Topic: {topic} and User: {user}");

                                        MqttMsg? mqttmsg = JsonSerializer.Deserialize<MqttMsg>(jsonUtf8Bytes);
                                        if (mqttmsg is not null)
                                        {
                                            Console.WriteLine($"[HHCHOI] Rx Event: {mqttmsg.type}, {mqttmsg.time}, {mqttmsg.addr}, {mqttmsg.label}, {mqttmsg.image.Substring(0, Math.Min(60, mqttmsg.image.Length))}");

                                            // fire 이벤트 처리: 별도 메서드로 분리
                                            if (mqttmsg.type == "event" && mqttmsg.label == "fire")
                                            {
                                                await HandleFireEvent(mqttmsg, user);
                                            }
                                        }
                                    }
                                    else
                                    {
                                        _logger.LogWarning("Unexpected topic format: {Topic}", topic);
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                // 개별 메시지 처리 중 에러 → 로그만 찍고 MQTT 워커는 계속 동작
                                _logger.LogError(ex, "Error while processing MQTT message");
                            }
                        };

                        _logger.LogInformation("Connecting to MQTT broker hawkai.hknu.ac.kr:8085 ...");

                        // MQTT 브로커 연결
                        await mqttClient.ConnectAsync(mqttClientOptions, stoppingToken);
                        _logger.LogInformation("MQTT connected.");

                        // 구독 설정
                        var mqttSubscribeOptions = _mqttFactory.CreateSubscribeOptionsBuilder()
                            .WithTopicFilter(f => { f.WithTopic("hawkai/from/#"); })
                            .Build();

                        await mqttClient.SubscribeAsync(mqttSubscribeOptions, stoppingToken);
                        _logger.LogInformation("MQTT subscribed to 'hawkai/from/#'.");

                        // 연결 유지 루프: 연결이 살아있는 동안 1초마다 체크
                        while (mqttClient.IsConnected && !stoppingToken.IsCancellationRequested)
                        {
                            await Task.Delay(1000, stoppingToken);
                        }

                        _logger.LogWarning("MQTT disconnected (IsConnected=false). Will retry in 5 seconds...");
                    }
                }
                catch (OperationCanceledException)
                {
                    // 서비스 종료 시그널(앱 종료) → 조용히 빠져나가기
                    _logger.LogInformation("MQTT worker cancellation requested. Exiting DoWork loop.");
                    break;
                }
                catch (Exception ex)
                {
                    // 연결 실패, 네트워크 에러 등 → 여기서 절대 밖으로 던지지 말고 로그만 찍기
                    _logger.LogError(ex, "MQTT worker crashed. Will retry in 5 seconds.");
                }

                // 재연결 딜레이 (취소 요청 시 바로 빠져나가도록 처리)
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    _logger.LogInformation("MQTT worker delay cancelled. Exiting.");
                    break;
                }
            }
        }

        private async Task HandleFireEvent(MqttMsg mqttmsg, string user)
        {
            try
            {
                bool isFCM = true;     // TBD!

                if (isFCM)
                {
                    string projectPath = AppDomain.CurrentDomain.BaseDirectory.Split(new string[] { @"bin\" }, StringSplitOptions.None)[0];
                    FirebaseApp app = null;
                    Console.WriteLine("[HHCHOI] projectPath: " + projectPath);
                    try
                    {
                        app = FirebaseApp.Create(new AppOptions()
                        {
                            Credential = GoogleCredential.FromFile(projectPath + "Auth.json")
                        }, "myApp");
                    }
                    catch (Exception)
                    {
                        app = FirebaseApp.GetInstance("myApp");
                    }

                    var fcm = FirebaseAdmin.Messaging.FirebaseMessaging.GetMessaging(app);

                    var registrationToken = "ddEJzTQCRV2tr9ycx2rfKe:APA91bFSGMEMLWgDilIb5LqUE9pmWIQMj2C1co8QjlCzA4sDK_72kSaSxBVIROsAqFnd8ANLr82RHt4Fq-4maN3lbVyc3TG_MjLBY35cbb-Pzzd3f4lHX7ooHnG393CCGabarhtIB0tp";

                    Message message = new Message()
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

                    string result = await fcm.SendAsync(message);
                    Console.WriteLine("[HHCHOI] Successfully sent message via FCM: " + result);
                }

                // DB 저장
                Event savedEvent = new Event
                {
                    Addr = mqttmsg.addr,
                    Time = mqttmsg.time,
                    Label = mqttmsg.label,
                    Image = mqttmsg.image,
                    User = user
                };
                await _event.CreateEvent(savedEvent);
                Console.WriteLine("[HHCHOI] SAVE MqttMsg to DB");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error while handling fire event (FCM/DB).");
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
