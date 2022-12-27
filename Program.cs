using HawkAI.Areas.Identity;
using HawkAI.Data;
using HawkAI.Data.SuperHeroService;
using HawkAI.Data.CameraService;
using HawkAI.Data.GameService;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.UI;
using Microsoft.EntityFrameworkCore;
using MQTTnet;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<AuthDbContext>(options =>
    options.UseMySql(connectionString, new MySqlServerVersion(new Version(10, 3, 37))));    // capston 서버것
builder.Services.AddDbContext<DataDbContext>(options =>
    options.UseMySql(connectionString, new MySqlServerVersion(new Version(10, 3, 37))));    // capston 서버것
//builder.Services.AddDbContext<ApplicationDbContext>(options =>
//    options.UseSqlServer(connectionString));

builder.Services.AddDatabaseDeveloperPageExceptionFilter();
builder.Services.AddDefaultIdentity<IdentityUser>(options => options.SignIn.RequireConfirmedAccount = true)
    .AddEntityFrameworkStores<AuthDbContext>();
builder.Services.AddRazorPages();
builder.Services.AddServerSideBlazor();
builder.Services.AddScoped<AuthenticationStateProvider, RevalidatingIdentityAuthenticationStateProvider<IdentityUser>>();
builder.Services.AddSingleton<WeatherForecastService>();

builder.Services.AddProgressiveWebApp();    // for PWA

builder.Services.AddScoped<ICameraService, CameraService>(); 
builder.Services.AddScoped<IGameService, GameService>();
builder.Services.AddScoped<ISuperHeroService, SuperHeroService>();


builder.Services.AddAuthentication()
    .AddGoogle(googleOptions =>
    {
        googleOptions.ClientId = builder.Configuration["Authentication:Google:ClientId"];
        googleOptions.ClientSecret = builder.Configuration["Authentication:Google:ClientSecret"];
    });
/************ MQTT 관련 ************/
builder.Services.AddSingleton<MqttFactory>();

var app = builder.Build();


// Add for external access
//builder.WebHost.UseUrls("http://*:8080;https://*:8081");
//builder.WebHost.UseUrls("http://*:8080");  // Only for http


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

app.UseHttpsRedirection();

app.UseStaticFiles();

app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapBlazorHub();
app.MapFallbackToPage("/_Host");

app.Run();
