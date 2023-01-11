namespace HawkAI.Hubs
{
    public interface IMqttHub : IDisposable
    {
        Task DoWork(CancellationToken stoppingToken);
    }
}
