namespace HawkAI.Hubs
{
    public class HostedMqttHub : BackgroundService, IDisposable
    {
        private readonly ILogger<HostedMqttHub> _logger;
        public IServiceProvider Services { get; }

        public HostedMqttHub(
            ILogger<HostedMqttHub> logger,
            IServiceProvider services
            )
        {
            _logger = logger;
            Services = services;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Client subscribe service is running");
            await DoWork(stoppingToken);
        }

        IMqttHub? clientSubscribe = null;

        private async Task DoWork(CancellationToken stoppingToken)
        {
            _logger.LogInformation(
                "Client subscribe service is working.");

            // addScoped
            using (var scope = Services.CreateScope())
            {
                clientSubscribe =
                    scope.ServiceProvider
                        .GetRequiredService<IMqttHub>();

                await clientSubscribe.DoWork(stoppingToken);
            }
        }

        // Dispose
        #region
        private bool disposed;

        ~HostedMqttHub()
        {
            Dispose(false);
        }

        public new void Dispose()  // 부모의 Dispose()를 숨김
        {
            Dispose(true);
            GC.SuppressFinalize(this);
        }

        protected void Dispose(bool disposing)
        {
            if (disposed)
                return;

            if (disposing)
            {
                clientSubscribe?.Dispose();
            }

            disposed = true;
        }
        #endregion
    }
}
