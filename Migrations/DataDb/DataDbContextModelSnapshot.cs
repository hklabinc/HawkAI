﻿// <auto-generated />
using System;
using HawkAI.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

#nullable disable

namespace HawkAI.Migrations.DataDb
{
    [DbContext(typeof(DataDbContext))]
    partial class DataDbContextModelSnapshot : ModelSnapshot
    {
        protected override void BuildModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder
                .HasAnnotation("ProductVersion", "6.0.1")
                .HasAnnotation("Relational:MaxIdentifierLength", 64);

            modelBuilder.Entity("HawkAI.Data.CameraService.Camera", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    b.Property<string>("Location")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("Parameter")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("User")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.HasKey("Id");

                    b.ToTable("Cameras");

                    b.HasData(
                        new
                        {
                            Id = 1,
                            Location = "Lab",
                            Name = "HK_PiCam01",
                            Parameter = "Interval:0.5",
                            User = "hhchoi"
                        },
                        new
                        {
                            Id = 2,
                            Location = "Home",
                            Name = "HK_PiCam02",
                            Parameter = "Interval:0.5",
                            User = "hhchoi"
                        },
                        new
                        {
                            Id = 3,
                            Location = "Office",
                            Name = "HK_PiCam03",
                            Parameter = "Interval:0.5",
                            User = "hhchoi"
                        },
                        new
                        {
                            Id = 4,
                            Location = "Office",
                            Name = "HK_ComCam01",
                            Parameter = "Interval:0.5",
                            User = "hhchoi"
                        },
                        new
                        {
                            Id = 5,
                            Location = "My hand",
                            Name = "HK_PhoneCam01",
                            Parameter = "Interval:0.5",
                            User = "hhchoi"
                        },
                        new
                        {
                            Id = 6,
                            Location = "My hand",
                            Name = "HK_PhoneCam02",
                            Parameter = "Interval:0.5",
                            User = "hhchoi"
                        });
                });

            modelBuilder.Entity("HawkAI.Data.EventService.Event", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    b.Property<string>("Addr")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("Image")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("Label")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("Time")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("User")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.HasKey("Id");

                    b.ToTable("Events");
                });

            modelBuilder.Entity("HawkAI.Data.GameService.Game", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    b.Property<string>("Developer")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<DateTime?>("Release")
                        .HasColumnType("datetime(6)");

                    b.HasKey("Id");

                    b.ToTable("Games");

                    b.HasData(
                        new
                        {
                            Id = 1,
                            Developer = "Valve",
                            Name = "Half Life 2",
                            Release = new DateTime(2004, 11, 16, 0, 0, 0, 0, DateTimeKind.Unspecified)
                        },
                        new
                        {
                            Id = 2,
                            Developer = "Lucas Arts",
                            Name = "Day of the Tentacle",
                            Release = new DateTime(1993, 5, 25, 0, 0, 0, 0, DateTimeKind.Unspecified)
                        });
                });

            modelBuilder.Entity("HawkAI.Data.ProjectService.ImageEntry", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    b.Property<string>("FileName")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<int>("Height")
                        .HasColumnType("int");

                    b.Property<string>("LabelData")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("LabelStatus")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<int>("ProjectId")
                        .HasColumnType("int");

                    b.Property<string>("RelativePath")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<DateTime>("UploadedAt")
                        .HasColumnType("datetime(6)");

                    b.Property<string>("UploadedByUserId")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<int>("Width")
                        .HasColumnType("int");

                    b.HasKey("Id");

                    b.HasIndex("ProjectId");

                    b.ToTable("Images");
                });

            modelBuilder.Entity("HawkAI.Data.ProjectService.Project", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("datetime(6)");

                    b.Property<string>("CreatorUserId")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<int>("ImageCount")
                        .HasColumnType("int");

                    b.Property<string>("Labels")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.HasKey("Id");

                    b.ToTable("Projects");
                });

            modelBuilder.Entity("HawkAI.Data.SuperHeroService.Comic", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.HasKey("Id");

                    b.ToTable("Comics");

                    b.HasData(
                        new
                        {
                            Id = 1,
                            Name = "Marvel"
                        },
                        new
                        {
                            Id = 2,
                            Name = "DC"
                        });
                });

            modelBuilder.Entity("HawkAI.Data.SuperHeroService.SuperHero", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    b.Property<int>("ComicId")
                        .HasColumnType("int");

                    b.Property<string>("FirstName")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("HeroName")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.Property<string>("LastName")
                        .IsRequired()
                        .HasColumnType("longtext");

                    b.HasKey("Id");

                    b.HasIndex("ComicId");

                    b.ToTable("SuperHeroes");

                    b.HasData(
                        new
                        {
                            Id = 1,
                            ComicId = 1,
                            FirstName = "Peter",
                            HeroName = "Spiderman",
                            LastName = "Parker"
                        },
                        new
                        {
                            Id = 2,
                            ComicId = 2,
                            FirstName = "Bruce",
                            HeroName = "Batman",
                            LastName = "Wayne"
                        });
                });

            modelBuilder.Entity("HawkAI.Data.ProjectService.ImageEntry", b =>
                {
                    b.HasOne("HawkAI.Data.ProjectService.Project", "Project")
                        .WithMany("Images")
                        .HasForeignKey("ProjectId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();

                    b.Navigation("Project");
                });

            modelBuilder.Entity("HawkAI.Data.SuperHeroService.SuperHero", b =>
                {
                    b.HasOne("HawkAI.Data.SuperHeroService.Comic", "Comic")
                        .WithMany()
                        .HasForeignKey("ComicId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();

                    b.Navigation("Comic");
                });

            modelBuilder.Entity("HawkAI.Data.ProjectService.Project", b =>
                {
                    b.Navigation("Images");
                });
#pragma warning restore 612, 618
        }
    }
}
