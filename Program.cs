using HawkAI.Areas.Identity;
using HawkAI.Data;
using HawkAI.Data.CameraService;
using HawkAI.Data.EventService;
using HawkAI.Data.GameService;
using HawkAI.Data.ProjectService;
using HawkAI.Data.ProjectServiceKP;
using HawkAI.Data.SuperHeroService;
using HawkAI.Data.UpdateService;
using HawkAI.Hubs;
using HawkAI.Services;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using MQTTnet;
using System.Net.Http;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
/************ DB 관련 ************/
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

builder.Services.AddDbContext<AuthDbContext>(options =>
    options.UseMySql(connectionString, new MySqlServerVersion(new Version(10, 3, 37))));

builder.Services.AddDbContext<DataDbContext>(options =>
    options.UseMySql(connectionString, new MySqlServerVersion(new Version(10, 3, 37))));

builder.Services.AddDatabaseDeveloperPageExceptionFilter();

builder.Services.AddDefaultIdentity<IdentityUser>(options =>
{
    options.SignIn.RequireConfirmedAccount = true;
})
.AddRoles<IdentityRole>()
.AddEntityFrameworkStores<AuthDbContext>();

builder.Services.AddRazorPages();

builder.Services.AddServerSideBlazor()
    .AddCircuitOptions(options =>
    {
        options.DetailedErrors = true;
    })
    .AddHubOptions(options =>
    {
        options.MaximumReceiveMessageSize = 1024 * 1024 * 300; // 300MB
    });

builder.Services.AddScoped<AuthenticationStateProvider,
    RevalidatingIdentityAuthenticationStateProvider<IdentityUser>>();

builder.Services.AddSingleton<WeatherForecastService>();

builder.Services.AddProgressiveWebApp();    // for PWA

builder.Services.AddScoped<ICameraService, CameraService>();
builder.Services.AddScoped<IEventService, EventService>();
builder.Services.AddScoped<IGameService, GameService>();
builder.Services.AddScoped<ISuperHeroService, SuperHeroService>();
builder.Services.AddScoped<IProjectService, ProjectService>();
builder.Services.AddScoped<IProjectServiceKP, ProjectServiceKP>();

builder.Services.Configure<ReleaseStorageOptions>(
    builder.Configuration.GetSection("ReleaseStorage"));

builder.Services.AddSingleton<IAppUpdateService, FileSystemAppUpdateService>();


/************ 인증, 구글인증 관련 ************/
builder.Services.AddAuthentication()
    .AddGoogle(googleOptions =>
    {
        googleOptions.ClientId = builder.Configuration["Authentication:Google:ClientId"]!;
        googleOptions.ClientSecret = builder.Configuration["Authentication:Google:ClientSecret"]!;
    });


/************ SignalR 관련 ************/
builder.Services.AddSignalR()
    .AddJsonProtocol(options =>
    {
        options.PayloadSerializerOptions.PropertyNamingPolicy = null;
    });

builder.Services.AddSignalR(hubOptions =>
{
    hubOptions.EnableDetailedErrors = true;
    hubOptions.StreamBufferCapacity = 1000000;
    hubOptions.MaximumReceiveMessageSize = 100000000;
});


/************ 업로드 파일 크기 제한 해제 관련 설정 ************/
builder.Services.Configure<FormOptions>(options =>
{
    options.ValueCountLimit = 10000;
    options.MultipartBodyLengthLimit = 1024L * 1024L * 1024L; // 1GB
});


/************ MQTT 관련 ************/
builder.Services.AddSingleton<MqttFactory>();
builder.Services.AddScoped<IMqttHub, MqttHub>();
builder.Services.AddHostedService<HostedMqttHub>();


/* Web API Controller 사용을 위해 */
builder.Services.AddControllers();

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 500 * 1024 * 1024; // 500MB
});


/************ 포트 번호 변경 관련 ************/
builder.WebHost.UseUrls("http://0.0.0.0:8083");


// Flask 서버 API를 사용하기 위해 HttpClient 등록
builder.Services.AddScoped(sp => new HttpClient
{
    BaseAddress = new Uri(builder.Configuration["BaseAddress"] ?? "http://localhost:5001/")
});


/************ 이메일 발송 관련 ************/
var email = builder.Configuration["Email:Sender"]!;
var pw = builder.Configuration["Email:AppPassword"]!;
builder.Services.AddSingleton(new EmailService(email, pw));


/************ 인증 쿠키 설정 ************/
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "HawkAI.Legacy.Auth";   // 기존 앱/다른 포트와 쿠키 충돌 방지
    options.Cookie.HttpOnly = true;
    options.ExpireTimeSpan = TimeSpan.FromMinutes(60);

    // 현재 8083에서 HTTP 직접 접속 기준
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    options.Cookie.SameSite = SameSiteMode.Lax;

    options.LoginPath = "/Identity/Account/Login";
    options.AccessDeniedPath = "/Identity/Account/AccessDenied";
    options.SlidingExpiration = true;
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseMigrationsEndPoint();
}
else
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

// app.UseHttpsRedirection();

var provider = new FileExtensionContentTypeProvider();
provider.Mappings[".obj"] = "application/octet-stream";
provider.Mappings[".pt"] = "application/octet-stream";
provider.Mappings[".onnx"] = "application/octet-stream";
provider.Mappings[".tflite"] = "application/octet-stream";
provider.Mappings[".pb"] = "application/octet-stream";
provider.Mappings[".yaml"] = "application/x-yaml";
provider.Mappings[".yml"] = "application/x-yaml";
provider.Mappings[".json"] = "application/json";
provider.Mappings[".apk"] = "application/vnd.android.package-archive";

app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = provider
});
app.UseStaticFiles();

app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();


/************ SignalR 관련 ************/
app.MapRazorPages();   // Identity Razor Pages 포함

app.MapBlazorHub();

app.MapHub<ChatHub>("/chathub", options =>
{
    options.Transports =
        HttpTransportType.WebSockets |
        HttpTransportType.LongPolling;
    options.ApplicationMaxBufferSize = 100000000;
    options.TransportMaxBufferSize = 100000000;
});

app.MapHub<TrainHub>("/trainHub");
app.MapHub<TrainHubKP>("/trainHubKP");

app.MapControllers();

app.MapFallbackToPage("/_Host");

app.Run();