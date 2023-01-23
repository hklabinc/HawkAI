namespace HawkAI.Data.EventService
{
    public interface IEventService
    {
        List<Event> Events { get; set; }
        Task LoadEvents();
        Task<Event> GetSingleEvent(int id);
        Task CreateEvent(Event objEvent);
        Task UpdateEvent(Event objEvent, int id);
        Task DeleteEvent(int id);
        Task<int> DeleteAllEvents();
        Task<IEnumerable<Event>> GetAllEvents();
        Task<IEnumerable<Event>> GetMyEvents(string userName);
    }
}