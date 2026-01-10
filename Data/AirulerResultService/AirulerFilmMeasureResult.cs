using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace HawkAI.Data.AirulerResultService
{
    /// <summary>
    /// AIRuler JPG 업로드(Exif UserComment JSON)에서 추출한 측정 결과 저장용 테이블 엔티티
    /// </summary>
    public class AirulerFilmMeasureResult
    {
        public long Id { get; set; }

        [MaxLength(260)]
        public string FileName { get; set; } = string.Empty;

        /// <summary>
        /// JSON의 timestampMs(Unix ms) 기준 UTC 저장
        /// </summary>
        public DateTime TimestampUtc { get; set; }

        [MaxLength(128)]
        public string DeviceId { get; set; } = string.Empty;

        [MaxLength(128)]
        public string ModelName { get; set; } = string.Empty;

        /// <summary>
        /// 예: "8160*4592"
        /// </summary>
        [MaxLength(32)]
        public string ImageSize { get; set; } = string.Empty;

        [MaxLength(32)]
        public string MeasureMethod { get; set; } = string.Empty;

        public int DetectedFilms { get; set; }

        /// <summary>
        /// JSON의 results 배열(필름별 measures)을 그대로 저장
        /// </summary>
        [Column(TypeName = "longtext")]
        public string ResultsJson { get; set; } = string.Empty;
    }
}
