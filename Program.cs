using HawkAI.Areas.Identity;
using HawkAI.Data;
using HawkAI.Data.SuperHeroService;
using HawkAI.Data.GameService;
using HawkAI.Data.CameraService;
using HawkAI.Data.EventService;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.UI;
using Microsoft.EntityFrameworkCore;
using MQTTnet;
using HawkAI.Hubs;
using Microsoft.AspNetCore.Http.Connections;


var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
/************ DB ���� ************/
/* To use mariadb */
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<AuthDbContext>(options =>
    options.UseMySql(connectionString, new MySqlServerVersion(new Version(10, 3, 37))));    // hawkai ������
builder.Services.AddDbContext<DataDbContext>(options =>
    options.UseMySql(connectionString, new MySqlServerVersion(new Version(10, 3, 37))));    // hawkai ������
//builder.Services.AddDbContext<ApplicationDbContext>(options =>
//    options.UseSqlServer(connectionString));

builder.Services.AddDatabaseDeveloperPageExceptionFilter();
builder.Services.AddDefaultIdentity<IdentityUser>(options => options.SignIn.RequireConfirmedAccount = true)
    .AddRoles<IdentityRole>()       // for Role-based Authorization
    .AddEntityFrameworkStores<AuthDbContext>();
builder.Services.AddRazorPages();
builder.Services.AddServerSideBlazor();
builder.Services.AddScoped<AuthenticationStateProvider, RevalidatingIdentityAuthenticationStateProvider<IdentityUser>>();
builder.Services.AddSingleton<WeatherForecastService>();

builder.Services.AddProgressiveWebApp();    // for PWA

builder.Services.AddScoped<ICameraService, CameraService>();
builder.Services.AddScoped<IEventService, EventService>(); 
builder.Services.AddScoped<IGameService, GameService>();
builder.Services.AddScoped<ISuperHeroService, SuperHeroService>();


/************ ����, �������� ���� ************/
builder.Services.AddAuthentication()
    .AddGoogle(googleOptions =>
    {
        googleOptions.ClientId = builder.Configuration["Authentication:Google:ClientId"];
        googleOptions.ClientSecret = builder.Configuration["Authentication:Google:ClientSecret"];
    });


/************ SignalR ���� ************/
// SignalR - JSON serialization options �߰� (���� ��Ŷ ������� ������ �ִ°ǰ�?) 
builder.Services.AddSignalR()
    .AddJsonProtocol(options => {
        options.PayloadSerializerOptions.PropertyNamingPolicy = null;
    });

// Server���� �޽��� ������ ���� �ɼ� ���� 
builder.Services.AddSignalR(hubOptions =>
{
    hubOptions.EnableDetailedErrors = true;
    //hubOptions.KeepAliveInterval = TimeSpan.FromMinutes(5);         // ���ü��� �ֳ�? 
    //hubOptions.ClientTimeoutInterval = TimeSpan.FromMinutes(10);    // ClientTimeoutInterval�� KeepAliveInterval�� �ι谡 �Ǿ��
    hubOptions.StreamBufferCapacity = 1000000;
    hubOptions.MaximumReceiveMessageSize = 100000000;       // ���� Ǯ���� null�� ����?
});



/************ MQTT ���� ************/
builder.Services.AddSingleton<MqttFactory>();
builder.Services.AddScoped<IMqttHub, MqttHub>();
builder.Services.AddHostedService<HostedMqttHub>();


/************ ��Ʈ ��ȣ ���� ���� ************/
// Add for external access
builder.WebHost.UseUrls("http://*:8080;https://*:8081");
//builder.WebHost.UseUrls("http://*:8080");  // Only for http



var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseMigrationsEndPoint();
}
else
{
    app.UseExceptionHandler("/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

//app.UseHttpsRedirection();

app.UseStaticFiles();

app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();


/************ SignalR ���� ************/
app.MapBlazorHub();
//app.MapHub<ChatHub>("/chathub");
app.MapHub<ChatHub>("/chathub", options =>      // Server���� �޽��� ������ ���� �ɼ� �߰� 
{
    options.Transports =
        HttpTransportType.WebSockets |
        HttpTransportType.LongPolling;
    options.ApplicationMaxBufferSize = 100000000;   // ���� Ǯ���� 0���� ����?
    options.TransportMaxBufferSize = 100000000;
});


app.MapControllers();

app.MapFallbackToPage("/_Host");

app.Run();
