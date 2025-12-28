using Microsoft.AspNetCore.Http;

namespace HawkAI.Data.UpdateService
{
    public interface IAppUpdateService
    {
        string RootPath { get; }

        Task<ReleaseInfo?> GetLatestAsync(string packageName, CancellationToken ct = default);
        Task<ReleaseInfo?> GetMetadataAsync(string packageName, int versionCode, CancellationToken ct = default);

        Task<IReadOnlyList<ReleaseInfo>> GetAllAsync(CancellationToken ct = default);

        Task<ReleaseInfo> SaveAsync(
            string packageName,
            int versionCode,
            string versionName,
            IFormFile apk,
            CancellationToken ct = default);

        FileStream OpenApkRead(string packageName, int versionCode);
    }
}
