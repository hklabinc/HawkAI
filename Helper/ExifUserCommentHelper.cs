using SixLabors.ImageSharp;
using System.Text;

namespace HawkAI.Helper
{
    /// <summary>
    /// JPEG EXIF(UserComment)에 포함된 JSON 문자열을 추출하기 위한 헬퍼
    /// - Android 구현체에서 UserComment가 byte[] (Undefined)로 저장되는 경우가 있어 prefix(ASCII/UNICODE 등) ...
    /// </summary>
    public static class ExifUserCommentHelper
    {
        public static string? TryReadUserCommentJson(string filePath, out string? error)
        {
            error = null;
            try
            {
                using var image = Image.Load(filePath);
                return TryReadUserCommentJson(image, out error);
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return null;
            }
        }

        public static string? TryReadUserCommentJson(Stream jpegStream, out string? error)
        {
            error = null;
            try
            {
                using var image = Image.Load(jpegStream);
                return TryReadUserCommentJson(image, out error);
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return null;
            }
        }

        private static string? TryReadUserCommentJson(Image image, out string? error)
        {
            error = null;

            var exif = image.Metadata.ExifProfile;
            if (exif == null)
            {
                error = "EXIF profile not found.";
                return null;
            }

            // Razor/GlobalUsings 조합에서 ExifProfile.GetValue(...)가 다른 확장 메서드로 잘못 바인딩되는 사례가 있어
            // Values 컬렉션을 reflection으로 순회하여 UserComment를 찾는다.
            object? exifValueObj = null;
            try
            {
                var valuesProp = exif.GetType().GetProperty("Values");
                var valuesEnum = valuesProp?.GetValue(exif) as System.Collections.IEnumerable;
                if (valuesEnum != null)
                {
                    foreach (var item in valuesEnum)
                    {
                        if (item == null) continue;
                        var tagProp = item.GetType().GetProperty("Tag");
                        var tag = tagProp?.GetValue(item);
                        if (tag == null) continue;

                        if (string.Equals(tag.ToString(), "UserComment", StringComparison.OrdinalIgnoreCase))
                        {
                            exifValueObj = item;
                            break;
                        }
                    }
                }
            }
            catch
            {
                // ignore
            }

            if (exifValueObj == null)
            {
                error = "EXIF(UserComment) tag not found.";
                return null;
            }

            object? vValueObj = null;
            try
            {
                vValueObj = exifValueObj.GetType().GetProperty("Value")?.GetValue(exifValueObj);
            }
            catch
            {
                // ignore
            }

            string raw;
            if (vValueObj is string s)
            {
                raw = s;
            }
            else if (vValueObj is byte[] bytes)
            {
                raw = DecodeExifUserComment(bytes);
            }
            else
            {
                raw = vValueObj?.ToString() ?? "";
            }

            raw = raw.Trim('\0', ' ', '\t', '\r', '\n');

            var idx = raw.IndexOf('{');
            if (idx > 0) raw = raw.Substring(idx);

            if (string.IsNullOrWhiteSpace(raw))
            {
                error = "EXIF(UserComment) value is empty.";
                return null;
            }

            return raw;
        }

        // Exif UserComment (Undefined bytes) decode
        // - Exif spec uses 8-byte prefix: "ASCII\0\0\0", "UNICODE\0", "JIS\0..."
        private static string DecodeExifUserComment(byte[] bytes)
        {
            if (bytes.Length == 0) return "";

            if (bytes.Length >= 8)
            {
                var prefix = Encoding.ASCII.GetString(bytes, 0, 8).TrimEnd('\0').ToUpperInvariant();
                var payload = bytes.Skip(8).ToArray();

                if (prefix.StartsWith("ASCII"))
                {
                    return Encoding.UTF8.GetString(payload).TrimEnd('\0');
                }

                if (prefix.StartsWith("UNICODE"))
                {
                    var s1 = Encoding.Unicode.GetString(payload).TrimEnd('\0');
                    if (s1.Contains('{')) return s1;

                    var s2 = Encoding.BigEndianUnicode.GetString(payload).TrimEnd('\0');
                    return s2;
                }

                var s = Encoding.UTF8.GetString(payload).TrimEnd('\0');
                if (s.Contains('{')) return s;
            }

            return Encoding.UTF8.GetString(bytes).TrimEnd('\0');
        }
    }
}
