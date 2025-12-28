
namespace HawkAI.Data.UpdateService
{
    public record ReleaseInfo(
        string PackageName,
        int VersionCode,
        string VersionName,
        string ApkFileName,
        string Sha256,
        long Size,
        DateTimeOffset UploadedAtUtc
    );
}
