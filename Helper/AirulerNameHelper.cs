using System.Text.RegularExpressions;

namespace HawkAI.Helper
{
    public static class AirulerNameHelper
    {
        // AirulerController와 동일 규칙
        private static readonly Regex UnsafeChars = new(@"[^0-9a-zA-Z_\-\.]+", RegexOptions.Compiled);

        public static string SanitizeModelName(string? raw)
        {
            raw = (raw ?? "").Trim();
            if (raw.Length == 0) return "";

            // 공백은 underscore로
            raw = raw.Replace(' ', '_');

            // 위험 문자 제거
            raw = UnsafeChars.Replace(raw, "");

            // 길이 제한
            if (raw.Length > 80) raw = raw.Substring(0, 80);

            return raw;
        }
    }
}
