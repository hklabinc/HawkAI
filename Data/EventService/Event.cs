namespace HawkAI.Data.EventService
{
    public class Event
    {
        public int Id { get; set; }
        public string Time { get; set; } = string.Empty;        
        public string Addr { get; set; } = string.Empty;        
        public string Image { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;

    }
}