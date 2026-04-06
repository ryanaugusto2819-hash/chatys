-- EDMUNDO (7e3f2965) moved back to Brasil (0001) - update its conversations
UPDATE conversations SET workspace_id = '10000000-0000-0000-0000-000000000001' WHERE connection_config_id = '7e3f2965-a103-4305-a244-9f9a464914c1';

-- JONATHAN (f25cee90) moved to Uruguay (0002) - update its conversations
UPDATE conversations SET workspace_id = '10000000-0000-0000-0000-000000000002' WHERE connection_config_id = 'f25cee90-d831-4ca6-97c4-5fa2e8a9c5a3';