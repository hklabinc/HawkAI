// Hubs/AugmentHub.cs
using Microsoft.AspNetCore.SignalR;

namespace HawkAI.Hubs
{
    public class AugmentHub : Hub
    {
        //public override async Task OnConnectedAsync()
        //{
        //    var httpContext = Context.GetHttpContext();
        //    var sessionId = httpContext?.Request.Query["sessionId"].ToString();
        //    //Console.WriteLine($"[Hub] ▶️ Client connected. SessionId: {sessionId}");

        //    if (!string.IsNullOrWhiteSpace(sessionId))
        //    {
        //        await Groups.AddToGroupAsync(Context.ConnectionId, sessionId);
        //        //Console.WriteLine($"[Hub] ✅ Added to group: {sessionId}");
        //    }

        //    await base.OnConnectedAsync();
        //}
    }
}
