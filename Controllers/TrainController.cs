using HawkAI.Hubs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace HawkAI.Controllers
{
    [ApiController]
    [Route("api/train")]
    public class TrainController : ControllerBase
    {
        private readonly IHubContext<TrainHub> _hubContext;

        public TrainController(IHubContext<TrainHub> hubContext)
        {
            _hubContext = hubContext;
        }

        [HttpPost("status")]
        public async Task<IActionResult> PostStatus([FromBody] SignalRMessage message)
        {
            await _hubContext.Clients.All.SendAsync("ReceiveTrainStatus", message.session_id, message.message);
            return Ok(new { status = "ok" });
        }

        public class SignalRMessage
        {
            public string session_id { get; set; }
            public string message { get; set; }
        }
    }

}
