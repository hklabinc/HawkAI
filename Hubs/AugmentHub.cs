// Hubs/AugmentHub.cs
using Microsoft.AspNetCore.SignalR;

namespace HawkAI.Hubs
{
    public class AugmentHub : Hub
    {
        public override async Task OnConnectedAsync()
        {
            var httpContext = Context.GetHttpContext();
            var sessionId = httpContext?.Request.Query["sessionId"];
            if (!string.IsNullOrEmpty(sessionId))
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, sessionId);
            }

            await base.OnConnectedAsync();
        }
    }
}
