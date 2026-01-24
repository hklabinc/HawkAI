using HawkAI.Hubs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace HawkAI.Controllers
{
    [ApiController]
    [Route("api/trainkp")]
    public class TrainKPController : ControllerBase
    {
        private readonly IHubContext<TrainHubKP> _hubContext;

        public TrainKPController(IHubContext<TrainHubKP> hubContext)
        {
            _hubContext = hubContext;
        }

        /// <summary>
        /// ✅ 기존 TrainController(/api/train/status)와 동일한 JSON 스키마를 사용합니다.
        /// Python training server가 보통 다음 형태로 POST 하므로 그대로 호환됩니다.
        /// { "session_id": "...", "message": "..." }
        /// </summary>
        public class SignalRMessage
        {
            public string? session_id { get; set; }
            public string? message { get; set; }
        }

        /// <summary>
        /// KP 전용 학습 상태 업데이트 (Training 서버가 호출)
        /// POST /api/trainkp/status
        /// body: { session_id: "...", message: "..." }
        /// </summary>
        [HttpPost("status")]
        public async Task<IActionResult> PostStatus([FromBody] SignalRMessage update)
        {
            var sessionId = update?.session_id ?? string.Empty;
            var msg = update?.message ?? string.Empty;

            await _hubContext.Clients.All.SendAsync("ReceiveTrainStatusKP", sessionId, msg);
            return Ok(new { ok = true });
        }
    }
}
