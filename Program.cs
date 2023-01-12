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
/************ DB 관련 ************/
/* To use mariadb */
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<AuthDbContext>(options =>
    options.UseMySql(connectionString, new MySqlServerVersion(new Version(10, 3, 37))));    // hawkai 서버것
builder.Services.AddDbContext<DataDbContext>(options =>
    options.UseMySql(connectionString, new MySqlServerVersion(new Version(10, 3, 37))));    // hawkai 서버것
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


/************ 인증, 구글인증 관련 ************/
builder.Services.AddAuthentication()
    .AddGoogle(googleOptions =>
    {
        googleOptions.ClientId = builder.Configuration["Authentication:Google:ClientId"];
        googleOptions.ClientSecret = builder.Configuration["Authentication:Google:ClientSecret"];
    });


/************ SignalR 관련 ************/
// SignalR - JSON serialization options 추가 (전송 패킷 사이즈와 관련이 있는건가?) 
builder.Services.AddSignalR()
    .AddJsonProtocol(options => {
        options.PayloadSerializerOptions.PropertyNamingPolicy = null;
    });

// Server에서 메시지 사이즈 관련 옵션 변경 
builder.Services.AddSignalR(hubOptions =>
{
    hubOptions.EnableDetailedErrors = true;
    //hubOptions.KeepAliveInterval = TimeSpan.FromMinutes(5);         // 관련성이 있나? 
    //hubOptions.ClientTimeoutInterval = TimeSpan.FromMinutes(10);    // ClientTimeoutInterval은 KeepAliveInterval의 두배가 되어야
    hubOptions.StreamBufferCapacity = 1000000;
    hubOptions.MaximumReceiveMessageSize = 100000000;       // 제한 풀려면 null로 셋팅?
});



/************ MQTT 관련 ************/
builder.Services.AddSingleton<MqttFactory>();
builder.Services.AddScoped<IMqttHub, MqttHub>();
builder.Services.AddHostedService<HostedMqttHub>();


/************ 포트 번호 변경 관련 ************/
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


/************ SignalR 관련 ************/
app.MapBlazorHub();
//app.MapHub<ChatHub>("/chathub");
app.MapHub<ChatHub>("/chathub", options =>      // Server에서 메시지 사이즈 관련 옵션 추가 
{
    options.Transports =
        HttpTransportType.WebSockets |
        HttpTransportType.LongPolling;
    options.ApplicationMaxBufferSize = 100000000;   // 제한 풀려면 0으로 셋팅?
    options.TransportMaxBufferSize = 100000000;
});


app.MapControllers();

app.MapFallbackToPage("/_Host");

app.Run();
