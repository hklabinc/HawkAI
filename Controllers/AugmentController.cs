// Controllers/AugmentController.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using HawkAI.Hubs;

namespace HawkAI.Controllers
{
    [ApiController]
    [Route("api/augment")]
    public class AugmentController : ControllerBase
    {
        private readonly IHubContext<AugmentHub> _hubContext;

        public AugmentController(IHubContext<AugmentHub> hubContext)
        {
            _hubContext = hubContext;
        }

        [HttpPost("status")]
        public async Task<IActionResult> ReceiveFromFlask([FromBody] AugmentSignalDto dto)
        {
            //Console.WriteLine($"[SignalR] ▶️ Received from Flask: {dto.SessionId} → {dto.Message}");
            await _hubContext.Clients.Group(dto.SessionId).SendAsync("ReceiveAugmentStatus", dto.Message);
            return Ok();
        }

        public class AugmentSignalDto
        {
            public string SessionId { get; set; } = string.Empty;
            public string Message { get; set; } = string.Empty;
        }
    }
}


