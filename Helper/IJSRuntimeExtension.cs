using Microsoft.JSInterop;

namespace HawkAI.Helper
{
    public static class IJSRuntimeExtension
    {
        public static async ValueTask ToastrSuccess(this IJSRuntime jsRuntime, string message)
        { 
            await jsRuntime.InvokeVoidAsync("ShowToastr", "success", message);
        }

        public static async ValueTask ToastrFailure(this IJSRuntime jsRuntime, string message)
        {
            await jsRuntime.InvokeVoidAsync("ShowToastr", "error", message);
        }

        public static async ValueTask ToastrWarning(this IJSRuntime jsRuntime)
        {
            await jsRuntime.InvokeVoidAsync("ShowToastr", "warning");
        }
    }
}
