# 1. DB Migration & Update

Remove-Migration -Context DataDbContext 

Add-Migration "XXXX" -Context DataDbContext 

update-database -Context DataDbContext



Remove-Migration -Context AuthDbContext 

Add-Migration "XXXX" -Context AuthDbContext 

update-database -Context AuthDbContext