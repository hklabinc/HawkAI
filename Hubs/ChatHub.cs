using Microsoft.AspNetCore.SignalR;

namespace HawkAI.Hubs
{
    public class ChatHub : Hub
    {
        public async Task SendMessage(string user, string message)
        {
            // message --> DB에저장 !!
            Console.WriteLine($"[Server] Received Message Size: {message.Length} bytes");   // 받은 메시지 사이즈
            await Clients.All.SendAsync("ReceiveMessage", user, message);
        }
    }
}