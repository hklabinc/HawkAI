using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HawkAI.Migrations.DataDb
{
    public partial class _8th : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ImageCount",
                table: "Projects",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ImageCount",
                table: "Projects");
        }
    }
}
