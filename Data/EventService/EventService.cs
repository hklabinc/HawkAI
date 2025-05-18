using HawkAI.Data.CameraService;
using HawkAI.Pages;
using Microsoft.AspNetCore.Components;
using Microsoft.EntityFrameworkCore;

namespace HawkAI.Data.EventService
{
    public class EventService : IEventService
    {
        private readonly DataDbContext _context;
        private readonly NavigationManager _navigationManager;

        public EventService(DataDbContext context, NavigationManager navigationManager)
        {
            _context = context;
            _navigationManager = navigationManager;
        }

        public List<Event> Events { get; set; } = new List<Event>();

        public async Task CreateEvent(Event objEvent)
        {
            _context.Events.Add(objEvent);
            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("events");
        }

        public async Task DeleteEvent(int id)
        {
            var dbEvent = await _context.Events.FindAsync(id);
            if (dbEvent == null)
                throw new Exception("No event here. :/");

            _context.Events.Remove(dbEvent);
            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("events");
        }

        public async Task<int> DeleteAllEvents()
        {
            _context.RemoveRange(_context.Events);
            return await _context.SaveChangesAsync();
        }

        public async Task<Event> GetSingleEvent(int id)
        {
            var objEvent = await _context.Events.FindAsync(id);
            if (objEvent == null)
                throw new Exception("No event here. :/");
            return objEvent;
        }

        public async Task LoadEvents()
        {
            Events = await _context.Events.ToListAsync();
        }

        public async Task UpdateEvent(Event objEvent, int id)
        {
            var dbEvent = await _context.Events.FindAsync(id);
            if (dbEvent == null)
                throw new Exception("No event here. :/");

            dbEvent.Time = objEvent.Time;
            dbEvent.Addr = objEvent.Addr;            
            dbEvent.Image = objEvent.Image;
            dbEvent.Label = objEvent.Label;
            dbEvent.User = objEvent.User;

            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("events");
        }

        public async Task<IEnumerable<Event>> GetAllEvents()
        {
            //Events = await _context.Events.ToListAsync();
            Events = await _context.Events.OrderByDescending(s => s.Id).ToListAsync();    // 역순으로 출력
            return Events;            
        }

        public async Task<IEnumerable<Event>> GetMyEvents(string userName)
        {            
            Events = await _context.Events.Where(x => x.User==userName || x.User=="ffffffff").OrderByDescending(s => s.Id).ToListAsync();    // 역순으로 출력
            return Events;
        }

    }
}

