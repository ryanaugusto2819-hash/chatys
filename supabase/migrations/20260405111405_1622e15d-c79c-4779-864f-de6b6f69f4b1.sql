
-- Move conexão API EDMUNDO para workspace Uruguay
UPDATE connection_configs 
SET workspace_id = '10000000-0000-0000-0000-000000000002' 
WHERE id = '7e3f2965-a103-4305-a244-9f9a464914c1';

-- Move todas as conversas dessa conexão para workspace Uruguay
UPDATE conversations 
SET workspace_id = '10000000-0000-0000-0000-000000000002' 
WHERE connection_config_id = '7e3f2965-a103-4305-a244-9f9a464914c1';
