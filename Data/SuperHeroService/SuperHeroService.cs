using Microsoft.AspNetCore.Components;
using Microsoft.EntityFrameworkCore;
using System.Net.Http.Json;

namespace HawkAI.Data.SuperHeroService
{
    public class SuperHeroService : ISuperHeroService
    {
        private readonly DataDbContext _context;
        private readonly NavigationManager _navigationManager;
        public SuperHeroService(DataDbContext context, NavigationManager navigationManager)
        {
            _context = context;
            _navigationManager = navigationManager;
            _context.Database.EnsureCreated();
        }
        public List<SuperHero> Heroes { get; set; } = new List<SuperHero>();
        public List<Comic> Comics { get; set; } = new List<Comic>();

        public async Task CreateHero(SuperHero hero)
        {
            _context.SuperHeroes.Add(hero);
            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("superheroes");
        }
        public async Task DeleteHero(int id)
        {
            var dbSuperHero = await _context.SuperHeroes.FindAsync(id);
            if (dbSuperHero == null)
                throw new Exception("No super hero here. :/");

            _context.SuperHeroes.Remove(dbSuperHero);
            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("superheroes");
        }

        public async Task GetComics()
        {
            Comics = await _context.Comics.ToListAsync();
        }

        public async Task GetSuperHeroes()
        {
            Heroes = await _context.SuperHeroes.ToListAsync();
        }

        public async Task<SuperHero> GetSingleHero(int id)
        {
            var hero = await _context.SuperHeroes.FindAsync(id);
            if (hero == null)
                throw new Exception("No super hero here. :/");
            return hero;
        }

        public async Task UpdateHero(SuperHero hero, int id)
        {
            var dbSuperHero = await _context.SuperHeroes.FindAsync(id);
            if (dbSuperHero == null)
                throw new Exception("No super hero here. :/");

            dbSuperHero.FirstName = hero.FirstName;
            dbSuperHero.LastName = hero.LastName;
            dbSuperHero.HeroName = hero.HeroName;
            dbSuperHero.Comic = hero.Comic;
            dbSuperHero.ComicId = hero.ComicId;

            await _context.SaveChangesAsync();
            _navigationManager.NavigateTo("superheroes");
        }
    }
}