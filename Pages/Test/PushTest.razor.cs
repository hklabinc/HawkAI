using Microsoft.AspNetCore.Components;
using System.Net.Http.Json;

public class PushTestBase : ComponentBase
{
    [Inject] protected HttpClient Http { get; set; } = default!;
    [Inject] protected IConfiguration Configuration { get; set; } = default!;

    protected string pushTitle = "✅ Test Email";
    protected string pushBody = "테스트 이메일 입니다!";
    protected string customTokens = ""; // 사용자가 입력한 토큰들
    protected string statusMessage = "";
    protected bool isSending = false;

    protected async Task SendPush()
    {
        isSending = true;
        statusMessage = "";

        // 기본 토큰
        var defaultToken = Configuration["Pushbullet:AccessToken"];
        var allTokens = new List<string>();

        // 사용자 입력 토큰이 있으면 파싱해서 사용
        if (!string.IsNullOrWhiteSpace(customTokens))
        {
            allTokens = customTokens
                .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(t => t.Trim())
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Distinct()
                .ToList();
        }
        else if (!string.IsNullOrWhiteSpace(defaultToken))
        {
            allTokens.Add(defaultToken);
        }

        if (allTokens.Count == 0)
        {
            statusMessage = "❌ No valid token(s) found.";
            isSending = false;
            return;
        }

        var data = new
        {
            type = "note",
            title = pushTitle,
            body = pushBody
        };

        int successCount = 0;
        foreach (var token in allTokens)
        {
            try
            {
                var request = new HttpRequestMessage(HttpMethod.Post, "https://api.pushbullet.com/v2/pushes")
                {
                    Content = JsonContent.Create(data)
                };
                request.Headers.Add("Access-Token", token);

                var response = await Http.SendAsync(request);
                if (response.IsSuccessStatusCode)
                    successCount++;
                else
                    statusMessage += $"❌ Token {token[..5]}... failed: {response.StatusCode}\n";
            }
            catch (Exception ex)
            {
                statusMessage += $"❌ Token {token[..5]}... exception: {ex.Message}\n";
            }
        }

        statusMessage = $"✅ Push sent to {successCount}/{allTokens.Count} token(s).\n" + statusMessage;
        isSending = false;
    }
}
