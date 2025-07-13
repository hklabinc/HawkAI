using Microsoft.AspNetCore.SignalR;

namespace HawkAI.Hubs
{
    public class TrainHub : Hub
    {
        public async Task SendTrainStatus(string sessionId, string message)
        {
            Console.WriteLine($"[TrainHub] {sessionId} → {message}");
            await Clients.All.SendAsync("ReceiveTrainStatus", sessionId, message);
        }
    }
}

